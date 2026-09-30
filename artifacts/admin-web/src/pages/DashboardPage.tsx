import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Package,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Store,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { request, softRequest, money, isHqRole, type AdminUser } from "../api";
import {
  StateBox,
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  fulfillmentLabel,
} from "../ui";
import { actionLabel } from "./AuditPage";
import { UZ_MAP_H, UZ_MAP_W, UZ_REGIONS, projectUz } from "../data/uzRegions";

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

function parseYmd(value: string): Date | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function shiftDays(base: Date, delta: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

function salesLabel(preset: Preset): string {
  if (preset === "today") return "Bugungi savdo";
  if (preset === "yesterday") return "Kechagi savdo";
  if (preset === "7d") return "7 kunlik savdo";
  if (preset === "30d") return "30 kunlik savdo";
  if (preset === "all") return "Umumiy savdo";
  return "Tanlangan davr savdosi";
}

function compareLabel(preset: Preset): string {
  if (preset === "today") return "kechaga nisbatan";
  if (preset === "yesterday") return "oldingi kunga nisbatan";
  if (preset === "7d") return "oldingi 7 kunga nisbatan";
  return "oldingi 30 kunga nisbatan";
}

const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];
const UZ_WEEKDAYS_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

function dayLabel(value: string): string {
  const d = parseYmd(value);
  if (!d) return value;
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function shortDay(value: string): string {
  const d = parseYmd(value);
  if (!d) return value;
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()].slice(0, 3)}`;
}

function periodText(bounds: { from: string; to: string }): string {
  if (!bounds.from && !bounds.to) return "Butun davr";
  if (bounds.from && bounds.to && bounds.from === bounds.to) return dayLabel(bounds.from);
  if (bounds.from && bounds.to) return `${dayLabel(bounds.from)} — ${dayLabel(bounds.to)}`;
  return bounds.from ? `${dayLabel(bounds.from)} dan` : `${dayLabel(bounds.to)} gacha`;
}

function clockLabel(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function compactMoney(value: number): string {
  const v = Math.abs(value);
  if (v >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(".", ",")} mlrd`;
  if (v >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} mln`;
  if (v >= 1_000) return `${Math.round(value / 1_000)} ming`;
  return String(Math.round(value));
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.min(100, (n / total) * 100) : 0;
}

/** Rounds the chart ceiling up to 1 / 2 / 2.5 / 5 × 10ⁿ so gridline labels read cleanly. */
function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(value));
  const n = value / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const GRID_STEPS = [1, 0.5, 0];

type DayPoint = { date: string; revenue: number; orders: number };
type LoadState = "loading" | "ready" | "error";

function SalesChart(props: { points: DayPoint[]; state: LoadState; focusDate: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = props.points;
  let max = 0;
  for (const p of pts) max = Math.max(max, p.revenue);
  const hasData = props.state === "ready" && max > 0;
  const top = niceCeil(max);
  const n = Math.max(1, pts.length);
  const barHeight = (v: number) => (hasData && v > 0 ? Math.max(2, (v / top) * 100) : 0);
  const active = hover != null ? pts[hover] : null;

  return (
    <div className={`sales-chart is-${props.state}${hasData ? " has-scale" : " is-empty"}`}>
      <div className="sales-chart-plot">
        <div className="sales-chart-grid" aria-hidden="true">
          {GRID_STEPS.map((f) => (
            <span key={f} className="sales-chart-gridline" style={{ bottom: `${f * 100}%` }}>
              {hasData ? <span className="sales-chart-tick">{f === 0 ? "0" : compactMoney(top * f)}</span> : null}
            </span>
          ))}
        </div>
        {props.state !== "error" ? (
        <div className="sales-bars">
          {props.state === "loading"
            ? Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="sales-bar is-skeleton" aria-hidden="true">
                  <span className="sales-bar-fill" />
                </span>
              ))
            : pts.map((p, i) => {
                const focus = p.date === props.focusDate ? " is-focus" : "";
                if (!hasData) {
                  return (
                    <span key={p.date} className={`sales-bar sales-chart-zero${focus}`} aria-hidden="true">
                      <span className="sales-bar-fill" />
                    </span>
                  );
                }
                return (
                  <button
                    key={p.date}
                    type="button"
                    className={`sales-bar${focus}${hover === i ? " is-hover" : ""}${p.revenue > 0 ? "" : " is-zero"}`}
                    aria-label={`${dayLabel(p.date)}: ${money(p.revenue)}, ${p.orders} ta buyurtma`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  >
                    <span className="sales-bar-fill" style={{ height: `${barHeight(p.revenue)}%` }} />
                  </button>
                );
              })}
        </div>
        ) : null}
        {active && hover != null ? (
          <div
            className={`sales-chart-tip${hover > n - 3 ? " is-left" : ""}`}
            style={{ left: `${((hover + 0.5) / n) * 100}%`, top: `${100 - barHeight(active.revenue)}%` }}
            role="tooltip"
          >
            <span className="sales-chart-tip-date">{dayLabel(active.date)}</span>
            <strong>{money(active.revenue)}</strong>
            <span>{active.orders} ta buyurtma</span>
          </div>
        ) : null}
        {!hasData ? (
          <p className="sales-chart-empty" role="status">
            {props.state === "loading" ? (
              <span>Dinamika yuklanmoqda…</span>
            ) : props.state === "error" ? (
              <>
                <strong>Dinamika yuklanmadi</strong>
                <span>Kunlik ma’lumotni olishda xatolik bo‘ldi.</span>
              </>
            ) : (
              <>
                <strong>Ma’lumot yetarli emas</strong>
                <span>So‘nggi 7 kunda yakunlangan savdo qayd etilmagan.</span>
              </>
            )}
          </p>
        ) : null}
      </div>
      {props.state === "ready" ? (
        <div className="sales-chart-axis" aria-hidden="true">
          {pts.map((p) => {
            const d = parseYmd(p.date);
            return (
              <span key={p.date} className={p.date === props.focusDate ? "is-focus" : undefined}>
                {d ? `${UZ_WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}` : p.date}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type Segment = { key: string; label: string; value: number; tone: "ok" | "info" | "warn" | "muted" };

function OrdersStack(props: { total: number; segments: Segment[] }) {
  const visible = props.segments.filter((s) => s.value > 0);
  return (
    <div
      className={`orders-stack${props.total > 0 ? "" : " is-empty"}`}
      role="img"
      aria-label={
        props.total > 0
          ? `Holatlar bo‘yicha: ${visible.map((s) => `${s.label} ${s.value}`).join(", ")}`
          : "Buyurtmalar yo‘q"
      }
    >
      {props.total > 0
        ? visible.map((s) => (
            <span key={s.key} className={`orders-stack-seg is-${s.tone}`} style={{ flexGrow: s.value }} />
          ))
        : null}
    </div>
  );
}

type NetworkBranch = {
  id: number;
  name: string;
  region: string;
  lat: number;
  lng: number;
  isOpen: boolean;
  is24h: boolean;
};

type RegionStat = {
  iso: string;
  name: string;
  n: number;
  open: number;
  h24: number;
  share: number;
  names: string[];
  ids: number[];
  level: number;
};

type MapPin = {
  iso: string;
  name: string;
  n: number;
  badge: number;
  label: boolean;
  ax: number;
  ay: number;
  x: number;
  y: number;
  w: number;
  top: number;
  bottom: number;
};

const REGION_KEYS: Record<string, string> = {
  qoraqalpogiston: "UZ-QR",
  karakalpakstan: "UZ-QR",
  xorazm: "UZ-XO",
  khorezm: "UZ-XO",
  navoiy: "UZ-NW",
  navoi: "UZ-NW",
  buxoro: "UZ-BU",
  bukhara: "UZ-BU",
  samarqand: "UZ-SA",
  samarkand: "UZ-SA",
  qashqadaryo: "UZ-QA",
  kashkadarya: "UZ-QA",
  surxondaryo: "UZ-SU",
  surkhandarya: "UZ-SU",
  jizzax: "UZ-JI",
  jizzakh: "UZ-JI",
  sirdaryo: "UZ-SI",
  syrdarya: "UZ-SI",
  namangan: "UZ-NG",
  andijon: "UZ-AN",
  andijan: "UZ-AN",
  fargona: "UZ-FA",
  fergana: "UZ-FA",
};

/** Maps a free-text branch region to its ISO 3166-2 code; Toshkent alone means the city. */
function regionIso(name: string): string | null {
  const s = name.toLowerCase().replace(/[‘’ʻʼ'`]/g, "").replace(/\s+/g, " ").trim();
  if (/^(toshkent|tashkent)( (shahri|sh\.?|city))?$/.test(s)) return "UZ-TK";
  if (/^(toshkent|tashkent) (viloyati|vil\.?|region|oblast)$/.test(s)) return "UZ-TO";
  return REGION_KEYS[s.replace(/ (viloyati|vil\.?|region|oblast|respublikasi)$/, "")] ?? null;
}

