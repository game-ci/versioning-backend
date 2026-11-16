/**
 * A small in-memory stand-in for the parts of Firestore the build queue uses,
 * so report endpoints and the scheduler can be exercised together in tests.
 */
type Data = Record<string, any>;
type Operator = '==' | '!=' | '<' | 'in';
type Filter = { field: string; operator: Operator; value: unknown };

class Increment {
  constructor(readonly by: number) {}
}

export class FakeTimestamp {
  constructor(private readonly millis: number) {}

  static now = () => new FakeTimestamp(Date.now());
  static fromMillis = (millis: number) => new FakeTimestamp(millis);

  toMillis = () => this.millis;

  get seconds() {
    return Math.floor(this.millis / 1000);
  }
}

const clone = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
};

const readPath = (data: Data, path: string): unknown =>
  path.split('.').reduce<any>((value, key) => value?.[key], data);

const writePath = (data: Data, path: string, value: unknown) => {
  const keys = path.split('.');
  const last = keys.pop() as string;
  const parent = keys.reduce<Data>((node, key) => (node[key] ??= {}), data);
  parent[last] = value instanceof Increment ? (parent[last] ?? 0) + value.by : value;
};

const matches = (data: Data, { field, operator, value }: Filter) => {
  const actual = readPath(data, field);
  if (operator === '==') return actual === value;
  if (operator === '!=') return actual !== value;
  if (operator === '<') return (actual as any) < (value as any);
  return (value as unknown[]).includes(actual);
};

export const createInMemoryFirestore = () => {
  const collections = new Map<string, Map<string, Data>>();
  const collectionOf = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name) as Map<string, Data>;
  };

  const snapshotOf = (collectionName: string, id: string) => {
    const store = collectionOf(collectionName);
    return {
      id,
      exists: store.has(id),
      ref: docRef(collectionName, id),
      data: () => (store.has(id) ? clone(store.get(id)) : undefined),
    };
  };

  const docRef = (collectionName: string, id: string): any => {
    const store = collectionOf(collectionName);

    return {
      id,
      get: async () => snapshotOf(collectionName, id),
      create: async (data: Data) => {
        if (store.has(id)) throw new Error(`${collectionName}/${id} already exists`);
        store.set(id, clone(data));
      },
      set: async (data: Data, options: { merge?: boolean; mergeFields?: string[] } = {}) => {
        if (options.mergeFields) {
          const current = store.get(id) ?? {};
          for (const field of options.mergeFields) writePath(current, field, readPath(data, field));
          store.set(id, current);
          return;
        }
        store.set(id, options.merge ? { ...store.get(id), ...data } : clone(data));
      },
      update: async (fields: Data) => {
        const current = store.get(id);
        if (!current) throw new Error(`No document to update: ${collectionName}/${id}`);
        for (const [path, value] of Object.entries(fields)) writePath(current, path, value);
      },
      delete: async () => {
        store.delete(id);
      },
    };
  };

  const query = (collectionName: string, filters: Filter[], limit: number | null): any => ({
    where: (field: string, operator: Operator, value: unknown) =>
      query(collectionName, [...filters, { field, operator, value }], limit),
    orderBy: () => query(collectionName, filters, limit),
    limit: (count: number) => query(collectionName, filters, count),
    get: async () => {
      const docs = [...collectionOf(collectionName).entries()]
        .filter(([, data]) => filters.every((filter) => matches(data, filter)))
        .slice(0, limit ?? undefined)
        .map(([id]) => snapshotOf(collectionName, id));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });

  const db = {
    runTransaction: async <T>(work: (transaction: any) => Promise<T>): Promise<T> => {
      const writes: (() => Promise<void>)[] = [];
      const result = await work({
        get: (ref: any) => ref.get(),
        update: (ref: any, fields: Data) => writes.push(() => ref.update(fields)),
        set: (ref: any, data: Data, options?: any) => writes.push(() => ref.set(data, options)),
      });
      for (const write of writes) await write();
      return result;
    },
    doc: (path: string) => {
      const [collectionName, id] = path.split('/');
      return docRef(collectionName, id);
    },
    collection: (name: string) => ({
      ...query(name, [], null),
      doc: (id: string) => docRef(name, id),
    }),
  };

  const admin = {
    firestore: {
      FieldValue: { increment: (by: number) => new Increment(by) },
      Timestamp: FakeTimestamp,
      DocumentSnapshot: {},
    },
  };

  return {
    db,
    admin,
    read: (collectionName: string, id: string) => collectionOf(collectionName).get(id),
    seed: (collectionName: string, id: string, data: Data) => {
      collectionOf(collectionName).set(id, clone(data));
    },
    clear: () => collections.clear(),
  };
};
