import { useEffect, useState } from "react";
import { request, money, fmtDate } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

const CUSTOMER_PAGE = 25;
const HISTORY_PAGE = 40;

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Mijozlar uchun ruxsat yo‘q (customers:read)";
  if (status === 404) return "Mijoz topilmadi";
  return err instanceof Error ? err.message : fallback;
}

function entryTone(entryType: string): "ok" | "warn" | "danger" | "neutral" {
  const t = String(entryType || "").toUpperCase();
  if (t === "EARN") return "ok";
  if (t === "USE") return "warn";
  if (t === "REVERSAL") return "danger";
  return "neutral";
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

  async function loadPage(opts?: { offset?: number }) {
    const nextOffset = opts?.offset ?? 0;
    const qs = new URLSearchParams();
    qs.set("limit", String(CUSTOMER_PAGE));
    qs.set("offset", String(nextOffset));
    if (q.trim()) qs.set("q", q.trim());
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
      setError(errText(err, "Ro‘yxat yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage({ offset: 0 });  }, [props.token]);

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
      setDetailError(errText(err, "Mijoz ochilmadi"));
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Mijozlar"
        subtitle="Cashback balansi — cashback_accounts (SoT), customers.balance manba emas. Telefon ro‘yxatda masklangan."
      />

      <div className="toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidiruv: ism, telefon, telegram id" />
        <button className="primary" type="button" disabled={loading} onClick={() => void loadPage({ offset: 0 })}>
          Qidirish
        </button>
      </div>

      <StateBox
        loading={loading}
        error={error || null}
        empty={!loading && !error && rows.length === 0}
        emptyText="Mijozlar topilmadi."
      >
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Ism</th>
                <th>Telefon</th>
                <th>Daraja</th>
                <th>Cashback</th>
                <th>Xaridlar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => void openCustomer(item.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    {`${item.firstName || ""} ${item.lastName || ""}`.trim() || `#${item.id}`}
                    <div className="muted">id {item.id}</div>
                  </td>
                  <td>{item.phoneMasked || "—"}</td>
                  <td>{item.tier}</td>
                  <td>{money(Number(item.cashbackBalance || 0))}</td>
                  <td>{item.purchasesCount}</td>
                  <td>
                    <button className="ghost" type="button" onClick={(e) => { e.stopPropagation(); void openCustomer(item.id); }}>
                      Ochish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button
              className="ghost"
              type="button"
              disabled={loading || offset <= 0}
              onClick={() => void loadPage({ offset: Math.max(0, offset - CUSTOMER_PAGE) })}
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
              onClick={() => void loadPage({ offset: offset + CUSTOMER_PAGE })}
            >
              Keyingi
            </button>
          </div>
        </div>
      </StateBox>

      {detailLoading || detailError || detail ? (
        <div className="card" style={{ marginTop: 16 }}>
          {detailLoading ? <p className="muted">Yuklanmoqda…</p> : null}
          {detailError ? <p style={{ color: "var(--danger)" }}>{detailError}</p> : null}
          {detail ? (
            <>
              <div className="toolbar" style={{ margin: 0, justifyContent: "space-between" }}>
                <h2>{`${detail.firstName || ""} ${detail.lastName || ""}`.trim() || `#${detail.id}`}</h2>
                <button className="ghost" type="button" onClick={() => { setDetail(null); setHistory([]); setDetailError(""); }}>
                  Yopish
                </button>
              </div>
              <div className="kpis">
                <div className="card">
                  <div className="muted">Cashback balansi</div>
                  <h2>{money(Number(detail.cashbackBalance || 0))}</h2>
                  <div className="muted" style={{ fontSize: 11 }}>
                    manba: {String(detail.cashbackSource || "cashback_accounts")}
                  </div>
                </div>
                <div className="card">
                  <div className="muted">Daraja</div>
                  <h2>{detail.tier}</h2>
                </div>
                <div className="card">
                  <div className="muted">Xaridlar soni</div>
                  <h2>{Number(detail.purchasesCount || 0)}</h2>
                </div>
                <div className="card">
                  <div className="muted">Umumiy xarid</div>
                  <h2>{money(Number(detail.totalPurchases || 0))}</h2>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 10 }}>
                Telefon: {detail.phoneMasked || "—"} · Til: {detail.language || "—"} · Ro‘yxatdan o‘tgan:{" "}
                {fmtDate(detail.createdAt)}
              </p>

              <h2 style={{ marginTop: 16 }}>Cashback tarixi</h2>
              <p className="muted" style={{ fontSize: 12 }}>
                cashback_ledger proyeksiyasi (faqat ko‘rish). Balansni qo‘lda o‘zgartirish yo‘q.
              </p>
              {history.length === 0 ? (
                <p className="muted">Cashback yozuvlari yo‘q.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vaqt</th>
                      <th>Tur</th>
                      <th>Summa</th>
                      <th>Source</th>
                      <th>Buyurtma / chek</th>
                      <th>Filial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item: any) => (
                      <tr key={item.id}>
                        <td>{fmtDate(item.createdAt)}</td>
                        <td><Badge tone={entryTone(item.entryType)}>{item.entryType}</Badge></td>
                        <td>{Number(item.cashback) > 0 ? "+" : ""}{money(Number(item.cashback || 0))}</td>
                        <td>
                          {item.sourceType || "—"}
                          {item.sourceKey ? <div className="muted">{item.sourceKey}</div> : null}
                          {item.sourceContract ? <div className="muted">{item.sourceContract}</div> : null}
                        </td>
                        <td>
                          {item.orderCode || (item.orderId != null ? `#${item.orderId}` : "—")}
                          {item.receiptId ? <div className="muted">chek {item.receiptId}</div> : null}
                        </td>
                        <td>{item.branchName || (item.branchId != null ? `#${item.branchId}` : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
