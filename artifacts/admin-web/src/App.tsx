import { FormEvent, useEffect, useMemo, useState } from "react";
import { PosTerminal } from "./PosTerminal";

const API = "";

type AdminUser = { id: number; email: string; name: string; role: string; branchId: number | null };

async function request(path: string, token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error((data as any).message || `HTTP ${response.status}`) as Error & { status?: number; code?: string };
    err.status = response.status;
    if ((data as any).code) err.code = String((data as any).code);
    throw err;
  }
  return data;
}

async function softRequest(path: string, token: string | null) {
  try {
    return await request(path, token);
  } catch {
    return null;
  }
}

const NAV = [
  ["kassa", "Kassa POS"],
  ["dashboard", "Dashboard"],
  ["branches", "Filiallar"],
  ["products", "Katalog"],
  ["orders", "Buyurtmalar"],
  ["customers", "Mijozlar"],
  ["payments", "To‘lov kalitlari"],
  ["promos", "Aksiyalar"],
  ["ratings", "Baholar"],
  ["audit", "Audit"],
  ["fom", "FOM adapter"],
];

function money(value: number) {
  return new Intl.NumberFormat("uz-UZ").format(value) + " so‘m";
}

function isHqRole(role: string) {
  const r = String(role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "hq";
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("vm-admin-token"));
  const [user, setUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState("kassa");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("admin@vaksinamed.uz");
  const [password, setPassword] = useState("vaksinamed");
  const [dashboard, setDashboard] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);
  const [ratings, setRatings] = useState<any[]>([]);
  const [fom, setFom] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [orderQ, setOrderQ] = useState("");
  const [orderFulfillment, setOrderFulfillment] = useState("");
  const [orderPayment, setOrderPayment] = useState("");
  const [orderReservation, setOrderReservation] = useState("");
  const [orderBranchId, setOrderBranchId] = useState("");
  const [orderCreatedFrom, setOrderCreatedFrom] = useState("");
  const [orderCreatedTo, setOrderCreatedTo] = useState("");
  const [orderOffset, setOrderOffset] = useState(0);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderHasMore, setOrderHasMore] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderCapabilities, setOrderCapabilities] = useState<any>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderListError, setOrderListError] = useState("");
  const [orderMsg, setOrderMsg] = useState("");
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const ORDER_PAGE = 25;
  const AUDIT_PAGE = 40;

  async function loadAll(nextToken = token) {
    if (!nextToken) return;
    const me = await request("/api/admin/me", nextToken);
    setUser(me.user);

    const [dash, b, p, o, c, pay, promo, rate, fomStatus] = await Promise.all([
      softRequest("/api/admin/dashboard", nextToken),
      softRequest("/api/admin/branches", nextToken),
      softRequest("/api/admin/products", nextToken),
      softRequest(`/api/admin/orders?limit=${ORDER_PAGE}&offset=0`, nextToken),
      softRequest("/api/admin/customers", nextToken),
      softRequest("/api/admin/payments", nextToken),
      softRequest("/api/admin/promos", nextToken),
      softRequest("/api/admin/ratings", nextToken),
      softRequest("/api/integrations/fom/status", nextToken),
    ]);
    setDashboard(dash);
    setBranches(b?.branches || []);
    setProducts(p?.products || []);
    setOrders(o?.orders || []);
    setOrderTotal(Number(o?.total || o?.pagination?.total || 0));
    setOrderHasMore(Boolean(o?.hasMore ?? o?.pagination?.hasMore));
    setOrderOffset(0);
    setCustomers(c?.customers || []);
    setPayments(pay?.payments || []);
    setPromos(promo?.promos || []);
    setRatings(rate?.ratings || []);
    setFom(fomStatus);
  }

  async function loadOrdersPage(opts?: {
    offset?: number;
    q?: string;
    fulfillment?: string;
    payment?: string;
    reservation?: string;
    branchId?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    if (!token) return;
    const offset = opts?.offset ?? 0;
    const q = opts?.q ?? orderQ;
    const fulfillment = opts?.fulfillment ?? orderFulfillment;
    const payment = opts?.payment ?? orderPayment;
    const reservation = opts?.reservation ?? orderReservation;
    const branchId = opts?.branchId ?? orderBranchId;
    const createdFrom = opts?.createdFrom ?? orderCreatedFrom;
    const createdTo = opts?.createdTo ?? orderCreatedTo;
    const qs = new URLSearchParams();
    qs.set("limit", String(ORDER_PAGE));
    qs.set("offset", String(offset));
    if (q.trim()) qs.set("q", q.trim());
    if (fulfillment) qs.set("fulfillmentStatus", fulfillment);
    if (payment) qs.set("paymentStatus", payment);
    if (reservation) qs.set("reservationStatus", reservation);
    if (branchId) qs.set("branchId", branchId);
    if (createdFrom.trim()) qs.set("createdFrom", createdFrom.trim());
    if (createdTo.trim()) qs.set("createdTo", createdTo.trim());
    setOrderLoading(true);
    setOrderListError("");
    try {
      const data = await request(`/api/admin/orders?${qs}`, token);
      setOrders(data.orders || []);
      setOrderTotal(Number(data.total || data.pagination?.total || 0));
      setOrderHasMore(Boolean(data.hasMore ?? data.pagination?.hasMore));
      setOrderOffset(offset);
    } catch (err) {
      setOrders([]);
      setOrderTotal(0);
      setOrderHasMore(false);
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 401) setOrderListError("Sessiya tugagan (401)");
      else if (status === 403) setOrderListError("Ruxsat yo‘q (403)");
      else setOrderListError(err instanceof Error ? err.message : "Ro‘yxat yuklanmadi");
    } finally {
      setOrderLoading(false);
    }
  }

  async function loadAuditPage(opts?: { offset?: number; action?: string }) {
    if (!token) return;
    const offset = opts?.offset ?? 0;
    const action = opts?.action ?? auditAction;
    const qs = new URLSearchParams();
    qs.set("limit", String(AUDIT_PAGE));
    qs.set("offset", String(offset));
    if (action.trim()) qs.set("action", action.trim());
    setAuditLoading(true);
    setAuditError("");
    try {
      const data = await request(`/api/admin/audit?${qs}`, token);
      setAuditRows(data.audit || []);
      setAuditTotal(Number(data.pagination?.total || 0));
      setAuditHasMore(Boolean(data.pagination?.hasMore));
      setAuditOffset(offset);
    } catch (err) {
      setAuditRows([]);
      setAuditTotal(0);
      setAuditHasMore(false);
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setAuditError("Audit uchun ruxsat yo‘q (audit:read)");
      else setAuditError(err instanceof Error ? err.message : "Audit yuklanmadi");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void loadAll(token).catch(() => {
      localStorage.removeItem("vm-admin-token");
      setToken(null);
    });
  }, [token]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await request("/api/admin/login", null, { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem("vm-admin-token", data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirish xatosi");
    }
  }

  async function saveBranch(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    await request(`/api/admin/branches/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(editing) });
    setEditing(null);
    await loadAll();
  }

  async function confirmOrder(id: number) {
    if (orderBusy) return;
    setOrderBusy(true);
    setOrderMsg("");
    try {
      await request(`/api/orders/${id}/confirm-pos`, token, { method: "POST", body: JSON.stringify({ receiptId: `ADMIN-${Date.now()}` }) });
      await loadOrdersPage({ offset: orderOffset });
      if (selectedOrder?.id === id) {
        const detail = await request(`/api/admin/orders/${id}`, token);
        setSelectedOrder(detail.order);
        setOrderCapabilities(detail.capabilities || null);
      }
      setOrderMsg("FOM tasdiq bajarildi (COMPLETED + consume). To‘lov o‘qi alohida.");
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setOrderBusy(false);
    }
  }

  async function orderAction(id: number, path: string, body: Record<string, unknown> = {}) {
    if (orderBusy) return;
    setOrderBusy(true);
    setOrderMsg("");
    try {
      const data = await request(path, token, { method: "POST", body: JSON.stringify(body) });
      await loadOrdersPage({ offset: orderOffset });
      try {
        const detail = await request(`/api/admin/orders/${id}`, token);
        setSelectedOrder(detail.order);
        setOrderCapabilities(detail.capabilities || null);
      } catch {
        setSelectedOrder(null);
        setOrderCapabilities(null);
      }
      if (data?.note) setOrderMsg(String(data.note));
      else if (data?.paymentRefundRequired) {
        setOrderMsg("Bekor qilindi. PSP refund CONTRACT_PENDING — pul avtomatik qaytarilmaydi.");
      } else setOrderMsg("Saqlandi");
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
      if (status === 403) setOrderMsg("Ruxsat yo‘q");
      else if (code === "INVALID_TRANSITION") setOrderMsg(err instanceof Error ? err.message : "Holat o‘tishi ruxsat etilmagan");
      else setOrderMsg(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setOrderBusy(false);
    }
  }

  async function openOrder(id: number) {
    setOrderMsg("");
    setOrderCapabilities(null);
    try {
      const detail = await request(`/api/admin/orders/${id}`, token);
      setSelectedOrder(detail.order);
      setOrderCapabilities(detail.capabilities || null);
    } catch (err) {
      setSelectedOrder(null);
      setOrderCapabilities(null);
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setOrderMsg("Filial ruxsati yo‘q (403)");
      else if (status === 404) setOrderMsg("Buyurtma topilmadi");
      else setOrderMsg(err instanceof Error ? err.message : "Buyurtma ochilmadi");
    }
  }

  async function logout() {
    try {
      if (token) await request("/api/admin/logout", token, { method: "POST", body: "{}" });
    } catch {
      // still clear local session
    }
    localStorage.removeItem("vm-admin-token");
    setToken(null);
    setUser(null);
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request("/api/admin/products", token, {
      method: "POST",
      body: JSON.stringify({
        sku: form.get("sku"),
        nameUz: form.get("nameUz"),
        nameRu: form.get("nameUz"),
        category: form.get("category"),
        manufacturer: form.get("manufacturer"),
        price: Number(form.get("price")),
        description: form.get("description"),
      }),
    });
    event.currentTarget.reset();
    await loadAll();
  }

  const filteredBranches = useMemo(
    () => branches.filter((item) => `${item.name} ${item.district} ${item.address}`.toLowerCase().includes(query.toLowerCase())),
    [branches, query],
  );

  if (!token || !user) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={login}>
          <div className="brand">VAKSINA MED</div>
          <h1>Admin / Kassa</h1>
          <p className="muted">HQ nazorati · Loyalty POS · FOM · filial Click/Payme</p>
          <div className="toolbar" style={{ flexDirection: "column" }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Parol" />
            {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}
            <button className="primary" type="submit">Kirish</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">VAKSINA MED</div>
        <p className="muted" style={{ color: "rgba(255,255,255,.65)" }}>{user.name}<br />{user.role}</p>
        {NAV.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              if (id === "audit") void loadAuditPage({ offset: 0 });
            }}
          >
            {label}
          </button>
        ))}
        <button onClick={() => void logout()}>Chiqish</button>
      </aside>
      <main className="main">
        {tab === "kassa" ? (
          <PosTerminal
            token={token}
            branches={branches}
            defaultBranchId={user.branchId || branches[0]?.id}
            request={request}
            money={money}
          />
        ) : null}

        {tab === "dashboard" ? (
          dashboard ? (
          <>
            <h1>Tarmoq nazorati</h1>
            <p className="muted">Savdo, bron, yetkazib berish va cashback kesimi</p>
            <div className="kpis" style={{ marginTop: 18 }}>
              <div className="card"><div className="muted">Tushum</div><h2>{money(dashboard.kpis.revenue)}</h2></div>
              <div className="card"><div className="muted">Buyurtmalar</div><h2>{dashboard.kpis.orders}</h2></div>
              <div className="card"><div className="muted">Bron</div><h2>{dashboard.kpis.reserved}</h2></div>
              <div className="card"><div className="muted">Filiallar</div><h2>{dashboard.kpis.branches}</h2></div>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <h2>So‘nggi buyurtmalar</h2>
              <table className="table">
                <thead><tr><th>Kod</th><th>Filial</th><th>Holat</th><th>Summa</th></tr></thead>
                <tbody>
                  {dashboard.recentOrders.map((item: any) => (
                    <tr key={item.id}><td>{item.code}</td><td>{item.branch?.name}</td><td>{item.fulfillmentStatus || item.status}</td><td>{money(item.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
          ) : (
            <div className="card"><p className="muted">Dashboard uchun ruxsat yo‘q yoki ma’lumot yuklanmadi.</p></div>
          )
        ) : null}

        {tab === "branches" ? (
          <>
            <h1>Filiallar</h1>
            <div className="toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Qidiruv: tuman, manzil, raqam" /></div>
            <div className="card">
              <table className="table">
                <thead><tr><th>Filial</th><th>Manzil</th><th>Telefon</th><th>Click/Payme</th><th></th></tr></thead>
                <tbody>
                  {filteredBranches.slice(0, 80).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}<div className="muted">{item.hours}</div></td>
                      <td>{item.region || item.district}<div className="muted">{item.address}</div></td>
                      <td>{item.phone}</td>
                      <td>{item.hasPayme ? <span className="ok">Payme</span> : "Payme yo‘q"} / {item.hasClick ? <span className="ok">Click</span> : "Click yo‘q"}</td>
                      <td><button className="ghost" onClick={() => setEditing(item)}>Kalitlar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editing ? (
              <form className="card" style={{ marginTop: 16 }} onSubmit={saveBranch}>
                <h2>{editing.name} to‘lov sozlamasi</h2>
                <div className="toolbar" style={{ flexDirection: "column" }}>
                  <input value={editing.paymeMerchantId} onChange={(e) => setEditing({ ...editing, paymeMerchantId: e.target.value })} placeholder="Payme merchant ID" />
                  <input value={editing.paymeKey === "••••" ? "" : editing.paymeKey} onChange={(e) => setEditing({ ...editing, paymeKey: e.target.value })} placeholder="Payme key" />
                  <input value={editing.clickMerchantId} onChange={(e) => setEditing({ ...editing, clickMerchantId: e.target.value })} placeholder="Click merchant ID" />
                  <input value={editing.clickServiceId} onChange={(e) => setEditing({ ...editing, clickServiceId: e.target.value })} placeholder="Click service ID" />
                  <input value={editing.clickSecret === "••••" ? "" : editing.clickSecret} onChange={(e) => setEditing({ ...editing, clickSecret: e.target.value })} placeholder="Click secret" />
                  <button className="primary" type="submit">Saqlash</button>
                </div>
              </form>
            ) : null}
          </>
        ) : null}

        {tab === "products" ? (
          <>
            <h1>Katalog</h1>
            <form className="card" onSubmit={addProduct}>
              <h2>Yangi mahsulot</h2>
              <div className="toolbar">
                <input name="sku" placeholder="SKU" required />
                <input name="nameUz" placeholder="Nomi" required />
                <input name="category" placeholder="Kategoriya" />
                <input name="manufacturer" placeholder="Ishlab chiqaruvchi" />
                <input name="price" type="number" placeholder="Narx" required />
              </div>
              <textarea name="description" placeholder="Tavsif" />
              <div className="toolbar"><button className="primary" type="submit">Qo‘shish</button></div>
            </form>
            <div className="card" style={{ marginTop: 16 }}>
              <table className="table">
                <thead><tr><th>SKU</th><th>Nomi</th><th>Kategoriya</th><th>Narx</th><th>Retsept</th></tr></thead>
                <tbody>{products.map((item) => <tr key={item.id}><td>{item.sku}</td><td>{item.nameUz}</td><td>{item.category}</td><td>{money(item.price)}</td><td>{item.requiresPrescription ? "Ha" : "Yo‘q"}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "orders" ? (
          <>
            <h1>Buyurtmalar</h1>
            <p className="muted">P5 o‘qlar: fulfillment · payment · reservation. Server holati asosiy. Sana filtri: Asia/Tashkent kuni.</p>
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <input
                value={orderQ}
                onChange={(e) => setOrderQ(e.target.value)}
                placeholder="Kod / telefon / ism"
              />
              {user && isHqRole(user.role) ? (
                <select value={orderBranchId} onChange={(e) => setOrderBranchId(e.target.value)}>
                  <option value="">Filial: barchasi</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>{b.name}</option>
                  ))}
                </select>
              ) : (
                <span className="muted">Filial: o‘z filialingiz (server)</span>
              )}
              <select value={orderFulfillment} onChange={(e) => setOrderFulfillment(e.target.value)}>
                <option value="">Fulfillment: barchasi</option>
                {["CREATED", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={orderPayment} onChange={(e) => setOrderPayment(e.target.value)}>
                <option value="">Payment: barchasi</option>
                {["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={orderReservation} onChange={(e) => setOrderReservation(e.target.value)}>
                <option value="">Reservation: barchasi</option>
                {["NONE", "ACTIVE", "EXPIRED", "CANCELLED", "FULFILLED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input type="date" value={orderCreatedFrom} onChange={(e) => setOrderCreatedFrom(e.target.value)} title="createdFrom (Tashkent)" />
              <input type="date" value={orderCreatedTo} onChange={(e) => setOrderCreatedTo(e.target.value)} title="createdTo (Tashkent)" />
              <button
                className="primary"
                type="button"
                disabled={orderLoading || orderBusy}
                onClick={() => void loadOrdersPage({ offset: 0 })}
              >
                Qidirish
              </button>
            </div>
            {orderMsg ? <p className="muted" style={{ marginTop: 8 }}>{orderMsg}</p> : null}
            {orderListError ? (
              <div className="card" style={{ marginTop: 12 }}>
                <p style={{ color: "var(--danger)" }}>{orderListError}</p>
                <button className="ghost" type="button" disabled={orderLoading} onClick={() => void loadOrdersPage({ offset: orderOffset })}>
                  Qayta urinish
                </button>
              </div>
            ) : null}
            <div className="card" style={{ marginTop: 12 }}>
              {orderLoading ? <p className="muted">Yuklanmoqda…</p> : null}
              {!orderLoading && !orderListError && orders.length === 0 ? (
                <p className="muted">Buyurtmalar topilmadi.</p>
              ) : null}
              {!orderLoading && orders.length > 0 ? (
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
                        <td>{item.branch?.name}</td>
                        <td>{item.fulfillment}</td>
                        <td>{item.fulfillmentStatus || item.status}</td>
                        <td>{item.paymentStatus || "—"}</td>
                        <td>{item.reservationStatus || "—"}{item.reservationExpired ? " (EXPIRED)" : ""}</td>
                        <td>{money(item.total)}</td>
                        <td><button className="ghost" type="button" onClick={() => void openOrder(item.id)}>Ochish</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div className="toolbar" style={{ marginTop: 12 }}>
                <span className="muted">Jami: {orderTotal} · sahifa offset {orderOffset}</span>
                <button
                  className="ghost"
                  type="button"
                  disabled={orderOffset <= 0 || orderBusy || orderLoading}
                  onClick={() => void loadOrdersPage({ offset: Math.max(0, orderOffset - ORDER_PAGE) })}
                >
                  Oldingi
                </button>
                <button
                  className="ghost"
                  type="button"
                  disabled={!orderHasMore || orderBusy || orderLoading}
                  onClick={() => void loadOrdersPage({ offset: orderOffset + ORDER_PAGE })}
                >
                  Keyingi
                </button>
              </div>
            </div>

            {selectedOrder ? (
              <div className="card" style={{ marginTop: 16 }}>
                <h2>{selectedOrder.code}</h2>
                <p className="muted">
                  {selectedOrder.branch?.name} · {selectedOrder.fulfillment}
                  {selectedOrder.createdAt ? ` · yaratilgan: ${String(selectedOrder.createdAt)}` : ""}
                  {selectedOrder.reservedUntil ? ` · bron: ${String(selectedOrder.reservedUntil)}` : ""}
                </p>
                  {selectedOrder.customer ? (
                  <p>
                    <b>Mijoz:</b> {`${selectedOrder.customer.firstName || ""} ${selectedOrder.customer.lastName || ""}`.trim() || "—"}
                    {" · "}
                    {selectedOrder.customer.phone || "—"}
                    {" · "}
                    id {selectedOrder.customer.id}
                    <span className="muted"> (telefon visibility POLICY E OPEN)</span>
                  </p>
                ) : (
                  <p className="muted">Mijoz: #{selectedOrder.customerId}</p>
                )}
                <p>
                  <b>Fulfillment:</b> {selectedOrder.fulfillmentStatus}{" "}
                  · <b>Payment:</b> {selectedOrder.paymentStatus}{" "}
                  · <b>Reservation:</b> {selectedOrder.reservationStatus}
                  {selectedOrder.reservationExpired ? " · bron muddati tugagan (buyurtma avtomatik bekor qilinmaydi)" : ""}
                </p>
                <p className="muted">
                  Subtotal {money(selectedOrder.subtotal)}
                  {selectedOrder.deliveryFee ? ` + yetkazish ${money(selectedOrder.deliveryFee)}` : ""}
                  {selectedOrder.cashbackUsed ? ` − cashback ${money(selectedOrder.cashbackUsed)}` : ""}
                  {" = "}{money(selectedOrder.total)}
                </p>
                <table className="table">
                  <thead><tr><th>Mahsulot</th><th>Narx</th><th>Soni</th><th>Jami</th></tr></thead>
                  <tbody>
                    {(selectedOrder.items || []).map((it: any) => (
                      <tr key={it.id}>
                        <td>{it.title}</td>
                        <td>{money(it.price)}</td>
                        <td>{it.quantity}</td>
                        <td>{money(Number(it.price) * Number(it.quantity))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
                  {orderCapabilities?.canTransitionFulfillment ? (
                    <>
                      <button className="ghost" disabled={orderBusy} type="button" onClick={() => void orderAction(selectedOrder.id, `/api/orders/${selectedOrder.id}/confirm`)}>CONFIRMED</button>
                      <button className="ghost" disabled={orderBusy} type="button" onClick={() => void orderAction(selectedOrder.id, `/api/orders/${selectedOrder.id}/prepare`)}>PREPARING</button>
                      <button className="ghost" disabled={orderBusy} type="button" onClick={() => void orderAction(selectedOrder.id, `/api/orders/${selectedOrder.id}/ready`)}>READY</button>
                      {selectedOrder.fulfillment === "delivery" ? (
                        <button className="ghost" disabled={orderBusy} type="button" onClick={() => void orderAction(selectedOrder.id, `/api/orders/${selectedOrder.id}/out-for-delivery`)}>OUT_FOR_DELIVERY</button>
                      ) : null}
                      <button className="ghost" disabled={orderBusy} type="button" onClick={() => void orderAction(selectedOrder.id, `/api/orders/${selectedOrder.id}/complete`)}>COMPLETED</button>
                    </>
                  ) : null}
                  {orderCapabilities?.canConfirmPos ? (
                    <button className="primary" disabled={orderBusy} type="button" onClick={() => void confirmOrder(selectedOrder.id)}>FOM tasdiq (shortcut)</button>
                  ) : null}
                  {orderCapabilities?.canCancel ? (
                    <button
                      className="ghost"
                      disabled={orderBusy}
                      type="button"
                      onClick={() => {
                        const warn = selectedOrder.paymentStatus === "PAID"
                          ? "PAID buyurtma: bekor qilish pulni avtomatik qaytarmaydi (PSP refund CONTRACT_PENDING). Davom etasizmi?"
                          : "Buyurtmani bekor qilasizmi?";
                        if (window.confirm(warn)) {
                          void orderAction(selectedOrder.id, `/api/orders/${selectedOrder.id}/admin-cancel`);
                        }
                      }}
                    >
                      Bekor qilish
                    </button>
                  ) : (
                    <span className="muted">Bekor qilish mavjud emas (ruxsat yoki holat).</span>
                  )}
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  PSP refund yo‘q (CONTRACT_PENDING). COMPLETED mavjud politikada payment o‘qini PAID qilishi mumkin — bu alohida to‘lov belgilash tugmasi emas.
                  {orderCapabilities?.paymentRefundsViaPsp === false ? " Refund tugmasi yo‘q." : ""}
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "customers" ? (
          <>
            <h1>Mijozlar</h1>
            <div className="card">
              <table className="table">
                <thead><tr><th>Ism</th><th>Telefon</th><th>Daraja</th><th>Balans</th><th>Xaridlar</th></tr></thead>
                <tbody>{customers.map((item) => <tr key={item.id}><td>{item.firstName} {item.lastName}</td><td>{item.phone}</td><td>{item.tier}</td><td>{money(item.balance)}</td><td>{item.purchasesCount}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "audit" ? (
          <>
            <h1>Audit (read-only)</h1>
            <p className="muted">Faqat ko‘rish. Tahrirlash/o‘chirish yo‘q. Maxfiy kalitlar yashiriladi.</p>
            <div className="toolbar">
              <input
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
                placeholder="action filtri (masalan order.)"
              />
              <button
                className="primary"
                type="button"
                disabled={auditLoading}
                onClick={() => void loadAuditPage({ offset: 0 })}
              >
                Yuklash
              </button>
            </div>
            {auditError ? (
              <div className="card" style={{ marginTop: 12 }}>
                <p style={{ color: "var(--danger)" }}>{auditError}</p>
                <button className="ghost" type="button" onClick={() => void loadAuditPage({ offset: auditOffset })}>Qayta urinish</button>
              </div>
            ) : null}
            <div className="card" style={{ marginTop: 12 }}>
              {auditLoading ? <p className="muted">Yuklanmoqda…</p> : null}
              {!auditLoading && !auditError && auditRows.length === 0 ? <p className="muted">Yozuvlar yo‘q.</p> : null}
              {!auditLoading && auditRows.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vaqt</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((row) => (
                      <tr key={row.id}>
                        <td>{String(row.createdAt || "")}</td>
                        <td>{row.actor}</td>
                        <td>{row.action}</td>
                        <td>{row.entity}</td>
                        <td><code style={{ fontSize: 12 }}>{JSON.stringify(row.metadata || {})}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div className="toolbar" style={{ marginTop: 12 }}>
                <span className="muted">Jami: {auditTotal} · offset {auditOffset}</span>
                <button
                  className="ghost"
                  type="button"
                  disabled={auditOffset <= 0 || auditLoading}
                  onClick={() => void loadAuditPage({ offset: Math.max(0, auditOffset - AUDIT_PAGE) })}
                >
                  Oldingi
                </button>
                <button
                  className="ghost"
                  type="button"
                  disabled={!auditHasMore || auditLoading}
                  onClick={() => void loadAuditPage({ offset: auditOffset + AUDIT_PAGE })}
                >
                  Keyingi
                </button>
              </div>
            </div>
          </>
        ) : null}

        {tab === "payments" ? (
          <>
            <h1>To‘lovlar</h1>
            <p className="muted">Har bir filialning o‘z Click/Payme kabineti. Kalitlar Filiallar bo‘limida kiritiladi.</p>
            <div className="card">
              <table className="table">
                <thead><tr><th>ID</th><th>Provayder</th><th>Merchant</th><th>Holat</th><th>Summa</th></tr></thead>
                <tbody>{payments.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.provider}</td><td>{item.merchantId || "—"}</td><td>{item.status}</td><td>{money(item.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "promos" ? (
          <>
            <h1>Aksiyalar</h1>
            <div className="kpis">{promos.map((item) => <div className="card" key={item.id}><b>{item.title}</b><div className="muted">{item.subtitle}</div></div>)}</div>
          </>
        ) : null}

        {tab === "ratings" ? (
          <>
            <h1>Xodim baholari</h1>
            <div className="card">
              <table className="table">
                <thead><tr><th>Xodim</th><th>Baho</th><th>Izoh</th></tr></thead>
                <tbody>{ratings.map((item) => <tr key={item.id}><td>{item.employeeName}</td><td>{item.rating}</td><td>{item.comment}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "fom" && fom ? (
          <>
            <h1>FOM integratsiya</h1>
            <div className="card">
              <p><b>{fom.provider}</b></p>
              <p>{fom.note}</p>
              <p className="ok">Walk-in: {fom.endpoints?.walkInSale || fom.endpoints?.sale}</p>
              <p className="ok">POS: {fom.endpoints?.posSale}</p>
              <p className="muted">Asosiy ish stoli: chap menyudagi «Kassa POS».</p>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
