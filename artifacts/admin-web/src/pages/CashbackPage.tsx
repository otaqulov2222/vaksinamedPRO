import { useEffect, useState } from "react";
import { request, softRequest, money, fmtDate } from "../api";
import {
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
  MetricStrip,
  DataTable,
  PaginationBar,
  ErrorState,
  LoadingBlock,
  DetailDrawer,
  DrawerSection,
  sourceLabel,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const SEARCH_PAGE = 20;
const HISTORY_PAGE = 50;

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Cashback ko‘rish uchun ruxsat yo‘q.";
  if (status === 404) return "Mijoz topilmadi.";
  return err instanceof Error ? err.message : fallback;
}

function customerName(item: any): string {
  return `${item?.firstName || ""} ${item?.lastName || ""}`.trim() || "—";
}

function movementSource(item: any): string {
  if (item?.sourceLabel) return String(item.sourceLabel);
  return sourceLabel(item?.sourceType);
}

export function CashbackPage(props: { token: string }) {
  const [liability, setLiability] = useState<number | null>(null);
  const [liabilityNote, setLiabilityNote] = useState("");

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [entry, setEntry] = useState<any>(null);

  const hasFilters = Boolean(q.trim());

  useEffect(() => {
    let alive = true;
    void (async () => {
      const dash = await softRequest("/api/admin/dashboard", props.token);
      if (!alive) return;
      if (dash?.kpis?.cashback != null) {
        setLiability(Number(dash.kpis.cashback));
        setLiabilityNote("");
      } else {
        setLiability(null);
        setLiabilityNote("Umumiy majburiyat ko‘rsatilmaydi — dashboard ruxsati kerak.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.token]);

  async function search(opts?: { q?: string }) {
    const query = opts?.q ?? q;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(SEARCH_PAGE));
      qs.set("offset", "0");
      if (query.trim()) qs.set("q", query.trim());
      const data = await request(`/api/admin/customers?${qs}`, props.token);
      setRows(Array.isArray(data?.customers) ? data.customers : []);
    } catch (err) {
      setRows([]);
      setError(errText(err, "Mijozlarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(customer: any, offset: number) {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await request(
        `/api/admin/customers/${customer.id}/cashback-history?limit=${HISTORY_PAGE}&offset=${offset}`,
        props.token,
      );
      setHistory(Array.isArray(data?.items) ? data.items : []);
      setHistoryOffset(offset);
    } catch (err) {
      setHistory([]);
      setHistoryError(errText(err, "Tarix yuklanmadi."));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openCustomer(row: any) {
    setHistory([]);
    setHistoryError("");
    setHistoryOffset(0);
    setEntry(null);
    try {
      const detail = await request(`/api/admin/customers/${row.id}`, props.token);
      setSelected(detail?.customer || row);
      await loadHistory(row, 0);
    } catch (err) {
      setSelected(null);
      setHistoryError(errText(err, "Mijoz ochilmadi."));
    }
  }

  function resetFilters() {
    setQ("");
    void search({ q: "" });
  }

  return (
    <div className="cashback-page page-module">
      <AdminPageHeader
        title="Cashback / Loyalty"
        description={PAGE_DESCRIPTIONS.cashback}
      />

      <section className="crm-overview" aria-label="Cashback holati">
        <MetricStrip
          className="metric-strip-primary"
          items={[
            {
              hero: true,
              label: "Jami cashback majburiyati",
              value: liability != null ? money(liability) : "—",
              hint: liability != null ? undefined : liabilityNote || "Yuklanmoqda…",
            },
          ]}
        />
        <p className="meta crm-overview-note">
          Balans tizim hisobi bo‘yicha. Qo‘lda o‘zgartirish yo‘q.
        </p>
      </section>

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Mijoz qidiruv" grow>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Ism yoki telefon"
              onSubmit={() => void search()}
              disabled={loading}
            />
          </FilterField>
          <div className="crm-controls-actions">
            <button className="btn-primary" type="button" disabled={loading} onClick={() => void search()}>
              Qidirish
            </button>
            {hasFilters ? (
              <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
                Tozalash
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void search()} /> : null}
      {loading ? <LoadingBlock rows={3} /> : null}

      {!loading && !error && searched ? (
        <div className="crm-context">
          <span className="crm-result-count">{rows.length} ta mijoz</span>
          {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
        </div>
      ) : null}

      {!loading && !error && !searched ? (
        <div className="crm-empty crm-empty-idle">
          <div className="empty-title">Mijozni tanlang</div>
          <p className="empty-desc">Qidiruv orqali mijozni oching — cashback tarixi ochiladi.</p>
        </div>
      ) : null}

      {!loading && !error && searched ? (
        <div className="crm-surface surface-table">
          <DataTable sticky>
            <thead>
              <tr>
                <th>Mijoz</th>
                <th>Loyalty</th>
                <th className="num">Cashback</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="crm-empty-row">
                  <td colSpan={3}>
                    <div className="crm-empty">
                      <div className="empty-title">Mijoz topilmadi</div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Bu filtrlar bo‘yicha mijoz topilmadi."
                          : "Hozircha mijozlar mavjud emas."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const active = selected?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`crm-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => void openCustomer(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openCustomer(item);
                        }
                      }}
                    >
                      <td>
                        <div className="crm-name">{customerName(item)}</div>
                        <div className="meta">{item.phoneMasked || "—"}</div>
                      </td>
                      <td>{item.tier || "—"}</td>
                      <td className="num money-md">{money(Number(item.cashbackBalance || 0))}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
        </div>
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        width="lg"
        title={selected ? customerName(selected) : "Cashback"}
        subtitle={selected?.phoneMasked || undefined}
        status={
          selected ? (
            <div className="crm-drawer-status">
              <StatusBadge tone="info">{selected.tier || "—"}</StatusBadge>
              <StatusBadge tone="ok">{money(Number(selected.cashbackBalance || 0))}</StatusBadge>
            </div>
          ) : undefined
        }
        onClose={() => {
          setSelected(null);
          setHistory([]);
          setEntry(null);
          setHistoryError("");
        }}
      >
        {selected ? (
          <>
            <DrawerSection title="Cashback">
              <dl className="crm-kv">
                <div>
                  <dt>Balans</dt>
                  <dd className="money-md">{money(Number(selected.cashbackBalance || 0))}</dd>
                </div>
              </dl>
              <p className="meta">Cashback pul mukofoti. Loyalty darajasidan alohida.</p>
            </DrawerSection>

            <DrawerSection title="Loyalty">
              <dl className="crm-kv">
                <div>
                  <dt>Daraja</dt>
                  <dd>{selected.tier || "—"}</dd>
                </div>
                <div>
                  <dt>Xaridlar</dt>
                  <dd>{Number(selected.purchasesCount || 0)}</dd>
                </div>
              </dl>
            </DrawerSection>

            {entry ? (
              <DrawerSection title="Operatsiya">
                <dl className="crm-kv">
                  <div>
                    <dt>Tur</dt>
                    <dd>
                      <StatusLabelBadge domain="entry" status={entry.entryType || ""} />
                    </dd>
                  </div>
                  <div>
                    <dt>Summa</dt>
                    <dd className="money-md">
                      {Number(entry.cashback) > 0 ? "+" : ""}
                      {money(Number(entry.cashback || 0))}
                    </dd>
                  </div>
                  <div>
                    <dt>Sana</dt>
                    <dd>{fmtDate(entry.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Manba</dt>
                    <dd>
                      {movementSource(entry)}
                      {entry.sourceContract
                        ? ` · ${operatorCapabilityLabel(String(entry.sourceContract))}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Filial</dt>
                    <dd>{entry.branchName || "—"}</dd>
                  </div>
                  <div>
                    <dt>Buyurtma</dt>
                    <dd>{entry.orderCode || (entry.orderId != null ? `#${entry.orderId}` : "—")}</dd>
                  </div>
                  {entry.receiptId ? (
                    <div>
                      <dt>Chek</dt>
                      <dd>{entry.receiptId}</dd>
                    </div>
                  ) : null}
                </dl>
                <button className="btn-tertiary" type="button" onClick={() => setEntry(null)}>
                  Tarixga qaytish
                </button>
              </DrawerSection>
            ) : null}

            <DrawerSection title="Cashback tarixi">
              {historyError ? <ErrorState message={historyError} onRetry={() => void loadHistory(selected, historyOffset)} /> : null}
              {historyLoading ? <LoadingBlock rows={2} /> : null}
              {!historyLoading && !historyError && history.length === 0 ? (
                <p className="meta">Cashback operatsiyalari topilmadi.</p>
              ) : null}
              {!historyLoading && history.length > 0 ? (
                <>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Sana</th>
                        <th>Operatsiya</th>
                        <th>Manba</th>
                        <th>Filial</th>
                        <th className="num">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item: any) => {
                        const active = entry?.id === item.id;
                        return (
                          <tr
                            key={item.id}
                            className={`crm-row${active ? " is-active" : ""}`}
                            tabIndex={0}
                            onClick={() => setEntry(item)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEntry(item);
                              }
                            }}
                          >
                            <td className="meta">{fmtDate(item.createdAt)}</td>
                            <td>
                              <StatusLabelBadge domain="entry" status={item.entryType || ""} />
                            </td>
                            <td>{movementSource(item)}</td>
                            <td>{item.branchName || "—"}</td>
                            <td className="num">
                              {Number(item.cashback) > 0 ? "+" : ""}
                              {money(Number(item.cashback || 0))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                  <PaginationBar
                    offset={historyOffset}
                    limit={HISTORY_PAGE}
                    hasMore={history.length >= HISTORY_PAGE}
                    loading={historyLoading}
                    onPrev={() => void loadHistory(selected, Math.max(0, historyOffset - HISTORY_PAGE))}
                    onNext={() => void loadHistory(selected, historyOffset + HISTORY_PAGE)}
                  />
                </>
              ) : null}
            </DrawerSection>
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
