import { db, admin, firebase } from '../config/firebase';
import Timestamp = admin.firestore.Timestamp;

const COLLECTION = 'unityVersions';

export interface VersionInfo {
  version: string;
  changeSet: string;
  major: number;
  minor: number;
  patch: string;
  addedDate?: Timestamp;
  modifiedDate?: Timestamp;
}

export const getVersionInfoList = async (): Promise<VersionInfo[]> => {
  const snapshot = await db
    .collection(COLLECTION)
    .orderBy('major', 'desc')
    .orderBy('minor', 'desc')
    .orderBy('patch', 'desc')
    .get();

  return snapshot.docs.map((doc) => doc.data()) as VersionInfo[];
};

export const updateVersionInfoFromList = async (versionInfoList: VersionInfo[]) => {
  try {
    const batch = db.batch();

    versionInfoList.forEach((versionInfo) => {
      const { version } = versionInfo;
      const ref = db.collection(COLLECTION).doc(version);

      const data = { ...versionInfo, addedDate: Timestamp.now() };
      const mergeFields = ['changeSet'];

      batch.set(ref, data, { merge: true, mergeFields });
    });

    await batch.commit();
  } catch (err) {
    firebase.logger.error('Error occurred during batch commit of new version', err);
  }
};
