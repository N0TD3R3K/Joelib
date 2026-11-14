-- Track files uploaded to DeepSeek Files API (object storage) per account
-- Used to enforce the 128 MiB active accumulated storage cap and free orphaned files

CREATE TABLE IF NOT EXISTS user_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  purpose TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_files_user
  ON user_files (user_id, created_at DESC);
