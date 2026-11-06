-- Admin settings write + upcoming cashback/ratings moderation permissions (HQ only)
INSERT INTO auth_permissions (code, description) VALUES
  ('settings:manage', 'Update HQ system settings (cashback spend ratio)'),
  ('customers:manage', 'Manual cashback adjustments for customers'),
  ('ratings:moderate', 'Hide or restore customer branch ratings')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO auth_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM auth_roles r
JOIN auth_permissions p ON p.code IN ('settings:manage', 'customers:manage', 'ratings:moderate')
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;
