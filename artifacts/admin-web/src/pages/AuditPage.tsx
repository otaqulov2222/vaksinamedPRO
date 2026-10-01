import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ExternalLink, History, RefreshCw } from "lucide-react";
import { request, money, type ApiError } from "../api";
import {
  AdminPageHeader,
  FilterBar,
  FilterField,
  DataTable,
  DetailDrawer,
  DrawerSection,
  ErrorState,
  PaginationBar,
  StatusBadge,
  fulfillmentLabel,
  paymentLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const PAGE_SIZE = 40;
const TABLE_COLUMNS = 6;
const BUSINESS_TZ = "Asia/Tashkent";

/** Client defense-in-depth — server already sanitizes; never show these keys. */
const SENSITIVE_KEY =
  /password|otp|token|secret|authorization|cookie|session|hmac|merchant.?key|payme.?key|click.?secret|api.?key|refresh/i;

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";
type LoadError = { kind: "session" | "forbidden" | "notfound" | "network" | "failed"; message: string };
type AuditRow = {
  id: number;
  actor?: string;
  action?: string;
  entity?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

/** Every action code written to audit_log by the api-server — nothing else is labelled. */
const ACTION_LABELS: Record<string, string> = {
  "admin.login": "Admin tizimga kirdi",
  "branch.create": "Filial yaratildi",
  "branch.update": "Filial o‘zgartirildi",
  "branch.delete": "Filial o‘chirildi",
  "product.create": "Mahsulot yaratildi",
  "product.update": "Mahsulot o‘zgartirildi",
  "inventory.adjust": "Ombor qoldig‘i tuzatildi",
  "inventory.expire_due": "Muddati o‘tgan bronlar bo‘shatildi",
  "order.confirm_pos": "Buyurtma kassada tasdiqlandi",
  "order.cancel": "Buyurtma xodim tomonidan bekor qilindi",
  "order.refund_cashback.full": "Cashback qaytarildi — to‘liq",
  "order.refund_cashback.partial": "Cashback qaytarildi — qisman",
  "fom.sale_confirmed": "FOM sotuvi tasdiqlandi",
  "pos.sale": "Kassa sotuvi",
  "pos.void": "Kassa cheki bekor qilindi",
};
const TRANSITION_PREFIX = "order.transition.";
const TRANSITION_TARGETS = ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "COMPLETED"];

/** Server `action` filter is a case-insensitive substring match that strips `%`, `_` and `\` — values avoid them. */
const ACTION_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Barcha amallar" },
  { value: "admin.login", label: "Admin kirishi" },
  { value: "branch.", label: "Filial amallari" },
  { value: "product.", label: "Mahsulot amallari" },
  { value: "inventory.", label: "Ombor amallari" },
  { value: "order.transition.", label: "Buyurtma holati o‘zgarishi" },
  { value: "order.confirm", label: "Buyurtma kassada tasdiqlandi" },
  { value: "order.cancel", label: "Buyurtma bekor qilindi" },
  { value: "order.refund", label: "Cashback qaytarish" },
  { value: "pos.", label: "Kassa sotuvi va bekor qilish" },
  { value: "fom.", label: "FOM sotuvi" },
];

/** Entity codes written by the api-server — server `entity` filter is an exact match. */
const ENTITY_LABELS: Record<string, string> = {
  admin_user: "Admin hisobi",
  branch: "Filial",
  product: "Mahsulot",
  product_stock: "Ombor qoldig‘i",
  reservation: "Bron",
  order: "Buyurtma",
  pos_sale: "Kassa sotuvi",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin (HQ)",
  cashier: "Kassir",
};

const MONEY_KEYS = new Set(["amount", "payable", "cashbackUsed", "cashbackEarned", "reversalAmount", "earnReversalAmount"]);
const FULFILLMENT_KEYS = new Set(["from", "to", "fulfillmentStatus"]);

