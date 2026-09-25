import { useEffect, type FormEvent, type ReactNode } from "react";
import { money } from "./api";

export type BadgeTone = "ok" | "warn" | "danger" | "neutral" | "info";

export function StatusBadge(props: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  const tone = props.tone || "neutral";
  return (
    <span className={`badge badge-${tone}`} title={props.title}>
      {props.children}
    </span>
  );
}

/** @deprecated Prefer StatusBadge — kept for compatibility */
export function Badge(props: { tone?: BadgeTone; children: ReactNode }) {
  return <StatusBadge tone={props.tone}>{props.children}</StatusBadge>;
}

export function MoneyText(props: { value: number; className?: string; size?: "sm" | "md" | "lg" }) {
  const size = props.size || "md";
  return (
    <span className={`money money-${size} ${props.className || ""}`.trim()}>
      {money(props.value)}
    </span>
  );
}

/** Compact enterprise metric strip — not a card grid. */
export function MetricStrip(props: {
  items: {
    label: string;
    value: ReactNode;
    unit?: string;
    hint?: string;
    tone?: BadgeTone;
    hero?: boolean;
  }[];
  className?: string;
}) {
  return (
    <div className={`metric-strip ${props.className || ""}`.trim()} role="group">
      {props.items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className={`metric-cell${item.hero ? " metric-hero" : ""}${item.tone ? ` metric-${item.tone}` : ""}`}
        >
          <div className="metric-label">{item.label}</div>
          <div className="metric-value-row">
            <div className="metric-value">{item.value}</div>
            {item.unit ? <span className="metric-unit">{item.unit}</span> : null}
          </div>
          {item.hint ? <div className="metric-hint">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Page chrome contract (Phase 12.6A):
 * Topbar breadcrumb (location) → this H1 (once) → one optional description → actions.
 * Do not repeat the same title in section cards below.
 */
/**
 * Page chrome contract (Phase 12.6A):
 * Topbar breadcrumb = location (quiet)
 * This header = sole page title owner
 * description = optional one line (omit if it only restates the title)
 * actions = page-level primary/secondary only
 */
export function AdminPageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-header${props.className ? ` ${props.className}` : ""}`.trim()}>
      <div className="page-header-text">
        <h1 className="page-title">{props.title}</h1>
        {props.description ? <p className="page-desc">{props.description}</p> : null}
      </div>
      {props.actions ? <div className="page-actions">{props.actions}</div> : null}
    </header>
  );
}

/** @deprecated Prefer AdminPageHeader */
export function PageHeader(props: {
  title: string;
  subtitle?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <AdminPageHeader
      title={props.title}
      description={props.description ?? props.subtitle}
      actions={props.actions}
    />
  );
}

export function FilterBar(props: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-controls">{props.children}</div>
      {props.meta ? <div className="filter-bar-meta">{props.meta}</div> : null}
    </div>
  );
}

export function FilterField(props: { label: string; children: ReactNode; grow?: boolean }) {
  return (
    <label className={`filter-field${props.grow ? " filter-field-grow" : ""}`}>
      <span className="filter-label">{props.label}</span>
      {props.children}
    </label>
  );
}

export function SearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  disabled?: boolean;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    props.onSubmit?.();
  }
  return (
    <form className="search-input" onSubmit={submit}>
      <input
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder || "Qidirish…"}
        onChange={(e) => props.onChange(e.target.value)}
        aria-label={props.placeholder || "Qidirish"}
      />
      {props.value ? (
        <button
          type="button"
          className="search-clear"
          aria-label="Tozalash"
          onClick={() => props.onChange("")}
        >
          ×
        </button>
      ) : null}
      {props.onSubmit ? (
        <button type="submit" className="ghost search-go">
          Qidirish
        </button>
      ) : null}
    </form>
  );
}

export function StatCard(props: {
  label: string;
  value: ReactNode;
  unit?: string;
  context?: string;
  tone?: BadgeTone;
  /** primary = strong ops KPI; secondary = quieter */
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const variant = props.variant || "primary";
  return (
    <div
      className={`stat-card stat-${variant}${props.tone ? ` stat-card-${props.tone}` : ""}${props.className ? ` ${props.className}` : ""}`.trim()}
    >
      <div className="stat-label">{props.label}</div>
      <div className="stat-value-row">
        <div className="stat-value">{props.value}</div>
        {props.unit ? <span className="stat-unit">{props.unit}</span> : null}
      </div>
      {props.context ? <div className="stat-context">{props.context}</div> : null}
    </div>
  );
}

export function SectionCard(props: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** flat = bordered panel without elevated card chrome */
  flat?: boolean;
}) {
  return (
    <section className={`section-card${props.flat ? " section-flat" : ""} ${props.className || ""}`.trim()}>
      <div className="section-card-head">
        <h2 className="section-title">{props.title}</h2>
        {props.actions ? <div className="section-card-actions">{props.actions}</div> : null}
      </div>
      <div className="section-card-body">{props.children}</div>
      {props.footer ? <div className="section-card-footer">{props.footer}</div> : null}
    </section>
  );
}

export function DataTable(props: { children: ReactNode; sticky?: boolean }) {
  return (
    <div className={`table-wrap${props.sticky ? " table-sticky" : ""}`}>
      <table className="table">{props.children}</table>
    </div>
  );
}

export function PaginationBar(props: {
  offset: number;
  limit: number;
  total?: number;
  hasMore?: boolean;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = props.total === 0 ? 0 : props.offset + 1;
  const to = props.offset + Math.min(props.limit, Math.max(0, (props.total ?? props.offset + props.limit) - props.offset));
  const canPrev = props.offset > 0 && !props.loading;
  const canNext = Boolean(props.hasMore) && !props.loading;
  return (
    <div className="pagination-bar" role="navigation" aria-label="Sahifalash">
      <span className="meta">
        {props.total != null && props.total >= 0
          ? `${from}–${Math.min(to, props.total)} / ${props.total}`
          : `${from}–…`}
      </span>
      <div className="pagination-actions">
        <button type="button" className="ghost" disabled={!canPrev} onClick={props.onPrev}>
          Oldingi
        </button>
        <button type="button" className="ghost" disabled={!canNext} onClick={props.onNext}>
          Keyingi
        </button>
      </div>
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** compact = denser ops empty (default true for enterprise density) */
  compact?: boolean;
}) {
  const compact = props.compact !== false;
  return (
    <div className={`empty-state${compact ? " empty-compact" : ""}`} role="status">
      <div className="empty-title">{props.title}</div>
      {props.description ? <p className="empty-desc">{props.description}</p> : null}
      {props.action ? <div className="empty-action">{props.action}</div> : null}
    </div>
  );
}

export function ErrorState(props: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <p>{props.message || "Ma’lumotlarni yuklashda xatolik yuz berdi."}</p>
      {props.onRetry ? (
        <button type="button" className="ghost" onClick={props.onRetry}>
          Qayta urinish
        </button>
      ) : null}
    </div>
  );
}

export function LoadingBlock(props: { rows?: number; label?: string }) {
  const n = props.rows ?? 4;
  return (
    <div className="loading-block" aria-busy="true" aria-live="polite">
      <p className="meta">{props.label || "Yuklanmoqda…"}</p>
      <div className="skeleton-stack">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="skeleton-row" />
        ))}
      </div>
    </div>
  );
}

export function StateBox(props: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  if (props.loading) {
    return <LoadingBlock />;
  }
  if (props.error) {
    return <ErrorState message={props.error} onRetry={props.onRetry} />;
  }
  if (props.empty) {
    return <EmptyState title={props.emptyText || "Ma’lumot yo‘q"} description={props.emptyDescription} />;
  }
  return <>{props.children}</>;
}

export function fulfillmentTone(status: string): BadgeTone {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED") return "ok";
  if (s === "CANCELLED") return "danger";
  if (s === "CONFIRMED" || s === "OUT_FOR_DELIVERY") return "info";
  if (s === "CREATED") return "neutral";
  return "warn";
}

export function paymentTone(status: string): BadgeTone {
  const s = String(status || "").toUpperCase();
  if (s === "PAID") return "ok";
  if (s === "FAILED") return "danger";
  if (s === "REFUNDED" || s === "PARTIALLY_REFUNDED") return "warn";
  if (s === "PENDING") return "warn";
  return "neutral";
}

export function reservationTone(status: string): BadgeTone {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE" || s === "FULFILLED") return "ok";
  if (s === "EXPIRED") return "warn";
  if (s === "CANCELLED") return "danger";
  return "neutral";
}

export function entryTone(entryType: string): BadgeTone {
  const t = String(entryType || "").toUpperCase();
  if (t === "EARN") return "ok";
  if (t === "USE") return "warn";
  if (t === "REVERSAL") return "danger";
  return "neutral";
}

/** Operator-facing fulfillment labels — enum values unchanged on the wire. */
export function fulfillmentLabel(status: string): string {
  const s = String(status || "").toUpperCase();
  const map: Record<string, string> = {
    CREATED: "Yaratilgan",
    CONFIRMED: "Tasdiqlangan",
    PREPARING: "Tayyorlanmoqda",
    READY_FOR_PICKUP: "Olib ketishga tayyor",
    OUT_FOR_DELIVERY: "Yetkazilmoqda",
    COMPLETED: "Yakunlangan",
    CANCELLED: "Bekor qilingan",
  };
  return map[s] || (status ? String(status) : "—");
}

/** Operator-facing payment labels — enum values unchanged on the wire. */
export function paymentLabel(status: string): string {
  const s = String(status || "").toUpperCase();
  const map: Record<string, string> = {
    PENDING: "Kutilmoqda",
    PAID: "To‘langan",
    FAILED: "Amal bajarilmadi",
    REFUNDED: "Qaytarilgan",
    PARTIALLY_REFUNDED: "Qisman qaytarilgan",
  };
  return map[s] || (status ? String(status) : "—");
}

/** Operator-facing reservation labels — enum values unchanged on the wire. */
export function reservationLabel(status: string): string {
  const s = String(status || "").toUpperCase();
  const map: Record<string, string> = {
    NONE: "Yo‘q",
    ACTIVE: "Faol",
    EXPIRED: "Muddati tugagan",
    CANCELLED: "Bekor qilingan",
    FULFILLED: "Bajarilgan",
  };
  return map[s] || (status ? String(status) : "—");
}

export function entryTypeLabel(entryType: string): string {
  const t = String(entryType || "").toUpperCase();
  const map: Record<string, string> = {
    EARN: "Hisoblangan",
    USE: "Ishlatilgan",
    REVERSAL: "Qaytarilgan",
    ADJUSTMENT: "Tuzatish",
  };
  return map[t] || (entryType ? String(entryType) : "—");
}

/**
 * Status badge with operator label; raw enum kept in title for support.
 * Prefer this in later module phases — shell establishes the pattern now.
 */
export function StatusLabelBadge(props: {
  domain: "fulfillment" | "payment" | "reservation" | "entry";
  status: string;
}) {
  const raw = String(props.status || "");
  let tone: BadgeTone = "neutral";
  let label = raw || "—";
  if (props.domain === "fulfillment") {
    tone = fulfillmentTone(raw);
    label = fulfillmentLabel(raw);
  } else if (props.domain === "payment") {
    tone = paymentTone(raw);
    label = paymentLabel(raw);
  } else if (props.domain === "reservation") {
    tone = reservationTone(raw);
    label = reservationLabel(raw);
  } else {
    tone = entryTone(raw);
    label = entryTypeLabel(raw);
  }
  return (
    <StatusBadge tone={tone} title={raw || undefined}>
      {label}
    </StatusBadge>
  );
}

export function sourceLabel(sourceType: string): string {
  const s = String(sourceType || "").toUpperCase();
  if (s === "ORDER") return "Ilova xaridi";
  if (s === "POS") return "Kassa xaridi";
  if (s === "SYSTEM") return "Bonus / tizim";
  if (s === "FOM_POS") return "FOM kassa";
  return s || "—";
}

/** Stock axis labels — wire fields unchanged (physical/reserved/available). */
export function stockAxisLabel(axis: "physical" | "reserved" | "available"): string {
  if (axis === "physical") return "Fizik qoldiq";
  if (axis === "reserved") return "Band";
  return "Mavjud";
}

/** Short column headers for stock tables. */
export function stockAxisShort(axis: "physical" | "reserved" | "available"): string {
  if (axis === "physical") return "Fizik";
  if (axis === "reserved") return "Band";
  return "Mavjud";
}

/** Capability / contract codes → operator chrome (never show raw tokens as primary copy). */
export function operatorCapabilityLabel(code: string): string {
  const c = String(code || "").toUpperCase().replace(/\s+/g, "_");
  if (c === "API_REQUIRED" || c.includes("API_REQUIRED")) return "Hali ulanmagan";
  if (c === "CONTRACT_PENDING" || c.includes("CONTRACT_PENDING")) return "Hali ulanmagan";
  if (c === "NOT_SUPPORTED" || c.includes("NOT_SUPPORTED")) return "Qo‘llab-quvvatlanmaydi";
  if (c === "DISABLED" || c === "OFF") return "O‘chirilgan";
  if (c === "AVAILABLE" || c === "READY" || c === "OK") return "Mavjud";
  if (c === "ADMIN_USER_MANAGEMENT" || c.includes("ADMIN_USER_MANAGEMENT")) return "Hali ulanmagan";
  return String(code || "—");
}

export function isTechnicalChromeToken(text: string): boolean {
  const t = String(text || "");
  return /API_REQUIRED|CONTRACT_PENDING|cashback_accounts|product_stocks|server agregat|ADMIN_USER_MANAGEMENT|\/api\//i.test(t);
}

/** Density hint for page shells — layout may opt in via data-density. */
export type PageDensity = "high" | "medium-high" | "medium" | "low";

export const PAGE_DENSITY: Record<string, PageDensity> = {
  orders: "high",
  inventory: "high",
  audit: "high",
  kassa: "high",
  payments: "high",
  customers: "medium-high",
  products: "medium-high",
  branches: "medium-high",
  delivery: "medium-high",
  cashback: "medium-high",
  dashboard: "medium",
  reports: "low",
  ratings: "medium",
  promos: "medium",
  fom: "low",
  admins: "low",
  settings: "low",
};

export function DetailDrawer(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
  /** Status / chips shown under title */
  status?: ReactNode;
  /** Short subtitle under title */
  subtitle?: ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;
  return (
    <div className="drawer-root" role="dialog" aria-modal="true" aria-label={props.title}>
      <button type="button" className="drawer-backdrop" aria-label="Yopish" onClick={props.onClose} />
      <aside className={`drawer-panel drawer-${props.width || "md"}`}>
        <div className="drawer-head">
          <div className="drawer-head-main">
            <h2 className="section-title">{props.title}</h2>
            {props.subtitle ? <div className="drawer-subtitle">{props.subtitle}</div> : null}
            {props.status ? <div className="drawer-status">{props.status}</div> : null}
          </div>
          <button type="button" className="ghost" onClick={props.onClose} aria-label="Yopish">
            Yopish
          </button>
        </div>
        <div className="drawer-body">{props.children}</div>
        {props.footer ? <div className="drawer-footer">{props.footer}</div> : null}
      </aside>
    </div>
  );
}

/** Semantic block inside detail drawers */
export function DrawerSection(props: { title: string; children?: ReactNode }) {
  return (
    <section className="drawer-section">
      <h3 className="drawer-section-title">{props.title}</h3>
      <div className="drawer-section-body">{props.children}</div>
    </section>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !props.busy) props.onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.busy, props.onCancel]);

  if (!props.open) return null;
  return (
    <div className="dialog-root" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <button type="button" className="drawer-backdrop" aria-label="Bekor qilish" onClick={props.onCancel} />
      <div className="dialog-panel">
        <h2 id="confirm-dialog-title" className="section-title">{props.title}</h2>
        {props.description ? <div className="dialog-desc">{props.description}</div> : null}
        <div className="dialog-actions">
          <button type="button" className="ghost" disabled={props.busy} onClick={props.onCancel}>
            {props.cancelLabel || "Bekor"}
          </button>
          <button
            type="button"
            className={props.danger ? "primary danger-btn" : "primary"}
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.busy ? "Kutilmoqda…" : props.confirmLabel || "Tasdiqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Tabs(props: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {props.tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={props.active === t.id}
          className={`tab${props.active === t.id ? " active" : ""}`}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function FeedbackBanner(props: {
  tone?: "ok" | "warn" | "danger" | "info";
  children: ReactNode;
}) {
  const tone = props.tone || "info";
  return <div className={`alert-banner ${tone === "ok" ? "ok-banner" : tone}`}>{props.children}</div>;
}
