import { FormEvent, KeyboardEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, RefreshCw, Search, Truck } from "lucide-react";
import { request, isHqRole, money, type AdminUser, type ApiError } from "../api";
import {
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterBar,
  FilterField,
  DataTable,
  PaginationBar,
  DetailDrawer,
  DrawerSection,
  ConfirmDialog,
  FeedbackBanner,
  ErrorState,
  LoadingBlock,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const PAGE_SIZE = 40;
const TABLE_COLUMNS = 8;

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";

/** Real delivery lifecycle values — api-server lib/deliveryLifecycle.ts (DELIVERY_STATUSES). */
const DELIVERY_STATUSES = [
  "pending",
  "assigned",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
  "failed",
] as const;
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const STATUS_META: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  pending: { label: "Kuryer kutilmoqda", tone: "warn" },
  assigned: { label: "Kuryer biriktirilgan", tone: "info" },
  picked_up: { label: "Kuryer olib ketdi", tone: "info" },
  on_the_way: { label: "Yo‘lda", tone: "info" },
  delivered: { label: "Yetkazildi", tone: "ok" },
  cancelled: { label: "Bekor qilindi", tone: "neutral" },
  failed: { label: "Yetkazilmadi", tone: "danger" },
};

/** Must match GRAPH in api-server lib/deliveryLifecycle.ts. "assigned" is reached through the courier form. */
const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ["assigned", "cancelled", "failed"],
  assigned: ["picked_up", "on_the_way", "cancelled", "failed"],
  picked_up: ["on_the_way", "cancelled", "failed"],
  on_the_way: ["delivered", "failed", "cancelled"],
  delivered: [],
  cancelled: [],
  failed: [],
};

const PROGRESS_STEPS: DeliveryStatus[] = ["picked_up", "on_the_way", "delivered"];
const CLOSING_STEPS: DeliveryStatus[] = ["failed", "cancelled"];

const STEP_LABEL: Partial<Record<DeliveryStatus, string>> = {
  picked_up: "Kuryer olib ketdi",
  on_the_way: "Yo‘lga chiqdi",
  delivered: "Yetkazildi",
  failed: "Yetkazilmadi",
  cancelled: "Yetkazishni bekor qilish",
};

/**
 * "delivered" completes the order through FULFILLMENT_GRAPH (orderTransitions.ts). The delivery row is written
 * before that order transition, so the step is only offered from order states that can reach COMPLETED.
 */
const ORDER_COMPLETABLE = new Set(["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "COMPLETED"]);

/** Delivery fields a fresher order-detail row may override (deliveries table columns). */
const LIVE_FIELDS = [
  "status",
  "courierName",
  "courierId",
  "timeWindow",
  "address",
  "provider",
  "providerRef",
  "mode",
  "assignedAt",
  "pickedUpAt",
  "outAt",
  "deliveredAt",
  "cancelledAt",
  "updatedAt",
] as const;

const REFRESH_CODES = new Set(["INVALID_DELIVERY_TRANSITION", "ORDER_CANCELLED", "INVALID_TRANSITION", "TERMINAL_STATE"]);

type Filters = { q: string; status: string; branchId: string };
const EMPTY_FILTERS: Filters = { q: "", status: "", branchId: "" };

type LoadError = { kind: "session" | "forbidden" | "notfound" | "network" | "failed"; message: string };
type Feedback = { tone: "ok" | "warn" | "danger" | "info"; text: string };
type PendingAction = { kind: "assign"; courierName: string } | { kind: "status"; to: DeliveryStatus };

function statusOf(err: unknown): number {
  return err && typeof err === "object" && "status" in err ? Number((err as ApiError).status) || 0 : 0;
}

function codeOf(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String((err as ApiError).code || "") : "";
}

function listError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) {
    return { kind: "forbidden", message: "Yetkazib berishlarni ko‘rish uchun ruxsat yo‘q yoki sizga filial biriktirilmagan." };
  }
  if (!status) return { kind: "network", message: "Server bilan aloqa yo‘q. Internet aloqasini tekshirib, qayta urinib ko‘ring." };
  return { kind: "failed", message: "Yetkazib berishlarni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring." };
}

function detailError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Bu buyurtma tafsilotini ko‘rish uchun ruxsat yo‘q." };
  if (status === 404) return { kind: "notfound", message: "Buyurtma topilmadi." };
  if (!status) return { kind: "network", message: "Server bilan aloqa yo‘q — buyurtma tafsiloti yuklanmadi." };
  return { kind: "failed", message: "Buyurtma tafsilotini yuklab bo‘lmadi." };
}

