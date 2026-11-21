import { logger } from 'firebase-functions/v2';
import { Cleaner } from './cleaner';
import { ActiveDockerRuns } from './activeDockerRuns';
import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { GitHub } from '../../service/github';
import { Discord } from '../../service/discord';

const listActiveDockerRuns = async (
  githubPrivateKey: string,
  githubClientSecret: string,
): Promise<ActiveDockerRuns | null> => {
  try {
    const gitHub = await GitHub.init(githubPrivateKey, githubClientSecret);
    return await ActiveDockerRuns.fetch(gitHub);
  } catch (error) {
    const message = `[Cleaner] Could not list the docker runs on GitHub, so no stale job is reset this cycle: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(message, error);
    await Discord.sendDebug(message);
    return null;
  }
};

export const cleanUpBuilds = async (githubPrivateKey: string, githubClientSecret: string) => {
  const latestRepoVersion = await RepoVersionInfo.getLatest();
  const activeRuns = await listActiveDockerRuns(githubPrivateKey, githubClientSecret);
  await Cleaner.cleanUp(latestRepoVersion.version, activeRuns);
};
