import { Cleaner } from './cleaner';
import { RepoVersionInfo } from '../../model/repoVersionInfo';

export const cleanUpBuilds = async () => {
  const latestRepoVersion = await RepoVersionInfo.getLatest();
  await Cleaner.cleanUp(latestRepoVersion.version);
};
