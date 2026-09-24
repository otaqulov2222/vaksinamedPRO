import { useEffect, useState } from "react";
import { request, fmtDate } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

const AUDIT_PAGE = 40;

export function AuditPage(props: { token: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");

  async function load(opts?: { offset?: number }) {
    const nextOffset = opts?.offset ?? 0;
    const qs = new URLSearchParams();
    qs.set("limit", String(AUDIT_PAGE));
    qs.set("offset", String(nextOffset));
    if (action.trim()) qs.set("action", action.trim());
    if (entity.trim()) qs.set("entity", entity.trim());
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/audit?${qs}`, props.token);
      setRows(Array.isArray(data?.audit) ? data.audit : []);
      setTotal(Number(data?.pagination?.total || 0));
      setHasMore(Boolean(data?.pagination?.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setHasMore(false);
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 401) setError("Sessiya tugagan (401)");
      else if (status === 403) setError("Audit uchun ruxsat yo‘q (audit:read)");
      else setError(err instanceof Error ? err.message : "Audit yuklanmadi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load({ offset: 0 });  }, [props.token]);

  return (
    <>
      <PageHeader
        title="Audit"
        subtitle="Faqat ko‘rish. Tahrirlash/o‘chirish yo‘q. Maxfiy qiymatlar serverda tozalanadi."
        actions={<Badge tone="neutral">read-only</Badge>}
      />

      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="action filtri (masalan order.)" />
        <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="entity (aniq moslik: order, branch…)" />
        <button className="primary" type="button" disabled={loading} onClick={() => void load({ offset: 0 })}>
          Yuklash
        </button>
      </div>

      {error ? (
        <div className="card">
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <button className="ghost" type="button" disabled={loading} onClick={() => void load({ offset })}>
            Qayta urinish
          </button>
        </div>
      ) : (
        <StateBox loading={loading} empty={!loading && rows.length === 0} emptyText="Yozuvlar yo‘q.">
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.createdAt)}</td>
                    <td>{row.actor}</td>
                    <td>{row.action}</td>
                    <td>{row.entity}</td>
                    <td>
                      <code style={{ fontSize: 12 }}>{JSON.stringify(row.metadata || {})}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="toolbar" style={{ marginTop: 12 }}>
              <span className="muted">
                {total ? `${offset + 1}–${Math.min(offset + rows.length, total)} / ${total}` : "Jami: 0"}
              </span>
              <button
                className="ghost"
                type="button"
                disabled={offset <= 0 || loading}
                onClick={() => void load({ offset: Math.max(0, offset - AUDIT_PAGE) })}
              >
                Oldingi
              </button>
              <button
                className="ghost"
                type="button"
                disabled={!hasMore || loading}
                onClick={() => void load({ offset: offset + AUDIT_PAGE })}
              >
                Keyingi
              </button>
            </div>
          </div>
        </StateBox>
      )}
    </>
  );
}
