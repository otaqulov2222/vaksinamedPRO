import { useEffect, useState } from "react";
import { request, softRequest, money, fmtDate } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

const SEARCH_PAGE = 20;
const HISTORY_PAGE = 50;

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Cashback ko‘rish uchun ruxsat yo‘q (customers:read)";
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

export function CashbackPage(props: { token: string }) {
  const [liability, setLiability] = useState<number | null>(null);
  const [liabilitySource, setLiabilitySource] = useState("");
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

  useEffect(() => {
    let alive = true;
    void (async () => {
      const dash = await softRequest("/api/admin/dashboard", props.token);
      if (!alive) return;
      if (dash?.kpis?.cashback != null) {
        setLiability(Number(dash.kpis.cashback));
        setLiabilitySource(String(dash.kpis.cashbackSource || "cashback_accounts"));
        setLiabilityNote("");
      } else {
        setLiability(null);
        setLiabilityNote("Umumiy majburiyat ko‘rsatilmaydi: /api/admin/dashboard ochiq emas (dashboard:read kerak).");
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.token]);

  async function search() {
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(SEARCH_PAGE));
      qs.set("offset", "0");
      if (q.trim()) qs.set("q", q.trim());
      const data = await request(`/api/admin/customers?${qs}`, props.token);
      setRows(Array.isArray(data?.customers) ? data.customers : []);
    } catch (err) {
      setRows([]);
      setError(errText(err, "Qidiruv bajarilmadi"));
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
      setHistoryError(errText(err, "Tarix yuklanmadi"));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openCustomer(row: any) {
    setHistory([]);
    setHistoryError("");
    setHistoryOffset(0);
    try {
      const detail = await request(`/api/admin/customers/${row.id}`, props.token);
      setSelected(detail?.customer || row);
      await loadHistory(row, 0);
    } catch (err) {
      setSelected(null);
      setHistoryError(errText(err, "Mijoz ochilmadi"));
    }
  }

  return (
    <>
      <PageHeader
        title="Cashback / Loyalty"
        subtitle="Yagona manba: cashback_accounts (balans) + cashback_ledger (harakat). customers.balance manba emas."
      />

      <div className="kpis">
        <div className="card">
          <div className="muted">Umumiy cashback majburiyati</div>
          <h2>{liability != null ? money(liability) : "—"}</h2>
          <div className="muted" style={{ fontSize: 11 }}>
            {liability != null ? `manba: ${liabilitySource}` : liabilityNote || "yuklanmoqda…"}
          </div>
        </div>
        <div className="card">
          <div className="muted">Balans tahriri</div>
          <h2>Yo‘q</h2>
          <div className="muted" style={{ fontSize: 11 }}>
            Admin panelda qo‘lda balans o‘zgartirish yo‘q — faqat ledger orqali
          </div>
        </div>
        <div className="card">
          <div className="muted">Korreksiya / ADJUSTMENT</div>
          <h2>OPEN</h2>
          <div className="muted" style={{ fontSize: 11 }}>
            Admin korreksiya endpointi yo‘q (arxitektura ochiq masalasi)
          </div>
        </div>
        <div className="card">
          <div className="muted">Refund → cashback</div>
          <h2>OPEN_NOT_AUTO</h2>
          <div className="muted" style={{ fontSize: 11 }}>
            To‘lov qaytarilganda cashback avtomatik teskari yozilmaydi
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Mijoz balansi va harakati</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          Cashback tarixi mijoz bo‘yicha ochiladi: <code>/api/admin/customers/:id/cashback-history</code>.
          Umumiy ledger ro‘yxati endpointi yo‘q — shuning uchun mijozni qidirib ochish kerak.
        </p>
        <div className="toolbar">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mijoz: ism yoki telefon" />
          <button className="primary" type="button" disabled={loading} onClick={() => void search()}>
            Qidirish
          </button>
        </div>

        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        {loading ? <p className="muted">Yuklanmoqda…</p> : null}
        {!loading && !error && searched && rows.length === 0 ? <p className="muted">Mijoz topilmadi.</p> : null}
        {!loading && !error && !searched ? <p className="muted">Qidiruv so‘zini kiriting yoki bo‘sh qidirib oxirgi mijozlarni ko‘ring.</p> : null}

        {rows.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Mijoz</th>
                <th>Telefon</th>
                <th>Daraja</th>
                <th>Cashback balansi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    {`${item.firstName || ""} ${item.lastName || ""}`.trim() || `#${item.id}`}
                    <div className="muted">id {item.id}</div>
                  </td>
                  <td>{item.phoneMasked || "—"}</td>
                  <td>{item.tier}</td>
                  <td>{money(Number(item.cashbackBalance || 0))}</td>
                  <td>
                    <button className="ghost" type="button" onClick={() => void openCustomer(item)}>
                      Tarix
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {selected ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="toolbar" style={{ margin: 0, justifyContent: "space-between" }}>
            <h2>
              {`${selected.firstName || ""} ${selected.lastName || ""}`.trim() || `#${selected.id}`}
              {" — "}
              {money(Number(selected.cashbackBalance || 0))}
            </h2>
            <button className="ghost" type="button" onClick={() => { setSelected(null); setHistory([]); }}>
              Yopish
            </button>
          </div>
          <p className="muted">
            Balans manbasi: {String(selected.cashbackSource || "cashback_accounts")} · harakatlar manbasi: cashback_ledger
          </p>

          <StateBox
            loading={historyLoading}
            error={historyError || null}
            empty={!historyLoading && !historyError && history.length === 0}
            emptyText="Bu mijozda cashback harakati yo‘q."
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>entryType</th>
                  <th>Summa (ledger)</th>
                  <th>Ko‘rinish</th>
                  <th>sourceType</th>
                  <th>sourceKey</th>
                  <th>Buyurtma</th>
                  <th>Chek</th>
                  <th>Filial</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item: any) => (
                  <tr key={item.id}>
                    <td>{fmtDate(item.createdAt)}</td>
                    <td><Badge tone={entryTone(item.entryType)}>{item.entryType}</Badge></td>
                    <td>{money(Number(item.amount || 0))}</td>
                    <td>{Number(item.cashback) > 0 ? "+" : ""}{money(Number(item.cashback || 0))}</td>
                    <td>
                      {item.sourceType || <span className="muted">—</span>}
                      {item.sourceContract ? <div className="muted">{item.sourceContract}</div> : null}
                    </td>
                    <td><code style={{ fontSize: 12 }}>{item.sourceKey || "—"}</code></td>
                    <td>{item.orderCode || (item.orderId != null ? `#${item.orderId}` : "—")}</td>
                    <td>{item.receiptId || "—"}</td>
                    <td>{item.branchName || (item.branchId != null ? `#${item.branchId}` : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="toolbar" style={{ marginTop: 12 }}>
              <button
                className="ghost"
                type="button"
                disabled={historyLoading || historyOffset <= 0}
                onClick={() => void loadHistory(selected, Math.max(0, historyOffset - HISTORY_PAGE))}
              >
                Oldingi
              </button>
              <span className="muted">offset {historyOffset}</span>
              <button
                className="ghost"
                type="button"
                disabled={historyLoading || history.length < HISTORY_PAGE}
                onClick={() => void loadHistory(selected, historyOffset + HISTORY_PAGE)}
              >
                Keyingi
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Endpoint jami sonni qaytarmaydi — «Keyingi» to‘liq sahifa kelganda faol bo‘ladi.
            </p>
          </StateBox>
        </div>
      ) : null}

      <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
        Balansni tahrirlash tugmasi ataylab yo‘q: har qanday o‘zgarish cashback_ledger yozuvi bilan bo‘lishi kerak.
        Qo‘lda korreksiya (ADJUSTMENT) uchun API hali yo‘q — OPEN.
      </p>
    </>
  );
}
