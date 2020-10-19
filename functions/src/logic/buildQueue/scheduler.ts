import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { GitHub } from '../../config/github';
import { Octokit } from '@octokit/rest';
import { CiJobs } from '../../model/ciJobs';
import { firebase } from '../../config/firebase';
import { settings } from '../../config/settings';
import { take } from 'lodash';
import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { Discord } from '../../config/discord';
import { Ingeminator } from './ingeminator';

export class Scheduler {
  private repoVersion: string;
  private repoVersionFull: string;
  private repoVersionMinor: string;
  private repoVersionMajor: string;
  private _gitHub: Octokit | undefined;
  private maxConcurrentJobs: number;
  private repoVersionInfo: RepoVersionInfo;

  private get gitHub(): Octokit {
    // @ts-ignore
    return this._gitHub;
  }

  constructor(repoVersionInfo: RepoVersionInfo) {
    this.repoVersionInfo = repoVersionInfo;
    this.maxConcurrentJobs = settings.maxConcurrentJobs;

    const {
      repoVersion,
      repoVersionFull,
      repoVersionMinor,
      repoVersionMajor,
    } = Scheduler.parseRepoVersions(repoVersionInfo);
    this.repoVersion = repoVersion;
    this.repoVersionFull = repoVersionFull;
    this.repoVersionMinor = repoVersionMinor;
    this.repoVersionMajor = repoVersionMajor;

    return this;
  }

  /**
   * Todo - Fix regrets as needed
   *
   * Note: The names of these may be very confusing at first.
   * Note: This should be part of a proper model class after moving away logic from the scheduler.
   * Note: All refactors have to be considering the action in unityci/docker.
   */
  static parseRepoVersions = (repoVersionInfo: RepoVersionInfo) => {
    const { major, minor, patch, version: repoVersion } = repoVersionInfo;
    // Full version tag, including patch number
    const repoVersionFull = `${major}.${minor}.${patch}`;
    // Reduced version tag, intended for allowing to pull latest minor version
    const repoVersionMinor = `${major}.${minor}`;
    // Reduced version tag, intended for people who want to have the latest version without breaking changes.
    const repoVersionMajor = `${major}`;

    if (repoVersionFull !== repoVersion) {
      throw new Error(`
        Expected version information to be reliable
        Received ${repoVersionFull} vs ${repoVersion}`);
    }

    return {
      repoVersion,
      repoVersionFull,
      repoVersionMinor,
      repoVersionMajor,
    };
  };

  async init(): Promise<this> {
    this._gitHub = await GitHub.init();

    return this;
  }

  async ensureThatBaseImageHasBeenBuilt(): Promise<boolean> {
    // Get base image information
    const jobId = CiJobs.parseJobId('base', this.repoVersion);
    const job = await CiJobs.get(jobId);
    if (job === null) {
      throw new Error('Expected base job to be present');
    }

    // Schedule it
    if (['created', 'failed'].includes(job.status)) {
      const { repoVersionFull, repoVersionMinor, repoVersionMajor } = this;
      const response = await this.gitHub.repos.createDispatchEvent({
        owner: 'unity-ci',
        repo: 'docker',
        event_type: 'new_base_image_requested',
        client_payload: {
          jobId,
          repoVersionFull,
          repoVersionMinor,
          repoVersionMajor,
        },
      });

      if (response.status <= 199 || response.status >= 300) {
        const failureMessage = `failed to schedule job ${jobId}, status: ${response.status}, response: ${response.data}`;
        firebase.logger.error(failureMessage);
        await Discord.sendAlert(failureMessage);
        return false;
      }

      await CiJobs.markJobAsScheduled(jobId);
      firebase.logger.debug('Scheduled new base image build', response);
      return false;
    }

    // Don't do anything before base image is completed
    return job.status === 'completed';
  }

