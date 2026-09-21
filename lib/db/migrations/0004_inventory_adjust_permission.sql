-- P4.7: inventory:adjust permission (HQ only; cashiers must not inherit)
INSERT INTO auth_permissions (code, description) VALUES
  ('inventory:adjust', 'Adjust branch physical inventory with audit trail')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO auth_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM auth_roles r
JOIN auth_permissions p ON p.code = 'inventory:adjust'
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;
