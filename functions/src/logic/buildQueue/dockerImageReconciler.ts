import { Octokit } from '@octokit/rest';
import { logger } from 'firebase-functions/v2';
import { Discord } from '../../service/discord';
import { GitHubWorkflow } from '../../model/gitHubWorkflow';
import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { RepoVersionInfo } from '../../model/repoVersionInfo';

const DOCKERHUB_API = 'https://hub.docker.com/v2/repositories';
const TAG_PAGE_SIZE = 100;
const MAX_TAG_PAGES = 50;
const MAX_RETRIES_PER_CYCLE = 30;
const UBUNTU_PLATFORMS = [
  'base',
  'linux-il2cpp',
  'windows-mono',
  'mac-mono',
  'ios',
  'android',
  'webgl',
] as const;
const WINDOWS_PLATFORMS = [
  'base',
  'windows-il2cpp',
  'universal-windows-platform',
  'appletv',
  'android',
] as const;

interface DockerImage {
  repository: string;
  tag: string;
  baseOs: 'ubuntu' | 'windows';
  imageType: 'base' | 'hub' | 'editor';
  targetPlatform?: string;
  editorVersion?: string;
  changeset?: string;
}

interface MissingImage {
  image: DockerImage;
  dispatchedRetry: boolean;
  error?: string;
}

export class DockerImageReconciler {
  private gitHubClient: Octokit;
  private repoVersionFull: string;
  private repoVersionMinor: string;
  private repoVersionMajor: string;
  private missingImages: MissingImage[] = [];
  private retriesDispatched = 0;

  constructor(gitHubClient: Octokit, repoVersionInfo: RepoVersionInfo) {
    this.gitHubClient = gitHubClient;
    const { major, minor, patch } = repoVersionInfo;
    this.repoVersionFull = `${major}.${minor}.${patch}`;
    this.repoVersionMinor = `${major}.${minor}`;
    this.repoVersionMajor = String(major);
  }

  async reconcileEditorImages(versions: EditorVersionInfo[]): Promise<void> {
    if (versions.length === 0) {
      return;
    }

    const [baseTags, hubTags, editorTags] = await Promise.all([
      this.fetchExistingTags('unityci/base'),
      this.fetchExistingTags('unityci/hub'),
      this.fetchExistingTags('unityci/editor'),
    ]);

    const expectedImages = this.computeExpectedImages(versions);
    const tagSetByRepo: Record<string, Set<string>> = {
      'unityci/base': baseTags,
      'unityci/hub': hubTags,
      'unityci/editor': editorTags,
    };

    for (const image of expectedImages) {
      if (this.retriesDispatched >= MAX_RETRIES_PER_CYCLE) {
        break;
      }
      const existing = tagSetByRepo[image.repository];
      if (existing.has(image.tag)) {
        continue;
      }
      const dispatchedRetry = await this.dispatchRetry(image);
      if (dispatchedRetry) {
        this.retriesDispatched += 1;
      }
      this.missingImages.push({ image, dispatchedRetry });
    }

    await this.reportResults(expectedImages.length);
  }

  private async fetchExistingTags(repository: string): Promise<Set<string>> {
    const tags = new Set<string>();
    let nextUrl: string | null =
      `${DOCKERHUB_API}/${repository}/tags?page_size=${TAG_PAGE_SIZE}&name=${this.repoVersionFull}`;
    let pagesFetched = 0;

    while (nextUrl && pagesFetched < MAX_TAG_PAGES) {
      try {
        const response = await fetch(nextUrl, {
          headers: { 'User-Agent': 'game-ci-versioning-backend/1.0' },
        });
        if (!response.ok) {
          logger.warn(`DockerHub list tags failed for ${repository}: HTTP ${response.status}`);
          break;
        }
        const body = (await response.json()) as {
          results?: { name: string }[];
          next?: string | null;
        };
        for (const result of body.results ?? []) {
          tags.add(result.name);
        }
        nextUrl = body.next ?? null;
        pagesFetched += 1;
      } catch (error) {
        logger.warn(`DockerHub list tags error for ${repository}`, error);
        break;
      }
    }

    return tags;
  }

