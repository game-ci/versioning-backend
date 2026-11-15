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

  if (!(await scheduler.buildLatestEditorImages())) {
    await Discord.sendDebug('[Build queue] Editor images are building.');
    return;
  }

  // Reconcile DockerHub images with expected versions
  try {
    const gitHub = (scheduler as any).gitHub;
    const versions = await EditorVersionInfo.getAll();
    const reconciler = new DockerImageReconciler(gitHub, repoVersionInfo);
    await reconciler.reconcileEditorImages(versions);
  } catch (error) {
    await Discord.sendDebug(`[Build queue] DockerHub reconciliation error: ${error}`);
  }

  await Discord.sendDebug('[Build queue] Idle 🎈');
};