  async ensureThatHubImageHasBeenBuilt(): Promise<boolean> {
    // Get hub image information
    const jobId = CiJobs.parseJobId('hub', this.repoVersion);
    const job = await CiJobs.get(jobId);
    if (job === null) {
      throw new Error('Expected hub job to be present');
    }

    // Schedule it
    if (['created', 'failed'].includes(job.status)) {
      const { repoVersionFull, repoVersionMinor, repoVersionMajor } = this;
      const response = await this.gitHub.repos.createDispatchEvent({
        owner: 'unity-ci',
        repo: 'docker',
        event_type: 'new_hub_image_requested',
        client_payload: {
          jobId,
          repoVersionFull,
          repoVersionMinor,
          repoVersionMajor,
        },
      });

      if (response.status <= 199 || response.status >= 300) {
        const failureMessage = `failed to schedule job ${jobId}, status: ${response.status}, response: ${response.data}`;
        firebase.logger.error(failureMessage);
        await Discord.sendAlert(failureMessage);
        return false;
      }

      await CiJobs.markJobAsScheduled(jobId);
      firebase.logger.debug('Scheduled new hub image build', response);
      return false;
    }

    // Don't do anything before hub image is completed
    return job.status === 'completed';
  }

  async ensureThereAreNoFailedJobs(): Promise<boolean> {
    const failingJobs = await CiJobs.getFailingJobsQueue();
    if (failingJobs.length <= 0) {
      /**
       * Note: this is an important check
       * CiBuilds will go back to status "in progress", whereas
       * CiJobs will stay "failed" until all builds complete.
       * This will prevent creating failures on 1000+ builds
       */
      return true;
    }

    const openSpots = await this.determineOpenSpots();
    if (openSpots <= 0) {
      firebase.logger.info('Not retrying any new jobs, as the queue is full');
      return false;
    }

    const ingeminator = new Ingeminator(openSpots, this.gitHub, this.repoVersionInfo);
    await ingeminator.rescheduleFailedJobs(failingJobs);

    return false;
  }

  async buildLatestEditorImages(): Promise<boolean> {
    const openSpots = await this.determineOpenSpots();
    if (openSpots <= 0) {
      firebase.logger.info('Not scheduling any new jobs, as the queue is full');
      return false;
    }

    // Repo version
    const { repoVersionFull, repoVersionMinor, repoVersionMajor } = this;

    // Get highest priority builds
    const queue = await CiJobs.getPrioritisedQueue();

    // If the queue has nothing to build, we're happy
    if (queue.length <= 0) return true;

    // Schedule each build, one by one
    const toBeScheduledJobs = take(queue, openSpots);
    firebase.logger.info('took this from the queue', toBeScheduledJobs);
    for (const toBeScheduledJob of toBeScheduledJobs) {
      const { id: jobId, data } = toBeScheduledJob;
      const { editorVersionInfo } = data;
      const { version: editorVersion, changeSet } = editorVersionInfo as EditorVersionInfo;

      const response = await this.gitHub.repos.createDispatchEvent({
        owner: 'unity-ci',
        repo: 'docker',
        event_type: 'new_editor_image_requested',
        client_payload: {
          jobId,
          editorVersion,
          changeSet,
          repoVersionFull,
          repoVersionMinor,
          repoVersionMajor,
        },
      });

      if (response.status <= 199 || response.status >= 300) {
        const failureMessage = `failed to schedule job ${jobId}, status: ${response.status}, response: ${response.data}`;
        firebase.logger.error(failureMessage);
        await Discord.sendAlert(failureMessage);
        return false;
      }

      await CiJobs.markJobAsScheduled(jobId);
      firebase.logger.debug('Scheduled new editor image build', response);
    }

    // The queue was not empty, so we're not happy yet
    return false;
  }

  private async determineOpenSpots(): Promise<number> {
    const currentlyRunningJobs = await CiJobs.getNumberOfScheduledJobs();
    const openSpots = this.maxConcurrentJobs - currentlyRunningJobs;
    return openSpots <= 0 ? 0 : openSpots;
  }
}
