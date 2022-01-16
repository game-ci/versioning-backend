import { db, admin, firebase } from '../service/firebase';
import Timestamp = admin.firestore.Timestamp;

export const EDITOR_VERSIONS_COLLECTION = 'editorVersions';

export interface EditorVersionInfo {
  version: string;
  changeSet: string;
  major: number;
  minor: number;
  patch: string;
  addedDate?: Timestamp;
  modifiedDate?: Timestamp;
}

export class EditorVersionInfo {
  static get = async (version: string): Promise<EditorVersionInfo> => {
    const snapshot = await db.collection(EDITOR_VERSIONS_COLLECTION).doc(version).get();

    return snapshot.data() as EditorVersionInfo;
  };

  static getAllIds = async (): Promise<string[]> => {
    const snapshot = await db
      .collection(EDITOR_VERSIONS_COLLECTION)
      .orderBy('major', 'desc')
      .orderBy('minor', 'desc')
      .orderBy('patch', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.id);
  };

  static getAll = async (): Promise<EditorVersionInfo[]> => {
    const snapshot = await db
      .collection(EDITOR_VERSIONS_COLLECTION)
      .orderBy('major', 'desc')
      .orderBy('minor', 'desc')
      .orderBy('patch', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data()) as EditorVersionInfo[];
  };

  static createMany = async (editorVersionList: EditorVersionInfo[]) => {
    try {
      const batch = db.batch();

      editorVersionList.forEach((versionInfo) => {
        const { version } = versionInfo;

        const ref = db.collection(EDITOR_VERSIONS_COLLECTION).doc(version);
        const data = { ...versionInfo, addedDate: Timestamp.now(), modifiedDate: Timestamp.now() };
        batch.set(ref, data, { merge: false });
      });

      await batch.commit();
    } catch (err) {
      firebase.logger.error('Error occurred during batch commit of new editor versions', err);
    }
  };

  static updateMany = async (versionInfoList: EditorVersionInfo[]) => {
    try {
      const batch = db.batch();

      versionInfoList.forEach((versionInfo) => {
        const { version } = versionInfo;

        const ref = db.collection(EDITOR_VERSIONS_COLLECTION).doc(version);
        const data = { ...versionInfo, modifiedDate: Timestamp.now() };
        batch.set(ref, data, { merge: true });
      });

      await batch.commit();
    } catch (err) {
      firebase.logger.error('Error occurred during batch commit of new editor versions', err);
    }
  };
}
