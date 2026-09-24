import { FormEvent, useEffect, useState } from "react";
import { request, softRequest, money, type AdminUser } from "./api";
import { NAV, PAGE_TITLES, navVisible } from "./nav";
import { PosTerminal } from "./PosTerminal";
import { DashboardPage } from "./pages/DashboardPage";
import { BranchesPage } from "./pages/BranchesPage";
import { CatalogPage } from "./pages/CatalogPage";
import { InventoryPage } from "./pages/InventoryPage";
import { OrdersPage } from "./pages/OrdersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CashbackPage } from "./pages/CashbackPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { PromosPage } from "./pages/PromosPage";
import { RatingsPage } from "./pages/RatingsPage";
import { DeliveryPage } from "./pages/DeliveryPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AuditPage } from "./pages/AuditPage";
import { FomPage } from "./pages/FomPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("vm-admin-token"));
  const [user, setUser] = useState<AdminUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [tab, setTab] = useState("dashboard");
  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("admin@vaksinamed.uz");
  const [password, setPassword] = useState("vaksinamed");

  async function bootstrap(nextToken = token) {
    if (!nextToken) return;
    setBootLoading(true);
    setBootError("");
    try {
      const me = await request("/api/admin/me", nextToken);
      setUser(me.user);
      const perms: string[] = Array.isArray(me.permissions) ? me.permissions.map(String) : [];
      setPermissions(perms);

      const b = await softRequest("/api/admin/branches", nextToken);
      setBranches(b?.branches || []);

      const allowed = NAV.filter((item) => navVisible(item, perms, me.user?.role || ""));
      if (allowed.length && !allowed.some((item) => item.id === tab)) {
        setTab(allowed[0].id);
      }
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "Sessiya yuklanmadi");
      localStorage.removeItem("vm-admin-token");
      setToken(null);
      setUser(null);
      setPermissions([]);
    } finally {
      setBootLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void bootstrap(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await request("/api/admin/login", null, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("vm-admin-token", data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirish xatosi");
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
    setPermissions([]);
    setBranches([]);
  }

  if (!token || !user) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={login}>
          <div className="brand">VAKSINA MED</div>
          <h1>Admin panel</h1>
          <p className="muted">Tarmoq boshqaruvi · Kassa · Ombor · Cashback · Filiallar</p>
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

  const visibleNav = NAV.filter((item) => navVisible(item, permissions, user.role));
  const pageTitle = PAGE_TITLES[tab] || "Admin";

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">VAKSINA MED</div>
        <p className="side-user">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          {user.branchId != null ? <span>Filial #{user.branchId}</span> : <span>HQ</span>}
        </p>
        <nav className="side-nav">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button type="button" className="side-logout" onClick={() => void logout()}>
          Chiqish
        </button>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div>
            <div className="breadcrumb muted">Admin / {pageTitle}</div>
            <h1 className="topbar-title">{pageTitle}</h1>
          </div>
          <div className="topbar-meta">
            <span className="muted">{user.email}</span>
          </div>
        </header>

        <main className="main">
          {bootLoading ? (
            <div className="card state-box"><p className="muted">Sessiya yuklanmoqda…</p></div>
          ) : null}
          {bootError ? (
            <div className="card state-box state-error"><p>{bootError}</p></div>
          ) : null}

          {!bootLoading && tab === "dashboard" ? <DashboardPage token={token} /> : null}
          {!bootLoading && tab === "kassa" ? (
            <PosTerminal
              token={token}
              branches={branches}
              defaultBranchId={user.branchId || branches[0]?.id}
              request={request}
              money={money}
            />
          ) : null}
          {!bootLoading && tab === "branches" ? (
            <BranchesPage token={token} user={user} permissions={permissions} />
          ) : null}
          {!bootLoading && tab === "products" ? (
            <CatalogPage token={token} user={user} permissions={permissions} branches={branches} />
          ) : null}
          {!bootLoading && tab === "inventory" ? (
            <InventoryPage token={token} user={user} permissions={permissions} branches={branches} />
          ) : null}
          {!bootLoading && tab === "orders" ? (
            <OrdersPage token={token} user={user} branches={branches} />
          ) : null}
          {!bootLoading && tab === "customers" ? <CustomersPage token={token} /> : null}
          {!bootLoading && tab === "cashback" ? <CashbackPage token={token} /> : null}
          {!bootLoading && tab === "payments" ? (
            <PaymentsPage token={token} permissions={permissions} />
          ) : null}
          {!bootLoading && tab === "promos" ? <PromosPage token={token} /> : null}
          {!bootLoading && tab === "ratings" ? (
            <RatingsPage token={token} user={user} branches={branches} />
          ) : null}
          {!bootLoading && tab === "delivery" ? (
            <DeliveryPage token={token} user={user} branches={branches} />
          ) : null}
          {!bootLoading && tab === "reports" ? <ReportsPage token={token} /> : null}
          {!bootLoading && tab === "audit" ? <AuditPage token={token} /> : null}
          {!bootLoading && tab === "fom" ? <FomPage token={token} /> : null}
          {!bootLoading && tab === "settings" ? <SettingsPage /> : null}
        </main>
      </div>
    </div>
  );
}
