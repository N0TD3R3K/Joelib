CREATE TABLE state_transition_locks (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version_key TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id, version_key)
);

CREATE INDEX idx_state_transition_time
  ON state_transition_locks(created_at DESC);
