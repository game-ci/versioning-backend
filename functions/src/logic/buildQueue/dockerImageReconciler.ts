import { Octokit } from '@octokit/rest';
import { logger } from 'firebase-functions/v2';
import { Discord } from '../../service/discord';
import { GitHubWorkflow } from '../../model/gitHubWorkflow';
import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { ReconciliationState, ReconciliationStateData } from '../../model/reconciliationState';

const DOCKERHUB_API = 'https://hub.docker.com/v2/repositories';

const VERSIONS_PER_CYCLE = 5;
const MAX_DISPATCHES_PER_CYCLE = 10;
const MAX_TAG_PAGES_PER_QUERY = 3;
const DISPATCH_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const BASE_HUB_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const COOLDOWN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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

interface CycleSummary {
  versionsScanned: number;
  imagesExpected: number;
  imagesMissing: number;
  dispatchesAttempted: number;
  dispatchesSucceeded: number;
  cooldownSkipped: number;
  cappedAtLimit: boolean;
}

interface ReconcilerOptions {
  now?: () => number;
  dockerHubToken?: string;
}

export class DockerImageReconciler {
  private gitHubClient: Octokit;
  private repoVersionFull: string;
  private repoVersionMinor: string;
  private repoVersionMajor: string;
  private now: () => number;
  private authHeader: Record<string, string>;

  constructor(
    gitHubClient: Octokit,
    repoVersionInfo: RepoVersionInfo,
    options: ReconcilerOptions = {},
  ) {
    this.gitHubClient = gitHubClient;
    const { major, minor, patch } = repoVersionInfo;
    this.repoVersionFull = `${major}.${minor}.${patch}`;
    this.repoVersionMinor = `${major}.${minor}`;
    this.repoVersionMajor = String(major);
    this.now = options.now ?? (() => Date.now());
    const token = options.dockerHubToken ?? process.env.DOCKERHUB_RECONCILE_TOKEN;
    this.authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  }

  async reconcileEditorImages(versions: EditorVersionInfo[]): Promise<void> {
    if (versions.length === 0) {
      return;
    }

    const state = await ReconciliationState.load();
    const summary: CycleSummary = {
      versionsScanned: 0,
      imagesExpected: 0,
      imagesMissing: 0,
      dispatchesAttempted: 0,
      dispatchesSucceeded: 0,
      cooldownSkipped: 0,
      cappedAtLimit: false,
    };

    if (this.shouldCheckBaseHub(state)) {
      await this.processBaseHub(state, summary);
      state.baseHubCheckedAt = this.now();
    }

    const versionsToScan = this.pickVersionsForCycle(versions, state);
    for (const version of versionsToScan) {
      if (summary.dispatchesAttempted >= MAX_DISPATCHES_PER_CYCLE) {
        summary.cappedAtLimit = true;
        break;
      }
      await this.processVersion(version, state, summary);
      summary.versionsScanned += 1;
      state.cursorVersion = version.version;
    }

    state.cycleCount += 1;
    this.pruneCooldownEntries(state);
    await ReconciliationState.save(state);
    await this.reportSummary(summary, versions.length);
  }

  private shouldCheckBaseHub(state: ReconciliationStateData): boolean {
    if (state.baseHubCheckedAt === null) return true;
    return this.now() - state.baseHubCheckedAt >= BASE_HUB_CHECK_INTERVAL_MS;
  }

