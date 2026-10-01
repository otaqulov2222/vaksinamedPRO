import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { request, money, isHqRole, type AdminUser, type ApiError } from "../api";
import {
  AdminPageHeader,
  FilterBar,
  FilterField,
  StatCard,
  DataTable,
  StatusBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Server business day — api-server lib/adminOrderOps.ts tashkentBusinessDayUtcRange. */
const BUSINESS_TZ = "Asia/Tashkent";

type Preset = "today" | "yesterday" | "7d" | "30d" | "all" | "custom";
type Tone = "ok" | "warn" | "danger" | "neutral" | "info";
type Range = { from: string; to: string };
type LoadError = { kind: "session" | "forbidden" | "notfound" | "invalid" | "network" | "failed"; message: string };

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "today", label: "Bugun" },
  { id: "yesterday", label: "Kecha" },
  { id: "7d", label: "7 kun" },
  { id: "30d", label: "30 kun" },
  { id: "all", label: "Barcha davr" },
  { id: "custom", label: "Maxsus" },
];

/**
 * Order status breakdown — server counts over legacy orders.status, which deriveLegacyStatus
 * (orderTransitions.ts) writes from the P5 axes on every transition.
 */
const BREAKDOWN: Array<{ key: string; label: string; tone: Tone; note: string }> = [
  { key: "completed", label: "Yakunlangan", tone: "ok", note: "Buyurtma bajarilgan — tushumga kiradi." },
  { key: "delivering", label: "Ochiq — yetkazib berish", tone: "info", note: "Yetkazish buyurtmalari, hali yakunlanmagan." },
  { key: "reserved", label: "Ochiq — olib ketish", tone: "info", note: "Filialdan olib ketish, hali yakunlanmagan." },
  { key: "pendingPayment", label: "To‘lov kutilmoqda", tone: "warn", note: "Onlayn to‘lov yoki tasdiqlash kutilmoqda." },
  { key: "cancelled", label: "Bekor qilingan", tone: "neutral", note: "Tushumga kirmaydi." },
];

/** Reports the API does not provide — shown as unavailable, never approximated in the browser. */
const UNAVAILABLE: Array<{ title: string; detail: string }> = [
  { title: "Kunlik grafik", detail: "Davr bo‘yicha kunlik qator (time-series) API’da yo‘q." },
  { title: "Oldingi davr bilan taqqoslash", detail: "Taqqoslash qiymatlari API’da yo‘q." },
  { title: "Filiallar kesimi", detail: "Filiallar bo‘yicha agregat API’da yo‘q — bitta filialni tanlab ko‘rish mumkin." },
  { title: "To‘lovlar hisoboti", detail: "To‘lov holati va provayder bo‘yicha agregat API’da yo‘q." },
  { title: "Kassa (POS) savdosi", detail: "POS sotuvlari agregati API’da yo‘q — kassa sotuvlari bu hisobotga kirmaydi." },
  { title: "Cashback davr kesimi", detail: "Hisoblangan / ishlatilgan cashback davr bo‘yicha agregati API’da yo‘q." },
  { title: "Yetkazib berish hisoboti", detail: "Yetkazish holati va kuryer bo‘yicha agregat API’da yo‘q." },
  { title: "Mahsulot / kategoriya kesimi", detail: "Mahsulot bo‘yicha savdo agregati API’da yo‘q." },
  { title: "Hisobotni eksport qilish", detail: "Export API mavjud emas." },
];

function statusOf(err: unknown): number {
  return err && typeof err === "object" && "status" in err ? Number((err as ApiError).status) || 0 : 0;
}

function codeOf(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String((err as ApiError).code || "") : "";
}

function loadError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Hisobotlarni ko‘rish uchun ruxsat yo‘q." };
  if (status === 404) return { kind: "notfound", message: "Hisobot manbasi topilmadi." };
  if (status === 400 && codeOf(err) === "INVALID_DATE_FILTER") {
    return { kind: "invalid", message: "Sana noto‘g‘ri. Davrni qayta tanlang." };
  }
  if (!status) return { kind: "network", message: "Server bilan aloqa yo‘q. Internet aloqasini tekshirib, qayta urinib ko‘ring." };
  return { kind: "failed", message: "Hisobotni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring." };
}

function tashkentToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function presetRange(preset: Preset, custom: Range): Range {
  const today = tashkentToday();
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") return { from: shiftYmd(today, -1), to: shiftYmd(today, -1) };
  if (preset === "7d") return { from: shiftYmd(today, -6), to: today };
  if (preset === "30d") return { from: shiftYmd(today, -29), to: today };
  if (preset === "custom") return custom;
  return { from: "", to: "" };
}

function displayYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}.${m}.${y}` : ymd;
}

function periodText(range: Range): string {
  if (!range.from && !range.to) return "Barcha davr";
  if (range.from === range.to) return displayYmd(range.from);
  return `${range.from ? displayYmd(range.from) : "…"} — ${range.to ? displayYmd(range.to) : "…"}`;
}

function clock(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function count(value: unknown): ReactNode {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function ReportsPage(props: {
  token: string;
  user: AdminUser | null;
  branches: any[];
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [preset, setPreset] = useState<Preset>("30d");
  const [branchId, setBranchId] = useState("");
  const [custom, setCustom] = useState<Range>({ from: "", to: "" });
  const [draft, setDraft] = useState<Range>({ from: "", to: "" });
  const [draftMsg, setDraftMsg] = useState("");
  const loadSeq = useRef(0);
  const branchSelectRef = useRef<HTMLSelectElement>(null);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const range = presetRange(preset, custom);
  const customPending = preset === "custom" && !custom.from && !custom.to;

  async function load() {
    if (customPending) return;
    const qs = new URLSearchParams();
    if (branchId) qs.set("branchId", branchId);
    if (range.from) qs.set("createdFrom", range.from);
    if (range.to) qs.set("createdTo", range.to);
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const body = await request(`/api/admin/dashboard${qs.toString() ? `?${qs}` : ""}`, props.token);
      if (seq !== loadSeq.current) return;
      setData(body);
      setLoadedAt(new Date());
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setData(null);
      setError(loadError(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, branchId, range.from, range.to, customPending]);

  function choosePreset(next: Preset) {
    setPreset(next);
    if (next === "custom") {
      setDraft(custom.from || custom.to ? custom : { from: shiftYmd(tashkentToday(), -6), to: tashkentToday() });
      setDraftMsg("");
    }
  }

  function applyCustom(e: FormEvent) {
    e.preventDefault();
    if (!draft.from || !draft.to) {
      setDraftMsg("Boshlanish va tugash sanasini tanlang.");
      return;
    }
    if (draft.from > draft.to) {
      setDraftMsg("Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas.");
      return;
    }
    setDraftMsg("");
    setCustom({ ...draft });
  }

  function showAllTime() {
    setPreset("all");
    setBranchId("");
  }

  const kpis = data?.kpis;
  const inventory = data?.inventory;
  const hasKpis = Boolean(kpis) && !error;
  const initialLoading = loading && !data && !error;
  const ordersTotal = hasKpis ? Number(kpis.orders) : NaN;
  const scoped = Boolean(range.from || range.to || branchId);
  const branchName = !isHq
    ? "O‘z filiali"
    : branchId
      ? props.branches.find((b) => String(b.id) === branchId)?.name || "Tanlangan filial"
      : "Barcha filiallar";
  const period = periodText(range);
  const kpi = (key: string): ReactNode => (hasKpis ? count(kpis[key]) : "—");

  return (
    <div className="reports-page page-module">
      <AdminPageHeader
        title="Hisobotlar"
        description={PAGE_DESCRIPTIONS.reports}
        meta={
          <span className="rp-meta">
            <span className="rp-chip">Davr bo‘yicha agregat · faqat ko‘rish</span>
            <span className="rp-chip">{isHq ? "Barcha filiallar yoki bitta filial" : "Faqat o‘z filialingiz"}</span>
            <span className="rp-chip">Export API mavjud emas</span>
          </span>
        }
        actions={
          <button
            className={`btn-secondary rp-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading || customPending}
            onClick={() => void load()}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <section className="rp-controls" aria-label="Hisobot filtrlari">
        <FilterBar
          meta={
            <span className="rp-controls-note">
              Davr va filial serverda qo‘llanadi. Davr — buyurtma yaratilgan kun ({BUSINESS_TZ} biznes kuni).
            </span>
          }
        >
          <div className="filter-field rp-presets-field">
            <span className="filter-label" id="rp-period-label">Davr</span>
            <div className="rp-presets" role="group" aria-labelledby="rp-period-label">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`rp-preset${preset === p.id ? " is-active" : ""}`}
                  aria-pressed={preset === p.id}
                  onClick={() => choosePreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {isHq ? (
            <FilterField label="Filial">
              <select ref={branchSelectRef} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Barcha filiallar</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </FilterField>
          ) : null}
        </FilterBar>
        {preset === "custom" ? (
          <form className="rp-custom" onSubmit={applyCustom} aria-label="Maxsus davr">
            <FilterField label="Dan">
              <input
                type="date"
                value={draft.from}
                max={tashkentToday()}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, from: e.target.value }));
                  setDraftMsg("");
                }}
              />
            </FilterField>
            <FilterField label="Gacha">
              <input
                type="date"
                value={draft.to}
                max={tashkentToday()}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, to: e.target.value }));
                  setDraftMsg("");
                }}
              />
            </FilterField>
            <button className="btn-primary rp-custom-apply" type="submit">Qo‘llash</button>
            {draftMsg ? <p className="rp-form-msg" role="alert">{draftMsg}</p> : null}
          </form>
        ) : null}
      </section>

      <div className="rp-context" aria-live="polite">
        <span className="rp-context-main">{customPending ? "Maxsus davrni tanlang" : period}</span>
        <span className="rp-context-hint">{branchName}</span>
        <span className="rp-context-hint">{BUSINESS_TZ}</span>
        {loadedAt && hasKpis ? <span className="rp-context-hint">Yangilangan {clock(loadedAt)}</span> : null}
      </div>

      {error ? (
        <ErrorState
          message={error.message}
          onRetry={error.kind === "failed" || error.kind === "network" ? () => void load() : undefined}
        />
      ) : customPending ? (
        <EmptyState
          title="Maxsus davr tanlanmagan."
          description="Boshlanish va tugash sanasini tanlab, «Qo‘llash» tugmasini bosing."
        />
      ) : (
        <div className={`rp-body${loading && data ? " is-refreshing" : ""}`} aria-busy={loading}>
          <section className="rp-section" aria-labelledby="rp-sales-title">
            <div className="rp-section-head">
              <h2 className="rp-section-title" id="rp-sales-title">Savdo va buyurtmalar</h2>
              <span className="rp-section-scope">{period} · {branchName}</span>
            </div>
            <div className="rp-kpis" role="group" aria-label="Ko‘rsatkichlar: tanlangan davr">
              <StatCard
                className="rp-kpi rp-kpi-hero"
                label="Tushum"
                value={hasKpis ? money(Number(kpis.revenue)) : "—"}
                context="Yakunlangan buyurtmalar summasi"
              />
              <StatCard className="rp-kpi" label="Buyurtmalar" value={kpi("orders")} context="Davrda yaratilgan" />
              <StatCard className="rp-kpi" label="Yakunlangan" value={kpi("completed")} context="Bajarilgan buyurtmalar" />
              <StatCard className="rp-kpi" label="Bekor qilingan" value={kpi("cancelled")} context="Tushumga kirmaydi" />
            </div>
            <p className="rp-note">
              Tushum — davrda yaratilgan va hozir «Yakunlangan» holatdagi buyurtmalarning yakuniy summasi (cashback
              chegirmasidan keyin, yetkazish to‘lovi bilan). Qaytarishlar ayirilmaydi, to‘lov holati alohida hisobga
              olinmaydi. Kassa (POS) sotuvlari kirmaydi.
            </p>

            <div className="rp-surface surface-table">
              <div className="rp-surface-head">
                <h3 className="rp-surface-title">Buyurtmalar holati bo‘yicha</h3>
              </div>
              {initialLoading ? (
                <LoadingBlock rows={4} label="Hisobot yuklanmoqda…" />
              ) : hasKpis && ordersTotal === 0 ? (
                <div className="rp-empty" role="status">
                  <div className="empty-title">
                    {scoped ? "Bu davr uchun ma’lumot yo‘q." : "Hozircha buyurtmalar yo‘q."}
                  </div>
                  <p className="empty-desc">
                    {scoped
                      ? "Tanlangan davr va filialda yaratilgan buyurtma topilmadi."
                      : "Mijozlar buyurtma bergach, hisobot shu yerda to‘ladi."}
                  </p>
                  {scoped ? (
                    <button className="btn-tertiary" type="button" onClick={showAllTime}>
                      Barcha davr va filiallarni ko‘rish
                    </button>
                  ) : null}
                </div>
              ) : hasKpis ? (
                <DataTable>
                  <thead>
                    <tr>
                      <th>Holat</th>
                      <th className="num">Soni</th>
                      <th className="rp-col-note">Izoh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BREAKDOWN.map((row) => (
                      <tr key={row.key} className="rp-row">
                        <td className="rp-cell-label"><StatusBadge tone={row.tone}>{row.label}</StatusBadge></td>
                        <td className="num rp-cell-count">{count(kpis[row.key])}</td>
                        <td className="rp-col-note"><span className="rp-cell-note">{row.note}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="rp-total-row">
                      <td>Jami buyurtmalar</td>
                      <td className="num rp-cell-count">{count(kpis.orders)}</td>
                      <td className="rp-col-note"><span className="rp-cell-note">Server hisobi</span></td>
                    </tr>
                  </tfoot>
                </DataTable>
              ) : null}
            </div>
            <p className="rp-note">
              Holatlar serverda buyurtmaning umumiy holati bo‘yicha sanaladi; «Ochiq — yetkazib berish» kuryer yo‘lda
              ekanini emas, yetkazish buyurtmasi hali yakunlanmaganini bildiradi.
            </p>
          </section>

          <section className="rp-section" aria-labelledby="rp-global-title">
            <div className="rp-section-head">
              <h2 className="rp-section-title" id="rp-global-title">Umumiy holat</h2>
              <span className="rp-section-scope">Joriy holat · davr va filial filtriga bog‘liq emas</span>
            </div>
            <div className="rp-kpis rp-kpis-global" role="group" aria-label="Umumiy ko‘rsatkichlar">
              <StatCard className="rp-kpi" variant="secondary" label="Mijozlar" value={kpi("customers")} context="Ro‘yxatdan o‘tgan mijozlar" />
              <StatCard
                className="rp-kpi"
                variant="secondary"
                label="Cashback majburiyati"
                value={hasKpis ? money(Number(kpis.cashback)) : "—"}
                context="Mijozlar hisobidagi cashback qoldig‘i"
              />
              <StatCard className="rp-kpi" variant="secondary" label="Filiallar" value={kpi("branches")} context="Tarmoqdagi filiallar" />
            </div>
          </section>

          <section className="rp-section" aria-labelledby="rp-stock-title">
            <div className="rp-section-head">
              <h2 className="rp-section-title" id="rp-stock-title">Ombor holati</h2>
              <span className="rp-section-scope">
                {inventory ? `${branchName} · joriy qoldiq, davrga bog‘liq emas` : "Filial bo‘yicha joriy qoldiq"}
              </span>
            </div>
            {initialLoading ? (
              <LoadingBlock rows={3} label="Ombor holati yuklanmoqda…" />
            ) : !hasKpis ? null : inventory ? (
              <>
                <div className="rp-kpis rp-kpis-stock">
                  <StatCard className="rp-kpi" variant="secondary" label="Ombor qatorlari" value={count(inventory.stockRows)} context="Filialdagi mahsulot qatorlari" />
                  <StatCard
                    className="rp-kpi"
                    variant="secondary"
                    tone={Number(inventory.zeroAvailable) > 0 ? "warn" : undefined}
                    label="Mavjud emas"
                    value={count(inventory.zeroAvailable)}
                    context="Sotish uchun mavjud qoldiq 0"
                  />
                </div>
                {Array.isArray(inventory.items) && inventory.items.length ? (
                  <div className="rp-surface surface-table rp-stock">
                    <div className="rp-surface-head">
                      <h3 className="rp-surface-title">Eng kam mavjud qoldiq</h3>
                    </div>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Mahsulot</th>
                          <th className="num rp-col-axis">Jismoniy</th>
                          <th className="num rp-col-axis">Bron</th>
                          <th className="num">Mavjud</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory.items.map((item: any) => (
                          <tr key={item.productId} className="rp-stock-row">
                            <td className="rp-stock-main">
                              <span className="rp-stock-name">{item.nameUz || "—"}</span>
                              <span className="rp-stock-sku">{item.sku || "—"}</span>
                            </td>
                            <td className="num rp-col-axis" data-label="Jismoniy">{count(item.physical)}</td>
                            <td className="num rp-col-axis" data-label="Bron">{count(item.reserved)}</td>
                            <td className="num rp-stock-available" data-label="Mavjud">
                              {Number(item.available) <= 0 ? <StatusBadge tone="danger">{count(item.available)}</StatusBadge> : count(item.available)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                ) : (
                  <EmptyState title="Bu filialda ombor qatorlari yo‘q." />
                )}
                <p className="rp-note">Past qoldiq chegarasi API’da yo‘q — mavjud qoldig‘i eng kam 12 qator ko‘rsatiladi.</p>
              </>
            ) : (
              <div className="rp-empty rp-empty-inline" role="status">
                <div className="empty-title">Ombor holati filial tanlanganda ko‘rsatiladi.</div>
                <p className="empty-desc">Server ombor qoldig‘ini faqat bitta filial bo‘yicha qaytaradi.</p>
                {isHq ? (
                  <button className="btn-tertiary" type="button" onClick={() => branchSelectRef.current?.focus()}>
                    Filial tanlash
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}

      <section className="rp-section rp-unavailable" aria-labelledby="rp-unavailable-title">
        <div className="rp-section-head">
          <h2 className="rp-section-title" id="rp-unavailable-title">Hali ulanmagan hisobotlar</h2>
          <span className="rp-section-scope">Alohida API yo‘q — brauzerda taxminiy hisoblanmaydi</span>
        </div>
        <ul className="rp-unavailable-list">
          {UNAVAILABLE.map((item) => (
            <li key={item.title} className="rp-unavailable-item">
              <div className="rp-unavailable-row">
                <span className="rp-unavailable-name">{item.title}</span>
                <StatusBadge tone="neutral">Hali ulanmagan</StatusBadge>
              </div>
              <p className="rp-unavailable-detail">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
