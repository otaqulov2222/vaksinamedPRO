import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { request, money } from "../api";
import {
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  PaginationBar,
  DetailDrawer,
  DrawerSection,
  ConfirmDialog,
  FeedbackBanner,
  ErrorState,
  LoadingBlock,
  paymentLabel,
  paymentTone,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const PAGE_SIZE = 25;
const TABLE_COLUMNS = 5;
/** GET /api/admin/payments returns at most this many latest rows (no server filters / pagination). */
const SERVER_ROW_CAP = 200;

/** Real provider values from api-server paymentAdapters (PaymentProviderName). */
const METHOD_LABELS: Record<string, string> = {
  payme: "Payme",
  click: "Click",
  pay_at_branch: "Filialda to‘lov",
  cod: "Qabul qilganda to‘lov",
  simulate: "Sinov to‘lovi",
};
/** Providers whose money movement goes through a PSP — refund there needs a provider contract. */
const PSP_METHODS = new Set(["payme", "click"]);

/** Display order for status filter options; unknown values from the API are appended. */
const STATUS_ORDER = [
  "PENDING",
  "AWAITING_POS",
  "PENDING_KEYS",
  "CREATED",
  "REQUIRES_PAYMENT",
  "PROCESSING",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
];

type PaymentFilters = { status: string; method: string; branchId: string };
const EMPTY_FILTERS: PaymentFilters = { status: "", method: "", branchId: "" };

type Feedback = { tone: "ok" | "warn" | "danger" | "info"; text: string };
type Notice = { text: string; retry: boolean };

function errStatus(err: unknown): number {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) || 0 : 0;
}

function errCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
}

function listErrorNotice(err: unknown): Notice {
  const status = errStatus(err);
  if (status === 401) return { text: "Sessiya tugagan. Qayta kiring.", retry: false };
  if (status === 403) return { text: "To‘lovlar ro‘yxatini ko‘rish uchun ruxsat yo‘q.", retry: false };
  return { text: "To‘lovlarni yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring.", retry: true };
}

function detailErrorNotice(err: unknown): Notice {
  const status = errStatus(err);
  if (status === 401) return { text: "Sessiya tugagan. Qayta kiring.", retry: false };
  if (status === 403) return { text: "Bu to‘lovni ko‘rish uchun filial ruxsati yo‘q.", retry: false };
  if (status === 404) return { text: "To‘lov topilmadi.", retry: false };
  return { text: "To‘lov ma’lumotlarini yuklab bo‘lmadi.", retry: true };
}

function isStaleRefundError(err: unknown): boolean {
  const code = errCode(err);
  return (
    code === "INVALID_PAYMENT_TRANSITION"
    || code === "NOTHING_TO_REFUND"
    || code === "REFUND_EXCEEDS_CAPTURE"
    || code === "CAPTURE_REQUIRED"
  );
}

function refundErrorText(err: unknown): string {
  const status = errStatus(err);
  const code = errCode(err);
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Qaytarish uchun ruxsat yo‘q.";
  if (status === 404) return "To‘lov topilmadi.";
  if (code === "NOTHING_TO_REFUND") return "Qaytarish uchun summa qolmagan. Ma’lumot yangilandi.";
  if (code === "REFUND_EXCEEDS_CAPTURE") {
    return "Summa qaytarish mumkin bo‘lgan qoldiqdan oshib ketdi. Ma’lumot yangilandi.";
  }
  if (code === "CAPTURE_REQUIRED") return "To‘lov hali qabul qilinmagan — qaytarib bo‘lmaydi.";
  if (code === "INVALID_PAYMENT_TRANSITION") {
    return "To‘lov holati o‘zgargan — qaytarish endi mumkin emas. Ma’lumot yangilandi.";
  }
  if (code === "INVALID_AMOUNT") return "Qaytarish summasi noto‘g‘ri.";
  return "Qaytarishni bajarib bo‘lmadi. Qayta urinib ko‘ring.";
}

