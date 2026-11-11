ALTER TABLE orders
  ADD COLUMN reserved_cash_cents INTEGER NOT NULL DEFAULT 0
  CHECK (reserved_cash_cents >= 0);

ALTER TABLE trades
  ADD COLUMN buyer_price_cents INTEGER NOT NULL DEFAULT 0
  CHECK (buyer_price_cents >= 0);

ALTER TABLE trades
  ADD COLUMN seller_price_cents INTEGER NOT NULL DEFAULT 0
  CHECK (seller_price_cents >= 0);

ALTER TABLE trades
  ADD COLUMN spread_cents INTEGER NOT NULL DEFAULT 0
  CHECK (spread_cents >= 0);

CREATE INDEX idx_orders_matching
  ON orders(asset_id, status, side, limit_price_cents, created_at);

CREATE UNIQUE INDEX idx_ledger_reference_once
  ON ledger_entries(user_id, entry_type, reference_type, reference_id);

CREATE UNIQUE INDEX idx_users_username_lower
  ON users(lower(username));

CREATE TABLE system_locks (
  lock_key TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER invitation_use_limit
BEFORE UPDATE OF used_count ON invitation_codes
WHEN NEW.used_count > NEW.max_uses
BEGIN
  SELECT RAISE(ABORT, 'invitation use limit exceeded');
END;

CREATE TRIGGER holdings_quantities_valid_insert
BEFORE INSERT ON holdings
WHEN NEW.frozen_quantity + NEW.reserved_quantity > NEW.quantity
BEGIN
  SELECT RAISE(ABORT, 'holding reservations exceed quantity');
END;

CREATE TRIGGER holdings_quantities_valid_update
BEFORE UPDATE OF quantity, frozen_quantity, reserved_quantity ON holdings
WHEN NEW.frozen_quantity + NEW.reserved_quantity > NEW.quantity
BEGIN
  SELECT RAISE(ABORT, 'holding reservations exceed quantity');
END;
