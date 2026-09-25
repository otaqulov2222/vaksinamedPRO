import { useEffect, useState } from "react";
import { request, money, fmtDate } from "../api";
import {
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
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

const CUSTOMER_PAGE = 25;
const HISTORY_PAGE = 40;

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Mijozlar ro‘yxatini ko‘rish uchun ruxsat yo‘q.";
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

export function CustomersPage(props: { token: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [detail, setDetail] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const hasFilters = Boolean(q.trim());

  async function loadPage(opts?: { offset?: number; q?: string }) {
    const nextOffset = opts?.offset ?? 0;
    const query = opts?.q ?? q;
    const qs = new URLSearchParams();
    qs.set("limit", String(CUSTOMER_PAGE));
    qs.set("offset", String(nextOffset));
    if (query.trim()) qs.set("q", query.trim());
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/customers?${qs}`, props.token);
      setRows(Array.isArray(data?.customers) ? data.customers : []);
      setTotal(Number(data?.total || data?.pagination?.total || 0));
      setHasMore(Boolean(data?.hasMore ?? data?.pagination?.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(errText(err, "Mijozlarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  function applySearch() {
    void loadPage({ offset: 0 });
  }

  function resetFilters() {
    setQ("");
    void loadPage({ offset: 0, q: "" });
  }

  async function openCustomer(id: number) {
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setHistory([]);
    try {
      const [one, hist] = await Promise.all([
        request(`/api/admin/customers/${id}`, props.token),
        request(`/api/admin/customers/${id}/cashback-history?limit=${HISTORY_PAGE}&offset=0`, props.token),
      ]);
      setDetail(one?.customer || null);
      setHistory(Array.isArray(hist?.items) ? hist.items : []);
    } catch (err) {
      setDetailError(errText(err, "Mijoz ochilmadi."));
    } finally {
      setDetailLoading(false);
    }
  }

  const showSurface = !error && !(loading && rows.length === 0);

  return (
    <div className="customers-page page-module">
      <AdminPageHeader
        title="Mijozlar"
        description={PAGE_DESCRIPTIONS.customers}
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Ism yoki telefon" grow>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Ism yoki telefon"
              onSubmit={applySearch}
            />
          </FilterField>
          <div className="crm-controls-actions">
            <button className="btn-primary" type="button" disabled={loading} onClick={applySearch}>
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

      {error ? <ErrorState message={error} onRetry={() => void loadPage({ offset })} /> : null}
      {loading && rows.length === 0 ? <LoadingBlock rows={3} /> : null}

      {!error && !loading ? (
        <div className="crm-context">
          <span className="crm-result-count">{total} ta mijoz</span>
          {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
        </div>
      ) : null}

      {showSurface ? (
        <div className="crm-surface surface-table">
          <DataTable sticky>
            <thead>
              <tr>
                <th>Mijoz</th>
                <th>Loyalty</th>
                <th className="num">Cashback</th>
                <th className="num">Xaridlar</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="crm-empty-row">
                  <td colSpan={4}>
                    <div className="crm-empty">
                      <div className="empty-title">Mijozlar topilmadi</div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Bu filtrlar bo‘yicha mijoz topilmadi."
                          : "Hozircha mijozlar mavjud emas."}
                      </p>
                      {hasFilters ? (
                        <button className="btn-tertiary" type="button" onClick={resetFilters}>
                          Filtrlarni tozalash
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const active = detail?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`crm-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => void openCustomer(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openCustomer(item.id);
                        }
                      }}
                    >
                      <td>
                        <div className="crm-name">{customerName(item)}</div>
                        <div className="meta">{item.phoneMasked || "—"}</div>
                      </td>
                      <td>{item.tier || "—"}</td>
                      <td className="num money-md">{money(Number(item.cashbackBalance || 0))}</td>
                      <td className="num">{item.purchasesCount ?? "—"}</td>
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
              onPrev={() => void loadPage({ offset: Math.max(0, offset - CUSTOMER_PAGE) })}
              onNext={() => void loadPage({ offset: offset + CUSTOMER_PAGE })}
            />
          ) : null}
        </div>
      ) : null}

      <DetailDrawer
        open={Boolean(detail) || detailLoading || Boolean(detailError)}
        title={detail ? customerName(detail) : "Mijoz"}
        subtitle={detail?.phoneMasked || undefined}
        status={
          detail ? (
            <div className="crm-drawer-status">
              <StatusBadge tone="info">{detail.tier || "—"}</StatusBadge>
              <StatusBadge tone="ok">{money(Number(detail.cashbackBalance || 0))}</StatusBadge>
            </div>
          ) : undefined
        }
        width="lg"
        onClose={() => {
          setDetail(null);
          setHistory([]);
          setDetailError("");
        }}
      >
        {detailLoading ? <LoadingBlock rows={2} label="Yuklanmoqda…" /> : null}
        {detailError ? <ErrorState message={detailError} /> : null}
        {detail ? (
          <>
            <DrawerSection title="Mijoz">
              <dl className="crm-kv">
                <div>
                  <dt>Ism</dt>
                  <dd>{customerName(detail)}</dd>
                </div>
                <div>
                  <dt>Telefon</dt>
                  <dd>{detail.phoneMasked || "—"}</dd>
                </div>
                {detail.language ? (
                  <div>
                    <dt>Til</dt>
                    <dd>{detail.language}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Ro‘yxatdan</dt>
                  <dd>{fmtDate(detail.createdAt)}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Cashback">
              <dl className="crm-kv">
                <div>
                  <dt>Balans</dt>
                  <dd className="money-md">{money(Number(detail.cashbackBalance || 0))}</dd>
                </div>
                {detail.savedAmount != null ? (
                  <div>
                    <dt>Tejalgan</dt>
                    <dd>{money(Number(detail.savedAmount || 0))}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="meta">Balans tizim hisobi bo‘yicha. Qo‘lda o‘zgartirish yo‘q.</p>
            </DrawerSection>

            <DrawerSection title="Loyalty">
              <dl className="crm-kv">
                <div>
                  <dt>Daraja</dt>
                  <dd>{detail.tier || "—"}</dd>
                </div>
                <div>
                  <dt>Xaridlar</dt>
                  <dd>{Number(detail.purchasesCount || 0)}</dd>
                </div>
                <div>
                  <dt>Umumiy xarid</dt>
                  <dd>{money(Number(detail.totalPurchases || 0))}</dd>
                </div>
              </dl>
              <p className="meta">Loyalty darajasi cashback balansidan alohida.</p>
            </DrawerSection>

            <DrawerSection title="Cashback tarixi">
              {history.length === 0 ? (
                <p className="meta">Cashback operatsiyalari mavjud emas.</p>
              ) : (
                <DataTable>
                  <thead>
                    <tr>
                      <th>Sana</th>
                      <th>Operatsiya</th>
                      <th className="num">Summa</th>
                      <th>Manba</th>
                      <th>Buyurtma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item: any) => (
                      <tr key={item.id}>
                        <td className="meta">{fmtDate(item.createdAt)}</td>
                        <td>
                          <StatusLabelBadge domain="entry" status={item.entryType || ""} />
                          {item.sourceContract ? (
                            <div className="meta">{operatorCapabilityLabel(String(item.sourceContract))}</div>
                          ) : null}
                        </td>
                        <td className="num">
                          {Number(item.cashback) > 0 ? "+" : ""}
                          {money(Number(item.cashback || 0))}
                        </td>
                        <td>{movementSource(item)}</td>
                        <td>
                          {item.orderCode || (item.orderId != null ? `#${item.orderId}` : "—")}
                          {item.receiptId ? <div className="meta">Chek {item.receiptId}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </DrawerSection>
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
