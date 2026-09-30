import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { request, money } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  DetailDrawer,
  DrawerSection,
  FeedbackBanner,
  ErrorState,
  Tabs,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Marketing-only contract — not a pricing engine (checkout / POS / cashback ignore promos). */
const PROMO_CONTRACT = "PROMO_MARKETING_ONLY";
const PROMO_COLUMNS = 4;
const REWARD_COLUMNS = 3;

type View = "promos" | "rewards";
type StatusFilter = "" | "active" | "inactive";
type LoadError = { kind: "forbidden" | "session" | "failed"; message: string };
type Selection = { kind: View; item: any } | null;

/**
 * Presentation-only: free text that reads like a price / discount / cashback promise.
 * Nothing in the system enforces such text, so the operator is told so.
 */
const CLAIM_RE = /%|chegirma|cashback|keshbek|bonus|скидк|кешбэк|бонус/i;

function statusOf(err: unknown) {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
}

function loadError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Aksiyalarni ko‘rish uchun ruxsat yo‘q." };
  return { kind: "failed", message: "Aksiyalarni yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring." };
}

function hasClaim(...parts: unknown[]) {
  return CLAIM_RE.test(parts.map((p) => String(p ?? "")).join(" "));
}

function matches(q: string, ...parts: unknown[]) {
  return !q || parts.map((p) => String(p ?? "")).join(" ").toLowerCase().includes(q);
}

