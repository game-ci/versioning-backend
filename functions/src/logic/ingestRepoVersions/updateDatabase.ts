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
    message += `${newVersions.length} new repository ${plural(newVersions.length)} detected. `;
  }

  if (updatedVersions.length >= 1) {
    await RepoVersionInfo.updateMany(updatedVersions);
    message += `${updatedVersions.length} updated repository ${plural(
      updatedVersions.length,
    )} detected. `;
  }

  message = message.trimEnd();
  if (message.length >= 1) {
    firebase.logger.info(message);
    await Discord.sendMessageToMaintainers(message);
  } else {
    firebase.logger.info('Database is up-to-date. (no updated repo versions found)');
  }
};