function methodLabel(provider: unknown): string {
  const raw = String(provider || "").trim();
  if (!raw) return "—";
  const known = METHOD_LABELS[raw.toLowerCase()];
  if (known) return known;
  const words = raw.replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatAmount(amount: unknown, currency?: unknown): string {
  const value = money(Number(amount || 0));
  const cur = String(currency || "").trim().toUpperCase();
  return !cur || cur === "UZS" ? value : value.replace("so‘m", cur);
}

function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function statusRank(status: string): number {
  const i = STATUS_ORDER.indexOf(status.toUpperCase());
  return i < 0 ? STATUS_ORDER.length : i;
}

function refundExecutionLabel(execution: unknown): string | null {
  if (execution === "EXECUTED") return "Provayder orqali qaytarildi";
  if (execution === "CONTRACT_PENDING") return "Faqat ichki yozuv — provayder orqali qaytarilmagan";
  if (execution === "NOT_APPLICABLE") return "Ichki yozuv — provayder ishtirok etmaydi";
  return null;
}

function refundReasonLabel(reason: unknown): string | null {
  const r = String(reason || "").trim();
  if (!r) return null;
  if (r === "admin_refund") return "Admin tomonidan";
  return r;
}

/** Operator copy for the POST …/refund response — never echoes provider enums or raw errors. */
function refundResultFeedback(data: any, amountText: string): Feedback {
  const cashback = "Cashback avtomatik teskari yozilmaydi.";
  if (data?.idempotent) {
    return {
      tone: "info",
      text: `Bu summa bo‘yicha qaytarish avval yozilgan — yangi yozuv yaratilmadi. ${cashback}`,
    };
  }
  if (data?.providerExecution === "EXECUTED") {
    return { tone: "ok", text: `${amountText} provayder orqali qaytarildi. ${cashback}` };
  }
  if (data?.providerExecution === "NOT_APPLICABLE") {
    return {
      tone: "warn",
      text: `Ichki qaytarish yozildi: ${amountText}. Bu usulda provayder yo‘q — pulni mijozga qo‘lda qaytarish kerak. ${cashback}`,
    };
  }
  return {
    tone: "warn",
    text: `Ichki qaytarish yozildi: ${amountText}. Provayder orqali qaytarish hozircha ulanmagan — pul mijozga avtomatik qaytmaydi. ${cashback}`,
  };
}

function parseRefundAmount(input: string, refundable: number): { amount: number; error: string } {
  const trimmed = input.trim();
  const amount = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { amount: 0, error: "Summani butun son bilan kiriting." };
  }
  if (amount > refundable) {
    return { amount, error: `Summa ${money(refundable)} dan oshmasligi kerak.` };
  }
  return { amount, error: "" };
}

type StatusGroup = { count: number; amount: number };
type PaymentHealth = {
  total: number;
  paid: StatusGroup;
  pending: StatusGroup;
  refunded: number;
  partiallyRefunded: number;
  other: number;
  currency: string | null;
};

/**
 * Status counts over the loaded rows. The list API has no aggregates, so this is only
 * shown when the response is below SERVER_ROW_CAP (the complete set in the operator's scope).
 * Refund amounts are not in the list DTO, so the refunded group is a count only.
 */
