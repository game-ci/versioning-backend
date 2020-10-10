import { UnityVersionInfo } from '../../model/unityVersionInfo';
import { isMatch } from 'lodash';
import { firebase } from '../../config/firebase';
import { Discord } from '../../config/discord';

export const updateDatabaseWithNewVersionInformation = async (
  ingestedInfoList: UnityVersionInfo[],
): Promise<void> => {
  const existingInfoList = await UnityVersionInfo.getAll();

  const newVersions: UnityVersionInfo[] = [];
  const updatedVersions: UnityVersionInfo[] = [];

  ingestedInfoList.forEach((scrapedInfo) => {
    const { version } = scrapedInfo;
    const existingVersion = existingInfoList.find((info) => info.version === version);

    if (!existingVersion) {
      newVersions.push(scrapedInfo);
      return;
    }

    if (!isMatch(existingVersion, scrapedInfo)) {
      updatedVersions.push(scrapedInfo);
      return;
    }
  });

  let message = '';

  if (newVersions.length >= 1) {
    await UnityVersionInfo.createMany(newVersions);
    message += `${ingestedInfoList.length} new versions detected. `;
  }

  if (updatedVersions.length >= 1) {
    await UnityVersionInfo.updateMany(updatedVersions);
    message += `${ingestedInfoList.length} updated versions detected. `;
  }

  message = message.trimEnd();
  if (message.length >= 1) {
    firebase.logger.info(message);
    await Discord.sendMessageToMaintainers(message);
  } else {
    firebase.logger.info('Database is up-to-date. (no updated info found)');
  }
};