/** Operator-facing context keys, in display order. Anything else is technical. */
const CONTEXT_KEYS: Array<[string, string]> = [
  ["orderCode", "Buyurtma kodi"],
  ["from", "Oldingi holat"],
  ["to", "Yangi holat"],
  ["fulfillmentStatus", "Buyurtma holati"],
  ["paymentStatus", "To‘lov holati"],
  ["mode", "Qaytarish turi"],
  ["reason", "Sabab"],
  ["physicalDelta", "Qoldiq o‘zgarishi"],
  ["adjusted", "Qoldiq o‘zgardi"],
  ["receiptId", "Chek raqami"],
  ["amount", "Summa"],
  ["payable", "To‘lanadigan summa"],
  ["cashbackUsed", "Ishlatilgan cashback"],
  ["cashbackEarned", "Hisoblangan cashback"],
  ["earnReversalAmount", "Qaytarish uchun so‘ralgan summa"],
  ["reversalAmount", "Qaytarilgan cashback"],
  ["wasPaid", "To‘langan edi"],
  ["paymentRefundRequired", "To‘lovni qaytarish kerak"],
  ["sku", "SKU"],
  ["code", "Filial kodi"],
  ["name", "Filial nomi"],
  ["fields", "O‘zgargan maydonlar"],
  ["paymeCredentialUpdated", "Payme kaliti yangilandi"],
  ["clickCredentialUpdated", "Click kaliti yangilandi"],
  ["role", "Rol"],
  ["examined", "Tekshirilgan bronlar"],
  ["expired", "Bo‘shatilgan bronlar"],
  ["idempotent", "Takroriy so‘rov"],
  ["note", "Izoh"],
];
const CONTEXT_LABEL = new Map(CONTEXT_KEYS);

const TECH_LABELS: Record<string, string> = {
  orderId: "Buyurtma ID",
  productId: "Mahsulot ID",
  branchId: "Filial ID",
  id: "Obyekt ID",
  adminId: "Admin ID",
  customerId: "Mijoz ID",
  staffId: "Xodim ID",
  reservationIds: "Bron ID’lari",
  openPolicy: "Qaytarish siyosati kodi",
};

/** Reason codes the api-server writes; free-text reasons (e.g. stock adjustment) are shown as entered. */
const REASON_LABELS: Record<string, string> = {
  staff_confirm: "Xodim tasdiqladi",
  staff_prepare: "Xodim tayyorlashni boshladi",
  staff_ready: "Xodim tayyor deb belgiladi",
  staff_out_for_delivery: "Xodim yetkazishga chiqardi",
  staff_complete: "Xodim yakunladi",
  cashback_full_refund: "Cashback to‘liq qaytarish",
  cashback_partial_refund: "Cashback qisman qaytarish",
};

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function statusOf(err: unknown): number {
  return err && typeof err === "object" && "status" in err ? Number((err as ApiError).status) || 0 : 0;
}

function loadError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Audit jurnalini ko‘rish uchun ruxsat yo‘q." };
  if (status === 404) return { kind: "notfound", message: "Audit manbasi topilmadi." };
  if (!status) return { kind: "network", message: "Server bilan aloqa yo‘q. Internet aloqasini tekshirib, qayta urinib ko‘ring." };
  return { kind: "failed", message: "Audit ma'lumotlarini yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring." };
}

function scrubMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function actionLabel(action: string): string {
  const raw = String(action || "").trim();
  if (!raw) return "Noma'lum amal";
  if (ACTION_LABELS[raw]) return ACTION_LABELS[raw];
  if (raw.startsWith(TRANSITION_PREFIX)) {
    const target = raw.slice(TRANSITION_PREFIX.length);
    if (TRANSITION_TARGETS.includes(target)) return `Buyurtma holati: ${fulfillmentLabel(target)}`;
  }
  return `Amal: ${raw}`;
}

function isKnownAction(action: string): boolean {
  const raw = String(action || "");
  return Boolean(ACTION_LABELS[raw]) || TRANSITION_TARGETS.some((t) => raw === `${TRANSITION_PREFIX}${t}`);
}

function entityLabel(entity: string): string {
  const e = String(entity || "").trim();
  return ENTITY_LABELS[e] || (e ? `Obyekt: ${e}` : "—");
}

