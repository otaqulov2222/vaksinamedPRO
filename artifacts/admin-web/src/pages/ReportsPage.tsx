import { useEffect, useMemo, useState } from "react";
import { request, money, isHqRole, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  ErrorState,
  LoadingBlock,
  FeedbackBanner,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

type Preset = "today" | "yesterday" | "7d" | "30d" | "all" | "custom";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Hisobotlarni ko‘rish uchun ruxsat yo‘q.";
  if (status === 400) return err instanceof Error ? err.message : "Filtr noto‘g‘ri.";
  return err instanceof Error ? err.message : fallback;
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
  if (preset === "all") return "Barcha davr";
  return "Maxsus sana";
}

/** Deep reports not backed by a dedicated reporting API. */
const DEEP_REPORTS: Array<{ title: string; detail: string }> = [
  { title: "Mahsulot / kategoriya kesimi", detail: "SKU bo‘yicha savdo hisoboti." },
  { title: "Filial reytingi", detail: "Filiallar bo‘yicha taqqoslash agregati." },
  { title: "Vaqt qatori (trend)", detail: "Kunlik/oylik grafik uchun time-series." },
  { title: "Eksport (CSV / Excel)", detail: "Rasmiy yuklab olish." },
  { title: "To‘lov muvaffaqiyati", detail: "Provider / success rate agregati." },
  { title: "Yetkazib berish SLA", detail: "ETA / kuryer ishlashi." },
  { title: "Ombor aylanmasi", detail: "Turnover / valuation." },
  { title: "Cashback EARN / USE kesimi", detail: "Global ledger kesimi — mijoz tarixidan." },
];

