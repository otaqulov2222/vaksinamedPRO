import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { request, softRequest, money, fmtDate, isHqRole, type AdminUser } from "../api";
import {
  StateBox,
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  LoadingBlock,
} from "../ui";

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
type AttnTone = "danger" | "warn" | "info";

type AttentionItem = {
  id: string;
  tone: AttnTone;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  body?: ReactNode;
};

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
  onOpenCustomers?: () => void;
  onOpenCashback?: () => void;
  onOpenBranches?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [posSales, setPosSales] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      setError(errText(err, "Ma’lumotlarni yuklab bo‘lmadi."));
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
  const reservedCount = Number(kpis?.reserved || 0);
  const openOrders = Math.max(0, ordersCount - completedCount);
  const zeroAvailable = inventory ? Number(inventory.zeroAvailable || 0) : 0;
  const zeroItems = inventory && Array.isArray(inventory.items)
    ? inventory.items.filter((row: any) => Number(row.available) <= 0)
    : [];
  const hasInventoryAlerts = Boolean(inventory) && (zeroItems.length > 0 || zeroAvailable > 0);

  const attentionItems: AttentionItem[] = [];

  if (hasInventoryAlerts && inventory) {
    const count = zeroAvailable || zeroItems.length;
    attentionItems.push({
      id: "inv-zero",
      tone: "danger",
      title: "Ombor",
      detail: `${count} ta mahsulot mavjud emas`,
      actionLabel: props.onOpenInventory ? "Ombor" : undefined,
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
              .slice(0, 8)
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
      detail: `${openOrders} ta ochiq`,
      actionLabel: props.onOpenOrders ? "Ko‘rish" : undefined,
      onAction: props.onOpenOrders,
    });
  }

  if (deliveringCount > 0) {
    attentionItems.push({
      id: "delivering",
      tone: "info",
      title: "Yetkazib berish",
      detail: `${deliveringCount} ta jarayonda`,
      actionLabel: (props.onOpenDelivery || props.onOpenOrders) ? "Ko‘rish" : undefined,
      onAction: props.onOpenDelivery || props.onOpenOrders,
    });
  }

  if (reservedCount > 0) {
    attentionItems.push({
      id: "reserved",
      tone: "warn",
      title: "Bronlar",
      detail: `${reservedCount} ta rezerv`,
      actionLabel: props.onOpenOrders ? "Ko‘rish" : undefined,
      onAction: props.onOpenOrders,
    });
  }

  const hasAttention = attentionItems.length > 0;
  const hasOrderActivity = recent.length > 0;
  const hasPosActivity = Boolean(posSales && posSales.length > 0);

  const filterControls = (
    <div className="dashboard-controls" role="group" aria-label="Dashboard filtrlari">
      <FilterField label="Sana oralig‘i" hideLabel>
        <select
          className="dash-ctrl dash-ctrl--date"
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
          <FilterField label="Dan" hideLabel>
            <input
              className="dash-ctrl"
              type="date"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
              aria-label="Dan"
            />
          </FilterField>
          <FilterField label="Gacha" hideLabel>
            <input
              className="dash-ctrl"
              type="date"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
              aria-label="Gacha"
            />
          </FilterField>
        </>
      ) : null}
      <FilterField label="Filial" hideLabel>
        {isHq ? (
          <select
            className="dash-ctrl dash-ctrl--branch"
            ref={branchSelectRef}
            id="dash-branch-filter"
            value={branchId}
            aria-label="Filial"
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Barcha filiallar</option>
            {(props.branches || []).map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        ) : (
          <input className="dash-ctrl dash-ctrl--branch" value="O‘z filiali" disabled readOnly aria-label="Filial" />
        )}
      </FilterField>
      <button
        className="btn-secondary dashboard-refresh"
        type="button"
        disabled={loading}
        onClick={() => void load()}
      >
        Yangilash
      </button>
    </div>
  );

  const showBottom = hasAttention || hasOrderActivity;

  return (
    <div className={`dashboard${revenue === 0 && ordersCount === 0 ? " dashboard--zero" : ""}`}>
      <AdminPageHeader
        className="dashboard-header"
        title="Dashboard"
        actions={filterControls}
      />

      {loading && !data ? (
        <LoadingBlock rows={3} label="Yuklanmoqda…" />
      ) : (
        <StateBox
          loading={false}
          error={error || null}
          empty={!kpis}
          emptyText="Ma’lumot yo‘q"
          onRetry={() => void load()}
        >
          {/* Single operations board — not stacked empty cards */}
          <section className="dash-board" aria-label="Operatsion holat">
            <div className="dash-board-main">
              <div className="dash-rev" aria-label="Savdo">
                <div className="dash-kicker">Savdo</div>
                <div className="dash-rev-value">{money(revenue)}</div>
                <div className="dash-rev-meta">{presetLabel(preset)}</div>
              </div>
              <div className="dash-ord" aria-label="Buyurtmalar">
                <div className="dash-ord-head">
                  <div className="dash-kicker">Buyurtmalar</div>
                  <div className="dash-ord-total">
                    <span className="dash-ord-total-n">{ordersCount}</span>
                  </div>
                </div>
                <dl className="dash-ord-snap">
                  <div>
                    <dt>Yetkazilmoqda</dt>
                    <dd className="is-info">{deliveringCount}</dd>
                  </div>
                  <div>
                    <dt>Yakunlangan</dt>
                    <dd className="is-ok">{completedCount}</dd>
                  </div>
                  <div>
                    <dt>Rezerv</dt>
                    <dd>{reservedCount}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="dash-board-metrics" aria-label="Asosiy ko‘rsatkichlar">
              {props.onOpenCustomers ? (
                <button type="button" className="dash-metric dash-metric--btn" onClick={props.onOpenCustomers}>
                  <span className="dash-metric-label">Mijozlar</span>
                  <span className="dash-metric-value">{Number(kpis?.customers || 0)}</span>
                </button>
              ) : (
                <div className="dash-metric">
                  <span className="dash-metric-label">Mijozlar</span>
                  <span className="dash-metric-value">{Number(kpis?.customers || 0)}</span>
                </div>
              )}
              {props.onOpenCashback ? (
                <button type="button" className="dash-metric dash-metric--btn dash-metric--cash" onClick={props.onOpenCashback}>
                  <span className="dash-metric-label">Cashback</span>
                  <span className="dash-metric-value">{money(Number(kpis?.cashback || 0))}</span>
                </button>
              ) : (
                <div className="dash-metric dash-metric--cash">
                  <span className="dash-metric-label">Cashback</span>
                  <span className="dash-metric-value">{money(Number(kpis?.cashback || 0))}</span>
                </div>
              )}
              {props.onOpenBranches ? (
                <button type="button" className="dash-metric dash-metric--btn" onClick={props.onOpenBranches}>
                  <span className="dash-metric-label">Filiallar</span>
                  <span className="dash-metric-value">{Number(kpis?.branches || 0)}</span>
                </button>
              ) : (
                <div className="dash-metric">
                  <span className="dash-metric-label">Filiallar</span>
                  <span className="dash-metric-value">{Number(kpis?.branches || 0)}</span>
                </div>
              )}
              <div className="dash-metric dash-metric--soft">
                <span className="dash-metric-label">Bronlar</span>
                <span className="dash-metric-value">{reservedCount}</span>
              </div>
              {!hasAttention ? (
                <p className="dash-status" role="status">
                  <span aria-hidden>✓</span> Muammo yo‘q
                </p>
              ) : null}
            </div>
          </section>

          {showBottom ? (
            <div
              className={`dash-bottom${hasOrderActivity && hasAttention ? " dash-bottom--split" : ""}${hasAttention ? " dash-bottom--alert" : ""}`}
            >
              {hasAttention ? (
                <section className="attn" aria-label="E’tibor">
                  <h2 className="attn-title">E’tibor</h2>
                  <ul className="attn-rows">
                    {attentionItems.map((item) => (
                      <li key={item.id} className={`attn-row attn-${item.tone}`}>
                        <div className="attn-row-main">
                          <div className="attn-row-copy">
                            <div className="attn-row-title">{item.title}</div>
                            <div className="attn-row-detail">{item.detail}</div>
                          </div>
                          {item.actionLabel && item.onAction ? (
                            <button className="btn-tertiary" type="button" onClick={item.onAction}>
                              {item.actionLabel}
                            </button>
                          ) : null}
                        </div>
                        {item.body ? <div className="attn-row-body">{item.body}</div> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {hasOrderActivity ? (
                <section className="act" aria-label="Oxirgi buyurtmalar">
                  <div className="act-head">
                    <h2 className="act-title">Oxirgi buyurtmalar</h2>
                    {props.onOpenOrders ? (
                      <button className="btn-tertiary" type="button" onClick={props.onOpenOrders}>
                        Barchasi →
                      </button>
                    ) : null}
                  </div>
                  <DataTable sticky>
                    <thead>
                      <tr>
                        <th>Vaqt</th>
                        <th>Buyurtma</th>
                        <th>Mijoz</th>
                        <th className="num">Summa</th>
                        <th>Holat</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((item: any) => (
                        <tr key={item.id}>
                          <td className="meta">{fmtDate(item.createdAt)}</td>
                          <td className="mono-cell">{item.code}</td>
                          <td>{customerName(item)}</td>
                          <td className="num money-md">{money(Number(item.total || 0))}</td>
                          <td>
                            <StatusLabelBadge
                              domain="fulfillment"
                              status={item.fulfillmentStatus || item.status || ""}
                            />
                          </td>
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
                </section>
              ) : null}
            </div>
          ) : null}

          {hasPosActivity ? (
            <section className="act act--pos" aria-label="Kassa">
              <div className="act-head">
                <h2 className="act-title">Kassa</h2>
                {props.onOpenPos ? (
                  <button className="btn-tertiary" type="button" onClick={props.onOpenPos}>
                    Kassaga →
                  </button>
                ) : null}
              </div>
              <DataTable sticky>
                <thead>
                  <tr>
                    <th>Vaqt</th>
                    <th>Chek</th>
                    <th>Mijoz</th>
                    <th>Filial</th>
                    <th className="num">Summa</th>
                    <th className="num">Cashback</th>
                  </tr>
                </thead>
                <tbody>
                  {(posSales || []).map((row: any, idx: number) => (
                    <tr key={row.id || row.receiptId || idx}>
                      <td className="meta">{fmtDate(row.createdAt || row.soldAt)}</td>
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
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </section>
          ) : null}
        </StateBox>
      )}
    </div>
  );
}