function actionError(err: unknown): string {
  const status = statusOf(err);
  const code = codeOf(err);
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (code === "COURIER_BRANCH_MISMATCH") return "Kuryer filiali buyurtma filiali bilan mos emas.";
  if (status === 403) return "Bu amal uchun ruxsat yo‘q yoki buyurtma filialingizga tegishli emas.";
  if (status === 404) return "Buyurtma yoki yetkazish yozuvi topilmadi. Ro‘yxat yangilandi.";
  if (code === "INVALID_DELIVERY_TRANSITION") return "Yetkazish holati o‘zgargan — bu amal endi mavjud emas. Ma’lumot yangilandi.";
  if (code === "ORDER_CANCELLED") return "Buyurtma bekor qilingan — «Yetkazildi» deb belgilab bo‘lmaydi.";
  if (code === "NOT_DELIVERY_ORDER") return "Bu buyurtma yetkazib berish emas.";
  if (code === "INVALID_TRANSITION" || code === "TERMINAL_STATE") {
    return "Buyurtma holati bu amalga mos emas. Ma’lumot yangilandi — buyurtmani Buyurtmalar bo‘limida tekshiring.";
  }
  if (status === 400) return "Kiritilgan ma’lumot noto‘g‘ri. Qiymatlarni tekshiring.";
  if (!status) return "Server bilan aloqa yo‘q. Amal bajarilmadi.";
  return "Amalni bajarib bo‘lmadi. Qayta urinib ko‘ring.";
}

function asStatus(value: unknown): DeliveryStatus | null {
  const s = String(value || "").toLowerCase();
  return (DELIVERY_STATUSES as readonly string[]).includes(s) ? (s as DeliveryStatus) : null;
}

function statusMeta(value: unknown): { label: string; tone: Tone } {
  const s = asStatus(value);
  return s ? STATUS_META[s] : { label: "Holati noma’lum", tone: "neutral" };
}

function DeliveryBadge(props: { status: unknown }) {
  const meta = statusMeta(props.status);
  return (
    <StatusBadge tone={meta.tone} title={String(props.status || "") || undefined}>
      {meta.label}
    </StatusBadge>
  );
}

function isExternal(row: any): boolean {
  return String(row?.provider || "").toLowerCase() === "external" || String(row?.mode || "").toLowerCase() === "external";
}

function providerLabel(row: any): string {
  return isExternal(row) ? "Tashqi xizmat" : "Ichki kuryer";
}

function dateParts(value: unknown): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

function formatDateTime(value: unknown): string {
  const parts = dateParts(value);
  return parts ? `${parts.date}, ${parts.time}` : "—";
}