function actorView(actor: unknown): { name: string; kind: string } {
  const raw = String(actor || "").trim();
  if (!raw) return { name: "Noma'lum operator", kind: "" };
  if (raw.startsWith("staff:")) return { name: raw.slice("staff:".length) || "Noma'lum operator", kind: "Xodim" };
  if (raw === "kassa") return { name: "Kassa", kind: "Xodim ko‘rsatilmagan" };
  if (raw === "fom" || raw === "fom-webhook") return { name: "FOM integratsiyasi", kind: "Tizim" };
  return { name: raw, kind: "" };
}

function roleLabel(role: unknown): string {
  const r = String(role || "");
  return ROLE_LABELS[r] || r || "—";
}

function tashkentParts(value: unknown): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(TIME_FMT.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.day}.${p.month}.${p.year}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

function positiveId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function formatValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ha" : "Yo‘q";
  if (MONEY_KEYS.has(key) && typeof value === "number") return money(value);
  if (FULFILLMENT_KEYS.has(key) && typeof value === "string") return fulfillmentLabel(value);
  if (key === "paymentStatus" && typeof value === "string") return paymentLabel(value);
  if (key === "role") return roleLabel(value);
  if (key === "reason" && typeof value === "string") return REASON_LABELS[value] || value;
  if (key === "mode") return value === "partial" ? "Qisman" : value === "full" ? "To‘liq" : String(value);
  if (key === "physicalDelta" && typeof value === "number") return value > 0 ? `+${value}` : String(value);
  if (Array.isArray(value)) {
    const joined = value.map((v) => (v && typeof v === "object" ? "…" : String(v))).join(", ");
    return joined.length > 200 ? `${joined.slice(0, 200)}…` : joined || "—";
  }
  if (typeof value === "object") return "Murakkab qiymat";
  const s = String(value);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

function rowNotes(meta: Record<string, unknown>): Array<{ tone: Tone; label: string }> {
  const notes: Array<{ tone: Tone; label: string }> = [];
  if (meta.paymentRefundRequired === true) notes.push({ tone: "warn", label: "To‘lovni qaytarish kerak" });
  if (meta.paymeCredentialUpdated === true || meta.clickCredentialUpdated === true) {
    notes.push({ tone: "info", label: "To‘lov kaliti yangilandi" });
  }
  if (meta.idempotent === true) notes.push({ tone: "neutral", label: "Takroriy so‘rov" });
  return notes;
}

