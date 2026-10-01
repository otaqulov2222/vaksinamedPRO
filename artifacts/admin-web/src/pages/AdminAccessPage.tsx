import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Check, Eye, EyeOff, Minus, Plus, RefreshCw, Search } from "lucide-react";
import { fmtDate, isHqRole, request, type AdminUser } from "../api";
import {
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  DetailDrawer,
  DrawerSection,
  EmptyState,
  ErrorState,
  FeedbackBanner,
  FilterBar,
  FilterField,
  LoadingBlock,
  PaginationBar,
  StatusBadge,
  operatorCapabilityLabel,
} from "../ui";

/**
 * Admin management console (Phase 13.16) over the real API:
 *   GET /api/admin/me · GET/POST /api/admin/users · GET/PATCH /api/admin/users/:id
 *   PATCH /api/admin/users/:id/status · PATCH /api/admin/users/:id/password · GET /api/admin/rbac
 * Phase 13.17: GET /api/admin/auth-events (read-only) · GET /api/admin/users/:id/sessions
 *   · POST /api/admin/users/:id/sessions/:sessionId/revoke. Session status, "current" and expiry come from the server.
 * Phase 13.18: each auth event carries ip { stored, value } and userAgent { stored, summary }; the raw User-Agent
 *   never reaches the browser and rows written before 0013 show "Saqlanmagan".
 * The server enforces rbac:manage, branch scope, self-protection and the last-super-admin rule;
 * hiding buttons here is only UX. Roles, permission codes and the matrix come from GET /api/admin/rbac —
 * the label maps below are display-only and unknown codes are shown raw.
 */

type LoadError = { kind: "session" | "forbidden" | "notfound" | "network" | "failed"; message: string };
type BranchRef = { id: number; name?: string };
type AdminStatus = "active" | "disabled";
type AdminRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  branchId: number | null;
  branchName: string | null;
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
};
type Detail = { user: AdminRow; permissions: string[]; sessions: { active: number; lastSeenAt: string | null }; isSelf: boolean };
type RbacRole = { code: string; name: string; description: string; scope: "all" | "branch"; admins: { active: number; disabled: number } };
type Rbac = {
  roles: RbacRole[];
  permissions: Array<{ code: string; description: string }>;
  matrix: Array<{ role: string; source: string; permissions: string[] }>;
  assignableRoles: string[];
  managePermission: string;
};
type Page = { offset: number; limit: number; total: number; hasMore: boolean };
type ListResponse = { users?: unknown[]; pagination?: Record<string, unknown> };
type Panel = { kind: "view" | "edit" | "password"; id: number } | { kind: "create" } | null;
type FormState = { name: string; email: string; role: string; branchId: string; password: string };
type DrawerTab = "profile" | "sessions" | "events";
type SessionStatus = "active" | "expired" | "revoked";
type SessionDevice = { label: string | null; browser: string | null; os: string | null; recognized: boolean } | null;
type SessionRow = {
  id: number;
  status: SessionStatus;
  current: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  device: SessionDevice;
};
type SessionsData = {
  sessions: SessionRow[];
  page: Page;
  summary: Record<SessionStatus, number>;
  currentKnown: boolean;
  ipStored: boolean;
};
type AuthEvent = {
  id: number;
  event: string;
  success: boolean;
  reason: string | null;
  adminId: number | null;
  admin: { id: number; name: string; email: string } | null;
  details: Record<string, string | number | boolean>;
  ip: { stored: boolean; value: string | null };
  userAgent: { stored: boolean; summary: string | null };
  createdAt: string;
};
type EventsData = { events: AuthEvent[]; page: Page; eventTypes: string[]; ipStored: boolean; userAgentStored: boolean };
type EventFilters = { event: string; success: string; dateFrom: string; dateTo: string; adminId: string };

const PAGE_SIZE = 25;
const EVENTS_PAGE_SIZE = 25;
const DRAWER_PAGE_SIZE = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors the server rule for instant feedback only; the API re-validates. */
const PASSWORD_MIN = 6;

const ERROR_COPY: Record<LoadError["kind"], string> = {
  session: "Seans tugagan. Qayta kiring.",
  forbidden: "Bu bo‘lim uchun ruxsatingiz yo‘q.",
  notfound: "Ma'lumot topilmadi.",
  failed: "Serverda xatolik yuz berdi.",
  network: "Server bilan aloqa o‘rnatilmadi.",
};

const MUTATION_COPY: Record<string, string> = {
  ADMIN_EMAIL_TAKEN: "Bu email bilan administrator allaqachon mavjud.",
  ADMIN_ROLE_INVALID: "Tanlangan rol serverda mavjud emas.",
  ADMIN_BRANCH_INVALID: "Filial noto‘g‘ri: kassir uchun filial majburiy, HQ roli filialsiz bo‘ladi.",
  ADMIN_INVALID: "Ma'lumotlar noto‘g‘ri. Maydonlarni tekshiring.",
  ADMIN_SELF_PROTECTED: "O‘z hisobingizni faolsizlantira yoki rolingiz va filialingizni o‘zgartira olmaysiz.",
  ADMIN_LAST_ACTIVE_SUPER_ADMIN: "Oxirgi faol bosh administratorni faolsizlantirib yoki rolini o‘zgartirib bo‘lmaydi.",
  ADMIN_NOT_FOUND: "Administrator topilmadi.",
  ADMIN_SCOPE_FORBIDDEN: "Bu administrator ustida amal bajarishga ruxsatingiz yo‘q.",
  SESSION_NOT_FOUND: "Sessiya topilmadi yoki bu administratorga tegishli emas.",
  SESSION_FILTER_INVALID: "Sessiya filtri noto‘g‘ri.",
  AUTH_EVENT_FILTER_INVALID: "Filtr noto‘g‘ri. Sana oralig‘ini tekshiring.",
};

/** Sessions / auth events use the spec copy for 403 ("ma'lumotlarni ko‘rish"). */
const SECURITY_ERROR_COPY: Record<LoadError["kind"], string> = {
  session: "Seans tugagan. Qayta kiring.",
  forbidden: "Bu ma'lumotlarni ko‘rish uchun ruxsatingiz yo‘q.",
  notfound: "Ma'lumot topilmadi.",
  failed: "Serverda xatolik yuz berdi.",
  network: "Server bilan aloqa o‘rnatilmadi.",
};

/** Display-only labels for event codes written by the server; unknown codes are shown raw. */
const EVENT_LABELS: Record<string, string> = {
  "login.success": "Kirish",
  "login.failure": "Kirish urinishi",
  logout: "Chiqish",
  "session.create": "Sessiya ochildi",
  "session.revoke": "Sessiya bekor qilindi",
  "authz.denied": "Ruxsat rad etildi",
};

const REASON_LABELS: Record<string, string> = {
  bad_credentials: "Email yoki parol noto‘g‘ri",
  admin_disabled: "Hisob faol emas",
  missing_permission: "Ruxsat yo‘q",
  hq_required: "Faqat bosh ofis uchun",
  branch_required: "Filial biriktirilmagan",
  branch_mismatch: "Boshqa filial",
  admin_password_change: "Parol almashtirilgani uchun",
  admin_revoke: "Administrator bekor qildi",
};

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  active: "Faol",
  expired: "Muddati tugagan",
  revoked: "Bekor qilingan",
};

const ROLE_LABELS: Record<string, string> = { super_admin: "Super admin (HQ)", cashier: "Kassir" };

const PERMISSION_LABELS: Record<string, string> = {
  "dashboard:read": "Dashboard va hisobotlarni ko‘rish",
  "branches:read": "Filiallarni ko‘rish",
  "branches:manage": "Filial ma'lumotlari va to‘lov kabinetlarini tahrirlash",
  "products:read": "Katalogni ko‘rish",
  "products:manage": "Mahsulot qo‘shish va tahrirlash",
  "inventory:adjust": "Ombor qoldig‘ini tuzatish",
  "orders:read": "Buyurtmalarni ko‘rish",
  "orders:confirm_pos": "Buyurtmani kassada tasdiqlash",
  "orders:cancel": "Buyurtmani bekor qilish",
  "pos:lookup": "Mijozni topish",
  "pos:preview": "Chekni oldindan hisoblash",
  "pos:sale": "Sotuvni yakunlash",
  "pos:void": "Sotuvni bekor qilish",
  "pos:sales:read": "Kassa sotuvlari tarixi",
  "customers:read": "Mijozlar va cashback ma'lumotlarini ko‘rish",
  "promos:read": "Aksiyalarni ko‘rish",
  "ratings:read": "Baholarni ko‘rish",
  "payments:read": "To‘lovlarni ko‘rish",
  "payments:manage": "To‘lovni qaytarish",
  "delivery:update": "Yetkazishni yuritish",
  "audit:read": "Audit jurnalini ko‘rish",
  "rbac:manage": "Adminlar, rollar va filial biriktirishni boshqarish",
};

