import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { request, softRequest, money, fmtDate, isHqRole, type AdminUser } from "../api";
import {
  StateBox,
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan — qayta kiring.";
  if (status === 403) return "Dashboard ko‘rish uchun ruxsat yo‘q.";
  if (status === 400) return err instanceof Error ? err.message : "Filtr noto‘g‘ri.";
  return err instanceof Error ? err.message : fallback;
}

function customerName(item: any): string {
  if (item?.customer) {
    const n = `${item.customer.firstName || ""} ${item.customer.lastName || ""}`.trim();
    return n || "—";
  }
  if (item?.customerName) return String(item.customerName);
  return "—";
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(base: Date, delta: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

function presetLabel(preset: Preset): string {
  if (preset === "today") return "Bugun";
  if (preset === "yesterday") return "Kecha";
  if (preset === "7d") return "7 kun";
  if (preset === "30d") return "30 kun";
  if (preset === "all") return "Barchasi";
  return "Maxsus";
}

type Preset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";
type ActivityTab = "orders" | "pos";
type AttnTone = "danger" | "warn" | "info" | "neutral";

type AttentionItem = {
  id: string;
  tone: AttnTone;
  title: string;
  detail: string;
  actionLabel?: string;
  actionKind?: "secondary" | "tertiary";
  onAction?: () => void;
  body?: ReactNode;
};

function EmptyInline(props: {
  title: string;
  detail?: string;
  ok?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`empty-inline${props.ok ? " empty-inline--ok" : ""}`}>
      {props.ok ? <span className="empty-inline-mark" aria-hidden>✓</span> : null}
      <div className="empty-inline-copy">
        <strong>{props.title}</strong>
        {props.detail ? <span>{props.detail}</span> : null}
        {props.action}
      </div>
    </div>
  );
}

export function DashboardPage(props: {
  token: string;
  permissions?: string[];
  user?: AdminUser | null;
  branches?: any[];
  onOpenOrder?: (orderId: number) => void;
  onOpenInventory?: () => void;
  onOpenOrders?: () => void;
  onOpenPos?: () => void;
  onOpenDelivery?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [posSales, setPosSales] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityTab, setActivityTab] = useState<ActivityTab>("orders");

  const [preset, setPreset] = useState<Preset>("today");
  const [branchId, setBranchId] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const branchSelectRef = useRef<HTMLSelectElement>(null);

  const canPosSales = (props.permissions || []).includes("pos:sales:read");
  const isHq = Boolean(props.user && isHqRole(props.user.role));

  const dateBounds = useMemo(() => {
    if (preset === "all") return { from: "", to: "" };
    if (preset === "custom") return { from: createdFrom, to: createdTo };
    const today = new Date();
    if (preset === "today") return { from: ymd(today), to: ymd(today) };
    if (preset === "yesterday") {
      const y = shiftDays(today, -1);
      return { from: ymd(y), to: ymd(y) };
    }
    if (preset === "7d") return { from: ymd(shiftDays(today, -6)), to: ymd(today) };
    if (preset === "30d") return { from: ymd(shiftDays(today, -29)), to: ymd(today) };
    return { from: "", to: "" };
  }, [preset, createdFrom, createdTo]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (branchId) qs.set("branchId", branchId);
      if (dateBounds.from) qs.set("createdFrom", dateBounds.from);
      if (dateBounds.to) qs.set("createdTo", dateBounds.to);
      const suffix = qs.toString() ? `?${qs}` : "";
      const body = await request(`/api/admin/dashboard${suffix}`, props.token);
      setData(body);

      if (canPosSales) {
        const salesQs = new URLSearchParams();
        salesQs.set("limit", "8");
        if (branchId) salesQs.set("branchId", branchId);
        const sales = await softRequest(`/api/pos/sales?${salesQs}`, props.token);
        const rows = Array.isArray(sales?.sales) ? sales.sales : [];
        setPosSales(rows.slice(0, 8));
      } else {
        setPosSales(null);
      }
    } catch (err) {
      setData(null);
      setPosSales(null);
      setError(errText(err, "Ma’lumotlarni yuklashda xatolik yuz berdi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, canPosSales, branchId, dateBounds.from, dateBounds.to]);

  const kpis = data?.kpis;
  const recent: any[] = Array.isArray(data?.recentOrders) ? data.recentOrders : [];
  const inventory = data?.inventory;
  const revenue = Number(kpis?.revenue || 0);
  const ordersCount = Number(kpis?.orders || 0);
  const completedCount = Number(kpis?.completed || 0);
  const deliveringCount = Number(kpis?.delivering || 0);
  const openOrders = Math.max(0, ordersCount - completedCount);
  const zeroAvailable = inventory ? Number(inventory.zeroAvailable || 0) : 0;
  const zeroItems = inventory && Array.isArray(inventory.items)
    ? inventory.items.filter((row: any) => Number(row.available) <= 0)
    : [];
  const hasInventoryAlerts = zeroItems.length > 0 || zeroAvailable > 0;

  function focusBranch() {
    branchSelectRef.current?.focus();
    document.getElementById("dash-branch-filter")?.scrollIntoView({ block: "nearest" });
  }

  /* Priority: inventory → open orders → delivery */
  const attentionItems: AttentionItem[] = [];

  if (!inventory) {
    attentionItems.push({
      id: "inv-scope",
      tone: "neutral",
      title: "Ombor nazorati",
      detail: "Ombor holatini ko‘rish uchun filialni tanlang.",
      actionLabel: isHq ? "Filial tanlash" : undefined,
      actionKind: "secondary",
      onAction: isHq ? focusBranch : undefined,
    });
  } else if (hasInventoryAlerts) {
    const count = zeroAvailable || zeroItems.length;
    attentionItems.push({
      id: "inv-zero",
      tone: "danger",
      title: "Ombor",
      detail: `${count} ta mahsulot mavjud emas.`,
      actionLabel: props.onOpenInventory ? "Ko‘rish →" : undefined,
      actionKind: "tertiary",
      onAction: props.onOpenInventory,
      body: (
        <DataTable>
          <thead>
            <tr>
              <th>Mahsulot</th>
              <th className="num">Fizik</th>
              <th className="num">Band</th>
              <th className="num">Mavjud</th>
            </tr>
          </thead>
          <tbody>
            {(zeroItems.length ? zeroItems : inventory.items.filter((r: any) => Number(r.available) <= 0))
              .slice(0, 12)
              .map((row: any) => (
                <tr key={row.productId}>
                  <td>{row.nameUz}</td>
                  <td className="num">{row.physical}</td>
                  <td className="num">{row.reserved}</td>
                  <td className="num">
                    <StatusBadge tone="danger">{row.available}</StatusBadge>
                  </td>
                </tr>
              ))}
          </tbody>
        </DataTable>
      ),
    });
  }

  if (openOrders > 0) {
    attentionItems.push({
      id: "open-orders",
      tone: "warn",
      title: "Buyurtmalar",
      detail: `${openOrders} ta ochiq buyurtma.`,
      actionLabel: props.onOpenOrders ? "Ko‘rish →" : undefined,
      actionKind: "tertiary",
      onAction: props.onOpenOrders,
    });
  }

  if (deliveringCount > 0) {
    attentionItems.push({
      id: "delivering",
      tone: "info",
      title: "Yetkazib berish",
      detail: `${deliveringCount} ta buyurtma yetkazilmoqda.`,
      actionLabel: (props.onOpenDelivery || props.onOpenOrders) ? "Ko‘rish →" : undefined,
      actionKind: "tertiary",
      onAction: props.onOpenDelivery || props.onOpenOrders,
    });
  }

  const onlyBranchGate = attentionItems.length === 1 && attentionItems[0].id === "inv-scope";
  const showCalmEmpty = attentionItems.length === 0;
  const activityEmpty = activityTab === "orders"
    ? recent.length === 0
    : !posSales || posSales.length === 0;

  const filterControls = (
    <div className="dashboard-controls" role="group" aria-label="Dashboard filtrlari">
      <FilterField label="Sana">
        <select
          value={preset}
          aria-label="Sana oralig‘i"
          onChange={(e) => {
            const p = e.target.value as Preset;
            setPreset(p);
            if (p !== "custom") {
              setCreatedFrom("");
              setCreatedTo("");
            }
          }}
        >
          <option value="today">Bugun</option>
          <option value="yesterday">Kecha</option>
          <option value="7d">7 kun</option>
          <option value="30d">30 kun</option>
          <option value="all">Barchasi</option>
          <option value="custom">Maxsus</option>
        </select>
      </FilterField>
      {preset === "custom" ? (
        <>
          <FilterField label="Dan">
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} aria-label="Dan" />
          </FilterField>
          <FilterField label="Gacha">
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} aria-label="Gacha" />
          </FilterField>
        </>
      ) : null}
      <FilterField label="Filial">
        {isHq ? (
          <select
            ref={branchSelectRef}
            id="dash-branch-filter"
            value={branchId}
            aria-label="Filial"
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Barchasi</option>
            {(props.branches || []).map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        ) : (
          <input value="O‘z filiali" disabled readOnly aria-label="Filial" />
        )}
      </FilterField>
      <button className="btn-primary" type="button" disabled={loading} onClick={() => void load()}>
        Yangilash
      </button>
    </div>
  );

  return (
    <div
      className={[
        "dashboard",
        showCalmEmpty ? "dashboard--calm" : "",
        onlyBranchGate ? "dashboard--gate" : "",
        activityEmpty ? "dashboard--activity-empty" : "",
      ].filter(Boolean).join(" ")}
    >
      <AdminPageHeader
        className="dashboard-header"
        title="Dashboard"
        description={PAGE_DESCRIPTIONS.dashboard}
        actions={filterControls}
      />

      <StateBox
        loading={loading}
        error={error || null}
        empty={!kpis}
        emptyText="Dashboard ma’lumoti mavjud emas"
        onRetry={() => void load()}
      >
        {/* 1. BUSINESS HERO — compact, Savdo focal */}
        <section className="biz-hero" aria-label="Bugungi savdo">
          <div className="biz-hero-main">
            <div className="biz-hero-kicker">Bugungi savdo</div>
            <div className="biz-hero-value">{money(revenue)}</div>
            <div className="biz-hero-support">
              Yakunlangan: <b className="is-ok">{completedCount}</b>
              <span className="biz-hero-dot" aria-hidden>·</span>
              Yetkazilmoqda: <b className="is-info">{deliveringCount}</b>
            </div>
          </div>
          <div className="biz-hero-side" aria-label="Davr va buyurtmalar">
            <div className="biz-hero-period">{presetLabel(preset)}</div>
            <div className="biz-hero-orders">
              <span className="biz-hero-orders-value">{ordersCount}</span>
              <span className="biz-hero-orders-label">buyurtma</span>
            </div>
          </div>
        </section>

        {/* 2. OPERATION RAIL — secondary context */}
        <div className="ops-rail" aria-label="Operatsion kontekst">
          <div className="ops-rail-item">
            <span className="ops-rail-label">Mijozlar</span>
            <span className="ops-rail-value">{Number(kpis?.customers || 0)}</span>
          </div>
          <div className="ops-rail-item">
            <span className="ops-rail-label">Cashback</span>
            <span className="ops-rail-value">{money(Number(kpis?.cashback || 0))}</span>
          </div>
          <div className="ops-rail-item">
            <span className="ops-rail-label">Filiallar</span>
            <span className="ops-rail-value">{Number(kpis?.branches || 0)}</span>
          </div>
          <div className="ops-rail-item">
            <span className="ops-rail-label">Bronlar</span>
            <span className="ops-rail-value">{Number(kpis?.reserved || 0)}</span>
          </div>
        </div>

        {/* 3. ATTENTION — content-height work queue */}
        {showCalmEmpty ? (
          <div className="attn-calm" role="status" aria-label="E’tibor">
            <EmptyInline
              ok
              title="Hammasi joyida"
              detail="Hozircha e’tibor talab qiladigan ish yo‘q."
            />
          </div>
        ) : (
          <section
            className={`attn${onlyBranchGate ? " attn--gate" : ""}`}
            aria-label="E’tibor talab qiladi"
          >
            {!onlyBranchGate ? (
              <h2 className="attn-title">E’tibor talab qiladi</h2>
            ) : null}
            <ul className="attn-rows">
              {attentionItems.map((item) => (
                <li key={item.id} className={`attn-row attn-${item.tone}`}>
                  <div className="attn-row-main">
                    <div className="attn-row-copy">
                      <div className="attn-row-title">{item.title}</div>
                      <div className="attn-row-detail">{item.detail}</div>
                    </div>
                    {item.actionLabel && item.onAction ? (
                      <button
                        className={item.actionKind === "secondary" ? "btn-secondary" : "btn-tertiary"}
                        type="button"
                        onClick={item.onAction}
                      >
                        {item.actionLabel}
                      </button>
                    ) : null}
                  </div>
                  {item.body ? <div className="attn-row-body">{item.body}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 4. ACTIVITY — shrinks when empty */}
        <section
          className={`act${activityEmpty ? " act--empty" : ""}`}
          aria-label="Faoliyat"
        >
          <div className="act-head">
            <h2 className="act-title">Faoliyat</h2>
            <div className="activity-tabs" role="tablist" aria-label="Faoliyat turi">
              <button
                type="button"
                role="tab"
                aria-selected={activityTab === "orders"}
                className={`activity-tab${activityTab === "orders" ? " active" : ""}`}
                onClick={() => setActivityTab("orders")}
              >
                Buyurtmalar
              </button>
              {canPosSales ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityTab === "pos"}
                  className={`activity-tab${activityTab === "pos" ? " active" : ""}`}
                  onClick={() => setActivityTab("pos")}
                >
                  Kassa
                </button>
              ) : null}
            </div>
          </div>

          {activityTab === "orders" ? (
            recent.length === 0 ? (
              <EmptyInline
                title="Buyurtmalar topilmadi"
                detail="Tanlangan davrda yangi buyurtmalar mavjud emas."
                action={
                  props.onOpenOrders ? (
                    <button className="btn-tertiary" type="button" onClick={props.onOpenOrders}>
                      Buyurtmalarga o‘tish →
                    </button>
                  ) : null
                }
              />
            ) : (
              <>
                <DataTable sticky>
                  <thead>
                    <tr>
                      <th>Buyurtma</th>
                      <th>Mijoz</th>
                      <th>Holat</th>
                      <th className="num">Summa</th>
                      <th>Vaqt</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((item: any) => (
                      <tr key={item.id}>
                        <td className="mono-cell">{item.code}</td>
                        <td>{customerName(item)}</td>
                        <td>
                          <StatusLabelBadge
                            domain="fulfillment"
                            status={item.fulfillmentStatus || item.status || ""}
                          />
                        </td>
                        <td className="num money-md">{money(Number(item.total || 0))}</td>
                        <td className="meta">{fmtDate(item.createdAt)}</td>
                        <td className="actions-cell">
                          {props.onOpenOrder ? (
                            <button
                              className="btn-tertiary"
                              type="button"
                              onClick={() => props.onOpenOrder!(item.id)}
                            >
                              Ochish
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                {props.onOpenOrders ? (
                  <div className="act-foot">
                    <button className="btn-tertiary" type="button" onClick={props.onOpenOrders}>
                      Barcha buyurtmalar →
                    </button>
                  </div>
                ) : null}
              </>
            )
          ) : !posSales || posSales.length === 0 ? (
            <EmptyInline
              title="Kassa savdolari yo‘q"
              detail="Tanlangan davrda kassa savdolari mavjud emas."
              action={
                props.onOpenPos ? (
                  <button className="btn-tertiary" type="button" onClick={props.onOpenPos}>
                    Kassaga o‘tish →
                  </button>
                ) : null
              }
            />
          ) : (
            <>
              <DataTable sticky>
                <thead>
                  <tr>
                    <th>Chek</th>
                    <th>Mijoz</th>
                    <th>Filial</th>
                    <th className="num">Summa</th>
                    <th className="num">Cashback</th>
                    <th>Vaqt</th>
                  </tr>
                </thead>
                <tbody>
                  {posSales.map((row: any, idx: number) => (
                    <tr key={row.id || row.receiptId || idx}>
                      <td className="mono-cell">{row.receiptId || row.code || "—"}</td>
                      <td>{row.customerName || "—"}</td>
                      <td>{row.branchName || "—"}</td>
                      <td className="num money-md">
                        {money(Number(row.total ?? row.amount ?? row.grandTotal ?? 0))}
                      </td>
                      <td className="num">
                        {row.cashbackUsed != null || row.cashbackEarned != null || row.cashback != null
                          ? money(Number(row.cashbackUsed ?? row.cashbackEarned ?? row.cashback ?? 0))
                          : "—"}
                      </td>
                      <td className="meta">{fmtDate(row.createdAt || row.soldAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {props.onOpenPos ? (
                <div className="act-foot">
                  <button className="btn-tertiary" type="button" onClick={props.onOpenPos}>
                    Kassaga o‘tish →
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </StateBox>
    </div>
  );
}
