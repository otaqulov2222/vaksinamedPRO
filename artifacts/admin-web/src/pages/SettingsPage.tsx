import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { request, money, type AdminUser } from "../api";
import { AdminPageHeader, ErrorState, LoadingBlock, StatusBadge } from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

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
  "SMS va xabarnomalar (Eskiz provayderi)",
  "Fon jarayonlari (workerlar)",
  "Payme / Click rejimi (sandbox yoki production)",
  "Sessiya muddati, OTP va so‘rov limitlari",
  "Buyurtma bron muddati",
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
        <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    ) : null;

  const role = String(props.user?.role || "");
  const permissionCount = Array.isArray(props.permissions) ? props.permissions.length : null;

  return (
    <div className="settings-page st-page page-module">
      <AdminPageHeader
        title="Sozlamalar"
        description={PAGE_DESCRIPTIONS.settings}
        meta={
          <span className="st-meta">
            <span className="st-chip">Faqat ko‘rish</span>
            <span className="st-chip">Faqat HQ</span>
            <span className="st-chip">Har bo‘lim o‘z server ruxsati bilan</span>
          </span>
        }
        actions={
          <button
            className={`btn-secondary st-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <p className="st-intro">
        Alohida sozlamalar API’si yo‘q: har bir qiymat o‘z server manbasidan o‘qiladi va bu yerdan o‘zgartirilmaydi.
        {checkedAt ? <span className="st-intro-time"> Oxirgi o‘qish: {formatTime(checkedAt)} (Asia/Tashkent).</span> : null}
      </p>

      {pageError ? (
        <ErrorState
          message={pageError.message}
          onRetry={pageError.kind === "network" ? () => void load() : undefined}
        />
      ) : !loaded ? (
        <LoadingBlock rows={4} label="Sozlamalar o‘qilmoqda…" />
      ) : (
        <div className={`st-sections${loading ? " is-refreshing" : ""}`}>
          <Section
            id="st-cashback"
            title="Cashback / Loyalty"
            lead="Cashback hisoblash qoidalari. Mijozlar balansi va ledger bu yerda emas — ular Cashback / Loyalty bo‘limida."
            source="GET /api/cashback/rules"
            error={rules.error}
            onRetry={() => void load()}
            footer={openLink("cashback", "Balanslar va ledger — Cashback / Loyalty")}
          >
            {rules.data ? <CashbackRows rules={rules.data} /> : null}
          </Section>

          <Section
            id="st-branches"
            title="Filiallar va to‘lov kabinetlari"
            lead="Filial yozuvlaridagi holat va Payme / Click kabineti sozlanganmi. Kalit qiymatlari hech qachon ko‘rsatilmaydi."
            source="GET /api/admin/branches"
            error={branches.error}
            onRetry={() => void load()}
            footer={openLink("branches", "Filial ma'lumotlari va kabinetlar — Filiallar bo‘limida boshqariladi")}
          >
            {branches.data ? <BranchRows rows={branches.data} /> : null}
          </Section>

          <Section
            id="st-delivery"
            title="Yetkazib berish"
            lead="Yetkazib berish haqi va tashqi provayder holati."
            source="GET /api/cashback/rules · GET /api/admin/deliveries"
            error={delivery.error && rules.error ? delivery.error : null}
            onRetry={() => void load()}
            footer={openLink("delivery", "Yetkazishlar — Yetkazib berish bo‘limi")}
          >
            <SettingRow
              title="Yetkazib berish haqi"
              desc="Yetkazib berish buyurtmasiga qo‘shiladi. Cashback bu summadan hisoblanmaydi."
              source="Server kodi · o‘zgarmas qiymat"
              value={finite(rules.data?.deliveryFee) != null ? money(Number(rules.data?.deliveryFee)) : null}
              missing={rules.error ? rules.error.message : undefined}
            />
            <SettingRow
              title="Tashqi yetkazib berish provayderi"
              desc={
                delivery.data?.externalProvider === "CONTRACT_PENDING"
                  ? "Hali ulanmagan — tashqi provider contract mavjud emas. Yetkazishlar ichki kuryer orqali yuritiladi."
                  : "Server qaytargan provayder holati."
              }
              source="Yetkazib berish API · externalProvider"
              value={
                delivery.data?.externalProvider === "CONTRACT_PENDING"
                  ? "Hali ulanmagan"
                  : delivery.data?.externalProvider || null
              }
              missing={delivery.error ? delivery.error.message : undefined}
            />
          </Section>

          <Section
            id="st-fom"
            title="FOM integratsiyasi"
            lead="Dorixona kassasi (FOM) bilan ko‘prik holati."
            source="GET /api/integrations/fom/status"
            error={fom.error}
            onRetry={() => void load()}
            footer={openLink("fom", "Batafsil — FOM bo‘limi")}
          >
            {fom.data ? (
              <>
                <SettingRow
                  title="Integratsiya holati"
                  desc="Tashqi FOM kassa shartnomasi holati."
                  source="FOM holati API"
                  value={fom.data.status ? FOM_STATUS_LABELS[fom.data.status] || fom.data.status : null}
                  status={fom.data.ready === false ? { tone: "warn", label: "Production uchun tayyor emas" } : undefined}
                />
                <SettingRow
                  title="FOM inventar yozuvi"
                  desc="FOM ombor qoldig‘ini tizimga yozadimi."
                  source="FOM holati API"
                  value={fom.data.inventoryWriter === "OFF" ? "O‘chirilgan" : fom.data.inventoryWriter || null}
                />
              </>
            ) : null}
          </Section>

          <Section
            id="st-access"
            title="Kirish va ruxsatlar"
            lead="Joriy sessiya serverdan olingan rol va ruxsatlar bilan ishlaydi. Alohida sozlamalar ruxsati yo‘q."
            source="GET /api/admin/me"
            footer={openLink("admins", "Rol va ruxsatlar — Adminlar bo‘limi")}
          >
            <SettingRow
              title="Joriy rol"
              desc="Kirish paytida server tasdiqlagan rol."
              source="Admin sessiyasi"
              value={role ? ROLE_LABELS[role] || role : null}
            />
            <SettingRow
              title="Server ruxsatlari"
              desc="Har bir bo‘lim va amal serverda shu ruxsatlar bilan tekshiriladi."
              source="Admin sessiyasi"
              value={permissionCount != null ? `${permissionCount} ta` : null}
            />
          </Section>

          <Section
            id="st-system"
            title="Tizim holati"
            lead="Server tekshiruvi natijasi — faqat API qaytargan javob."
            source="GET /api/healthz"
            error={health.error}
            onRetry={() => void load()}
          >
            {health.data ? (
              <SettingRow
                title="Ma'lumotlar bazasi"
                desc={
                  health.data.status === "not_ready"
                    ? "Server tekshiruvi 503 qaytardi — ma'lumotlar bazasi tayyor emas."
                    : `Tekshirilgan vaqt: ${formatTime(health.data.time)} (Asia/Tashkent).`
                }
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
            <p className="st-hidden-lead">
              Bu qiymatlar server muhiti yoki kodida saqlanadi. Admin panel ularni ko‘rsatmaydi va o‘zgartirmaydi —
              holat taxmin qilinmaydi.
            </p>
            <ul className="st-hidden-list">
              {NOT_EXPOSED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Section(props: {
  id: string;
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
        <div className="st-section-text">
          <h2 id={`${props.id}-title`} className="st-section-title">{props.title}</h2>
          <p className="st-section-lead">{props.lead}</p>
        </div>
        <span className="st-source" title="Ma'lumot manbasi">{props.source}</span>
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
  title: string;
  desc?: ReactNode;
  source: string;
  value: ReactNode | null;
  status?: { tone: Tone; label: string };
  missing?: string;
  children?: ReactNode;
}) {
  return (
    <div className="st-row">
      <div className="st-row-main">
        <div className="st-row-title">{props.title}</div>
        {props.desc ? <p className="st-row-desc">{props.desc}</p> : null}
        <p className="st-row-source">Manba: {props.source}</p>
        {props.missing && (props.value == null || props.value === "") ? (
          <p className="st-row-missing" role="status">{props.missing}</p>
        ) : null}
        {props.children}
      </div>
      <div className="st-row-aside">
        {props.value != null && props.value !== "" ? (
          <span className="st-value">{props.value}</span>
        ) : (
          <span className="st-value is-missing">—</span>
        )}
        <span className="st-badges">
          {props.status ? <StatusBadge tone={props.status.tone}>{props.status.label}</StatusBadge> : null}
          <span className="st-readonly" title={READ_ONLY}>Faqat ko‘rish</span>
        </span>
      </div>
    </div>
  );
}

function CashbackRows(props: { rules: Rules }) {
  const r = props.rules;
  const maxSpendPercent = finite(r.maxSpendPercent);
  const minPurchase = finite(r.minPurchase);
  const ttlDays = finite(r.ttlDays);
  const tiers = Array.isArray(r.tiers) ? r.tiers : [];
  const earnWhen = Array.isArray(r.earnWhen) ? r.earnWhen.map(String) : [];
  const spendWhen = Array.isArray(r.spendWhen) ? r.spendWhen.map(String) : [];
  return (
    <>
      <SettingRow
        title="Cashback ishlatish limiti"
        desc="Mahsulotlar summasining eng ko‘p shu qismi cashback bilan to‘lanadi (yetkazib berish haqidan emas)."
        source="Server sozlamasi · system_settings (standart 30%)"
        value={maxSpendPercent != null ? `${maxSpendPercent}%` : null}
      />
      <SettingRow
        title="Minimal xarid summasi"
        desc="Server cashback hisob-kitobida mahsulot summasi uchun minimal chegara sifatida qo‘llaydi."
        source="Server kodi · o‘zgarmas qiymat"
        value={minPurchase != null ? money(minPurchase) : null}
      />
      <SettingRow
        title="Loyalty darajalari"
        desc="Mijozning jami xaridi bo‘yicha daraja va undan keyingi xaridlardan cashback foizi."
        source="Server kodi · o‘zgarmas qiymat"
        value={tiers.length ? `${tiers.length} ta daraja` : null}
      >
        {tiers.length ? (
          <table className="st-tiers">
            <thead>
              <tr>
                <th scope="col">Daraja</th>
                <th scope="col">Cashback</th>
                <th scope="col">Jami xarid</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={`${t.tier || "tier"}-${i}`}>
                  <td>{t.tier || "—"}</td>
                  <td>{t.rate || "—"}</td>
                  <td>{finite(t.fromTotal) != null ? `${money(Number(t.fromTotal))} dan` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </SettingRow>
      <SettingRow
        title="Cashback amal qilish muddati"
        desc="Qoidalarda e’lon qilingan. Muddati o‘tgan cashbackni hisobdan chiqaradigan server jarayoni hozircha yo‘q."
        source="Server kodi · o‘zgarmas qiymat"
        value={ttlDays != null ? `${ttlDays} kun` : null}
        status={ttlDays != null ? { tone: "warn", label: "Serverda qo‘llanmaydi" } : undefined}
      />
      {earnWhen.length || spendWhen.length ? (
        <details className="st-rules-text">
          <summary>Hisoblash va ishlatish shartlari (server matni)</summary>
          <div className="st-rules-grid">
            {earnWhen.length ? (
              <div>
                <h3 className="st-rules-head">Cashback qachon hisoblanadi</h3>
                <ul className="st-rules-list">
                  {earnWhen.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ) : null}
            {spendWhen.length ? (
              <div>
                <h3 className="st-rules-head">Cashback qachon ishlatiladi</h3>
                <ul className="st-rules-list">
                  {spendWhen.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  );
}

function BranchRows(props: { rows: BranchRow[] }) {
  const rows = props.rows;
  const total = rows.length;
  const tally = (pick: (b: BranchRow) => boolean) => rows.filter(pick).length;
  const payme = tally((b) => b.hasPayme === true);
  const click = tally((b) => b.hasClick === true);
  const open = tally((b) => b.isOpen === true);
  const allDay = tally((b) => b.is24h === true);
  const configured = rows.filter((b) => b.hasPayme === true || b.hasClick === true);
  const of = (n: number) => (total ? `${n} / ${total}` : null);
  const providerStatus = (n: number): { tone: Tone; label: string } =>
    n === 0 ? { tone: "neutral", label: "Sozlanmagan" } : n === total ? { tone: "ok", label: "Barchasida sozlangan" } : { tone: "info", label: "Qisman sozlangan" };
  if (!total) {
    return <p className="st-empty">Filiallar ro‘yxati bo‘sh — ko‘rsatiladigan filial sozlamasi yo‘q.</p>;
  }
  return (
    <>
      <SettingRow
        title="Payme kabineti sozlangan filiallar"
        desc="Kabinet ID va maxfiy kalit ikkalasi saqlangan filiallar soni."
        source="Filial yozuvlari · hasPayme"
        value={of(payme)}
        status={providerStatus(payme)}
      />
      <SettingRow
        title="Click kabineti sozlangan filiallar"
        desc="Kabinet ID va maxfiy kalit ikkalasi saqlangan filiallar soni."
        source="Filial yozuvlari · hasClick"
        value={of(click)}
        status={providerStatus(click)}
      />
      <SettingRow
        title="Ochiq filiallar"
        desc="Filial yozuvida “ochiq” deb belgilangan filiallar."
        source="Filial yozuvlari · isOpen"
        value={of(open)}
      />
      <SettingRow
        title="24/7 ishlaydigan filiallar"
        desc="Kechayu kunduz ishlaydi deb belgilangan filiallar."
        source="Filial yozuvlari · is24h"
        value={of(allDay)}
      />
      {configured.length ? (
        <ul className="st-branch-list" aria-label="To‘lov kabineti sozlangan filiallar">
          {configured.map((b) => (
            <li key={b.id}>
              <span className="st-branch-name">{b.name || `Filial #${b.id}`}</span>
              <span className="st-badges">
                {b.hasPayme ? <StatusBadge tone="ok">Payme</StatusBadge> : null}
                {b.hasClick ? <StatusBadge tone="ok">Click</StatusBadge> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