function personName(person: any): string {
  return `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
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

function sameDelivery(a: any, b: any): boolean {
  return a != null && b != null && Number(a.id) === Number(b.id);
}

/** Prefer the order-detail delivery row only when it is not older than the list row. */
function liveDelivery(row: any, order: any): any {
  if (!row) return row;
  const live = order?.delivery;
  if (!live || !sameDelivery(live, row)) return row;
  const liveAt = new Date(String(live.updatedAt || 0)).getTime();
  const rowAt = new Date(String(row.updatedAt || 0)).getTime();
  if (Number.isFinite(rowAt) && Number.isFinite(liveAt) && liveAt < rowAt) return row;
  const next = { ...row };
  for (const key of LIVE_FIELDS) if (key in live) next[key] = live[key];
  if (order.fulfillmentStatus) next.fulfillmentStatus = order.fulfillmentStatus;
  return next;
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

function Missing() {
  return <span className="dv-missing">Ma’lumot mavjud emas</span>;
}

export function DeliveryPage(props: {
  token: string;
  user: AdminUser | null;
  permissions: string[];
  branches: any[];
  onOpenOrder?: (orderId: number) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [externalCode, setExternalCode] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const listSeq = useRef(0);

  const [current, setCurrent] = useState<any | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<LoadError | null>(null);
  const detailSeq = useRef(0);
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [courierName, setCourierName] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [syncNote, setSyncNote] = useState<Feedback | null>(null);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const canUpdate = props.permissions.includes("delivery:update");
  const canReadOrder = props.permissions.includes("orders:read");
  const hasFilters = Boolean(filters.q || filters.status || filters.branchId);

  async function load(opts?: { offset?: number; filters?: Filters }) {
    const nextOffset = opts?.offset ?? 0;
    const f = opts?.filters ?? filters;
    const qs = new URLSearchParams();
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String(nextOffset));
    if (f.q) qs.set("q", f.q);
    if (f.status) qs.set("status", f.status);
    if (f.branchId) qs.set("branchId", f.branchId);

    const seq = ++listSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await request(`/api/admin/deliveries?${qs}`, props.token);
      if (seq !== listSeq.current) return;
      const list: any[] = Array.isArray(data?.deliveries) ? data.deliveries : [];
      setRows(list);
      setTotal(Number(data?.total ?? data?.pagination?.total ?? 0));
      setHasMore(Boolean(data?.hasMore ?? data?.pagination?.hasMore));
      setOffset(nextOffset);
      setExternalCode(String(data?.externalProvider || ""));
      setLoaded(true);
      setCurrent((prev: any) => (prev ? list.find((r) => sameDelivery(r, prev)) || prev : prev));
    } catch (err) {
      if (seq !== listSeq.current) return;
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(listError(err));
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  async function loadOrder(orderId: number, soft = false) {
    if (!canReadOrder || !Number.isFinite(orderId) || orderId <= 0) return;
    const seq = ++detailSeq.current;
    if (!soft) {
      setOrder(null);
      setOrderLoading(true);
    }
    setOrderError(null);
    try {
      const data = await request(`/api/admin/orders/${orderId}`, props.token);
      if (seq !== detailSeq.current) return;
      setOrder(data?.order || null);
    } catch (err) {
      if (seq !== detailSeq.current) return;
      if (!soft) setOrder(null);
      setOrderError(detailError(err));
    } finally {
      if (seq === detailSeq.current) setOrderLoading(false);
    }
  }

  function applyFilter(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void load({ offset: 0, filters: next });
  }

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    applyFilter({ q: query.trim() });
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (!value && filters.q) applyFilter({ q: "" });
  }

  function resetFilters() {
    setQuery("");
    setFilters(EMPTY_FILTERS);
    void load({ offset: 0, filters: EMPTY_FILTERS });
  }

  function openRow(row: any) {
    setCurrent(row);
    setCourierName(String(row.courierName || ""));
    setFormMsg("");
    setFeedback(null);
    setSyncNote(null);
    setPhoneVisible(false);
    setReason("");
    void loadOrder(Number(row.orderId));
  }

  function closeDrawer() {
    detailSeq.current += 1;
    setCurrent(null);
    setOrder(null);
    setOrderError(null);
    setOrderLoading(false);
    setFeedback(null);
    setSyncNote(null);
    setFormMsg("");
    setPendingAction(null);
    setPhoneVisible(false);
  }

  function rowKeys(row: any) {
    return (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openRow(row);
      }
    };
  }

  const delivery = liveDelivery(current, order);
  const status = asStatus(delivery?.status);
  const nextSteps = status ? NEXT_STATUS[status] : [];
  const fulfillment = String(delivery?.fulfillmentStatus || "").toUpperCase();
  const canAssign = canUpdate && (status === "pending" || status === "assigned");
  const deliveredBlock = nextSteps.includes("delivered") && fulfillment !== "" && !ORDER_COMPLETABLE.has(fulfillment)
    ? fulfillment === "CANCELLED"
      ? "Buyurtma bekor qilingan — «Yetkazildi» deb belgilab bo‘lmaydi. Yetkazishni bekor qiling."
      : "Buyurtma hali tasdiqlanmagan — «Yetkazildi» uchun avval Buyurtmalar bo‘limida buyurtmani tasdiqlang."
    : "";
  const progress = canUpdate ? PROGRESS_STEPS.filter((s) => nextSteps.includes(s)) : [];
  const closing = canUpdate ? CLOSING_STEPS.filter((s) => nextSteps.includes(s)) : [];
  const primaryStep = progress.length ? progress[0] : null;
  const secondarySteps = progress.slice(1);
  const customer = order?.customer || delivery?.customer || null;
  const phone = String(order?.customer?.phone || "");
  const branchName = order?.branch?.name
    || props.branches.find((b) => Number(b.id) === Number(delivery?.branchId))?.name
    || "";

  function rowBranchName(row: any): string {
    return props.branches.find((b) => Number(b.id) === Number(row.branchId))?.name || "";
  }

  function submitAssign(e: FormEvent) {
    e.preventDefault();
    if (!delivery || !canAssign) return;
    const name = courierName.trim();
    if (!name) {
      setFormMsg("Kuryer ismini kiriting.");
      return;
    }
    if (status === "assigned" && name === String(delivery.courierName || "").trim()) {
      setFormMsg("Bu kuryer allaqachon biriktirilgan.");
      return;
    }
    setFormMsg("");
    setPendingAction({ kind: "assign", courierName: name });
  }

  function askStep(to: DeliveryStatus) {
    if (!canUpdate || !nextSteps.includes(to)) return;
    if (to === "delivered" && deliveredBlock) return;
    setReason("");
    setPendingAction({ kind: "status", to });
  }

  async function runAction(action: PendingAction) {
    if (busy || !current) return;
    const orderId = Number(current.orderId);
    setBusy(true);
    setFeedback(null);
    try {
      let data: any;
      if (action.kind === "assign") {
        data = await request(`/api/deliveries/${orderId}/assign`, props.token, {
          method: "POST",
          body: JSON.stringify({ courierName: action.courierName }),
        });
      } else {
        const body: Record<string, unknown> = { status: action.to };
        if (reason.trim()) body.reason = reason.trim();
        data = await request(`/api/deliveries/${orderId}/status`, props.token, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setPendingAction(null);
      setReason("");
      if (data?.delivery) {
        setCurrent((prev: any) => (sameDelivery(prev, data.delivery) ? { ...prev, ...data.delivery } : prev));
      }
      setFeedback({
        tone: "ok",
        text: action.kind === "assign"
          ? `Kuryer biriktirildi: ${action.courierName}.`
          : `Yetkazish holati yangilandi: ${STATUS_META[action.to].label}.`,
      });
      await Promise.all([load({ offset }), loadOrder(orderId, true)]);
    } catch (err) {
      setPendingAction(null);
      setFeedback({ tone: "danger", text: actionError(err) });
      if (statusOf(err) === 404 || REFRESH_CODES.has(codeOf(err))) {
        await Promise.all([load({ offset }), loadOrder(orderId, true)]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function checkExternal() {
    if (busy || !current || !isExternal(delivery)) return;
    setBusy(true);
    setSyncNote(null);
    try {
      const data = await request(`/api/deliveries/${Number(current.orderId)}/external/sync`, props.token, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSyncNote({ tone: "info", text: `Tashqi xizmat: ${operatorCapabilityLabel(String(data?.code || ""))}.` });
    } catch (err) {
      if (statusOf(err) === 501) {
        setSyncNote({ tone: "info", text: "Tashqi yetkazib berish xizmati hali ulanmagan — holat sinxronlanmadi." });
      } else {
        setSyncNote({ tone: "danger", text: actionError(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmBody(action: PendingAction): ReactNode {
    const code = delivery?.orderCode || `#${delivery?.orderId ?? ""}`;
    const orderNote = fulfillment === "CREATED"
      ? "Buyurtma hali tasdiqlanmagan — uning holati o‘zgarmaydi."
      : "Buyurtma hali «Yetkazilmoqda» bosqichida bo‘lmasa, shu bosqichga o‘tkaziladi. To‘lov holati o‘zgarmaydi.";
    if (action.kind === "assign") {
      return (
        <div className="dv-confirm">
          <p className="dv-confirm-text">
            <strong>{code}</strong> uchun kuryer: <strong>{action.courierName}</strong>
          </p>
          <p className="dv-confirm-text">
            {status === "assigned"
              ? `Hozirgi kuryer (${delivery?.courierName || "—"}) almashtiriladi.`
              : "Yetkazish «Kuryer biriktirilgan» holatiga o‘tadi."}
          </p>
          {status === "pending" ? <p className="dv-confirm-text">{orderNote}</p> : null}
        </div>
      );
    }
    const to = action.to;
    return (
      <div className="dv-confirm">
        <p className="dv-confirm-text">
          <strong>{code}</strong>: {status ? STATUS_META[status].label : "—"} → {STATUS_META[to].label}
        </p>
        {to === "picked_up" || to === "on_the_way" ? <p className="dv-confirm-text">{orderNote}</p> : null}
        {to === "delivered" ? (
          <p className="dv-confirm-warn">
            Buyurtma «Yakunlangan» holatiga o‘tadi, bron qilingan mahsulotlar qoldiqdan chiqariladi va cashback qoidalar
            bo‘yicha hisoblanadi. To‘lov holati o‘zgarmaydi. Bu amalni ortga qaytarib bo‘lmaydi.
          </p>
        ) : null}
        {to === "cancelled" || to === "failed" ? (
          <>
            <p className="dv-confirm-warn">
              {to === "cancelled" ? "Yetkazish bekor qilinadi." : "Yetkazish «Yetkazilmadi» deb yopiladi."} Buyurtmaning
              o‘zi bekor qilinmaydi — kerak bo‘lsa Buyurtmalar bo‘limida alohida bekor qiling. Bu amalni ortga qaytarib
              bo‘lmaydi.
            </p>
            {isExternal(delivery) && to === "cancelled" ? (
              <p className="dv-confirm-text">
                Tashqi xizmatga bekor qilish so‘rovi yuborilmaydi — integratsiya hali ulanmagan.
              </p>
            ) : null}
            <label className="filter-field dv-reason">
              <span className="filter-label">Sabab (ixtiyoriy)</span>
              <input
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Masalan: mijoz manzilda yo‘q"
              />
            </label>
          </>
        ) : null}
      </div>
    );
  }

  const confirmTitle = pendingAction
    ? pendingAction.kind === "assign"
      ? status === "assigned" ? "Kuryerni almashtirish" : "Kuryer biriktirish"
      : pendingAction.to === "cancelled"
        ? "Yetkazishni bekor qilish"
        : pendingAction.to === "failed"
          ? "Yetkazilmadi deb belgilash"
          : "Yetkazish holatini o‘zgartirish"
    : "";
  const confirmDanger = pendingAction?.kind === "status" && (pendingAction.to === "cancelled" || pendingAction.to === "failed");
  const confirmLabel = pendingAction
    ? pendingAction.kind === "assign"
      ? "Biriktirish"
      : STEP_LABEL[pendingAction.to] || "Tasdiqlash"
    : "Tasdiqlash";

  const initialLoading = loading && !loaded;
  const timeline = delivery
    ? [
      { label: "Biriktirildi", at: delivery.assignedAt },
      { label: "Kuryer olib ketdi", at: delivery.pickedUpAt },
      { label: "Yo‘lga chiqdi", at: delivery.outAt },
      { label: "Yetkazildi", at: delivery.deliveredAt },
      { label: status === "failed" ? "Yetkazilmadi" : "Bekor qilindi", at: delivery.cancelledAt },
    ].filter((t) => Boolean(t.at))
    : [];

  return (
    <div className="delivery-page page-module">
      <AdminPageHeader
        title="Yetkazib berish"
        description={PAGE_DESCRIPTIONS.delivery}
        meta={
          <span className="dv-meta">
            <span className="dv-mode">
              {canUpdate
                ? "Kuryer biriktirish va holatni o‘zgartirish mumkin"
                : "Faqat ko‘rish — yetkazib berish amallari uchun ruxsat yo‘q"}
            </span>
            <span className="dv-mode">{isHq ? "Barcha filiallar" : "Faqat o‘z filialingiz"}</span>
            {externalCode ? (
              <span className="dv-mode">Tashqi yetkazib berish: {operatorCapabilityLabel(externalCode).toLowerCase()}</span>
            ) : null}
          </span>
        }
        actions={
          <button
            className={`btn-secondary dv-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => void load({ offset })}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <section className="dv-list" aria-label="Yetkazib berishlar ro‘yxati">
        <FilterBar
          meta={
            <span className="dv-controls-note">
              Qidiruv, holat va filial filtrlari serverda qo‘llanadi. Sana, kuryer va yetkazish turi bo‘yicha filtr API’da
              mavjud emas.
            </span>
          }
        >
          <form className="dv-search" role="search" onSubmit={applySearch}>
            <FilterField label="Qidiruv" grow>
              <span className="dv-search-box">
                <Search size={15} strokeWidth={2} aria-hidden="true" className="dv-search-icon" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Buyurtma kodi, mijoz, telefon yoki manzil"
                  enterKeyHint="search"
                  maxLength={64}
                />
              </span>
            </FilterField>
            <button className="btn-secondary dv-search-go" type="submit" disabled={initialLoading}>
              Qidirish
            </button>
          </form>
          <FilterField label="Holat">
            <select value={filters.status} onChange={(e) => applyFilter({ status: e.target.value })}>
              <option value="">Barchasi</option>
              {DELIVERY_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
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
          {hasFilters ? (
            <button className="btn-tertiary dv-clear" type="button" disabled={loading} onClick={resetFilters}>
              Tozalash
            </button>
          ) : null}
        </FilterBar>

        <div className="dv-summary" aria-live="polite">
          <span className="dv-result-count">
            {initialLoading ? "Yuklanmoqda…" : error ? "—" : `${total} ta yetkazib berish`}
          </span>
          {filters.q && !error ? <span className="dv-summary-hint">«{filters.q}» bo‘yicha</span> : null}
          {hasFilters && !error ? <span className="dv-summary-hint">Filtr qo‘llangan</span> : null}
        </div>

        {error ? (
          <ErrorState
            message={error.message}
            onRetry={error.kind === "failed" || error.kind === "network" ? () => void load({ offset }) : undefined}
          />
        ) : (
          <div
            className={`dv-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !rows.length ? " is-empty" : ""}`}
            aria-busy={loading}
          >
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Buyurtma</th>
                  <th>Mijoz</th>
                  <th>Holat</th>
                  <th className="dv-col-order">Buyurtma holati</th>
                  <th className="dv-col-courier">Kuryer</th>
                  <th>Manzil</th>
                  <th className="dv-col-window">Vaqt oynasi</th>
                  <th className="dv-col-updated">Yangilangan</th>
                </tr>
              </thead>
              <tbody>
                {initialLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="dv-skeleton-row" aria-hidden="true">
                      {Array.from({ length: TABLE_COLUMNS }).map((__, c) => (
                        <td
                          key={c}
                          className={c === 3 ? "dv-col-order" : c === 4 ? "dv-col-courier" : c === 6 ? "dv-col-window" : c === 7 ? "dv-col-updated" : undefined}
                        >
                          <span className="dv-skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr className="dv-empty-row">
                    <td colSpan={TABLE_COLUMNS}>
                      <div className="dv-empty" role="status">
                        <span className="dv-empty-icon" aria-hidden="true"><Truck size={18} strokeWidth={1.8} /></span>
                        <div className="empty-title">
                          {hasFilters ? "Tanlangan shartlar bo‘yicha yetkazib berish topilmadi." : "Yetkazib berishlar hozircha yo‘q."}
                        </div>
                        <p className="empty-desc">
                          {hasFilters
                            ? "Qidiruv so‘zini yoki filtrlarni o‘zgartiring."
                            : "Mijoz ilovada yetkazib berish bilan buyurtma berganda shu yerda paydo bo‘ladi."}
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
                  rows.map((item) => {
                    const active = sameDelivery(current, item);
                    const created = dateParts(item.orderCreatedAt);
                    const updated = dateParts(item.updatedAt);
                    const name = personName(item.customer);
                    const branch = isHq ? rowBranchName(item) : "";
                    return (
                      <tr
                        key={item.id}
                        className={`dv-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        aria-label={`${item.orderCode || `#${item.orderId}`} — yetkazish tafsiloti`}
                        onClick={() => openRow(item)}
                        onKeyDown={rowKeys(item)}
                      >
                        <td className="dv-cell-main">
                          <span className="dv-code">{item.orderCode || `#${item.orderId}`}</span>
                          <span className="dv-sub">
                            {[branch, created ? `${created.date}, ${created.time}` : ""].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </td>
                        <td className="dv-cell-customer">{name || <span className="dv-missing">—</span>}</td>
                        <td className="dv-cell-status"><DeliveryBadge status={item.status} /></td>
                        <td className="dv-cell-order dv-col-order">
                          {item.fulfillmentStatus ? <StatusLabelBadge domain="fulfillment" status={item.fulfillmentStatus} /> : "—"}
                        </td>
                        <td className="dv-cell-courier dv-col-courier">
                          {item.courierName ? item.courierName : <span className="dv-missing">Biriktirilmagan</span>}
                        </td>
                        <td className="dv-cell-address">
                          <span className="dv-address">{item.address || "—"}</span>
                        </td>
                        <td className="dv-cell-window dv-col-window">{item.timeWindow || "—"}</td>
                        <td className="dv-cell-updated dv-col-updated">
                          {updated ? (
                            <time dateTime={String(item.updatedAt)}>
                              <span>{updated.time}</span>
                              <span className="dv-sub">{updated.date}</span>
                            </time>
                          ) : "—"}
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
                loading={loading || busy}
                onPrev={() => void load({ offset: Math.max(0, offset - PAGE_SIZE) })}
                onNext={() => void load({ offset: offset + PAGE_SIZE })}
              />
            ) : null}
          </div>
        )}
      </section>

      <DetailDrawer
        open={Boolean(delivery)}
        width="lg"
        title={delivery ? delivery.orderCode || `Buyurtma #${delivery.orderId}` : "Yetkazib berish"}
        subtitle={delivery ? [branchName, providerLabel(delivery)].filter(Boolean).join(" · ") : undefined}
        status={
          delivery ? (
            <div className="dv-drawer-status">
              <DeliveryBadge status={delivery.status} />
              {fulfillment ? (
                <span className="dv-axis">
                  Buyurtma: <StatusLabelBadge domain="fulfillment" status={fulfillment} />
                </span>
              ) : null}
            </div>
          ) : undefined
        }
        onClose={closeDrawer}
        footer={
          delivery ? (
            !status || !nextSteps.length ? (
              <p className="dv-actions-note">Yetkazish yopilgan — amallar mavjud emas.</p>
            ) : !canUpdate ? (
              <p className="dv-actions-note">Yetkazish amallari uchun ruxsat yo‘q.</p>
            ) : (
              <div className="dv-drawer-actions">
                {closing.map((to) => (
                  <button key={to} className="btn-secondary dv-close-step" type="button" disabled={busy} onClick={() => askStep(to)}>
                    {STEP_LABEL[to]}
                  </button>
                ))}
                <div className="dv-actions-main" role="group" aria-label="Yetkazish amallari">
                  {status === "pending" ? <span className="dv-actions-hint">Keyingi qadam: kuryer biriktirish</span> : null}
                  {secondarySteps.map((to) => (
                    <button key={to} className="btn-secondary" type="button" disabled={busy} onClick={() => askStep(to)}>
                      {STEP_LABEL[to]}
                    </button>
                  ))}
                  {primaryStep ? (
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={busy || (primaryStep === "delivered" && Boolean(deliveredBlock))}
                      title={primaryStep === "delivered" && deliveredBlock ? deliveredBlock : undefined}
                      onClick={() => askStep(primaryStep)}
                    >
                      {STEP_LABEL[primaryStep]}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          ) : undefined
        }
      >
        {delivery ? (
          <>
            {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

            <DrawerSection title="Yetkazib berish">
              <dl className="dv-kv">
                <Row label="Holat"><DeliveryBadge status={delivery.status} /></Row>
                <Row label="Yetkazish turi">{providerLabel(delivery)}</Row>
                <Row label="Oxirgi o‘zgarish">{delivery.updatedAt ? formatDateTime(delivery.updatedAt) : <Missing />}</Row>
              </dl>
              {timeline.length ? (
                <ol className="dv-timeline" aria-label="Vaqt belgilari">
                  {timeline.map((t) => (
                    <li key={t.label}>
                      <span className="dv-timeline-label">{t.label}</span>
                      <time dateTime={String(t.at)}>{formatDateTime(t.at)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="dv-note">Hali vaqt belgilari yo‘q — kuryer biriktirilmagan.</p>
              )}
              <p className="dv-note">Holat o‘zgarishlari tarixi API’da mavjud emas — faqat oxirgi vaqt belgilari ko‘rsatiladi.</p>
              {deliveredBlock ? <p className="dv-note is-warn">{deliveredBlock}</p> : null}
            </DrawerSection>

            <DrawerSection title="Buyurtma">
              <dl className="dv-kv">
                <Row label="Kod"><span className="dv-kv-strong">{delivery.orderCode || `#${delivery.orderId}`}</span></Row>
                <Row label="Buyurtma holati">
                  {fulfillment ? <StatusLabelBadge domain="fulfillment" status={fulfillment} /> : <Missing />}
                </Row>
                {order ? (
                  <>
                    <Row label="To‘lov"><StatusLabelBadge domain="payment" status={String(order.paymentStatus || "")} /></Row>
                    <Row label="Jami"><span className="dv-kv-strong">{money(Number(order.total || 0))}</span></Row>
                  </>
                ) : null}
                <Row label="Yetkazish to‘lovi">
                  {delivery.deliveryFee != null ? money(Number(delivery.deliveryFee)) : <Missing />}
                </Row>
                <Row label="Yaratilgan">{delivery.orderCreatedAt ? formatDateTime(delivery.orderCreatedAt) : <Missing />}</Row>
              </dl>
              {!canReadOrder ? (
                <p className="dv-note">Buyurtma tafsilotlari (to‘lov, mijoz telefoni) uchun ruxsat yo‘q.</p>
              ) : orderLoading && !order ? (
                <LoadingBlock rows={2} label="Buyurtma tafsiloti yuklanmoqda…" />
              ) : orderError ? (
                <ErrorState
                  message={orderError.message}
                  onRetry={orderError.kind === "failed" || orderError.kind === "network"
                    ? () => void loadOrder(Number(delivery.orderId))
                    : undefined}
                />
              ) : null}
              <p className="dv-note">Yetkazish holati va buyurtma holati alohida yuritiladi.</p>
              {props.onOpenOrder && delivery.orderId != null ? (
                <button
                  className="btn-tertiary dv-link-btn"
                  type="button"
                  onClick={() => props.onOpenOrder?.(Number(delivery.orderId))}
                >
                  Buyurtmalar bo‘limida ochish
                  <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Mijoz">
              <dl className="dv-kv">
                <Row label="Ism">{personName(customer) || <Missing />}</Row>
                <Row label="Telefon">
                  {phone ? (
                    <span className="dv-phone">
                      <span className="dv-phone-value">{phoneVisible ? formatPhone(phone) : maskPhone(phone)}</span>
                      <button
                        className="btn-tertiary dv-phone-toggle"
                        type="button"
                        aria-pressed={phoneVisible}
                        onClick={() => setPhoneVisible((v) => !v)}
                      >
                        {phoneVisible ? "Yashirish" : "Ko‘rsatish"}
                      </button>
                    </span>
                  ) : <Missing />}
                </Row>
              </dl>
            </DrawerSection>

            <DrawerSection title="Manzil">
              <dl className="dv-kv">
                <Row label="Yetkazish manzili">{delivery.address || <Missing />}</Row>
                {String(order?.comment || "").trim() ? <Row label="Mijoz izohi">{order.comment}</Row> : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Kuryer">
              <dl className="dv-kv">
                <Row label="Kuryer">{delivery.courierName || <span className="dv-missing">Kuryer hali biriktirilmagan.</span>}</Row>
              </dl>
              <p className="dv-note">
                Kuryerlar reyestri API’da mavjud emas — kuryer ismi qo‘lda kiritiladi. Jonli kuzatuv mavjud emas.
              </p>
              {canAssign ? (
                <form className="dv-assign" onSubmit={submitAssign}>
                  <FilterField label={status === "assigned" ? "Yangi kuryer ismi" : "Kuryer ismi"} grow>
                    <input
                      value={courierName}
                      maxLength={80}
                      onChange={(e) => {
                        setCourierName(e.target.value);
                        if (formMsg) setFormMsg("");
                      }}
                      placeholder="Ism va familiya"
                      autoComplete="off"
                    />
                  </FilterField>
                  <button className={status === "pending" ? "btn-primary" : "btn-secondary"} type="submit" disabled={busy}>
                    {status === "assigned" ? "Almashtirish" : "Biriktirish"}
                  </button>
                  {formMsg ? <p className="dv-form-msg" role="alert">{formMsg}</p> : null}
                </form>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Vaqt oynasi">
              <dl className="dv-kv">
                <Row label="Oraliq">{delivery.timeWindow || <span className="dv-missing">Yetkazish vaqti hali aniqlanmagan.</span>}</Row>
              </dl>
              <p className="dv-note">Mijoz buyurtma berishda tanlagan yoki standart oraliq. Aniq ETA hisoblanmaydi.</p>
            </DrawerSection>

            <DrawerSection title="Filial">
              <dl className="dv-kv">
                <Row label="Filial">{branchName || <Missing />}</Row>
                {String(order?.branch?.address || "").trim() ? <Row label="Manzil">{order.branch.address}</Row> : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Tashqi xizmat">
              {isExternal(delivery) ? (
                <>
                  <dl className="dv-kv">
                    <Row label="Holat">{operatorCapabilityLabel(String(delivery.providerStatus || externalCode || ""))}</Row>
                    <Row label="Provayder havolasi">{delivery.providerRef ? <span className="dv-kv-mono">{delivery.providerRef}</span> : <Missing />}</Row>
                  </dl>
                  <button className="btn-secondary" type="button" disabled={busy} onClick={() => void checkExternal()}>
                    Ulanishni tekshirish
                  </button>
                  {syncNote ? <FeedbackBanner tone={syncNote.tone}>{syncNote.text}</FeedbackBanner> : null}
                </>
              ) : (
                <p className="dv-note dv-note-top">Ichki kuryer — tashqi xizmat ishlatilmaydi.</p>
              )}
              <p className="dv-note">
                Tashqi yetkazib berish integratsiyasi {operatorCapabilityLabel(externalCode || "CONTRACT_PENDING").toLowerCase()}
                {" "}(shartnoma kutilmoqda): provayder, kuzatuv raqami va holat sinxronizatsiyasi yo‘q.
              </p>
            </DrawerSection>

            <details className="dv-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="dv-kv dv-kv-tech">
                <Row label="Yetkazish ID">{delivery.id}</Row>
                <Row label="Buyurtma ID">{delivery.orderId}</Row>
                {delivery.customerId != null ? <Row label="Mijoz ID">{delivery.customerId}</Row> : null}
                {delivery.branchId != null ? <Row label="Filial ID">{delivery.branchId}</Row> : null}
                {delivery.courierId != null ? <Row label="Kuryer ID">{delivery.courierId}</Row> : null}
                <Row label="Rejim"><span className="dv-kv-mono">{delivery.mode || "—"}</span></Row>
                <Row label="Provayder"><span className="dv-kv-mono">{delivery.provider || "—"}</span></Row>
                <Row label="Holat kodi"><span className="dv-kv-mono">{delivery.status || "—"}</span></Row>
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={pendingAction != null}
        title={confirmTitle}
        danger={confirmDanger}
        busy={busy}
        confirmLabel={confirmLabel}
        cancelLabel="Qaytish"
        description={pendingAction ? confirmBody(pendingAction) : undefined}
        onCancel={() => {
          setPendingAction(null);
          setReason("");
        }}
        onConfirm={() => {
          if (pendingAction) void runAction(pendingAction);
        }}
      />
    </div>
  );
}
