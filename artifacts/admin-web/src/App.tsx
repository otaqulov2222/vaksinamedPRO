import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
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

const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];
const UZ_WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrator",
  hq: "HQ operator",
  cashier: "Kassir",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[String(role || "").toLowerCase()] || role || "Operator";
}

function initials(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "VM").toUpperCase();
}

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("vm-admin-sidebar") === "1",
  );
  const navRef = useRef<HTMLElement>(null);

  /** Scroll only the nav container (never the page) so the active item and its indicator stay visible. */
  useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>(".nav-item.active");
    if (!nav || !item) return;
    const n = nav.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.top < n.top) nav.scrollTop -= n.top - r.top + 8;
    else if (r.bottom > n.bottom) nav.scrollTop += r.bottom - n.bottom + 8;
    if (r.left < n.left) nav.scrollLeft -= n.left - r.left + 8;
    else if (r.right > n.right) nav.scrollLeft += r.right - n.right + 8;
  }, [tab, sidebarCollapsed, ready]);

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
          <div className="brand">
            <span className="brand-mark">VM</span>
            <span className="brand-text">VAKSINA MED</span>
          </div>
          <h1>Admin panel</h1>
          <p className="muted">Boshqaruv konsoliga kirish</p>
          <div className="login-form">
            <label className="login-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="login-field">
              <span>Parol</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <button className="btn-primary" type="submit">Kirish</button>
          </div>
        </form>
      </div>
    );
  }

  if (!ready || !user) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand">
            <span className="brand-mark">VM</span>
            <span className="brand-text">VAKSINA MED</span>
          </div>
          <h1>Admin panel</h1>
          <p className="muted">{bootError || "Sessiya va ruxsatlar yuklanmoqda…"}</p>
          {bootError ? (
            <button
              className="btn-primary"
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
  const crumbGroup = groupLabel !== pageTitle && groupLabel !== "Admin" ? groupLabel : null;
  const today = new Date();
  const onlyHqShell =
    visibleNav.length > 0
    && visibleNav.every((i) => i.id === "fom" || i.id === "settings" || i.id === "admins");

  return (
    <div className={`shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="side" aria-label="Asosiy menyu">
        <div className="side-head">
          <div className="side-brand-row">
            <div className="brand" aria-label="VaksinaMed">
              <span className="brand-mark">VM</span>
              {!sidebarCollapsed ? (
                <span className="brand-lockup">
                  <span className="brand-text">VAKSINA MED</span>
                  <span className="brand-sub">Operatsiyalar konsoli</span>
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="side-collapse"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Menyuni kengaytirish" : "Menyuni yig‘ish"}
              title={sidebarCollapsed ? "Kengaytirish" : "Yig‘ish"}
            >
              {sidebarCollapsed ? (
                <ChevronsRight size={16} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronsLeft size={16} strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="side-operator" title={user.email}>
            <span className="side-avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="side-operator-copy">
              <span className="side-user-name">{user.name}</span>
              <span className="side-operator-role">{roleLabel(user.role)}</span>
            </span>
          </div>
        </div>
        <nav className="side-nav" aria-label="Admin navigatsiya" ref={navRef}>
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
        <div className="side-footer">
          <button
            type="button"
            className="side-logout"
            onClick={() => void logout()}
            title="Chiqish"
          >
            <span className="nav-icon" aria-hidden="true">
              <LOGOUT_ICON size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
            </span>
            <span className={sidebarCollapsed ? "sr-only" : "side-logout-text"}>Chiqish</span>
          </button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <nav className="breadcrumb" aria-label="Joylashuv">
            {crumbGroup ? (
              <>
                <span className="crumb-group">{crumbGroup}</span>
                <span className="crumb-sep" aria-hidden="true">
                  <ChevronRight size={14} strokeWidth={2} />
                </span>
              </>
            ) : null}
            <span className="crumb-page" aria-current="location">{pageTitle}</span>
          </nav>
          <div className="topbar-meta">
            <time className="topbar-date" dateTime={today.toISOString().slice(0, 10)}>
              <span className="topbar-weekday">{UZ_WEEKDAYS[today.getDay()]}</span>
              <span className="topbar-day">{`${today.getDate()} ${UZ_MONTHS[today.getMonth()]} ${today.getFullYear()}`}</span>
            </time>
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
              onOpenCustomers={() => setTab("customers")}
              onOpenCashback={() => setTab("cashback")}
              onOpenBranches={() => setTab("branches")}
            />
          ) : null}
          {tab === "kassa" ? (
            <PosTerminal
              token={token}
              branches={branches}
              defaultBranchId={user.branchId || branches[0]?.id}
              operatorName={user.name}
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
