import { FormEvent, useEffect, useMemo, useState } from "react";
import { PosTerminal } from "./PosTerminal";

const API = "";

type AdminUser = { id: number; email: string; name: string; role: string; branchId: number | null };

async function request(path: string, token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
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
  ["fom", "FOM adapter"],
];

function money(value: number) {
  return new Intl.NumberFormat("uz-UZ").format(value) + " so‘m";
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

  async function loadAll(nextToken = token) {
    if (!nextToken) return;
    const [me, dash, b, p, o, c, pay, promo, rate, fomStatus] = await Promise.all([
      request("/api/admin/me", nextToken),
      request("/api/admin/dashboard", nextToken),
      request("/api/admin/branches", nextToken),
      request("/api/admin/products", nextToken),
      request("/api/admin/orders", nextToken),
      request("/api/admin/customers", nextToken),
      request("/api/admin/payments", nextToken),
      request("/api/admin/promos", nextToken),
      request("/api/admin/ratings", nextToken),
      request("/api/integrations/fom/status", nextToken),
    ]);
    setUser(me.user);
    setDashboard(dash);
    setBranches(b.branches);
    setProducts(p.products);
    setOrders(o.orders);
    setCustomers(c.customers);
    setPayments(pay.payments);
    setPromos(promo.promos);
    setRatings(rate.ratings);
    setFom(fomStatus);
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
    await request(`/api/orders/${id}/confirm-pos`, token, { method: "POST", body: JSON.stringify({ receiptId: `ADMIN-${Date.now()}` }) });
    await loadAll();
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
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
        <button onClick={() => { localStorage.removeItem("vm-admin-token"); setToken(null); }}>Chiqish</button>
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

        {tab === "dashboard" && dashboard ? (
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
                    <tr key={item.id}><td>{item.code}</td><td>{item.branch?.name}</td><td>{item.status}</td><td>{money(item.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
            <div className="card">
              <table className="table">
                <thead><tr><th>Kod</th><th>Filial</th><th>Tur</th><th>Holat</th><th>Summa</th><th>Kassa</th></tr></thead>
                <tbody>
                  {orders.map((item) => (
                    <tr key={item.id}>
                      <td>{item.code}</td>
                      <td>{item.branch?.name}</td>
                      <td>{item.fulfillment}</td>
                      <td>{item.status}</td>
                      <td>{money(item.total)}</td>
                      <td>{item.status !== "completed" && item.status !== "cancelled" ? <button className="ghost" onClick={() => confirmOrder(item.id)}>FOM tasdiq</button> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
