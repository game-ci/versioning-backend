import { db, admin } from '../config/firebase';
import Timestamp = admin.firestore.Timestamp;

const COLLECTION = 'repoVersions';

export interface RepoVersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: string;
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
}
