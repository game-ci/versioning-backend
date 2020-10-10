import { db, admin, firebase } from '../config/firebase';
import Timestamp = admin.firestore.Timestamp;

const COLLECTION = 'unityVersions';

export interface UnityVersionInfo {
  version: string;
  changeSet: string;
  major: number;
  minor: number;
  patch: string;
  addedDate?: Timestamp;
  modifiedDate?: Timestamp;
}

export class UnityVersionInfo {
  static getAll = async (): Promise<UnityVersionInfo[]> => {
    const snapshot = await db
      .collection(COLLECTION)
      .orderBy('major', 'desc')
      .orderBy('minor', 'desc')
      .orderBy('patch', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data()) as UnityVersionInfo[];
  };

  static createMany = async (versionInfoList: UnityVersionInfo[]) => {
    try {
      const batch = db.batch();

      versionInfoList.forEach((versionInfo) => {
        const { version } = versionInfo;

        const ref = db.collection(COLLECTION).doc(version);
        const data = { ...versionInfo, addedDate: Timestamp.now(), modifiedDate: Timestamp.now() };
        batch.set(ref, data, { merge: false });
      });

      await batch.commit();
    } catch (err) {
      firebase.logger.error('Error occurred during batch commit of new version', err);
    }
  };

  static updateMany = async (versionInfoList: UnityVersionInfo[]) => {
    try {
      const batch = db.batch();

      versionInfoList.forEach((versionInfo) => {
        const { version } = versionInfo;

        const ref = db.collection(COLLECTION).doc(version);
        const data = { ...versionInfo, modifiedDate: Timestamp.now() };
        batch.set(ref, data, { merge: true });
      });

      await batch.commit();
    } catch (err) {
      firebase.logger.error('Error occurred during batch commit of new version', err);
    }
  };
}
