import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { Scheduler } from './scheduler';
import { Discord } from '../../service/discord';
import { CiJobs } from '../../model/ciJobs';
import { Cleaner } from './cleaner';
import { DockerImageReconciler } from './dockerImageReconciler';
import { EditorVersionInfo } from '../../model/editorVersionInfo';

export const scheduleBuildsFromTheQueue = async (
  githubPrivateKey: string,
  githubClientSecret: string,
) => {
  const repoVersionInfo = await RepoVersionInfo.getLatest();
  const numSuperseded = await CiJobs.markJobsBeforeRepoVersionAsSuperseded(repoVersionInfo.version);

  if (numSuperseded >= 1) {
    await Discord.sendDebug(
      `[Build queue] Superseded ${CiJobs.pluralise(
        numSuperseded,
      )} from older repo versions before scheduling.`,
    );
  }

  const recoveredBuilds = await Cleaner.recoverMaxedOutFailedBuilds(repoVersionInfo.version);
  if (recoveredBuilds.length >= 1) {
    await Discord.sendDebug(
      `[Build queue] Recovered ${recoveredBuilds.length} maxed-out failed build(s) for repo version ${repoVersionInfo.version}.`,
    );
  }

  const scheduler = await new Scheduler(repoVersionInfo).init(githubPrivateKey, githubClientSecret);

  const testVersion = '0.1.0';
  if (repoVersionInfo.version === testVersion) {
    await Discord.sendDebug('[Build queue] No longer building test versions.');
    return;
  }

  if (!(await scheduler.ensureThatBaseImageHasBeenBuilt())) {
    await Discord.sendDebug('[Build queue] Waiting for base image to be ready.');
    return;
  }

  if (!(await scheduler.ensureThatHubImageHasBeenBuilt())) {
    await Discord.sendDebug('[Build queue] Waiting for hub image to be ready.');
    return;
  }

  if (!(await scheduler.ensureThereAreNoFailedJobs())) {
    await Discord.sendDebug('[Build queue] Retrying failed jobs before scheduling new jobs.');
    return;
  }

  // The build order needs every known editor version to tell which patch is the latest of its minor
  // version. If this read fails, the run stops here: the error reaches the maintainers' Discord alerts
  // and the next run, minutes later, tries again. Ordering from queued jobs alone would let a minor
  // version's older patch jump ahead once its latest was dispatched.
  const versions = await EditorVersionInfo.getAll();
  const knownEditorVersions = versions.map(({ version }) => version);
  const editorQueueIsIdle = await scheduler.buildLatestEditorImages(knownEditorVersions);

  // Run reconciliation even while editor builds are queued or running. Otherwise
  // a missed publication can stay invisible until the entire image queue drains.
  // Exclude jobs already handled by the normal queue to avoid duplicate builds.
  try {
    const gitHub = (scheduler as any).gitHub;
    const [activeJobs, queuedJobs] = await Promise.all([
      CiJobs.getActiveJobs(),
      CiJobs.getPrioritisedQueue(knownEditorVersions),
    ]);
    const coveredJobIds = new Set([...activeJobs, ...queuedJobs].map(({ id }) => id));
    const reconciler = new DockerImageReconciler(gitHub, repoVersionInfo);
    await reconciler.reconcileEditorImages(versions, coveredJobIds);
  } catch (error) {
    await Discord.sendDebug(`[Build queue] DockerHub reconciliation error: ${error}`);
  }

  if (!editorQueueIsIdle) {
    await Discord.sendDebug('[Build queue] Editor images are building.');
    return;
  }

  await Discord.sendDebug('[Build queue] Idle 🎈');
};