function paymentHealth(rows: any[]): PaymentHealth {
  const health: PaymentHealth = {
    total: rows.length,
    paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    refunded: 0,
    partiallyRefunded: 0,
    other: 0,
    currency: null,
  };
  const currencies = new Set<string>();
  for (const r of rows) {
    currencies.add(String(r.currency || "UZS").toUpperCase());
    const status = String(r.status || "").toUpperCase();
    const amount = Number(r.amount || 0);
    if (status === "REFUNDED") health.refunded += 1;
    else if (status === "PARTIALLY_REFUNDED") health.partiallyRefunded += 1;
    else if (paymentTone(status) === "ok") {
      health.paid.count += 1;
      health.paid.amount += amount;
    } else if (paymentTone(status) === "warn") {
      health.pending.count += 1;
      health.pending.amount += amount;
    } else health.other += 1;
  }
  health.currency = currencies.size === 1 ? [...currencies][0] : null;
  return health;
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

export function PaymentsPage(props: {
  token: string;
  permissions: string[];
  branches?: any[];
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<Notice | null>(null);
  const [filters, setFilters] = useState<PaymentFilters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);

  const [openRowId, setOpenRowId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<Notice | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [confirmRefund, setConfirmRefund] = useState(false);
  const [refundInput, setRefundInput] = useState("");
  const [refundInputError, setRefundInputError] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);

  const listSeq = useRef(0);
  const detailSeq = useRef(0);

  const canManage = props.permissions.includes("payments:manage");
  const branches = Array.isArray(props.branches) ? props.branches : [];
  const hasFilters = Boolean(filters.status || filters.method || filters.branchId);

  async function load() {
    const seq = ++listSeq.current;
    setLoading(true);
    setListError(null);
    try {
      const data = await request("/api/admin/payments", props.token);
      if (seq !== listSeq.current) return;
      setRows(Array.isArray(data?.payments) ? data.payments : []);
    } catch (err) {
      if (seq !== listSeq.current) return;
      setRows([]);
      setListError(listErrorNotice(err));
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(String(r.status));
    return Array.from(set).sort((a, b) => statusRank(a) - statusRank(b) || a.localeCompare(b));
  }, [rows]);

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.provider) set.add(String(r.provider));
    return Array.from(set).sort((a, b) => methodLabel(a).localeCompare(methodLabel(b)));
  }, [rows]);

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.branchId != null) set.add(String(r.branchId));
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((item) => {
        if (filters.status && String(item.status) !== filters.status) return false;
        if (filters.method && String(item.provider) !== filters.method) return false;
        if (filters.branchId && String(item.branchId) !== filters.branchId) return false;
        return true;
      }),
    [rows, filters],
  );
  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);
  const health = useMemo(() => paymentHealth(rows), [rows]);
  const healthComplete = rows.length < SERVER_ROW_CAP;
  const healthMoney = (amount: number) => (health.currency ? formatAmount(amount, health.currency) : null);

  function branchName(id: unknown): string {
    if (id == null || id === "") return "—";
    const hit = branches.find((b) => Number(b.id) === Number(id));
    return hit?.name || `Filial #${id}`;
  }

  function applyFilter(patch: Partial<PaymentFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setOffset(0);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setOffset(0);
  }

  async function fetchSnapshot(intentId: number, seq: number) {
    try {
      const data = await request(`/api/admin/payments/intents/${intentId}`, props.token);
      if (seq !== detailSeq.current) return;
      setSnapshot(data);
      setDetailError(null);
    } catch (err) {
      if (seq !== detailSeq.current) return;
      setSnapshot(null);
      setDetailError(detailErrorNotice(err));
    } finally {
      if (seq === detailSeq.current) setDetailLoading(false);
    }
  }

  function openRow(item: any) {
    const seq = ++detailSeq.current;
    setOpenRowId(item.id);
    setFeedback(null);
    setDetailError(null);
    if (snapshot && Number(snapshot.intent?.id) !== Number(item.paymentIntentId)) setSnapshot(null);
    if (item.paymentIntentId == null) {
      setSnapshot(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    void fetchSnapshot(Number(item.paymentIntentId), seq);
  }

  function closeDrawer() {
    detailSeq.current += 1;
    setOpenRowId(null);
    setSnapshot(null);
    setDetailError(null);
    setDetailLoading(false);
    setFeedback(null);
  }

  const openItem = openRowId != null ? rows.find((r) => r.id === openRowId) || null : null;
  const intent = snapshot?.intent || null;
  const refundableAmount = Math.max(0, Number(snapshot?.refundableAmount || 0));
  const intentStatus = String(intent?.status || "").toUpperCase();
  const refundStateOk = intentStatus === "PAID" || intentStatus === "PARTIALLY_REFUNDED";
  const canRefund = Boolean(intent) && canManage && refundableAmount > 0 && refundStateOk;
  const refunds: any[] = Array.isArray(snapshot?.refunds) ? snapshot.refunds : [];
  const attempts: any[] = Array.isArray(snapshot?.attempts) ? snapshot.attempts : [];
  const refundedTotal = refunds
    .filter((r) => String(r.status || "").toUpperCase() === "SUCCEEDED")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const methodIsPsp = PSP_METHODS.has(String(intent?.provider || openItem?.provider || "").toLowerCase());
  const refundParsed = parseRefundAmount(refundInput, refundableAmount);

  function openRefundDialog() {
    setRefundInput(String(refundableAmount));
    setRefundInputError("");
    setConfirmRefund(true);
  }

  async function submitRefund() {
    const intentId = Number(intent?.id);
    if (!intentId || refundBusy) return;
    const { amount, error } = parseRefundAmount(refundInput, refundableAmount);
    if (error) {
      setRefundInputError(error);
      return;
    }
    const body: { reason: string; amount?: number } = { reason: "admin_refund" };
    if (amount !== refundableAmount) body.amount = amount;
    setRefundBusy(true);
    setFeedback(null);
    try {
      const data = await request(`/api/admin/payments/intents/${intentId}/refund`, props.token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setConfirmRefund(false);
      setFeedback(refundResultFeedback(data, formatAmount(amount, intent?.currency)));
    } catch (err) {
      setConfirmRefund(false);
      setFeedback({ tone: "danger", text: refundErrorText(err) });
      if (!isStaleRefundError(err)) return;
    } finally {
      setRefundBusy(false);
    }
    const seq = ++detailSeq.current;
    await Promise.all([load(), fetchSnapshot(intentId, seq)]);
  }

  const drawerTitle = openItem?.orderId != null || intent?.orderId != null
    ? `Buyurtma #${intent?.orderId ?? openItem?.orderId}`
    : "To‘lov";
  const drawerSubtitle = openItem
    ? [
      methodLabel(intent?.provider || openItem.provider),
      branchName(intent?.branchId ?? openItem.branchId),
      intent?.createdAt ? formatDateTime(intent.createdAt) : "",
    ].filter((part) => part && part !== "—").join(" · ")
    : undefined;
  const drawerStatus = intent?.status || (openItem && openItem.paymentIntentId == null ? openItem.status : "");

  function renderFooter(): ReactNode {
    if (!intent) return undefined;
    if (canRefund) {
      return (
        <div className="payments-drawer-actions">
          <button className="btn-danger" type="button" disabled={refundBusy} onClick={openRefundDialog}>
            Qaytarish
          </button>
        </div>
      );
    }
    let note = "Qaytarish uchun summa qolmagan.";
    if (!canManage) note = "Qaytarish uchun ruxsat yo‘q.";
    else if (!snapshot?.capture) note = "To‘lov qabul qilinmagan — qaytarish mumkin emas.";
    else if (!refundStateOk) note = "Joriy to‘lov holatida qaytarish mumkin emas.";
    return <p className="payments-actions-note">{note}</p>;
  }

  return (
    <div className="payments-page page-module">
      <AdminPageHeader
        title="To‘lovlar"
        description={PAGE_DESCRIPTIONS.payments}
        actions={
          <button
            className={`btn-secondary payments-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      {loading && rows.length === 0 ? (
        <div className="payments-health is-loading" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="payments-health-cell">
              <span className="payments-skeleton" />
              <span className="payments-skeleton" />
            </span>
          ))}
        </div>
      ) : !listError && rows.length > 0 ? (
        <section className="payments-health" aria-label="To‘lovlar holati">
          {healthComplete ? (
            <>
              <div className="payments-health-cell is-total">
                <span className="payments-health-k">Jami yozuv</span>
                <span className="payments-health-v">{health.total}</span>
                <span className="payments-health-note">Ruxsatingiz doirasida</span>
              </div>
              <div className="payments-health-cell is-ok">
                <span className="payments-health-k">To‘langan</span>
                <span className="payments-health-v">{health.paid.count}</span>
                <span className="payments-health-note">{healthMoney(health.paid.amount) ?? "Turli valyutalar"}</span>
              </div>
              <div className="payments-health-cell is-warn">
                <span className="payments-health-k">Kutilmoqda</span>
                <span className="payments-health-v">{health.pending.count}</span>
                <span className="payments-health-note">{healthMoney(health.pending.amount) ?? "Turli valyutalar"}</span>
              </div>
              <div className="payments-health-cell is-neutral">
                <span className="payments-health-k">Qaytarilgan</span>
                <span className="payments-health-v">{health.refunded + health.partiallyRefunded}</span>
                <span className="payments-health-note">
                  {health.partiallyRefunded > 0 ? `shundan ${health.partiallyRefunded} ta qisman` : "To‘liq qaytarish"}
                </span>
              </div>
              {health.other > 0 ? (
                <div className="payments-health-cell is-muted">
                  <span className="payments-health-k">Boshqa holatlar</span>
                  <span className="payments-health-v">{health.other}</span>
                  <span className="payments-health-note">Filtrdan holatni tanlang</span>
                </div>
              ) : null}
            </>
          ) : (
            <p className="payments-health-capped">
              Server so‘nggi {SERVER_ROW_CAP} ta yozuvni qaytardi — umumiy holat bo‘yicha jami hisoblanmaydi.
            </p>
          )}
        </section>
      ) : null}

      <section className="payments-controls" aria-label="To‘lovlar filtrlari">
        <div className="payments-controls-primary">
          <FilterField label="Holat">
            <select
              value={filters.status}
              disabled={!rows.length}
              onChange={(e) => applyFilter({ status: e.target.value })}
            >
              <option value="">Barchasi</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{paymentLabel(s)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Usul">
            <select
              value={filters.method}
              disabled={!rows.length}
              onChange={(e) => applyFilter({ method: e.target.value })}
            >
              <option value="">Barchasi</option>
              {methodOptions.map((p) => (
                <option key={p} value={p}>{methodLabel(p)}</option>
              ))}
            </select>
          </FilterField>
          {branchOptions.length > 1 ? (
            <FilterField label="Filial">
              <select value={filters.branchId} onChange={(e) => applyFilter({ branchId: e.target.value })}>
                <option value="">Barcha filiallar</option>
                {branchOptions.map((id) => (
                  <option key={id} value={id}>{branchName(id)}</option>
                ))}
              </select>
            </FilterField>
          ) : null}
          <div className="payments-summary" aria-live="polite">
            {listError && !loading ? null : (
              <span className="payments-result-count">
                {loading ? "Yuklanmoqda…" : `${filtered.length} ta to‘lov`}
              </span>
            )}
            {hasFilters ? (
              <button className="btn-tertiary" type="button" onClick={resetFilters}>
                Tozalash
              </button>
            ) : null}
          </div>
        </div>
        <p className="payments-controls-note">
          Filtrlar serverdan yuklangan so‘nggi yozuvlarga qo‘llanadi (ko‘pi bilan {SERVER_ROW_CAP} ta).
        </p>
      </section>

      {listError ? (
        <ErrorState message={listError.text} onRetry={listError.retry ? () => void load() : undefined} />
      ) : (
        <div
          className={`payments-surface surface-table${loading && rows.length ? " is-refreshing" : ""}${!loading && !pageRows.length ? " is-empty" : ""}`}
          aria-busy={loading}
        >
          <DataTable sticky>
            <thead>
              <tr>
                <th>Buyurtma</th>
                <th className="num">Summa</th>
                <th>Holat</th>
                <th>Usul</th>
                <th className="payments-col-branch">Filial</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="payments-skeleton-row" aria-hidden="true">
                    {Array.from({ length: TABLE_COLUMNS }).map((__, c) => (
                      <td key={c} className={c === 1 ? "num" : undefined}>
                        <span className="payments-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr className="payments-empty-row">
                  <td colSpan={TABLE_COLUMNS}>
                    <div className="payments-empty" role="status">
                      <div className="empty-title">
                        {hasFilters ? "Bu filtrlar bo‘yicha to‘lov topilmadi." : "To‘lovlar mavjud emas."}
                      </div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Filtrlarni o‘zgartiring yoki tozalang."
                          : "Buyurtmalar bo‘yicha to‘lovlar yaratilishi bilan shu yerda ko‘rinadi."}
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
                pageRows.map((item) => {
                  const active = openRowId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`payments-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => openRow(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openRow(item);
                        }
                      }}
                    >
                      <td className="payments-cell-id">
                        <div className="payments-code">
                          {item.orderId != null ? `Buyurtma #${item.orderId}` : "—"}
                        </div>
                        <div className="payments-sub">
                          To‘lov #{item.id}
                          {item.paymentIntentId == null ? " · tarixsiz yozuv" : ""}
                        </div>
                        <div className="payments-sub payments-sub-branch">{branchName(item.branchId)}</div>
                      </td>
                      <td className="num payments-amount">{formatAmount(item.amount, item.currency)}</td>
                      <td className="payments-cell-status">
                        <StatusLabelBadge domain="payment" status={item.status || ""} />
                      </td>
                      <td className="payments-method">
                        <span className={`payments-provider${PSP_METHODS.has(String(item.provider || "").toLowerCase()) ? " is-psp" : ""}`}>
                          {methodLabel(item.provider)}
                        </span>
                      </td>
                      <td className="payments-cell-branch">
                        <span className="payments-branch" title={branchName(item.branchId)}>
                          {branchName(item.branchId)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          {filtered.length > PAGE_SIZE ? (
            <PaginationBar
              offset={offset}
              limit={PAGE_SIZE}
              total={filtered.length}
              hasMore={offset + PAGE_SIZE < filtered.length}
              loading={loading}
              onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              onNext={() => setOffset(offset + PAGE_SIZE)}
            />
          ) : null}
        </div>
      )}

      <DetailDrawer
        open={openRowId != null}
        width="lg"
        title={drawerTitle}
        subtitle={drawerSubtitle}
        status={drawerStatus ? <StatusLabelBadge domain="payment" status={drawerStatus} /> : undefined}
        onClose={closeDrawer}
        footer={renderFooter()}
      >
        {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

        {detailLoading && !snapshot ? <LoadingBlock rows={6} label="To‘lov yuklanmoqda…" /> : null}

        {detailError ? (
          <ErrorState
            message={detailError.text}
            onRetry={detailError.retry && openItem ? () => openRow(openItem) : undefined}
          />
        ) : null}

        {openItem && openItem.paymentIntentId == null ? (
          <>
            <DrawerSection title="Buyurtma">
              <dl className="payments-kv">
                <Row label="Buyurtma">{openItem.orderId != null ? `#${openItem.orderId}` : "—"}</Row>
                <Row label="Filial">{branchName(openItem.branchId)}</Row>
              </dl>
            </DrawerSection>
            <DrawerSection title="To‘lov">
              <dl className="payments-kv">
                <Row label="Summa">
                  <span className="payments-kv-strong">{formatAmount(openItem.amount, openItem.currency)}</span>
                </Row>
                {openItem.currency ? <Row label="Valyuta">{openItem.currency}</Row> : null}
                <Row label="Usul">{methodLabel(openItem.provider)}</Row>
                <Row label="Holat"><StatusLabelBadge domain="payment" status={openItem.status || ""} /></Row>
              </dl>
              <p className="payments-note">
                Bu yozuv uchun to‘lov tarixi (urinishlar, qabul qilish, qaytarish) mavjud emas.
              </p>
            </DrawerSection>
            <details className="payments-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="payments-kv payments-kv-tech">
                <Row label="To‘lov yozuvi">{openItem.id}</Row>
                {openItem.merchantId ? <Row label="Merchant">{openItem.merchantId}</Row> : null}
                {openItem.externalId ? <Row label="Tashqi havola">{openItem.externalId}</Row> : null}
              </dl>
            </details>
          </>
        ) : null}

        {intent ? (
          <>
            <DrawerSection title="Buyurtma">
              <dl className="payments-kv">
                <Row label="Buyurtma">{intent.orderId != null ? `#${intent.orderId}` : "—"}</Row>
                <Row label="Filial">{branchName(intent.branchId)}</Row>
                {snapshot.orderPaymentStatus ? (
                  <Row label="Buyurtma to‘lovi">
                    <StatusLabelBadge domain="payment" status={snapshot.orderPaymentStatus} />
                  </Row>
                ) : null}
              </dl>
              <p className="payments-note">
                Buyurtmaning bajarilish holati Buyurtmalar bo‘limida — bu yerda faqat to‘lov holati.
              </p>
            </DrawerSection>

            <DrawerSection title="To‘lov">
              <dl className="payments-kv">
                <Row label="Summa">
                  <span className="payments-kv-strong">{formatAmount(intent.amount, intent.currency)}</span>
                </Row>
                {intent.currency ? <Row label="Valyuta">{intent.currency}</Row> : null}
                <Row label="Usul">{methodLabel(intent.provider)}</Row>
                <Row label="Holat"><StatusLabelBadge domain="payment" status={intent.status || ""} /></Row>
                <Row label="Yaratilgan">{formatDateTime(intent.createdAt)}</Row>
                {intent.updatedAt ? <Row label="Yangilangan">{formatDateTime(intent.updatedAt)}</Row> : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Urinishlar">
              {attempts.length ? (
                <ol className="payments-attempts">
                  {attempts.map((a, i) => (
                    <li key={a.id} className="payments-attempt">
                      <span className="payments-attempt-no">{i + 1}</span>
                      <span className="payments-attempt-main">
                        <span className="payments-attempt-method">{methodLabel(a.provider)}</span>
                        <span className="payments-attempt-time">{formatDateTime(a.createdAt)}</span>
                      </span>
                      <StatusLabelBadge domain="payment" status={a.status || ""} />
                      {a.externalRef ? (
                        <span className="payments-attempt-ref" title={String(a.externalRef)}>
                          {a.externalRef}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="payments-note">Urinishlar yo‘q.</p>
              )}
            </DrawerSection>

            <DrawerSection title="Qabul qilish">
              {snapshot.capture ? (
                <dl className="payments-kv">
                  <Row label="Qabul qilingan">
                    <span className="payments-kv-strong">
                      {formatAmount(snapshot.capture.amount, snapshot.capture.currency)}
                    </span>
                  </Row>
                  <Row label="Vaqt">{formatDateTime(snapshot.capture.capturedAt)}</Row>
                </dl>
              ) : (
                <p className="payments-note">To‘lov hali qabul qilinmagan.</p>
              )}
            </DrawerSection>

            <DrawerSection title="Qaytarish">
              <dl className="payments-kv">
                <Row label="Qaytarish mumkin">
                  <span className="payments-kv-strong">{formatAmount(refundableAmount, intent.currency)}</span>
                </Row>
                {refundedTotal > 0 ? (
                  <Row label="Qaytarilgan">{formatAmount(refundedTotal, intent.currency)}</Row>
                ) : null}
              </dl>
              {refunds.length ? (
                <ul className="payments-refunds">
                  {refunds.map((r) => {
                    const execution = refundExecutionLabel(r.providerExecution);
                    const reason = refundReasonLabel(r.reason);
                    return (
                      <li key={r.id} className="payments-refund">
                        <span className="payments-refund-main">
                          <span className="payments-refund-amount">{formatAmount(r.amount, r.currency)}</span>
                          <span className="payments-refund-meta">
                            {[formatDateTime(r.createdAt), reason, execution].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <StatusLabelBadge domain="payment" status={r.status || ""} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="payments-note">Qaytarishlar yo‘q.</p>
              )}
              {snapshot.capture ? (
                <p className="payments-note is-warn">
                  {methodIsPsp
                    ? "Provayder orqali qaytarish hozircha ulanmagan — ichki qaytarish faqat yozuv yaratadi, pul mijozga avtomatik qaytmaydi."
                    : "Bu usulda provayder yo‘q — ichki qaytarish yozuv yaratadi, pul mijozga qo‘lda qaytariladi."}{" "}
                  Cashback avtomatik teskari yozilmaydi.
                </p>
              ) : null}
            </DrawerSection>

            <details className="payments-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="payments-kv payments-kv-tech">
                <Row label="To‘lov niyati">{intent.id}</Row>
                {openItem ? <Row label="To‘lov yozuvi">{openItem.id}</Row> : null}
                {intent.merchantId ? <Row label="Merchant">{intent.merchantId}</Row> : null}
                {snapshot.capture?.id != null ? <Row label="Qabul qilish yozuvi">{snapshot.capture.id}</Row> : null}
                {refunds.length ? (
                  <Row label="Qaytarish yozuvlari">{refunds.map((r) => r.id).join(", ")}</Row>
                ) : null}
                {refunds.some((r) => r.providerRefundId) ? (
                  <Row label="Provayder qaytarish havolasi">
                    {refunds.map((r) => r.providerRefundId).filter(Boolean).join(", ")}
                  </Row>
                ) : null}
                {openItem?.externalId ? <Row label="Tashqi havola">{openItem.externalId}</Row> : null}
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmRefund}
        title="To‘lovni qaytarish"
        danger
        busy={refundBusy}
        confirmLabel="Qaytarish"
        cancelLabel="Bekor"
        description={
          <div className="payments-refund-form">
            <p className="payments-refund-lead">
              Buyurtma #{intent?.orderId ?? "—"} · {methodLabel(intent?.provider)}
            </p>
            <div className="payments-refund-field">
              <label className="filter-label" htmlFor="payments-refund-amount">Qaytarish summasi</label>
              <span className="payments-refund-input">
                <input
                  id="payments-refund-amount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={refundInput}
                  aria-invalid={Boolean(refundInputError)}
                  aria-describedby="payments-refund-hint"
                  disabled={refundBusy}
                  onChange={(e) => {
                    setRefundInput(e.target.value.replace(/\D/g, ""));
                    setRefundInputError("");
                  }}
                />
                <button
                  className="btn-tertiary"
                  type="button"
                  disabled={refundBusy || refundInput === String(refundableAmount)}
                  onClick={() => {
                    setRefundInput(String(refundableAmount));
                    setRefundInputError("");
                  }}
                >
                  To‘liq summa
                </button>
              </span>
            </div>
            <p id="payments-refund-hint" className={`payments-refund-hint${refundInputError ? " is-error" : ""}`}>
              {refundInputError
                || (refundParsed.error
                  ? `Qaytarish mumkin: ${formatAmount(refundableAmount, intent?.currency)}`
                  : `Qaytariladi: ${formatAmount(refundParsed.amount, intent?.currency)} · qaytarish mumkin: ${formatAmount(refundableAmount, intent?.currency)}`)}
            </p>
            <p className="payments-note is-warn">
              {methodIsPsp
                ? "Provayder orqali qaytarish hozircha ulanmagan: tizimda ichki qaytarish yozuvi yaratiladi, pul mijozga avtomatik qaytmaydi."
                : "Bu usulda provayder yo‘q: tizimda ichki qaytarish yozuvi yaratiladi, pulni mijozga qo‘lda qaytarish kerak."}{" "}
              Cashback avtomatik teskari yozilmaydi.
            </p>
          </div>
        }
        onCancel={() => setConfirmRefund(false)}
        onConfirm={() => void submitRefund()}
      />
    </div>
  );
}
