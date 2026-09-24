import { useEffect, useState } from "react";
import { request } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Aksiyalar uchun ruxsat yo‘q (promos:read)";
  return err instanceof Error ? err.message : fallback;
}

export function PromosPage(props: { token: string }) {
  const [promos, setPromos] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin/promos", props.token);
      setPromos(Array.isArray(data?.promos) ? data.promos : []);
      setRewards(Array.isArray(data?.rewards) ? data.rewards : []);
    } catch (err) {
      setPromos([]);
      setRewards([]);
      setError(errText(err, "Aksiyalar yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  return (
    <>
      <PageHeader
        title="Aksiyalar"
        subtitle="PROMO_MARKETING_ONLY — faqat kontent/marketing."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="card">
        <p>
          <Badge tone="warn">PROMO_MARKETING_ONLY</Badge>
        </p>
        <p className="muted">
          Aksiyalar katalog narxini va buyurtma hisob-kitobini o‘zgartirmaydi: tizimda chegirma dvigateli yo‘q.
          Bu bo‘lim ilovadagi marketing bannerlari mazmunini ko‘rsatadi. Narx har doim katalogdan olinadi.
        </p>
      </div>

      <StateBox
        loading={loading}
        error={error || null}
        empty={!loading && !error && promos.length === 0 && rewards.length === 0}
        emptyText="Aksiya yoki sovg‘a yozuvlari yo‘q."
      >
        {promos.length ? (
          <>
            <h2 style={{ marginTop: 16 }}>Marketing bannerlari</h2>
            <div className="kpis">
              {promos.map((item) => (
                <div className="card" key={item.id}>
                  <b>{item.title}</b>
                  {item.subtitle ? <div className="muted">{item.subtitle}</div> : null}
                  {item.tag ? <div style={{ marginTop: 6 }}><Badge tone="neutral">{item.tag}</Badge></div> : null}
                  <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                    Marketing taklifi — narx katalogda, chegirma qo‘llanmaydi
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>Marketing bannerlari yo‘q.</p>
        )}

        {rewards.length ? (
          <>
            <h2 style={{ marginTop: 16 }}>Sovg‘alar ro‘yxati (katalog kontenti)</h2>
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nomi</th>
                    <th>Tavsif</th>
                    <th>Narx / shart</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title || item.name || `#${item.id}`}</td>
                      <td className="muted">{item.subtitle || item.description || "—"}</td>
                      <td>{item.cost != null ? item.cost : item.points != null ? item.points : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 12 }}>
                Sovg‘a almashish dvigateli admin panelda boshqarilmaydi — bu kontent ro‘yxati.
              </p>
            </div>
          </>
        ) : null}
      </StateBox>
    </>
  );
}
