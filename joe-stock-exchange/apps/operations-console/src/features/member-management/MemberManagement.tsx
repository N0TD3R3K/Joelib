import { formatJoellars } from "@joese/ui";
import { MailCheck, Search, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
  members: Record<string, unknown>[];
  onResend: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}

export function MemberManagement({ members, onResend, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => `${String(member.username)} ${String(member.email)}`.toLowerCase().includes(normalized));
  }, [members, query]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The account action failed."); }
    finally { setBusy(""); }
  };

  return <section className="console-card members">
    <div className="form-title"><div><span className="eyebrow">ACCOUNTS</span><h2>Member management</h2><p>One school-email-verified account per person.</p></div><UsersRound size={21} /></div>
    <label className="console-search wide"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username or school email" /></label>
    {error && <div className="console-inline-error member-action-error">{error}</div>}
    <div className="member-table">
      <div><span>Member</span><span>Role</span><span>Disposable</span><span>Borrowed</span><span>Financial</span><span>Status</span><span>Verification</span><span>Actions</span></div>
      {filtered.map((member) => {
        const id = String(member.id);
        const pending = member.status === "pending_verification" && member.role === "member";
        const emailStatus = member.verification_email_status == null ? "not tracked" : String(member.verification_email_status);
        return <div key={id}>
          <strong>{String(member.username)}<small>{String(member.email)}</small></strong>
          <span>{String(member.role)}</span>
          <span>{formatJoellars(Number(member.disposable_balance_cents ?? 0))}</span>
          <span>{formatJoellars(Number(member.borrowed_principal_cents ?? 0))}</span>
          <span className={`status-tag ${String(member.financial_status ?? "normal")}`}>{String(member.financial_status ?? "normal")}</span>
          <span className={`status-tag ${String(member.status)}`}>{String(member.status)}</span>
          <span className={`status-tag ${emailStatus}`}>{emailStatus}</span>
          <span className="member-actions">{pending ? <>
            <button title="Send a fresh verification link" disabled={Boolean(busy)} onClick={() => void run(`${id}:resend`, () => onResend(id))}><MailCheck size={13}/>{busy === `${id}:resend` ? "Sending…" : "Resend"}</button>
            <button className="danger" title="Cancel this unverified registration" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Cancel the pending registration for ${String(member.email)}?`)) void run(`${id}:cancel`, () => onCancel(id)); }}><Trash2 size={13}/>{busy === `${id}:cancel` ? "Cancelling…" : "Cancel"}</button>
          </> : <small>—</small>}</span>
        </div>;
      })}
    </div>
  </section>;
}

