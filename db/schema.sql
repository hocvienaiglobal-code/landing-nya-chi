BEGIN;

CREATE TABLE IF NOT EXISTS registrations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(10) NOT NULL,
  email VARCHAR(254) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT registrations_phone_format CHECK (phone ~ '^0(3|5|7|8|9)[0-9]{8}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_phone_unique
  ON registrations (phone);

CREATE INDEX IF NOT EXISTS registrations_created_at_idx
  ON registrations (created_at DESC);

CREATE TABLE IF NOT EXISTS registration_rate_limits (
  key_hash CHAR(64) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0)
);

CREATE INDEX IF NOT EXISTS registration_rate_limits_window_idx
  ON registration_rate_limits (window_started_at);

COMMIT;
