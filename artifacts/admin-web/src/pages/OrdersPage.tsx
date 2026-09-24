import { useEffect, useState } from "react";
import { request, money, isHqRole, fmtDate, type AdminUser } from "../api";
import { Badge, PageHeader } from "../ui";

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

function fulfillmentTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED") return "ok";
  if (s === "CANCELLED") return "danger";
  if (s === "CREATED") return "neutral";
  return "warn";
}

function paymentTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = String(status || "").toUpperCase();
  if (s === "PAID") return "ok";
  if (s === "FAILED") return "danger";
  if (s === "REFUNDED" || s === "PARTIALLY_REFUNDED") return "warn";
  return "neutral";
}

function reservationTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE" || s === "FULFILLED") return "ok";
  if (s === "EXPIRED") return "warn";
  if (s === "CANCELLED") return "danger";
  return "neutral";
}

export function OrdersPage(props: { token: string; user: AdminUser | null; branches: any[] }) {
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

  const isHq = Boolean(props.user && isHqRole(props.user.role));

  async function loadPage(opts?: { offset?: number }) {
    const nextOffset = opts?.offset ?? 0;
    const qs = new URLSearchParams();
    qs.set("limit", String(ORDER_PAGE));
    qs.set("offset", String(nextOffset));
    if (q.trim()) qs.set("q", q.trim());
    if (fulfillment) qs.set("fulfillmentStatus", fulfillment);
    if (payment) qs.set("paymentStatus", payment);
    if (reservation) qs.set("reservationStatus", reservation);
    if (branchId) qs.set("branchId", branchId);
    if (createdFrom.trim()) qs.set("createdFrom", createdFrom.trim());
    if (createdTo.trim()) qs.set("createdTo", createdTo.trim());

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
      if (status === 401) setListError("Sessiya tugagan (401)");
      else if (status === 403) setListError("Ruxsat yo‘q (403)");
      else if (code === "INVALID_DATE_FILTER") setListError("Sana filtri YYYY-MM-DD (Asia/Tashkent) bo‘lishi kerak");
      else setListError(err instanceof Error ? err.message : "Ro‘yxat yuklanmadi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage({ offset: 0 });  }, [props.token]);

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
      if (status === 403) setMsg("Filial ruxsati yo‘q (403)");
      else if (status === 404) setMsg("Buyurtma topilmadi");
      else setMsg(err instanceof Error ? err.message : "Buyurtma ochilmadi");
    }
  }

  async function refreshDetail(id: number) {
    try {
      const detail = await request(`/api/admin/orders/${id}`, props.token);
      setSelected(detail.order);
      setCapabilities(detail.capabilities || null);
    } catch {
      setSelected(null);
      setCapabilities(null);
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
        setMsg("Bekor qilindi. PSP refund CONTRACT_PENDING — pul avtomatik qaytarilmaydi.");
      } else setMsg("Saqlandi");
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
      if (status === 403) setMsg("Ruxsat yo‘q");
      else if (code === "INVALID_TRANSITION") setMsg(err instanceof Error ? err.message : "Holat o‘tishi ruxsat etilmagan");
      else setMsg(err instanceof Error ? err.message : "Amal bajarilmadi");
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
      setMsg("FOM tasdiq bajarildi (COMPLETED + consume). To‘lov o‘qi alohida.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Buyurtmalar"
        subtitle="P5 o‘qlar alohida: FULFILLMENT · PAYMENT · RESERVATION. Server holati asosiy. Sana filtri: Asia/Tashkent kuni."
      />

      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kod / telefon / ism" />
        {isHq ? (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Filial: barchasi</option>
            {props.branches.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        ) : (
          <span className="muted">Filial: o‘z filialingiz (server)</span>
        )}
        <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value)}>
          <option value="">Fulfillment: barchasi</option>
          {FULFILLMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">Payment: barchasi</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={reservation} onChange={(e) => setReservation(e.target.value)}>
          <option value="">Reservation: barchasi</option>
          {RESERVATION_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} title="createdFrom (Tashkent)" />
        <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} title="createdTo (Tashkent)" />
        <button className="primary" type="button" disabled={loading || busy} onClick={() => void loadPage({ offset: 0 })}>
          Qidirish
        </button>
      </div>

      {msg ? <p className="muted">{msg}</p> : null}

      {listError ? (
        <div className="card">
          <p style={{ color: "var(--danger)" }}>{listError}</p>
          <button className="ghost" type="button" disabled={loading} onClick={() => void loadPage({ offset })}>
            Qayta urinish
          </button>
        </div>
      ) : null}

      {loading ? <p className="muted">Yuklanmoqda…</p> : null}

      {!listError && !loading && orders.length === 0 ? (
        <div className="card"><p className="muted">Buyurtmalar topilmadi.</p></div>
      ) : null}

      {!listError && orders.length > 0 ? (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Mijoz</th>
                <th>Filial</th>
                <th>Tur</th>
                <th>Fulfillment</th>
                <th>Payment</th>
                <th>Reservation</th>
                <th>Summa</th>
                <th>Yaratilgan</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>
                    {item.customer
                      ? `${item.customer.firstName || ""} ${item.customer.lastName || ""}`.trim() || `#${item.customer.id}`
                      : item.customerId ? `#${item.customerId}` : "—"}
                    {item.customer?.id ? <div className="muted">id {item.customer.id}</div> : null}
                  </td>
                  <td>{item.branch?.name || `#${item.branchId}`}</td>
                  <td>{item.fulfillment}</td>
                  <td>
                    <Badge tone={fulfillmentTone(item.fulfillmentStatus || item.status)}>
                      {item.fulfillmentStatus || item.status}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={paymentTone(item.paymentStatus)}>{item.paymentStatus || "—"}</Badge>
                  </td>
                  <td>
                    <Badge tone={reservationTone(item.reservationStatus)}>{item.reservationStatus || "—"}</Badge>
                    {item.reservationExpired ? <div className="muted">muddati tugagan</div> : null}
                  </td>
                  <td>{money(Number(item.total || 0))}</td>
                  <td>{fmtDate(item.createdAt)}</td>
                  <td>
                    <button className="ghost" type="button" onClick={() => void openOrder(item.id)}>Ochish</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <span className="muted">
              {total ? `${offset + 1}–${Math.min(offset + orders.length, total)} / ${total}` : "Jami: 0"}
            </span>
            <button
              className="ghost"
              type="button"
              disabled={offset <= 0 || busy || loading}
              onClick={() => void loadPage({ offset: Math.max(0, offset - ORDER_PAGE) })}
            >
              Oldingi
            </button>
            <button
              className="ghost"
              type="button"
              disabled={!hasMore || busy || loading}
              onClick={() => void loadPage({ offset: offset + ORDER_PAGE })}
            >
              Keyingi
            </button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="toolbar" style={{ margin: 0, justifyContent: "space-between" }}>
            <h2>{selected.code}</h2>
            <button className="ghost" type="button" onClick={() => { setSelected(null); setCapabilities(null); }}>
              Yopish
            </button>
          </div>
          <p className="muted">
            {selected.branch?.name} · {selected.fulfillment}
            {selected.createdAt ? ` · yaratilgan: ${fmtDate(selected.createdAt)}` : ""}
            {selected.reservedUntil ? ` · bron: ${fmtDate(selected.reservedUntil)}` : ""}
          </p>

          {selected.customer ? (
            <p>
              <b>Mijoz:</b> {`${selected.customer.firstName || ""} ${selected.customer.lastName || ""}`.trim() || "—"}
              {" · "}{selected.customer.phone || "—"}{" · "}id {selected.customer.id}
              <span className="muted"> (telefon ko‘rinishi POLICY E OPEN)</span>
            </p>
          ) : (
            <p className="muted">Mijoz: #{selected.customerId}</p>
          )}

          <div className="kpis" style={{ marginTop: 8 }}>
            <div className="card">
              <div className="muted">Fulfillment</div>
              <Badge tone={fulfillmentTone(selected.fulfillmentStatus)}>{selected.fulfillmentStatus}</Badge>
            </div>
            <div className="card">
              <div className="muted">Payment</div>
              <Badge tone={paymentTone(selected.paymentStatus)}>{selected.paymentStatus}</Badge>
            </div>
            <div className="card">
              <div className="muted">Reservation</div>
              <Badge tone={reservationTone(selected.reservationStatus)}>{selected.reservationStatus}</Badge>
              {selected.reservationExpired ? (
                <div className="muted" style={{ fontSize: 11 }}>
                  bron muddati tugagan — buyurtma avtomatik bekor qilinmaydi
                </div>
              ) : null}
            </div>
            <div className="card">
              <div className="muted">Jami</div>
              <h2>{money(Number(selected.total || 0))}</h2>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 12 }}>
            Subtotal {money(Number(selected.subtotal || 0))}
            {selected.deliveryFee ? ` + yetkazish ${money(Number(selected.deliveryFee))}` : ""}
            {selected.cashbackUsed ? ` − cashback ${money(Number(selected.cashbackUsed))}` : ""}
            {" = "}{money(Number(selected.total || 0))}
          </p>

          <table className="table">
            <thead><tr><th>Mahsulot</th><th>Narx</th><th>Soni</th><th>Jami</th></tr></thead>
            <tbody>
              {(selected.items || []).map((it: any) => (
                <tr key={it.id}>
                  <td>{it.title}</td>
                  <td>{money(Number(it.price || 0))}</td>
                  <td>{it.quantity}</td>
                  <td>{money(Number(it.price || 0) * Number(it.quantity || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {capabilities?.canTransitionFulfillment ? (
              <>
                <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/confirm`)}>CONFIRMED</button>
                <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/prepare`)}>PREPARING</button>
                <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/ready`)}>READY</button>
                {selected.fulfillment === "delivery" ? (
                  <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/out-for-delivery`)}>OUT_FOR_DELIVERY</button>
                ) : null}
                <button className="ghost" type="button" disabled={busy} onClick={() => void orderAction(selected.id, `/api/orders/${selected.id}/complete`)}>COMPLETED</button>
              </>
            ) : null}
            {capabilities?.canConfirmPos ? (
              <button className="primary" type="button" disabled={busy} onClick={() => void confirmPos(selected.id)}>
                FOM tasdiq (shortcut)
              </button>
            ) : null}
            {capabilities?.canCancel ? (
              <button
                className="ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  const warn = selected.paymentStatus === "PAID"
                    ? "PAID buyurtma: bekor qilish pulni avtomatik qaytarmaydi (PSP refund CONTRACT_PENDING). Davom etasizmi?"
                    : "Buyurtmani bekor qilasizmi?";
                  if (window.confirm(warn)) {
                    void orderAction(selected.id, `/api/orders/${selected.id}/admin-cancel`);
                  }
                }}
              >
                Bekor qilish
              </button>
            ) : (
              <span className="muted">Bekor qilish mavjud emas (ruxsat yoki holat).</span>
            )}
          </div>

          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            PSP refund yo‘q (CONTRACT_PENDING). COMPLETED mavjud politikada payment o‘qini PAID qilishi mumkin — bu
            alohida «to‘landi» tugmasi emas.
            {capabilities?.paymentRefundsViaPsp === false ? " Refund tugmasi yo‘q." : ""}
          </p>
        </div>
      ) : null}
    </>
  );
}