const GROUP_LABELS: Record<string, string> = {
  dashboard: "Boshqaruv va hisobotlar",
  branches: "Filiallar",
  products: "Katalog va ombor",
  inventory: "Katalog va ombor",
  orders: "Buyurtmalar",
  pos: "Kassa POS",
  customers: "Mijozlar va marketing",
  promos: "Mijozlar va marketing",
  ratings: "Mijozlar va marketing",
  payments: "To‘lovlar",
  delivery: "Yetkazib berish",
  audit: "Tizim",
  rbac: "Tizim",
};

const ENFORCED: Array<{ title: string; desc: string }> = [
  { title: "Server RBAC", desc: "Adminlar API rbac:manage ruxsatini talab qiladi. Ruxsat yetishmasa server 403 qaytaradi va rad etishni qayd qiladi." },
  { title: "Filial doirasi", desc: "HQ barcha filiallarni ko‘radi. Filialga bog‘langan rol faqat o‘z filiali xodimlari bilan ishlaydi — filialni server tekshiradi." },
  { title: "Hisob holati", desc: "Faolsizlantirilgan admin tizimga kira olmaydi, mavjud sessiyalari darhol bekor qilinadi." },
  { title: "O‘zini himoya qilish", desc: "Admin o‘zini faolsizlantira, o‘z rolini yoki filialini o‘zgartira olmaydi. Oxirgi faol bosh admin saqlanib qoladi." },
  { title: "Audit", desc: "Qo‘shish, tahrirlash, rol, holat va parol almashtirish audit jurnaliga o‘zgarish bilan bir tranzaksiyada yoziladi." },
  { title: "Maxfiy ma'lumotlar", desc: "Parol faqat xesh ko‘rinishida saqlanadi va hech qaysi javobda, auditda yoki URL'da qaytmaydi." },
  { title: "Sessiyalar", desc: "Har bir sessiyani alohida bekor qilish mumkin. Bekor qilish audit jurnaliga bir tranzaksiyada yoziladi; sessiya kaliti hech qachon ko‘rsatilmaydi." },
  { title: "Kirish hodisalari", desc: "Kirish, chiqish, rad etish va sessiya hodisalari serverdan faqat o‘qiladi. Maxfiy maydonlar server tomonida olib tashlanadi." },
  { title: "IP va qurilma", desc: "Admin kirish hodisalarida so‘rovning IP manzili va User-Agent qisqa ko‘rinishi saqlanadi. Proxy sarlavhalariga ishonilmaydi; to‘liq User-Agent ko‘rsatilmaydi." },
];

const NOT_CONNECTED: Array<{ title: string; desc: string }> = [
  { title: "Rollar va ruxsatlarni tahrirlash", desc: "Rollar va ruxsat kodlari migratsiyada belgilanadi. Dinamik rol yaratish API yo‘q — matritsa faqat o‘qiladi." },
  { title: "Sessiyalarda IP manzil", desc: "Sessiya jadvali IP manzilni saqlamaydi. IP faqat kirish hodisalarida yoziladi." },
];

const TELEMETRY_NOTE =
  "IP va qurilma hodisani yuborgan so‘rovdan olinadi; boshqa admin bajargan amallarda — bajargan adminniki. Avvalgi hodisalarda “Saqlanmagan”. Noto‘g‘ri email bilan urinishlarda email yozilmaydi.";

const emptyForm: FormState = { name: "", email: "", role: "", branchId: "", password: "" };

function statusOf(err: unknown): number {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) || 0 : 0;
}

function codeOf(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
}

function loadError(err: unknown): LoadError {
  const status = statusOf(err);
  const kind: LoadError["kind"] =
    status === 401 ? "session" : status === 403 ? "forbidden" : status === 404 ? "notfound" : status ? "failed" : "network";
  return { kind, message: ERROR_COPY[kind] };
}

function mutationError(err: unknown): string {
  return MUTATION_COPY[codeOf(err)] || loadError(err).message;
}

function parseRow(value: unknown): AdminRow | null {
  const u = value as Record<string, unknown> | null;
  if (!u || typeof u !== "object" || !Number.isFinite(Number(u.id))) return null;
  return {
    id: Number(u.id),
    email: typeof u.email === "string" ? u.email : "",
    name: typeof u.name === "string" ? u.name : "",
    role: typeof u.role === "string" ? u.role : "",
    branchId: u.branchId == null ? null : Number(u.branchId),
    branchName: typeof u.branchName === "string" ? u.branchName : null,
    status: u.status === "disabled" ? "disabled" : "active",
    createdAt: typeof u.createdAt === "string" ? u.createdAt : "",
    updatedAt: typeof u.updatedAt === "string" ? u.updatedAt : "",
  };
}

function parseDetail(value: unknown): Detail | null {
  const v = value as { user?: unknown; permissions?: unknown; sessions?: Record<string, unknown>; isSelf?: unknown } | null;
  const user = parseRow(v?.user);
  if (!user) return null;
  return {
    user,
    permissions: Array.isArray(v?.permissions) ? [...new Set((v!.permissions as unknown[]).map(String).filter(Boolean))] : [],
    sessions: {
      active: Number(v?.sessions?.active) || 0,
      lastSeenAt: typeof v?.sessions?.lastSeenAt === "string" ? v.sessions.lastSeenAt : null,
    },
    isSelf: v?.isSelf === true,
  };
}

function parseRbac(value: unknown): Rbac | null {
  const v = value as Record<string, unknown> | null;
  if (!v || !Array.isArray(v.roles) || !Array.isArray(v.permissions) || !Array.isArray(v.matrix)) return null;
  return {
    roles: (v.roles as Array<Record<string, any>>).map((r) => ({
      code: String(r.code || ""),
      name: String(r.name || ""),
      description: String(r.description || ""),
      scope: r.scope === "all" ? "all" : "branch",
      admins: { active: Number(r.admins?.active) || 0, disabled: Number(r.admins?.disabled) || 0 },
    })),
    permissions: (v.permissions as Array<Record<string, unknown>>).map((p) => ({ code: String(p.code || ""), description: String(p.description || "") })),
    matrix: (v.matrix as Array<Record<string, unknown>>).map((m) => ({
      role: String(m.role || ""),
      source: String(m.source || ""),
      permissions: Array.isArray(m.permissions) ? m.permissions.map(String) : [],
    })),
    assignableRoles: Array.isArray(v.assignableRoles) ? (v.assignableRoles as unknown[]).map(String) : [],
    managePermission: typeof v.managePermission === "string" ? v.managePermission : "",
  };
}

function parseMe(value: unknown): { user: AdminUser; permissions: string[] } | null {
  const v = value as { user?: Record<string, unknown>; permissions?: unknown } | null;
  const u = v?.user;
  if (!u || typeof u !== "object" || !Number.isFinite(Number(u.id))) return null;
  return {
    user: {
      id: Number(u.id),
      email: typeof u.email === "string" ? u.email : "",
      name: typeof u.name === "string" ? u.name : "",
      role: typeof u.role === "string" ? u.role : "",
      branchId: u.branchId == null || u.branchId === "" ? null : Number(u.branchId),
    },
    permissions: Array.isArray(v?.permissions) ? [...new Set((v!.permissions as unknown[]).map(String))] : [],
  };
}

function roleLabel(code: string, roles: RbacRole[]): string {
  return ROLE_LABELS[code] || roles.find((r) => r.code === code)?.name || code || "—";
}

function permissionLabel(code: string): string {
  return PERMISSION_LABELS[code] || "Boshqa ruxsat";
}

function groupOf(code: string): string {
  return GROUP_LABELS[code.split(":")[0]] || "Boshqa ruxsatlar";
}

function securityError(err: unknown): LoadError {
  const kind = loadError(err).kind;
  return { kind, message: SECURITY_ERROR_COPY[kind] };
}

function parsePage(value: unknown, fallbackLimit: number): Page {
  const p = (value || {}) as Record<string, unknown>;
  return { offset: Number(p.offset) || 0, limit: Number(p.limit) || fallbackLimit, total: Number(p.total) || 0, hasMore: p.hasMore === true };
}

const isoOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);

function parseSession(value: unknown): SessionRow | null {
  const s = value as Record<string, unknown> | null;
  if (!s || typeof s !== "object" || !Number.isFinite(Number(s.id))) return null;
  const d = s.device as Record<string, unknown> | null;
  return {
    id: Number(s.id),
    status: s.status === "revoked" ? "revoked" : s.status === "expired" ? "expired" : "active",
    current: s.current === true,
    createdAt: isoOrNull(s.createdAt),
    expiresAt: isoOrNull(s.expiresAt),
    revokedAt: isoOrNull(s.revokedAt),
    lastSeenAt: isoOrNull(s.lastSeenAt),
    device: d && typeof d === "object"
      ? { label: isoOrNull(d.label), browser: isoOrNull(d.browser), os: isoOrNull(d.os), recognized: d.recognized === true }
      : null,
  };
}

