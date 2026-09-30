import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { request, money } from "../api";
import {
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  MetricStrip,
  DataTable,
  PaginationBar,
  ErrorState,
  LoadingBlock,
  DetailDrawer,
  DrawerSection,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Server clamps customers limit to 50 and ledger limit to 100. */
const ACCOUNT_PAGE = 20;
const LEDGER_PAGE = 50;
const ACCOUNT_COLUMNS = 3;

type LoadError = { kind: "forbidden" | "session" | "missing" | "failed"; message: string };
type Liability = { value: number } | { note: string } | null;

function statusOf(err: unknown) {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
}

function listError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Cashback bo‘limiga kirish uchun ruxsat mavjud emas." };
  return { kind: "failed", message: "Cashback hisoblarini yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring." };
}

function accountError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Cashback hisobini ko‘rish uchun ruxsat mavjud emas." };
  if (status === 404) return { kind: "missing", message: "Mijoz topilmadi." };
  return { kind: "failed", message: "Cashback hisobini yuklab bo‘lmadi." };
}

function customerName(item: any): string {
  return `${item?.firstName || ""} ${item?.lastName || ""}`.trim() || "Mijoz";
}

/** Operator dates in Asia/Tashkent; stored UTC timestamps are not altered. */
function fmtTashkent(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
}

/** Integer so‘m from the server's signed `cashback`; sign only, no arithmetic. */
function signedMoney(value: unknown) {
  const n = Number(value) || 0;
  return `${n > 0 ? "+" : ""}${money(n)}`;
}

function entryDoc(item: any): string {
  if (item?.orderCode) return String(item.orderCode);
  if (item?.orderId != null) return `Buyurtma #${item.orderId}`;
  if (item?.receiptId) return `Chek ${item.receiptId}`;
  if (item?.commercialTransactionId != null) return `Tranzaksiya #${item.commercialTransactionId}`;
  return "—";
}

function rowKeys(open: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };
}

