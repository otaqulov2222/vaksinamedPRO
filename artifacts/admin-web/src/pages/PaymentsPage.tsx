import { useEffect, useState } from "react";
import { request, money, fmtDate } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "To‘lovlar uchun ruxsat yo‘q (payments:read)";
  if (status === 404) return "Topilmadi";
  return err instanceof Error ? err.message : fallback;
}

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = String(status || "").toUpperCase();
  if (s === "PAID" || s === "CAPTURED" || s === "SUCCEEDED") return "ok";
  if (s === "FAILED" || s === "CANCELLED" || s === "CANCELED") return "danger";
  if (s.includes("REFUND") || s === "PENDING" || s === "REQUIRES_ACTION") return "warn";
  return "neutral";
}

export function PaymentsPage(props: { token: string; permissions: string[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [snapshot, setSnapshot] = useState<any>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMsg, setRefundMsg] = useState("");

  const canManage = props.permissions.includes("payments:manage");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin/payments", props.token);
      setRows(Array.isArray(data?.payments) ? data.payments : []);
    } catch (err) {
      setRows([]);
      setError(errText(err, "To‘lovlar yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  async function openIntent(intentId: number) {
    setSnapLoading(true);
    setSnapError("");
    setRefundMsg("");
    setSnapshot(null);
    try {
      const data = await request(`/api/admin/payments/intents/${intentId}`, props.token);
      setSnapshot(data);
    } catch (err) {
      setSnapError(errText(err, "Intent ochilmadi"));
    } finally {
      setSnapLoading(false);
    }
  }

  async function refund(intentId: number, refundableAmount: number) {
    if (refundBusy) return;
    const confirmed = window.confirm(
      `Refund so‘rovi yuborilsinmi?\n\nIntent: #${intentId}\nQaytarish mumkin: ${money(refundableAmount)}\n\n` +
      "Diqqat: provayder (Payme/Click) tomonidagi haqiqiy pul qaytarish CONTRACT_PENDING — bu amal faqat ichki refund " +
      "yozuvini yaratadi. Cashback avtomatik teskari yozilmaydi.",
    );
    if (!confirmed) return;

    setRefundBusy(true);
    setRefundMsg("");
    try {
      const data = await request(`/api/admin/payments/intents/${intentId}/refund`, props.token, {
        method: "POST",
        body: JSON.stringify({ reason: "admin_refund" }),
      });
      const execution = data?.refund?.providerExecution || data?.providerExecution || "—";
      setRefundMsg(
        `Refund yozuvi: ${data?.refund?.status || "—"} · providerExecution: ${execution}` +
        `${data?.idempotent ? " · takroriy so‘rov (idempotent)" : ""}` +
        ` · cashbackReversal: ${data?.cashbackReversal || "OPEN_NOT_AUTO"}`,
      );
      await openIntent(intentId);
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setRefundMsg("Ruxsat yo‘q (payments:manage yoki filial doirasi)");
      else setRefundMsg(err instanceof Error ? err.message : "Refund bajarilmadi");
    } finally {
      setRefundBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="To‘lovlar"
        subtitle="Har bir filialning o‘z Payme/Click kabineti. Kalitlar Filiallar bo‘limida kiritiladi va hech qachon ko‘rsatilmaydi."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <StateBox
        loading={loading}
        error={error || null}
        empty={!loading && !error && rows.length === 0}
        emptyText="To‘lov yozuvlari yo‘q."
      >
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Buyurtma</th>
                <th>Provayder</th>
                <th>Filial</th>
                <th>Merchant (ochiq)</th>
                <th>Holat</th>
                <th>Summa</th>
                <th>Intent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.orderId != null ? `#${item.orderId}` : "—"}</td>
                  <td>{item.provider}</td>
                  <td>{item.branchId != null ? `#${item.branchId}` : "—"}</td>
                  <td>{item.merchantId || <span className="muted">—</span>}</td>
                  <td><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                  <td>{money(Number(item.amount || 0))}</td>
                  <td>{item.paymentIntentId != null ? `#${item.paymentIntentId}` : <span className="muted">yo‘q</span>}</td>
                  <td>
                    {item.paymentIntentId != null ? (
                      <button className="ghost" type="button" onClick={() => void openIntent(Number(item.paymentIntentId))}>
                        Intent
                      </button>
                    ) : (
                      <span className="muted">legacy</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12 }}>
            Ro‘yxat filial doirasi bo‘yicha serverda filtrlanadi. Maxfiy kalitlar (payme_key / click_secret) API’da
            umuman qaytarilmaydi.
          </p>
        </div>
      </StateBox>

      {snapLoading || snapError || snapshot ? (
        <div className="card" style={{ marginTop: 16 }}>
          {snapLoading ? <p className="muted">Yuklanmoqda…</p> : null}
          {snapError ? <p style={{ color: "var(--danger)" }}>{snapError}</p> : null}
          {snapshot ? (
            <>
              <div className="toolbar" style={{ margin: 0, justifyContent: "space-between" }}>
                <h2>Intent #{snapshot.intent?.id} — {snapshot.intent?.provider}</h2>
                <button className="ghost" type="button" onClick={() => { setSnapshot(null); setRefundMsg(""); }}>
                  Yopish
                </button>
              </div>
              <div className="kpis">
                <div className="card">
                  <div className="muted">Intent holati</div>
                  <h2><Badge tone={statusTone(snapshot.intent?.status)}>{snapshot.intent?.status}</Badge></h2>
                </div>
                <div className="card">
                  <div className="muted">Summa</div>
                  <h2>{money(Number(snapshot.intent?.amount || 0))}</h2>
                  <div className="muted" style={{ fontSize: 11 }}>{snapshot.intent?.currency}</div>
                </div>
                <div className="card">
                  <div className="muted">Qaytarish mumkin</div>
                  <h2>{money(Number(snapshot.refundableAmount || 0))}</h2>
                </div>
                <div className="card">
                  <div className="muted">Buyurtma payment o‘qi</div>
                  <h2>{snapshot.orderPaymentStatus || snapshot.axes?.paymentStatus || "—"}</h2>
                  <div className="muted" style={{ fontSize: 11 }}>{snapshot.axes?.note || "payment_axis_only"}</div>
                </div>
              </div>

              <p className="muted" style={{ marginTop: 10 }}>
                Buyurtma {snapshot.intent?.orderId != null ? `#${snapshot.intent.orderId}` : "—"} · filial{" "}
                {snapshot.intent?.branchId != null ? `#${snapshot.intent.branchId}` : "—"} · merchant{" "}
                {snapshot.intent?.merchantId || "—"} · yaratilgan {fmtDate(snapshot.intent?.createdAt)}
              </p>

              <h2 style={{ marginTop: 16 }}>Urinishlar</h2>
              {Array.isArray(snapshot.attempts) && snapshot.attempts.length ? (
                <table className="table">
                  <thead><tr><th>ID</th><th>Provayder</th><th>Holat</th><th>externalRef</th><th>Vaqt</th></tr></thead>
                  <tbody>
                    {snapshot.attempts.map((a: any) => (
                      <tr key={a.id}>
                        <td>{a.id}</td>
                        <td>{a.provider}</td>
                        <td><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                        <td><code style={{ fontSize: 12 }}>{a.externalRef || "—"}</code></td>
                        <td>{fmtDate(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Urinish yozuvlari yo‘q.</p>
              )}

              <h2 style={{ marginTop: 16 }}>Capture</h2>
              {snapshot.capture ? (
                <p>
                  #{snapshot.capture.id} · {money(Number(snapshot.capture.amount || 0))} ·{" "}
                  {fmtDate(snapshot.capture.capturedAt)}
                </p>
              ) : (
                <p className="muted">Capture yo‘q.</p>
              )}

              <h2 style={{ marginTop: 16 }}>Refundlar</h2>
              {Array.isArray(snapshot.refunds) && snapshot.refunds.length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Summa</th>
                      <th>Holat</th>
                      <th>Sabab</th>
                      <th>providerRefundId</th>
                      <th>providerExecution</th>
                      <th>Vaqt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.refunds.map((r: any) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{money(Number(r.amount || 0))}</td>
                        <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                        <td>{r.reason || "—"}</td>
                        <td>{r.providerRefundId || <span className="muted">yo‘q</span>}</td>
                        <td>
                          {r.providerExecution ? (
                            <Badge tone={String(r.providerExecution).includes("PENDING") ? "warn" : "neutral"}>
                              {r.providerExecution}
                            </Badge>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>{fmtDate(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Refund yozuvlari yo‘q.</p>
              )}

              {canManage ? (
                <div className="toolbar" style={{ flexWrap: "wrap" }}>
                  <button
                    className="ghost"
                    type="button"
                    disabled={refundBusy || Number(snapshot.refundableAmount || 0) <= 0}
                    onClick={() => void refund(Number(snapshot.intent?.id), Number(snapshot.refundableAmount || 0))}
                  >
                    To‘liq refund so‘rash
                  </button>
                  {Number(snapshot.refundableAmount || 0) <= 0 ? (
                    <span className="muted">Qaytarish mumkin bo‘lgan summa yo‘q.</span>
                  ) : null}
                </div>
              ) : (
                <p className="muted" style={{ marginTop: 12 }}>
                  Refund uchun <code>payments:manage</code> ruxsati kerak.
                </p>
              )}

              {refundMsg ? <p className="muted">{refundMsg}</p> : null}

              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Provayder tomonidagi haqiqiy pul qaytarish CONTRACT_PENDING: Payme/Click refund protokoli hali
                ulanmagan. Refund yozuvi yaratiladi, lekin pul avtomatik qaytmaydi. Cashback teskari yozuvi ham
                avtomatik emas (OPEN_NOT_AUTO).
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