function regionAt(x: number, y: number): string | null {
  for (const r of UZ_REGIONS) {
    let inside = false;
    for (const ring of r.rings) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const xi = ring[i];
        const yi = ring[i + 1];
        const xj = ring[j];
        const yj = ring[j + 1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return r.iso;
  }
  return null;
}

const REGION_PATHS = new Map(
  UZ_REGIONS.map((r) => [
    r.iso,
    r.rings
      .map((ring) => {
        let d = "";
        for (let i = 0; i < ring.length; i += 2) d += `${i ? "L" : "M"}${ring[i]} ${ring[i + 1]}`;
        return `${d}Z`;
      })
      .join(""),
  ]),
);

function regionStats(branches: NetworkBranch[], total: number) {
  const byIso = new Map<string, RegionStat>();
  const dots: { id: number; x: number; y: number; iso: string | null }[] = [];
  let unplaced = 0;
  for (const b of branches) {
    const hasPoint = Number.isFinite(b.lat) && Number.isFinite(b.lng) && b.lat !== 0 && b.lng !== 0;
    const [x, y] = hasPoint ? projectUz(b.lng, b.lat) : [0, 0];
    const iso = regionIso(b.region) ?? (hasPoint ? regionAt(x, y) : null);
    if (hasPoint) dots.push({ id: b.id, x, y, iso });
    if (!iso) {
      unplaced += 1;
      continue;
    }
    const s =
      byIso.get(iso) ||
      ({ iso, name: UZ_REGIONS.find((r) => r.iso === iso)?.name || b.region, n: 0, open: 0, h24: 0, share: 0, names: [], ids: [], level: 0 } as RegionStat);
    s.n += 1;
    if (b.isOpen) s.open += 1;
    if (b.is24h) s.h24 += 1;
    if (b.name) s.names.push(b.name);
    s.ids.push(b.id);
    byIso.set(iso, s);
  }
  let maxN = 0;
  for (const s of byIso.values()) maxN = Math.max(maxN, s.n);
  for (const s of byIso.values()) {
    s.share = Math.round(pct(s.n, total || branches.length));
    s.level = Math.min(4, Math.max(1, Math.ceil((4 * Math.log(s.n + 1)) / Math.log(maxN + 1))));
  }
  return { byIso, dots, maxN, unplaced };
}

/** Places count pins + names in real pixels and nudges them apart; displaced pins get a leader line. */
function layoutPins(byIso: Map<string, RegionStat>, maxN: number, W: number, H: number): MapPin[] {
  const k = W / UZ_MAP_W;
  const compact = W < 560;
  const cw = compact ? 5.5 : 6.2;
  const lh = compact ? 13 : 15;
  const rank = [...byIso.values()].sort((a, b) => b.n - a.n).map((s) => s.iso);
  const pins = UZ_REGIONS.map((r): MapPin => {
    const n = byIso.get(r.iso)?.n || 0;
    const label = !compact || (n > 0 && rank.indexOf(r.iso) < 3);
    const badge = n ? Math.round((compact ? 18 : 22) + (compact ? 6 : 10) * Math.sqrt(n / Math.max(1, maxN))) : 0;
    const ax = r.lx * k;
    const ay = r.ly * k;
    return {
      iso: r.iso,
      name: r.name,
      n,
      badge,
      label,
      ax,
      ay,
      x: ax,
      y: ay,
      w: label ? Math.max(badge, r.name.length * cw + 6) : badge,
      top: n ? badge / 2 : lh / 2,
      bottom: n ? badge / 2 + (label ? 2 + lh : 0) : lh / 2,
    };
  }).filter((p) => p.n > 0 || p.label);
  const box = (p: MapPin) => [p.x - p.w / 2 - 3, p.y - p.top - 3, p.x + p.w / 2 + 3, p.y + p.bottom + 3] as const;
  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i];
        const b = pins[j];
        const A = box(a);
        const B = box(b);
        const ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]);
        const oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const wa = a.n && !b.n ? 0.3 : !a.n && b.n ? 0.7 : 0.5;
        if (ox < oy) {
          const dir = a.x <= b.x ? -1 : 1;
          a.x += dir * (ox + 0.5) * wa;
          b.x -= dir * (ox + 0.5) * (1 - wa);
        } else {
          const dir = a.y <= b.y ? -1 : 1;
          a.y += dir * (oy + 0.5) * wa;
          b.y -= dir * (oy + 0.5) * (1 - wa);
        }
      }
    }
    for (const p of pins) {
      if (iter < 250) {
        p.x += (p.ax - p.x) * 0.02;
        p.y += (p.ay - p.y) * 0.02;
      }
      p.x = Math.min(W - p.w / 2 - 2, Math.max(p.w / 2 + 2, p.x));
      p.y = Math.min(H - p.bottom - 2, Math.max(p.top + 2, p.y));
    }
    if (!moved && iter > 250) break;
  }
  return pins;
}

