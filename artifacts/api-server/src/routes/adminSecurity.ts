/**
 * Phase 13.17 — read-only admin auth events + admin session list / individual revoke.
 * Every endpoint: requireRbacManager (requireAdmin → status → rbac:manage). Branch-scoped managers only see
 * branch staff of their own branch (same rule as the 13.16 admin management API); HQ sees every admin.
 * Reads are not audited (same as GET /admin/audit); a revoke and its audit row share one transaction.
 */
import { Router } from "express";
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, lte, gt, notInArray, sql, type SQL } from "drizzle-orm";
import { adminUsers, authEvents, authSessions, db } from "@workspace/db";
import { isHqAdminRole, normalizeAdminRole } from "../lib/securityEnv";
import { recordAuthEvent } from "../lib/authEvents";
import { adminNotFoundError, parsePositiveIntParam, sessionPublicIdFromBearer } from "../lib/adminUsers";
import {
  ADMIN_SESSIONS_DEFAULT_LIMIT,
  ADMIN_SESSIONS_MAX_LIMIT,
  AUTH_EVENTS_DEFAULT_LIMIT,
  AUTH_EVENTS_MAX_LIMIT,
  pagination,
  parseAuthEventFilters,
  parsePage,
  parseSessionStatus,
  sessionNotFoundError,
  sessionStatusOf,
  toAuthEventDto,
  toSessionDto,
  type SessionStatus,
} from "../lib/authSecurity";
import {
  HQ_ROLE_LABELS,
  assertManagerCanTouch,
  lockTarget,
  requireRbacManager,
  targetId,
  writeAudit,
  type Executor,
} from "./adminUsers";

const router = Router();

/**
 * What the schema actually stores — the UI states "not stored" instead of inventing values.
 * auth_events: ip_address / user_agent since 0013; per-event `ip.stored` / `userAgent.stored` are false for older rows.
 */
const AUTH_EVENT_STORAGE = { ip: true, userAgent: true } as const;
const SESSION_STORAGE = { ip: false, userAgent: true, deviceLabel: true } as const;

async function scopedTarget(actor: Awaited<ReturnType<typeof requireRbacManager>>, id: number) {
  const rows = await db
    .select({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role, branchId: adminUsers.branchId, status: adminUsers.status })
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);
  const target = rows[0];
  if (!target) throw adminNotFoundError();
  assertManagerCanTouch(actor, normalizeAdminRole(target.role), target.branchId);
  return target;
}

function sessionStatusFilter(status: SessionStatus, now: Date): SQL {
  if (status === "revoked") return isNotNull(authSessions.revokedAt);
  if (status === "expired") return and(isNull(authSessions.revokedAt), lte(authSessions.expiresAt, now))!;
  return and(isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))!;
}

