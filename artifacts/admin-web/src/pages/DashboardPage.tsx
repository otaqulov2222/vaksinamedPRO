import { useEffect, useState } from "react";
import { request, money, fmtDate } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Dashboard uchun ruxsat yo‘q (dashboard:read)";
  return err instanceof Error ? err.message : fallback;
}

function fulfillmentTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED") return "ok";
  if (s === "CANCELLED") return "danger";
  if (s === "CREATED") return "neutral";
  return "warn";
}

function paymentTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = String(status || "").toUpperCase();
  if (s === "PAID") return "ok";
  if (s === "FAILED") return "danger";
  if (s === "REFUNDED" || s === "PARTIALLY_REFUNDED") return "warn";
  return "neutral";
}

export function DashboardPage(props: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const body = await request("/api/admin/dashboard", props.token);
      setData(body);
    } catch (err) {
      setData(null);
      setError(errText(err, "Dashboard yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  const kpis = data?.kpis;
  const recent: any[] = Array.isArray(data?.recentOrders) ? data.recentOrders : [];

  return (
    <>
      <PageHeader
        title="Tarmoq nazorati"
        subtitle="Savdo, bron, yetkazib berish va cashback kesimi — server agregatlari (/api/admin/dashboard)"
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <StateBox loading={loading} error={error || null} empty={!kpis} emptyText="Dashboard ma’lumoti yo‘q.">
        <div className="kpis">
          <div className="card">
            <div className="muted">Yakunlangan savdo</div>
            <h2>{money(Number(kpis?.revenue || 0))}</h2>
            <div className="muted" style={{ fontSize: 11 }}>COMPLETED buyurtmalar summasi (server agregat)</div>
          </div>
          <div className="card">
            <div className="muted">Buyurtmalar</div>
            <h2>{Number(kpis?.orders || 0)}</h2>
            <div className="muted" style={{ fontSize: 11 }}>jami yozuvlar</div>
          </div>
          <div className="card">
            <div className="muted">Yakunlangan</div>
            <h2>{Number(kpis?.completed || 0)}</h2>
            <div className="muted" style={{ fontSize: 11 }}>completed</div>
          </div>
          <div className="card">
            <div className="muted">Yetkazilmoqda</div>
            <h2>{Number(kpis?.delivering || 0)}</h2>
            <div className="muted" style={{ fontSize: 11 }}>awaiting_delivery / paid</div>
          </div>
          <div className="card">
            <div className="muted">Bron</div>
            <h2>{Number(kpis?.reserved || 0)}</h2>
            <div className="muted" style={{ fontSize: 11 }}>reserved</div>
          </div>
          <div className="card">
            <div className="muted">Mijozlar</div>
            <h2>{Number(kpis?.customers || 0)}</h2>
          </div>
          <div className="card">
            <div className="muted">Cashback (majburiyat)</div>
            <h2>{money(Number(kpis?.cashback || 0))}</h2>
            <div className="muted" style={{ fontSize: 11 }}>
              manba: {String(kpis?.cashbackSource || "cashback_accounts")}
            </div>
          </div>
          <div className="card">
            <div className="muted">Filiallar</div>
            <h2>{Number(kpis?.branches || 0)}</h2>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h2>So‘nggi buyurtmalar</h2>
          {recent.length === 0 ? (
            <p className="muted">Buyurtmalar yo‘q.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Filial</th>
                  <th>Tur</th>
                  <th>Fulfillment</th>
                  <th>Payment</th>
                  <th>Reservation</th>
                  <th>Summa</th>
                  <th>Yaratilgan</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item: any) => (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>{item.branch?.name || `#${item.branchId}`}</td>
                    <td>{item.fulfillment}</td>
                    <td>
                      <Badge tone={fulfillmentTone(item.fulfillmentStatus || item.status)}>
                        {item.fulfillmentStatus || item.status}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={paymentTone(item.paymentStatus)}>{item.paymentStatus || "—"}</Badge>
                    </td>
                    <td>{item.reservationStatus || "—"}{item.reservationExpired ? " (EXPIRED)" : ""}</td>
                    <td>{money(Number(item.total || 0))}</td>
                    <td>{fmtDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          Ombor ogohlantirishlari bu endpointda yo‘q — Ombor bo‘limida filial bo‘yicha product_stocks ko‘riladi.
        </p>
      </StateBox>
    </>
  );
}
