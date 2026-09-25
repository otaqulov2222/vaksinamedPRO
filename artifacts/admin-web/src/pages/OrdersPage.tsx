import { useEffect, useState } from "react";
import { request, money, isHqRole, fmtDate, type AdminUser } from "../api";
import {
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
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

function customerLabel(item: any): string {
  if (!item?.customer) return "—";
  const n = `${item.customer.firstName || ""} ${item.customer.lastName || ""}`.trim();
  return n || "—";
}

function fulfillmentKindLabel(kind: string): string {
  const k = String(kind || "").toLowerCase();
  if (k === "delivery") return "Yetkazib berish";
  if (k === "pickup") return "Olib ketish";
  return kind ? String(kind) : "—";
}

/** Display-only: calm ALL_CAPS / snake tokens without inventing providers. */
function paymentMethodLabel(method: string): string {
  const s = String(method || "").trim();
  if (!s) return "—";
  if (/^[A-Z0-9_]+$/.test(s)) {
    return s
      .split("_")
      .map((w) => (w ? w.charAt(0) + w.slice(1).toLowerCase() : ""))
      .filter(Boolean)
      .join(" ");
  }
  return s;
}

function lineTotal(item: any): number {
  if (item?.total != null && Number.isFinite(Number(item.total))) return Number(item.total);
  if (item?.lineTotal != null && Number.isFinite(Number(item.lineTotal))) return Number(item.lineTotal);
  return Number(item?.price || 0) * Number(item?.quantity || 0);
}

function filtersActive(f: OrderFilters): boolean {
  return Boolean(
    f.q.trim() || f.fulfillment || f.payment || f.reservation || f.branchId || f.createdFrom || f.createdTo,
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
  const [listError, setListError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [fulfillment, setFulfillment] = useState("");
  const [payment, setPayment] = useState("");
  const [reservation, setReservation] = useState("");
  const [branchId, setBranchId] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const [selected, setSelected] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const currentFilters: OrderFilters = {
    q, fulfillment, payment, reservation, branchId, createdFrom, createdTo,
  };
  const hasFilters = filtersActive(currentFilters);
  const moreFiltersActive = Boolean(reservation);

  async function loadPage(opts?: { offset?: number; filters?: OrderFilters }) {
    const nextOffset = opts?.offset ?? 0;
    const f = opts?.filters ?? currentFilters;
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

    setLoading(true);
    setListError("");
    try {
      const data = await request(`/api/admin/orders?${qs}`, props.token);
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setTotal(Number(data?.total || data?.pagination?.total || 0));
      setHasMore(Boolean(data?.hasMore ?? data?.pagination?.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      setOrders([]);
      setTotal(0);
      setHasMore(false);
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
      if (status === 401) setListError("Sessiya tugagan. Qayta kiring.");
      else if (status === 403) setListError("Buyurtmalar ro‘yxatini ko‘rish uchun ruxsat yo‘q.");
      else if (code === "INVALID_DATE_FILTER") setListError("Sana filtri YYYY-MM-DD formatida bo‘lishi kerak.");
      else setListError(err instanceof Error ? err.message : "Buyurtmalarni yuklab bo‘lmadi.");
    } finally {
      setLoading(false);
    }
  }

  function applySearch() {
    void loadPage({ offset: 0 });
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
    setMsg("");
    setCapabilities(null);
    try {
      const detail = await request(`/api/admin/orders/${id}`, props.token);
      setSelected(detail.order);
      setCapabilities(detail.capabilities || null);
    } catch (err) {
      setSelected(null);
      setCapabilities(null);
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setMsg("Bu buyurtmani ko‘rish uchun filial ruxsati yo‘q.");
      else if (status === 404) setMsg("Buyurtma topilmadi.");
      else setMsg(err instanceof Error ? err.message : "Buyurtma ochilmadi.");
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

  async function orderAction(id: number, path: string, body: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const data = await request(path, props.token, { method: "POST", body: JSON.stringify(body) });
      await loadPage({ offset });
      await refreshDetail(id);
      if (data?.note) setMsg(String(data.note));
      else if (data?.paymentRefundRequired) {
        setMsg(`Bekor qilindi. ${operatorCapabilityLabel("CONTRACT_PENDING")} — pul avtomatik qaytarilmaydi.`);
      } else setMsg("Saqlandi.");
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
      if (status === 403) setMsg("Ruxsat yo‘q.");
      else if (code === "INVALID_TRANSITION") setMsg(err instanceof Error ? err.message : "Holat o‘tishi ruxsat etilmagan.");
      else setMsg(err instanceof Error ? err.message : "Amal bajarilmadi.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPos(id: number) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await request(`/api/orders/${id}/confirm-pos`, props.token, {
        method: "POST",
        body: JSON.stringify({ receiptId: `ADMIN-${Date.now()}` }),
      });
      await loadPage({ offset });
      if (selected?.id === id) await refreshDetail(id);
      setMsg("FOM tasdiq bajarildi. To‘lov o‘qi alohida.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Amal bajarilmadi.");
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setQ("");
    setFulfillment("");
    setPayment("");
    setReservation("");
    setBranchId("");
    setCreatedFrom("");
    setCreatedTo("");
    void loadPage({ offset: 0, filters: EMPTY_FILTERS });
  }

  const showTableSurface = !listError && !(loading && orders.length === 0);

  return (
    <div className="orders-page page-module">
      <AdminPageHeader
        title="Buyurtmalar"
        description={PAGE_DESCRIPTIONS.orders}
      />

      <div className="orders-controls">
        <div className="orders-controls-primary">
          <FilterField label="Buyurtma yoki mijoz" grow>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Kod, telefon yoki ism"
              onSubmit={applySearch}
            />
          </FilterField>
          <FilterField label="Holat">
            <select
              value={fulfillment}
              onChange={(e) => setFulfillment(e.target.value)}
              aria-label="Holat"
            >
              <option value="">Barchasi</option>
              {FULFILLMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{fulfillmentLabel(s)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="To‘lov">
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              aria-label="To‘lov"
            >
              <option value="">Barchasi</option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{paymentLabel(s)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Filial">
            {isHq ? (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                aria-label="Filial"
              >
                <option value="">Barchasi</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            ) : (
              <input value="O‘z filiali" disabled readOnly aria-label="Filial" />
            )}
          </FilterField>
        </div>

        <div className="orders-controls-secondary">
          <div className="orders-date-group">
            <span className="filter-label">Sana</span>
            <div className="orders-date-inputs">
              <input
                type="date"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
                aria-label="Dan"
              />
              <span className="orders-date-sep" aria-hidden="true">–</span>
              <input
                type="date"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
                aria-label="Gacha"
              />
            </div>
          </div>

          <details className="orders-more" {...(moreFiltersActive ? { open: true } : {})}>
            <summary>
              Qo‘shimcha filtrlar
              {moreFiltersActive ? <span className="orders-more-dot" aria-hidden="true" /> : null}
            </summary>
            <div className="orders-more-body">
              <FilterField label="Bron">
                <select
                  value={reservation}
                  onChange={(e) => setReservation(e.target.value)}
                  aria-label="Bron"
                >
                  <option value="">Barchasi</option>
                  {RESERVATION_STATUSES.map((s) => (
                    <option key={s} value={s}>{reservationLabel(s)}</option>
                  ))}
                </select>
              </FilterField>
            </div>
          </details>

          <div className="orders-controls-actions">
            <button
              className="btn-primary"
              type="button"
              disabled={loading || busy}
              onClick={applySearch}
            >
              Qidirish
            </button>
            {hasFilters ? (
              <button
                className="btn-tertiary"
                type="button"
                disabled={loading || busy}
                onClick={resetFilters}
              >
                Tozalash
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {msg ? <FeedbackBanner tone="info">{msg}</FeedbackBanner> : null}
      {listError ? (
        <ErrorState message={listError} onRetry={() => void loadPage({ offset })} />
      ) : null}

      {!listError && !loading ? (
        <div className="orders-context">
          <span className="orders-result-count">{total} ta buyurtma</span>
          {hasFilters ? <span className="orders-context-hint">Filtrlar qo‘llangan</span> : null}
        </div>
      ) : null}

      {loading && orders.length === 0 ? <LoadingBlock rows={3} /> : null}

      {showTableSurface ? (
        <div className="orders-surface surface-table">
          <DataTable sticky>
            <thead>
              <tr>
                <th>Buyurtma</th>
                <th>Mijoz</th>
                <th>Filial</th>
                <th>Holat</th>
                <th>To‘lov</th>
                <th className="num">Summa</th>
                <th>Vaqt</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr className="orders-empty-row">
                  <td colSpan={7}>
                    <div className="orders-empty">
                      <div className="empty-title">Buyurtmalar topilmadi</div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Tanlangan mezonlar bo‘yicha buyurtmalar topilmadi."
                          : "Buyurtmalar hozircha mavjud emas."}
                      </p>
                      {hasFilters ? (
                        <button
                          className="btn-tertiary"
                          type="button"
                          disabled={busy}
                          onClick={resetFilters}
                        >
                          Filtrlarni tozalash
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((item) => {
                  const active = selected?.id === item.id;
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
                        <div className="meta">{fulfillmentKindLabel(item.fulfillment)}</div>
                      </td>
                      <td>{customerLabel(item)}</td>
                      <td>{item.branch?.name || "—"}</td>
                      <td>
                        <StatusLabelBadge
                          domain="fulfillment"
                          status={item.fulfillmentStatus || item.status || ""}
                        />
                      </td>
                      <td>
                        <StatusLabelBadge domain="payment" status={item.paymentStatus || ""} />
                      </td>
                      <td className="num money-md">{money(Number(item.total || 0))}</td>
                      <td className="meta">{fmtDate(item.createdAt)}</td>
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
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        width="lg"
        title={selected?.code || "Buyurtma"}
        subtitle={
          selected
            ? `${selected.branch?.name || "—"} · ${fulfillmentKindLabel(selected.fulfillment)}`
            : undefined
        }
        status={
          selected ? (
            <div className="orders-drawer-status">
              <StatusLabelBadge
                domain="fulfillment"
                status={selected.fulfillmentStatus || ""}
              />
              <StatusLabelBadge domain="payment" status={selected.paymentStatus || ""} />
            </div>
          ) : undefined
        }
        onClose={() => {
          setSelected(null);
          setCapabilities(null);
        }}
        footer={
          selected ? (
            <div className="orders-drawer-actions">
              <div className="orders-drawer-primary">
                {capabilities?.canConfirmPos ? (
                  <button className="btn-primary" type="button" disabled={busy} onClick={() => void confirmPos(selected.id)}>
                    FOM tasdiq
                  </button>
                ) : null}
                {capabilities?.canCancel ? (
                  <button className="btn-danger" type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>
                    Bekor qilish
                  </button>
                ) : (
                  <span className="meta">Bekor qilish mavjud emas (ruxsat yoki holat).</span>
                )}
              </div>
              {capabilities?.canTransitionFulfillment ? (
                <details className="orders-transitions">
                  <summary>Holatni o‘zgartirish</summary>
                  <div className="orders-transition-group" role="group" aria-label="Holat o‘tkazish">
                    <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/confirm`)}>
                      {fulfillmentLabel("CONFIRMED")}
                    </button>
                    <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/prepare`)}>
                      {fulfillmentLabel("PREPARING")}
                    </button>
                    <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/ready`)}>
                      {fulfillmentLabel("READY_FOR_PICKUP")}
                    </button>
                    {selected.fulfillment === "delivery" ? (
                      <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/out-for-delivery`)}>
                        {fulfillmentLabel("OUT_FOR_DELIVERY")}
                      </button>
                    ) : null}
                    <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/complete`)}>
                      {fulfillmentLabel("COMPLETED")}
                    </button>
                  </div>
                </details>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <DrawerSection title="Mijoz">
              {selected.customer ? (
                <dl className="orders-kv">
                  <div>
                    <dt>Ism</dt>
                    <dd>{customerLabel(selected)}</dd>
                  </div>
                  <div>
                    <dt>Telefon</dt>
                    <dd>{selected.customer.phone || "—"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="meta">Mijoz biriktirilmagan.</p>
              )}
            </DrawerSection>

            <DrawerSection title="Yetkazish / holat">
              <dl className="orders-kv">
                <div>
                  <dt>Tur</dt>
                  <dd>{fulfillmentKindLabel(selected.fulfillment)}</dd>
                </div>
                <div>
                  <dt>Filial</dt>
                  <dd>{selected.branch?.name || "—"}</dd>
                </div>
                {selected.address ? (
                  <div>
                    <dt>Manzil</dt>
                    <dd>{selected.address}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Holat</dt>
                  <dd>
                    <StatusLabelBadge
                      domain="fulfillment"
                      status={selected.fulfillmentStatus || ""}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Yaratilgan</dt>
                  <dd>{fmtDate(selected.createdAt)}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="To‘lov">
              <dl className="orders-kv">
                <div>
                  <dt>Holat</dt>
                  <dd>
                    <StatusLabelBadge domain="payment" status={selected.paymentStatus || ""} />
                  </dd>
                </div>
                {selected.paymentMethod ? (
                  <div>
                    <dt>Usul</dt>
                    <dd>{paymentMethodLabel(selected.paymentMethod)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Jami</dt>
                  <dd className="money-md">{money(Number(selected.total || 0))}</dd>
                </div>
              </dl>
              <p className="meta">
                Subtotal {money(Number(selected.subtotal || 0))}
                {selected.deliveryFee ? ` + yetkazish ${money(Number(selected.deliveryFee))}` : ""}
                {selected.cashbackUsed ? ` − cashback ${money(Number(selected.cashbackUsed))}` : ""}
                {" = "}{money(Number(selected.total || 0))}
              </p>
              <p className="meta">
                Provayder orqali pul qaytarish {operatorCapabilityLabel("CONTRACT_PENDING").toLowerCase()}.
                Yakunlash to‘lov holatiga ta’sir qilishi mumkin — bu alohida «to‘landi» tugmasi emas.
                {capabilities?.paymentRefundsViaPsp === false ? " Refund tugmasi yo‘q." : ""}
              </p>
            </DrawerSection>

            <DrawerSection title="Mahsulotlar">
              <DataTable>
                <thead>
                  <tr>
                    <th>Mahsulot</th>
                    <th className="num">Narx</th>
                    <th className="num">Soni</th>
                    <th className="num">Jami</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((it: any) => (
                    <tr key={it.id}>
                      <td>{it.title}</td>
                      <td className="num">{money(Number(it.price || 0))}</td>
                      <td className="num">{it.quantity}</td>
                      <td className="num">{money(lineTotal(it))}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </DrawerSection>

            {(Number(selected.cashbackUsed || 0) > 0 || Number(selected.cashbackEarned || 0) > 0) ? (
              <DrawerSection title="Cashback">
                <dl className="orders-kv">
                  {Number(selected.cashbackUsed || 0) > 0 ? (
                    <div>
                      <dt>Ishlatilgan</dt>
                      <dd>{money(Number(selected.cashbackUsed))}</dd>
                    </div>
                  ) : null}
                  {Number(selected.cashbackEarned || 0) > 0 ? (
                    <div>
                      <dt>Hisoblangan</dt>
                      <dd>{money(Number(selected.cashbackEarned))}</dd>
                    </div>
                  ) : null}
                </dl>
              </DrawerSection>
            ) : null}

            <DrawerSection title="Bron">
              <dl className="orders-kv">
                <div>
                  <dt>Holat</dt>
                  <dd>
                    <StatusLabelBadge domain="reservation" status={selected.reservationStatus || ""} />
                  </dd>
                </div>
                {selected.reservedUntil ? (
                  <div>
                    <dt>Muddat</dt>
                    <dd>{fmtDate(selected.reservedUntil)}</dd>
                  </div>
                ) : null}
              </dl>
              {selected.reservationExpired ? (
                <p className="meta">bron muddati tugagan — avto-bekor yo‘q</p>
              ) : null}
            </DrawerSection>
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
          selected?.paymentStatus === "PAID"
            ? `To‘langan buyurtma: bekor qilish pulni avtomatik qaytarmaydi (${operatorCapabilityLabel("CONTRACT_PENDING").toLowerCase()}).`
            : `Buyurtma ${selected?.code || ""} bekor qilinadi. Faqat ruxsat berilgan holatda.`
        }
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          if (!selected) return;
          setConfirmCancel(false);
          void orderAction(selected.id, `/api/orders/${selected.id}/admin-cancel`);
        }}
      />
    </div>
  );
}
