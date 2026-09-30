import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { request, isHqRole, type AdminUser } from "../api";
import {
  AdminPageHeader,
  FilterField,
  DataTable,
  PaginationBar,
  ErrorState,
  DetailDrawer,
  DrawerSection,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Server clamps limit to 100; sort is fixed to newest first. */
const RATINGS_PAGE = 50;
const RATING_COLUMNS = 5;
/** POST /ratings accepts integers 1–5 only; the column itself has no CHECK constraint. */
const SCALE_MAX = 5;

type LoadError = { kind: "forbidden" | "session" | "failed"; message: string };
type ScoreTone = "pos" | "neutral" | "warn" | "neg";

function statusOf(err: unknown) {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
}

function listError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Baholarni ko‘rish uchun ruxsat mavjud emas." };
  return { kind: "failed", message: "Baholarni yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring." };
}

/** Operator dates in Asia/Tashkent; stored UTC timestamps are not altered. */
function fmtTashkent(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
}

function onScale(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= SCALE_MAX ? n : null;
}

function scoreTone(n: number | null): ScoreTone {
  if (n == null) return "neutral";
  if (n >= 4) return "pos";
  if (n === 3) return "neutral";
  if (n === 2) return "warn";
  return "neg";
}

function scoreText(value: unknown) {
  const n = onScale(value);
  return n != null ? `${n} / ${SCALE_MAX}` : String(value ?? "—");
}

function RatingScore(props: { value: unknown }) {
  const n = onScale(props.value);
  if (n == null) {
    return (
      <span className="rt-score is-raw" title="Qiymat 1–5 shkalasidan tashqarida">
        <span className="rt-score-num">{String(props.value ?? "—")}</span>
      </span>
    );
  }
  return (
    <span className={`rt-score is-${scoreTone(n)}`} aria-label={`Baho: ${n} / ${SCALE_MAX}`}>
      <span className="rt-stars" aria-hidden="true">
        {Array.from({ length: SCALE_MAX }).map((_, i) => (
          <span key={i} className={i < n ? "rt-star is-on" : "rt-star"}>★</span>
        ))}
      </span>
      <span className="rt-score-num" aria-hidden="true">{n}</span>
    </span>
  );
}

function orderLabel(orderId: unknown) {
  return orderId != null ? `#${orderId}` : "—";
}

