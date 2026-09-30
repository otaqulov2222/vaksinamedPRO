import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { request, money, fmtDate } from "../api";
import {
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  PaginationBar,
  ErrorState,
  LoadingBlock,
  DetailDrawer,
  DrawerSection,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Server clamps limit to 50; list is always a bounded server page. */
const CUSTOMER_PAGE = 25;
const HISTORY_PAGE = 40;
const CUSTOMER_COLUMNS = 4;

type LoadError = { kind: "forbidden" | "session" | "missing" | "failed"; message: string };

function statusOf(err: unknown) {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
}

function listError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Mijozlar bo‘limiga kirish uchun ruxsat mavjud emas." };
  return { kind: "failed", message: "Mijozlarni yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring." };
}

function detailError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Mijoz ma’lumotini ko‘rish uchun ruxsat mavjud emas." };
  if (status === 404) return { kind: "missing", message: "Mijoz topilmadi." };
  return { kind: "failed", message: "Mijoz ma’lumotini yuklab bo‘lmadi." };
}

function customerName(item: any): string {
  return `${item?.firstName || ""} ${item?.lastName || ""}`.trim() || "Mijoz";
}

function initials(item: any): string {
  const a = String(item?.firstName || "").trim().charAt(0);
  const b = String(item?.lastName || "").trim().charAt(0);
  return (a + b).toUpperCase() || "M";
}

function languageLabel(code: unknown): string {
  const c = String(code || "").toLowerCase();
  if (c === "uz") return "O‘zbekcha";
  if (c === "ru") return "Ruscha";
  if (c === "en") return "Inglizcha";
  return c || "—";
}

function signedMoney(value: number) {
  return `${value > 0 ? "+" : ""}${money(value)}`;
}

