-- Admin login second factor: platform authenticator (Face ID / Windows Hello) + one-time login tickets.
-- Tickets are hashed; the secret is never stored. No biometric image is stored.

CREATE TABLE IF NOT EXISTS admin_webauthn_credentials (
  id serial PRIMARY KEY,
  admin_user_id integer NOT NULL REFERENCES admin_users(id),
  credential_id text NOT NULL,
  public_key text NOT NULL,
  sign_count integer NOT NULL DEFAULT 0,
  transports text NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT admin_webauthn_credentials_credential_id_key UNIQUE (credential_id),
  CONSTRAINT admin_webauthn_credentials_sign_count_nonneg CHECK (sign_count >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_webauthn_credentials_admin_idx
  ON admin_webauthn_credentials (admin_user_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_login_challenges (
  id serial PRIMARY KEY,
  public_id text NOT NULL,
  token_hash text NOT NULL,
  admin_user_id integer NOT NULL REFERENCES admin_users(id),
  purpose text NOT NULL,
  challenge text NOT NULL,
  origin text NOT NULL DEFAULT '',
  rp_id text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_login_challenges_public_id_key UNIQUE (public_id),
  CONSTRAINT admin_login_challenges_token_hash_key UNIQUE (token_hash),
  CONSTRAINT admin_login_challenges_purpose_check CHECK (
    purpose IN ('enroll', 'assert', 'face')
  )
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_login_challenges_admin_idx
  ON admin_login_challenges (admin_user_id, expires_at);
--> statement-breakpoint
