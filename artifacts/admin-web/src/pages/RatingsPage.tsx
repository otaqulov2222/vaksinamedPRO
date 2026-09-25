import { useEffect, useState } from "react";
import { request, isHqRole, fmtDate, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  PaginationBar,
  ErrorState,
  LoadingBlock,
  DetailDrawer,
  DrawerSection,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const RATINGS_PAGE = 50;

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Baholar ro‘yxatini ko‘rish uchun ruxsat yo‘q.";
  return err instanceof Error ? err.message : fallback;
}

function ratingTone(rating: number): "ok" | "warn" | "danger" | "neutral" {
  if (rating >= 4) return "ok";
  if (rating === 3) return "warn";
  if (rating > 0) return "danger";
  return "neutral";
}

export function RatingsPage(props: { token: string; user: AdminUser | null; branches: any[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const hasFilters = Boolean(branchId);

  async function load(opts?: { offset?: number; branchId?: string }) {
    const nextOffset = opts?.offset ?? 0;
    const bid = opts?.branchId ?? branchId;
    const qs = new URLSearchParams();
    qs.set("limit", String(RATINGS_PAGE));
    qs.set("offset", String(nextOffset));
    if (bid) qs.set("branchId", bid);
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/ratings?${qs}`, props.token);
      setRows(Array.isArray(data?.ratings) ? data.ratings : []);
      setTotal(Number(data?.total || data?.pagination?.total || 0));
      setHasMore(Boolean(data?.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(errText(err, "Baholarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  function branchName(id: unknown) {
    return props.branches.find((b) => Number(b.id) === Number(id))?.name
      || (id != null ? `Filial #${id}` : "—");
  }

  function resetFilters() {
    setBranchId("");
    void load({ offset: 0, branchId: "" });
  }

  const showSurface = !error && !(loading && rows.length === 0);

  return (
    <div className="ratings-page page-module">
      <AdminPageHeader
        title="Baholar"
        description={PAGE_DESCRIPTIONS.ratings}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load({ offset })}>
            Yangilash
          </button>
        }
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Filial">
            {isHq ? (
              <select
                value={branchId}
                aria-label="Filial"
                onChange={(e) => {
                  setBranchId(e.target.value);
                  void load({ offset: 0, branchId: e.target.value });
                }}
              >
                <option value="">Barchasi</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            ) : (
              <input value="O‘z filiali" disabled readOnly aria-label="Filial" />
            )}
          </FilterField>
          {hasFilters ? (
            <div className="crm-controls-actions">
              <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
                Tozalash
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load({ offset })} /> : null}
      {loading && rows.length === 0 ? <LoadingBlock rows={3} /> : null}

      {!error && !loading ? (
        <div className="crm-context">
          <span className="crm-result-count">{total} ta baho</span>
          {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
        </div>
      ) : null}

      {showSurface ? (
        <div className="crm-surface surface-table">
          <DataTable sticky>
            <thead>
              <tr>
                <th>Sana</th>
                <th>Filial</th>
                <th>Buyurtma</th>
                <th>Xizmat</th>
                <th>Baho</th>
                <th>Izoh</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="crm-empty-row">
                  <td colSpan={6}>
                    <div className="crm-empty">
                      <div className="empty-title">Baholar topilmadi</div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Bu filtrlar bo‘yicha baho topilmadi."
                          : "Hozircha mijoz baholari mavjud emas."}
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
                  const active = selected?.id === item.id;
                  const comment = String(item.comment || "").trim();
                  return (
                    <tr
                      key={item.id}
                      className={`crm-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => setSelected(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(item);
                        }
                      }}
                    >
                      <td className="meta">{fmtDate(item.createdAt)}</td>
                      <td>{branchName(item.branchId)}</td>
                      <td>{item.orderId != null ? `#${item.orderId}` : "—"}</td>
                      <td>{item.employeeName || "—"}</td>
                      <td>
                        <StatusBadge tone={ratingTone(Number(item.rating))}>{item.rating}</StatusBadge>
                      </td>
                      <td className="ratings-comment">
                        {comment ? comment : <span className="meta">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          {rows.length > 0 ? (
            <PaginationBar
              offset={offset}
              limit={RATINGS_PAGE}
              total={total}
              hasMore={hasMore}
              loading={loading}
              onPrev={() => void load({ offset: Math.max(0, offset - RATINGS_PAGE) })}
              onNext={() => void load({ offset: offset + RATINGS_PAGE })}
            />
          ) : null}
        </div>
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? `Baho ${selected.rating}` : "Baho"}
        subtitle={selected ? branchName(selected.branchId) : undefined}
        status={
          selected ? (
            <StatusBadge tone={ratingTone(Number(selected.rating))}>{selected.rating}</StatusBadge>
          ) : undefined
        }
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <DrawerSection title="Baho">
              <dl className="crm-kv">
                <div>
                  <dt>Qiymat</dt>
                  <dd>
                    <StatusBadge tone={ratingTone(Number(selected.rating))}>{selected.rating}</StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt>Sana</dt>
                  <dd>{fmtDate(selected.createdAt)}</dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Bog‘liq">
              <dl className="crm-kv">
                <div>
                  <dt>Buyurtma</dt>
                  <dd>{selected.orderId != null ? `#${selected.orderId}` : "—"}</dd>
                </div>
                <div>
                  <dt>Filial</dt>
                  <dd>{branchName(selected.branchId)}</dd>
                </div>
                <div>
                  <dt>Xizmat</dt>
                  <dd>{selected.employeeName || "—"}</dd>
                </div>
              </dl>
              <p className="meta">Baho buyurtma xizmatiga bog‘langan. Alohida xodim reytingi yo‘q.</p>
            </DrawerSection>
            <DrawerSection title="Izoh">
              <p className="ratings-drawer-comment">
                {String(selected.comment || "").trim() || "Izoh yo‘q."}
              </p>
            </DrawerSection>
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
