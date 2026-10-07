// Single-writer handoff. The repo head is the source of truth for "who has the latest":
// each device remembers the commit it last synced (`baseCommit`), and a push can only move the
// branch forward from exactly that commit.
import { makeBundle, type Bundle } from "../data/bundle";
import type { Doc, LedgerStore } from "../data/db";
import type { Manifest } from "../data/schema";
import { serialize, sha256Hex } from "../data/serialize";
import { GitHubError, type GitHubApi } from "./github";
import { mergeDocs } from "./merge";

export const MANIFEST = "manifest.json";
export const isDataPath = (p: string) => /^(settings|people|accounts|rules)\.json$/.test(p) || /^months\/\d{4}-\d{2}\.json$/.test(p);

export class ChecksumError extends Error {
  constructor(public path: string) {
    super(`Downloaded ${path} does not match its checksum`);
  }
}

export interface Ctx {
  api: GitHubApi;
  device: string;
  now?: () => Date;
}

const nowOf = (c: Ctx) => (c.now ?? (() => new Date()))();

// ---- local helpers -------------------------------------------------------------------------

async function localTexts(store: LedgerStore): Promise<Record<string, string>> {
  const docs = await store.allDocs();
  return Object.fromEntries(Object.entries(docs).filter(([p]) => isDataPath(p)).map(([p, d]) => [p, serialize(d)]));
}

async function checksums(texts: Record<string, string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [p, t] of Object.entries(texts)) out[p] = await sha256Hex(t);
  return out;
}

const sameSums = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

// ---- remote reading ------------------------------------------------------------------------

interface Remote {
  head: string;
  treeSha: string;
  blobs: Map<string, string>;
  manifest?: Manifest;
}

async function fetchRemote(api: GitHubApi, head?: string): Promise<Remote> {
  const h = head ?? (await api.getHead());
  const { treeSha, blobs } = await api.getBlobs(h);
  const mSha = blobs.get(MANIFEST);
  const manifest = mSha ? (JSON.parse(await api.getBlobText(mSha)) as Manifest) : undefined;
  return { head: h, treeSha, blobs, manifest };
}

/** Download every file the manifest lists, verifying each against its checksum. */
async function downloadAll(api: GitHubApi, r: Remote, have?: Record<string, string>, haveDocs?: Record<string, Doc>): Promise<Record<string, Doc>> {
  const out: Record<string, Doc> = {};
  for (const [path, sum] of Object.entries(r.manifest?.checksums ?? {})) {
    if (have && haveDocs && have[path] === sum && haveDocs[path]) {
      out[path] = haveDocs[path]!; // unchanged, no need to download
      continue;
    }
    const sha = r.blobs.get(path);
    if (!sha) throw new ChecksumError(path);
    const text = await api.getBlobText(sha);
    if ((await sha256Hex(text)) !== sum) throw new ChecksumError(path);
    out[path] = JSON.parse(text) as Doc;
  }
  return out;
}

async function setBase(store: LedgerStore, r: Pick<Remote, "head" | "manifest">, now: Date) {
  await store.setMeta("baseCommit", r.head);
  await store.setMeta("manifestRevision", r.manifest?.revision ?? 0);
  await store.setMeta("lastSynced", now.toISOString());
}

// ---- operations ----------------------------------------------------------------------------

export type CheckResult = "up-to-date" | "pulled" | "needs-push" | "conflict";

/** On open: decide whether to pull, push, or ask. Downloads and verifies before touching local data. */
export async function check(store: LedgerStore, c: Ctx): Promise<CheckResult> {
  const head = await c.api.getHead();
  const base = await store.getMeta<string>("baseCommit");
  const dirty = await store.dirtyPaths();
  if (head === base) {
    await store.setMeta("lastSynced", nowOf(c).toISOString());
    return dirty.length ? "needs-push" : "up-to-date";
  }
  const remote = await fetchRemote(c.api, head);
  const localPaths = Object.keys(await localTexts(store));
  if (!remote.manifest) {
    if (localPaths.length) return "needs-push"; // first push uploads everything
    await store.setMeta("baseCommit", head);
    return "up-to-date";
  }
  if (dirty.length || (base === undefined && localPaths.length)) return "conflict";

  const texts = await localTexts(store);
  const docs = await store.allDocs();
  const next = await downloadAll(c.api, remote, await checksums(texts), docs);
  await store.replaceAll(next);
  await setBase(store, remote, nowOf(c));
  return "pulled";
}

export type PushResult = { status: "pushed"; commit: string } | { status: "noop" } | { status: "conflict" };

