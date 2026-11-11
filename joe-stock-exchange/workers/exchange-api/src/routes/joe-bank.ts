import type { JoeBankLoan, JoeBankSnapshot, LoanStage } from "@joese/contracts";
import type { Env } from "../env";
import { requireUser } from "../lib/auth";
import { HttpError, json, readJson } from "../lib/http";
import { createId } from "../lib/ids";

const DEFAULT_MAX_LOAN_CENTS = 1_000_000;
const DEFAULT_RATE_BPS = 800;
const DEFAULT_MAX_RATE_BPS = 5_000;

function envInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function joeBankPolicy(env: Env): { maxLoanCents: number; defaultRateBps: number; maxRateBps: number } {
  return {
    maxLoanCents: envInteger(env.JOE_BANK_MAX_LOAN_CENTS, DEFAULT_MAX_LOAN_CENTS),
    defaultRateBps: envInteger(env.JOE_BANK_DEFAULT_RATE_BPS, DEFAULT_RATE_BPS),
    maxRateBps: envInteger(env.JOE_BANK_MAX_RATE_BPS, DEFAULT_MAX_RATE_BPS),
  };
}

function memberOnly(role: string): void {
  if (role !== "member") {
    throw new HttpError(403, "MEMBER_ROLE_REQUIRED", "Joe Bank applications are available only to member accounts.");
  }
}

function positiveCents(value: unknown): number {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new HttpError(400, "INVALID_AMOUNT", "Use a positive whole number of cents.");
  }
  return cents;
}

function loanStage(row: Record<string, unknown>): LoanStage {
  if (row.status === "pending") return row.approved_by ? "offered" : "awaiting_review";
  return row.status as Exclude<LoanStage, "awaiting_review" | "offered">;
}

