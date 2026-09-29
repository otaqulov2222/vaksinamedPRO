import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { request, money, isHqRole, type AdminUser } from "../api";
import {
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  PaginationBar,
  ErrorState,
  LoadingBlock,
  ConfirmDialog,
  DetailDrawer,
  DrawerSection,
  FeedbackBanner,
  fulfillmentLabel,
  paymentLabel,
  reservationLabel,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const ORDER_PAGE = 25;
const TABLE_COLUMNS = 7;

const FULFILLMENT_STATUSES = [
  "CREATED",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
];
const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"];
const RESERVATION_STATUSES = ["NONE", "ACTIVE", "EXPIRED", "CANCELLED", "FULFILLED"];

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";

const PAYMENT_TONE: Record<string, Tone> = {
  PAID: "ok",
  PENDING: "warn",
  FAILED: "danger",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "neutral",
};
const RESERVATION_TONE: Record<string, Tone> = {
  ACTIVE: "ok",
  EXPIRED: "warn",
  NONE: "neutral",
  CANCELLED: "neutral",
  FULFILLED: "neutral",
};

/** Must match FULFILLMENT_GRAPH in api-server lib/orderTransitions.ts (minus CANCELLED, which is admin-cancel). */
const NEXT_STEPS: Record<string, string[]> = {
  CREATED: ["CONFIRMED"],
  CONFIRMED: ["PREPARING", "OUT_FOR_DELIVERY", "COMPLETED"],
  PREPARING: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "COMPLETED"],
  READY_FOR_PICKUP: ["COMPLETED"],
  OUT_FOR_DELIVERY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const STEP_ACTIONS: Record<string, { path: string; label: string }> = {
  CONFIRMED: { path: "confirm", label: "Tasdiqlash" },
  PREPARING: { path: "prepare", label: "Tayyorlashni boshlash" },
  READY_FOR_PICKUP: { path: "ready", label: "Olib ketishga tayyor" },
  OUT_FOR_DELIVERY: { path: "out-for-delivery", label: "Yetkazishga chiqarish" },
  COMPLETED: { path: "complete", label: "Yakunlash" },
};

const DELIVERY_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Kuryer kutilmoqda", tone: "neutral" },
  assigned: { label: "Kuryer biriktirilgan", tone: "warn" },
  picked_up: { label: "Kuryer olib ketdi", tone: "info" },
  on_the_way: { label: "Yo‘lda", tone: "info" },
  delivered: { label: "Yetkazildi", tone: "ok" },
  cancelled: { label: "Bekor qilindi", tone: "danger" },
  failed: { label: "Yetkazilmadi", tone: "danger" },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  payme: "Payme",
  click: "Click",
  pay_at_branch: "Filialda to‘lov",
  cod: "Qabul qilganda to‘lov",
};

type OrderFilters = {
  q: string;
  fulfillment: string;
  payment: string;
  reservation: string;
  branchId: string;
  createdFrom: string;
  createdTo: string;
};

const EMPTY_FILTERS: OrderFilters = {
  q: "",
  fulfillment: "",
  payment: "",
  reservation: "",
  branchId: "",
  createdFrom: "",
  createdTo: "",
};

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
  if (status === 403) return { text: "Buyurtmalar ro‘yxatini ko‘rish uchun ruxsat yo‘q.", retry: false };
  if (errCode(err) === "INVALID_DATE_FILTER") {
    return { text: "Sana noto‘g‘ri kiritilgan. Sanani qayta tanlang.", retry: false };
  }
  return { text: "Buyurtmalarni yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring.", retry: true };
}

function detailErrorNotice(err: unknown): Notice {
  const status = errStatus(err);
  if (status === 401) return { text: "Sessiya tugagan. Qayta kiring.", retry: false };
  if (status === 403) return { text: "Bu buyurtmani ko‘rish uchun filial ruxsati yo‘q.", retry: false };
  if (status === 404) return { text: "Buyurtma topilmadi.", retry: false };
  return { text: "Buyurtma ma’lumotlarini yuklab bo‘lmadi.", retry: true };
}

function isStaleStateError(err: unknown): boolean {
  const code = errCode(err);
  return code === "INVALID_TRANSITION" || code === "INVALID_PAYMENT_TRANSITION" || code === "CANCEL_NOT_ALLOWED";
}

