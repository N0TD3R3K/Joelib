import { dailyLoanInterestCents } from "@joese/market-rules";

interface ActiveLoanRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  outstanding_cents: number;
  annual_rate_bps: number;
  version: number;
}

export interface LoanInterestBatch {
  statements: D1PreparedStatement[];
  loanCount: number;
  totalInterestCents: number;
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function loanInterestStatements(db: D1Database, marketDate: string): Promise<LoanInterestBatch> {
  const active = await db.prepare(
    "SELECT id, user_id, outstanding_cents, annual_rate_bps, version FROM loans WHERE status = 'active' ORDER BY id",
  ).all<ActiveLoanRow>();
  const statements: D1PreparedStatement[] = [];
  let totalInterestCents = 0;

  for (const loan of active.results) {
    const opening = Number(loan.outstanding_cents);
    const annualRateBps = Number(loan.annual_rate_bps);
    const interest = dailyLoanInterestCents(opening, annualRateBps);
    const closing = opening + interest;
    totalInterestCents += interest;
    const accrualId = id("interest");
    const referenceId = `${loan.id}:${marketDate}`;
    statements.push(
      db.prepare(
        `INSERT INTO state_transition_locks (entity_type, entity_id, version_key, action)
         VALUES ('loan', ?, ?, ?)`,
      ).bind(loan.id, String(loan.version), `interest:${marketDate}`),
      db.prepare(
        `INSERT INTO loan_interest_accruals
          (id, loan_id, user_id, market_date, opening_outstanding_cents,
           annual_rate_bps, interest_cents, closing_outstanding_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(accrualId, loan.id, loan.user_id, marketDate, opening, annualRateBps, interest, closing),
      db.prepare(
        `UPDATE loans SET outstanding_cents = outstanding_cents + ?,
                updated_at = CURRENT_TIMESTAMP, version = version + 1
          WHERE id = ? AND status = 'active' AND version = ?`,
      ).bind(interest, loan.id, loan.version),
      db.prepare(
        `UPDATE users SET borrowed_principal_cents = borrowed_principal_cents + ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(interest, loan.user_id),
      db.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents,
           reference_type, reference_id, metadata_json)
         VALUES (?, ?, 'loan_interest', 0,
           (SELECT disposable_balance_cents FROM users WHERE id = ?),
           'loan_interest', ?, ?)`,
      ).bind(
        id("led"), loan.user_id, loan.user_id, referenceId,
        JSON.stringify({ loanId: loan.id, marketDate, annualRateBps, interestCents: interest, outstandingCents: closing }),
      ),
      db.prepare(
        `INSERT INTO audit_log
          (id, actor_user_id, action, target_type, target_id, before_json, after_json)
         VALUES (?, NULL, 'loan.interest_accrue', 'loan', ?, ?, ?)`,
      ).bind(
        id("audit"), loan.id,
        JSON.stringify({ outstandingCents: opening, annualRateBps }),
        JSON.stringify({ interestCents: interest, outstandingCents: closing, marketDate }),
      ),
    );
  }

  return { statements, loanCount: active.results.length, totalInterestCents };
}

