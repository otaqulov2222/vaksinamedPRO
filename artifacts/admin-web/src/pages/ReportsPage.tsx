import { useEffect, useState } from "react";
import { request, money, fmtDate } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Hisobotlar uchun ruxsat yo‘q (dashboard:read)";
  return err instanceof Error ? err.message : fallback;
}

export function ReportsPage(props: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const body = await request("/api/admin/dashboard", props.token);
      setData(body);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setData(null);
      setError(errText(err, "Hisobot yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  const kpis = data?.kpis;
  const orders = Number(kpis?.orders || 0);
  const completed = Number(kpis?.completed || 0);
  const revenue = Number(kpis?.revenue || 0);
  const completionRate = orders > 0 ? (completed / orders) * 100 : null;
  const avgTicket = completed > 0 ? revenue / completed : null;

  return (
    <>
      <PageHeader
        title="Hisobotlar"
        subtitle="Manba: /api/admin/dashboard server agregatlari. Boshqa hisobot endpointi yo‘q."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="card">
        <p>
          <Badge tone="warn">PARTIAL</Badge>
        </p>
        <p className="muted">
          Hozircha faqat yig‘ma ko‘rsatkichlar mavjud. Sana oralig‘i, filial kesimi, mahsulot/kategoriya bo‘yicha
          batafsil hisobotlar va CSV/Excel eksport server tomonda amalga oshirilmagan — UI bu raqamlarni o‘zi
          hisoblab chiqarmaydi. Filial yoki kun kesimi kerak bo‘lsa, Buyurtmalar bo‘limidagi server filtrlaridan
          foydalaning (Asia/Tashkent kuni).
        </p>
      </div>

      <StateBox loading={loading} error={error || null} empty={!kpis} emptyText="Hisobot ma’lumoti yo‘q.">
        <h2 style={{ marginTop: 16 }}>Savdo</h2>
        <div className="kpis">
          <div className="card">
            <div className="muted">Tushum (COMPLETED)</div>
            <h2>{money(revenue)}</h2>
          </div>
          <div className="card">
            <div className="muted">O‘rtacha chek</div>
            <h2>{avgTicket != null ? money(Math.round(avgTicket)) : "—"}</h2>
            <div className="muted" style={{ fontSize: 11 }}>tushum ÷ yakunlangan buyurtma</div>
          </div>
          <div className="card">
            <div className="muted">Yakunlanish ulushi</div>
            <h2>{completionRate != null ? `${completionRate.toFixed(1)}%` : "—"}</h2>
            <div className="muted" style={{ fontSize: 11 }}>yakunlangan ÷ jami</div>
          </div>
          <div className="card">
            <div className="muted">Davr</div>
            <h2>Butun tarix</h2>
            <div className="muted" style={{ fontSize: 11 }}>endpoint sana filtrini qabul qilmaydi</div>
          </div>
        </div>

        <h2 style={{ marginTop: 16 }}>Buyurtmalar</h2>
        <div className="kpis">
          <div className="card">
            <div className="muted">Jami</div>
            <h2>{orders}</h2>
          </div>
          <div className="card">
            <div className="muted">Yakunlangan</div>
            <h2>{completed}</h2>
          </div>
          <div className="card">
            <div className="muted">Yetkazilmoqda</div>
            <h2>{Number(kpis?.delivering || 0)}</h2>
          </div>
          <div className="card">
            <div className="muted">Bron</div>
            <h2>{Number(kpis?.reserved || 0)}</h2>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Bu sanoqlar legacy <code>orders.status</code> bo‘yicha. P5 o‘qlari (fulfillment / payment / reservation)
          bo‘yicha kesim hisobot endpointida yo‘q.
        </p>

        <h2 style={{ marginTop: 16 }}>Cashback</h2>
        <div className="kpis">
          <div className="card">
            <div className="muted">Umumiy majburiyat</div>
            <h2>{money(Number(kpis?.cashback || 0))}</h2>
            <div className="muted" style={{ fontSize: 11 }}>
              manba: {String(kpis?.cashbackSource || "cashback_accounts")}
            </div>
          </div>
          <div className="card">
            <div className="muted">Berilgan / ishlatilgan kesim</div>
            <h2>—</h2>
            <div className="muted" style={{ fontSize: 11 }}>
              EARN/USE agregati server tomonda yo‘q (faqat mijoz bo‘yicha ledger)
            </div>
          </div>
        </div>

        <h2 style={{ marginTop: 16 }}>Filiallar va mijozlar</h2>
        <div className="kpis">
          <div className="card">
            <div className="muted">Filiallar</div>
            <h2>{Number(kpis?.branches || 0)}</h2>
          </div>
          <div className="card">
            <div className="muted">Mijozlar</div>
            <h2>{Number(kpis?.customers || 0)}</h2>
          </div>
          <div className="card">
            <div className="muted">Filial reytingi</div>
            <h2>—</h2>
            <div className="muted" style={{ fontSize: 11 }}>filial bo‘yicha savdo agregati endpointda yo‘q</div>
          </div>
        </div>

        <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          Oxirgi yuklash: {loadedAt ? fmtDate(loadedAt) : "—"}. Barcha raqamlar server agregatlaridan olinadi.
        </p>
      </StateBox>
    </>
  );
}