export function CashbackPage(props: { token: string }) {
  const [liability, setLiability] = useState<Liability>(null);
  const [rules, setRules] = useState<any>(null);
  const [rulesFailed, setRulesFailed] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const listSeq = useRef(0);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountErr, setAccountErr] = useState<LoadError | null>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerErr, setLedgerErr] = useState("");
  const [ledgerMore, setLedgerMore] = useState(false);
  const [entry, setEntry] = useState<any>(null);
  const accountSeq = useRef(0);
  const backRef = useRef<HTMLButtonElement>(null);
  const lastEntryId = useRef<string | null>(null);

  const hasFilters = Boolean(appliedQuery);

  async function loadOverview() {
    try {
      const dash = await request("/api/admin/dashboard", props.token);
      const value = dash?.kpis?.cashback;
      setLiability(value != null ? { value: Number(value) } : { note: "Server agregati qaytmadi." });
    } catch (err) {
      setLiability({
        note: statusOf(err) === 403 ? "Dashboard ruxsati kerak." : "Yuklab bo‘lmadi.",
      });
    }
    try {
      setRules(await request("/api/cashback/rules", props.token));
      setRulesFailed(false);
    } catch {
      setRules(null);
      setRulesFailed(true);
    }
  }

  async function loadPage(nextOffset: number, q: string = appliedQuery) {
    const seq = ++listSeq.current;
    const qs = new URLSearchParams();
    qs.set("limit", String(ACCOUNT_PAGE));
    qs.set("offset", String(nextOffset));
    if (q) qs.set("q", q);
    setLoading(true);
    setError(null);
    try {
      const data = await request(`/api/admin/customers?${qs}`, props.token);
      if (seq !== listSeq.current) return;
      setRows(Array.isArray(data?.customers) ? data.customers : []);
      setTotal(Number(data?.pagination?.total ?? data?.total ?? 0));
      setHasMore(Boolean(data?.pagination?.hasMore ?? data?.hasMore));
      setOffset(nextOffset);
      setLoaded(true);
    } catch (err) {
      if (seq !== listSeq.current) return;
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(listError(err));
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }

  function refresh() {
    void loadOverview();
    void loadPage(offset);
  }

  useEffect(() => {
    void loadOverview();
    void loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  useEffect(() => {
    if (entry) {
      backRef.current?.focus();
    } else if (lastEntryId.current) {
      const row = document.querySelector<HTMLElement>(`[data-ledger-id="${lastEntryId.current}"]`);
      row?.focus();
      lastEntryId.current = null;
    }
  }, [entry]);

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    setAppliedQuery(q);
    void loadPage(0, q);
  }

  function resetSearch() {
    setQuery("");
    setAppliedQuery("");
    void loadPage(0, "");
  }

  async function loadLedger(id: number, ledgerOffset: number, seq: number) {
    setLedgerLoading(true);
    setLedgerErr("");
    try {
      const data = await request(
        `/api/admin/customers/${id}/cashback-history?limit=${LEDGER_PAGE}&offset=${ledgerOffset}`,
        props.token,
      );
      if (seq !== accountSeq.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      setLedger((prev) => (ledgerOffset === 0 ? items : [...prev, ...items]));
      setLedgerMore(items.length === LEDGER_PAGE);
    } catch {
      if (seq !== accountSeq.current) return;
      setLedgerErr("Cashback tarixini yuklab bo‘lmadi.");
    } finally {
      if (seq === accountSeq.current) setLedgerLoading(false);
    }
  }

  async function openAccount(id: number) {
    const seq = ++accountSeq.current;
    setSelectedId(id);
    setAccount(null);
    setAccountErr(null);
    setAccountLoading(true);
    setLedger([]);
    setLedgerMore(false);
    setEntry(null);
    void loadLedger(id, 0, seq);
    try {
      const data = await request(`/api/admin/customers/${id}`, props.token);
      if (seq !== accountSeq.current) return;
      setAccount(data?.customer || null);
    } catch (err) {
      if (seq !== accountSeq.current) return;
      setAccountErr(accountError(err));
    } finally {
      if (seq === accountSeq.current) setAccountLoading(false);
    }
  }

  function closeAccount() {
    accountSeq.current += 1;
    lastEntryId.current = null;
    setSelectedId(null);
    setAccount(null);
    setAccountErr(null);
    setLedger([]);
    setLedgerErr("");
    setLedgerMore(false);
    setEntry(null);
  }

  function openEntry(item: any) {
    lastEntryId.current = String(item.id);
    setEntry(item);
  }

  const initialLoading = loading && !loaded;
  const head = account || rows.find((r) => r.id === selectedId) || null;
  const tiers: any[] = Array.isArray(rules?.tiers) ? rules.tiers : [];

  return (
    <div className="cashback-page page-module">
      <AdminPageHeader
        title="Cashback / Loyalty"
        description={PAGE_DESCRIPTIONS.cashback}
        meta={<span className="cb-readonly">Faqat ko‘rish — bu sahifada cashback o‘zgartirilmaydi</span>}
        actions={
          <button
            className={`btn-secondary cb-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <section className="cb-overview" aria-label="Cashback holati">
        <MetricStrip
          className="cb-metrics"
          items={[
            {
              hero: true,
              label: "Jami cashback majburiyati",
              value: liability && "value" in liability ? money(liability.value) : "—",
              hint:
                liability && "value" in liability
                  ? "Barcha mijozlar hisoblari balansi · server agregati"
                  : liability?.note || "Yuklanmoqda…",
            },
            {
              label: "Maks. ishlatish",
              value: rules?.maxSpendPercent != null ? `${rules.maxSpendPercent}%` : "—",
              hint: rules ? "Xarid summasidan · server sozlamasi" : rulesFailed ? "Qoidalar yuklanmadi" : "Yuklanmoqda…",
            },
            {
              label: "Minimal xarid",
              value: rules?.minPurchase != null ? money(Number(rules.minPurchase)) : "—",
              hint: rules ? "Cashback hisoblash uchun" : rulesFailed ? "Qoidalar yuklanmadi" : "Yuklanmoqda…",
            },
          ]}
        />
      </section>

      <div className="cb-layout">
        <section className="cb-accounts" aria-label="Mijozlar cashback hisoblari">
          <div className="cb-section-head">
            <h2 className="cb-section-title">Mijozlar hisoblari</h2>
            <span className="cb-section-meta">Balans — har bir mijozning cashback hisobi (ledger)</span>
          </div>

          <form className="cb-search" role="search" onSubmit={applySearch}>
            <FilterField label="Mijozni qidirish" grow>
              <span className="cb-search-box">
                <Search size={15} strokeWidth={2} aria-hidden="true" className="cb-search-icon" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ism, familiya yoki telefon raqami"
                  enterKeyHint="search"
                  maxLength={64}
                />
              </span>
            </FilterField>
            <button className="btn-secondary cb-search-go" type="submit" disabled={loading}>
              Qidirish
            </button>
          </form>

          <div className="cb-summary" aria-live="polite">
            {initialLoading ? (
              <span className="cb-result-count">Yuklanmoqda…</span>
            ) : error ? (
              <span className="cb-result-count">—</span>
            ) : (
              <span className="cb-result-count">
                {hasFilters ? `${total} ta mijoz topildi` : `Jami ${total} ta mijoz`}
              </span>
            )}
            {hasFilters && !error ? (
              <>
                <span className="cb-summary-hint">«{appliedQuery}» bo‘yicha</span>
                <button className="btn-tertiary" type="button" disabled={loading} onClick={resetSearch}>
                  Tozalash
                </button>
              </>
            ) : null}
            <span className="cb-summary-note">Qidiruv serverda · filtr va saralash API’da yo‘q</span>
          </div>

          {error ? (
            <ErrorState
              message={error.message}
              onRetry={error.kind === "failed" ? () => void loadPage(offset) : undefined}
            />
          ) : (
            <div
              className={`cb-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !rows.length ? " is-empty" : ""}`}
              aria-busy={loading}
            >
              <DataTable sticky>
                <thead>
                  <tr>
                    <th>Mijoz</th>
                    <th>Loyalty</th>
                    <th className="num">Cashback balansi</th>
                  </tr>
                </thead>
                <tbody>
                  {initialLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={`sk-${i}`} className="cb-skeleton-row" aria-hidden="true">
                        {Array.from({ length: ACCOUNT_COLUMNS }).map((__, c) => (
                          <td key={c} className={c === 2 ? "num" : undefined}><span className="cb-skeleton" /></td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr className="cb-empty-row">
                      <td colSpan={ACCOUNT_COLUMNS}>
                        <div className="cb-empty" role="status">
                          <div className="empty-title">
                            {hasFilters ? "Tanlangan shartlar bo‘yicha mijoz topilmadi." : "Mijozlar mavjud emas."}
                          </div>
                          <p className="empty-desc">
                            {hasFilters
                              ? "Ism, familiya yoki telefon raqamining boshqa qismini kiriting."
                              : "Cashback hisobi mijoz ro‘yxatdan o‘tganda ochiladi."}
                          </p>
                          {hasFilters ? (
                            <button className="btn-tertiary" type="button" onClick={resetSearch}>
                              Qidiruvni tozalash
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((item) => {
                      const active = selectedId === item.id;
                      const open = () => void openAccount(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`cb-row${active ? " is-active" : ""}`}
                          tabIndex={0}
                          aria-selected={active}
                          aria-label={`${customerName(item)} — cashback hisobi`}
                          onClick={open}
                          onKeyDown={rowKeys(open)}
                        >
                          <td className="cb-cell-main">
                            <span className="cb-name">{customerName(item)}</span>
                            <span className="cb-phone">{item.phoneMasked || "—"}</span>
                          </td>
                          <td className="cb-cell-tier">
                            {item.tier ? <span className="cb-tier">{item.tier}</span> : <span className="cb-muted">—</span>}
                          </td>
                          <td className="num cb-cell-balance">{money(Number(item.cashbackBalance || 0))}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </DataTable>
              {rows.length > 0 ? (
                <PaginationBar
                  offset={offset}
                  limit={ACCOUNT_PAGE}
                  total={total}
                  hasMore={hasMore}
                  loading={loading}
                  onPrev={() => void loadPage(Math.max(0, offset - ACCOUNT_PAGE))}
                  onNext={() => void loadPage(offset + ACCOUNT_PAGE)}
                />
              ) : null}
            </div>
          )}
        </section>

        <aside className="cb-rules" aria-label="Cashback qoidalari">
          <div className="cb-section-head">
            <h2 className="cb-section-title">Qoidalar</h2>
            <span className="cb-section-meta">Server qoidalari · faqat ko‘rish</span>
          </div>
          {rulesFailed ? (
            <p className="cb-note">Cashback qoidalarini yuklab bo‘lmadi.</p>
          ) : !rules ? (
            <LoadingBlock rows={3} />
          ) : (
            <>
              <table className="cb-tiers">
                <caption className="cb-tiers-caption">Loyalty darajalari</caption>
                <thead>
                  <tr>
                    <th scope="col">Daraja</th>
                    <th scope="col" className="num">Cashback</th>
                    <th scope="col" className="num">Xaridlar summasidan</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={String(t.tier)}>
                      <th scope="row"><span className="cb-tier">{String(t.tier)}</span></th>
                      <td className="num">{String(t.rate ?? "—")}</td>
                      <td className="num">{t.fromTotal != null ? money(Number(t.fromTotal)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="cb-rule-list">
                <li>Bitta tijorat tranzaksiyasi uchun ko‘pi bilan bitta hisoblash yozuvi.</li>
                <li>To‘lov (PAID) o‘zi cashback bermaydi — buyurtma yakunlanganda yoki kassa sotuvi tasdiqlanganda.</li>
                <li>Qaytarish asl yozuvni o‘chirmaydi — alohida qaytarish yozuvi qo‘shiladi.</li>
              </ul>
              <div className="cb-caveats">
                <div className="cb-caveats-title">Tizimda qo‘llanmaydi</div>
                <ul className="cb-rule-list">
                  {rules.ttlDays != null ? (
                    <li>Qoidalarda {rules.ttlDays} kunlik muddat e’lon qilingan — muddat o‘tishi amalga oshirilmagan.</li>
                  ) : null}
                  <li>Daraja avtomatik faqat kassa (POS) sotuvida yangilanadi; ilova buyurtmasi darajani o‘zgartirmaydi.</li>
                </ul>
              </div>
            </>
          )}
        </aside>
      </div>

      <DetailDrawer
        open={selectedId != null}
        title={head ? customerName(head) : "Cashback hisobi"}
        subtitle={head?.phoneMasked || undefined}
        status={
          head ? (
            <div className="cb-drawer-status">
              {head.tier ? <StatusBadge tone="neutral">{head.tier}</StatusBadge> : null}
              <StatusBadge tone="ok">{money(Number(head.cashbackBalance || 0))}</StatusBadge>
            </div>
          ) : undefined
        }
        width="lg"
        onClose={closeAccount}
      >
        {entry ? (
          <>
            <button ref={backRef} className="btn-tertiary cb-back" type="button" onClick={() => setEntry(null)}>
              <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
              Hisobga qaytish
            </button>
            <DrawerSection title="Cashback yozuvi">
              <dl className="cb-kv">
                <div>
                  <dt>Tur</dt>
                  <dd><StatusLabelBadge domain="entry" status={entry.entryType || ""} /></dd>
                </div>
                <div>
                  <dt>Summa</dt>
                  <dd className={`cb-kv-amount${Number(entry.cashback) < 0 ? " is-debit" : ""}`}>{signedMoney(entry.cashback)}</dd>
                </div>
                <div>
                  <dt>Sana</dt>
                  <dd>{fmtTashkent(entry.createdAt)}</dd>
                </div>
                <div>
                  <dt>Yozuv</dt>
                  <dd className="cb-kv-mono">#{entry.ledgerId ?? entry.id}</dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Tijorat tranzaksiyasi">
              <dl className="cb-kv">
                <div>
                  <dt>Manba</dt>
                  <dd>
                    {entry.sourceLabel || "—"}
                    {entry.sourceContract ? (
                      <span className="cb-kv-hint">{operatorCapabilityLabel(String(entry.sourceContract))} — barqaror chek identifikatori yo‘q</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Manba turi</dt>
                  <dd className="cb-kv-mono">{entry.sourceType || "Bog‘lanmagan"}</dd>
                </div>
                <div>
                  <dt>Tranzaksiya</dt>
                  <dd className="cb-kv-mono">{entry.commercialTransactionId != null ? `#${entry.commercialTransactionId}` : "—"}</dd>
                </div>
                <div>
                  <dt>Buyurtma</dt>
                  <dd>{entry.orderCode || (entry.orderId != null ? `#${entry.orderId}` : "—")}</dd>
                </div>
                <div>
                  <dt>Kassa cheki</dt>
                  <dd>{entry.receiptId || "—"}</dd>
                </div>
                <div>
                  <dt>Filial</dt>
                  <dd>{entry.branchName || "—"}</dd>
                </div>
              </dl>
            </DrawerSection>
            {String(entry.entryType || "").toUpperCase() === "REVERSAL" ? (
              <DrawerSection title="Qaytarish">
                <dl className="cb-kv">
                  <div>
                    <dt>Ta’siri</dt>
                    <dd>{Number(entry.cashback) < 0 ? "Hisoblangan cashback bekor qilindi" : "Ishlatilgan cashback balansga qaytdi"}</dd>
                  </div>
                  <div>
                    <dt>Asl yozuv</dt>
                    <dd className="cb-muted">Admin API’da ko‘rsatilmaydi</dd>
                  </div>
                </dl>
              </DrawerSection>
            ) : null}
            <details className="cb-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="cb-kv cb-kv-tech">
                <div>
                  <dt>Ledger ID</dt>
                  <dd className="cb-kv-mono">{entry.ledgerId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Tranzaksiya ID</dt>
                  <dd className="cb-kv-mono">{entry.commercialTransactionId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Buyurtma ID</dt>
                  <dd className="cb-kv-mono">{entry.orderId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Filial ID</dt>
                  <dd className="cb-kv-mono">{entry.branchId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Yaratilgan (UTC)</dt>
                  <dd className="cb-kv-mono">{entry.createdAt ? String(entry.createdAt) : "—"}</dd>
                </div>
              </dl>
            </details>
          </>
        ) : (
          <>
            {accountLoading ? <LoadingBlock rows={2} label="Hisob yuklanmoqda…" /> : null}
            {accountErr ? (
              <ErrorState
                message={accountErr.message}
                onRetry={accountErr.kind === "failed" && selectedId != null ? () => void openAccount(selectedId) : undefined}
              />
            ) : null}
            {account ? (
              <DrawerSection title="Cashback hisobi">
                <div className="cb-balance">
                  <span className="cb-balance-label">Joriy balans</span>
                  <span className="cb-balance-value">{money(Number(account.cashbackBalance || 0))}</span>
                  <span className="cb-balance-hint">Cashback hisobidan (ledger) · UI hisoblamaydi</span>
                </div>
                <dl className="cb-kv">
                  <div>
                    <dt>Loyalty darajasi</dt>
                    <dd className="cb-kv-strong">{account.tier || "—"}</dd>
                  </div>
                  <div>
                    <dt>Xaridlar summasi</dt>
                    <dd>{money(Number(account.totalPurchases || 0))}</dd>
                  </div>
                </dl>
                <p className="cb-note">Loyalty darajasi cashback balansidan alohida; bu yerda o‘zgartirilmaydi.</p>
              </DrawerSection>
            ) : null}

            {selectedId != null && !accountErr ? (
              <DrawerSection title="Cashback tarixi">
                {ledgerErr ? (
                  <ErrorState message={ledgerErr} onRetry={() => void loadLedger(selectedId, ledger.length, accountSeq.current)} />
                ) : ledgerLoading && ledger.length === 0 ? (
                  <LoadingBlock rows={2} label="Tarix yuklanmoqda…" />
                ) : ledger.length === 0 ? (
                  <p className="cb-note">Cashback operatsiyalari topilmadi.</p>
                ) : (
                  <div className="cb-ledger">
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Sana</th>
                          <th>Operatsiya</th>
                          <th>Manba</th>
                          <th className="num">Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((item: any) => {
                          const open = () => openEntry(item);
                          return (
                            <tr
                              key={item.id}
                              data-ledger-id={item.id}
                              className="cb-ledger-row"
                              tabIndex={0}
                              aria-label={`${item.sourceLabel || "Cashback"} — yozuv tafsiloti`}
                              onClick={open}
                              onKeyDown={rowKeys(open)}
                            >
                              <td className="cb-ledger-date">{fmtTashkent(item.createdAt)}</td>
                              <td><StatusLabelBadge domain="entry" status={item.entryType || ""} /></td>
                              <td>
                                <div>{item.sourceLabel || "—"}</div>
                                <div className="cb-ledger-meta">
                                  {[entryDoc(item), item.branchName || ""].filter((s) => s && s !== "—").join(" · ") || "—"}
                                </div>
                              </td>
                              <td className={`num cb-ledger-sum${Number(item.cashback) < 0 ? " is-debit" : ""}`}>
                                {signedMoney(item.cashback)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </DataTable>
                    {ledgerMore ? (
                      <button
                        className="btn-tertiary cb-ledger-more"
                        type="button"
                        disabled={ledgerLoading}
                        onClick={() => void loadLedger(selectedId, ledger.length, accountSeq.current)}
                      >
                        {ledgerLoading ? "Yuklanmoqda…" : "Yana ko‘rsatish"}
                      </button>
                    ) : null}
                  </div>
                )}
                <p className="cb-note">
                  Eng yangi yozuvlar birinchi. Tarixning umumiy sonini API qaytarmaydi.
                </p>
              </DrawerSection>
            ) : null}
          </>
        )}
      </DetailDrawer>
    </div>
  );
}
