import { openDB, type IDBPDatabase } from "idb";

// The browser's local working copy. `files` mirrors the data repo path-for-path
// (settings.json, months/2026-10.json, ...), so sync is a straight file diff.
// `dirty` lists paths changed since the last successful push. Both are written in the
// same transaction, so a crash can never leave a change that is not marked for sync.

export type Doc = Record<string, unknown>;
export type DocMap = Map<string, Doc | undefined>;

export class LedgerStore {
  private constructor(private db: IDBPDatabase) {}

  static async open(name = "ledger"): Promise<LedgerStore> {
    const db = await openDB(name, 1, {
      upgrade(d) {
        d.createObjectStore("files");
        d.createObjectStore("dirty");
        d.createObjectStore("meta");
      },
    });
    return new LedgerStore(db);
  }

  close() {
    this.db.close();
  }

  async get<T extends Doc>(path: string): Promise<T | undefined> {
    return (await this.db.get("files", path)) as T | undefined;
  }

  async paths(): Promise<string[]> {
    return (await this.db.getAllKeys("files")) as string[];
  }

  /**
   * Read the given paths, let `fn` change them, and write back atomically. Setting a path
   * to a value writes it and marks it dirty; leaving it untouched writes nothing.
   * `fn` must be synchronous (an awaited non-IDB promise would end the transaction).
   */
  async transact(paths: string[], fn: (docs: DocMap) => void): Promise<void> {
    const tx = this.db.transaction(["files", "dirty"], "readwrite");
    const files = tx.objectStore("files");
    const dirty = tx.objectStore("dirty");
    const docs: DocMap = new Map();
    const before = new Map<string, string | undefined>();
    for (const p of paths) {
      const d = (await files.get(p)) as Doc | undefined;
      docs.set(p, d === undefined ? undefined : structuredClone(d));
      before.set(p, d === undefined ? undefined : JSON.stringify(d));
    }
    fn(docs);
    for (const [p, d] of docs) {
      if (d === undefined) continue;
      if (JSON.stringify(d) === before.get(p)) continue;
      await files.put(d, p);
      await dirty.put(true, p);
    }
    await tx.done;
  }

  /** Write files that came from the remote (a pull). Not marked dirty. */
  async putRemote(docs: Record<string, Doc>): Promise<void> {
    const tx = this.db.transaction(["files", "dirty"], "readwrite");
    for (const [p, d] of Object.entries(docs)) {
      await tx.objectStore("files").put(d, p);
      await tx.objectStore("dirty").delete(p);
    }
    await tx.done;
  }

  async allDocs(): Promise<Record<string, Doc>> {
    const keys = (await this.db.getAllKeys("files")) as string[];
    const out: Record<string, Doc> = {};
    for (const k of keys) out[k] = (await this.db.get("files", k)) as Doc;
    return out;
  }

  /** Make the local files exactly `docs` (a pull or "keep remote"). Nothing stays dirty. */
  async replaceAll(docs: Record<string, Doc>): Promise<void> {
    const tx = this.db.transaction(["files", "dirty"], "readwrite");
    await tx.objectStore("files").clear();
    await tx.objectStore("dirty").clear();
    for (const [p, d] of Object.entries(docs)) await tx.objectStore("files").put(d, p);
    await tx.done;
  }

  async markDirty(paths: string[]): Promise<void> {
    const tx = this.db.transaction("dirty", "readwrite");
    for (const p of paths) await tx.store.put(true, p);
    await tx.done;
  }

  async dirtyPaths(): Promise<string[]> {
    return (await this.db.getAllKeys("dirty")) as string[];
  }

  async clearDirty(paths: string[]): Promise<void> {
    const tx = this.db.transaction("dirty", "readwrite");
    for (const p of paths) await tx.store.delete(p);
    await tx.done;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get("meta", key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put("meta", value, key);
  }
}