export function PromosPage(props: { token: string }) {
  const [promos, setPromos] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [view, setView] = useState<View>("promos");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [selection, setSelection] = useState<Selection>(null);
  const loadSeq = useRef(0);

  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await request("/api/admin/promos", props.token);
      if (seq !== loadSeq.current) return;
      setPromos(Array.isArray(data?.promos) ? data.promos : []);
      setRewards(Array.isArray(data?.rewards) ? data.rewards : []);
      setLoaded(true);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setPromos([]);
      setRewards([]);
      setError(loadError(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  useEffect(() => {
    if (!selection) return;
    const source = selection.kind === "promos" ? promos : rewards;
    const next = source.find((p) => p.id === selection.item.id);
    if (next && next !== selection.item) setSelection({ kind: selection.kind, item: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promos, rewards]);

  const q = appliedQuery.trim().toLowerCase();
  const promoFilters = Boolean(q || statusFilter);
  const rewardFilters = Boolean(q);
  const hasFilters = view === "promos" ? promoFilters : rewardFilters;

  const counts = useMemo(() => {
    const active = promos.filter((p) => Boolean(p.active)).length;
    return {
      active,
      inactive: promos.length - active,
      claims: promos.filter((p) => hasClaim(p.title, p.subtitle, p.tag)).length,
    };
  }, [promos]);

  const visiblePromos = useMemo(
    () =>
      promos.filter((item) => {
        if (statusFilter === "active" && !item.active) return false;
        if (statusFilter === "inactive" && item.active) return false;
        return matches(q, item.title, item.subtitle, item.tag);
      }),
    [promos, q, statusFilter],
  );

  const visibleRewards = useMemo(
    () => rewards.filter((item) => matches(q, item.title, item.subtitle, item.code)),
    [rewards, q],
  );

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    setAppliedQuery(query);
  }

  function onSearchChange(value: string) {
    setQuery(value);
    if (!value) setAppliedQuery("");
  }

  function resetFilters() {
    setQuery("");
    setAppliedQuery("");
    setStatusFilter("");
  }

  function rowKeys(open: () => void) {
    return (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    };
  }

  const initialLoading = loading && !loaded;
  const selected = selection?.item || null;
  const selectedClaim = selected
    ? selection?.kind === "promos"
      ? hasClaim(selected.title, selected.subtitle, selected.tag)
      : hasClaim(selected.title, selected.subtitle)
    : false;

  const tabs = [
    { id: "promos", label: loaded ? `Aksiyalar · ${promos.length}` : "Aksiyalar" },
    { id: "rewards", label: loaded ? `Cashback sovg‘alari · ${rewards.length}` : "Cashback sovg‘alari" },
  ];

  return (
    <div className="promos-page page-module">
      <AdminPageHeader
        title="Aksiyalar"
        description={PAGE_DESCRIPTIONS.promos}
        meta={<span className="pr-readonly">Faqat ko‘rish — yozish API mavjud emas</span>}
        actions={
          <button
            className={`btn-secondary pr-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <p className="pr-contract">
        Aksiyalar — mijoz ilovasidagi marketing bannerlari. Narx, buyurtma, POS va cashback hisobiga ta’sir qilmaydi;
        narx katalogda, cashback — Cashback / Loyalty modulida.
      </p>

      <div className="pr-tabs">
        <Tabs tabs={tabs} active={view} onChange={(id) => setView(id as View)} />
      </div>

      <section className="pr-controls" aria-label="Aksiyalar qidiruvi va filtrlari">
        <form className="pr-search" role="search" onSubmit={applySearch}>
          <FilterField label="Qidiruv" grow>
            <span className="pr-search-box">
              <Search size={15} strokeWidth={2} aria-hidden="true" className="pr-search-icon" />
              <input
                type="search"
                value={query}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={view === "promos" ? "Sarlavha, matn yoki teg" : "Nomi, tavsif yoki kod"}
                enterKeyHint="search"
              />
            </span>
          </FilterField>
          <button className="btn-secondary pr-search-go" type="submit" disabled={initialLoading}>
            Qidirish
          </button>
        </form>
        {view === "promos" ? (
          <FilterField label="Holat">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="">Barchasi</option>
              <option value="active">Faol</option>
              <option value="inactive">Nofaol</option>
            </select>
          </FilterField>
        ) : null}
      </section>

      <div className="pr-summary" aria-live="polite">
        {initialLoading ? (
          <span className="pr-result-count">Yuklanmoqda…</span>
        ) : error ? (
          <span className="pr-result-count">—</span>
        ) : view === "promos" ? (
          <>
            <span className="pr-result-count">
              {promoFilters ? `${visiblePromos.length} / ${promos.length} ta aksiya` : `${promos.length} ta aksiya`}
            </span>
            <span className="pr-summary-hint is-ok">{counts.active} faol</span>
            <span className="pr-summary-hint">{counts.inactive} nofaol</span>
            {counts.claims ? (
              <span className="pr-summary-hint is-warn">{counts.claims} tasida matnda va’da</span>
            ) : null}
          </>
        ) : (
          <span className="pr-result-count">
            {rewardFilters ? `${visibleRewards.length} / ${rewards.length} ta sovg‘a` : `${rewards.length} ta sovg‘a`}
          </span>
        )}
        {hasFilters && !error ? (
          <>
            <span className="pr-summary-hint">Filtr qo‘llangan</span>
            <button className="btn-tertiary" type="button" onClick={resetFilters}>
              Tozalash
            </button>
          </>
        ) : null}
        <span className="pr-summary-note">To‘liq ro‘yxat yuklanadi · qidiruv shu ro‘yxat bo‘yicha</span>
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={error.kind === "failed" ? () => void load() : undefined} />
      ) : view === "promos" ? (
        <div
          className={`pr-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !visiblePromos.length ? " is-empty" : ""}`}
          aria-busy={loading}
        >
          <DataTable sticky>
            <thead>
              <tr>
                <th>Aksiya</th>
                <th>Holat</th>
                <th className="pr-col-tag">Teg</th>
                <th>Banner matni</th>
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="pr-skeleton-row" aria-hidden="true">
                    {Array.from({ length: PROMO_COLUMNS }).map((__, c) => (
                      <td key={c}><span className="pr-skeleton" /></td>
                    ))}
                  </tr>
                ))
              ) : visiblePromos.length === 0 ? (
                <tr className="pr-empty-row">
                  <td colSpan={PROMO_COLUMNS}>
                    <div className="pr-empty" role="status">
                      <div className="empty-title">
                        {promoFilters ? "Tanlangan shartlar bo‘yicha aksiya topilmadi." : "Aksiyalar mavjud emas."}
                      </div>
                      <p className="empty-desc">
                        {promoFilters
                          ? "Qidiruv so‘zini yoki holat filtrini o‘zgartiring."
                          : "Ma’lumotlar bazasida aksiya yozuvi yo‘q. Admin panelda aksiya yaratish API’si mavjud emas."}
                      </p>
                      {promoFilters ? (
                        <button className="btn-tertiary" type="button" onClick={resetFilters}>
                          Filtrlarni tozalash
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                visiblePromos.map((item) => {
                  const active = selection?.kind === "promos" && selected?.id === item.id;
                  const on = Boolean(item.active);
                  const claim = hasClaim(item.title, item.subtitle, item.tag);
                  const open = () => setSelection({ kind: "promos", item });
                  return (
                    <tr
                      key={item.id}
                      className={`pr-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={open}
                      onKeyDown={rowKeys(open)}
                    >
                      <td className="pr-cell-main">
                        <div className="pr-title">{item.title || "—"}</div>
                        <div className="pr-sub">
                          <span className="pr-id">#{item.id}</span>
                          {claim ? <span className="pr-claim">Matnda va’da — tizim qo‘llamaydi</span> : null}
                        </div>
                      </td>
                      <td className="pr-cell-status">
                        <StatusBadge tone={on ? "ok" : "neutral"}>{on ? "Faol" : "Nofaol"}</StatusBadge>
                      </td>
                      <td className="pr-cell-tag">
                        {item.tag ? <span className="pr-tag">{item.tag}</span> : <span className="pr-muted">—</span>}
                      </td>
                      <td className="pr-cell-text">{item.subtitle || <span className="pr-muted">—</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
        </div>
      ) : (
        <div
          className={`pr-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !visibleRewards.length ? " is-empty" : ""}`}
          aria-busy={loading}
        >
          <p className="pr-surface-note">
            Mijoz sovg‘ani o‘z cashback balansidan bir marta almashtiradi (Cashback / Loyalty engine). Bu aksiya emas.
          </p>
          <DataTable sticky>
            <thead>
              <tr>
                <th>Sovg‘a</th>
                <th>Tavsif</th>
                <th className="num">Cashback narxi</th>
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="pr-skeleton-row" aria-hidden="true">
                    {Array.from({ length: REWARD_COLUMNS }).map((__, c) => (
                      <td key={c} className={c === 2 ? "num" : undefined}><span className="pr-skeleton" /></td>
                    ))}
                  </tr>
                ))
              ) : visibleRewards.length === 0 ? (
                <tr className="pr-empty-row">
                  <td colSpan={REWARD_COLUMNS}>
                    <div className="pr-empty" role="status">
                      <div className="empty-title">
                        {rewardFilters ? "Tanlangan shartlar bo‘yicha sovg‘a topilmadi." : "Cashback sovg‘alari mavjud emas."}
                      </div>
                      {rewardFilters ? (
                        <button className="btn-tertiary" type="button" onClick={resetFilters}>
                          Filtrlarni tozalash
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                visibleRewards.map((item) => {
                  const active = selection?.kind === "rewards" && selected?.id === item.id;
                  const claim = hasClaim(item.title, item.subtitle);
                  const open = () => setSelection({ kind: "rewards", item });
                  return (
                    <tr
                      key={item.id}
                      className={`pr-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={open}
                      onKeyDown={rowKeys(open)}
                    >
                      <td className="pr-cell-main">
                        <div className="pr-title">{item.title || "—"}</div>
                        <div className="pr-sub">
                          <span className="pr-id">{item.code || `#${item.id}`}</span>
                          {claim ? <span className="pr-claim">Nomda chegirma va’dasi — narxga qo‘llanmaydi</span> : null}
                        </div>
                      </td>
                      <td className="pr-cell-text">{item.subtitle || <span className="pr-muted">—</span>}</td>
                      <td className="num pr-cell-points">{money(Number(item.points || 0))}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
        </div>
      )}

      <DetailDrawer
        open={Boolean(selection)}
        width="md"
        title={String(selected?.title || (selection?.kind === "rewards" ? "Sovg‘a" : "Aksiya"))}
        subtitle={
          selection?.kind === "promos"
            ? `Aksiya #${selected?.id}`
            : selection?.kind === "rewards"
              ? `Cashback sovg‘asi · ${selected?.code || `#${selected?.id}`}`
              : undefined
        }
        status={
          selection?.kind === "promos" ? (
            <StatusBadge tone={selected?.active ? "ok" : "neutral"}>{selected?.active ? "Faol" : "Nofaol"}</StatusBadge>
          ) : undefined
        }
        onClose={() => setSelection(null)}
      >
        {selection?.kind === "promos" && selected ? (
          <>
            {selectedClaim ? (
              <FeedbackBanner tone="warn">
                Matnda foiz, chegirma yoki cashback va’dasi bor. Tizimda aksiya engine yo‘q — bu va’da mijozga
                avtomatik bajarilmaydi.
              </FeedbackBanner>
            ) : null}
            <DrawerSection title="Aksiya">
              <dl className="pr-kv">
                <div>
                  <dt>Sarlavha</dt>
                  <dd className="pr-kv-strong">{selected.title || "—"}</dd>
                </div>
                <div>
                  <dt>Banner matni</dt>
                  <dd>{selected.subtitle || "—"}</dd>
                </div>
                <div>
                  <dt>Teg</dt>
                  <dd>
                    {selected.tag || "—"}
                    {selected.tag ? <span className="pr-kv-hint">Erkin matn — muddat sifatida tekshirilmaydi</span> : null}
                  </dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Holat">
              <dl className="pr-kv">
                <div>
                  <dt>Holat</dt>
                  <dd>{selected.active ? "Faol" : "Nofaol"}</dd>
                </div>
                <div>
                  <dt>Mijoz ilovasi</dt>
                  <dd>{selected.active ? "Aksiyalar ekranida ko‘rinadi" : "Ko‘rinmaydi — ilovaga faqat faol aksiyalar chiqadi"}</dd>
                </div>
              </dl>
              <p className="pr-note">Holatni yoki matnni admin API orqali o‘zgartirib bo‘lmaydi.</p>
            </DrawerSection>
            <DrawerSection title="Ta’sir">
              <dl className="pr-kv">
                <div>
                  <dt>Narx va buyurtma</dt>
                  <dd>Ta’sir qilmaydi</dd>
                </div>
                <div>
                  <dt>Kassa POS</dt>
                  <dd>Ta’sir qilmaydi</dd>
                </div>
                <div>
                  <dt>Cashback</dt>
                  <dd>Ta’sir qilmaydi</dd>
                </div>
                <div>
                  <dt>Muddat, qamrov, limit</dt>
                  <dd className="pr-muted">Tizimda yo‘q</dd>
                </div>
              </dl>
            </DrawerSection>
            <details className="pr-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="pr-kv pr-kv-tech">
                <div>
                  <dt>Aksiya ID</dt>
                  <dd className="pr-kv-mono">{selected.id}</dd>
                </div>
                <div>
                  <dt>Ilova ikonka kodi</dt>
                  <dd className="pr-kv-mono">{selected.icon || "—"}</dd>
                </div>
                <div>
                  <dt>Ilova fon kodi</dt>
                  <dd className="pr-kv-mono">{selected.background || "—"}</dd>
                </div>
                <div>
                  <dt>Shartnoma</dt>
                  <dd className="pr-kv-mono">{PROMO_CONTRACT}</dd>
                </div>
              </dl>
            </details>
          </>
        ) : null}

        {selection?.kind === "rewards" && selected ? (
          <>
            {selectedClaim ? (
              <FeedbackBanner tone="warn">
                Sovg‘a nomida chegirma va’dasi bor, lekin buyurtma yoki POS narxida chegirma qo‘llanmaydi — almashtirish
                faqat cashback balansidan yechadi.
              </FeedbackBanner>
            ) : null}
            <DrawerSection title="Sovg‘a">
              <dl className="pr-kv">
                <div>
                  <dt>Nomi</dt>
                  <dd className="pr-kv-strong">{selected.title || "—"}</dd>
                </div>
                <div>
                  <dt>Tavsif</dt>
                  <dd>{selected.subtitle || "—"}</dd>
                </div>
                <div>
                  <dt>Kod</dt>
                  <dd className="pr-kv-mono">{selected.code || "—"}</dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Almashtirish">
              <dl className="pr-kv">
                <div>
                  <dt>Cashback narxi</dt>
                  <dd className="pr-kv-strong">{money(Number(selected.points || 0))}</dd>
                </div>
                <div>
                  <dt>Qoida</dt>
                  <dd>Har bir mijoz bir marta almashtiradi</dd>
                </div>
                <div>
                  <dt>Hisob</dt>
                  <dd>Mijozning cashback balansidan yechiladi</dd>
                </div>
                <div>
                  <dt>Almashtirishlar soni</dt>
                  <dd className="pr-muted">Admin API’da yo‘q</dd>
                </div>
              </dl>
              <p className="pr-note">Cashback hisob-kitobi Cashback / Loyalty modulida; bu yerda o‘zgarmaydi.</p>
            </DrawerSection>
            <details className="pr-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="pr-kv pr-kv-tech">
                <div>
                  <dt>Sovg‘a ID</dt>
                  <dd className="pr-kv-mono">{selected.id}</dd>
                </div>
                <div>
                  <dt>Ilova ikonka kodi</dt>
                  <dd className="pr-kv-mono">{selected.icon || "—"}</dd>
                </div>
                <div>
                  <dt>Ilova fon kodi</dt>
                  <dd className="pr-kv-mono">{selected.accent || "—"}</dd>
                </div>
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
