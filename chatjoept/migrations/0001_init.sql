-- ChatJoePT D1 Initial Relational Schema
-- Replaces Cloudflare KV storage with relational SQLite tables

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dialogs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  model TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  source_dialog_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dialogs_user_visible
  ON dialogs (user_id, is_hidden, updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_links (
  share_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_dialog_id TEXT NOT NULL REFERENCES dialogs(id) ON DELETE CASCADE,
  source_dialog_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_links_user
  ON shared_links (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cost_cny REAL NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_user_time
  ON usage_records (user_id, created_at);
