import { db, firebase } from '../config/firebase';

export interface VersionInfo {
  version: string;
  changeSet: string;
}

export const importNewVersionsFromList = async (versionInfoList: VersionInfo[]) => {
  try {
    const batch = db.batch();

    versionInfoList.forEach((versionInfo) => {
      const { version } = versionInfo;
      const ref = db.collection('unityVersions').doc(version);
      batch.set(ref, versionInfo, { merge: true });
    });

    await batch.commit();
  } catch (err) {
    firebase.logger.error('Error occurred during batch commit of new version', err);
  }
};
