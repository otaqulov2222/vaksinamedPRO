import { FormEvent, useEffect, useState } from "react";
import { request, softRequest, money, type AdminUser } from "./api";
import {
  NAV,
  NAV_GROUPS,
  PAGE_TITLES,
  navVisible,
  preferLandingTab,
  groupLabelForTab,
} from "./nav";
import { NAV_ICONS, LOGOUT_ICON, NAV_ICON_SIZE, NAV_ICON_STROKE } from "./navIcons";
import { PAGE_DENSITY } from "./ui";
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
import { AdminAccessPage } from "./pages/AdminAccessPage";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("vm-admin-token"));
  const [user, setUser] = useState<AdminUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [tab, setTab] = useState("dashboard");
  const [focusOrderId, setFocusOrderId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("admin@vaksinamed.uz");
  const [password, setPassword] = useState("vaksinamed");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("vm-admin-sidebar") === "1",
  );

  const [sessionBusy, setSessionBusy] = useState(false);

  async function bootstrap(nextToken: string, opts?: { forceLanding?: boolean }) {
    setReady(false);
    setBootError("");
    try {
      const me = await request("/api/admin/me", nextToken);
      setUser(me.user);
      const perms: string[] = Array.isArray(me.permissions) ? me.permissions.map(String) : [];
      setPermissions(perms);

      const b = await softRequest("/api/admin/branches", nextToken);
      setBranches(b?.branches || []);

      const allowed = NAV.filter((item) => navVisible(item, perms, me.user?.role || ""));
      const landing = preferLandingTab(allowed);
      if (opts?.forceLanding || !allowed.some((item) => item.id === tab)) {
        setTab(landing);
      }
      setReady(true);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "Sessiya yuklanmadi");
      localStorage.removeItem("vm-admin-token");
      setToken(null);
      setUser(null);
      setPermissions([]);
      setReady(false);
    }
  }

  async function refreshSession() {
    if (!token || sessionBusy) return;
    setSessionBusy(true);
    try {
      const me = await request("/api/admin/me", token);
      setUser(me.user);
      const perms: string[] = Array.isArray(me.permissions) ? me.permissions.map(String) : [];
      setPermissions(perms);
      const b = await softRequest("/api/admin/branches", token);
      setBranches(b?.branches || []);
      const allowed = NAV.filter((item) => navVisible(item, perms, me.user?.role || ""));
      if (!allowed.some((item) => item.id === tab)) {
        setTab(preferLandingTab(allowed));
      }
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "Sessiya yangilanmadi");
      localStorage.removeItem("vm-admin-token");
      setToken(null);
      setUser(null);
      setPermissions([]);
      setReady(false);
    } finally {
      setSessionBusy(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setReady(false);
      return;
    }
    void bootstrap(token, { forceLanding: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("vm-admin-sidebar", next ? "1" : "0");
      return next;
    });
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await request("/api/admin/login", null, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("vm-admin-token", data.token);
      setReady(false);
      setUser(null);
      setPermissions([]);
      setTab("dashboard");
      setToken(data.token);
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
    setReady(false);
    setTab("dashboard");
  }

  if (!token) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={login}>
          <div className="brand">VAKSINA MED</div>
          <h1>Admin panel</h1>
          <p className="muted">Tarmoq boshqaruvi · Dashboard · Kassa · Ombor · Cashback</p>
          <div className="toolbar" style={{ flexDirection: "column", margin: 0 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="username"
              aria-label="Email"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parol"
              autoComplete="current-password"
              aria-label="Parol"
            />
            {error ? <div style={{ color: "var(--vm-danger)" }}>{error}</div> : null}
            <button className="primary" type="submit">Kirish</button>
          </div>
        </form>
      </div>
    );
  }

  if (!ready || !user) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand">VAKSINA MED</div>
          <h1>Admin panel</h1>
          <p className="muted">{bootError || "Sessiya va ruxsatlar yuklanmoqda…"}</p>
          {bootError ? (
            <button
              className="primary"
              type="button"
              onClick={() => {
                localStorage.removeItem("vm-admin-token");
                setToken(null);
              }}
            >
              Qayta kirish
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const visibleNav = NAV.filter((item) => navVisible(item, permissions, user.role));
  const pageTitle = PAGE_TITLES[tab] || "Admin";
  const groupLabel = groupLabelForTab(tab);
  const onlyHqShell =
    visibleNav.length > 0
    && visibleNav.every((i) => i.id === "fom" || i.id === "settings" || i.id === "admins");
  const branchLabel =
    user.branchId != null
      ? branches.find((b) => Number(b.id) === Number(user.branchId))?.name || `Filial #${user.branchId}`
      : "HQ";
  const roleLabel = String(user.role || "").replace(/_/g, " ");

  return (
    <div className={`shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="side" aria-label="Asosiy menyu">
        <div className="side-brand-row">
          <div className="brand" aria-label="VaksinaMed">
            <span className="brand-mark">VM</span>
            {!sidebarCollapsed ? <span className="brand-text">VAKSINA MED</span> : null}
          </div>
          <button
            type="button"
            className="side-collapse"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Menyuni kengaytirish" : "Menyuni yig‘ish"}
            title={sidebarCollapsed ? "Kengaytirish" : "Yig‘ish"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>
        {!sidebarCollapsed ? (
          <div className="side-user" aria-label="Operator">
            <strong className="side-user-name">{user.name}</strong>
            <span className="side-user-role">{roleLabel}</span>
            <span className="side-user-scope">{branchLabel}</span>
          </div>
        ) : null}
        <nav className="side-nav" aria-label="Admin navigatsiya">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => navVisible(item, permissions, user.role));
            if (!items.length) return null;
            const groupActive = items.some((item) => item.id === tab);
            return (
              <div
                key={group.id}
                className={`nav-group${groupActive ? " nav-group-active" : ""}`}
              >
                {!sidebarCollapsed ? (
                  <div className="nav-group-label" id={`nav-g-${group.id}`}>
                    {group.label}
                  </div>
                ) : null}
                <div
                  className="nav-group-items"
                  role="group"
                  aria-labelledby={sidebarCollapsed ? undefined : `nav-g-${group.id}`}
                >
                  {items.map((item) => {
                    const active = tab === item.id;
                    const weight = item.weight || "secondary";
                    const Icon = NAV_ICONS[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`nav-item nav-w-${weight}${active ? " active" : ""}`}
                        aria-current={active ? "page" : undefined}
                        title={item.label}
                        aria-label={item.label}
                        onClick={() => setTab(item.id)}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          {Icon ? (
                            <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
                          ) : null}
                        </span>
                        {!sidebarCollapsed ? (
                          <span className="nav-label">{item.label}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <button
          type="button"
          className="side-logout"
          onClick={() => void logout()}
          aria-label="Chiqish"
          title="Chiqish"
        >
          <span className="nav-icon" aria-hidden="true">
            <LOGOUT_ICON size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
          </span>
          {!sidebarCollapsed ? <span className="side-logout-text">Chiqish</span> : null}
        </button>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <nav className="breadcrumb" aria-label="Joylashuv">
            <span className="crumb-root">Admin</span>
            <span className="crumb-sep" aria-hidden>/</span>
            <span className="crumb-group">{groupLabel}</span>
            <span className="crumb-sep" aria-hidden>/</span>
            <span className="crumb-page" aria-current="location">{pageTitle}</span>
          </nav>
          <div className="topbar-meta">
            <span
              className="topbar-identity"
              title={user.email}
            >
              {sidebarCollapsed ? (
                <>
                  <span className="topbar-operator">{user.name}</span>
                  <span className="topbar-dot" aria-hidden>·</span>
                  <span className="topbar-scope">{branchLabel}</span>
                </>
              ) : (
                <span className="topbar-scope" aria-label="Filial doirasi">{branchLabel}</span>
              )}
            </span>
            <button
              className="btn-tertiary topbar-action"
              type="button"
              disabled={sessionBusy}
              aria-busy={sessionBusy}
              title="Sessiya va ruxsatlarni yangilash (sahifa ma’lumoti emas)"
              onClick={() => void refreshSession()}
            >
              {sessionBusy ? "Yangilanmoqda…" : "Sessiya"}
            </button>
            <button
              className="btn-tertiary topbar-action topbar-logout"
              type="button"
              onClick={() => void logout()}
            >
              Chiqish
            </button>
          </div>
        </header>

        <main className="main surface-page" data-page={tab} data-density={PAGE_DENSITY[tab] || "medium"}>
          {onlyHqShell ? (
            <div className="alert-banner warn" role="alert">
              Hozircha faqat cheklangan modullar ochiq. Agar kerakli bo‘limlar ko‘rinmasa, administrator bilan bog‘laning.
            </div>
          ) : null}

          {tab === "dashboard" ? (
            <DashboardPage
              token={token}
              permissions={permissions}
              user={user}
              branches={branches}
              onOpenOrder={(orderId) => {
                setFocusOrderId(orderId);
                setTab("orders");
              }}
              onOpenInventory={() => setTab("inventory")}
              onOpenOrders={() => setTab("orders")}
              onOpenPos={() => setTab("kassa")}
              onOpenDelivery={() => setTab("delivery")}
            />
          ) : null}
          {tab === "kassa" ? (
            <PosTerminal
              token={token}
              branches={branches}
              defaultBranchId={user.branchId || branches[0]?.id}
              request={request}
              money={money}
            />
          ) : null}
          {tab === "branches" ? (
            <BranchesPage
              token={token}
              user={user}
              permissions={permissions}
              onOpenInventory={() => setTab("inventory")}
            />
          ) : null}
          {tab === "products" ? (
            <CatalogPage
              token={token}
              user={user}
              permissions={permissions}
              branches={branches}
              onOpenInventory={() => setTab("inventory")}
            />
          ) : null}
          {tab === "inventory" ? (
            <InventoryPage token={token} user={user} permissions={permissions} branches={branches} />
          ) : null}
          {tab === "orders" ? (
            <OrdersPage
              token={token}
              user={user}
              branches={branches}
              initialOrderId={focusOrderId}
              onInitialOrderConsumed={() => setFocusOrderId(null)}
            />
          ) : null}
          {tab === "customers" ? <CustomersPage token={token} /> : null}
          {tab === "cashback" ? <CashbackPage token={token} /> : null}
          {tab === "payments" ? (
            <PaymentsPage token={token} permissions={permissions} branches={branches} />
          ) : null}
          {tab === "promos" ? <PromosPage token={token} /> : null}
          {tab === "ratings" ? (
            <RatingsPage token={token} user={user} branches={branches} />
          ) : null}
          {tab === "delivery" ? (
            <DeliveryPage
              token={token}
              user={user}
              branches={branches}
              onOpenOrder={(orderId) => {
                setFocusOrderId(orderId);
                setTab("orders");
              }}
            />
          ) : null}
          {tab === "reports" ? (
            <ReportsPage token={token} user={user} branches={branches} />
          ) : null}
          {tab === "audit" ? <AuditPage token={token} branches={branches} /> : null}
          {tab === "fom" ? <FomPage token={token} /> : null}
          {tab === "admins" ? (
            <AdminAccessPage user={user} permissions={permissions} branches={branches} />
          ) : null}
          {tab === "settings" ? <SettingsPage token={token} /> : null}
        </main>
      </div>
    </div>
  );
}