function actionErrorText(err: unknown): string {
  const status = errStatus(err);
  const code = errCode(err);
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Bu amal uchun ruxsat yo‘q.";
  if (status === 404) return "Buyurtma topilmadi.";
  if (code === "CANCEL_NOT_ALLOWED") return "Yakunlangan buyurtmani bekor qilib bo‘lmaydi.";
  if (code === "INVALID_TRANSITION" || code === "INVALID_PAYMENT_TRANSITION") {
    return "Buyurtma holati o‘zgargan — bu amal endi mavjud emas. Ma’lumot yangilandi.";
  }
  return "Amalni bajarib bo‘lmadi. Qayta urinib ko‘ring.";
}

function customerLabel(item: any): string {
  if (!item?.customer) return "—";
  const n = `${item.customer.firstName || ""} ${item.customer.lastName || ""}`.trim();
  return n || "—";
}

function fulfillmentKindLabel(kind: string): string {
  const k = String(kind || "").toLowerCase();
  if (k === "delivery") return "Yetkazib berish";
  if (k === "pickup") return "Olib ketish";
  return "—";
}

function deliveryStatus(status: unknown): { label: string; tone: Tone } {
  return DELIVERY_STATUS[String(status || "").toLowerCase()] || { label: "Holati noma’lum", tone: "neutral" };
}

function paymentMethodLabel(method: string): string {
  const s = String(method || "").trim();
  if (!s) return "—";
  const known = PAYMENT_METHOD_LABELS[s.toLowerCase()];
  if (known) return known;
  const words = s.replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function lineTotal(item: any): number {
  if (item?.total != null && Number.isFinite(Number(item.total))) return Number(item.total);
  if (item?.lineTotal != null && Number.isFinite(Number(item.lineTotal))) return Number(item.lineTotal);
  return Number(item?.price || 0) * Number(item?.quantity || 0);
}

function dateParts(value: unknown): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

function formatDateTime(value: unknown): string {
  const parts = dateParts(value);
  return parts ? `${parts.date}, ${parts.time}` : "—";
}

function phoneDigits(phone: unknown): string {
  return String(phone || "").replace(/\D/g, "");
}

function formatPhone(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length === 12 && d.startsWith("998")) {
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  }
  return phone;
}

function maskPhone(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length === 12 && d.startsWith("998")) return `+998 ${d.slice(3, 5)} ••• •• ${d.slice(10)}`;
  if (d.length < 4) return "•••";
  return `${"•".repeat(d.length - 2)}${d.slice(-2)}`;
}

function nextSteps(status: string, channel: string): string[] {
  return (NEXT_STEPS[status] || []).filter((to) => {
    if (to === "READY_FOR_PICKUP") return channel === "pickup";
    if (to === "OUT_FOR_DELIVERY") return channel === "delivery";
    return true;
  });
}

function isPaidLike(paymentStatus: unknown): boolean {
  return paymentStatus === "PAID" || paymentStatus === "PARTIALLY_REFUNDED";
}

function filtersActive(f: OrderFilters): boolean {
  return Boolean(
    f.q.trim() || f.fulfillment || f.payment || f.reservation || f.branchId || f.createdFrom || f.createdTo,
  );
}

