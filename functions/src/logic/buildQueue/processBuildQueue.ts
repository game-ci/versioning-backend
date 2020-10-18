import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { firebase } from '../../config/firebase';
import { Scheduler } from './scheduler';

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
export const processBuildQueue = async () => {
  const repoVersionInfo = await RepoVersionInfo.getLatest();
  const scheduler = await new Scheduler(repoVersionInfo).init();

  if (!(await scheduler.ensureThatBaseImageHasBeenBuilt())) {
    firebase.logger.info('base image is not yet ready.');
    return;
  }

  if (!(await scheduler.ensureThatHubImageHasBeenBuilt())) {
    firebase.logger.info('hub image is not yet ready.');
    return;
  }

  if (!(await scheduler.ensureThereAreNoFailedJobs())) {
    firebase.logger.info('retrying failed jobs before continuing');
    return;
  }

  if (!(await scheduler.buildLatestEditorImages())) {
    firebase.logger.info('busy building those images!');
    return;
  }

  firebase.logger.info('The build queue is happy to take a rest 🎈');
};