export function CustomersPage(props: { token: string }) {
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
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<LoadError | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState("");
  const [historyMore, setHistoryMore] = useState(false);
  const detailSeq = useRef(0);

  const hasFilters = Boolean(appliedQuery);

  async function loadPage(nextOffset: number, q: string = appliedQuery) {
    const seq = ++listSeq.current;
    const qs = new URLSearchParams();
    qs.set("limit", String(CUSTOMER_PAGE));
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

  useEffect(() => {
    void loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

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

  async function loadHistory(id: number, historyOffset: number, seq: number) {
    setHistoryLoading(true);
    setHistoryErr("");
    try {
      const data = await request(
        `/api/admin/customers/${id}/cashback-history?limit=${HISTORY_PAGE}&offset=${historyOffset}`,
        props.token,
      );
      if (seq !== detailSeq.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      setHistory((prev) => (historyOffset === 0 ? items : [...prev, ...items]));
      setHistoryMore(items.length === HISTORY_PAGE);
    } catch {
      if (seq !== detailSeq.current) return;
      setHistoryErr("Cashback tarixini yuklab bo‘lmadi.");
    } finally {
      if (seq === detailSeq.current) setHistoryLoading(false);
    }
  }

  async function openCustomer(id: number) {
    const seq = ++detailSeq.current;
    setSelectedId(id);
    setDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    setHistory([]);
    setHistoryMore(false);
    void loadHistory(id, 0, seq);
    try {
      const data = await request(`/api/admin/customers/${id}`, props.token);
      if (seq !== detailSeq.current) return;
      setDetail(data?.customer || null);
    } catch (err) {
      if (seq !== detailSeq.current) return;
      setDetailErr(detailError(err));
    } finally {
      if (seq === detailSeq.current) setDetailLoading(false);
    }
  }

  function closeCustomer() {
    detailSeq.current += 1;
    setSelectedId(null);
    setDetail(null);
    setDetailErr(null);
    setHistory([]);
    setHistoryErr("");
    setHistoryMore(false);
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
  const listRow = rows.find((r) => r.id === selectedId) || null;
  const head = detail || listRow;

  return (
    <div className="customers-page page-module">
      <AdminPageHeader
        title="Mijozlar"
        description={PAGE_DESCRIPTIONS.customers}
        meta={<span className="cu-readonly">Faqat ko‘rish — cashback va daraja bu yerda o‘zgarmaydi</span>}
        actions={
          <button
            className={`btn-secondary cu-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => void loadPage(offset)}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <section className="cu-controls" aria-label="Mijozlarni qidirish">
        <form className="cu-search" role="search" onSubmit={applySearch}>
          <FilterField label="Mijozni qidirish" grow>
            <span className="cu-search-box">
              <Search size={15} strokeWidth={2} aria-hidden="true" className="cu-search-icon" />
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
          <button className="btn-secondary cu-search-go" type="submit" disabled={loading}>
            Qidirish
          </button>
        </form>
        <p className="cu-controls-note">
          Qidiruv serverda, butun mijozlar bazasi bo‘yicha. Filtr va saralash API’da yo‘q — oxirgi ro‘yxatdan
          o‘tganlar birinchi.
        </p>
      </section>

      <div className="cu-summary" aria-live="polite">
        {initialLoading ? (
          <span className="cu-result-count">Yuklanmoqda…</span>
        ) : error ? (
          <span className="cu-result-count">—</span>
        ) : (
          <span className="cu-result-count">
            {hasFilters ? `${total} ta mijoz topildi` : `Jami ${total} ta mijoz`}
          </span>
        )}
        {hasFilters && !error ? (
          <>
            <span className="cu-summary-hint">«{appliedQuery}» bo‘yicha</span>
            <button className="btn-tertiary" type="button" disabled={loading} onClick={resetSearch}>
              Tozalash
            </button>
          </>
        ) : null}
        <span className="cu-summary-note">Telefon raqamlari masklangan</span>
      </div>

      {error ? (
        <ErrorState
          message={error.message}
          onRetry={error.kind === "failed" ? () => void loadPage(offset) : undefined}
        />
      ) : (
        <div
          className={`cu-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !rows.length ? " is-empty" : ""}`}
          aria-busy={loading}
        >
          <DataTable sticky>
            <thead>
              <tr>
                <th>Mijoz</th>
                <th>Loyalty</th>
                <th className="num">Cashback balansi</th>
                <th className="num cu-col-purchases">Xaridlar</th>
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="cu-skeleton-row" aria-hidden="true">
                    {Array.from({ length: CUSTOMER_COLUMNS }).map((__, c) => (
                      <td key={c} className={c >= 2 ? "num" : undefined}><span className="cu-skeleton" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr className="cu-empty-row">
                  <td colSpan={CUSTOMER_COLUMNS}>
                    <div className="cu-empty" role="status">
                      <div className="empty-title">
                        {hasFilters ? "Tanlangan shartlar bo‘yicha mijoz topilmadi." : "Mijozlar mavjud emas."}
                      </div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Ism, familiya yoki telefon raqamining boshqa qismini kiriting."
                          : "Mijozlar ilovada ro‘yxatdan o‘tganda shu yerda ko‘rinadi."}
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
                  const open = () => void openCustomer(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`cu-row crm-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      aria-label={`${customerName(item)} — batafsil`}
                      onClick={open}
                      onKeyDown={rowKeys(open)}
                    >
                      <td className="cu-cell-main">
                        <div className="cu-identity">
                          <span className="cu-avatar" aria-hidden="true">{initials(item)}</span>
                          <span className="cu-identity-text">
                            <span className="cu-name">{customerName(item)}</span>
                            <span className="cu-phone">{item.phoneMasked || "—"}</span>
                          </span>
                        </div>
                      </td>
                      <td className="cu-cell-tier">
                        {item.tier ? <span className="cu-tier">{item.tier}</span> : <span className="cu-muted">—</span>}
                      </td>
                      <td className="num cu-cell-balance">{money(Number(item.cashbackBalance || 0))}</td>
                      <td className="num cu-cell-purchases">{Number(item.purchasesCount || 0)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          {rows.length > 0 ? (
            <PaginationBar
              offset={offset}
              limit={CUSTOMER_PAGE}
              total={total}
              hasMore={hasMore}
              loading={loading}
              onPrev={() => void loadPage(Math.max(0, offset - CUSTOMER_PAGE))}
              onNext={() => void loadPage(offset + CUSTOMER_PAGE)}
            />
          ) : null}
        </div>
      )}

      <DetailDrawer
        open={selectedId != null}
        title={head ? customerName(head) : "Mijoz"}
        subtitle={head?.phoneMasked || undefined}
        status={
          head ? (
            <div className="cu-drawer-status">
              {head.tier ? <StatusBadge tone="neutral">{head.tier}</StatusBadge> : null}
              <StatusBadge tone="ok">{money(Number(head.cashbackBalance || 0))}</StatusBadge>
            </div>
          ) : undefined
        }
        width="lg"
        onClose={closeCustomer}
      >
        {detailLoading ? <LoadingBlock rows={3} label="Mijoz ma’lumoti yuklanmoqda…" /> : null}
        {detailErr ? (
          <ErrorState
            message={detailErr.message}
            onRetry={detailErr.kind === "failed" && selectedId != null ? () => void openCustomer(selectedId) : undefined}
          />
        ) : null}
        {detail ? (
          <>
            <DrawerSection title="Mijoz">
              <dl className="cu-kv">
                <div>
                  <dt>Ism</dt>
                  <dd className="cu-kv-strong">{customerName(detail)}</dd>
                </div>
                <div>
                  <dt>Telefon</dt>
                  <dd>
                    {detail.phoneMasked || "—"}
                    <span className="cu-kv-hint">To‘liq raqam admin API’da berilmaydi</span>
                  </dd>
                </div>
                <div>
                  <dt>Ilova tili</dt>
                  <dd>{languageLabel(detail.language)}</dd>
                </div>
                <div>
                  <dt>Ro‘yxatdan o‘tgan</dt>
                  <dd>{fmtDate(detail.createdAt)}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Loyalty">
              <dl className="cu-kv">
                <div>
                  <dt>Daraja</dt>
                  <dd className="cu-kv-strong">{detail.tier || "—"}</dd>
                </div>
                <div>
                  <dt>Xaridlar soni</dt>
                  <dd>{Number(detail.purchasesCount || 0)}</dd>
                </div>
                <div>
                  <dt>Xaridlar summasi</dt>
                  <dd>{money(Number(detail.totalPurchases || 0))}</dd>
                </div>
              </dl>
              <p className="cu-note">Daraja server tomonida yuritiladi; admin panelda o‘zgartirilmaydi.</p>
            </DrawerSection>

            <DrawerSection title="Cashback">
              <dl className="cu-kv">
                <div>
                  <dt>Joriy balans</dt>
                  <dd className="cu-kv-balance">{money(Number(detail.cashbackBalance || 0))}</dd>
                </div>
                <div>
                  <dt>Jami yig‘ilgan</dt>
                  <dd>
                    {money(Number(detail.savedAmount || 0))}
                    <span className="cu-kv-hint">Profil hisoblagichi — moliyaviy manba emas</span>
                  </dd>
                </div>
              </dl>
              <p className="cu-note">
                Balans cashback hisobidan (ledger) olinadi. Qo‘lda qo‘shish, ayirish yoki tuzatish API’si yo‘q.
              </p>
            </DrawerSection>
          </>
        ) : null}

        {selectedId != null && !detailErr ? (
          <DrawerSection title="Cashback tarixi">
            {historyErr ? (
              <ErrorState message={historyErr} onRetry={() => void loadHistory(selectedId, history.length, detailSeq.current)} />
            ) : historyLoading && history.length === 0 ? (
              <LoadingBlock rows={2} label="Tarix yuklanmoqda…" />
            ) : history.length === 0 ? (
              <p className="cu-note">Cashback operatsiyalari mavjud emas.</p>
            ) : (
              <div className="cu-history">
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
                    {history.map((item: any) => {
                      const doc = item.orderCode || (item.orderId != null ? `#${item.orderId}` : "");
                      return (
                        <tr key={item.id}>
                          <td className="cu-history-date">{fmtDate(item.createdAt)}</td>
                          <td>
                            <StatusLabelBadge domain="entry" status={item.entryType || ""} />
                          </td>
                          <td>
                            <div>{item.sourceLabel || "—"}</div>
                            {doc || item.receiptId || item.branchName ? (
                              <div className="cu-history-meta">
                                {[doc, item.receiptId ? `Chek ${item.receiptId}` : "", item.branchName || ""]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            ) : null}
                            {item.sourceContract ? (
                              <div className="cu-history-meta">{operatorCapabilityLabel(String(item.sourceContract))}</div>
                            ) : null}
                          </td>
                          <td className={`num cu-history-sum${Number(item.cashback) < 0 ? " is-debit" : ""}`}>
                            {signedMoney(Number(item.cashback || 0))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
                {historyMore ? (
                  <button
                    className="btn-tertiary cu-history-more"
                    type="button"
                    disabled={historyLoading}
                    onClick={() => void loadHistory(selectedId, history.length, detailSeq.current)}
                  >
                    {historyLoading ? "Yuklanmoqda…" : "Yana ko‘rsatish"}
                  </button>
                ) : null}
              </div>
            )}
            <p className="cu-note">
              Mijoz bo‘yicha buyurtmalar ro‘yxati admin API’da yo‘q. Buyurtma amallari — Buyurtmalar bo‘limida.
            </p>
          </DrawerSection>
        ) : null}

        {detail ? (
          <details className="cu-tech">
            <summary>Texnik ma’lumotlar</summary>
            <dl className="cu-kv cu-kv-tech">
              <div>
                <dt>Mijoz ID</dt>
                <dd className="cu-kv-mono">{detail.id}</dd>
              </div>
              <div>
                <dt>Balans manbasi</dt>
                <dd className="cu-kv-mono">{detail.cashbackSource || "—"}</dd>
              </div>
              <div>
                <dt>Yaratilgan (ISO)</dt>
                <dd className="cu-kv-mono">{detail.createdAt ? String(detail.createdAt) : "—"}</dd>
              </div>
            </dl>
          </details>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
