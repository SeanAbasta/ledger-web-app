// An in-memory stand-in for the slice of the GitHub Git Data API that Ledger uses.
export class FakeGitHub {
  blobs = new Map<string, string>();
  trees = new Map<string, Map<string, string>>(); // tree sha -> path -> blob sha
  commits = new Map<string, { tree: string; parents: string[] }>();
  head: string;
  private n = 0;
  offline = false;
  /** Respond to the next matching request with this status instead. */
  fail: { match: RegExp; status: number; headers?: Record<string, string>; message?: string; times: number } | undefined;
  log: string[] = [];
  /** Hook run before each request is handled (to simulate another device acting mid-flight). */
  before?: (method: string, path: string) => Promise<void> | void;

  constructor() {
    const b = this.sha("blob");
    this.blobs.set(b, "# data\n");
    const t = this.sha("tree");
    this.trees.set(t, new Map([["README.md", b]]));
    this.head = this.sha("commit");
    this.commits.set(this.head, { tree: t, parents: [] });
  }

  private sha(kind: string) {
    return (kind[0] + String(++this.n).padStart(39, "0")).slice(0, 40);
  }

  files(): Record<string, string> {
    const t = this.trees.get(this.commits.get(this.head)!.tree)!;
    return Object.fromEntries([...t].map(([p, b]) => [p, this.blobs.get(b)!]));
  }

  fetch: typeof fetch = async (input, init) => {
    if (this.offline) throw new TypeError("Failed to fetch");
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, "");
    this.log.push(`${method} ${path}`);
    await this.before?.(method, path);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

    if (this.fail && this.fail.times > 0 && this.fail.match.test(`${method} ${path}`)) {
      this.fail.times--;
      return json(this.fail.status, { message: this.fail.message ?? "error" }, this.fail.headers);
    }
    if (!/Bearer good/.test((init?.headers as Record<string, string>)?.Authorization ?? "")) return json(401, { message: "Bad credentials" });

    let m: RegExpMatchArray | null;
    if (method === "GET" && (m = path.match(/^\/git\/ref\/heads\/(.+)$/))) return json(200, { object: { sha: this.head } });
    if (method === "GET" && (m = path.match(/^\/git\/commits\/(\w+)$/))) {
      const c = this.commits.get(m[1]!);
      return c ? json(200, { tree: { sha: c.tree } }) : json(404, { message: "Not Found" });
    }
    if (method === "GET" && (m = path.match(/^\/git\/trees\/(\w+)$/))) {
      const t = this.trees.get(m[1]!);
      return t ? json(200, { truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, type: "blob", sha })) }) : json(404, { message: "Not Found" });
    }
    if (method === "GET" && (m = path.match(/^\/git\/blobs\/(\w+)$/))) {
      const b = this.blobs.get(m[1]!);
      return b === undefined ? json(404, { message: "Not Found" }) : json(200, { encoding: "base64", content: btoa(String.fromCharCode(...new TextEncoder().encode(b))) });
    }
    if (method === "POST" && path === "/git/blobs") {
      const s = this.sha("blob");
      this.blobs.set(s, body.content);
      return json(201, { sha: s });
    }
    if (method === "POST" && path === "/git/trees") {
      const base = new Map(this.trees.get(body.base_tree));
      for (const e of body.tree) e.sha === null ? base.delete(e.path) : base.set(e.path, e.sha);
      const s = this.sha("tree");
      this.trees.set(s, base);
      return json(201, { sha: s });
    }
    if (method === "POST" && path === "/git/commits") {
      const s = this.sha("commit");
      this.commits.set(s, { tree: body.tree, parents: body.parents });
      return json(201, { sha: s });
    }
    if (method === "PATCH" && path.startsWith("/git/refs/heads/")) {
      if (!this.commits.get(body.sha)?.parents.includes(this.head)) return json(422, { message: "Update is not a fast forward" });
      this.head = body.sha;
      return json(200, { object: { sha: this.head } });
    }
    return json(404, { message: "Not Found" });
  };
}
