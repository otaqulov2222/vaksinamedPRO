-- P3: sessions + RBAC foundation (additive, non-destructive)

CREATE TABLE IF NOT EXISTS auth_sessions (
  id serial PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  actor_type text NOT NULL,
  actor_id integer NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  device_label text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_sessions_actor_idx ON auth_sessions (actor_type, actor_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_roles (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_permissions (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_role_permissions (
  role_id integer NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
  permission_id integer NOT NULL REFERENCES auth_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_events (
  id serial PRIMARY KEY,
  actor_type text NOT NULL DEFAULT '',
  actor_id integer,
  event_type text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  reason text NOT NULL DEFAULT '',
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_events_created_idx ON auth_events (created_at DESC);
--> statement-breakpoint
INSERT INTO auth_roles (code, name, description) VALUES
  ('super_admin', 'Super Admin', 'HQ global administration'),
  ('cashier', 'Cashier', 'Branch-scoped POS staff')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO auth_permissions (code, description) VALUES
  ('dashboard:read', 'Read HQ dashboard'),
  ('branches:read', 'Read branches including payment config presence'),
  ('branches:manage', 'Update branch settings and payment credentials'),
  ('products:read', 'Read product catalog in admin'),
  ('products:manage', 'Create/update products'),
  ('orders:read', 'Read orders'),
  ('orders:confirm_pos', 'Confirm POS/order fulfillment at branch'),
  ('orders:cancel', 'Cancel orders (admin)'),
  ('customers:read', 'Read customer list'),
  ('payments:read', 'Read payment records'),
  ('payments:manage', 'Manage payment configuration'),
  ('promos:read', 'Read promos/rewards admin'),
  ('ratings:read', 'Read staff ratings'),
  ('audit:read', 'Read audit log'),
  ('pos:lookup', 'POS customer lookup'),
  ('pos:preview', 'POS sale preview'),
  ('pos:sale', 'POS sale confirm'),
  ('pos:void', 'POS sale void'),
  ('pos:sales:read', 'List POS sales'),
  ('delivery:update', 'Update delivery status'),
  ('rbac:manage', 'Manage roles and permissions')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO auth_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM auth_roles r CROSS JOIN auth_permissions p
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO auth_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM auth_roles r
JOIN auth_permissions p ON p.code IN (
  'products:read',
  'orders:read',
  'orders:confirm_pos',
  'pos:lookup',
  'pos:preview',
  'pos:sale',
  'pos:void',
  'pos:sales:read',
  'delivery:update'
)
WHERE r.code = 'cashier'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Normalize legacy role label "admin" → "super_admin" (no privilege expansion beyond HQ)
UPDATE admin_users SET role = 'super_admin' WHERE lower(role) IN ('admin', 'hq');