/** One badge per axis — fulfillment, payment and reservation never share a badge. */
function AxisBadge(props: { domain: "fulfillment" | "payment" | "reservation"; status: string }) {
  const s = String(props.status || "").toUpperCase();
  if (props.domain === "fulfillment") return <StatusLabelBadge domain="fulfillment" status={s} />;
  if (props.domain === "payment") {
    return <StatusBadge tone={PAYMENT_TONE[s] || "neutral"}>{paymentLabel(s)}</StatusBadge>;
  }
  return <StatusBadge tone={RESERVATION_TONE[s] || "neutral"}>{reservationLabel(s)}</StatusBadge>;
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

export function OrdersPage(props: {
  token: string;
  user: AdminUser | null;
  branches: any[];
  /** Open this order detail on mount (e.g. from Dashboard). */
  initialOrderId?: number | null;
  onInitialOrderConsumed?: () => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_FILTERS);

  const [openId, setOpenId] = useState<number | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<Notice | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState<"complete" | "pos" | null>(null);

  const listSeq = useRef(0);
  const detailSeq = useRef(0);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const hasFilters = filtersActive(filters);

  async function loadPage(opts?: { offset?: number; filters?: OrderFilters }) {
    const nextOffset = opts?.offset ?? 0;
    const f = opts?.filters ?? filters;
    const qs = new URLSearchParams();
    qs.set("limit", String(ORDER_PAGE));
    qs.set("offset", String(nextOffset));
    if (f.q.trim()) qs.set("q", f.q.trim());
    if (f.fulfillment) qs.set("fulfillmentStatus", f.fulfillment);
    if (f.payment) qs.set("paymentStatus", f.payment);
    if (f.reservation) qs.set("reservationStatus", f.reservation);
    if (f.branchId) qs.set("branchId", f.branchId);
    if (f.createdFrom.trim()) qs.set("createdFrom", f.createdFrom.trim());
    if (f.createdTo.trim()) qs.set("createdTo", f.createdTo.trim());

    const seq = ++listSeq.current;
    setLoading(true);
    setListError(null);
    try {
      const data = await request(`/api/admin/orders?${qs}`, props.token);
      if (seq !== listSeq.current) return;
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setTotal(Number(data?.total || data?.pagination?.total || 0));
      setHasMore(Boolean(data?.hasMore ?? data?.pagination?.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      if (seq !== listSeq.current) return;
      setOrders([]);
      setTotal(0);
      setHasMore(false);
      setListError(listErrorNotice(err));
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }

  function applyFilter(patch: Partial<OrderFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void loadPage({ offset: 0, filters: next });
  }

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    void loadPage({ offset: 0 });
  }

  function onSearchChange(value: string) {
    if (!value && filters.q) applyFilter({ q: "" });
    else setFilters({ ...filters, q: value });
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    void loadPage({ offset: 0, filters: EMPTY_FILTERS });
  }

  useEffect(() => {
    void loadPage({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  useEffect(() => {
    if (props.initialOrderId == null || !Number.isFinite(props.initialOrderId)) return;
    void openOrder(props.initialOrderId).finally(() => {
      props.onInitialOrderConsumed?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialOrderId]);

  async function openOrder(id: number) {
    const seq = ++detailSeq.current;
    setOpenId(id);
    if (selected?.id !== id) {
      setSelected(null);
      setCapabilities(null);
      setPhoneVisible(false);
    }
    setFeedback(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const detail = await request(`/api/admin/orders/${id}`, props.token);
      if (seq !== detailSeq.current) return;
      setSelected(detail.order);
      setCapabilities(detail.capabilities || null);
    } catch (err) {
      if (seq !== detailSeq.current) return;
      setSelected(null);
      setCapabilities(null);
      setDetailError(detailErrorNotice(err));
    } finally {
      if (seq === detailSeq.current) setDetailLoading(false);
    }
  }

  async function refreshDetail(id: number) {
    try {
      const detail = await request(`/api/admin/orders/${id}`, props.token);
      setSelected(detail.order);
      setCapabilities(detail.capabilities || null);
    } catch {
      /* keep prior selection on soft refresh failure */
    }
  }

  function closeDrawer() {
    detailSeq.current += 1;
    setOpenId(null);
    setSelected(null);
    setCapabilities(null);
    setDetailError(null);
    setDetailLoading(false);
    setFeedback(null);
    setPhoneVisible(false);
  }

  async function orderAction(
    id: number,
    path: string,
    describe: (data: any) => Feedback,
    body: Record<string, unknown> = {},
  ) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const data = await request(path, props.token, { method: "POST", body: JSON.stringify(body) });
      setFeedback(describe(data));
      await Promise.all([loadPage({ offset }), refreshDetail(id)]);
    } catch (err) {
      setFeedback({ tone: "danger", text: actionErrorText(err) });
      if (isStaleStateError(err)) await Promise.all([loadPage({ offset }), refreshDetail(id)]);
    } finally {
      setBusy(false);
    }
  }

  function runStep(to: string) {
    if (!selected) return;
    if (to === "COMPLETED") {
      setConfirmFinish("complete");
      return;
    }
    const id = selected.id;
    void orderAction(id, `/api/orders/${id}/${STEP_ACTIONS[to].path}`, (data) =>
      data?.idempotent
        ? { tone: "info", text: `Buyurtma allaqachon «${fulfillmentLabel(to)}» holatida.` }
        : { tone: "ok", text: `Holat yangilandi: ${fulfillmentLabel(to)}.` },
    );
  }

  function completeOrder(id: number) {
    void orderAction(id, `/api/orders/${id}/${STEP_ACTIONS.COMPLETED.path}`, (data) =>
      data?.idempotent
        ? { tone: "info", text: "Buyurtma allaqachon yakunlangan." }
        : { tone: "ok", text: "Buyurtma yakunlandi." },
    );
  }

  function confirmPos(id: number) {
    void orderAction(
      id,
      `/api/orders/${id}/confirm-pos`,
      () => ({ tone: "ok", text: "FOM tasdiqlandi — buyurtma yakunlandi." }),
      { receiptId: `ADMIN-${Date.now()}` },
    );
  }

  function cancelOrder() {
    if (!selected) return;
    void orderAction(selected.id, `/api/orders/${selected.id}/admin-cancel`, (data) => {
      if (data?.paymentRefundRequired) {
        return {
          tone: "warn",
          text: `Buyurtma bekor qilindi. To‘langan summa avtomatik qaytarilmaydi: provayder orqali qaytarish ${operatorCapabilityLabel("CONTRACT_PENDING").toLowerCase()}.`,
        };
      }
      if (data?.idempotent) return { tone: "info", text: "Buyurtma avvalroq bekor qilingan." };
      return { tone: "ok", text: "Buyurtma bekor qilindi." };
    });
  }

  const drawerCode =
    selected?.code || orders.find((o) => o.id === openId)?.code || "Buyurtma";
  const status = String(selected?.fulfillmentStatus || "");
  const fulfillmentOpen = Boolean(selected) && status !== "COMPLETED" && status !== "CANCELLED";
  const steps = selected && capabilities?.canTransitionFulfillment
    ? nextSteps(status, String(selected.fulfillment || ""))
    : [];
  const primaryStep = steps[0] || null;
  const secondarySteps = steps.slice(1);
  const hasActions = Boolean(primaryStep || capabilities?.canConfirmPos || capabilities?.canCancel);
  const delivery = selected?.delivery || null;
  const address = String(selected?.address || delivery?.address || "").trim();
  const phone = String(selected?.customer?.phone || "");
  const items: any[] = Array.isArray(selected?.items) ? selected.items : [];

  return (
    <div className="orders-page page-module">
      <AdminPageHeader title="Buyurtmalar" description={PAGE_DESCRIPTIONS.orders} />

      <section className="orders-controls" aria-label="Buyurtmalar filtrlari">
        <div className="orders-controls-primary">
          <form className="orders-search" role="search" onSubmit={applySearch}>
            <FilterField label="Qidiruv" grow>
              <span className="orders-search-box">
                <Search size={15} strokeWidth={2} aria-hidden="true" className="orders-search-icon" />
                <input
                  type="search"
                  value={filters.q}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Kod, mijoz ismi yoki telefon"
                  enterKeyHint="search"
                />
              </span>
            </FilterField>
            <button className="ghost orders-search-go" type="submit" disabled={loading && orders.length === 0}>
              Qidirish
            </button>
          </form>

          <FilterField label="Buyurtma holati">
            <select value={filters.fulfillment} onChange={(e) => applyFilter({ fulfillment: e.target.value })}>
              <option value="">Barchasi</option>
              {FULFILLMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{fulfillmentLabel(s)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="To‘lov">
            <select value={filters.payment} onChange={(e) => applyFilter({ payment: e.target.value })}>
              <option value="">Barchasi</option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{paymentLabel(s)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Bron">
            <select value={filters.reservation} onChange={(e) => applyFilter({ reservation: e.target.value })}>
              <option value="">Barchasi</option>
              {RESERVATION_STATUSES.map((s) => (
                <option key={s} value={s}>{reservationLabel(s)}</option>
              ))}
            </select>
          </FilterField>
          {isHq ? (
            <FilterField label="Filial">
              <select value={filters.branchId} onChange={(e) => applyFilter({ branchId: e.target.value })}>
                <option value="">Barcha filiallar</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </FilterField>
          ) : null}
          <div className="orders-date-group" role="group" aria-label="Yaratilgan sana oralig‘i">
            <span className="filter-label">Sana</span>
            <div className="orders-date-inputs">
              <input
                type="date"
                value={filters.createdFrom}
                max={filters.createdTo || undefined}
                onChange={(e) => applyFilter({ createdFrom: e.target.value })}
                aria-label="Sanadan"
              />
              <span className="orders-date-sep" aria-hidden="true">–</span>
              <input
                type="date"
                value={filters.createdTo}
                min={filters.createdFrom || undefined}
                onChange={(e) => applyFilter({ createdTo: e.target.value })}
                aria-label="Sanagacha"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="orders-summary" aria-live="polite">
        <span className="orders-result-count">
          {loading ? "Yuklanmoqda…" : listError ? "—" : `${total} ta buyurtma`}
        </span>
        {!isHq ? <span className="orders-summary-hint">Faqat o‘z filialingiz</span> : null}
        {hasFilters ? (
          <>
            <span className="orders-summary-hint">Filtr qo‘llangan</span>
            <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
              Tozalash
            </button>
          </>
        ) : null}
      </div>

      {listError ? (
        <ErrorState
          message={listError.text}
          onRetry={listError.retry ? () => void loadPage({ offset }) : undefined}
        />
      ) : (
        <div
          className={`orders-surface surface-table${loading && orders.length ? " is-refreshing" : ""}${!loading && !orders.length ? " is-empty" : ""}`}
          aria-busy={loading}
        >
          <DataTable sticky>
            <thead>
              <tr>
                <th>Buyurtma</th>
                <th>Mijoz</th>
                <th>Buyurtma holati</th>
                <th>To‘lov</th>
                <th>Yetkazish</th>
                <th className="num">Summa</th>
                <th>Vaqt</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="orders-skeleton-row" aria-hidden="true">
                    {Array.from({ length: TABLE_COLUMNS }).map((__, c) => (
                      <td key={c} className={c === 5 ? "num" : undefined}>
                        <span className="orders-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr className="orders-empty-row">
                  <td colSpan={TABLE_COLUMNS}>
                    <div className="orders-empty" role="status">
                      <div className="empty-title">
                        {hasFilters ? "Bu filtrlar bo‘yicha buyurtma topilmadi." : "Buyurtmalar mavjud emas."}
                      </div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Filtrlarni o‘zgartiring yoki tozalang."
                          : "Yangi buyurtmalar tushishi bilan shu yerda ko‘rinadi."}
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
                orders.map((item) => {
                  const active = openId === item.id;
                  const when = dateParts(item.createdAt);
                  const itemCount = Array.isArray(item.items) ? item.items.length : 0;
                  const isDelivery = String(item.fulfillment || "").toLowerCase() === "delivery";
                  return (
                    <tr
                      key={item.id}
                      className={`orders-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => void openOrder(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openOrder(item.id);
                        }
                      }}
                    >
                      <td>
                        <div className="orders-code">{item.code}</div>
                        <div className="orders-sub">
                          {itemCount ? `${itemCount} ta mahsulot` : "Mahsulotsiz"}
                          {isHq && item.branch?.name ? ` · ${item.branch.name}` : ""}
                        </div>
                      </td>
                      <td className="orders-customer">{customerLabel(item)}</td>
                      <td>
                        <AxisBadge domain="fulfillment" status={item.fulfillmentStatus || item.status || ""} />
                        {item.reservationExpired ? (
                          <div className="orders-flag">Bron muddati tugagan</div>
                        ) : null}
                      </td>
                      <td>
                        <AxisBadge domain="payment" status={item.paymentStatus || ""} />
                      </td>
                      <td>
                        <div>{fulfillmentKindLabel(item.fulfillment)}</div>
                        {isDelivery && item.delivery ? (
                          <div className="orders-sub">{deliveryStatus(item.delivery.status).label}</div>
                        ) : null}
                      </td>
                      <td className="num orders-amount">{money(Number(item.total || 0))}</td>
                      <td>
                        {when ? (
                          <time className="orders-when" dateTime={String(item.createdAt)}>
                            <span>{when.time}</span>
                            <span className="orders-sub">{when.date}</span>
                          </time>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          {orders.length > 0 ? (
            <PaginationBar
              offset={offset}
              limit={ORDER_PAGE}
              total={total}
              hasMore={hasMore}
              loading={loading || busy}
              onPrev={() => void loadPage({ offset: Math.max(0, offset - ORDER_PAGE) })}
              onNext={() => void loadPage({ offset: offset + ORDER_PAGE })}
            />
          ) : null}
        </div>
      )}

      <DetailDrawer
        open={openId != null}
        width="lg"
        title={drawerCode}
        subtitle={
          selected
            ? [selected.branch?.name, fulfillmentKindLabel(selected.fulfillment), formatDateTime(selected.createdAt)]
              .filter((part) => part && part !== "—")
              .join(" · ")
            : undefined
        }
        status={selected ? <AxisBadge domain="fulfillment" status={selected.fulfillmentStatus || ""} /> : undefined}
        onClose={closeDrawer}
        footer={
          selected ? (
            hasActions ? (
              <div className="orders-drawer-actions">
                {capabilities?.canCancel ? (
                  <button
                    className="btn-tertiary orders-cancel-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmCancel(true)}
                  >
                    Bekor qilish
                  </button>
                ) : null}
                <div className="orders-actions-main" role="group" aria-label="Buyurtma amallari">
                  {secondarySteps.map((to) => (
                    <button key={to} className="ghost" type="button" disabled={busy} onClick={() => runStep(to)}>
                      {STEP_ACTIONS[to].label}
                    </button>
                  ))}
                  {capabilities?.canConfirmPos ? (
                    <button className="ghost" type="button" disabled={busy} onClick={() => setConfirmFinish("pos")}>
                      FOM tasdiq
                    </button>
                  ) : null}
                  {primaryStep ? (
                    <button className="btn-primary" type="button" disabled={busy} onClick={() => runStep(primaryStep)}>
                      {STEP_ACTIONS[primaryStep].label}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="orders-actions-note">
                {fulfillmentOpen
                  ? "Bu buyurtma holatini o‘zgartirish uchun ruxsat yo‘q."
                  : "Buyurtma yopilgan — amallar mavjud emas."}
              </p>
            )
          ) : undefined
        }
      >
        {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

        {detailLoading && !selected ? <LoadingBlock rows={6} label="Buyurtma yuklanmoqda…" /> : null}

        {detailError ? (
          <ErrorState
            message={detailError.text}
            onRetry={detailError.retry && openId != null ? () => void openOrder(openId) : undefined}
          />
        ) : null}

        {selected ? (
          <>
            <DrawerSection title="Mijoz">
              {selected.customer ? (
                <dl className="orders-kv">
                  <Row label="Ism">{customerLabel(selected)}</Row>
                  <Row label="Telefon">
                    {phone ? (
                      <span className="orders-phone">
                        <span className="orders-phone-value">{phoneVisible ? formatPhone(phone) : maskPhone(phone)}</span>
                        <button
                          className="btn-tertiary orders-phone-toggle"
                          type="button"
                          aria-pressed={phoneVisible}
                          onClick={() => setPhoneVisible((v) => !v)}
                        >
                          {phoneVisible ? "Yashirish" : "Ko‘rsatish"}
                        </button>
                      </span>
                    ) : "—"}
                  </Row>
                </dl>
              ) : (
                <p className="orders-note">Mijoz ma’lumoti yo‘q.</p>
              )}
            </DrawerSection>

            <DrawerSection title="Buyurtma">
              {items.length ? (
                <ul className="orders-items">
                  {items.map((it: any) => (
                    <li key={it.id} className="orders-item">
                      <span className="orders-item-title">{it.title}</span>
                      <span className="orders-item-qty">
                        {it.quantity} × {money(Number(it.price || 0))}
                      </span>
                      <span className="orders-item-sum">{money(lineTotal(it))}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="orders-note">Mahsulotlar ro‘yxati bo‘sh.</p>
              )}
              <dl className="orders-totals">
                <Row label="Mahsulotlar">{money(Number(selected.subtotal || 0))}</Row>
                {Number(selected.deliveryFee || 0) > 0 ? (
                  <Row label="Yetkazish">{money(Number(selected.deliveryFee))}</Row>
                ) : null}
                {Number(selected.cashbackUsed || 0) > 0 ? (
                  <Row label="Cashback bilan to‘langan">−{money(Number(selected.cashbackUsed))}</Row>
                ) : null}
                <div className="orders-totals-grand">
                  <dt>Jami</dt>
                  <dd>{money(Number(selected.total || 0))}</dd>
                </div>
                {Number(selected.cashbackEarned || 0) > 0 ? (
                  <Row label="Hisoblangan cashback">{money(Number(selected.cashbackEarned))}</Row>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="To‘lov">
              <dl className="orders-kv">
                <Row label="Holat"><AxisBadge domain="payment" status={selected.paymentStatus || ""} /></Row>
                <Row label="Summa"><span className="orders-kv-strong">{money(Number(selected.total || 0))}</span></Row>
                {selected.paymentMethod ? (
                  <Row label="Usul">{paymentMethodLabel(selected.paymentMethod)}</Row>
                ) : null}
              </dl>
              {fulfillmentOpen && selected.paymentStatus !== "PAID" && capabilities?.canTransitionFulfillment ? (
                <p className="orders-note">Yakunlash yoki FOM tasdiq to‘lovni «To‘langan» holatiga o‘tkazadi.</p>
              ) : null}
              {isPaidLike(selected.paymentStatus) && capabilities?.paymentRefundsViaPsp === false ? (
                <p className="orders-note">
                  Provayder orqali pul qaytarish {operatorCapabilityLabel("CONTRACT_PENDING").toLowerCase()}.
                </p>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Bron">
              <dl className="orders-kv">
                <Row label="Holat"><AxisBadge domain="reservation" status={selected.reservationStatus || ""} /></Row>
                {selected.reservedUntil ? (
                  <Row label="Muddat">{formatDateTime(selected.reservedUntil)}</Row>
                ) : null}
              </dl>
              {selected.reservationExpired ? (
                <p className="orders-note is-warn">Bron muddati tugagan — avto-bekor yo‘q.</p>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Yetkazish">
              <dl className="orders-kv">
                <Row label="Turi">{fulfillmentKindLabel(selected.fulfillment)}</Row>
                <Row label="Filial">{selected.branch?.name || "—"}</Row>
                {address ? <Row label="Manzil">{address}</Row> : null}
                {delivery ? (
                  <>
                    <Row label="Holat">
                      <StatusBadge tone={deliveryStatus(delivery.status).tone}>
                        {deliveryStatus(delivery.status).label}
                      </StatusBadge>
                    </Row>
                    {String(delivery.courierName || "").trim() ? (
                      <Row label="Kuryer">{delivery.courierName}</Row>
                    ) : null}
                    {String(delivery.timeWindow || "").trim() ? (
                      <Row label="Vaqt oralig‘i">{delivery.timeWindow}</Row>
                    ) : null}
                  </>
                ) : null}
                {String(selected.comment || "").trim() ? <Row label="Izoh">{selected.comment}</Row> : null}
              </dl>
            </DrawerSection>

            <details className="orders-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="orders-kv orders-kv-tech">
                <Row label="Buyurtma ID">{selected.id}</Row>
                {selected.customerId != null ? <Row label="Mijoz ID">{selected.customerId}</Row> : null}
                {selected.branchId != null ? <Row label="Filial ID">{selected.branchId}</Row> : null}
                {selected.reservationId != null ? <Row label="Bron ID">{selected.reservationId}</Row> : null}
                {delivery?.id != null ? <Row label="Yetkazish ID">{delivery.id}</Row> : null}
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmCancel}
        title="Buyurtmani bekor qilish"
        danger
        busy={busy}
        confirmLabel="Bekor qilish"
        cancelLabel="Qaytish"
        description={
          selected
            ? `${selected.code} bekor qilinadi, bron qilingan mahsulotlar qoldiqqa qaytariladi.${
              Number(selected.cashbackUsed || 0) > 0 ? " Ishlatilgan cashback mijozga qaytariladi." : ""
            }${
              isPaidLike(selected.paymentStatus)
                ? ` To‘langan summa avtomatik qaytarilmaydi — provayder orqali qaytarish ${operatorCapabilityLabel("CONTRACT_PENDING").toLowerCase()}.`
                : ""
            }`
            : undefined
        }
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          if (!selected) return;
          setConfirmCancel(false);
          cancelOrder();
        }}
      />

      <ConfirmDialog
        open={confirmFinish != null}
        title={confirmFinish === "pos" ? "FOM orqali tasdiqlash" : "Buyurtmani yakunlash"}
        busy={busy}
        confirmLabel={confirmFinish === "pos" ? "Tasdiqlash" : "Yakunlash"}
        cancelLabel="Qaytish"
        description={
          selected
            ? `${selected.code}${confirmFinish === "pos" ? " kassada (FOM) sotilgan deb tasdiqlanadi va" : ""} yakunlanadi${
              selected.paymentStatus === "PAID" ? "" : ", to‘lov holati «To‘langan» bo‘ladi"
            }, mahsulotlar qoldiqdan chiqariladi. Bu amalni ortga qaytarib bo‘lmaydi.`
            : undefined
        }
        onCancel={() => setConfirmFinish(null)}
        onConfirm={() => {
          if (!selected) return;
          const kind = confirmFinish;
          setConfirmFinish(null);
          if (kind === "pos") confirmPos(selected.id);
          else completeOrder(selected.id);
        }}
      />
    </div>
  );
}
