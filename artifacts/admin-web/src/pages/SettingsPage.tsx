import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  RefreshCw,
  Coins,
  Store,
  CreditCard,
  Truck,
  Cpu,
  Database,
  Clock,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Layers,
} from "lucide-react";
import { request, money, type AdminUser } from "../api";
import { ErrorState, LoadingBlock, StatusBadge } from "../ui";

/**
 * Settings console — read-only view over the real server sources.
 * There is no settings aggregate or settings write API; every value below is read from the endpoint that owns it.
 */

const BUSINESS_TZ = "Asia/Tashkent";
const READ_ONLY = "Faqat ko‘rish — o‘zgartirish API mavjud emas";

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";
type LoadError = { kind: "session" | "forbidden" | "notfound" | "network" | "failed"; message: string };
type Source<T> = { data: T | null; error: LoadError | null };
type SourceKey = "rules" | "branches" | "delivery" | "fom" | "health";
type SettingsCategory = "all" | "cashback" | "branches" | "delivery" | "integrations";

type Rules = {
  maxSpendPercent?: number;
  minPurchase?: number;
  ttlDays?: number;
  deliveryFee?: number;
  tiers?: Array<{ tier?: string; rate?: string; fromTotal?: number }>;
  earnWhen?: string[];
  spendWhen?: string[];
};
type BranchRow = { id: number; name?: string; isOpen?: boolean; is24h?: boolean; hasPayme?: boolean; hasClick?: boolean };
type DeliveryInfo = { externalProvider?: string };
type FomInfo = { status?: string; ready?: boolean; inventoryWriter?: string; fomPosContract?: string };
type HealthInfo = { status?: string; database?: string; driver?: string; time?: string };

const SOURCE_LABELS: Record<SourceKey, string> = {
  rules: "Cashback qoidalari",
  branches: "Filiallar ro‘yxati",
  delivery: "Yetkazib berish holati",
  fom: "FOM holati",
  health: "Server tekshiruvi",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin (HQ)",
  admin: "Admin (HQ)",
  cashier: "Kassir",
};

const FOM_STATUS_LABELS: Record<string, string> = {
  CONTRACT_PENDING: "Shartnoma kutilmoqda",
};

const DRIVER_LABELS: Record<string, string> = {
  pglite: "PGlite (lokal)",
  postgres: "PostgreSQL",
};

/** Sources that the server keeps outside any admin API — shown as not visible, never as a status. */
const NOT_EXPOSED = [
  "SMS va xabarnomalar",
  "Fon jarayonlari",
  "Payme / Click rejimi",
  "Sessiya muddati, OTP",
  "Buyurtma bron muddati",
];

const CATEGORY_TABS: Array<{ id: SettingsCategory; label: string; icon: typeof Sliders }> = [
  { id: "all", label: "Barchasi", icon: Sliders },
  { id: "cashback", label: "Cashback & Qoidalar", icon: Coins },
  { id: "branches", label: "Filiallar & To‘lovlar", icon: Store },
  { id: "delivery", label: "Yetkazib berish", icon: Truck },
  { id: "integrations", label: "FOM & Tizim", icon: Cpu },
];

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function statusOf(err: unknown): number {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) || 0 : 0;
}

function loadError(err: unknown, key: SourceKey): LoadError {
  const status = statusOf(err);
  const label = SOURCE_LABELS[key];
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: `${label}: ko‘rish uchun ruxsat yo‘q.` };
  if (status === 404) return { kind: "notfound", message: `${label}: manba topilmadi.` };
  if (!status) return { kind: "network", message: "Server bilan aloqa yo‘q. Internet aloqasini tekshirib, qayta urinib ko‘ring." };
  return { kind: "failed", message: `${label}: ma'lumotni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.` };
}

function formatTime(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return TIME_FMT.format(d).replace(/\//g, ".");
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) ? n : null;
}

const EMPTY: Source<never> = { data: null, error: null };