/** Upload local changes as one commit on top of the commit we last synced. */
export async function push(store: LedgerStore, c: Ctx, opts: { all?: boolean; deletions?: string[] } = {}): Promise<PushResult> {
  const head = await c.api.getHead();
  const base = await store.getMeta<string>("baseCommit");
  const texts = await localTexts(store);
  let remote: Remote | undefined;
  if (head !== base) {
    remote = await fetchRemote(c.api, head);
    if (remote.manifest) return { status: "conflict" };
  }
  const initial = (await store.getMeta("manifestRevision")) === undefined; // never synced: upload everything
  const dirty = (await store.dirtyPaths()).filter(isDataPath);
  const paths = opts.all || initial ? Object.keys(texts) : dirty.filter((p) => p in texts);
  if (!paths.length && !opts.deletions?.length) return { status: "noop" };

  const prevRev = (await store.getMeta<number>("manifestRevision")) ?? 0;
  const manifest: Manifest = { revision: prevRev + 1, updatedBy: c.device, updatedAt: nowOf(c).toISOString(), checksums: await checksums(texts) };
  const files: Record<string, string> = { [MANIFEST]: serialize(manifest) };
  for (const p of paths) files[p] = texts[p]!;

  const { treeSha } = remote ?? (await c.api.getBlobs(head));
  let commit: string;
  try {
    commit = await c.api.createCommit({ parent: head, baseTree: treeSha, files, deletions: opts.deletions, message: `Ledger sync r${manifest.revision} from ${c.device}` });
    await c.api.updateHead(commit);
  } catch (e) {
    if (e instanceof GitHubError && e.kind === "conflict") return { status: "conflict" };
    throw e;
  }

  // Clear only what we actually uploaded and that has not changed since.
  const current = await localTexts(store);
  await store.clearDirty(paths.filter((p) => current[p] === texts[p]));
  await store.setMeta("baseCommit", commit);
  await store.setMeta("manifestRevision", manifest.revision);
  await store.setMeta("lastSynced", nowOf(c).toISOString());
  return { status: "pushed", commit };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "unsynced" | "behind" | "mismatch" };

/** "Safe to close": re-read the remote and confirm it holds exactly what is on this device. */
export async function verify(store: LedgerStore, c: Ctx): Promise<VerifyResult> {
  if ((await store.dirtyPaths()).length) return { ok: false, reason: "unsynced" };
  const head = await c.api.getHead();
  const remote = await fetchRemote(c.api, head);
  const sums = await checksums(await localTexts(store));
  if (!remote.manifest) return Object.keys(sums).length === 0 ? { ok: true } : { ok: false, reason: "mismatch" };
  if (!sameSums(remote.manifest.checksums, sums)) return { ok: false, reason: head === (await store.getMeta("baseCommit")) ? "mismatch" : "behind" };
  await setBase(store, remote, nowOf(c)); // a commit that did not change our data (e.g. a README edit) is fine
  return { ok: true };
}

export type Choice = "local" | "remote" | "merge";

/**
 * Settle a conflict. The version that would be lost is handed to `saveBackup` first
 * (the UI downloads it). Returns once local and the remote agree on a base commit;
 * the caller then pushes.
 */
export async function resolve(store: LedgerStore, c: Ctx, choice: Choice, saveBackup: (name: string, bundle: Bundle) => void): Promise<{ deletions: string[] }> {
  const remote = await fetchRemote(c.api);
  const remoteDocs = await downloadAll(c.api, remote);
  const localDocs = Object.fromEntries(Object.entries(await store.allDocs()).filter(([p]) => isDataPath(p)));
  const stamp = nowOf(c);

  if (choice !== "remote") saveBackup("remote-version", makeBundle(remoteDocs, stamp));
  if (choice !== "local") saveBackup("this-device-version", makeBundle(localDocs, stamp));

  if (choice === "remote") {
    await store.replaceAll(remoteDocs);
    await setBase(store, remote, stamp);
    return { deletions: [] };
  }
  await setBase(store, remote, stamp);
  if (choice === "local") {
    await store.replaceAll(localDocs);
    await store.markDirty(Object.keys(localDocs));
    // Remote-only data files must go, or the two sides never agree.
    return { deletions: Object.keys(remoteDocs).filter((p) => !(p in localDocs)) };
  }
  const merged: Record<string, Doc> = {};
  for (const p of new Set([...Object.keys(localDocs), ...Object.keys(remoteDocs)])) merged[p] = mergeDocs(p, localDocs[p], remoteDocs[p]);
  await store.replaceAll(merged);
  const sums = await checksums(Object.fromEntries(Object.entries(merged).map(([p, d]) => [p, serialize(d)])));
  await store.markDirty(Object.keys(merged).filter((p) => sums[p] !== remote.manifest?.checksums[p]));
  return { deletions: [] };
}
