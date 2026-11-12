import type { CreatedInvitation } from "../../api";
import { Check, Copy, TicketCheck } from "lucide-react";
import { useState } from "react";

function defaultExpiry(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function InvitationManager({ onCreate }: { onCreate: (input: { maxUses: number; expiresAt?: string }) => Promise<CreatedInvitation> }) {
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uses = Number(maxUses);
  const valid = Number.isSafeInteger(uses) && uses >= 1 && uses <= 100;

  const create = async () => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const invitation = await onCreate({
        maxUses: uses,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });
      setCreated(invitation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.code);
    setCopied(true);
  };

  return <section className="console-card invitation-manager">
    <div className="form-title"><div><span className="eyebrow">CLOSED BETA</span><h2>Create an invitation</h2><p>Issue a limited-use code for approved school-email registration.</p></div><TicketCheck size={21}/></div>
    <div className="invitation-form">
      <label><span>Maximum registrations</span><input type="number" min="1" max="100" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} /></label>
      <label><span>Expires at <small>(optional)</small></span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <button disabled={busy || !valid} onClick={() => void create()}>{busy ? "Creating…" : "Create invitation"}</button>
    </div>
    {error && <div className="console-inline-error">{error}</div>}
    {created && <div className="invitation-result">
      <div><span className="eyebrow">SHOWN ONCE</span><strong>Copy this code before leaving the page.</strong><small>{created.maxUses} use{created.maxUses === 1 ? "" : "s"}{created.expiresAt ? ` · expires ${new Date(created.expiresAt).toLocaleString()}` : " · no expiration"}</small></div>
      <div className="invitation-code"><code>{created.code}</code><button onClick={() => void copy()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? "Copied" : "Copy"}</button></div>
    </div>}
    <p className="invitation-note">Only administrators can create invitations. Recipients must still verify an approved school email, and each person may hold only one account.</p>
  </section>;
}