export function mapJoeBankLoan(row: Record<string, unknown>): JoeBankLoan {
  return {
    id: String(row.id),
    principalCents: Number(row.principal_cents),
    outstandingCents: Number(row.outstanding_cents),
    annualRateBps: Number(row.annual_rate_bps),
    rateKind: row.rate_kind as JoeBankLoan["rateKind"],
    status: row.status as JoeBankLoan["status"],
    stage: loanStage(row),
    requestNote: String(row.request_note ?? ""),
    decisionNote: String(row.decision_note ?? ""),
    requestedAt: String(row.requested_at),
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    openedAt: String(row.opened_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function auditStatement(
  env: Env,
  actorId: string,
  action: string,
  targetId: string,
  before: unknown,
  after: unknown,
  requestId: string | null,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_log
      (id, actor_user_id, action, target_type, target_id, before_json, after_json, request_id)
     VALUES (?, ?, ?, 'loan', ?, ?, ?, ?)`,
  ).bind(
    createId("audit"), actorId, action, targetId,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    requestId,
  );
}

async function transition(
  env: Env,
  statements: D1PreparedStatement[],
  code: string,
  message: string,
): Promise<void> {
  try {
    await env.DB.batch(statements);
  } catch {
    throw new HttpError(409, code, message);
  }
}

async function snapshotFor(userId: string, financialStatus: "normal" | "bankrupt", env: Env): Promise<JoeBankSnapshot> {
  const policy = joeBankPolicy(env);
  const rows = await env.DB.prepare(
    "SELECT * FROM loans WHERE user_id = ? ORDER BY requested_at DESC LIMIT 50",
  ).bind(userId).all<Record<string, unknown>>();
  const loans = rows.results.map(mapJoeBankLoan);
  return {
    financialStatus,
    canApply: financialStatus === "bankrupt" && !loans.some((loan) => loan.status === "pending" || loan.status === "active"),
    maxLoanCents: policy.maxLoanCents,
    defaultAnnualRateBps: policy.defaultRateBps,
    disclosure: "Joe Bank loans use a variable annual rate. Daily interest is added once at the 10:00 PM New York close, using the rate and outstanding liability then in effect. Repayments may be made from disposable J$ at any time; no automatic payment or real-world obligation exists.",
    loans,
  };
}

export async function handleJoeBank(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (!url.pathname.startsWith("/v1/joe-bank")) return null;
  const user = await requireUser(request, env);
  memberOnly(user.role);
  const requestId = request.headers.get("x-request-id");

  if (url.pathname === "/v1/joe-bank" && request.method === "GET") {
    return json(await snapshotFor(user.id, user.financialStatus, env));
  }

  if (url.pathname === "/v1/joe-bank/applications" && request.method === "POST") {
    if (user.financialStatus !== "bankrupt") {
      throw new HttpError(403, "BANKRUPTCY_CONFIRMATION_REQUIRED", "An operator must formally confirm bankruptcy before a Joe Bank application can be submitted.");
    }
    const policy = joeBankPolicy(env);
    const body = await readJson<{ amountCents?: number; note?: string }>(request);
    const principalCents = positiveCents(body.amountCents);
    const requestNote = (body.note ?? "").trim();
    if (principalCents > policy.maxLoanCents) {
      throw new HttpError(400, "LOAN_LIMIT_EXCEEDED", `The current Joe Bank application limit is J$${(policy.maxLoanCents / 100).toFixed(2)}.`);
    }
    if (requestNote.length < 10 || requestNote.length > 1_000) {
      throw new HttpError(400, "LOAN_NOTE_REQUIRED", "Explain the request in 10–1,000 characters.");
    }
    const existing = await env.DB.prepare(
      "SELECT id FROM loans WHERE user_id = ? AND status IN ('pending', 'active') LIMIT 1",
    ).bind(user.id).first();
    if (existing) {
      throw new HttpError(409, "OPEN_LOAN_EXISTS", "Finish the existing Joe Bank application or loan before starting another one.");
    }
    const id = createId("loan");
    await transition(env, [
        env.DB.prepare(
          `INSERT INTO state_transition_locks (entity_type, entity_id, version_key, action, actor_id)
           VALUES ('financial_status', ?, ?, 'loan_apply', ?)`,
        ).bind(user.id, String(user.financialStatusVersion), user.id),
        env.DB.prepare(
          `UPDATE users SET financial_status_version = financial_status_version + 1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND financial_status = 'bankrupt' AND financial_status_version = ?`,
        ).bind(user.id, user.financialStatusVersion),
        env.DB.prepare(
          `INSERT INTO loans
            (id, user_id, principal_cents, outstanding_cents, annual_rate_bps, rate_kind,
             status, request_note, requested_at)
           VALUES (?, ?, ?, 0, ?, 'variable', 'pending', ?, CURRENT_TIMESTAMP)`,
        ).bind(id, user.id, principalCents, policy.defaultRateBps, requestNote),
        auditStatement(env, user.id, "loan.apply", id, null, { principalCents, requestNote }, requestId),
      ], "LOAN_APPLICATION_CONFLICT", "The bankruptcy classification or existing loan changed before the application completed.");
    const row = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(id).first<Record<string, unknown>>();
    return json(mapJoeBankLoan(row!), 201);
  }

  const decisionMatch = url.pathname.match(/^\/v1\/joe-bank\/loans\/([^/]+)\/(accept|decline)$/);
  if (decisionMatch && request.method === "POST") {
    const [loanId, action] = [decisionMatch[1], decisionMatch[2]];
    const loan = await env.DB.prepare(
      `SELECT l.*, u.financial_status, u.financial_status_version
         FROM loans l JOIN users u ON u.id = l.user_id
        WHERE l.id = ? AND l.user_id = ? AND l.status = 'pending' LIMIT 1`,
    ).bind(loanId, user.id).first<Record<string, unknown>>();
    if (!loan) throw new HttpError(404, "LOAN_OFFER_NOT_FOUND", "That pending Joe Bank application is unavailable.");
    const version = Number(loan.version);
    if (action === "accept") {
      if (!loan.approved_by) {
        throw new HttpError(409, "LOAN_NOT_OFFERED", "Joe Bank has not offered terms for this application yet.");
      }
      if (user.financialStatus !== "bankrupt") {
        throw new HttpError(409, "BANKRUPTCY_STATUS_CHANGED", "This loan cannot open because the account is no longer classified as bankrupt.");
      }
      const principal = Number(loan.principal_cents);
      await transition(env, [
        env.DB.prepare(
          `INSERT INTO state_transition_locks (entity_type, entity_id, version_key, action, actor_id)
           VALUES ('loan', ?, ?, 'accept', ?)`,
        ).bind(loanId, String(version), user.id),
        env.DB.prepare(
          `INSERT INTO state_transition_locks (entity_type, entity_id, version_key, action, actor_id)
           VALUES ('financial_status', ?, ?, 'loan_accept', ?)`,
        ).bind(user.id, String(loan.financial_status_version), user.id),
        env.DB.prepare(
          `UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?,
                  borrowed_principal_cents = borrowed_principal_cents + ?,
                  financial_status_version = financial_status_version + 1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND financial_status = 'bankrupt' AND financial_status_version = ?`,
        ).bind(principal, principal, user.id, Number(loan.financial_status_version)),
        env.DB.prepare(
          `UPDATE loans SET status = 'active', outstanding_cents = principal_cents,
                  opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE id = ? AND status = 'pending' AND version = ?`,
        ).bind(loanId, version),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, reference_type, reference_id, metadata_json)
           VALUES (?, ?, 'loan_disbursement', ?,
             (SELECT disposable_balance_cents FROM users WHERE id = ?), 'loan', ?, ?)`,
        ).bind(createId("led"), user.id, principal, user.id, loanId, JSON.stringify({ annualRateBps: Number(loan.annual_rate_bps), rateKind: "variable" })),
        auditStatement(env, user.id, "loan.accept", loanId, mapJoeBankLoan(loan), { status: "active", outstandingCents: principal }, requestId),
      ], "LOAN_ALREADY_RESOLVED", "The Joe Bank offer changed or was already resolved.");
    } else {
      await transition(env, [
        env.DB.prepare(
          `INSERT INTO state_transition_locks (entity_type, entity_id, version_key, action, actor_id)
           VALUES ('loan', ?, ?, 'member_decline', ?)`,
        ).bind(loanId, String(version), user.id),
        env.DB.prepare(
          `UPDATE loans SET status = 'declined', closed_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE id = ? AND status = 'pending' AND version = ?`,
        ).bind(loanId, version),
        auditStatement(env, user.id, "loan.member_decline", loanId, mapJoeBankLoan(loan), { status: "declined" }, requestId),
      ], "LOAN_ALREADY_RESOLVED", "The Joe Bank application changed or was already resolved.");
    }
    return json({ id: loanId, status: action === "accept" ? "active" : "declined" });
  }

  const repayMatch = url.pathname.match(/^\/v1\/joe-bank\/loans\/([^/]+)\/repay$/);
  if (repayMatch && request.method === "POST") {
    const body = await readJson<{ amountCents?: number }>(request);
    const amountCents = positiveCents(body.amountCents);
    const loan = await env.DB.prepare(
      "SELECT * FROM loans WHERE id = ? AND user_id = ? AND status = 'active' LIMIT 1",
    ).bind(repayMatch[1], user.id).first<Record<string, unknown>>();
    if (!loan) throw new HttpError(404, "ACTIVE_LOAN_NOT_FOUND", "That active Joe Bank loan was not found.");
    const outstanding = Number(loan.outstanding_cents);
    if (amountCents > outstanding) throw new HttpError(400, "REPAYMENT_TOO_LARGE", "A repayment cannot exceed the current outstanding liability.");
    if (amountCents > user.disposableBalanceCents) throw new HttpError(409, "INSUFFICIENT_BALANCE", "Disposable balance is too low for that repayment.");
    const version = Number(loan.version);
    const repaymentId = createId("repay");
    const remaining = outstanding - amountCents;
    await transition(env, [
      env.DB.prepare(
        `INSERT INTO state_transition_locks (entity_type, entity_id, version_key, action, actor_id)
         VALUES ('loan', ?, ?, 'repay', ?)`,
      ).bind(String(loan.id), String(version), user.id),
      env.DB.prepare(
        `UPDATE users SET disposable_balance_cents = disposable_balance_cents - ?,
                borrowed_principal_cents = borrowed_principal_cents - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(amountCents, amountCents, user.id),
      env.DB.prepare(
        `UPDATE loans SET outstanding_cents = outstanding_cents - ?,
                status = CASE WHEN outstanding_cents - ? = 0 THEN 'repaid' ELSE status END,
                closed_at = CASE WHEN outstanding_cents - ? = 0 THEN CURRENT_TIMESTAMP ELSE closed_at END,
                updated_at = CURRENT_TIMESTAMP, version = version + 1
          WHERE id = ? AND status = 'active' AND version = ?`,
      ).bind(amountCents, amountCents, amountCents, String(loan.id), version),
      env.DB.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents, reference_type, reference_id, metadata_json)
         VALUES (?, ?, 'loan_repayment', ?,
           (SELECT disposable_balance_cents FROM users WHERE id = ?), 'loan_repayment', ?, ?)`,
      ).bind(createId("led"), user.id, -amountCents, user.id, repaymentId, JSON.stringify({ loanId: loan.id, remainingOutstandingCents: remaining })),
      auditStatement(env, user.id, "loan.repay", String(loan.id), { outstandingCents: outstanding }, { amountCents, outstandingCents: remaining }, requestId),
    ], "LOAN_REPAYMENT_CONFLICT", "The balance or Joe Bank liability changed before the repayment completed.");
    return json({ id: String(loan.id), amountCents, outstandingCents: remaining, status: remaining === 0 ? "repaid" : "active" });
  }

  return null;
}
