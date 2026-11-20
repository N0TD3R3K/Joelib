-- Add SHA-256 content_hash to user_files for deduplication & reference counting
ALTER TABLE user_files ADD COLUMN content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_user_files_hash
  ON user_files (user_id, purpose, content_hash);