export function SettingsPage(props: {
  token?: string;
  user?: AdminUser | null;
  permissions?: string[];
  openableTabs?: string[];
  onOpenTab?: (tab: string) => void;
}) {
  const [rules, setRules] = useState<Source<Rules>>(EMPTY);
  const [branches, setBranches] = useState<Source<BranchRow[]>>(EMPTY);
  const [delivery, setDelivery] = useState<Source<DeliveryInfo>>(EMPTY);
  const [fom, setFom] = useState<Source<FomInfo>>(EMPTY);
  const [health, setHealth] = useState<Source<HealthInfo>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [activeCat, setActiveCat] = useState<SettingsCategory>("all");
  const loadSeq = useRef(0);

  async function load() {
    const seq = ++loadSeq.current;
    const token = props.token || "";
    setLoading(true);
    const [r, b, d, f, h] = await Promise.allSettled([
      request("/api/cashback/rules", token),
      request("/api/admin/branches", token),
      request("/api/admin/deliveries?limit=1", token),
      request("/api/integrations/fom/status", token),
      request("/api/healthz", token).catch((err) => {
        if (statusOf(err) === 503) return { status: "not_ready", database: "down" };
        throw err;
      }),
    ]);
    if (seq !== loadSeq.current) return;
    const pick = <T,>(res: PromiseSettledResult<any>, key: SourceKey, map: (v: any) => T): Source<T> =>
      res.status === "fulfilled"
        ? { data: map(res.value), error: null }
        : { data: null, error: loadError(res.reason, key) };
    setRules(pick(r, "rules", (v) => (v && typeof v === "object" ? (v as Rules) : {})));
    setBranches(pick(b, "branches", (v) => (Array.isArray(v?.branches) ? (v.branches as BranchRow[]) : [])));
    setDelivery(pick(d, "delivery", (v) => ({ externalProvider: typeof v?.externalProvider === "string" ? v.externalProvider : undefined })));
    setFom(pick(f, "fom", (v) => ({
      status: typeof v?.status === "string" ? v.status : undefined,
      ready: typeof v?.ready === "boolean" ? v.ready : undefined,
      inventoryWriter: typeof v?.inventoryWriter === "string" ? v.inventoryWriter : undefined,
      fomPosContract: typeof v?.fomPosContract === "string" ? v.fomPosContract : undefined,
    })));
    setHealth(pick(h, "health", (v) => ({
      status: typeof v?.status === "string" ? v.status : undefined,
      database: typeof v?.database === "string" ? v.database : undefined,
      driver: typeof v?.driver === "string" ? v.driver : undefined,
      time: typeof v?.time === "string" ? v.time : undefined,
    })));
    setCheckedAt(new Date());
    setLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const sources = [rules, branches, delivery, fom, health];
  const sessionExpired = sources.some((s) => s.error?.kind === "session");
  const allNetwork = loaded && sources.every((s) => s.error?.kind === "network");
  const pageError: LoadError | null = sessionExpired
    ? { kind: "session", message: "Sessiya tugagan. Qayta kiring." }
    : allNetwork
      ? sources[0].error
      : null;

  const canOpen = (tab: string) => Boolean(props.onOpenTab && props.openableTabs?.includes(tab));
  const openLink = (tab: string, label: string) =>
    canOpen(tab) ? (
      <button type="button" className="btn-tertiary st-link" onClick={() => props.onOpenTab?.(tab)}>
        {label}
        <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    ) : null;

  const role = String(props.user?.role || "");
  const permissionCount = Array.isArray(props.permissions) ? props.permissions.length : null;

  const showSection = (cat: SettingsCategory) => activeCat === "all" || activeCat === cat;

  return (
    <div className="settings-page st-page page-module">
      <div className="st-header">
        <div className="st-header-top">
          <div className="st-header-title-row">
            <h1 className="st-header-title" title="Sozlamalar">Sozlamalar</h1>
            <span
              className="st-header-hint"
              title="Alohida sozlamalar API’si yo‘q: har bir qiymat o‘z server manbasidan o‘qiladi va bu yerdan o‘zgartirilmaydi."
            >
              Alohida sozlamalar API’si yo‘q
            </span>
            {checkedAt ? (
              <span className="st-intro-time" title="Oxirgi server tekshiruvi (Asia/Tashkent)">
                {formatTime(checkedAt)}
              </span>
            ) : null}
          </div>
          <div className="st-header-actions">
            <button
              className={`btn-secondary st-refresh${loading ? " is-busy" : ""}`}
              type="button"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
              Yangilash
            </button>
          </div>
        </div>
        <div className="st-categories" role="tablist" aria-label="Sozlama toifalari">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeCat === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`st-cat-btn${isSelected ? " is-active" : ""}`}
                onClick={() => setActiveCat(tab.id)}
              >
                <Icon size={14} strokeWidth={isSelected ? 2.2 : 1.8} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {pageError ? (
        <ErrorState
          message={pageError.message}
          onRetry={pageError.kind === "network" ? () => void load() : undefined}
        />
      ) : !loaded ? (
        <LoadingBlock rows={4} label="Sozlamalar o‘qilmoqda…" />
      ) : (
        <div className={`st-sections${loading ? " is-refreshing" : ""}`}>
          {showSection("cashback") ? (
            <Section
              id="st-cashback"
              icon={<Coins size={16} aria-hidden="true" />}
              title="Cashback / Loyalty"
              lead="Mijozlar balansi va ledger bu yerda emas"
              source="GET /api/cashback/rules"
              error={rules.error}
              onRetry={() => void load()}
              footer={openLink("cashback", "Balanslar va ledger — Cashback / Loyalty")}
            >
              {rules.data ? <CashbackRows rules={rules.data} openLink={openLink} /> : null}
            </Section>
          ) : null}

          {showSection("branches") ? (
            <Section
              id="st-branches"
              icon={<Store size={16} aria-hidden="true" />}
              title="Filiallar va to‘lov kabinetlari"
              lead="Kalit qiymatlari hech qachon ko‘rsatilmaydi."
              source="GET /api/admin/branches"
              error={branches.error}
              onRetry={() => void load()}
              footer={openLink("branches", "Filial ma'lumotlari va kabinetlar — Filiallar bo‘limida boshqariladi")}
            >
              {branches.data ? <BranchRows rows={branches.data} openLink={openLink} /> : null}
            </Section>
          ) : null}

          {showSection("delivery") ? (
            <Section
              id="st-delivery"
              icon={<Truck size={16} aria-hidden="true" />}
              title="Yetkazib berish"
              lead="Yetkazib berish haqi va provayder holati"
              source="GET /api/cashback/rules · GET /api/admin/deliveries"
              error={delivery.error && rules.error ? delivery.error : null}
              onRetry={() => void load()}
              footer={openLink("delivery", "Yetkazishlar — Yetkazib berish bo‘limi")}
            >
              <SettingRow
                icon={<Truck size={15} aria-hidden="true" />}
                title="Yetkazib berish haqi"
                source="Server kodi · o‘zgarmas qiymat"
                value={finite(rules.data?.deliveryFee) != null ? money(Number(rules.data?.deliveryFee)) : null}
                missing={rules.error ? rules.error.message : undefined}
                action={openLink("delivery", "Ko‘rish")}
              />
              <SettingRow
                icon={<Layers size={15} aria-hidden="true" />}
                title="Tashqi provayder"
                source="Yetkazib berish API · externalProvider"
                desc="Hali ulanmagan — tashqi provider contract mavjud emas."
                value={
                  delivery.data?.externalProvider === "CONTRACT_PENDING"
                    ? "Hali ulanmagan"
                    : delivery.data?.externalProvider || null
                }
                missing={delivery.error ? delivery.error.message : undefined}
                action={openLink("delivery", "Sozlash")}
              />
            </Section>
          ) : null}

          {showSection("integrations") ? (
            <>
              <Section
                id="st-fom"
                icon={<Cpu size={16} aria-hidden="true" />}
                title="FOM integratsiyasi"
                lead="Dorixona kassasi (FOM) bilan ko‘prik holati"
                source="GET /api/integrations/fom/status"
                error={fom.error}
                onRetry={() => void load()}
                footer={openLink("fom", "Batafsil — FOM bo‘limi")}
              >
                {fom.data ? (
                  <>
                    <SettingRow
                      icon={<Cpu size={15} aria-hidden="true" />}
                      title="Integratsiya holati"
                      source="FOM holati API"
                      value={fom.data.status ? FOM_STATUS_LABELS[fom.data.status] || fom.data.status : null}
                      action={openLink("fom", "Ko‘rish")}
                    />
                    <SettingRow
                      icon={<Sliders size={15} aria-hidden="true" />}
                      title="FOM inventar yozuvi"
                      source="FOM holati API"
                      value={fom.data.inventoryWriter === "OFF" ? "O‘chirilgan" : fom.data.inventoryWriter || null}
                      action={openLink("fom", "Sozlash")}
                    />
                  </>
                ) : null}
              </Section>

              <Section
                id="st-access"
                icon={<ShieldCheck size={16} aria-hidden="true" />}
                title="Kirish va ruxsatlar"
                lead="Joriy sessiya serverdan olingan rol va ruxsatlar bilan ishlaydi"
                source="GET /api/admin/me"
                footer={openLink("admins", "Rol va ruxsatlar — Adminlar bo‘limi")}
              >
                <SettingRow
                  icon={<ShieldCheck size={15} aria-hidden="true" />}
                  title="Joriy rol"
                  source="Admin sessiyasi"
                  value={role ? ROLE_LABELS[role] || role : null}
                  status={{ tone: "info", label: "Joriy hisob" }}
                  action={openLink("admins", "Adminlar")}
                />
                <SettingRow
                  icon={<Sliders size={15} aria-hidden="true" />}
                  title="Server ruxsatlari"
                  source="Admin sessiyasi"
                  value={permissionCount != null ? `${permissionCount} ta` : null}
                  action={openLink("admins", "Ko‘rish")}
                />
              </Section>

              <Section
                id="st-system"
                icon={<Database size={16} aria-hidden="true" />}
                title="Tizim holati"
                lead="Server tekshiruvi natijasi"
                source="GET /api/healthz"
                error={health.error}
                onRetry={() => void load()}
              >
                {health.data ? (
                  <SettingRow
                    icon={<Database size={15} aria-hidden="true" />}
                    title="Ma'lumotlar bazasi"
                    source="Server tekshiruvi"
                    value={health.data.driver ? DRIVER_LABELS[health.data.driver] || health.data.driver : null}
                    status={
                      health.data.database === "up"
                        ? { tone: "ok", label: "Javob berdi" }
                        : health.data.database === "down"
                          ? { tone: "danger", label: "Javob bermadi" }
                          : undefined
                    }
                  />
                ) : null}
              </Section>

              <section className="st-hidden" aria-labelledby="st-hidden-title">
                <h2 id="st-hidden-title" className="st-hidden-title">Admin API orqali ko‘rinmaydi</h2>
                <ul className="st-hidden-list">
                  {NOT_EXPOSED.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section(props: {
  id: string;
  icon?: ReactNode;
  title: string;
  lead: string;
  source: string;
  error?: LoadError | null;
  onRetry?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const retry = props.error && (props.error.kind === "failed" || props.error.kind === "network") ? props.onRetry : undefined;
  return (
    <section className="st-section" aria-labelledby={`${props.id}-title`}>
      <header className="st-section-head">
        <div className="st-section-title-wrap" title={props.lead}>
          {props.icon ? <span className="st-section-icon">{props.icon}</span> : null}
          <h2 id={`${props.id}-title`} className="st-section-title">{props.title}</h2>
          <span className="st-readonly" title={READ_ONLY}>Faqat ko‘rish</span>
        </div>
        <span className="st-source" title={`Ma'lumot manbasi: ${props.source}`}>{props.source}</span>
      </header>
      {props.error ? (
        <div className="st-section-error">
          <ErrorState message={props.error.message} onRetry={retry} />
        </div>
      ) : (
        <div className="st-rows">{props.children}</div>
      )}
      {props.footer ? <footer className="st-section-foot">{props.footer}</footer> : null}
    </section>
  );
}

function SettingRow(props: {
  icon?: ReactNode;
  title: string;
  source: string;
  desc?: string;
  value: ReactNode | null;
  status?: { tone: Tone; label: string };
  missing?: string;
  action?: ReactNode;
  toggle?: { active: boolean; label?: string };
  children?: ReactNode;
}) {
  return (
    <div className="st-row" title={`${props.title} · Manba: ${props.source}${props.desc ? ` · ${props.desc}` : ""}`}>
      <div className="st-row-left">
        {props.icon ? <span className="st-row-icon" aria-hidden="true">{props.icon}</span> : null}
        <span className="st-row-title">{props.title}</span>
        {props.missing && (props.value == null || props.value === "") ? (
          <span className="st-row-missing" role="status">{props.missing}</span>
        ) : null}
      </div>
      <div className="st-row-right">
        <div className="st-value-wrap">
          {props.value != null && props.value !== "" ? (
            <span className="st-value">{props.value}</span>
          ) : (
            <span className="st-value is-missing">—</span>
          )}
        </div>
        {props.status ? <StatusBadge tone={props.status.tone}>{props.status.label}</StatusBadge> : null}
        {props.action ? <span className="st-row-action">{props.action}</span> : null}
      </div>
      {props.children ? <div className="st-row-extra">{props.children}</div> : null}
    </div>
  );
}

function CashbackRows(props: { rules: Rules; openLink: (tab: string, label: string) => ReactNode }) {
  const r = props.rules;
  const maxSpendPercent = finite(r.maxSpendPercent);
  const minPurchase = finite(r.minPurchase);
  const ttlDays = finite(r.ttlDays);
  const tiers = Array.isArray(r.tiers) ? r.tiers : [];
  return (
    <>
      <SettingRow
        icon={<Coins size={15} aria-hidden="true" />}
        title="Cashback ishlatish limiti"
        source="Server sozlamasi · system_settings (standart 30%)"
        value={maxSpendPercent != null ? `${maxSpendPercent}%` : null}
        action={props.openLink("cashback", "Boshqarish")}
      />
      <SettingRow
        icon={<ShoppingBag size={15} aria-hidden="true" />}
        title="Minimal xarid summasi"
        source="Server kodi · o‘zgarmas qiymat"
        value={minPurchase != null ? money(minPurchase) : null}
        action={props.openLink("cashback", "Ko‘rish")}
      />
      <SettingRow
        icon={<Sliders size={15} aria-hidden="true" />}
        title="Loyalty darajalari"
        source="Server kodi · o‘zgarmas qiymat"
        value={tiers.length ? `${tiers.length} ta daraja` : null}
        action={props.openLink("cashback", "Darajalar")}
      >
        {tiers.length ? (
          <div className="st-tiers-bar">
            {tiers.map((t, i) => (
              <span key={`${t.tier || "tier"}-${i}`} className="st-tier-tag">
                <strong>{t.tier || "—"}:</strong> {t.rate || "—"} ({finite(t.fromTotal) != null ? `${money(Number(t.fromTotal))} dan` : "—"})
              </span>
            ))}
          </div>
        ) : null}
      </SettingRow>
      <SettingRow
        icon={<Clock size={15} aria-hidden="true" />}
        title="Cashback amal qilish muddati"
        source="Server kodi · o‘zgarmas qiymat"
        desc="Muddati o‘tgan cashbackni hisobdan chiqaradigan server jarayoni hozircha yo‘q."
        value={ttlDays != null ? `${ttlDays} kun` : null}
        status={ttlDays != null ? { tone: "warn", label: "Serverda qo‘llanmaydi" } : undefined}
      />
    </>
  );
}

function BranchRows(props: { rows: BranchRow[]; openLink: (tab: string, label: string) => ReactNode }) {
  const rows = props.rows;
  const total = rows.length;
  const tally = (pick: (b: BranchRow) => boolean) => rows.filter(pick).length;
  const payme = tally((b) => b.hasPayme === true);
  const click = tally((b) => b.hasClick === true);
  const open = tally((b) => b.isOpen === true);
  const allDay = tally((b) => b.is24h === true);
  const of = (n: number) => (total ? `${n} / ${total}` : null);
  const providerStatus = (n: number): { tone: Tone; label: string } =>
    n === 0 ? { tone: "neutral", label: "Sozlanmagan" } : n === total ? { tone: "ok", label: "Barchasida sozlangan" } : { tone: "info", label: "Qisman sozlangan" };
  if (!total) {
    return <p className="st-empty">Filiallar ro‘yxati bo‘sh — ko‘rsatiladigan filial sozlamasi yo‘q.</p>;
  }
  return (
    <>
      <SettingRow
        icon={<CreditCard size={15} aria-hidden="true" />}
        title="Payme kabineti"
        source="Filial yozuvlari · hasPayme"
        value={of(payme)}
        status={providerStatus(payme)}
        action={props.openLink("branches", "Sozlash")}
      />
      <SettingRow
        icon={<CreditCard size={15} aria-hidden="true" />}
        title="Click kabineti"
        source="Filial yozuvlari · hasClick"
        value={of(click)}
        status={providerStatus(click)}
        action={props.openLink("branches", "Sozlash")}
      />
      <SettingRow
        icon={<Store size={15} aria-hidden="true" />}
        title="Ochiq filiallar"
        source="Filial yozuvlari · isOpen"
        value={of(open)}
        status={open > 0 ? { tone: "ok", label: "Faol" } : { tone: "neutral", label: "Yopiq" }}
        action={props.openLink("branches", "Filiallar")}
      />
      <SettingRow
        icon={<Clock size={15} aria-hidden="true" />}
        title="24/7 ishlaydigan filiallar"
        source="Filial yozuvlari · is24h"
        value={of(allDay)}
        status={allDay > 0 ? { tone: "ok", label: "24/7 rejim" } : { tone: "neutral", label: "Mavjud emas" }}
        action={props.openLink("branches", "Filiallar")}
      />
    </>
  );
}
