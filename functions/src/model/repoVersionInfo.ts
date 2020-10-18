import { db, admin, firebase } from '../config/firebase';
import Timestamp = admin.firestore.Timestamp;

export const COLLECTION = 'repoVersions';

export interface RepoVersionInfo {
  id: number;
  version: string;
  major: number;
  minor: number;
  patch: number;
  name: string;
  description: string;
  author: string;
  url: string;
  commitIsh: string;
  addedDate?: Timestamp;
  modifiedDate?: Timestamp;
}

export class RepoVersionInfo {
  static getLatest = async (): Promise<RepoVersionInfo> => {
    const snapshot = await db
      .collection(COLLECTION)
      .orderBy('major', 'desc')
      .orderBy('minor', 'desc')
      .orderBy('patch', 'desc')
      .limit(1)
      .get();

    if (snapshot.docs.length <= 0) {
      throw new Error('No repository versions have been ingested yet');
    }

    return snapshot.docs[0].data() as RepoVersionInfo;
  };

  static getAllIds = async (): Promise<string[]> => {
    const snapshot = await db
      .collection(COLLECTION)
      .orderBy('major', 'desc')
      .orderBy('minor', 'desc')
      .orderBy('patch', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.id);
  };

  static getAll = async (): Promise<RepoVersionInfo[]> => {
    const snapshot = await db
      .collection(COLLECTION)
      .orderBy('major', 'desc')
      .orderBy('minor', 'desc')
      .orderBy('patch', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data()) as RepoVersionInfo[];
  };

  static create = async (repoVersion: RepoVersionInfo) => {
    const { version } = repoVersion;
    await db
      .collection(COLLECTION)
      .doc(version)
      .set(
        {
          ...repoVersion,
          addedDate: Timestamp.now(),
          modifiedDate: Timestamp.now(),
        },
        { merge: false },
      );
  };

  static update = async (repoVersion: RepoVersionInfo) => {
    const { version } = repoVersion;
    await db
      .collection(COLLECTION)
      .doc(version)
      .set(
        {
          ...repoVersion,
          modifiedDate: Timestamp.now(),
        },
        { merge: true },
      );
  };

  static createMany = async (repoVersionList: RepoVersionInfo[]) => {
    try {
      const batch = db.batch();

      repoVersionList.forEach((versionInfo) => {
        const { version } = versionInfo;

        const ref = db.collection(COLLECTION).doc(version);
        const data = { ...versionInfo, addedDate: Timestamp.now(), modifiedDate: Timestamp.now() };
        batch.set(ref, data, { merge: false });
      });

      await batch.commit();
    } catch (err) {
      firebase.logger.error('Error occurred during batch commit of new repo versions', err);
    }
  };

  static updateMany = async (repoVersionList: RepoVersionInfo[]) => {
    try {
      const batch = db.batch();

      repoVersionList.forEach((versionInfo) => {
        const { version } = versionInfo;

        const ref = db.collection(COLLECTION).doc(version);
        const data = { ...versionInfo, modifiedDate: Timestamp.now() };
        batch.set(ref, data, { merge: true });
      });

      await batch.commit();
    } catch (err) {
      firebase.logger.error('Error occurred during batch commit of new repo versions', err);
    }
  };
}
