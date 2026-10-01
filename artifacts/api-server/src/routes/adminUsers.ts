/**
 * Phase 13.16 — admin management + read-only RBAC control plane.
 * Every endpoint: requireAdmin (session → admin → status) + requirePermission("rbac:manage").
 * Mutations run in one transaction with their audit row; no hard delete (disable instead).
 */
import { Router, type Request } from "express";
import { and, count, desc, eq, gt, ilike, inArray, isNull, max, ne, or, sql, type SQL } from "drizzle-orm";
import {
  adminUsers,
  auditLog,
  authPermissions,
  authRolePermissions,
  authRoles,
  authSessions,
  branches,
  db,
  hashPassword,
  type AdminUser,
} from "@workspace/db";
import { requireAdmin } from "../lib/auth";
import { assertBranchScope, fallbackPermissionsForRole, getPermissionsForRole, requirePermission, resolveStaffBranchFilter } from "../lib/rbac";
import { isHqAdminRole, normalizeAdminRole } from "../lib/securityEnv";
import { recordAuthEvent } from "../lib/authEvents";
import { sanitizeAdminOrderSearch } from "../lib/adminOrderOps";
import { isUniqueViolation } from "../lib/adminBranches";
import {
  ADMIN_MUTATION_LOCK_KEY,
  ADMIN_USERS_DEFAULT_LIMIT,
  ADMIN_USERS_MAX_LIMIT,
  adminBranchInvalidError,
  adminEmailTakenError,
  adminInvalidError,
  adminLastSuperAdminError,
  adminNotFoundError,
  adminRoleInvalidError,
  adminScopeForbiddenError,
  adminSelfProtectedError,
  parseAdminCreate,
  parseAdminListStatus,
  parseAdminPassword,
  parseAdminStatus,
  parseAdminUpdate,
  parsePositiveIntParam,
  sessionPublicIdFromBearer,
  toAdminUserDto,
} from "../lib/adminUsers";

const router = Router();

export const RBAC_MANAGE_PERMISSION = "rbac:manage";
/** Stored labels that normalize to super_admin (legacy rows are normalized on login). */
export const HQ_ROLE_LABELS = ["super_admin", "admin", "hq"];

export type Executor = typeof db;

const publicColumns = {
  id: adminUsers.id,
  email: adminUsers.email,
  name: adminUsers.name,
  role: adminUsers.role,
  branchId: adminUsers.branchId,
  status: adminUsers.status,
  createdAt: adminUsers.createdAt,
  updatedAt: adminUsers.updatedAt,
};

export async function requireRbacManager(req: Request) {
  const actor = await requireAdmin(req);
  await requirePermission(actor, RBAC_MANAGE_PERMISSION);
  return actor;
}

/**
 * HQ manages everyone. A branch-scoped role only manages branch staff of its own branch
 * (possible only if rbac:manage is ever granted to such a role) and can never touch HQ accounts.
 */
export function assertManagerCanTouch(actor: AdminUser, role: string, branchId: number | null) {
  if (isHqAdminRole(actor.role)) return;
  if (isHqAdminRole(role) || branchId == null || branchId !== actor.branchId) throw adminScopeForbiddenError();
}

async function findRole(code: string) {
  const rows = await db.select({ code: authRoles.code }).from(authRoles).where(eq(authRoles.code, code)).limit(1);
  return rows[0] ?? null;
}

async function branchExists(branchId: number) {
  const rows = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1);
  return Boolean(rows[0]);
}

/** HQ role ⇒ branchId null; branch role ⇒ an existing branch. */
async function assertRoleBranchPair(role: string, branchId: number | null) {
  if (isHqAdminRole(role)) {
    if (branchId != null) throw adminBranchInvalidError("Bosh ofis roli filialga bog‘lanmaydi.");
    return;
  }
  if (branchId == null) throw adminBranchInvalidError("Bu rol uchun filial majburiy.");
  if (!(await branchExists(branchId))) throw adminBranchInvalidError();
}

