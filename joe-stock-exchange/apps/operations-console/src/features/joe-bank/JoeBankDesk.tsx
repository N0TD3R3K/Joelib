import type { ConsoleLoan, FinancialStatus } from "@joese/contracts";
import { formatJoellars } from "@joese/ui";
import { CheckCircle2, Landmark, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

type LoanAction = { action: "offer" | "decline" | "set_rate"; annualRateBps?: number; note: string };

interface Props {
  loans: ConsoleLoan[];
  members: Record<string, unknown>[];
  onFinancialStatus: (id: string, status: FinancialStatus, reason: string) => Promise<void>;
  onLoanAction: (id: string, input: LoanAction) => Promise<void>;
}

export function JoeBankDesk({ loans, members, onFinancialStatus, onLoanAction }: Props) {
  const memberRows = useMemo(() => members.filter((member) => member.role === "member"), [members]);
  return <div className="bank-desk">
    <section className="console-card bank-overview"><div className="form-title"><div><span className="eyebrow">RECOVERY LENDING</span><h2>Joe Bank</h2><p>Confirm bankruptcy, offer disclosed variable terms, and audit every liability change.</p></div><Landmark size={22}/></div><div className="bank-kpis"><div><span>Awaiting review</span><strong>{loans.filter((loan) => loan.stage === "awaiting_review").length}</strong></div><div><span>Terms offered</span><strong>{loans.filter((loan) => loan.stage === "offered").length}</strong></div><div><span>Active loans</span><strong>{loans.filter((loan) => loan.stage === "active").length}</strong></div><div><span>Outstanding</span><strong>{formatJoellars(loans.reduce((sum, loan) => sum + (loan.stage === "active" ? loan.outstandingCents : 0), 0))}</strong></div></div></section>
    <section className="console-card bank-queue"><div className="form-title"><div><span className="eyebrow">APPLICATIONS & LIABILITIES</span><h2>Loan desk</h2></div><CheckCircle2 size={20}/></div>{loans.length === 0 ? <div className="console-empty">No Joe Bank records yet.</div> : <div className="loan-list">{loans.map((loan) => <LoanRow key={loan.id} loan={loan} onAction={onLoanAction}/>)}</div>}</section>
    <section className="console-card bank-classification"><div className="form-title"><div><span className="eyebrow">OPERATOR CONFIRMATION</span><h2>Financial classification</h2><p>A low balance never changes this status automatically.</p></div><ShieldAlert size={20}/></div><div className="classification-list">{memberRows.map((member) => <ClassificationRow key={String(member.id)} member={member} onChange={onFinancialStatus}/>)}</div></section>
  </div>;
}

function LoanRow({ loan, onAction }: { loan: ConsoleLoan; onAction: Props["onLoanAction"] }) {
  const [rate, setRate] = useState((loan.annualRateBps / 100).toFixed(2));
  const [note, setNote] = useState(loan.decisionNote || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rateBps = Math.round(Number(rate) * 100);
  const act = async (input: LoanAction) => { setBusy(true); setError(""); try { await onAction(loan.id, input); } catch (reason) { setError(reason instanceof Error ? reason.message : "Loan update failed"); } finally { setBusy(false); } };
  return <article className="loan-row"><header><div><strong>{loan.username}</strong><span>{loan.email}</span></div><b className={`status-tag ${loan.stage}`}>{loan.stage.replaceAll("_", " ")}</b></header><div className="loan-facts"><div><span>Requested</span><strong>{formatJoellars(loan.principalCents)}</strong></div><div><span>Outstanding</span><strong>{formatJoellars(loan.outstandingCents)}</strong></div><div><span>Variable APR</span><strong>{(loan.annualRateBps / 100).toFixed(2)}%</strong></div><div><span>Classification</span><strong>{loan.financialStatus}</strong></div></div><p>{loan.requestNote}</p>{(loan.stage === "awaiting_review" || loan.stage === "offered" || loan.stage === "active") && <div className="loan-controls"><label><span>{loan.stage === "active" ? "New APR" : "Offered APR"}</span><div><input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal"/><b>%</b></div></label><label className="loan-note"><span>Decision note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason shown in the audit trail"/></label><div className="loan-buttons">{loan.stage !== "active" && <button disabled={busy || note.trim().length < 5} onClick={() => void act({ action: "decline", note })}>Decline</button>}<button className="primary" disabled={busy || note.trim().length < 5 || !Number.isSafeInteger(rateBps) || rateBps < 0} onClick={() => void act({ action: loan.stage === "active" ? "set_rate" : "offer", annualRateBps: rateBps, note })}>{loan.stage === "active" ? "Update rate" : loan.stage === "offered" ? "Revise offer" : "Offer terms"}</button></div></div>}{error && <div className="console-inline-error">{error}</div>}</article>;
}

function ClassificationRow({ member, onChange }: { member: Record<string, unknown>; onChange: Props["onFinancialStatus"] }) {
  const current = (member.financial_status === "bankrupt" ? "bankrupt" : "normal") as FinancialStatus;
  const next: FinancialStatus = current === "normal" ? "bankrupt" : "normal";
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <article><div className="classification-person"><strong>{String(member.username)}</strong><span>{String(member.email)}</span></div><b className={`status-tag ${current}`}>{current}</b><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={`Reason for marking ${next}`}/><button disabled={busy || reason.trim().length < 10} onClick={async () => { setBusy(true); setError(""); try { await onChange(String(member.id), next, reason); } catch (cause) { setError(cause instanceof Error ? cause.message : "Classification failed"); } finally { setBusy(false); } }}>{busy ? "Saving…" : `Mark ${next}`}</button>{error && <small>{error}</small>}</article>;
}
