import { Cleaner } from './cleaner';
import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { UnfinishedWorkflowRuns } from '../../model/unfinishedWorkflowRuns';
import { GitHub } from '../../service/github';

export const cleanUpBuilds = async (githubPrivateKey: string, githubClientSecret: string) => {
  const latestRepoVersion = await RepoVersionInfo.getLatest();
  const fetchUnfinishedRuns = async () => {
    const gitHub = await GitHub.init(githubPrivateKey, githubClientSecret);
    return UnfinishedWorkflowRuns.fetch(gitHub);
  };

  await Cleaner.cleanUp(latestRepoVersion.version, fetchUnfinishedRuns);
};