router.get("/admin/auth-events", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const query = req.query as Record<string, unknown>;
    const { limit, offset } = parsePage(query, { limit: AUTH_EVENTS_DEFAULT_LIMIT, max: AUTH_EVENTS_MAX_LIMIT });
    const f = parseAuthEventFilters(query);
    const hq = isHqAdminRole(actor.role);
    if (f.adminId != null && !hq) await scopedTarget(actor, f.adminId);

    const filters: SQL[] = [eq(authEvents.actorType, "admin")];
    if (!hq) {
      filters.push(eq(adminUsers.branchId, actor.branchId ?? -1));
      filters.push(notInArray(adminUsers.role, HQ_ROLE_LABELS));
    }
    if (f.adminId != null) filters.push(eq(authEvents.actorId, f.adminId));
    if (f.event) filters.push(eq(authEvents.eventType, f.event));
    if (f.success !== undefined) filters.push(eq(authEvents.success, f.success));
    if (f.from) filters.push(gte(authEvents.createdAt, f.from));
    if (f.toExclusive) filters.push(lt(authEvents.createdAt, f.toExclusive));
    const whereClause = and(...filters);

    const [totalRow] = await db
      .select({ value: count() })
      .from(authEvents)
      .leftJoin(adminUsers, eq(adminUsers.id, authEvents.actorId))
      .where(whereClause);
    const total = Number(totalRow?.value || 0);
    const rows = await db
      .select({
        id: authEvents.id,
        eventType: authEvents.eventType,
        success: authEvents.success,
        reason: authEvents.reason,
        meta: authEvents.meta,
        actorId: authEvents.actorId,
        ipAddress: authEvents.ipAddress,
        userAgent: authEvents.userAgent,
        createdAt: authEvents.createdAt,
        adminName: adminUsers.name,
        adminEmail: adminUsers.email,
      })
      .from(authEvents)
      .leftJoin(adminUsers, eq(adminUsers.id, authEvents.actorId))
      .where(whereClause)
      .orderBy(desc(authEvents.createdAt), desc(authEvents.id))
      .limit(limit)
      .offset(offset);
    const types = await db
      .selectDistinct({ eventType: authEvents.eventType })
      .from(authEvents)
      .where(eq(authEvents.actorType, "admin"))
      .orderBy(asc(authEvents.eventType));

    return res.json({
      events: rows.map(toAuthEventDto),
      pagination: pagination(limit, offset, rows.length, total),
      eventTypes: types.map((t) => t.eventType),
      stored: AUTH_EVENT_STORAGE,
      readOnly: true,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/users/:id/sessions", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const id = targetId(req);
    await scopedTarget(actor, id);
    const query = req.query as Record<string, unknown>;
    const { limit, offset } = parsePage(query, { limit: ADMIN_SESSIONS_DEFAULT_LIMIT, max: ADMIN_SESSIONS_MAX_LIMIT });
    const status = parseSessionStatus(query.status);
    const now = new Date();
    const currentPublicId = sessionPublicIdFromBearer(req.header("authorization"));

    const owned = and(eq(authSessions.actorType, "admin"), eq(authSessions.actorId, id))!;
    const whereClause = status ? and(owned, sessionStatusFilter(status, now)) : owned;
    const [totalRow] = await db.select({ value: count() }).from(authSessions).where(whereClause);
    const total = Number(totalRow?.value || 0);
    const rows = await db
      .select()
      .from(authSessions)
      .where(whereClause)
      .orderBy(desc(authSessions.createdAt), desc(authSessions.id))
      .limit(limit)
      .offset(offset);
    const nowIso = now.toISOString();
    const [summary] = await db
      .select({
        active: sql<number>`count(*) filter (where ${authSessions.revokedAt} is null and ${authSessions.expiresAt} > ${nowIso}::timestamptz)`,
        expired: sql<number>`count(*) filter (where ${authSessions.revokedAt} is null and ${authSessions.expiresAt} <= ${nowIso}::timestamptz)`,
        revoked: sql<number>`count(*) filter (where ${authSessions.revokedAt} is not null)`,
      })
      .from(authSessions)
      .where(owned);

    return res.json({
      sessions: rows.map((row) => toSessionDto(row, now, currentPublicId)),
      pagination: pagination(limit, offset, rows.length, total),
      summary: { active: Number(summary?.active || 0), expired: Number(summary?.expired || 0), revoked: Number(summary?.revoked || 0) },
      currentKnown: currentPublicId != null,
      stored: SESSION_STORAGE,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/admin/users/:id/sessions/:sessionId/revoke", async (req, res, next) => {
  try {
    const actor = await requireRbacManager(req);
    const id = targetId(req);
    const sessionId = parsePositiveIntParam(req.params.sessionId);
    if (sessionId == null) throw sessionNotFoundError();
    const currentPublicId = sessionPublicIdFromBearer(req.header("authorization"));

    const result = await db.transaction(async (trx) => {
      const tx = trx as unknown as Executor;
      const target = await lockTarget(tx, id);
      assertManagerCanTouch(actor, normalizeAdminRole(target.role), target.branchId);
      const [session] = await tx
        .select()
        .from(authSessions)
        .where(and(eq(authSessions.id, sessionId), eq(authSessions.actorType, "admin"), eq(authSessions.actorId, id)))
        .limit(1)
        .for("update");
      if (!session) throw sessionNotFoundError();
      if (session.revokedAt) return { session, changed: false };

      const statusBefore = sessionStatusOf(session, new Date());
      const [row] = await tx
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)))
        .returning();
      if (!row) return { session, changed: false };
      await writeAudit(tx, actor, "admin.session_revoke", {
        adminId: target.id,
        email: target.email,
        sessionId: row.id,
        sessionStatus: statusBefore,
        current: row.publicId === currentPublicId,
      });
      return { session: row, changed: true };
    });

    const endedCurrent = result.changed && result.session.publicId === currentPublicId;
    if (result.changed) {
      await recordAuthEvent({
        actorType: "admin",
        actorId: id,
        eventType: "session.revoke",
        success: true,
        reason: "admin_revoke",
        meta: { sessionId: result.session.id, byAdminId: actor.id },
      });
    }
    return res.json({ session: toSessionDto(result.session, new Date(), currentPublicId), changed: result.changed, endedCurrent });
  } catch (error) {
    return next(error);
  }
});

export default router;