  private async processBaseHub(
    state: ReconciliationStateData,
    summary: CycleSummary,
  ): Promise<void> {
    const checks: DockerImage[] = [
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

    const baseTags = await this.fetchTags('unityci/base', this.repoVersionFull);
    const hubTags = await this.fetchTags('unityci/hub', this.repoVersionFull);
    const tagSet: Record<string, Set<string> | null> = {
      'unityci/base': baseTags,
      'unityci/hub': hubTags,
    };

    for (const image of checks) {
      await this.evaluateExpected(image, tagSet[image.repository], state, summary);
    }
  }

  private async processVersion(
    version: EditorVersionInfo,
    state: ReconciliationStateData,
    summary: CycleSummary,
  ): Promise<void> {
    const ubuntuExisting = await this.fetchTags('unityci/editor', `ubuntu-${version.version}`);
    const windowsExisting = await this.fetchTags('unityci/editor', `windows-${version.version}`);

    for (const platform of UBUNTU_PLATFORMS) {
      const image: DockerImage = {
        repository: 'unityci/editor',
        tag: `ubuntu-${version.version}-${platform}-${this.repoVersionFull}`,
        baseOs: 'ubuntu',
        imageType: 'editor',
        targetPlatform: platform,
        editorVersion: version.version,
        changeset: version.changeSet,
      };
      await this.evaluateExpected(image, ubuntuExisting, state, summary);
      if (summary.dispatchesAttempted >= MAX_DISPATCHES_PER_CYCLE) return;
    }

    for (const platform of WINDOWS_PLATFORMS) {
      const image: DockerImage = {
        repository: 'unityci/editor',
        tag: `windows-${version.version}-${platform}-${this.repoVersionFull}`,
        baseOs: 'windows',
        imageType: 'editor',
        targetPlatform: platform,
        editorVersion: version.version,
        changeset: version.changeSet,
      };
      await this.evaluateExpected(image, windowsExisting, state, summary);
      if (summary.dispatchesAttempted >= MAX_DISPATCHES_PER_CYCLE) return;
    }
  }

  private async evaluateExpected(
    image: DockerImage,
    existing: Set<string> | null,
    state: ReconciliationStateData,
    summary: CycleSummary,
  ): Promise<void> {
    summary.imagesExpected += 1;

    if (existing === null) {
      logger.debug(`Skipping ${image.tag}: existing-tag fetch failed, assuming present`);
      return;
    }

    if (existing.has(image.tag)) {
      return;
    }

    summary.imagesMissing += 1;
    const cooldownKey = `${image.repository}:${image.tag}`;
    const lastDispatchedAt = state.recentDispatches[cooldownKey];
    if (lastDispatchedAt && this.now() - lastDispatchedAt < DISPATCH_COOLDOWN_MS) {
      summary.cooldownSkipped += 1;
      return;
    }

    if (summary.dispatchesAttempted >= MAX_DISPATCHES_PER_CYCLE) {
      summary.cappedAtLimit = true;
      return;
    }

    summary.dispatchesAttempted += 1;
    const dispatched = await this.dispatchRetry(image);
    if (dispatched) {
      summary.dispatchesSucceeded += 1;
      state.recentDispatches[cooldownKey] = this.now();
    }
  }

  private pickVersionsForCycle(
    versions: EditorVersionInfo[],
    state: ReconciliationStateData,
  ): EditorVersionInfo[] {
    if (versions.length === 0) return [];
    const startIndex = state.cursorVersion
      ? Math.max(0, versions.findIndex((v) => v.version === state.cursorVersion) + 1)
      : 0;
    const effectiveStart = startIndex >= versions.length ? 0 : startIndex;
    const slice = versions.slice(effectiveStart, effectiveStart + VERSIONS_PER_CYCLE);
    if (slice.length < VERSIONS_PER_CYCLE && effectiveStart > 0) {
      const remainder = VERSIONS_PER_CYCLE - slice.length;
      slice.push(...versions.slice(0, remainder));
    }
    return slice;
  }

  private async fetchTags(repository: string, nameFilter: string): Promise<Set<string> | null> {
    const tags = new Set<string>();
    let nextUrl: string | null =
      `${DOCKERHUB_API}/${repository}/tags?page_size=100&name=${encodeURIComponent(nameFilter)}`;
    let pagesFetched = 0;

    while (nextUrl && pagesFetched < MAX_TAG_PAGES_PER_QUERY) {
      try {
        const response = await fetch(nextUrl, {
          headers: {
            'User-Agent': 'game-ci-versioning-backend/1.0',
            ...this.authHeader,
          },
        });

        if (response.status === 429) {
          logger.warn(`DockerHub rate-limited for ${repository} (${nameFilter})`);
          return null;
        }
        if (!response.ok) {
          logger.warn(
            `DockerHub list tags failed for ${repository} (${nameFilter}): HTTP ${response.status}`,
          );
          return null;
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
        logger.warn(`DockerHub list tags error for ${repository} (${nameFilter})`, error);
        return null;
      }
    }

    return tags;
  }

  private pruneCooldownEntries(state: ReconciliationStateData): void {
    const cutoff = this.now() - COOLDOWN_RETENTION_MS;
    for (const [key, ts] of Object.entries(state.recentDispatches)) {
      if (ts < cutoff) {
        delete state.recentDispatches[key];
      }
    }
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

  private async reportSummary(summary: CycleSummary, totalVersions: number): Promise<void> {
    if (summary.imagesMissing === 0) {
      await Discord.sendDebug(
        `[DockerImageReconciler] Scanned ${summary.versionsScanned}/${totalVersions} versions, ` +
          `${summary.imagesExpected} images verified, all present`,
      );
      return;
    }

    await Discord.sendAlert(
      `DockerHub Reconciliation: ${summary.imagesMissing} missing across ` +
        `${summary.versionsScanned} versions; dispatched ${summary.dispatchesSucceeded}/${summary.dispatchesAttempted}, ` +
        `${summary.cooldownSkipped} in cooldown` +
        (summary.cappedAtLimit ? `, capped at ${MAX_DISPATCHES_PER_CYCLE} dispatches/cycle` : ''),
    );
  }
}
