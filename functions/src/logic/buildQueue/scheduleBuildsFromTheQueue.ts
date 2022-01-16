import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { Scheduler } from './scheduler';
import { Discord } from '../../config/discord';

/**
 * When a new Unity version gets ingested:
 *   - a CI Job for that version gets created.
 *
 * When a new repository version gets ingested
 *   - a CI Job for a new base image gets created
 *   - a CI Job for a new hub image gets created
 *   - a CI Job for every Unity version gets created
 *   - Any CI Jobs for older repository versions get status "superseded"
 *
 * This schedule is based on that knowledge and assumption
 */
export const scheduleBuildsFromTheQueue = async () => {
  const repoVersionInfo = await RepoVersionInfo.getLatest();
  const scheduler = await new Scheduler(repoVersionInfo).init();

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

  await Discord.sendDebug('[Build queue] Idle 🎈');
};
