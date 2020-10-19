import { isMatch } from 'lodash';
import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { firebase } from '../../config/firebase';
import { Discord } from '../../config/discord';

const plural = (amount: number) => {
  return amount === 1 ? 'version' : 'versions';
};

export const updateDatabase = async (ingestedInfoList: RepoVersionInfo[]): Promise<void> => {
  const existingInfoList = await RepoVersionInfo.getAll();

  const newVersions: RepoVersionInfo[] = [];
  const updatedVersions: RepoVersionInfo[] = [];

  ingestedInfoList.forEach((ingestedInfo: RepoVersionInfo) => {
    const { version } = ingestedInfo;
    const existingVersion = existingInfoList.find((info) => info.version === version);

    if (!existingVersion) {
      newVersions.push(ingestedInfo);
      return;
    }

    if (!isMatch(existingVersion, ingestedInfo)) {
      updatedVersions.push(ingestedInfo);
      return;
    }
  });

  let message = '';

  if (newVersions.length >= 1) {
    await RepoVersionInfo.createMany(newVersions);
    const pluralNew = newVersions.length === 1 ? 'New' : `${newVersions.length} new`;
    message += `
      ${pluralNew} repository ${plural(newVersions.length)} detected.
      (\`${newVersions.map((version) => version.version).join('`, `')}\`)`;
  }

  if (updatedVersions.length >= 1) {
    await RepoVersionInfo.updateMany(updatedVersions);
    const pluralUpdated =
      updatedVersions.length === 1 ? 'Updated' : `${updatedVersions.length} updated`;
    message += `
      ${pluralUpdated} repository ${plural(updatedVersions.length)} detected.
      (\`${updatedVersions.map((version) => version.version).join('`, `')}\`)`;
  }

  message = message.trimEnd();
  if (message.length >= 1) {
    firebase.logger.info(message);
    await Discord.sendNews(message);
  } else {
    firebase.logger.info('Database is up-to-date. (no updated repo versions found)');
  }
};