  private computeExpectedImages(versions: EditorVersionInfo[]): DockerImage[] {
    const expected: DockerImage[] = [
      {
        repository: 'unityci/base',
        tag: `ubuntu-${this.repoVersionFull}`,
        baseOs: 'ubuntu',
        imageType: 'base',
      },
      {
        repository: 'unityci/base',
        tag: `windows-${this.repoVersionFull}`,
        baseOs: 'windows',
        imageType: 'base',
      },
      {
        repository: 'unityci/hub',
        tag: `ubuntu-${this.repoVersionFull}`,
        baseOs: 'ubuntu',
        imageType: 'hub',
      },
      {
        repository: 'unityci/hub',
        tag: `windows-${this.repoVersionFull}`,
        baseOs: 'windows',
        imageType: 'hub',
      },
    ];

    for (const version of versions) {
      const { version: editorVersion, changeSet: changeset } = version;
      for (const platform of UBUNTU_PLATFORMS) {
        expected.push({
          repository: 'unityci/editor',
          tag: `ubuntu-${editorVersion}-${platform}-${this.repoVersionFull}`,
          baseOs: 'ubuntu',
          imageType: 'editor',
          targetPlatform: platform,
          editorVersion,
          changeset,
        });
      }
      for (const platform of WINDOWS_PLATFORMS) {
        expected.push({
          repository: 'unityci/editor',
          tag: `windows-${editorVersion}-${platform}-${this.repoVersionFull}`,
          baseOs: 'windows',
          imageType: 'editor',
          targetPlatform: platform,
          editorVersion,
          changeset,
        });
      }
    }

    return expected;
  }

  private async dispatchRetry(image: DockerImage): Promise<boolean> {
    try {
      const eventType = this.getEventType(image);
      const payload: Record<string, unknown> = {
        jobId: `reconciliation-${image.imageType}-${image.tag}`,
        repoVersionFull: this.repoVersionFull,
        repoVersionMinor: this.repoVersionMinor,
        repoVersionMajor: this.repoVersionMajor,
        baseOs: image.baseOs,
      };
      if (image.editorVersion) payload.editorVersion = image.editorVersion;
      if (image.changeset) payload.changeSet = image.changeset;
      if (image.targetPlatform) payload.targetPlatform = image.targetPlatform;

      const response = await this.gitHubClient.repos.createDispatchEvent({
        owner: 'unity-ci',
        repo: 'docker',
        event_type: eventType,
        client_payload: payload,
      });

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.error(`Error dispatching retry for ${image.tag}`, error);
      return false;
    }
  }

  private getEventType(image: DockerImage): string {
    if (image.imageType === 'base') {
      return image.baseOs === 'ubuntu'
        ? GitHubWorkflow.eventTypes.newUbuntuBaseImages
        : GitHubWorkflow.eventTypes.newWindowsBaseImages;
    }
    if (image.imageType === 'hub') {
      return image.baseOs === 'ubuntu'
        ? GitHubWorkflow.eventTypes.newUbuntuHubImages
        : GitHubWorkflow.eventTypes.newWindowsHubImages;
    }
    return image.baseOs === 'ubuntu'
      ? GitHubWorkflow.eventTypes.retryUbuntuEditorImage
      : GitHubWorkflow.eventTypes.retryWindowsEditorImage;
  }

  private async reportResults(expectedCount: number): Promise<void> {
    if (this.missingImages.length === 0) {
      await Discord.sendDebug(
        `[DockerImageReconciler] Verified ${expectedCount} expected images, all present`,
      );
      return;
    }

    const successful = this.missingImages.filter((m) => m.dispatchedRetry).length;
    const failed = this.missingImages.length - successful;

    await Discord.sendAlert(
      `DockerHub Reconciliation: ${this.missingImages.length} missing of ${expectedCount} expected; ` +
        `retried ${successful}, failed ${failed}` +
        (this.retriesDispatched >= MAX_RETRIES_PER_CYCLE
          ? ` (capped at ${MAX_RETRIES_PER_CYCLE} retries; remaining will retry next cycle)`
          : ''),
    );
  }
}
