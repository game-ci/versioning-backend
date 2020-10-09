import { VersionInfo } from '../model/versionInfo';
import { db } from '../config/firebase';

export const generateBuildQueueFromNewVersionInfoList = async (versionInfoList: VersionInfo[]) => {
  const batch = db.batch();

  // Todo - import build queue here

  await batch.commit();
};