export function AuditPage(props: {
  token: string;
  branches?: any[];
  onOpenOrder?: (orderId: number) => void;
}) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const loadSeq = useRef(0);

  const branchMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of props.branches || []) m.set(String(b.id), String(b.name || `Filial #${b.id}`));
    return m;
  }, [props.branches]);

  function rowBranch(row: AuditRow): string {
    const meta = scrubMeta(row.metadata);
    const id = meta.branchId ?? (row.entity === "branch" ? meta.id : undefined);
    if (id == null || id === "") return "";
    const name = branchMap.get(String(id));
    if (name) return name;
    if (row.entity === "branch" && typeof meta.name === "string" && meta.name) return meta.name;
    return `Filial #${id}`;
  }

  function resourceView(row: AuditRow): { primary: string; sub: string } {
    const meta = scrubMeta(row.metadata);
    const entity = String(row.entity || "");
    const sub = entityLabel(entity);
    if (entity === "order") {
      if (typeof meta.orderCode === "string" && meta.orderCode.trim()) return { primary: meta.orderCode, sub };
      return { primary: positiveId(meta.orderId) ? `#${meta.orderId}` : "—", sub };
    }
    if (entity === "product") {
      if (typeof meta.sku === "string" && meta.sku.trim()) return { primary: meta.sku, sub };
      return { primary: positiveId(meta.productId) ? `#${meta.productId}` : "—", sub };
    }
    if (entity === "product_stock") {
      return { primary: positiveId(meta.productId) ? `Mahsulot #${meta.productId}` : "—", sub };
    }
    if (entity === "branch") return { primary: rowBranch(row) || (typeof meta.code === "string" ? meta.code : "—"), sub };
    if (entity === "pos_sale") {
      return { primary: typeof meta.receiptId === "string" && meta.receiptId ? `Chek ${meta.receiptId}` : "—", sub };
    }
    if (entity === "reservation") {
      return { primary: typeof meta.expired === "number" ? `${meta.expired} ta bron` : "—", sub };
    }
    if (entity === "admin_user") return { primary: meta.role ? roleLabel(meta.role) : "—", sub };
    return { primary: "—", sub };
  }

  async function load(opts?: { offset?: number }) {
    const nextOffset = opts?.offset ?? 0;
    const qs = new URLSearchParams();
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String(nextOffset));
    if (action) qs.set("action", action);
    if (entity) qs.set("entity", entity);
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await request(`/api/admin/audit?${qs}`, props.token);
      if (seq !== loadSeq.current) return;
      setRows(Array.isArray(data?.audit) ? data.audit : []);
      setTotal(Number(data?.pagination?.total) || 0);
      setHasMore(Boolean(data?.pagination?.hasMore));
      setOffset(nextOffset);
      setLoaded(true);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(loadError(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, action, entity]);

  function resetFilters() {
    setAction("");
    setEntity("");
  }

  function rowKeys(row: AuditRow) {
    return (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSelected(row);
      }
    };
  }

  const hasFilters = Boolean(action || entity);
  const initialLoading = loading && !loaded;
  const actionFilterLabel = ACTION_FILTERS.find((f) => f.value === action)?.label;

  const selectedMeta = selected ? scrubMeta(selected.metadata) : {};
  const selectedActor = selected ? actorView(selected.actor) : null;
  const selectedTime = selected ? tashkentParts(selected.createdAt) : null;
  const selectedResource = selected ? resourceView(selected) : null;
  const selectedBranch = selected ? rowBranch(selected) : "";
  const selectedOrderId = selected?.entity === "order" ? positiveId(selectedMeta.orderId) : null;
  const contextRows = CONTEXT_KEYS.filter(
    ([key]) => selectedMeta[key] != null && selectedMeta[key] !== "" && !(selected?.entity === "branch" && key === "name"),
  );
  const techKeys = Object.keys(selectedMeta).filter((k) => !CONTEXT_LABEL.has(k) || (selected?.entity === "branch" && k === "name"));

  function kv(label: string, value: ReactNode, opts?: { cls?: string; key?: string }) {
    return (
      <div key={opts?.key ?? label} className={opts?.cls}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );
  }

  return (
    <div className="audit-page page-module">
      <AdminPageHeader
        title="Audit"
        description={PAGE_DESCRIPTIONS.audit}
        meta={
          <span className="au-meta">
            <span className="au-chip">Faqat o‘qish</span>
            <span className="au-chip">Barcha filiallar · faqat HQ</span>
            <span className="au-chip">Audit eksporti API mavjud emas</span>
          </span>
        }
        actions={
          <button
            className={`btn-secondary au-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => void load({ offset })}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <section className="au-list" aria-label="Audit yozuvlari">
        <FilterBar
          meta={
            <span className="au-controls-note">
              Amal va obyekt filtrlari serverda qo‘llanadi. Matnli qidiruv, operator, filial va sana bo‘yicha filtr API’da
              mavjud emas.
            </span>
          }
        >
          <FilterField label="Amal">
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTION_FILTERS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Obyekt">
            <select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Barcha obyektlar</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FilterField>
          {hasFilters ? (
            <button className="btn-tertiary au-clear" type="button" disabled={loading} onClick={resetFilters}>
              Tozalash
            </button>
          ) : null}
        </FilterBar>

        <div className="au-summary" aria-live="polite">
          <span className="au-result-count">
            {initialLoading ? "Yuklanmoqda…" : error ? "—" : `${String(total).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ta yozuv`}
          </span>
          {actionFilterLabel && action && !error ? <span className="au-summary-hint">{actionFilterLabel}</span> : null}
          {entity && !error ? <span className="au-summary-hint">{entityLabel(entity)}</span> : null}
          <span className="au-summary-hint au-summary-tz">Vaqt: Asia/Tashkent</span>
        </div>

        {error ? (
          <ErrorState
            message={error.message}
            onRetry={error.kind === "failed" || error.kind === "network" ? () => void load({ offset }) : undefined}
          />
        ) : (
          <div
            className={`au-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !rows.length ? " is-empty" : ""}`}
            aria-busy={loading}
          >
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Amal</th>
                  <th>Operator</th>
                  <th>Resurs</th>
                  <th className="au-col-branch">Filial</th>
                  <th className="au-col-note">Belgi</th>
                </tr>
              </thead>
              <tbody>
                {initialLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="au-skeleton-row" aria-hidden="true">
                      {Array.from({ length: TABLE_COLUMNS }).map((__, c) => (
                        <td key={c} className={c === 4 ? "au-col-branch" : c === 5 ? "au-col-note" : undefined}>
                          <span className="au-skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr className="au-empty-row">
                    <td colSpan={TABLE_COLUMNS}>
                      <div className="au-empty" role="status">
                        <span className="au-empty-icon" aria-hidden="true"><History size={18} strokeWidth={1.8} /></span>
                        <div className="empty-title">
                          {hasFilters ? "Tanlangan filtrlar bo‘yicha audit yozuvi topilmadi" : "Audit yozuvlari mavjud emas"}
                        </div>
                        <p className="empty-desc">
                          {hasFilters
                            ? "Amal yoki obyekt filtrini o‘zgartiring."
                            : "Xodimlar audit qilinadigan amalni bajarganda yozuv shu yerda paydo bo‘ladi."}
                        </p>
                        {hasFilters ? (
                          <button className="btn-tertiary" type="button" onClick={resetFilters}>
                            Filtrlarni tozalash
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const meta = scrubMeta(row.metadata);
                    const when = tashkentParts(row.createdAt);
                    const who = actorView(row.actor);
                    const res = resourceView(row);
                    const branch = rowBranch(row);
                    const notes = rowNotes(meta);
                    const known = isKnownAction(String(row.action || ""));
                    const active = selected?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={`au-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        aria-label={`${actionLabel(String(row.action || ""))} — audit tafsiloti`}
                        onClick={() => setSelected(row)}
                        onKeyDown={rowKeys(row)}
                      >
                        <td className="au-cell-time">
                          {when ? (
                            <time dateTime={String(row.createdAt)}>
                              <span className="au-time">{when.time}</span>
                              <span className="au-sub">{when.date}</span>
                            </time>
                          ) : "—"}
                        </td>
                        <td className="au-cell-action">
                          <span className={`au-action${known ? "" : " is-raw"}`}>{actionLabel(String(row.action || ""))}</span>
                        </td>
                        <td className="au-cell-actor">
                          <span className="au-actor">{who.name}</span>
                          {who.kind ? <span className="au-sub">{who.kind}</span> : null}
                        </td>
                        <td className="au-cell-resource">
                          <span className="au-resource">{res.primary}</span>
                          <span className="au-sub">{res.sub}</span>
                        </td>
                        <td className="au-cell-branch au-col-branch">
                          {branch || <span className="au-missing">—</span>}
                        </td>
                        <td className="au-cell-note au-col-note">
                          {notes.length ? (
                            <span className="au-notes">
                              {notes.map((n) => <StatusBadge key={n.label} tone={n.tone}>{n.label}</StatusBadge>)}
                            </span>
                          ) : <span className="au-missing">—</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
            {rows.length > 0 && (total > PAGE_SIZE || offset > 0 || hasMore) ? (
              <PaginationBar
                offset={offset}
                limit={PAGE_SIZE}
                total={total}
                hasMore={hasMore}
                loading={loading}
                onPrev={() => void load({ offset: Math.max(0, offset - PAGE_SIZE) })}
                onNext={() => void load({ offset: offset + PAGE_SIZE })}
              />
            ) : null}
          </div>
        )}
      </section>

      <section className="au-coverage" aria-labelledby="au-coverage-title">
        <h2 id="au-coverage-title" className="au-coverage-title">Audit qamrovi</h2>
        <p className="au-coverage-lead">
          Jurnal to‘liq tizim auditi emas — faqat quyidagi xodim amallari muvaffaqiyatli bajarilgandan keyin yoziladi.
        </p>
        <div className="au-coverage-grid">
          <div>
            <h3 className="au-coverage-head">Jurnalga yoziladi</h3>
            <ul className="au-coverage-list">
              <li>Admin tizimga kirishi</li>
              <li>Filial yaratish, o‘zgartirish va o‘chirish (to‘lov kalitlari qiymati yozilmaydi)</li>
              <li>Mahsulot yaratish va o‘zgartirish</li>
              <li>Ombor qoldig‘ini tuzatish, muddati o‘tgan bronlarni bo‘shatish</li>
              <li>Buyurtma holatini xodim o‘zgartirishi, kassada tasdiqlash, xodim bekor qilishi</li>
              <li>Cashback qaytarish</li>
              <li>Kassa sotuvi va chekni bekor qilish</li>
              <li>FOM sotuvi tasdiqlanishi</li>
            </ul>
          </div>
          <div>
            <h3 className="au-coverage-head">Jurnalga yozilmaydi</h3>
            <ul className="au-coverage-list is-missing">
              <li>Yetkazib berish amallari (kuryer biriktirish, holat o‘zgarishi)</li>
              <li>To‘lov amallari (provayder xabarlari, to‘lovni qaytarish)</li>
              <li>Mijoz amallari (buyurtma berish va bekor qilish, cashback ishlatish)</li>
              <li>Tizimdan chiqish, muvaffaqiyatsiz kirish va ruxsat rad etilishi — alohida xavfsizlik jurnaliga yoziladi, uni o‘qish API’si yo‘q</li>
              <li>Fon jarayonlari (bron va to‘lov muddati tugashi)</li>
              <li>IP manzil, qurilma va so‘rov ID saqlanmaydi</li>
            </ul>
          </div>
        </div>
      </section>

      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? actionLabel(String(selected.action || "")) : "Audit tafsiloti"}
        subtitle={selectedTime ? `${selectedTime.date}, ${selectedTime.time}` : undefined}
        width="md"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <DrawerSection title="Amal">
              <dl className="au-kv">
                {kv("Amal", actionLabel(String(selected.action || "")), { cls: "au-kv-strong" })}
                {kv("Vaqt", selectedTime ? `${selectedTime.date}, ${selectedTime.time} (Asia/Tashkent)` : "—")}
              </dl>
            </DrawerSection>

            <DrawerSection title="Operator">
              <dl className="au-kv">
                {kv("Operator", selectedActor?.name || "Noma'lum operator")}
                {selectedActor?.kind ? kv("Turi", selectedActor.kind) : null}
                {selected.action === "admin.login" && selectedMeta.role ? kv("Rol", roleLabel(selectedMeta.role)) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Resurs">
              <dl className="au-kv">
                {kv("Turi", entityLabel(String(selected.entity || "")))}
                {kv("Belgi", selectedResource?.primary || "—")}
                {kv("Filial", selectedBranch || "—")}
              </dl>
              {selectedOrderId && props.onOpenOrder ? (
                <button
                  className="btn-tertiary au-link-btn"
                  type="button"
                  onClick={() => {
                    const id = selectedOrderId;
                    setSelected(null);
                    props.onOpenOrder?.(id);
                  }}
                >
                  <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                  Buyurtmani ochish
                </button>
              ) : null}
            </DrawerSection>

            {contextRows.length ? (
              <DrawerSection title="Tafsilotlar">
                <dl className="au-kv">
                  {contextRows.map(([key, label]) => kv(label, formatValue(key, selectedMeta[key]), { key }))}
                </dl>
              </DrawerSection>
            ) : null}

            <details className="au-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="au-kv au-kv-tech">
                {kv("Yozuv ID", String(selected.id))}
                {kv("Amal kodi", <span className="au-mono">{selected.action || "—"}</span>)}
                {kv("Obyekt kodi", <span className="au-mono">{selected.entity || "—"}</span>)}
                {techKeys.map((k) => kv(TECH_LABELS[k] || k, formatValue(k, selectedMeta[k]), { key: `tech-${k}` }))}
                {kv("IP / qurilma / so‘rov ID", "Audit jurnalida saqlanmaydi")}
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