function regionAria(s: RegionStat): string {
  return `${s.name}: ${s.n} filial, tarmoqning ${s.share}%, ${s.open} ochiq, ${s.h24} ta 24 soat`;
}

function NetworkMap(props: {
  branches: NetworkBranch[];
  total: number;
  open: number;
  selectedId: string;
  pinned: string | null;
  onPin: (iso: string | null) => void;
  children?: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stats = useMemo(() => regionStats(props.branches, props.total), [props.branches, props.total]);
  const height = Math.round((width * UZ_MAP_H) / UZ_MAP_W);
  const pins = useMemo(
    () => (width > 0 ? layoutPins(stats.byIso, stats.maxN, width, height) : []),
    [stats, width, height],
  );
  const { pinned, onPin } = props;
  const toggle = (iso: string) => onPin(pinned === iso ? null : iso);
  const selectedId = props.selectedId ? Number(props.selectedId) : null;
  const focusIso = hover ?? pinned;
  const focus = focusIso ? stats.byIso.get(focusIso) || null : null;
  const ranked = [...stats.byIso.values()].sort((a, b) => b.n - a.n);
  const leader = ranked[0] || null;
  const levels = [1, 2, 3, 4].map((lv) => ranked.filter((s) => s.level === lv).map((s) => s.n));
  const dotR = width > 0 ? 2.4 / (width / UZ_MAP_W) : 2.4;
  const tipRegion = hover ? UZ_REGIONS.find((r) => r.iso === hover) || null : null;
  const tipPin = hover ? pins.find((p) => p.iso === hover) || null : null;
  const tipStat = hover ? stats.byIso.get(hover) || null : null;
  const h24Total = props.branches.filter((b) => b.is24h).length;

  return (
    <>
      <figure className="dash-network-map">
      <div className={`network-stage${focusIso ? " has-focus" : ""}`} ref={stageRef} onMouseLeave={() => setHover(null)}>
        <svg className="network-map" viewBox={`0 0 ${UZ_MAP_W} ${UZ_MAP_H}`} aria-hidden="true">
          {UZ_REGIONS.map((r) => {
            const s = stats.byIso.get(r.iso);
            const isSelected = selectedId != null && Boolean(s?.ids.includes(selectedId));
            return (
              <path
                key={r.iso}
                d={REGION_PATHS.get(r.iso)}
                fillRule="evenodd"
                className={`network-region is-l${s?.level || 0}${r.iso === focusIso ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseEnter={() => setHover(r.iso)}
                onClick={s ? () => toggle(r.iso) : undefined}
              />
            );
          })}
          {focusIso ? <path className="network-region-outline" d={REGION_PATHS.get(focusIso)} fillRule="evenodd" /> : null}
          {stats.dots.map((d) => (
            <circle
              key={d.id}
              className={`network-dot${d.iso && d.iso === focusIso ? " is-active" : ""}`}
              cx={Math.round(d.x * 10) / 10}
              cy={Math.round(d.y * 10) / 10}
              r={dotR}
            />
          ))}
        </svg>
        {width > 0 ? (
          <svg className="network-leaders" width={width} height={height} aria-hidden="true">
            {pins
              .filter((p) => p.n && Math.hypot(p.x - p.ax, p.y - p.ay) > 10)
              .map((p) => (
                <g key={p.iso}>
                  <line x1={p.ax} y1={p.ay} x2={p.x} y2={p.y} />
                  <circle className="network-anchor" cx={p.ax} cy={p.ay} r={p.iso === "UZ-TK" ? 5 : 3} />
                </g>
              ))}
          </svg>
        ) : null}
        <div className="network-pins">
          {pins.map((p) => {
            const s = stats.byIso.get(p.iso);
            if (!s) {
              return (
                <span key={p.iso} className="network-pin is-idle" style={{ left: p.x, top: p.y }} aria-hidden="true">
                  <span className="network-pin-name">{p.name}</span>
                </span>
              );
            }
            return (
              <button
                key={p.iso}
                type="button"
                className={`network-pin${p.iso === focusIso ? " is-active" : ""}${p.iso === pinned ? " is-pinned" : ""}`}
                style={{ left: p.x, top: p.y, "--b": `${p.badge}px` } as CSSProperties}
                aria-label={regionAria(s)}
                aria-pressed={p.iso === pinned}
                onMouseEnter={() => setHover(p.iso)}
                onFocus={() => setHover(p.iso)}
                onBlur={() => setHover(null)}
                onClick={() => toggle(p.iso)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onPin(null);
                }}
              >
                <span className="network-pin-badge">{s.n}</span>
                {p.label ? <span className="network-pin-name">{p.name}</span> : null}
              </button>
            );
          })}
        </div>
        {tipRegion && width > 0 ? (
          <div
            className={`network-tip${(tipPin?.x ?? tipRegion.lx * (width / UZ_MAP_W)) > width * 0.75 ? " is-end" : ""}`}
            role="tooltip"
            style={{
              left: tipPin?.x ?? tipRegion.lx * (width / UZ_MAP_W),
              top: (tipPin?.y ?? tipRegion.ly * (width / UZ_MAP_W)) - (tipPin?.badge ? tipPin.badge / 2 : 8) - 8,
            }}
          >
            <strong>{tipRegion.name}</strong>
            <span>{tipStat ? `${tipStat.n} filial · ${tipStat.share}%` : "Filial yo‘q"}</span>
          </div>
        ) : null}
      </div>

      <div className="network-legend">
        <span className="network-legend-group">
          <span>Filiallar soni</span>
          <span className="network-legend-scale" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((lv) => (
              <span key={lv} className={`network-legend-swatch is-l${lv}`} />
            ))}
          </span>
          <b>
            0 · {levels.flat().length ? `${Math.min(...levels.flat())}–${stats.maxN}` : "—"}
          </b>
        </span>
        <span className="network-legend-group">
          <span className="network-legend-dot" aria-hidden="true" />
          Filial joylashuvi
        </span>
        <span className="network-legend-note">Chegaralar: © OpenStreetMap</span>
      </div>
      </figure>

      <aside className="network-rail" aria-label="Tarmoq tahlili">
      <div className="network-band" aria-live="polite">
        <div className="network-band-title">
          <span className="network-band-k">{focus ? "Hudud" : "Butun tarmoq"}</span>
          <strong className="network-band-name">{focus ? focus.name : "O‘zbekiston"}</strong>
        </div>
        <dl className="network-band-stats">
          <div className="is-lead">
            <dt>Filial</dt>
            <dd>{focus ? focus.n : props.total}</dd>
          </div>
          <div>
            <dt>Ochiq</dt>
            <dd>{focus ? focus.open : props.open}</dd>
          </div>
          <div>
            <dt>24/7</dt>
            <dd>{focus ? focus.h24 : h24Total}</dd>
          </div>
          {focus ? (
            <div>
              <dt>Ulush</dt>
              <dd>{focus.share}%</dd>
            </div>
          ) : (
            <div>
              <dt>Hudud</dt>
              <dd>
                {stats.byIso.size}/{UZ_REGIONS.length}
              </dd>
            </div>
          )}
        </dl>
        <p className="network-band-note">
          {focus
            ? `${focus.names.slice(0, 3).join(", ")}${focus.names.length > 3 ? ` va yana ${focus.names.length - 3} ta` : ""}`
            : leader
              ? `${leader.name} — tarmoqning ${leader.share}%. Hududni xaritada tanlang.`
              : "Hududni xaritada tanlang."}
          {!focus && stats.unplaced ? ` ${stats.unplaced} filial hududi aniqlanmadi.` : ""}
        </p>
        {pinned ? (
          <button type="button" className="network-band-reset" onClick={() => onPin(null)}>
            Barcha hududlar
          </button>
        ) : null}
      </div>
      {props.children}
      </aside>
    </>
  );
}

type KpiAccent = "orders" | "cash" | "network";

function DashMetric(props: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  caption: string;
  icon: LucideIcon;
  accent: KpiAccent;
  detail?: ReactNode;
  onOpen?: () => void;
}) {
  const Icon = props.icon;
  const className = `dash-kpi dash-kpi--${props.accent}${props.onOpen ? " dash-kpi--btn" : ""}`;
  const body = (
    <>
      <span className="dash-kpi-top">
        <Icon className="dash-kpi-icon" size={14} strokeWidth={2} aria-hidden="true" />
        <span className="dash-kpi-label">{props.label}</span>
        {props.onOpen ? <ArrowUpRight className="dash-kpi-go" size={14} strokeWidth={2} aria-hidden="true" /> : null}
      </span>
      <span className="dash-kpi-figure">
        <span className="dash-kpi-value">{props.value}</span>
        {props.unit ? <span className="dash-kpi-unit">{props.unit}</span> : null}
      </span>
      <span className="dash-kpi-caption">{props.caption}</span>
      {props.detail ? <span className="dash-kpi-detail">{props.detail}</span> : null}
    </>
  );
  return props.onOpen ? (
    <button type="button" className={className} onClick={props.onOpen}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

const PERIODS: Array<[Preset, string]> = [
  ["today", "Bugun"],
  ["yesterday", "Kecha"],
  ["7d", "7 kun"],
  ["30d", "30 kun"],
  ["all", "Barchasi"],
  ["custom", "Maxsus"],
];

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

const FEED_KIND_LABEL: Record<FeedItem["kind"], string> = {
  order: "Buyurtma",
  pos: "Kassa",
  audit: "Tizim",
};

type FeedItem = {
  key: string;
  at: Date;
  kind: "order" | "pos" | "audit";
  icon: LucideIcon;
  title: string;
  detail: string;
};

function feedIcon(entity: string): LucideIcon {
  if (entity === "order") return ShoppingBag;
  if (entity === "product") return Package;
  if (entity === "product_stock") return Boxes;
  if (entity === "branch") return Store;
  return Activity;
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
  onOpenCustomers?: () => void;
  onOpenCashback?: () => void;
  onOpenBranches?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [posSales, setPosSales] = useState<any[] | null>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [days, setDays] = useState<DayPoint[]>([]);
  const [daysState, setDaysState] = useState<LoadState>("loading");
  const [prevRevenue, setPrevRevenue] = useState<number | null>(null);
  const loadSeq = useRef(0);

  const [preset, setPreset] = useState<Preset>("today");
  const [branchId, setBranchId] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const branchSelectRef = useRef<HTMLSelectElement>(null);

  const canPosSales = (props.permissions || []).includes("pos:sales:read");
  const canAudit = (props.permissions || []).includes("audit:read");
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

  const anchorDay = useMemo(() => {
    const parsed = dateBounds.to ? parseYmd(dateBounds.to) : null;
    return parsed || new Date();
  }, [dateBounds.to]);

  function dashboardPath(from: string, to: string) {
    const qs = new URLSearchParams();
    if (branchId) qs.set("branchId", branchId);
    if (from) qs.set("createdFrom", from);
    if (to) qs.set("createdTo", to);
    const suffix = qs.toString() ? `?${qs}` : "";
    return `/api/admin/dashboard${suffix}`;
  }

  /** Daily revenue for the 7 days ending at the period end — one existing-endpoint call per day. */
  async function loadDynamics(seq: number) {
    setDaysState("loading");
    setPrevRevenue(null);
    const dates = Array.from({ length: 7 }, (_, i) => ymd(shiftDays(anchorDay, i - 6)));
    const prevRange =
      preset === "7d"
        ? { from: ymd(shiftDays(anchorDay, -13)), to: ymd(shiftDays(anchorDay, -7)) }
        : preset === "30d"
          ? { from: ymd(shiftDays(anchorDay, -59)), to: ymd(shiftDays(anchorDay, -30)) }
          : null;
    const [dayBodies, prevBody] = await Promise.all([
      Promise.all(dates.map((d) => softRequest(dashboardPath(d, d), props.token))),
      prevRange ? softRequest(dashboardPath(prevRange.from, prevRange.to), props.token) : Promise.resolve(null),
    ]);
    if (seq !== loadSeq.current) return;
    if (dayBodies.some((b) => !b?.kpis)) {
      setDays([]);
      setDaysState("error");
      return;
    }
    const points = dates.map((date, i) => ({
      date,
      revenue: Number(dayBodies[i].kpis.revenue || 0),
      orders: Number(dayBodies[i].kpis.orders || 0),
    }));
    setDays(points);
    setDaysState("ready");
    if (preset === "today" || preset === "yesterday") setPrevRevenue(points[5].revenue);
    else if (prevBody?.kpis) setPrevRevenue(Number(prevBody.kpis.revenue || 0));
  }

  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    void loadDynamics(seq);
    try {
      const body = await request(dashboardPath(dateBounds.from, dateBounds.to), props.token);
      if (seq !== loadSeq.current) return;
      setData(body);
      setLoadedAt(new Date());

      const [sales, audit] = await Promise.all([
        canPosSales
          ? softRequest(`/api/pos/sales?${new URLSearchParams({ limit: "8", ...(branchId ? { branchId } : {}) })}`, props.token)
          : Promise.resolve(null),
        canAudit && !branchId ? softRequest("/api/admin/audit?limit=30", props.token) : Promise.resolve(null),
      ]);
      if (seq !== loadSeq.current) return;
      if (canPosSales) {
        const rows = Array.isArray(sales?.sales) ? sales.sales : [];
        setPosSales(rows.slice(0, 8));
      } else {
        setPosSales(null);
      }
      setAuditRows(Array.isArray(audit?.audit) ? audit.audit : []);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setData(null);
      setPosSales(null);
      setAuditRows([]);
      setError(errText(err, "Ma’lumotlarni yuklab bo‘lmadi."));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, canPosSales, canAudit, branchId, dateBounds.from, dateBounds.to]);

  const kpis = data?.kpis;
  const recent: any[] = Array.isArray(data?.recentOrders) ? data.recentOrders : [];
  const inventory = data?.inventory;
  const revenue = Number(kpis?.revenue || 0);
  const ordersCount = Number(kpis?.orders || 0);
  const completedCount = Number(kpis?.completed || 0);
  const deliveringCount = Number(kpis?.delivering || 0);
  const reservedCount = Number(kpis?.reserved || 0);
  const customersCount = Number(kpis?.customers || 0);
  const cashbackTotal = Number(kpis?.cashback || 0);
  const openOrders = Math.max(0, ordersCount - completedCount);
  const otherCount = Math.max(0, ordersCount - completedCount - deliveringCount - reservedCount);
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
  const criticalCount = attentionItems.filter((i) => i.tone === "danger").length;
  const attnState = criticalCount > 0 ? "critical" : hasAttention ? "warn" : "ok";
  const attnHeadline =
    criticalCount > 0
      ? `${criticalCount} ta muhim holat`
      : hasAttention
        ? `${attentionItems.length} ta holat e’tibor talab qiladi`
        : "Muammo yo‘q";
  const hasOrderActivity = recent.length > 0;
  const hasPosActivity = Boolean(posSales && posSales.length > 0);

  const [netRegion, setNetRegion] = useState<string | null>(null);
  const network = useMemo(() => {
    const list: NetworkBranch[] = (props.branches || []).map((b: any) => ({
      id: Number(b.id),
      name: String(b.name || ""),
      region: String(b.region || b.city || "—"),
      lat: Number(b.lat),
      lng: Number(b.lng),
      isOpen: b.isOpen !== false,
      is24h: b.is24h === true,
    }));
    const all = props.branches || [];
    const open = all.filter((b: any) => b.isOpen !== false).length;
    const h24 = all.filter((b: any) => b.is24h === true).length;
    const byRegion = new Map<string, number>();
    for (const b of all) {
      const key = String(b.region || b.city || "—");
      byRegion.set(key, (byRegion.get(key) || 0) + 1);
    }
    const regions = [...byRegion.entries()].sort((a, b) => b[1] - a[1]);
    return { mapped: list, total: all.length, open, closed: all.length - open, h24, regions };
  }, [props.branches]);

  const topRegions = network.regions.slice(0, 4);
  let restRegionsCount = 0;
  for (const [, n] of network.regions.slice(topRegions.length)) restRegionsCount += n;
  const topRegion = network.regions[0] || null;

  const feed = useMemo(() => {
    const items: FeedItem[] = [];
    for (const o of recent) {
      const branchName = o?.branch?.name ? String(o.branch.name) : "";
      items.push({
        key: `o${o.id}`,
        at: new Date(o.createdAt),
        kind: "order",
        icon: ShoppingBag,
        title: `Buyurtma ${o.code || `#${o.id}`}`,
        detail: [branchName, fulfillmentLabel(o.fulfillmentStatus || o.status || ""), money(Number(o.total || 0))]
          .filter(Boolean)
          .join(" · "),
      });
    }
    for (const s of posSales || []) {
      items.push({
        key: `p${s.id || s.receiptId}`,
        at: new Date(s.createdAt || s.soldAt),
        kind: "pos",
        icon: Receipt,
        title: `Kassa sotuvi ${s.receiptId || s.code || ""}`.trim(),
        detail: [s.branchName, money(Number(s.total ?? s.amount ?? s.grandTotal ?? 0))].filter(Boolean).join(" · "),
      });
    }
    for (const a of auditRows) {
      if (a.action === "admin.login") continue;
      items.push({
        key: `a${a.id}`,
        at: new Date(a.createdAt),
        kind: "audit",
        icon: feedIcon(String(a.entity || "")),
        title: actionLabel(String(a.action || "")),
        detail: String(a.actor || ""),
      });
    }
    return items
      .filter((i) => !Number.isNaN(i.at.getTime()))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 6);
  }, [recent, posSales, auditRows]);

  const filterControls = (
    <div className="dashboard-controls" role="group" aria-label="Dashboard filtrlari">
      <div className="dash-period" role="group" aria-label="Sana oralig‘i">
        {PERIODS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`dash-period-btn${preset === value ? " is-active" : ""}`}
            aria-pressed={preset === value}
            onClick={() => {
              setPreset(value);
              if (value !== "custom") {
                setCreatedFrom("");
                setCreatedTo("");
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="dash-range">
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
        </div>
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
        className={`btn-secondary btn-icon dashboard-refresh${loading ? " is-busy" : ""}`}
        type="button"
        disabled={loading}
        onClick={() => void load()}
        aria-label="Yangilash"
        title="Yangilash"
      >
        <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );

  const isZero = revenue === 0 && ordersCount === 0;
  const scopeLabel = branchId
    ? (props.branches || []).find((b) => String(b.id) === branchId)?.name || "Filial"
    : isHq
      ? "Barcha filiallar"
      : "O‘z filiali";

  let weekTotal = 0;
  let weekOrders = 0;
  let bestDay: DayPoint | null = null;
  for (const p of days) {
    weekTotal += p.revenue;
    weekOrders += p.orders;
    if (p.revenue > 0 && (!bestDay || p.revenue > bestDay.revenue)) bestDay = p;
  }
  const dynamicsReady = daysState === "ready";
  const avgCheck = completedCount > 0 ? revenue / completedCount : null;
  const showDelta = prevRevenue != null && prevRevenue > 0 && revenue > 0;
  const delta = showDelta ? ((revenue - (prevRevenue as number)) / (prevRevenue as number)) * 100 : 0;
  const heroNote =
    revenue === 0
      ? preset === "today"
        ? "Bugun savdo hali qayd etilmadi"
        : "Bu davrda yakunlangan savdo qayd etilmagan"
      : prevRevenue === 0 && preset !== "all" && preset !== "custom"
        ? "Oldingi davrda savdo qayd etilmagan"
        : "";
  const compareUnavailable =
    preset === "all" || preset === "custom"
      ? "Bu davr uchun taqqoslash yo‘q"
      : "Taqqoslash uchun ma’lumot yetarli emas";

  const segments: Segment[] = [
    { key: "done", label: "Yakunlangan", value: completedCount, tone: "ok" },
    { key: "deliv", label: "Yetkazilmoqda", value: deliveringCount, tone: "info" },
    { key: "res", label: "Rezerv", value: reservedCount, tone: "warn" },
    { key: "other", label: "Boshqa holatlar", value: otherCount, tone: "muted" },
  ];

  const headerMeta = (
    <>
      {hasAttention ? (
        <span className={`dash-pulse is-${attnState}`} role="status">
          <span className="dash-pulse-dot" aria-hidden="true" />
          {attentionItems.length} ta signal e’tibor talab qiladi
        </span>
      ) : (
        <div className="dash-health">
          <span className="dash-health-dot" aria-hidden="true" />
          <p className="dash-status" role="status">Muammo yo‘q</p>
        </div>
      )}
      {loadedAt ? <span className="dash-meta-item">Yangilandi {clockLabel(loadedAt)}</span> : null}
    </>
  );

  return (
    <div className={`dashboard${isZero ? " dashboard--zero" : ""}`}>
      <AdminPageHeader
        className="dashboard-header"
        eyebrow="VaksinaMed HQ · Operatsiyalar"
        title="Dashboard"
        meta={headerMeta}
        actions={filterControls}
      />

      {loading && !data ? (
        <div className="dash-skeleton" role="status" aria-label="Yuklanmoqda…">
          <span className="dash-skel dash-skel--metrics" />
          <span className="dash-skel dash-skel--sales" />
          <span className="dash-skel dash-skel--orders" />
          <span className="dash-skel dash-skel--network" />
        </div>
      ) : (
        <StateBox
          loading={false}
          error={error || null}
          empty={!kpis}
          emptyText="Ma’lumot yo‘q"
          onRetry={() => void load()}
        >
          <section className="dash-metrics" aria-label="Asosiy ko‘rsatkichlar">
            <article className="dash-kpi dash-hero" aria-label="Savdo">
              <div className="dash-hero-stage">
                <div className="dash-kpi-top">
                  <h2 className="dash-kpi-label">{salesLabel(preset)}</h2>
                  <span className="dash-hero-period">{periodText(dateBounds)}</span>
                </div>
                <div className="dash-hero-value">{money(revenue)}</div>
                <span className="dash-kpi-caption">{scopeLabel}</span>
              </div>
              <div className="dash-kpi-detail dash-hero-delta-row">
                {showDelta ? (
                  <>
                    <span className={`dash-delta ${delta >= 0 ? "is-up" : "is-down"}`}>
                      {delta >= 0 ? (
                        <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden="true" />
                      ) : (
                        <ArrowDownRight size={14} strokeWidth={2.25} aria-hidden="true" />
                      )}
                      {`${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1).replace(".", ",")}%`}
                    </span>
                    <span className="dash-delta-note">{compareLabel(preset)}</span>
                  </>
                ) : (
                  <>
                    <span className="dash-delta is-flat" aria-hidden="true">—</span>
                    <span className="dash-delta-note">{heroNote || compareUnavailable}</span>
                  </>
                )}
              </div>
            </article>
            <DashMetric
              label="Buyurtmalar"
              icon={ShoppingBag}
              accent="orders"
              value={<span className="dash-orders-n">{ordersCount}</span>}
              unit="ta"
              caption={
                ordersCount > 0
                  ? `${openOrders} ta ochiq · ${Math.round(pct(completedCount, ordersCount))}% yakunlangan`
                  : "Ochiq buyurtma yo‘q"
              }
              detail={
                <span className={`dash-kpi-state${reservedCount > 0 ? " is-active" : ""}`}>
                  <span aria-hidden="true" />
                  {reservedCount > 0 ? `${reservedCount} ta faol bron` : "Faol bron yo‘q"}
                </span>
              }
              onOpen={props.onOpenOrders}
            />
            <DashMetric
              label="Cashback"
              icon={WalletCards}
              accent="cash"
              value={money(cashbackTotal)}
              caption="Mijozlar balansida"
              detail={
                customersCount > 0
                  ? `${customersCount.toLocaleString("ru-RU")} mijoz · o‘rtacha ${money(cashbackTotal / customersCount)}`
                  : "Mijozlar hali yo‘q"
              }
              onOpen={props.onOpenCashback}
            />
            <DashMetric
              label="Filiallar"
              icon={Store}
              accent="network"
              value={Number(kpis?.branches || 0)}
              unit={network.regions.length ? `${network.regions.length} hudud` : undefined}
              caption="Tarmoqdagi filiallar"
              detail={
                network.total > 0 ? (
                  <>
                    <span
                      className="dash-kpi-health"
                      role="img"
                      aria-label={`${network.open} / ${network.total} filial ochiq`}
                    >
                      <span style={{ width: `${pct(network.open, network.total)}%` }} />
                    </span>
                    <span className="dash-kpi-split">
                      <span className="is-ok">{network.open} ochiq</span>
                      <span>{network.h24} ta 24 soat</span>
                      {network.closed > 0 ? <span className="is-muted">{network.closed} yopiq</span> : null}
                    </span>
                  </>
                ) : undefined
              }
              onOpen={props.onOpenBranches}
            />
          </section>

          <section className="dash-overview" aria-label="Savdo va buyurtmalar">
            <article className="dash-sales" aria-label="Savdo dinamikasi">
              <div className="dash-card-head">
                <h2 className="dash-title">Savdo dinamikasi</h2>
                <span className="dash-card-meta">
                  So‘nggi 7 kun
                  {days.length ? ` · ${shortDay(days[0].date)} — ${shortDay(days[days.length - 1].date)}` : ""}
                </span>
              </div>
              <dl className="dash-sales-stats">
                <div>
                  <dt>O‘rtacha chek</dt>
                  <dd>{avgCheck != null ? money(avgCheck) : "—"}</dd>
                  <dd className="dash-sales-note">
                    {completedCount > 0 ? `${completedCount} ta yakunlangan buyurtma` : "Yakunlangan buyurtma yo‘q"}
                  </dd>
                </div>
                <div>
                  <dt>7 kunlik jami</dt>
                  <dd>{dynamicsReady ? money(weekTotal) : "—"}</dd>
                  <dd className="dash-sales-note">{dynamicsReady ? `${weekOrders} ta buyurtma` : "—"}</dd>
                </div>
                <div>
                  <dt>Eng yuqori kun</dt>
                  <dd>{bestDay ? shortDay(bestDay.date) : "—"}</dd>
                  <dd className="dash-sales-note">
                    {bestDay ? money(bestDay.revenue) : dynamicsReady ? "Savdo qayd etilmagan" : "—"}
                  </dd>
                </div>
              </dl>
              <div className="dash-sales-chart">
                <SalesChart points={days} state={daysState} focusDate={ymd(anchorDay)} />
              </div>
            </article>

            <article className="dash-orders" aria-label="Operatsion holat">
              <div className="dash-orders-status">
              <div className="dash-card-head">
                <h2 className="dash-title">Buyurtmalar holati</h2>
                {props.onOpenOrders ? (
                  <button className="btn-tertiary dash-link" type="button" onClick={props.onOpenOrders}>
                    Ko‘rish
                    <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <OrdersStack total={ordersCount} segments={segments} />

              <ul className="dash-legend">
                {segments
                  .filter((s) => s.key !== "other" || s.value > 0)
                  .map((s) => (
                    <li key={s.key} className={`is-${s.tone}`}>
                      <span className="dash-legend-label">{s.label}</span>
                      <span className="dash-legend-value">{s.value}</span>
                      <span className="dash-legend-pct">
                        {ordersCount > 0 ? `${Math.round(pct(s.value, ordersCount))}%` : "—"}
                      </span>
                    </li>
                  ))}
              </ul>

              {ordersCount === 0 ? (
                <p className="dash-orders-empty">
                  {preset === "today" ? "Bugun faol buyurtmalar yo‘q" : "Bu davrda buyurtmalar yo‘q"}
                </p>
              ) : null}
              </div>

            <section className="attn" data-state={attnState} aria-label="Holat">
              <div className="dash-card-head">
                <h2 className="dash-title">Holat</h2>
                {hasAttention ? <span className="attn-count">{attentionItems.length}</span> : null}
              </div>
              {hasAttention ? (
                <p className="attn-state">
                  <span className="attn-state-mark" aria-hidden="true">
                    <AlertTriangle size={14} strokeWidth={2} />
                  </span>
                  {attnHeadline}
                </p>
              ) : null}
              {hasAttention ? (
                <ul className="attn-rows">
                  {attentionItems.map((item) => {
                    const copy = (
                      <span className="attn-row-copy">
                        <span className="attn-row-title">{item.title}</span>
                        <span className="attn-row-detail">{item.detail}</span>
                      </span>
                    );
                    return (
                      <li key={item.id} className={`attn-row attn-${item.tone}`}>
                        {item.actionLabel && item.onAction ? (
                          <button className="attn-row-main is-action" type="button" onClick={item.onAction}>
                            {copy}
                            <span className="attn-row-go">
                              {item.actionLabel}
                              <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
                            </span>
                          </button>
                        ) : (
                          <div className="attn-row-main">{copy}</div>
                        )}
                        {item.body ? <div className="attn-row-body">{item.body}</div> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="attn-calm-note">
                  <CheckCircle2 className="attn-calm-mark" size={14} strokeWidth={2} aria-hidden="true" />
                  Tizimda hozir e’tibor talab qiladigan holat mavjud emas.
                </p>
              )}
            </section>
            </article>
          </section>

          <section className="dash-insights" aria-label="Tarmoq">
            <article className="dash-network" aria-label="Filiallar tarmog‘i">
              <div className="dash-card-head">
                <div className="dash-network-title">
                  <h2 className="dash-title">Filiallar tarmog‘i</h2>
                  <span className="dash-network-total">
                    <span className="dash-network-n">{network.total || Number(kpis?.branches || 0)}</span> filial
                    {network.regions.length ? (
                      <>
                        <span className="dash-network-sep" aria-hidden="true">·</span>
                        <span className="dash-network-n">{network.regions.length}</span> hudud
                      </>
                    ) : null}
                  </span>
                </div>
                {props.onOpenBranches ? (
                  <button className="btn-tertiary dash-link" type="button" onClick={props.onOpenBranches}>
                    Filiallar
                    <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              {network.total > 0 ? (
                <div className="dash-network-body">
                  <NetworkMap
                    branches={network.mapped}
                    total={network.total}
                    open={network.open}
                    selectedId={branchId}
                    pinned={netRegion}
                    onPin={setNetRegion}
                  >
                    <div className="dash-network-side">
                      {topRegion ? (
                        <div className="dash-net-dist">
                          <span className="dash-net-k">Hududlar bo‘yicha taqsimot</span>
                          <span
                            className="dash-net-bar"
                            role="img"
                            aria-label={`Hududlar bo‘yicha: ${network.regions.map(([r, n]) => `${r} ${n}`).join(", ")}`}
                          >
                            {network.regions.map(([region, n], i) => (
                              <span
                                key={region}
                                className={`dash-net-seg ${i < topRegions.length ? `is-t${i}` : "is-rest"}`}
                                style={{ flexGrow: n }}
                                title={`${region}: ${n}`}
                              />
                            ))}
                          </span>
                        </div>
                      ) : null}
                      <ol className="dash-regions" aria-label="Eng yirik hududlar">
                        {topRegions.map(([region, n], i) => {
                          const iso = regionIso(region);
                          return (
                            <li key={region} className={iso && iso === netRegion ? "is-active" : undefined}>
                              <button
                                type="button"
                                className="dash-region-btn"
                                disabled={!iso}
                                aria-pressed={iso ? iso === netRegion : undefined}
                                onClick={() => iso && setNetRegion(iso === netRegion ? null : iso)}
                              >
                                <span className={`dash-region-rank is-t${i}`}>{i + 1}</span>
                                <span className="dash-region-name">{region}</span>
                                <span className="dash-region-n">{n}</span>
                              </button>
                            </li>
                          );
                        })}
                        {restRegionsCount > 0 ? (
                          <li className="is-rest">
                            <span className="dash-region-rank is-rest">+</span>
                            <span className="dash-region-name">Boshqa {network.regions.length - topRegions.length} hudud</span>
                            <span className="dash-region-n">{restRegionsCount}</span>
                          </li>
                        ) : null}
                      </ol>
                    </div>
                  </NetworkMap>
                </div>
              ) : (
                <div className="dash-empty">
                  <span className="dash-empty-icon" aria-hidden="true"><Store size={16} strokeWidth={1.75} /></span>
                  <span className="dash-empty-copy">
                    <strong>Filiallar ro‘yxati mavjud emas</strong>
                    <span>Filiallar ma’lumotini ko‘rish uchun ruxsat kerak.</span>
                  </span>
                </div>
              )}
            </article>
          </section>

          <section className="dash-signals" aria-label="Operatsion signallar">
            <article className="dash-activity" aria-label="So‘nggi faollik">
              <div className="dash-card-head">
                <h2 className="dash-title">So‘nggi faollik</h2>
                {feed.length ? <span className="dash-count">{feed.length}</span> : null}
              </div>
              {feed.length ? (
                <ol className="dash-feed">
                  {feed.map((item) => {
                    const Icon = item.icon;
                    const sameDay = ymd(item.at) === ymd(new Date());
                    return (
                      <li key={item.key} className={`dash-feed-item is-${item.kind}`}>
                        <span className="dash-feed-node" aria-hidden="true">
                          <Icon size={14} strokeWidth={1.75} />
                        </span>
                        <span className="dash-feed-copy">
                          <span className="dash-feed-title">{item.title}</span>
                          <span className="dash-feed-detail">
                            <span className="dash-feed-kind">{FEED_KIND_LABEL[item.kind]}</span>
                            {item.detail ? ` · ${item.detail}` : ""}
                          </span>
                        </span>
                        <time className="dash-feed-time" dateTime={item.at.toISOString()}>
                          {clockLabel(item.at)}
                          {!sameDay ? <span>{shortDay(ymd(item.at))}</span> : null}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="dash-empty">
                  <span className="dash-empty-icon" aria-hidden="true"><Activity size={16} strokeWidth={1.75} /></span>
                  <span className="dash-empty-copy">
                    <strong>Hozircha faoliyat mavjud emas</strong>
                    <span>Buyurtmalar, kassa sotuvlari va tizim amallari shu yerda ko‘rinadi.</span>
                  </span>
                </div>
              )}
            </article>

              {hasOrderActivity ? (
                <section className="act" aria-label="Oxirgi buyurtmalar">
                  <div className="dash-card-head">
                    <h2 className="dash-title">Oxirgi buyurtmalar</h2>
                    {props.onOpenOrders ? (
                      <button className="btn-tertiary dash-link" type="button" onClick={props.onOpenOrders}>
                        Barchasini ko‘rish
                        <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <ol className="act-feed">
                    {recent.map((item: any) => {
                      const at = new Date(item.createdAt);
                      const valid = !Number.isNaN(at.getTime());
                      const where = [item?.branch?.name ? String(item.branch.name) : "", customerName(item)]
                        .filter((s) => s && s !== "—")
                        .join(" · ");
                      const row = (
                        <>
                          <span className="act-code">{item.code || `#${item.id}`}</span>
                          <span className="act-where">{where || "—"}</span>
                          <time className="act-time" dateTime={valid ? at.toISOString() : undefined}>
                            {valid ? clockLabel(at) : "—"}
                            {valid && ymd(at) !== ymd(new Date()) ? <span>{shortDay(ymd(at))}</span> : null}
                          </time>
                          <span className="act-amount">{money(Number(item.total || 0))}</span>
                          <span className="act-status">
                            <span className="sr-only">Holat: </span>
                            <StatusLabelBadge domain="fulfillment" status={item.fulfillmentStatus || item.status || ""} />
                          </span>
                        </>
                      );
                      return (
                        <li key={item.id}>
                          {props.onOpenOrder ? (
                            <button type="button" className="act-row" onClick={() => props.onOpenOrder!(item.id)}>
                              {row}
                            </button>
                          ) : (
                            <div className="act-row">{row}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}

              {hasPosActivity ? (
                <section className="act act--pos" aria-label="Kassa">
                  <div className="dash-card-head">
                    <h2 className="dash-title">So‘nggi kassa sotuvlari</h2>
                    {props.onOpenPos ? (
                      <button className="btn-tertiary dash-link" type="button" onClick={props.onOpenPos}>
                        Kassaga o‘tish
                        <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <ol className="act-feed">
                    {(posSales || []).map((row: any, idx: number) => {
                      const at = new Date(row.createdAt || row.soldAt);
                      const valid = !Number.isNaN(at.getTime());
                      const hasCashback = row.cashbackUsed != null || row.cashbackEarned != null || row.cashback != null;
                      return (
                        <li key={row.id || row.receiptId || idx}>
                          <div className="act-row">
                            <span className="act-code">{row.receiptId || row.code || "—"}</span>
                            <span className="act-where">
                              {[row.branchName, row.customerName].filter(Boolean).join(" · ") || "—"}
                            </span>
                            <time className="act-time" dateTime={valid ? at.toISOString() : undefined}>
                              {valid ? clockLabel(at) : "—"}
                              {valid && ymd(at) !== ymd(new Date()) ? <span>{shortDay(ymd(at))}</span> : null}
                            </time>
                            <span className="act-amount">{money(Number(row.total ?? row.amount ?? row.grandTotal ?? 0))}</span>
                            <span className="act-status act-cashback">
                              {hasCashback
                                ? `Cashback ${money(Number(row.cashbackUsed ?? row.cashbackEarned ?? row.cashback ?? 0))}`
                                : "—"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}
          </section>
        </StateBox>
      )}
    </div>
  );
}
