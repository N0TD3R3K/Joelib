import { formatJoellars } from "@joese/ui";
import { Search, UsersRound } from "lucide-react";

export function MemberManagement({ members }: { members: Record<string, unknown>[] }) {
  return <section className="console-card members"><div className="form-title"><div><span className="eyebrow">ACCOUNTS</span><h2>Member management</h2><p>One school-email-verified account per person.</p></div><UsersRound size={21} /></div><label className="console-search wide"><Search size={15}/><input placeholder="Search username or school email" /></label><div className="member-table"><div><span>Member</span><span>Role</span><span>Disposable</span><span>Borrowed</span><span>Financial</span><span>Status</span></div>{members.map((member) => <div key={String(member.id)}><strong>{String(member.username)}<small>{String(member.email)}</small></strong><span>{String(member.role)}</span><span>{formatJoellars(Number(member.disposable_balance_cents ?? 0))}</span><span>{formatJoellars(Number(member.borrowed_principal_cents ?? 0))}</span><span className={`status-tag ${String(member.financial_status ?? "normal")}`}>{String(member.financial_status ?? "normal")}</span><span className={`status-tag ${String(member.status)}`}>{String(member.status)}</span></div>)}</div></section>;
}

