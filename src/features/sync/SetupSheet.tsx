import { useState } from "react";
import { GitHubApi, GitHubError } from "../../sync/github";
import type { SyncConfig } from "../../sync/config";
import { Sheet } from "../../ui/Sheet";
import { useSync } from "../../ui/Sync";

const why = (e: unknown) =>
  e instanceof GitHubError
    ? e.kind === "auth" ? "GitHub did not accept that token"
    : e.kind === "notfound" ? "Repo or branch not found. Check the username and repo name"
    : e.kind === "forbidden" ? "The token cannot read that repo. Give it Contents read and write on that repo only"
    : e.kind === "network" ? "Cannot reach GitHub. Check your connection"
    : e.kind === "rate" ? "GitHub rate limit reached. Try again in a minute"
    : e.message
    : "Could not connect";

/** First run on each device, and replacing an expiring token. */
export function SetupSheet({ onClose }: { onClose: () => void }) {
  const { config, connect } = useSync();
  const [owner, setOwner] = useState(config?.owner ?? "");
  const [repo, setRepo] = useState(config?.repo ?? "");
  const [token, setToken] = useState("");
  const [expires, setExpires] = useState(config?.tokenExpires ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    setError("");
    const c: SyncConfig = { owner: owner.trim(), repo: repo.trim(), token: token.trim(), tokenExpires: expires || undefined };
    if (!c.owner || !c.repo || !c.token) return setError("Fill in all three fields");
    setBusy(true);
    try {
      await new GitHubApi(c).getHead(); // can the token read this repo?
      if (!connect(c)) return setError("This browser will not store the token. Allow site data and try again");
      onClose();
    } catch (e) {
      setError(why(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h3>{config ? "Replace token" : "Connect GitHub"}</h3>
      <p className="mute">Once per device. Stays in this browser only.</p>
      <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <label className="field"><b>GitHub username</b><input autoComplete="off" value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
        <label className="field"><b>Data repo</b><input autoComplete="off" spellCheck={false} value={repo} onChange={(e) => setRepo(e.target.value)} /></label>
        <label className="field"><b>Token</b><input type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_..." value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <label className="field"><b>Token expires</b><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>

        <div className="note">
          Anyone with access to this browser profile, or any malicious script running on this page, could use this token to read or change your data repo. Use a fine-grained token for the data repo only, with Contents read and write, and an expiry date.
        </div>

        <details>
          <summary>How to create the token</summary>
          <ol className="steps">
            <li>On github.com open Settings, Developer settings, Personal access tokens, Fine-grained tokens, then Generate new token.</li>
            <li>Resource owner: you. Expiration: a date within one year.</li>
            <li>Repository access: Only select repositories. Choose the data repo only.</li>
            <li>Permissions: Contents, Read and write. Nothing else.</li>
            <li>Generate, copy it once, and paste it above. Enter the same expiry date here.</li>
          </ol>
        </details>

        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? "Verifying…" : "Verify"}</button>
        </div>
      </form>
    </Sheet>
  );
}
