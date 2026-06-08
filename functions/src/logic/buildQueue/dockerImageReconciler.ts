import { Octokit } from '@octokit/rest';
import { logger } from 'firebase-functions/v2';
import { Discord } from '../../service/discord';
import { GitHubWorkflow } from '../../model/gitHubWorkflow';
import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { RepoVersionInfo } from '../../model/repoVersionInfo';

const DOCKERHUB_API = 'https://hub.docker.com/v2/repositories';
const MAX_IMAGES_PER_CYCLE = 20;
const RECENT_VERSIONS_TO_CHECK = 5;

interface DockerImage {
  repository: string;
  tag: string;
  baseOs: string;
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
  private imagesChecked = 0;
  private missingImages: MissingImage[] = [];

  constructor(gitHubClient: Octokit, repoVersionInfo: RepoVersionInfo) {
    this.gitHubClient = gitHubClient;
    const { major, minor, patch } = repoVersionInfo;
    this.repoVersionFull = `${major}.${minor}.${patch}`;
    this.repoVersionMinor = `${repoVersionInfo.major}.${repoVersionInfo.minor}`;
    this.repoVersionMajor = String(repoVersionInfo.major);
  }

  private async isDockerImageMissing(repository: string, tag: string): Promise<boolean> {
    try {
      const response = await fetch(`${DOCKERHUB_API}/${repository}/tags/${tag}`, {
        headers: { 'User-Agent': 'game-ci-versioning-backend/1.0' },
      });
      if (response.status === 404) return true;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return false;
    } catch (error) {
      logger.warn(`DockerHub API error checking ${repository}:${tag}`, error);
      return false;
    }
  }

  async reconcileEditorImages(versions: EditorVersionInfo[]): Promise<void> {
    if (versions.length === 0) return;
    const versionsToCheck = versions.slice(0, RECENT_VERSIONS_TO_CHECK);
    for (const version of versionsToCheck) {
      if (this.imagesChecked >= MAX_IMAGES_PER_CYCLE) break;
      await this.checkVersionImages(version);
    }
    await this.reportResults();
  }

  private async checkVersionImages(version: EditorVersionInfo): Promise<void> {
    const { version: editorVersion, changeSet: changeset } = version;
    for (const { repo, tag, os } of [
      { repo: 'base', tag: `ubuntu-${this.repoVersionFull}`, os: 'ubuntu' },
      { repo: 'base', tag: `windows-${this.repoVersionFull}`, os: 'windows' },
      { repo: 'hub', tag: `ubuntu-${this.repoVersionFull}`, os: 'ubuntu' },
      { repo: 'hub', tag: `windows-${this.repoVersionFull}`, os: 'windows' },
    ]) {
      const imageType = repo as 'base' | 'hub';
      const image: DockerImage = {
        repository: `unityci/${repo}`,
        tag,
        baseOs: os,
        imageType,
      };
      await this.checkImage(image);
    }
    for (const platform of ['base', 'linux-il2cpp', 'windows-mono', 'mac-mono', 'ios', 'android', 'webgl']) {
      if (this.imagesChecked >= MAX_IMAGES_PER_CYCLE) break;
      await this.checkImage({
        repository: 'unityci/editor',
        tag: `ubuntu-${editorVersion}-${platform}-${this.repoVersionFull}`,
        baseOs: 'ubuntu',
        imageType: 'editor',
        targetPlatform: platform,
        editorVersion,
        changeset,
      });
    }
    for (const platform of ['base', 'windows-il2cpp', 'universal-windows-platform', 'appletv', 'android']) {
      if (this.imagesChecked >= MAX_IMAGES_PER_CYCLE) break;
      await this.checkImage({
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

  private async checkImage(image: DockerImage): Promise<void> {
    this.imagesChecked += 1;
    try {
      const isMissing = await this.isDockerImageMissing(image.repository, image.tag);
      if (!isMissing) {
        logger.debug(`OK ${image.repository}:${image.tag}`);
        return;
      }
      logger.warn(`Missing: ${image.repository}:${image.tag}`);
      const dispatchedRetry = await this.dispatchRetry(image);
      this.missingImages.push({ image, dispatchedRetry });
    } catch (error) {
      this.missingImages.push({ image, dispatchedRetry: false, error: String(error) });
    }
  }

  private async dispatchRetry(image: DockerImage): Promise<boolean> {
    try {
      const eventType = this.getEventType(image);
      const payload: any = {
        jobId: `reconciliation-${Date.now()}-${image.imageType}-${image.tag}`,
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
      logger.error(`Error dispatching`, error);
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

  private async reportResults(): Promise<void> {
    if (this.missingImages.length === 0) {
      await Discord.sendDebug(`Checked ${this.imagesChecked} images - OK`);
      return;
    }
    const successful = this.missingImages.filter((m) => m.dispatchedRetry).length;
    await Discord.sendAlert(`DockerHub Reconciliation: Found ${this.missingImages.length} missing, retried ${successful}`);
  }
}