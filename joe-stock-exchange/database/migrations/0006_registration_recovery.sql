ALTER TABLE users
  ADD COLUMN registration_invitation_id TEXT REFERENCES invitation_codes(id);

CREATE TABLE transactional_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT UNIQUE,
  internet_message_id TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('verification', 'password_reset', 'unknown')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'accepted', 'delayed', 'delivered', 'bounced', 'suppressed', 'complained', 'failed'
  )),
  status_detail TEXT,
  last_event_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactional_emails_user_time
  ON transactional_emails(user_id, purpose, created_at DESC);

CREATE INDEX idx_transactional_emails_status_time
  ON transactional_emails(status, updated_at DESC);

CREATE TABLE auth_rate_limits (
  action TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (action, subject_hash, window_start)
);

CREATE INDEX idx_auth_rate_limits_window
  ON auth_rate_limits(window_start);