function parseSessions(value: unknown): SessionsData | null {
  const v = value as Record<string, any> | null;
  if (!v || !Array.isArray(v.sessions)) return null;
  return {
    sessions: v.sessions.map(parseSession).filter((s: SessionRow | null): s is SessionRow => Boolean(s)),
    page: parsePage(v.pagination, DRAWER_PAGE_SIZE),
    summary: { active: Number(v.summary?.active) || 0, expired: Number(v.summary?.expired) || 0, revoked: Number(v.summary?.revoked) || 0 },
    currentKnown: v.currentKnown === true,
    ipStored: v.stored?.ip === true,
  };
}

function parseEvent(value: unknown): AuthEvent | null {
  const e = value as Record<string, unknown> | null;
  if (!e || typeof e !== "object" || !Number.isFinite(Number(e.id)) || typeof e.event !== "string") return null;
  const a = e.admin as Record<string, unknown> | null;
  const ip = e.ip as Record<string, unknown> | null;
  const ua = e.userAgent as Record<string, unknown> | null;
  const details: AuthEvent["details"] = {};
  if (e.details && typeof e.details === "object") {
    for (const [k, v] of Object.entries(e.details as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") details[k] = v;
    }
  }
  return {
    id: Number(e.id),
    event: e.event,
    success: e.success === true,
    reason: typeof e.reason === "string" && e.reason ? e.reason : null,
    adminId: e.adminId == null ? null : Number(e.adminId),
    admin: a && typeof a === "object" && typeof a.email === "string"
      ? { id: Number(a.id), name: typeof a.name === "string" ? a.name : "", email: a.email }
      : null,
    details,
    ip: {
      stored: ip?.stored === true,
      value: typeof ip?.value === "string" && /^[0-9a-f:.]{2,45}$/i.test(ip.value) ? ip.value : null,
    },
    userAgent: {
      stored: ua?.stored === true,
      summary: typeof ua?.summary === "string" && ua.summary ? ua.summary.slice(0, 60) : null,
    },
    createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
  };
}

function parseEvents(value: unknown, fallbackLimit: number): EventsData | null {
  const v = value as Record<string, any> | null;
  if (!v || !Array.isArray(v.events)) return null;
  return {
    events: v.events.map(parseEvent).filter((e: AuthEvent | null): e is AuthEvent => Boolean(e)),
    page: parsePage(v.pagination, fallbackLimit),
    eventTypes: Array.isArray(v.eventTypes) ? v.eventTypes.map(String) : [],
    ipStored: v.stored?.ip === true,
    userAgentStored: v.stored?.userAgent === true,
  };
}

function eventParams(f: EventFilters, limit: number, offset: number): URLSearchParams {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (f.adminId) params.set("adminId", f.adminId);
  if (f.event) params.set("event", f.event);
  if (f.success) params.set("success", f.success);
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo) params.set("dateTo", f.dateTo);
  return params;
}

function deviceText(device: SessionDevice): string {
  if (!device) return "Saqlanmagan";
  const parts = [device.label, [device.browser, device.os].filter(Boolean).join(" · ")].filter(Boolean);
  return parts.length ? parts.join(" — ") : "Noma'lum qurilma";
}

function eventDetailText(details: AuthEvent["details"]): string {
  const out: string[] = [];
  if (typeof details.permission === "string") out.push(`Ruxsat: ${details.permission}`);
  if (typeof details.role === "string") out.push(`Rol: ${details.role}`);
  if (details.resourceBranchId != null) out.push(`Filial #${details.resourceBranchId}`);
  if (typeof details.count === "number") out.push(`${details.count} ta sessiya`);
  if (typeof details.revoked === "boolean") out.push(details.revoked ? "Sessiya yopildi" : "Ochiq sessiya topilmadi");
  if (details.byAdminId != null) out.push(`Bajargan: admin #${details.byAdminId}`);
  if (typeof details.expiresAt === "string") out.push(`Tugaydi: ${fmtDate(details.expiresAt)}`);
  return out.join(" · ");
}

function eventIpText(ip: AuthEvent["ip"]): string {
  if (!ip.stored) return "Saqlanmagan";
  return ip.value || "Noma'lum";
}

function eventUserAgentText(ua: AuthEvent["userAgent"]): string {
  if (!ua.stored) return "Saqlanmagan";
  return ua.summary || "Saqlangan (aniqlanmadi)";
}

function SessionPill(props: { status: SessionStatus }) {
  const tone = props.status === "active" ? "ok" : props.status === "revoked" ? "danger" : "neutral";
  return <StatusBadge tone={tone}>{SESSION_STATUS_LABELS[props.status]}</StatusBadge>;
}

