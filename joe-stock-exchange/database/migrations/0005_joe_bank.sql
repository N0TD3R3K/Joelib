ALTER TABLE users
  ADD COLUMN financial_status TEXT NOT NULL DEFAULT 'normal'
  CHECK (financial_status IN ('normal', 'bankrupt'));

ALTER TABLE users
  ADD COLUMN financial_status_version INTEGER NOT NULL DEFAULT 0
  CHECK (financial_status_version >= 0);

ALTER TABLE loans
  ADD COLUMN request_note TEXT NOT NULL DEFAULT '';

ALTER TABLE loans
  ADD COLUMN decision_note TEXT NOT NULL DEFAULT '';

ALTER TABLE loans
  ADD COLUMN requested_at TEXT NOT NULL DEFAULT '';

ALTER TABLE loans
  ADD COLUMN decided_at TEXT;

ALTER TABLE loans
  ADD COLUMN closed_at TEXT;

ALTER TABLE loans
  ADD COLUMN version INTEGER NOT NULL DEFAULT 0
  CHECK (version >= 0);

CREATE UNIQUE INDEX idx_loans_one_open_per_member
  ON loans(user_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX idx_loans_status_requested
  ON loans(status, requested_at DESC);

CREATE TABLE loan_interest_accruals (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  market_date TEXT NOT NULL,
  opening_outstanding_cents INTEGER NOT NULL CHECK (opening_outstanding_cents >= 0),
  annual_rate_bps INTEGER NOT NULL CHECK (annual_rate_bps >= 0),
  interest_cents INTEGER NOT NULL CHECK (interest_cents >= 0),
  closing_outstanding_cents INTEGER NOT NULL CHECK (closing_outstanding_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (loan_id, market_date)
);

CREATE INDEX idx_loan_interest_user_time
  ON loan_interest_accruals(user_id, market_date DESC);

UPDATE loans
   SET requested_at = opened_at
 WHERE requested_at = '';