async function lockAdminMutations(tx: Executor) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw(String(ADMIN_MUTATION_LOCK_KEY))})`);
}

export async function lockTarget(tx: Executor, id: number) {
  const rows = await tx.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1).for("update");
  if (!rows[0]) throw adminNotFoundError();
  return rows[0];
}

async function otherActiveHqAdmins(tx: Executor, excludeId: number) {
  const [row] = await tx
    .select({ value: count() })
    .from(adminUsers)
    .where(and(inArray(adminUsers.role, HQ_ROLE_LABELS), eq(adminUsers.status, "active"), ne(adminUsers.id, excludeId)));
  return Number(row?.value || 0);
}

async function revokeAdminSessions(tx: Executor, adminId: number, keepPublicId: string | null) {
  const filters: SQL[] = [
    eq(authSessions.actorType, "admin"),
    eq(authSessions.actorId, adminId),
    isNull(authSessions.revokedAt),
  ];
  if (keepPublicId) filters.push(ne(authSessions.publicId, keepPublicId));
  const rows = await tx.update(authSessions).set({ revokedAt: new Date() }).where(and(...filters)).returning();
  return rows.length;
}

export async function writeAudit(tx: Executor, actor: AdminUser, action: string, payload: Record<string, unknown>) {
  await tx.insert(auditLog).values({ actor: actor.email, action, entity: "admin_user", payload: JSON.stringify(payload) });
}

async function branchNameOf(branchId: number | null) {
  if (branchId == null) return null;
  const rows = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, branchId)).limit(1);
  return rows[0]?.name ?? null;
}

async function dto(row: AdminUser) {
  return toAdminUserDto(row, await branchNameOf(row.branchId));
}

export function targetId(req: Request) {
  const id = parsePositiveIntParam(req.params.id);
  if (id == null) throw adminNotFoundError();
  return id;
}

/** Matches admin_users_email_lower_unique (0012); the input is already normalized to lower case. */
function sameEmail(normalized: string) {
  return sql`lower(${adminUsers.email}) = ${normalized}`;
}

function forward(error: unknown) {
  return isUniqueViolation(error) ? adminEmailTakenError() : error;
}

router.get("/admin/users", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(ADMIN_USERS_MAX_LIMIT, Math.floor(limitRaw))
      : ADMIN_USERS_DEFAULT_LIMIT;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
    const q = sanitizeAdminOrderSearch(typeof req.query.q === "string" ? req.query.q : "");

    let requestedBranch: number | undefined;
    if (req.query.branchId != null && req.query.branchId !== "") {
      const parsed = parsePositiveIntParam(req.query.branchId);
      if (parsed == null) throw adminBranchInvalidError("Filial filtri noto‘g‘ri.");
      requestedBranch = parsed;
    }
    const branchFilter = resolveStaffBranchFilter(actor, requestedBranch);
    const status = parseAdminListStatus(req.query.status);

    const filters: SQL[] = [];
    if (typeof req.query.role === "string" && req.query.role.trim()) {
      const role = await findRole(req.query.role.trim());
      if (!role) throw adminRoleInvalidError();
      filters.push(isHqAdminRole(role.code) ? inArray(adminUsers.role, HQ_ROLE_LABELS) : eq(adminUsers.role, role.code));
    }
    if (branchFilter != null) filters.push(eq(adminUsers.branchId, branchFilter));
    if (status) filters.push(eq(adminUsers.status, status));
    if (q) {
      const pattern = `%${q}%`;
      filters.push(or(ilike(adminUsers.name, pattern), ilike(adminUsers.email, pattern))!);
    }
    const whereClause = filters.length ? and(...filters) : undefined;

    const [totalRow] = await db.select({ value: count() }).from(adminUsers).where(whereClause);
    const total = Number(totalRow?.value || 0);
    const rows = await db
      .select({ ...publicColumns, branchName: branches.name })
      .from(adminUsers)
      .leftJoin(branches, eq(branches.id, adminUsers.branchId))
      .where(whereClause)
      .orderBy(desc(adminUsers.id))
      .limit(limit)
      .offset(offset);

    const hasMore = offset + rows.length < total;
    return res.json({
      users: rows.map(({ branchName, ...row }) => toAdminUserDto({ ...row, passwordHash: "" }, branchName)),
      pagination: { limit, offset, total, hasMore, nextOffset: hasMore ? offset + rows.length : null },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/users/:id", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const id = targetId(req);
    const rows = await db.select(publicColumns).from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw adminNotFoundError();
    await assertBranchScope(actor, row.branchId);
    if (!isHqAdminRole(actor.role) && isHqAdminRole(row.role)) throw adminScopeForbiddenError();

    const permissions = Array.from(await getPermissionsForRole(row.role)).sort();
    const [sessionRow] = await db
      .select({ active: count(), lastSeenAt: max(authSessions.lastSeenAt) })
      .from(authSessions)
      .where(and(
        eq(authSessions.actorType, "admin"),
        eq(authSessions.actorId, id),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ));
    const lastSeen = sessionRow?.lastSeenAt ? new Date(sessionRow.lastSeenAt as unknown as string) : null;

    return res.json({
      user: await dto({ ...row, passwordHash: "" }),
      permissions,
      sessions: { active: Number(sessionRow?.active || 0), lastSeenAt: lastSeen ? lastSeen.toISOString() : null },
      isSelf: actor.id === id,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/admin/users", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const input = parseAdminCreate(req.body);
    const role = await findRole(input.role);
    if (!role) throw adminRoleInvalidError();
    assertManagerCanTouch(actor, role.code, input.branchId);
    await assertRoleBranchPair(role.code, input.branchId);
    const passwordHash = hashPassword(input.password);

    const created = await db.transaction(async (trx) => {
      const tx = trx as unknown as Executor;
      await lockAdminMutations(tx);
      const dup = await tx.select({ id: adminUsers.id }).from(adminUsers).where(sameEmail(input.email)).limit(1);
      if (dup[0]) throw adminEmailTakenError();
      const [row] = await tx.insert(adminUsers).values({
        email: input.email,
        name: input.name,
        role: role.code,
        branchId: input.branchId,
        passwordHash,
        status: "active",
      }).returning();
      await writeAudit(tx, actor, "admin.create", {
        adminId: row.id,
        email: row.email,
        role: row.role,
        branchId: row.branchId,
        status: row.status,
      });
      return row;
    });

    return res.status(201).json({ user: await dto(created) });
  } catch (error) {
    return next(forward(error));
  }
});

router.patch("/admin/users/:id", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const id = targetId(req);
    const patch = parseAdminUpdate(req.body);
    if (patch.role !== undefined && !(await findRole(patch.role))) throw adminRoleInvalidError();
    if (patch.branchId != null && !(await branchExists(patch.branchId))) throw adminBranchInvalidError();

    const result = await db.transaction(async (trx) => {
      const tx = trx as unknown as Executor;
      await lockAdminMutations(tx);
      const current = await lockTarget(tx, id);
      const currentRole = normalizeAdminRole(current.role);
      assertManagerCanTouch(actor, currentRole, current.branchId);

      const nextRole = patch.role ?? currentRole;
      const nextBranch = patch.branchId !== undefined ? patch.branchId : current.branchId;
      const changes: Partial<Pick<AdminUser, "email" | "name" | "role" | "branchId">> = {};
      if (patch.name !== undefined && patch.name !== current.name) changes.name = patch.name;
      if (patch.email !== undefined && patch.email !== current.email) changes.email = patch.email;
      if (nextRole !== currentRole) changes.role = nextRole;
      if (nextBranch !== current.branchId) changes.branchId = nextBranch;
      const fields = Object.keys(changes);
      if (!fields.length) return { row: current, fields };

      if (actor.id === id && (changes.role !== undefined || changes.branchId !== undefined)) {
        throw adminSelfProtectedError("O‘z rolingiz yoki filialingizni o‘zgartira olmaysiz.");
      }
      if (isHqAdminRole(nextRole) && nextBranch != null) throw adminBranchInvalidError("Bosh ofis roli filialga bog‘lanmaydi.");
      if (!isHqAdminRole(nextRole) && nextBranch == null) throw adminBranchInvalidError("Bu rol uchun filial majburiy.");
      assertManagerCanTouch(actor, nextRole, nextBranch);

      if (isHqAdminRole(currentRole) && !isHqAdminRole(nextRole) && current.status === "active"
        && (await otherActiveHqAdmins(tx, id)) === 0) {
        throw adminLastSuperAdminError();
      }
      if (changes.email) {
        const dup = await tx.select({ id: adminUsers.id }).from(adminUsers)
          .where(and(sameEmail(changes.email), ne(adminUsers.id, id))).limit(1);
        if (dup[0]) throw adminEmailTakenError();
      }

      const [row] = await tx.update(adminUsers).set({ ...changes, updatedAt: new Date() }).where(eq(adminUsers.id, id)).returning();
      await writeAudit(tx, actor, "admin.update", {
        adminId: row.id,
        email: row.email,
        role: row.role,
        branchId: row.branchId,
        fields,
        ...(changes.email ? { previousEmail: current.email } : {}),
        ...(changes.branchId !== undefined ? { previousBranchId: current.branchId } : {}),
      });
      if (changes.role !== undefined) {
        await writeAudit(tx, actor, "admin.role_change", {
          adminId: row.id,
          email: row.email,
          branchId: row.branchId,
          from: currentRole,
          to: row.role,
        });
      }
      return { row, fields };
    });

    return res.json({ user: await dto(result.row), changed: result.fields });
  } catch (error) {
    return next(forward(error));
  }
});

router.patch("/admin/users/:id/status", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const id = targetId(req);
    const status = parseAdminStatus(req.body);
    if (actor.id === id && status === "disabled") throw adminSelfProtectedError("O‘z hisobingizni o‘chira olmaysiz.");

    const result = await db.transaction(async (trx) => {
      const tx = trx as unknown as Executor;
      await lockAdminMutations(tx);
      const current = await lockTarget(tx, id);
      assertManagerCanTouch(actor, current.role, current.branchId);
      if (current.status === status) return { row: current, changed: false, revoked: 0 };
      if (status === "disabled" && isHqAdminRole(current.role) && (await otherActiveHqAdmins(tx, id)) === 0) {
        throw adminLastSuperAdminError();
      }

      const [row] = await tx.update(adminUsers).set({ status, updatedAt: new Date() }).where(eq(adminUsers.id, id)).returning();
      const revoked = status === "disabled" ? await revokeAdminSessions(tx, id, null) : 0;
      await writeAudit(tx, actor, "admin.status_change", {
        adminId: row.id,
        email: row.email,
        role: row.role,
        branchId: row.branchId,
        from: current.status,
        to: row.status,
        revokedSessions: revoked,
      });
      return { row, changed: true, revoked };
    });

    if (result.revoked > 0) {
      await recordAuthEvent({
        actorType: "admin",
        actorId: id,
        eventType: "session.revoke",
        success: true,
        reason: "admin_disabled",
        meta: { count: result.revoked, byAdminId: actor.id },
      });
    }
    return res.json({ user: await dto(result.row), changed: result.changed, revokedSessions: result.revoked });
  } catch (error) {
    return next(forward(error));
  }
});

router.patch("/admin/users/:id/password", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const id = targetId(req);
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const unknownKey = Object.keys(body).find((key) => key !== "password");
    if (unknownKey) throw adminInvalidError(`Noma’lum maydon: ${unknownKey.slice(0, 40)}`);
    const passwordHash = hashPassword(parseAdminPassword(body.password));
    const keepPublicId = actor.id === id ? sessionPublicIdFromBearer(req.header("authorization")) : null;

    const result = await db.transaction(async (trx) => {
      const tx = trx as unknown as Executor;
      await lockAdminMutations(tx);
      const current = await lockTarget(tx, id);
      assertManagerCanTouch(actor, current.role, current.branchId);
      const [row] = await tx.update(adminUsers).set({ passwordHash, updatedAt: new Date() }).where(eq(adminUsers.id, id)).returning();
      const revoked = await revokeAdminSessions(tx, id, keepPublicId);
      await writeAudit(tx, actor, "admin.password_change", {
        adminId: row.id,
        email: row.email,
        role: row.role,
        branchId: row.branchId,
        revokedSessions: revoked,
      });
      return { row, revoked };
    });

    if (result.revoked > 0) {
      await recordAuthEvent({
        actorType: "admin",
        actorId: id,
        eventType: "session.revoke",
        success: true,
        reason: "admin_password_change",
        meta: { count: result.revoked, byAdminId: actor.id },
      });
    }
    return res.json({ ok: true, user: await dto(result.row), revokedSessions: result.revoked });
  } catch (error) {
    return next(forward(error));
  }
});

/** Read-only: roles and permissions are seeded (0001/0004); there is no dynamic role CRUD. */
router.get("/admin/rbac", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const roleRows = await db.select().from(authRoles).orderBy(authRoles.id);
    const permissionRows = await db
      .select({ code: authPermissions.code, description: authPermissions.description })
      .from(authPermissions)
      .orderBy(authPermissions.code);
    const links = await db
      .select({ role: authRoles.code, permission: authPermissions.code })
      .from(authRolePermissions)
      .innerJoin(authRoles, eq(authRoles.id, authRolePermissions.roleId))
      .innerJoin(authPermissions, eq(authPermissions.id, authRolePermissions.permissionId));
    const counts = await db
      .select({ role: adminUsers.role, status: adminUsers.status, value: count() })
      .from(adminUsers)
      .groupBy(adminUsers.role, adminUsers.status);

    const roles = roleRows.map((role) => {
      const admins = { active: 0, disabled: 0 };
      for (const row of counts) {
        if (normalizeAdminRole(row.role) !== role.code) continue;
        admins[row.status === "disabled" ? "disabled" : "active"] += Number(row.value);
      }
      return {
        code: role.code,
        name: role.name,
        description: role.description,
        scope: isHqAdminRole(role.code) ? "all" : "branch",
        admins,
      };
    });
    const matrix = roleRows.map((role) => {
      const granted = links.filter((l) => l.role === role.code).map((l) => l.permission);
      return {
        role: role.code,
        source: granted.length ? "db" : "fallback",
        permissions: (granted.length ? granted : Array.from(fallbackPermissionsForRole(role.code))).sort(),
      };
    });
    const assignableRoles = roleRows
      .map((role) => role.code)
      .filter((code) => isHqAdminRole(actor.role) || !isHqAdminRole(code));

    return res.json({
      roles,
      permissions: permissionRows,
      matrix,
      assignableRoles,
      managePermission: RBAC_MANAGE_PERMISSION,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
