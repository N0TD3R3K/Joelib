PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'operator', 'administrator')),
  status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'active', 'suspended', 'closed')),
  disposable_balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (disposable_balance_cents >= 0),
  borrowed_principal_cents INTEGER NOT NULL DEFAULT 0 CHECK (borrowed_principal_cents >= 0),
  preferences_json TEXT NOT NULL DEFAULT '{"growthColor":"#38d39f","fallColor":"#ff6577","compactNumbers":false}',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invitation_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TEXT,
  revoked_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'crypto')),
  description TEXT NOT NULL,
  company_details_json TEXT NOT NULL DEFAULT '{}',
  developer_user_id TEXT REFERENCES users(id),
  current_price_cents INTEGER NOT NULL CHECK (current_price_cents >= 0),
  open_price_cents INTEGER NOT NULL CHECK (open_price_cents >= 0),
  high_price_cents INTEGER NOT NULL CHECK (high_price_cents >= 0),
  low_price_cents INTEGER NOT NULL CHECK (low_price_cents >= 0),
  close_price_cents INTEGER NOT NULL CHECK (close_price_cents >= 0),
  previous_close_cents INTEGER NOT NULL CHECK (previous_close_cents >= 0),
  ordinary_drift REAL NOT NULL DEFAULT 0,
  volatility REAL NOT NULL DEFAULT 0.02 CHECK (volatility >= 0),
  hourly_cap REAL NOT NULL CHECK (hourly_cap > 0),
  daily_cap REAL NOT NULL CHECK (daily_cap > 0),
  below_one_close_count INTEGER NOT NULL DEFAULT 0 CHECK (below_one_close_count >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE price_points (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  recorded_at TEXT NOT NULL,
  tick_id TEXT,
  UNIQUE (asset_id, recorded_at)
);

CREATE TABLE holdings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  holding_kind TEXT NOT NULL CHECK (holding_kind IN ('shareholding', 'stock', 'crypto')),
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  frozen_quantity REAL NOT NULL DEFAULT 0 CHECK (frozen_quantity >= 0),
  reserved_quantity REAL NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  average_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (average_cost_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, asset_id, holding_kind)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  remaining_quantity REAL NOT NULL CHECK (remaining_quantity >= 0),
  limit_price_cents INTEGER NOT NULL CHECK (limit_price_cents > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled', 'expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  buy_order_id TEXT REFERENCES orders(id),
  sell_order_id TEXT REFERENCES orders(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  buyer_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (buyer_fee_cents >= 0),
  seller_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (seller_fee_cents >= 0),
  executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cash_transfers (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id),
  receiver_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE share_offers (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  asking_price_cents INTEGER NOT NULL CHECK (asking_price_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  principal_cents INTEGER NOT NULL CHECK (principal_cents > 0),
  outstanding_cents INTEGER NOT NULL CHECK (outstanding_cents >= 0),
  annual_rate_bps INTEGER NOT NULL CHECK (annual_rate_bps >= 0),
  rate_kind TEXT NOT NULL DEFAULT 'variable' CHECK (rate_kind IN ('fixed', 'variable')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'repaid', 'defaulted', 'declined')),
  approved_by TEXT REFERENCES users(id),
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE news_events (
  id TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  article TEXT NOT NULL,
  category TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('bullish', 'bearish', 'mixed', 'uncertain')),
  severity TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'major')),
  affected_tickers_json TEXT NOT NULL DEFAULT '[]',
  duration_ticks INTEGER NOT NULL DEFAULT 1 CHECK (duration_ticks BETWEEN 1 AND 3),
  author_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  publish_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'flagged')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_ticks (
  id TEXT PRIMARY KEY,
  tick_key TEXT NOT NULL UNIQUE,
  market_date TEXT NOT NULL,
  market_hour INTEGER NOT NULL CHECK (market_hour BETWEEN 14 AND 22),
  market_mood REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'failed')),
  explanation_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  entry_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  balance_after_cents INTEGER,
  asset_id TEXT REFERENCES assets(id),
  quantity REAL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_token ON sessions(token_hash, expires_at);
CREATE INDEX idx_price_points_asset_time ON price_points(asset_id, recorded_at DESC);
CREATE INDEX idx_holdings_user_kind ON holdings(user_id, holding_kind);
CREATE INDEX idx_orders_asset_status ON orders(asset_id, status, side, limit_price_cents, created_at);
CREATE INDEX idx_transfers_receiver_status ON cash_transfers(receiver_id, status, created_at DESC);
CREATE INDEX idx_share_offers_buyer_status ON share_offers(buyer_id, status, created_at DESC);
CREATE INDEX idx_news_status_publish ON news_events(status, publish_at DESC);
CREATE INDEX idx_comments_asset_status ON comments(asset_id, status, created_at DESC);
CREATE INDEX idx_ledger_user_time ON ledger_entries(user_id, created_at DESC);
CREATE INDEX idx_audit_time ON audit_log(created_at DESC);

