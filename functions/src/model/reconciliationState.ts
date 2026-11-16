import { admin, db } from '../service/firebase';
import Timestamp = admin.firestore.Timestamp;

export const RECONCILIATION_COLLECTION = 'reconciliationState';
export const DOCKER_HUB_DOC = 'dockerHub';

export interface VersionCheckRecord {
  // Last scan that verified every image of the version
  lastCheckedAt: number | null;
  // Last scan of any outcome, used to rotate through versions
  lastScannedAt?: number;
  lastDispatchAttemptAt: number | null;
  dispatchFailureCount: number;
  imagesExpected: number;
  imagesMissing: number;
  // Images whose tag list could not be fetched in the last scan; the version stays unchecked.
  imagesUnknown?: number;
}

export interface ReconciliationStateData {
  versionHistory: Record<string, VersionCheckRecord>;
  recentDispatches: Record<string, number>;
  baseHubCheckedAt: number | null;
  cycleCount: number;
  updatedAt?: Timestamp;
}

const DEFAULT_VERSION_RECORD: VersionCheckRecord = {
  lastCheckedAt: null,
  lastDispatchAttemptAt: null,
  dispatchFailureCount: 0,
  imagesExpected: 0,
  imagesMissing: 0,
};

export class ReconciliationState {
  static async load(): Promise<ReconciliationStateData> {
    const snapshot = await db.collection(RECONCILIATION_COLLECTION).doc(DOCKER_HUB_DOC).get();

    if (!snapshot.exists) {
      return {
        versionHistory: {},
        recentDispatches: {},
        baseHubCheckedAt: null,
        cycleCount: 0,
      };
    }

    const data = snapshot.data() as Partial<ReconciliationStateData>;
    return {
      versionHistory: data.versionHistory ?? {},
      recentDispatches: data.recentDispatches ?? {},
      baseHubCheckedAt: data.baseHubCheckedAt ?? null,
      cycleCount: data.cycleCount ?? 0,
    };
  }

  static async save(state: ReconciliationStateData): Promise<void> {
    await db
      .collection(RECONCILIATION_COLLECTION)
      .doc(DOCKER_HUB_DOC)
      .set({ ...state, updatedAt: Timestamp.now() }, { merge: false });
  }

  static getOrCreateVersionRecord(
    state: ReconciliationStateData,
    version: string,
  ): VersionCheckRecord {
    if (!state.versionHistory[version]) {
      state.versionHistory[version] = { ...DEFAULT_VERSION_RECORD };
    }
    return state.versionHistory[version];
  }
}
