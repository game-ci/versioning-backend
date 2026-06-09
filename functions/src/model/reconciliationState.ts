import { admin, db } from '../service/firebase';
import Timestamp = admin.firestore.Timestamp;

export const RECONCILIATION_COLLECTION = 'reconciliationState';
export const DOCKER_HUB_DOC = 'dockerHub';

export interface ReconciliationStateData {
  cursorVersion: string | null;
  recentDispatches: Record<string, number>;
  baseHubCheckedAt: number | null;
  cycleCount: number;
  updatedAt?: Timestamp;
}

export class ReconciliationState {
  static async load(): Promise<ReconciliationStateData> {
    const snapshot = await db.collection(RECONCILIATION_COLLECTION).doc(DOCKER_HUB_DOC).get();

    if (!snapshot.exists) {
      return {
        cursorVersion: null,
        recentDispatches: {},
        baseHubCheckedAt: null,
        cycleCount: 0,
      };
    }

    const data = snapshot.data() as Partial<ReconciliationStateData>;
    return {
      cursorVersion: data.cursorVersion ?? null,
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
}