function EventsTable(props: { events: AuthEvent[]; showAdmin: boolean }) {
  const ipLabel = props.showAdmin ? "IP" : "IP manzil";
  const uaLabel = props.showAdmin ? "Qurilma" : "User-Agent";
  return (
    <div className="ac-table ac-events">
      <DataTable>
        <thead>
          <tr>
            <th scope="col">Vaqt</th>
            <th scope="col">Hodisa</th>
            <th scope="col">Natija</th>
            {props.showAdmin ? <th scope="col">Admin</th> : null}
            <th scope="col">{ipLabel}</th>
            <th scope="col">{uaLabel}</th>
          </tr>
        </thead>
        <tbody>
          {props.events.map((e) => {
            const detailLine = eventDetailText(e.details);
            return (
              <tr key={e.id}>
                <td data-label="Vaqt" className="ac-num">{fmtDate(e.createdAt)}</td>
                <td data-label="Hodisa">
                  <div>{EVENT_LABELS[e.event] || e.event}</div>
                  <code className="ac-code">{e.event}</code>
                  {e.reason ? <div className="ac-sub">{REASON_LABELS[e.reason] || e.reason}</div> : null}
                  {detailLine ? <div className="ac-sub">{detailLine}</div> : null}
                </td>
                <td data-label="Natija">
                  {e.success ? <StatusBadge tone="ok">Muvaffaqiyatli</StatusBadge> : <StatusBadge tone="danger">Rad etilgan</StatusBadge>}
                </td>
                {props.showAdmin ? (
                  <td data-label="Admin">
                    {e.admin ? (
                      <>
                        <div className="ac-name">{e.admin.name || e.admin.email}</div>
                        <div className="ac-sub">{e.admin.email}</div>
                      </>
                    ) : e.adminId != null ? (
                      <span className="ac-sub">Admin #{e.adminId}</span>
                    ) : (
                      <span className="ac-sub">Aniqlanmagan (email saqlanmaydi)</span>
                    )}
                  </td>
                ) : null}
                <td data-label={ipLabel}>
                  {e.ip.stored && e.ip.value ? <code className="ac-code ac-ip">{e.ip.value}</code> : <span className="ac-sub">{eventIpText(e.ip)}</span>}
                </td>
                <td data-label={uaLabel}>
                  {e.userAgent.stored && e.userAgent.summary ? e.userAgent.summary : <span className="ac-sub">{eventUserAgentText(e.userAgent)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}

const DRAWER_TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "profile", label: "Profil" },
  { id: "sessions", label: "Sessiyalar" },
  { id: "events", label: "Auth hodisalari" },
];

/** WAI-ARIA tabs: roving tabindex, Arrow/Home/End move focus and selection; Enter/Space activate. */
function DrawerTabs(props: { active: DrawerTab; onChange: (tab: DrawerTab) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = DRAWER_TABS.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : e.key === "Home" ? 0
          : e.key === "End" ? last
            : -1;
    if (next < 0) return;
    e.preventDefault();
    props.onChange(DRAWER_TABS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs ac-tabs" role="tablist" aria-label="Administrator bo‘limlari">
      {DRAWER_TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          id={`ac-tab-${t.id}`}
          aria-controls={`ac-tabpanel-${t.id}`}
          aria-selected={props.active === t.id}
          tabIndex={props.active === t.id ? 0 : -1}
          className={`tab${props.active === t.id ? " active" : ""}`}
          onClick={() => props.onChange(t.id)}
          onKeyDown={onKey(i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Mark(props: { on: boolean; label: string }) {
  return props.on ? (
    <span className="ac-mark is-on" title={props.label}>
      <Check size={14} strokeWidth={2.25} aria-hidden="true" />
      <span>Bor</span>
    </span>
  ) : (
    <span className="ac-mark" title={props.label}>
      <Minus size={14} strokeWidth={2} aria-hidden="true" />
      <span>Yo‘q</span>
    </span>
  );
}

function StatusPill(props: { status: AdminStatus }) {
  return props.status === "active"
    ? <StatusBadge tone="ok">Faol</StatusBadge>
    : <StatusBadge tone="danger">Faolsiz</StatusBadge>;
}

function Section(props: { id: string; title: string; lead?: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`ac-section${props.className ? ` ${props.className}` : ""}`} aria-labelledby={props.id}>
      <div className="ac-section-head">
        <div className="ac-section-text">
          <h2 id={props.id} className="ac-section-title">{props.title}</h2>
          {props.lead ? <p className="ac-section-lead">{props.lead}</p> : null}
        </div>
        {props.aside}
      </div>
      {props.children}
    </section>
  );
}

export function AdminAccessPage(props: { token?: string | null; branches?: BranchRef[] }) {
  const token = props.token || "";
  const [me, setMe] = useState<{ user: AdminUser; permissions: string[] } | null>(null);
  const [rbac, setRbac] = useState<Rbac | null>(null);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [page, setPage] = useState<Page>({ offset: 0, limit: PAGE_SIZE, total: 0, hasMore: false });
  const [error, setError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ q: "", role: "", branchId: "", status: "" });
  const [offset, setOffset] = useState(0);

  const [panel, setPanel] = useState<Panel>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<LoadError | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const [drawerTab, setDrawerTab] = useState<DrawerTab>("profile");
  const [sessionsData, setSessionsData] = useState<SessionsData | null>(null);
  const [sessionsFail, setSessionsFail] = useState<LoadError | null>(null);
  const [sessionStatus, setSessionStatus] = useState("");
  const [sessionOffset, setSessionOffset] = useState(0);
  const [sessionsFeedback, setSessionsFeedback] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<SessionRow | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [adminEvents, setAdminEvents] = useState<EventsData | null>(null);
  const [adminEventsFail, setAdminEventsFail] = useState<LoadError | null>(null);
  const [adminEventFilters, setAdminEventFilters] = useState({ event: "", success: "" });
  const [adminEventOffset, setAdminEventOffset] = useState(0);
  const [events, setEvents] = useState<EventsData | null>(null);
  const [eventsFail, setEventsFail] = useState<LoadError | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventFilters, setEventFilters] = useState<EventFilters>({ event: "", success: "", dateFrom: "", dateTo: "", adminId: "" });
  const [eventOffset, setEventOffset] = useState(0);

  const loadSeq = useRef(0);
  const detailSeq = useRef(0);
  const sessionsSeq = useRef(0);
  const adminEventsSeq = useRef(0);
  const eventsSeq = useRef(0);

  const branches = props.branches || [];
  const roles = rbac?.roles || [];
  const canManage = Boolean(me && rbac && me.permissions.includes(rbac.managePermission));

  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (filters.q) params.set("q", filters.q);
    if (filters.role) params.set("role", filters.role);
    if (filters.branchId) params.set("branchId", filters.branchId);
    if (filters.status) params.set("status", filters.status);
    let failure: LoadError | null = null;
    let nextMe = me;
    let nextRbac = rbac;
    let list = null as ListResponse | null;
    try {
      const [meRes, rbacRes, listRes] = await Promise.all([
        request("/api/admin/me", token),
        request("/api/admin/rbac", token),
        request(`/api/admin/users?${params.toString()}`, token),
      ]);
      nextMe = parseMe(meRes);
      nextRbac = parseRbac(rbacRes);
      list = listRes as ListResponse;
      if (!nextMe || !nextRbac || !Array.isArray(list?.users)) failure = { kind: "failed", message: ERROR_COPY.failed };
    } catch (err) {
      failure = loadError(err);
    }
    if (seq !== loadSeq.current) return;
    setError(failure);
    if (!failure && list) {
      setMe(nextMe);
      setRbac(nextRbac);
      setRows((list.users || []).map(parseRow).filter((r): r is AdminRow => Boolean(r)));
      const p = list.pagination || {};
      setPage({ offset: Number(p.offset) || 0, limit: Number(p.limit) || PAGE_SIZE, total: Number(p.total) || 0, hasMore: p.hasMore === true });
    }
    if (failure) setPanel(null);
    setLoading(false);
  }

  async function loadDetail(id: number) {
    const seq = ++detailSeq.current;
    setDetail(null);
    setDetailError(null);
    try {
      const next = parseDetail(await request(`/api/admin/users/${id}`, token));
      if (seq !== detailSeq.current) return;
      if (next) setDetail(next);
      else setDetailError({ kind: "failed", message: ERROR_COPY.failed });
    } catch (err) {
      if (seq !== detailSeq.current) return;
      setDetailError(loadError(err));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, offset, filters]);

  const openId = panel && panel.kind !== "create" ? panel.id : null;
  useEffect(() => {
    if (openId != null) void loadDetail(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function applySearch(e: FormEvent) {
    e.preventDefault();
    setOffset(0);
    setFilters((f) => ({ ...f, q: query.trim() }));
  }

  function setFilter(key: "role" | "branchId" | "status", value: string) {
    setOffset(0);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function resetFilters() {
    setQuery("");
    setOffset(0);
    setFilters({ q: "", role: "", branchId: "", status: "" });
  }

  function openView(id: number) {
    setNotice(null);
    setFormMsg("");
    setDrawerTab("profile");
    setSessionStatus("");
    setSessionOffset(0);
    setSessionsFeedback(null);
    setSessionsData(null);
    setAdminEvents(null);
    setAdminEventFilters({ event: "", success: "" });
    setAdminEventOffset(0);
    setPanel({ kind: "view", id });
  }

  function closePanel() {
    if (saving) return;
    setPanel(null);
    setForm(emptyForm);
    setShowPassword(false);
    setFormMsg("");
  }

  function startCreate() {
    setNotice(null);
    setFormMsg("");
    setShowPassword(false);
    setForm({ ...emptyForm, role: rbac?.assignableRoles.includes("cashier") ? "cashier" : rbac?.assignableRoles[0] || "" });
    setPanel({ kind: "create" });
  }

  function startEdit(d: Detail) {
    setFormMsg("");
    setForm({ name: d.user.name, email: d.user.email, role: d.user.role, branchId: d.user.branchId == null ? "" : String(d.user.branchId), password: "" });
    setPanel({ kind: "edit", id: d.user.id });
  }

  function startPassword(d: Detail) {
    setFormMsg("");
    setShowPassword(false);
    setForm({ ...emptyForm });
    setPanel({ kind: "password", id: d.user.id });
  }

  function validateIdentity(): string {
    if (form.name.trim().length < 2) return "Ism kamida 2 ta belgidan iborat bo‘lsin.";
    if (!EMAIL_PATTERN.test(form.email.trim())) return "Email noto‘g‘ri.";
    if (!form.role) return "Rolni tanlang.";
    if (!isHqRole(form.role) && !form.branchId) return "Bu rol uchun filialni tanlang.";
    return "";
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const invalid = validateIdentity() || (form.password.length < PASSWORD_MIN ? `Parol kamida ${PASSWORD_MIN} ta belgidan iborat bo‘lsin.` : "");
    if (invalid) return setFormMsg(invalid);
    setSaving(true);
    setFormMsg("");
    try {
      const res = await request("/api/admin/users", token, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          branchId: isHqRole(form.role) ? null : Number(form.branchId),
          password: form.password,
        }),
      });
      const created = parseRow((res as { user?: unknown }).user);
      setPanel(null);
      setForm(emptyForm);
      setShowPassword(false);
      setNotice({ tone: "ok", text: `Administrator qo‘shildi: ${created?.email || ""}` });
      await load();
    } catch (err) {
      setFormMsg(mutationError(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const invalid = validateIdentity();
    if (invalid) return setFormMsg(invalid);
    const nextBranch = isHqRole(form.role) ? null : Number(form.branchId);
    const changes: Record<string, unknown> = {};
    if (form.name.trim() !== detail.user.name) changes.name = form.name.trim();
    if (form.email.trim().toLowerCase() !== detail.user.email) changes.email = form.email.trim();
    if (form.role !== detail.user.role) changes.role = form.role;
    if (nextBranch !== detail.user.branchId) changes.branchId = nextBranch;
    if (!Object.keys(changes).length) return setFormMsg("O‘zgarish yo‘q.");
    setSaving(true);
    setFormMsg("");
    try {
      await request(`/api/admin/users/${detail.user.id}`, token, { method: "PATCH", body: JSON.stringify(changes) });
      setPanel({ kind: "view", id: detail.user.id });
      setNotice({ tone: "ok", text: "Administrator ma'lumotlari yangilandi." });
      await Promise.all([load(), loadDetail(detail.user.id)]);
    } catch (err) {
      setFormMsg(mutationError(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    if (form.password.length < PASSWORD_MIN) return setFormMsg(`Parol kamida ${PASSWORD_MIN} ta belgidan iborat bo‘lsin.`);
    setSaving(true);
    setFormMsg("");
    try {
      const res = await request(`/api/admin/users/${detail.user.id}/password`, token, {
        method: "PATCH",
        body: JSON.stringify({ password: form.password }),
      });
      const revoked = Number((res as { revokedSessions?: number }).revokedSessions) || 0;
      setForm(emptyForm);
      setShowPassword(false);
      setPanel({ kind: "view", id: detail.user.id });
      setNotice({ tone: "ok", text: `Parol yangilandi. Bekor qilingan sessiyalar: ${revoked} ta.` });
      await loadDetail(detail.user.id);
    } catch (err) {
      setFormMsg(mutationError(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: AdminStatus) {
    if (!detail) return;
    setSaving(true);
    setFormMsg("");
    try {
      const res = await request(`/api/admin/users/${detail.user.id}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const revoked = Number((res as { revokedSessions?: number }).revokedSessions) || 0;
      setConfirmDisable(false);
      setNotice({
        tone: "ok",
        text: status === "disabled"
          ? `Administrator faolsizlantirildi. Bekor qilingan sessiyalar: ${revoked} ta.`
          : "Administrator qayta faollashtirildi.",
      });
      await Promise.all([load(), loadDetail(detail.user.id)]);
    } catch (err) {
      setConfirmDisable(false);
      setFormMsg(mutationError(err));
    } finally {
      setSaving(false);
    }
  }

  const rowKeys = (id: number) => (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openView(id);
    }
  };

  async function loadSessions(id: number) {
    const seq = ++sessionsSeq.current;
    setSessionsFail(null);
    const params = new URLSearchParams({ limit: String(DRAWER_PAGE_SIZE), offset: String(sessionOffset) });
    if (sessionStatus) params.set("status", sessionStatus);
    try {
      const next = parseSessions(await request(`/api/admin/users/${id}/sessions?${params.toString()}`, token));
      if (seq !== sessionsSeq.current) return;
      if (next) setSessionsData(next);
      else setSessionsFail({ kind: "failed", message: SECURITY_ERROR_COPY.failed });
    } catch (err) {
      if (seq !== sessionsSeq.current) return;
      setSessionsFail(securityError(err));
    }
  }

  async function loadAdminEvents(id: number) {
    const seq = ++adminEventsSeq.current;
    setAdminEventsFail(null);
    const params = eventParams({ ...adminEventFilters, dateFrom: "", dateTo: "", adminId: String(id) }, DRAWER_PAGE_SIZE, adminEventOffset);
    try {
      const next = parseEvents(await request(`/api/admin/auth-events?${params.toString()}`, token), DRAWER_PAGE_SIZE);
      if (seq !== adminEventsSeq.current) return;
      if (next) setAdminEvents(next);
      else setAdminEventsFail({ kind: "failed", message: SECURITY_ERROR_COPY.failed });
    } catch (err) {
      if (seq !== adminEventsSeq.current) return;
      setAdminEventsFail(securityError(err));
    }
  }

  async function loadEvents() {
    const seq = ++eventsSeq.current;
    setEventsLoading(true);
    let next: EventsData | null = null;
    let failure: LoadError | null = null;
    try {
      next = parseEvents(await request(`/api/admin/auth-events?${eventParams(eventFilters, EVENTS_PAGE_SIZE, eventOffset).toString()}`, token), EVENTS_PAGE_SIZE);
      if (!next) failure = { kind: "failed", message: SECURITY_ERROR_COPY.failed };
    } catch (err) {
      failure = securityError(err);
    }
    if (seq !== eventsSeq.current) return;
    setEventsFail(failure);
    if (next) setEvents(next);
    setEventsLoading(false);
  }

  function setEventFilter(key: keyof EventFilters, value: string) {
    setEventOffset(0);
    setEventFilters((f) => ({ ...f, [key]: value }));
  }

  function setAdminEventFilter(key: "event" | "success", value: string) {
    setAdminEventOffset(0);
    setAdminEventFilters((f) => ({ ...f, [key]: value }));
  }

  async function revokeSession() {
    if (!detail || !revokeTarget) return;
    const adminId = detail.user.id;
    setRevoking(true);
    setSessionsFeedback(null);
    try {
      const res = await request(`/api/admin/users/${adminId}/sessions/${revokeTarget.id}/revoke`, token, { method: "POST" });
      const result = res as { changed?: boolean; endedCurrent?: boolean };
      setRevokeTarget(null);
      if (result.endedCurrent) {
        setNotice({ tone: "warn", text: "Joriy sessiyangiz bekor qilindi. Qayta kiring." });
        await load();
        return;
      }
      setSessionsFeedback({ tone: "ok", text: result.changed ? "Sessiya bekor qilindi." : "Sessiya allaqachon bekor qilingan edi." });
      await Promise.all([loadSessions(adminId), loadDetail(adminId), loadEvents()]);
    } catch (err) {
      setRevokeTarget(null);
      setSessionsFeedback({ tone: "warn", text: mutationError(err) });
    } finally {
      setRevoking(false);
    }
  }

  const viewing = panel?.kind === "view" ? panel.id : null;
  useEffect(() => {
    if (viewing != null && drawerTab === "sessions") void loadSessions(viewing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, drawerTab, sessionStatus, sessionOffset]);

  useEffect(() => {
    if (viewing != null && drawerTab === "events") void loadAdminEvents(viewing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, drawerTab, adminEventFilters, adminEventOffset]);

  useEffect(() => {
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eventFilters, eventOffset]);

  const matrixGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const p of rbac?.permissions || []) {
      const g = groupOf(p.code);
      groups.set(g, [...(groups.get(g) || []), p.code]);
    }
    return [...groups.entries()];
  }, [rbac]);
  const grantsByRole = useMemo(
    () => new Map((rbac?.matrix || []).map((m) => [m.role, new Set(m.permissions)] as const)),
    [rbac],
  );
  const matrixUnknown = useMemo(() => {
    const known = new Set((rbac?.permissions || []).map((p) => p.code));
    return [...new Set((rbac?.matrix || []).flatMap((m) => m.permissions))].filter((c) => !known.has(c));
  }, [rbac]);

  const hasFilters = Boolean(filters.q || filters.role || filters.branchId || filters.status);
  const retryable = error && (error.kind === "failed" || error.kind === "network" || error.kind === "notfound");
  const initialLoading = loading && !me;
  const editing = panel?.kind === "edit";
  const creating = panel?.kind === "create";
  const selfOpen = Boolean(detail?.isSelf);
  const formRoles = (rbac?.assignableRoles || []).filter((code) => !editing || code === form.role || !selfOpen);

  const drawerTitle = creating
    ? "Yangi administrator"
    : detail
      ? detail.user.name || detail.user.email
      : "Administrator";

  const identityFields = (
    <div className="bs-form-grid">
      <label className="filter-field bs-form-full">
        <span className="filter-label">Ism *</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} autoComplete="off" required />
      </label>
      <label className="filter-field bs-form-full">
        <span className="filter-label">Email *</span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          maxLength={254}
          autoComplete="off"
          inputMode="email"
          required
        />
      </label>
      <label className="filter-field">
        <span className="filter-label">Rol *</span>
        <select
          value={form.role}
          disabled={editing && selfOpen}
          onChange={(e) => setForm({ ...form, role: e.target.value, branchId: isHqRole(e.target.value) ? "" : form.branchId })}
        >
          {!form.role ? <option value="">Tanlang</option> : null}
          {formRoles.map((code) => (
            <option key={code} value={code}>{roleLabel(code, roles)}</option>
          ))}
        </select>
      </label>
      <label className="filter-field">
        <span className="filter-label">Filial{isHqRole(form.role) ? "" : " *"}</span>
        <select
          value={isHqRole(form.role) ? "" : form.branchId}
          disabled={isHqRole(form.role) || (editing && selfOpen)}
          onChange={(e) => setForm({ ...form, branchId: e.target.value })}
        >
          <option value="">{isHqRole(form.role) ? "Barcha filiallar (HQ)" : "Tanlang"}</option>
          {branches.map((b) => (
            <option key={b.id} value={String(b.id)}>{b.name || `Filial #${b.id}`}</option>
          ))}
        </select>
      </label>
    </div>
  );

  const passwordField = (label: string) => (
    <div className="bs-form-grid">
      <label className="filter-field bs-form-full">
        <span className="filter-label">{label}</span>
        <span className="ac-pw">
          <input
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            maxLength={128}
            required
          />
          <button
            type="button"
            className="ac-pw-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={15} strokeWidth={2} aria-hidden="true" /> : <Eye size={15} strokeWidth={2} aria-hidden="true" />}
          </button>
        </span>
      </label>
      <p className="bs-note bs-form-full">Kamida {PASSWORD_MIN} ta belgi. Parol faqat xesh ko‘rinishida saqlanadi va keyin ko‘rsatilmaydi.</p>
    </div>
  );

  return (
    <div className="access-page ac-page page-module">
      <AdminPageHeader
        title="Adminlar"
        description="Tizim operatorlari, rollar va ruxsatlarni boshqarish."
        meta={
          <span className="ac-meta">
            <span className="ac-chip">Faqat HQ</span>
            <span className="ac-chip is-ok">RBAC: serverda</span>
            <span className="ac-chip is-ok">Adminlar API: ulangan</span>
          </span>
        }
        actions={
          <span className="ac-actions">
            <button
              className={`btn-secondary ac-refresh${loading ? " is-busy" : ""}`}
              type="button"
              disabled={loading}
              onClick={() => { void load(); void loadEvents(); }}
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
              Yangilash
            </button>
            {canManage ? (
              <button className="btn-primary ac-add" type="button" onClick={startCreate} disabled={initialLoading}>
                <Plus size={14} strokeWidth={2.25} aria-hidden="true" />
                Admin qo‘shish
              </button>
            ) : null}
          </span>
        }
      />

      {notice ? <FeedbackBanner tone={notice.tone}>{notice.text}</FeedbackBanner> : null}

      {error ? (
        <ErrorState message={error.message} onRetry={retryable ? () => void load() : undefined} />
      ) : initialLoading ? (
        <LoadingBlock rows={5} label="Administratorlar yuklanmoqda…" />
      ) : (
        <div className={`ac-sections${loading ? " is-refreshing" : ""}`}>
          <Section
            id="ac-list"
            className="ac-span"
            title="Administratorlar"
            lead={
              me ? (
                <>Joriy sessiya: <strong>{me.user.name || me.user.email}</strong> · {roleLabel(me.user.role, roles)}. Qatorni oching — rol, filial, ruxsatlar va sessiyalar.</>
              ) : null
            }
            aside={<span className="ac-source">Jami: {page.total} ta</span>}
          >
            <div className="ac-filters">
              <FilterBar>
                <form className="bs-search" role="search" onSubmit={applySearch}>
                  <FilterField label="Qidiruv" grow>
                    <span className="bs-search-box">
                      <Search size={15} strokeWidth={2} aria-hidden="true" className="bs-search-icon" />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ism yoki email"
                        enterKeyHint="search"
                        maxLength={64}
                      />
                    </span>
                  </FilterField>
                  <button className="btn-secondary bs-search-go" type="submit" disabled={loading}>Qidirish</button>
                </form>
                <FilterField label="Rol">
                  <select value={filters.role} onChange={(e) => setFilter("role", e.target.value)}>
                    <option value="">Barchasi</option>
                    {roles.map((r) => <option key={r.code} value={r.code}>{roleLabel(r.code, roles)}</option>)}
                  </select>
                </FilterField>
                <FilterField label="Filial">
                  <select value={filters.branchId} onChange={(e) => setFilter("branchId", e.target.value)} disabled={!branches.length}>
                    <option value="">Barchasi</option>
                    {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name || `Filial #${b.id}`}</option>)}
                  </select>
                </FilterField>
                <FilterField label="Holat">
                  <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                    <option value="">Barchasi</option>
                    <option value="active">Faol</option>
                    <option value="disabled">Faolsiz</option>
                  </select>
                </FilterField>
                {hasFilters ? (
                  <button className="btn-tertiary bs-clear" type="button" onClick={resetFilters}>Tozalash</button>
                ) : null}
              </FilterBar>
            </div>
            {rows.length ? (
              <div className="ac-table">
                <DataTable>
                  <thead>
                    <tr>
                      <th scope="col">Admin</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Filial</th>
                      <th scope="col">Holat</th>
                      <th scope="col">Yangilangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`ac-row${row.status === "disabled" ? " is-disabled" : ""}`}
                        tabIndex={0}
                        aria-selected={openId === row.id}
                        aria-label={`${row.name || row.email} — tafsilot`}
                        onClick={() => openView(row.id)}
                        onKeyDown={rowKeys(row.id)}
                      >
                        <td data-label="Admin">
                          <div className="ac-identity">
                            <span className="ac-name">{row.name || "—"}</span>
                            {me?.user.id === row.id ? <StatusBadge tone="info">Joriy hisob</StatusBadge> : null}
                          </div>
                          <div className="ac-sub">{row.email}</div>
                        </td>
                        <td data-label="Rol">
                          <div>{roleLabel(row.role, roles)}</div>
                          <code className="ac-code">{row.role}</code>
                        </td>
                        <td data-label="Filial">{row.branchId == null ? "Barcha filiallar (HQ)" : row.branchName || `Filial #${row.branchId}`}</td>
                        <td data-label="Holat"><StatusPill status={row.status} /></td>
                        <td data-label="Yangilangan" className="ac-num">{fmtDate(row.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            ) : (
              <div className="ac-empty">
                <EmptyState
                  title={hasFilters ? "Mos administrator topilmadi" : "Administratorlar yo‘q"}
                  description={hasFilters ? "Qidiruv yoki filtrlarni o‘zgartiring." : undefined}
                />
              </div>
            )}
            <div className="ac-pager">
              <PaginationBar
                offset={page.offset}
                limit={page.limit}
                total={page.total}
                hasMore={page.hasMore}
                loading={loading}
                onPrev={() => setOffset(Math.max(0, page.offset - page.limit))}
                onNext={() => setOffset(page.offset + page.limit)}
              />
            </div>
          </Section>

          <Section
            id="ac-events"
            className="ac-span"
            title="Kirish hodisalari"
            lead="Administratorlarning kirish, chiqish, rad etish va sessiya hodisalari (GET /api/admin/auth-events). Faqat o‘qish."
            aside={<span className="ac-source">Jami: {events?.page.total ?? 0} ta</span>}
          >
            <div className="ac-filters">
              <FilterBar>
                <FilterField label="Hodisa">
                  <select value={eventFilters.event} onChange={(e) => setEventFilter("event", e.target.value)}>
                    <option value="">Barchasi</option>
                    {(events?.eventTypes || []).map((code) => <option key={code} value={code}>{EVENT_LABELS[code] || code}</option>)}
                  </select>
                </FilterField>
                <FilterField label="Natija">
                  <select value={eventFilters.success} onChange={(e) => setEventFilter("success", e.target.value)}>
                    <option value="">Barchasi</option>
                    <option value="true">Muvaffaqiyatli</option>
                    <option value="false">Rad etilgan</option>
                  </select>
                </FilterField>
                <FilterField label="Sanadan">
                  <input type="date" value={eventFilters.dateFrom} max={eventFilters.dateTo || undefined} onChange={(e) => setEventFilter("dateFrom", e.target.value)} />
                </FilterField>
                <FilterField label="Sanagacha">
                  <input type="date" value={eventFilters.dateTo} min={eventFilters.dateFrom || undefined} onChange={(e) => setEventFilter("dateTo", e.target.value)} />
                </FilterField>
                <FilterField label="Admin">
                  <select value={eventFilters.adminId} onChange={(e) => setEventFilter("adminId", e.target.value)}>
                    <option value="">Barchasi</option>
                    {rows.map((r) => <option key={r.id} value={String(r.id)}>{r.name || r.email}</option>)}
                  </select>
                </FilterField>
                {eventFilters.event || eventFilters.success || eventFilters.dateFrom || eventFilters.dateTo || eventFilters.adminId ? (
                  <button
                    className="btn-tertiary bs-clear"
                    type="button"
                    onClick={() => { setEventOffset(0); setEventFilters({ event: "", success: "", dateFrom: "", dateTo: "", adminId: "" }); }}
                  >
                    Tozalash
                  </button>
                ) : null}
              </FilterBar>
            </div>
            <p className="ac-note">
              {events && !events.ipStored && !events.userAgentStored
                ? "IP manzil va qurilma kirish hodisalarida saqlanmaydi. Noto‘g‘ri email bilan urinishlarda admin aniqlanmaydi — email yozilmaydi."
                : TELEMETRY_NOTE}
            </p>
            {eventsFail ? (
              <ErrorState message={eventsFail.message} onRetry={eventsFail.kind === "forbidden" || eventsFail.kind === "session" ? undefined : () => void loadEvents()} />
            ) : eventsLoading && !events ? (
              <LoadingBlock rows={4} label="Kirish hodisalari yuklanmoqda…" />
            ) : events && events.events.length ? (
              <EventsTable events={events.events} showAdmin />
            ) : (
              <div className="ac-empty">
                <EmptyState title="Hodisa topilmadi" description="Filtrlarni o‘zgartiring yoki sana oralig‘ini kengaytiring." />
              </div>
            )}
            {events ? (
              <div className="ac-pager">
                <PaginationBar
                  offset={events.page.offset}
                  limit={events.page.limit}
                  total={events.page.total}
                  hasMore={events.page.hasMore}
                  loading={eventsLoading}
                  onPrev={() => setEventOffset(Math.max(0, events.page.offset - events.page.limit))}
                  onNext={() => setEventOffset(events.page.offset + events.page.limit)}
                />
              </div>
            ) : null}
          </Section>

          <Section
            id="ac-roles"
            title="Rollar"
            lead="Serverdagi rollar (GET /api/admin/rbac). Yangi rol yaratilmaydi — rollar migratsiyada belgilanadi."
          >
            <div className="ac-table">
              <DataTable>
                <thead>
                  <tr>
                    <th scope="col">Rol</th>
                    <th scope="col">Ruxsatlar</th>
                    <th scope="col">Doira</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.code}>
                      <td data-label="Rol">
                        <div className="ac-identity">
                          <span className="ac-name">{roleLabel(role.code, roles)}</span>
                        </div>
                        <code className="ac-code">{role.code}</code>
                        <div className="ac-sub">Faol: {role.admins.active} · Faolsiz: {role.admins.disabled}</div>
                      </td>
                      <td data-label="Ruxsatlar" className="ac-num">{grantsByRole.get(role.code)?.size ?? 0} ta</td>
                      <td data-label="Doira">{role.scope === "all" ? "Barcha filiallar" : "Faqat biriktirilgan filial"}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </Section>

          <Section id="ac-mgmt" title="Hali ulanmagan" lead="Bu amallar uchun server API yo‘q, shuning uchun tugmalar ko‘rsatilmaydi.">
            <ul className="ac-rows">
              {NOT_CONNECTED.map((c) => (
                <li key={c.title} className="ac-row-item">
                  <div className="ac-row-main">
                    <div className="ac-row-title">{c.title}</div>
                    <p className="ac-row-desc">{c.desc}</p>
                  </div>
                  <StatusBadge tone="warn">{operatorCapabilityLabel("API_REQUIRED")}</StatusBadge>
                </li>
              ))}
              <li className="ac-row-item">
                <div className="ac-row-main">
                  <div className="ac-row-title">Hisobni butunlay olib tashlash</div>
                  <p className="ac-row-desc">Ataylab yo‘q: audit tarixi saqlanishi uchun hisob faolsizlantiriladi.</p>
                </div>
                <StatusBadge tone="neutral">Faolsizlantirish</StatusBadge>
              </li>
            </ul>
          </Section>

          <Section
            id="ac-matrix"
            className="ac-span"
            title="Ruxsatlar matritsasi"
            lead="Rol × ruxsat — serverdagi auth_role_permissions bo‘yicha. Yorliqlar faqat ko‘rsatish uchun; kod — manba."
            aside={<span className="ac-source">{rbac?.permissions.length ?? 0} ta ruxsat kodi</span>}
          >
            <div className="ac-table ac-matrix">
              <DataTable>
                <thead>
                  <tr>
                    <th scope="col">Ruxsat</th>
                    {roles.map((r) => <th key={r.code} scope="col">{roleLabel(r.code, roles)}</th>)}
                    <th scope="col">Doira</th>
                  </tr>
                </thead>
                {matrixGroups.map(([group, codes]) => (
                  <tbody key={group}>
                    <tr className="ac-group-row">
                      <th scope="colgroup" colSpan={roles.length + 2}>{group}</th>
                    </tr>
                    {codes.map((code) => (
                      <tr key={code}>
                        <td data-label="Ruxsat">
                          <div className="ac-perm-label">{permissionLabel(code)}</div>
                          <code className="ac-code">{code}</code>
                        </td>
                        {roles.map((r) => (
                          <td key={r.code} data-label={roleLabel(r.code, roles)}>
                            <Mark on={Boolean(grantsByRole.get(r.code)?.has(code))} label={`${r.code}: ${code}`} />
                          </td>
                        ))}
                        <td data-label="Doira" className="ac-sub">
                          {roles.filter((r) => grantsByRole.get(r.code)?.has(code)).map((r) => (r.scope === "all" ? "Barcha" : "Filial")).join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </DataTable>
            </div>
            {matrixUnknown.length ? (
              <div className="ac-extra">
                <h3 className="ac-extra-title">Boshqa ruxsatlar</h3>
                <p className="ac-row-desc">Matritsada bor, lekin ruxsatlar ro‘yxatida yo‘q kodlar.</p>
                <ul className="ac-code-list">
                  {matrixUnknown.map((code) => <li key={code}><code className="ac-code">{code}</code></li>)}
                </ul>
              </div>
            ) : null}
          </Section>

          <Section id="ac-live" className="ac-span" title="Hozir ishlayotgan" lead="Serverda majburiy bo‘lgan himoya.">
            <ul className="ac-rows ac-rows-grid">
              {ENFORCED.map((c) => (
                <li key={c.title} className="ac-row-item">
                  <div className="ac-row-main">
                    <div className="ac-row-title">{c.title}</div>
                    <p className="ac-row-desc">{c.desc}</p>
                  </div>
                  <StatusBadge tone="ok">Majburiy</StatusBadge>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <DetailDrawer
        open={Boolean(panel)}
        title={drawerTitle}
        subtitle={!creating && detail ? detail.user.email : undefined}
        status={!creating && detail ? (
          <span className="ac-identity">
            <StatusPill status={detail.user.status} />
            <StatusBadge tone="neutral">{roleLabel(detail.user.role, roles)}</StatusBadge>
            {detail.isSelf ? <StatusBadge tone="info">Joriy hisob</StatusBadge> : null}
          </span>
        ) : undefined}
        onClose={closePanel}
      >
        {creating ? (
          <form className="bs-form" onSubmit={submitCreate} noValidate>
            <DrawerSection title="Hisob">{identityFields}</DrawerSection>
            <DrawerSection title="Parol">{passwordField("Parol *")}</DrawerSection>
            {formMsg ? <FeedbackBanner tone="warn">{formMsg}</FeedbackBanner> : null}
            <div className="bs-form-actions">
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Kutilmoqda…" : "Qo‘shish"}</button>
              <button className="btn-tertiary" type="button" disabled={saving} onClick={closePanel}>Bekor qilish</button>
            </div>
          </form>
        ) : detailError ? (
          <ErrorState message={detailError.message} onRetry={openId != null ? () => void loadDetail(openId) : undefined} />
        ) : !detail ? (
          <LoadingBlock rows={4} label="Administrator ma'lumotlari yuklanmoqda…" />
        ) : panel?.kind === "edit" ? (
          <form className="bs-form" onSubmit={submitEdit} noValidate>
            <DrawerSection title="Hisob va rol">{identityFields}</DrawerSection>
            {selfOpen ? <p className="bs-note">O‘z rolingiz va filialingizni o‘zgartira olmaysiz — server ham rad etadi.</p> : null}
            {formMsg ? <FeedbackBanner tone="warn">{formMsg}</FeedbackBanner> : null}
            <div className="bs-form-actions">
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Kutilmoqda…" : "Saqlash"}</button>
              <button className="btn-tertiary" type="button" disabled={saving} onClick={() => setPanel({ kind: "view", id: detail.user.id })}>
                Bekor qilish
              </button>
            </div>
          </form>
        ) : panel?.kind === "password" ? (
          <form className="bs-form" onSubmit={submitPassword} noValidate>
            <DrawerSection title="Yangi parol">
              {passwordField("Yangi parol *")}
              <p className="bs-note">
                {detail.isSelf
                  ? "Joriy sessiyangiz saqlanadi, boshqa sessiyalaringiz bekor qilinadi."
                  : "Administratorning barcha faol sessiyalari bekor qilinadi."}
              </p>
            </DrawerSection>
            {formMsg ? <FeedbackBanner tone="warn">{formMsg}</FeedbackBanner> : null}
            <div className="bs-form-actions">
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Kutilmoqda…" : "Parolni almashtirish"}</button>
              <button className="btn-tertiary" type="button" disabled={saving} onClick={() => setPanel({ kind: "view", id: detail.user.id })}>
                Bekor qilish
              </button>
            </div>
          </form>
        ) : (
          <>
            {formMsg ? <FeedbackBanner tone="warn">{formMsg}</FeedbackBanner> : null}
            <DrawerTabs active={drawerTab} onChange={setDrawerTab} />
            {drawerTab === "sessions" ? (
              <div className="ac-tabpanel" role="tabpanel" id="ac-tabpanel-sessions" aria-labelledby="ac-tab-sessions" tabIndex={0}>
                {sessionsFeedback ? <FeedbackBanner tone={sessionsFeedback.tone}>{sessionsFeedback.text}</FeedbackBanner> : null}
                <div className="ac-filters">
                  <FilterBar>
                    <FilterField label="Holat">
                      <select value={sessionStatus} onChange={(e) => { setSessionOffset(0); setSessionStatus(e.target.value); }}>
                        <option value="">Barchasi</option>
                        <option value="active">{SESSION_STATUS_LABELS.active}</option>
                        <option value="expired">{SESSION_STATUS_LABELS.expired}</option>
                        <option value="revoked">{SESSION_STATUS_LABELS.revoked}</option>
                      </select>
                    </FilterField>
                  </FilterBar>
                </div>
                {sessionsData ? (
                  <p className="ac-note">
                    Faol: {sessionsData.summary.active} · Muddati tugagan: {sessionsData.summary.expired} · Bekor qilingan: {sessionsData.summary.revoked}.
                    {sessionsData.ipStored ? "" : " IP manzil saqlanmaydi."}
                    {sessionsData.currentKnown ? "" : " Joriy sessiyani aniqlab bo‘lmadi."}
                  </p>
                ) : null}
                {sessionsFail ? (
                  <ErrorState message={sessionsFail.message} onRetry={() => void loadSessions(detail.user.id)} />
                ) : !sessionsData ? (
                  <LoadingBlock rows={3} label="Sessiyalar yuklanmoqda…" />
                ) : sessionsData.sessions.length ? (
                  <div className="ac-table ac-sessions">
                    <DataTable>
                      <thead>
                        <tr>
                          <th scope="col">Holat</th>
                          <th scope="col">Qurilma</th>
                          <th scope="col">Yaratilgan</th>
                          <th scope="col">Oxirgi faollik</th>
                          <th scope="col">Tugash vaqti</th>
                          {canManage ? <th scope="col">Amal</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {sessionsData.sessions.map((s) => (
                          <tr key={s.id} className={s.status === "active" ? undefined : "is-disabled"}>
                            <td data-label="Holat">
                              <span className="ac-identity">
                                <SessionPill status={s.status} />
                                {s.current ? <StatusBadge tone="info">Joriy sessiya</StatusBadge> : null}
                              </span>
                            </td>
                            <td data-label="Qurilma">{deviceText(s.device)}</td>
                            <td data-label="Yaratilgan" className="ac-num">{s.createdAt ? fmtDate(s.createdAt) : "—"}</td>
                            <td data-label="Oxirgi faollik" className="ac-num">{s.lastSeenAt ? fmtDate(s.lastSeenAt) : "—"}</td>
                            <td data-label="Tugash vaqti" className="ac-num">
                              {s.revokedAt ? `Bekor qilingan: ${fmtDate(s.revokedAt)}` : s.expiresAt ? fmtDate(s.expiresAt) : "—"}
                            </td>
                            {canManage ? (
                              <td data-label="Amal">
                                {s.status === "active" ? (
                                  <button className="btn-tertiary ac-danger" type="button" disabled={revoking} onClick={() => setRevokeTarget(s)}>
                                    Bekor qilish
                                  </button>
                                ) : (
                                  <span className="ac-sub">—</span>
                                )}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                ) : (
                  <div className="ac-empty">
                    <EmptyState title={sessionStatus ? "Bu holatdagi sessiya yo‘q" : "Sessiyalar yo‘q"} />
                  </div>
                )}
                {sessionsData ? (
                  <div className="ac-pager">
                    <PaginationBar
                      offset={sessionsData.page.offset}
                      limit={sessionsData.page.limit}
                      total={sessionsData.page.total}
                      hasMore={sessionsData.page.hasMore}
                      onPrev={() => setSessionOffset(Math.max(0, sessionsData.page.offset - sessionsData.page.limit))}
                      onNext={() => setSessionOffset(sessionsData.page.offset + sessionsData.page.limit)}
                    />
                  </div>
                ) : null}
              </div>
            ) : drawerTab === "events" ? (
              <div className="ac-tabpanel" role="tabpanel" id="ac-tabpanel-events" aria-labelledby="ac-tab-events" tabIndex={0}>
                <div className="ac-filters">
                  <FilterBar>
                    <FilterField label="Hodisa">
                      <select value={adminEventFilters.event} onChange={(e) => setAdminEventFilter("event", e.target.value)}>
                        <option value="">Barchasi</option>
                        {(adminEvents?.eventTypes || events?.eventTypes || []).map((code) => (
                          <option key={code} value={code}>{EVENT_LABELS[code] || code}</option>
                        ))}
                      </select>
                    </FilterField>
                    <FilterField label="Natija">
                      <select value={adminEventFilters.success} onChange={(e) => setAdminEventFilter("success", e.target.value)}>
                        <option value="">Barchasi</option>
                        <option value="true">Muvaffaqiyatli</option>
                        <option value="false">Rad etilgan</option>
                      </select>
                    </FilterField>
                  </FilterBar>
                </div>
                <p className="ac-note">
                  {adminEvents && !adminEvents.ipStored && !adminEvents.userAgentStored
                    ? "IP manzil va qurilma kirish hodisalarida saqlanmaydi."
                    : TELEMETRY_NOTE}
                </p>
                {adminEventsFail ? (
                  <ErrorState message={adminEventsFail.message} onRetry={() => void loadAdminEvents(detail.user.id)} />
                ) : !adminEvents ? (
                  <LoadingBlock rows={3} label="Hodisalar yuklanmoqda…" />
                ) : adminEvents.events.length ? (
                  <EventsTable events={adminEvents.events} showAdmin={false} />
                ) : (
                  <div className="ac-empty">
                    <EmptyState title="Hodisa topilmadi" />
                  </div>
                )}
                {adminEvents ? (
                  <div className="ac-pager">
                    <PaginationBar
                      offset={adminEvents.page.offset}
                      limit={adminEvents.page.limit}
                      total={adminEvents.page.total}
                      hasMore={adminEvents.page.hasMore}
                      onPrev={() => setAdminEventOffset(Math.max(0, adminEvents.page.offset - adminEvents.page.limit))}
                      onNext={() => setAdminEventOffset(adminEvents.page.offset + adminEvents.page.limit)}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="ac-tabpanel" role="tabpanel" id="ac-tabpanel-profile" aria-labelledby="ac-tab-profile">
                <DrawerSection title="Hisob">
                  <dl className="ac-dl">
                    <div><dt>Ism</dt><dd>{detail.user.name || "—"}</dd></div>
                    <div><dt>Email</dt><dd>{detail.user.email}</dd></div>
                    <div><dt>Holat</dt><dd><StatusPill status={detail.user.status} /></dd></div>
                    <div><dt>Yaratilgan</dt><dd>{fmtDate(detail.user.createdAt)}</dd></div>
                    <div><dt>Yangilangan</dt><dd>{fmtDate(detail.user.updatedAt)}</dd></div>
                  </dl>
                </DrawerSection>
                <DrawerSection title="Rol va doira">
                  <dl className="ac-dl">
                    <div><dt>Rol</dt><dd>{roleLabel(detail.user.role, roles)} <code className="ac-code">{detail.user.role}</code></dd></div>
                    <div>
                      <dt>Filial</dt>
                      <dd>{detail.user.branchId == null ? "Barcha filiallar (HQ)" : detail.user.branchName || `Filial #${detail.user.branchId}`}</dd>
                    </div>
                  </dl>
                </DrawerSection>
                <DrawerSection title="Sessiyalar">
                  <dl className="ac-dl">
                    <div><dt>Faol sessiyalar</dt><dd>{detail.sessions.active} ta</dd></div>
                    <div><dt>Oxirgi faollik</dt><dd>{detail.sessions.lastSeenAt ? fmtDate(detail.sessions.lastSeenAt) : "—"}</dd></div>
                  </dl>
                </DrawerSection>
                <DrawerSection title={`Ruxsatlar (${detail.permissions.length})`}>
                  {detail.permissions.length ? (
                    <ul className="ac-perm-list">
                      {detail.permissions.map((code) => (
                        <li key={code}>
                          <span>{permissionLabel(code)}</span>
                          <code className="ac-code">{code}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ac-row-desc">Server bu rol uchun ruxsat qaytarmadi.</p>
                  )}
                </DrawerSection>
                {canManage ? (
                  <div className="bs-form-actions ac-drawer-actions">
                    <button className="btn-secondary" type="button" onClick={() => startEdit(detail)}>Tahrirlash</button>
                    <button className="btn-secondary" type="button" onClick={() => startPassword(detail)}>Parolni almashtirish</button>
                    {detail.user.status === "active" ? (
                      detail.isSelf ? null : (
                        <button className="btn-tertiary ac-danger" type="button" disabled={saving} onClick={() => setConfirmDisable(true)}>
                          Faolsizlantirish
                        </button>
                      )
                    ) : (
                      <button className="btn-primary" type="button" disabled={saving} onClick={() => void changeStatus("active")}>
                        Faollashtirish
                      </button>
                    )}
                  </div>
                ) : null}
                {detail.isSelf ? <p className="bs-note">O‘z hisobingizni faolsizlantira olmaysiz.</p> : null}
              </div>
            )}
          </>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(revokeTarget) && Boolean(detail)}
        title="Sessiyani bekor qilish"
        danger
        description={
          revokeTarget && detail ? (
            <div className="bs-confirm">
              <div className="bs-confirm-name">{detail.user.name || detail.user.email}</div>
              <p className="bs-confirm-warn">
                {revokeTarget.current
                  ? "Bu sizning joriy sessiyangiz — tasdiqlasangiz tizimdan chiqasiz."
                  : "Bu qurilmadagi kirish darhol to‘xtatiladi."}
              </p>
              <p className="bs-confirm-text">
                {deviceText(revokeTarget.device)} · ochilgan {revokeTarget.createdAt ? fmtDate(revokeTarget.createdAt) : "—"}. Administrator qayta kirishi mumkin.
              </p>
            </div>
          ) : null
        }
        confirmLabel="Bekor qilish"
        cancelLabel="Qaytish"
        busy={revoking}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => void revokeSession()}
      />

      <ConfirmDialog
        open={confirmDisable && Boolean(detail)}
        title="Administratorni faolsizlantirish"
        danger
        description={
          detail ? (
            <div className="bs-confirm">
              <div className="bs-confirm-name">{detail.user.name || detail.user.email}</div>
              <p className="bs-confirm-warn">Bu administratorning tizimga kirishi to‘xtatiladi.</p>
              <p className="bs-confirm-text">Faol sessiyalari darhol bekor qilinadi. Keyinroq qayta faollashtirish mumkin.</p>
            </div>
          ) : null
        }
        confirmLabel="Faolsizlantirish"
        cancelLabel="Qaytish"
        busy={saving}
        onCancel={() => setConfirmDisable(false)}
        onConfirm={() => void changeStatus("disabled")}
      />
    </div>
  );
}
