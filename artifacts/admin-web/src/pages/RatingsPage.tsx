import { useEffect, useMemo, useState } from "react";
import { request, isHqRole, fmtDate, type AdminUser } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

const RATINGS_PAGE = 50;

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Baholar uchun ruxsat yo‘q (ratings:read)";
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
  const [branchFilter, setBranchFilter] = useState<number | null>(null);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isHq = Boolean(props.user && isHqRole(props.user.role));

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
      setBranchFilter(data?.branchFilter != null ? Number(data.branchFilter) : null);
      setOffset(nextOffset);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(errText(err, "Baholar yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load({ offset: 0 });  }, [props.token]);

  /** Faqat joriy sahifa bo‘yicha — server o‘rtacha baho agregatini qaytarmaydi. */
  const pageAverage = useMemo(() => {
    if (!rows.length) return null;
    const sum = rows.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return sum / rows.length;
  }, [rows]);

  const branchName = (id: unknown) =>
    props.branches.find((b) => Number(b.id) === Number(id))?.name || (id != null ? `#${id}` : "—");

  return (
    <>
      <PageHeader
        title="Xodim baholari"
        subtitle="Filial doirasi serverda hal qilinadi (resolveStaffBranchFilter). customerId ro‘yxatda ochilmaydi."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load({ offset })}>
            Yangilash
          </button>
        }
      />

      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        {isHq ? (
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              void load({ offset: 0, branchId: e.target.value });
            }}
          >
            <option value="">Filial: barchasi</option>
            {props.branches.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        ) : (
          <span className="muted">Filial: o‘z filialingiz (server)</span>
        )}
        <span className="muted">
          Server filtri: {branchFilter != null ? branchName(branchFilter) : "barcha filiallar"}
        </span>
      </div>

      <StateBox
        loading={loading}
        error={error || null}
        empty={!loading && !error && rows.length === 0}
        emptyText="Baho yozuvlari yo‘q."
      >
        <div className="kpis">
          <div className="card">
            <div className="muted">Jami baholar</div>
            <h2>{total}</h2>
          </div>
          <div className="card">
            <div className="muted">Sahifa o‘rtachasi</div>
            <h2>{pageAverage != null ? pageAverage.toFixed(2) : "—"}</h2>
            <div className="muted" style={{ fontSize: 11 }}>
              faqat ko‘rinayotgan {rows.length} yozuv bo‘yicha — server agregati yo‘q
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Filial</th>
                <th>Buyurtma</th>
                <th>Xodim / xizmat</th>
                <th>Baho</th>
                <th>Izoh</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{fmtDate(item.createdAt)}</td>
                  <td>{branchName(item.branchId)}</td>
                  <td>{item.orderId != null ? `#${item.orderId}` : "—"}</td>
                  <td>{item.employeeName || "—"}</td>
                  <td><Badge tone={ratingTone(Number(item.rating))}>{item.rating}</Badge></td>
                  <td>{item.comment || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button
              className="ghost"
              type="button"
              disabled={loading || offset <= 0}
              onClick={() => void load({ offset: Math.max(0, offset - RATINGS_PAGE) })}
            >
              Oldingi
            </button>
            <span className="muted">
              {total ? `${offset + 1}–${Math.min(offset + rows.length, total)} / ${total}` : "Jami: 0"}
            </span>
            <button
              className="ghost"
              type="button"
              disabled={loading || !hasMore}
              onClick={() => void load({ offset: offset + RATINGS_PAGE })}
            >
              Keyingi
            </button>
          </div>
        </div>
      </StateBox>
    </>
  );
}