export function ReportsPage(props: {
  token: string;
  user: AdminUser | null;
  branches: any[];
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<Preset>("today");
  const [branchId, setBranchId] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const isHq = Boolean(props.user && isHqRole(props.user.role));

  const dateBounds = useMemo(() => {
    const today = new Date();
    if (preset === "all") return { from: "", to: "" };
    if (preset === "custom") return { from: createdFrom, to: createdTo };
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
    } catch (err) {
      setData(null);
      setError(errText(err, "Hisobotlarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, branchId, dateBounds.from, dateBounds.to]);

  const kpis = data?.kpis;
  const filters = data?.filters;
  const periodText = presetLabel(preset);
  const branchLabel = (() => {
    if (!isHq) return "O‘z filiali";
    if (!branchId) return "Barcha filiallar";
    return props.branches.find((b) => String(b.id) === branchId)?.name || `Filial #${branchId}`;
  })();

  const orderRows = kpis
    ? [
        {
          key: "revenue",
          label: "Tushum (yakunlangan)",
          value: money(Number(kpis.revenue || 0)),
          note: "Buyurtma davri / filial filtri",
        },
        {
          key: "orders",
          label: "Buyurtmalar",
          value: String(Number(kpis.orders || 0)),
          note: "Tanlangan davr",
        },
        {
          key: "completed",
          label: "Yakunlangan",
          value: String(Number(kpis.completed || 0)),
          note: "Tanlangan davr",
        },
        {
          key: "delivering",
          label: "Yetkazilayotgan",
          value: String(Number(kpis.delivering || 0)),
          note: "Tanlangan davr",
        },
        {
          key: "reserved",
          label: "Bronlar",
          value: String(Number(kpis.reserved || 0)),
          note: "Tanlangan davr",
        },
      ]
    : [];

  const globalRows = kpis
    ? [
        {
          key: "customers",
          label: "Mijozlar",
          value: String(Number(kpis.customers || 0)),
          note: "Global — sana filtriga bog‘liq emas",
        },
        {
          key: "cashback",
          label: "Cashback majburiyati",
          value: money(Number(kpis.cashback || 0)),
          note: "Global hisob balansi",
        },
        {
          key: "branches",
          label: "Filiallar",
          value: String(Number(kpis.branches || 0)),
          note: "Global — sana filtriga bog‘liq emas",
        },
      ]
    : [];

  return (
    <div className="reports-page page-module">
      <AdminPageHeader
        title="Hisobotlar"
        description={PAGE_DESCRIPTIONS.reports}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <FeedbackBanner tone="info">
        Bu sahifa Dashboard agregatlaridan olingan cheklangan snapshot.
        Chuqur analitika / grafik / eksport hali ulanmagan.
      </FeedbackBanner>

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Davr">
            <select
              value={preset}
              aria-label="Davr"
              onChange={(e) => setPreset(e.target.value as Preset)}
            >
              <option value="today">Bugun</option>
              <option value="yesterday">Kecha</option>
              <option value="7d">7 kun</option>
              <option value="30d">30 kun</option>
              <option value="all">Barcha davr</option>
              <option value="custom">Maxsus sana</option>
            </select>
          </FilterField>
          {preset === "custom" ? (
            <>
              <FilterField label="Dan">
                <input
                  type="date"
                  value={createdFrom}
                  onChange={(e) => setCreatedFrom(e.target.value)}
                  aria-label="Dan"
                />
              </FilterField>
              <FilterField label="Gacha">
                <input
                  type="date"
                  value={createdTo}
                  onChange={(e) => setCreatedTo(e.target.value)}
                  aria-label="Gacha"
                />
              </FilterField>
            </>
          ) : null}
          {isHq ? (
            <FilterField label="Filial">
              <select
                value={branchId}
                aria-label="Filial"
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Barcha filiallar</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </FilterField>
          ) : (
            <FilterField label="Filial">
              <input value="O‘z filiali" disabled readOnly aria-label="Filial" />
            </FilterField>
          )}
        </div>
        <p className="meta crm-controls-note">
          Davr va filial serverda qo‘llanadi (Asia/Tashkent).
          Buyurtma ko‘rsatkichlari filtrlangan; mijoz / cashback / filial soni — global.
        </p>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !data ? <LoadingBlock rows={3} /> : null}

      {!error && data && kpis ? (
        <>
          <div className="crm-context">
            <span className="crm-result-count">Mavjud snapshot</span>
            <span className="crm-context-hint">{periodText}</span>
            <span className="crm-context-hint">{branchLabel}</span>
            {filters?.timezone ? (
              <span className="crm-context-hint">{String(filters.timezone)}</span>
            ) : null}
          </div>

          <div className="crm-surface surface-table">
            <div className="reports-section-label">Buyurtma bo‘yicha (filtrlangan)</div>
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Ko‘rsatkich</th>
                  <th className="num">Qiymat</th>
                  <th className="reports-col-note">Izoh</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div className="crm-name">{row.label}</div>
                    </td>
                    <td className="num money-md">{row.value}</td>
                    <td className="reports-col-note">
                      <span className="meta">{row.note}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>

          <div className="crm-surface surface-table reports-global-surface">
            <div className="reports-section-label">Global holat (sana filtriga bog‘liq emas)</div>
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Ko‘rsatkich</th>
                  <th className="num">Qiymat</th>
                  <th className="reports-col-note">Izoh</th>
                </tr>
              </thead>
              <tbody>
                {globalRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div className="crm-name">{row.label}</div>
                    </td>
                    <td className="num money-md">{row.value}</td>
                    <td className="reports-col-note">
                      <span className="meta">{row.note}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>

          <section className="reports-deep" aria-label="Hali ulanmagan hisobotlar">
            <h2 className="reports-deep-title">Hali ulanmagan hisobotlar</h2>
            <p className="meta reports-deep-lead">
              Quyidagi chuqur hisobotlar uchun alohida API yo‘q. Bu yerda invent qilinmaydi.
            </p>
            <ul className="reports-deep-list">
              {DEEP_REPORTS.map((item) => (
                <li key={item.title} className="reports-deep-item">
                  <div className="reports-deep-row">
                    <span className="reports-deep-name">{item.title}</span>
                    <StatusBadge tone="warn">Hali ulanmagan</StatusBadge>
                  </div>
                  <p className="meta">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {!error && !loading && !kpis ? (
        <div className="crm-empty crm-empty-idle">
          <div className="empty-title">Hisobot ma'lumotlari mavjud emas.</div>
          <p className="empty-desc">Dashboard agregatlari yuklanmadi.</p>
        </div>
      ) : null}
    </div>
  );
}
