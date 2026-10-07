// Minimal GitHub REST client for the data repo, using the Git Data API so a save is one atomic
// commit. Requests are sent one at a time (the Contents API warns against parallel writes, and
// it keeps us far from the secondary rate limits).

export type ErrorKind = "auth" | "forbidden" | "notfound" | "rate" | "conflict" | "network" | "other";

export class GitHubError extends Error {
  constructor(public kind: ErrorKind, public status: number, message: string, public retryAt?: number) {
    super(message);
  }
}

export interface ApiConfig {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

const ROOT = "https://api.github.com";

function b64ToText(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export class GitHubApi {
  private chain: Promise<unknown> = Promise.resolve();
  private branch: string;
  private f: typeof fetch;
  private now: () => number;

  constructor(private cfg: ApiConfig) {
    this.branch = cfg.branch ?? "main";
    this.f = cfg.fetch ?? ((...a) => fetch(...a));
    this.now = cfg.now ?? Date.now;
  }

  private repoPath(p: string) {
    return `/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}${p}`;
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const run = async (): Promise<T> => {
      let res: Response;
      try {
        res = await this.f(ROOT + path, {
          method,
          headers: {
            Authorization: `Bearer ${this.cfg.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
        });
      } catch {
        throw new GitHubError("network", 0, "Cannot reach GitHub");
      }
      if (res.ok) return (await res.json()) as T;
      throw await this.toError(res);
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async toError(res: Response): Promise<GitHubError> {
    let msg = "";
    try {
      msg = ((await res.json()) as { message?: string }).message ?? "";
    } catch { /* body is optional */ }
    const s = res.status;
    if (s === 401) return new GitHubError("auth", s, "Token is invalid or expired");
    if (s === 403 || s === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const remaining = res.headers.get("x-ratelimit-remaining");
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      if (s === 429 || retryAfter || remaining === "0" || /rate limit/i.test(msg)) {
        const at = retryAfter ? this.now() + retryAfter * 1000 : reset ? reset * 1000 : this.now() + 60_000; // docs: wait at least a minute if no header
        return new GitHubError("rate", s, "GitHub rate limit reached", at);
      }
      return new GitHubError("forbidden", s, "No access to the data repo");
    }
    if (s === 404) return new GitHubError("notfound", s, "Data repo or branch not found");
    if (s === 409 || s === 422) return new GitHubError("conflict", s, msg || "Update rejected");
    return new GitHubError("other", s, msg || `GitHub error ${s}`);
  }

  async getHead(): Promise<string> {
    const r = await this.request<{ object: { sha: string } }>("GET", this.repoPath(`/git/ref/heads/${this.branch}`));
    return r.object.sha;
  }

  /** Blob SHAs by path for the whole tree of a commit. */
  async getBlobs(commitSha: string): Promise<{ treeSha: string; blobs: Map<string, string> }> {
    const c = await this.request<{ tree: { sha: string } }>("GET", this.repoPath(`/git/commits/${commitSha}`));
    const t = await this.request<{ truncated?: boolean; tree: { path: string; type: string; sha: string }[] }>("GET", this.repoPath(`/git/trees/${c.tree.sha}?recursive=1`));
    if (t.truncated) throw new GitHubError("other", 0, "Data repo is too large to read in one go");
    return { treeSha: c.tree.sha, blobs: new Map(t.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha])) };
  }

  async getBlobText(sha: string): Promise<string> {
    const b = await this.request<{ content: string; encoding: string }>("GET", this.repoPath(`/git/blobs/${sha}`));
    return b.encoding === "base64" ? b64ToText(b.content) : b.content;
  }

  /**
   * Create a commit on top of `parent` writing `files` and removing `deletions`.
   * Returns the new commit SHA. Does not move the branch.
   */
  async createCommit(opts: { parent: string; baseTree: string; files: Record<string, string>; deletions?: string[]; message: string }): Promise<string> {
    const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
    for (const [path, content] of Object.entries(opts.files)) {
      const b = await this.request<{ sha: string }>("POST", this.repoPath("/git/blobs"), { content, encoding: "utf-8" });
      entries.push({ path, mode: "100644", type: "blob", sha: b.sha });
    }
    for (const path of opts.deletions ?? []) entries.push({ path, mode: "100644", type: "blob", sha: null });
    const t = await this.request<{ sha: string }>("POST", this.repoPath("/git/trees"), { base_tree: opts.baseTree, tree: entries });
    const c = await this.request<{ sha: string }>("POST", this.repoPath("/git/commits"), { message: opts.message, tree: t.sha, parents: [opts.parent] });
    return c.sha;
  }

  /** Move the branch to `sha`. Never forced, so a stale push is rejected (kind "conflict"). */
  async updateHead(sha: string): Promise<void> {
    await this.request("PATCH", this.repoPath(`/git/refs/heads/${this.branch}`), { sha, force: false });
  }
}
