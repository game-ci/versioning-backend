import { db, admin, firebase } from '../config/firebase';
import Timestamp = admin.firestore.Timestamp;
import { UnityVersionInfo } from './unityVersionInfo';

const COLLECTION = 'builtVersions';

export interface CiVersionInfo {
  unityVersionInfo: UnityVersionInfo;
  addedDate?: Timestamp;
  modifiedDate?: Timestamp;
}

export class CiVersionInfo {
  static getAll = async (): Promise<CiVersionInfo[]> => {
    const snapshot = await db
      .collection(COLLECTION)
      .orderBy('unityVersionInfo.major', 'desc')
      .orderBy('unityVersionInfo.minor', 'desc')
      .orderBy('unityVersionInfo.patch', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data()) as CiVersionInfo[];
  };

  static create = async (builtVersion: CiVersionInfo) => {
    try {
      await db
        .collection(COLLECTION)
        .doc('some elaborate id')
        .set({
          ...builtVersion,
          addedDate: Timestamp.now(),
        });
    } catch (err) {
      firebase.logger.error('Error occurred during batch commit of new version', err);
    }
  };
}