export function RatingsPage(props: { token: string; user: AdminUser | null; branches: any[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const listSeq = useRef(0);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const hasFilters = Boolean(branchId);

  async function load(nextOffset: number, bid: string = branchId) {
    const seq = ++listSeq.current;
    const qs = new URLSearchParams();
    qs.set("limit", String(RATINGS_PAGE));
    qs.set("offset", String(nextOffset));
    if (bid) qs.set("branchId", bid);
    setLoading(true);
    setError(null);
    try {
      const data = await request(`/api/admin/ratings?${qs}`, props.token);
      if (seq !== listSeq.current) return;
      setRows(Array.isArray(data?.ratings) ? data.ratings : []);
      setTotal(Number(data?.pagination?.total ?? data?.total ?? 0));
      setHasMore(Boolean(data?.hasMore));
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
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  function branchName(id: unknown) {
    return props.branches.find((b) => Number(b.id) === Number(id))?.name
      || (id != null ? `Filial #${id}` : "—");
  }

  function applyBranch(value: string) {
    setBranchId(value);
    void load(0, value);
  }

  function rowKeys(item: any) {
    return (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSelected(item);
      }
    };
  }

  const initialLoading = loading && !loaded;
  const selectedComment = String(selected?.comment || "").trim();

  return (
    <div className="ratings-page page-module">
      <AdminPageHeader
        title="Baholar"
        description={PAGE_DESCRIPTIONS.ratings}
        meta={<span className="rt-readonly">Faqat ko‘rish — baholarni o‘zgartirish API mavjud emas</span>}
        actions={
          <button
            className={`btn-secondary rt-refresh${loading ? " is-busy" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => void load(offset)}
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            Yangilash
          </button>
        }
      />

      <section className="rt-list" aria-label="Mijoz baholari">
        <div className="rt-controls">
          <FilterField label="Filial">
            {isHq ? (
              <select value={branchId} disabled={loading && !loaded} onChange={(e) => applyBranch(e.target.value)}>
                <option value="">Barcha filiallar</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            ) : (
              <input value="O‘z filiali" disabled readOnly />
            )}
          </FilterField>
          {hasFilters ? (
            <button className="btn-tertiary rt-clear" type="button" disabled={loading} onClick={() => applyBranch("")}>
              Tozalash
            </button>
          ) : null}
          <span className="rt-controls-note">Filial filtri serverda · qidiruv va saralash API’da yo‘q · eng yangilari birinchi</span>
        </div>

        <div className="rt-summary" aria-live="polite">
          <span className="rt-result-count">
            {initialLoading ? "Yuklanmoqda…" : error ? "—" : hasFilters ? `${total} ta baho topildi` : `Jami ${total} ta baho`}
          </span>
          {hasFilters && !error ? <span className="rt-summary-hint">{branchName(branchId)}</span> : null}
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={error.kind === "failed" ? () => void load(offset) : undefined} />
        ) : (
          <div
            className={`rt-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !rows.length ? " is-empty" : ""}`}
            aria-busy={loading}
          >
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Baho</th>
                  <th className="rt-col-order">Buyurtma</th>
                  <th>Filial</th>
                  <th>Izoh</th>
                  <th>Sana</th>
                </tr>
              </thead>
              <tbody>
                {initialLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="rt-skeleton-row" aria-hidden="true">
                      {Array.from({ length: RATING_COLUMNS }).map((__, c) => (
                        <td key={c}><span className="rt-skeleton" /></td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr className="rt-empty-row">
                    <td colSpan={RATING_COLUMNS}>
                      <div className="rt-empty" role="status">
                        <div className="empty-title">
                          {hasFilters ? "Tanlangan filial bo‘yicha baholar topilmadi." : "Baholar topilmadi."}
                        </div>
                        <p className="empty-desc">
                          {hasFilters
                            ? "Boshqa filialni tanlang yoki filtrni tozalang."
                            : "Mijoz yakunlangan buyurtmani ilovada baholagach, baho shu yerda ko‘rinadi."}
                        </p>
                        {hasFilters ? (
                          <button className="btn-tertiary" type="button" onClick={() => applyBranch("")}>
                            Filtrni tozalash
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
                        className={`rt-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        aria-label={`Baho ${scoreText(item.rating)}, ${branchName(item.branchId)} — tafsilot`}
                        onClick={() => setSelected(item)}
                        onKeyDown={rowKeys(item)}
                      >
                        <td className="rt-cell-score"><RatingScore value={item.rating} /></td>
                        <td className="rt-cell-order rt-col-order">{orderLabel(item.orderId)}</td>
                        <td className="rt-cell-branch">{branchName(item.branchId)}</td>
                        <td className="rt-cell-comment">
                          {comment ? <span className="rt-comment">{comment}</span> : <span className="rt-muted">Izohsiz</span>}
                        </td>
                        <td className="rt-cell-date">{fmtTashkent(item.createdAt)}</td>
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
                onPrev={() => void load(Math.max(0, offset - RATINGS_PAGE))}
                onNext={() => void load(offset + RATINGS_PAGE)}
              />
            ) : null}
          </div>
        )}
      </section>

      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? `Baho ${scoreText(selected.rating)}` : "Baho"}
        subtitle={selected ? branchName(selected.branchId) : undefined}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <DrawerSection title="Baho">
              <dl className="rt-kv">
                <div>
                  <dt>Baho</dt>
                  <dd><RatingScore value={selected.rating} /></dd>
                </div>
                <div>
                  <dt>Sana</dt>
                  <dd>{fmtTashkent(selected.createdAt)}</dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Buyurtma">
              <dl className="rt-kv">
                <div>
                  <dt>Buyurtma</dt>
                  <dd className="rt-kv-mono">{selected.orderId != null ? orderLabel(selected.orderId) : "Bog‘lanmagan (eski yozuv)"}</dd>
                </div>
                <div>
                  <dt>Baholangan</dt>
                  <dd>{selected.employeeName || "—"}</dd>
                </div>
              </dl>
              <p className="rt-note">
                Baho yakunlangan buyurtma bo‘yicha filial xizmatiga beriladi; mahsulot yoki xodimga bog‘lanmagan.
                Mijoz ma’lumoti bu API’da berilmaydi.
              </p>
            </DrawerSection>
            <DrawerSection title="Filial">
              <dl className="rt-kv">
                <div>
                  <dt>Filial</dt>
                  <dd>{branchName(selected.branchId)}</dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Izoh">
              {selectedComment ? (
                <p className="rt-comment-full">{selectedComment}</p>
              ) : (
                <p className="rt-muted rt-comment-none">Izohsiz</p>
              )}
            </DrawerSection>
            <details className="rt-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="rt-kv rt-kv-tech">
                <div>
                  <dt>Baho ID</dt>
                  <dd className="rt-kv-mono">{selected.id ?? "—"}</dd>
                </div>
                <div>
                  <dt>Buyurtma ID</dt>
                  <dd className="rt-kv-mono">{selected.orderId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Filial ID</dt>
                  <dd className="rt-kv-mono">{selected.branchId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Qiymat (xom)</dt>
                  <dd className="rt-kv-mono">{String(selected.rating ?? "—")}</dd>
                </div>
                <div>
                  <dt>Yaratilgan (UTC)</dt>
                  <dd className="rt-kv-mono">{selected.createdAt ? String(selected.createdAt) : "—"}</dd>
                </div>
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
