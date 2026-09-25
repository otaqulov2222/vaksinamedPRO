import { eq } from "drizzle-orm";
import { authPermissions, authRolePermissions, authRoles, db, type AdminUser } from "@workspace/db";
import { isHqAdminRole, normalizeAdminRole } from "./securityEnv";
import { recordAuthEvent } from "./authEvents";

export { normalizeAdminRole };

const permissionCache = new Map<string, { at: number; codes: Set<string> }>();
const CACHE_MS = 5_000;

/** Known permission sets when auth_role_permissions is missing or empty (seed drift). */
function fallbackPermissionsForRole(role: string): Set<string> {
  return isHqAdminRole(role)
    ? new Set([
      "dashboard:read",
      "branches:read",
      "branches:manage",
      "products:read",
      "products:manage",
      "orders:read",
      "orders:confirm_pos",
      "orders:cancel",
      "customers:read",
      "payments:read",
      "payments:manage",
      "promos:read",
      "ratings:read",
      "audit:read",
      "pos:lookup",
      "pos:preview",
      "pos:sale",
      "pos:void",
      "pos:sales:read",
      "delivery:update",
      "inventory:adjust",
      "rbac:manage",
    ])
    : new Set([
      "products:read",
      "orders:read",
      "orders:confirm_pos",
      "pos:lookup",
      "pos:preview",
      "pos:sale",
      "pos:void",
      "pos:sales:read",
      "delivery:update",
    ]);
}

export async function getPermissionsForRole(roleRaw: string): Promise<Set<string>> {
  const role = normalizeAdminRole(roleRaw);
  const cached = permissionCache.get(role);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.codes;

  const roleRows = await db.select().from(authRoles).where(eq(authRoles.code, role)).limit(1);
  if (!roleRows[0]) {
    const fallback = fallbackPermissionsForRole(role);
    permissionCache.set(role, { at: Date.now(), codes: fallback });
    return fallback;
  }

  const links = await db
    .select({ code: authPermissions.code })
    .from(authRolePermissions)
    .innerJoin(authPermissions, eq(authRolePermissions.permissionId, authPermissions.id))
    .where(eq(authRolePermissions.roleId, roleRows[0].id));

  // Empty links = seed drift (role row without grants). Same fallback as missing role.
  // Does not invent new permission codes — reuses known operational sets.
  const codes = links.length
    ? new Set(links.map((l) => l.code))
    : fallbackPermissionsForRole(role);
  permissionCache.set(role, { at: Date.now(), codes });
  return codes;
}

/** Clear RBAC cache after role/permission mutations (tests / future rbac:manage). */
export function clearPermissionCache(): void {
  permissionCache.clear();
}

export async function adminHasPermission(user: AdminUser, permission: string): Promise<boolean> {
  const perms = await getPermissionsForRole(user.role);
  return perms.has(permission);
}

export async function requirePermission(user: AdminUser, permission: string): Promise<void> {
  if (await adminHasPermission(user, permission)) return;
  await recordAuthEvent({
    actorType: "admin",
    actorId: user.id,
    eventType: "authz.denied",
    success: false,
    reason: "missing_permission",
    meta: { permission, role: normalizeAdminRole(user.role) },
  });
  throw Object.assign(new Error("Bu amal uchun ruxsat yo‘q"), { status: 403 });
}

/**
 * Branch isolation for staff-scoped resources.
 * HQ (super_admin / legacy admin) may access any branch.
 * Cashiers must match their assigned branchId.
 */
export async function assertBranchScope(
  user: AdminUser,
  resourceBranchId: number | null | undefined,
  opts?: { allowNullResource?: boolean },
): Promise<void> {
  if (isHqAdminRole(user.role)) return;
  if (resourceBranchId == null || !Number.isFinite(resourceBranchId)) {
    if (opts?.allowNullResource) return;
    await recordAuthEvent({
      actorType: "admin",
      actorId: user.id,
      eventType: "authz.denied",
      success: false,
      reason: "branch_required",
    });
    throw Object.assign(new Error("Bu filial uchun ruxsat yo‘q"), { status: 403 });
  }
  if (!user.branchId || user.branchId !== resourceBranchId) {
    await recordAuthEvent({
      actorType: "admin",
      actorId: user.id,
      eventType: "authz.denied",
      success: false,
      reason: "branch_mismatch",
      meta: { resourceBranchId },
    });
    throw Object.assign(new Error("Bu filial uchun ruxsat yo‘q"), { status: 403 });
  }
}

/** Resolve branch filter for list endpoints: cashiers forced to own branch. */
export function resolveStaffBranchFilter(
  user: AdminUser,
  requestedBranchId: number | undefined,
): number | undefined {
  if (isHqAdminRole(user.role)) {
    return requestedBranchId && Number.isFinite(requestedBranchId) ? requestedBranchId : undefined;
  }
  if (!user.branchId) {
    throw Object.assign(new Error("Bu filial uchun ruxsat yo‘q"), { status: 403 });
  }
  if (requestedBranchId && requestedBranchId !== user.branchId) {
    throw Object.assign(new Error("Bu filial uchun ruxsat yo‘q"), { status: 403 });
  }
  return user.branchId;
}
