import { UnityVersionInfo } from '../../model/unityVersionInfo';
import { db } from '../../config/firebase';

export const generateBuildQueueFromNewVersionInfoList = async (
  versionInfoList: UnityVersionInfo[],
) => {
  const batch = db.batch();

  // Todo - import build queue here

  await batch.commit();
};
