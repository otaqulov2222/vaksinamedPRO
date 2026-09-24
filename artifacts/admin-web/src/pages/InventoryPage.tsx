import { FormEvent, useEffect, useMemo, useState } from "react";
import { request, isHqRole, type AdminUser } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Ombor ko‘rish uchun ruxsat yo‘q (products:read)";
  return err instanceof Error ? err.message : fallback;
}

export function InventoryPage(props: {
  token: string;
  user: AdminUser | null;
  permissions: string[];
  branches: any[];
}) {
  const [products, setProducts] = useState<any[]>([]);
  const [stockBranchId, setStockBranchId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [adjProductId, setAdjProductId] = useState("");
  const [adjDelta, setAdjDelta] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjMsg, setAdjMsg] = useState("");
  const [expireBusy, setExpireBusy] = useState(false);
  const [expireMsg, setExpireMsg] = useState("");

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const canAdjust = props.permissions.includes("inventory:adjust");

  async function load(nextBranchId?: string) {
    const bid = nextBranchId ?? branchId;
    const qs = bid ? `?branchId=${encodeURIComponent(bid)}` : "";
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/products${qs}`, props.token);
      setProducts(Array.isArray(data?.products) ? data.products : []);
      setStockBranchId(data?.stockBranchId != null ? Number(data.stockBranchId) : null);
    } catch (err) {
      setProducts([]);
      setStockBranchId(null);
      setError(errText(err, "Ombor yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  const withStock = useMemo(() => products.filter((p) => p.stock), [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return withStock;
    return withStock.filter((item) => `${item.sku} ${item.nameUz} ${item.category}`.toLowerCase().includes(q));
  }, [withStock, query]);

  /** Server agregatlari yo‘q — bu faqat joriy sahifadagi qatorlar bo‘yicha hisob. */
  const pageTotals = useMemo(() => {
    let physical = 0;
    let reserved = 0;
    let available = 0;
    let zero = 0;
    for (const p of withStock) {
      physical += Number(p.stock?.physical || 0);
      reserved += Number(p.stock?.reserved || 0);
      available += Number(p.stock?.available || 0);
      if (Number(p.stock?.available || 0) <= 0) zero += 1;
    }
    return { physical, reserved, available, zero, rows: withStock.length };
  }, [withStock]);

  /** Korreksiya faqat serverda hisoblanadi — bu UI oldindan ko‘rsatish uchungina. */
  const adjTarget = useMemo(
    () => withStock.find((p) => String(p.id) === adjProductId) || null,
    [withStock, adjProductId],
  );

  async function submitAdjust(event: FormEvent) {
    event.preventDefault();
    if (adjBusy) return;
    const targetBranch = stockBranchId != null ? stockBranchId : Number(branchId);
    const productId = Number(adjProductId);
    const physicalDelta = Number(adjDelta);
    const reason = adjReason.trim();

    if (!Number.isFinite(targetBranch) || targetBranch <= 0) {
      setAdjMsg("Filial tanlanmagan — korreksiya uchun filial majburiy.");
      return;
    }
    if (!Number.isFinite(productId) || productId <= 0) {
      setAdjMsg("Mahsulot tanlanmagan.");
      return;
    }
    if (!Number.isInteger(physicalDelta) || physicalDelta === 0) {
      setAdjMsg("physicalDelta butun va noldan farqli bo‘lishi kerak (masalan −3 yoki 10).");
      return;
    }
    if (!reason) {
      setAdjMsg("Sabab (reason) majburiy.");
      return;
    }

    const branchName = props.branches.find((b) => Number(b.id) === targetBranch)?.name || `#${targetBranch}`;
    const confirmed = window.confirm(
      `Ombor korreksiyasi tasdiqlansinmi?\n\nFilial: ${branchName}\nMahsulot: ${adjTarget?.nameUz || `#${productId}`}\n` +
      `physicalDelta: ${physicalDelta > 0 ? `+${physicalDelta}` : physicalDelta}\nSabab: ${reason}\n\n` +
      "Yakuniy son serverda hisoblanadi va audit logga yoziladi.",
    );
    if (!confirmed) return;

    setAdjBusy(true);
    setAdjMsg("");
    try {
      const data = await request("/api/admin/inventory/adjust", props.token, {
        method: "POST",
        body: JSON.stringify({
          branchId: targetBranch,
          productId,
          physicalDelta,
          reason,
        }),
      });
      const stock = data?.stock;
      setAdjMsg(
        data?.idempotent
          ? "Takroriy so‘rov — server o‘zgarish qilmadi (idempotent)."
          : `Server holati: physical ${stock?.physicalQuantity ?? "—"} · reserved ${stock?.reservedQuantity ?? "—"} · available ${stock?.availableQuantity ?? "—"}`,
      );
      setAdjDelta("");
      setAdjReason("");
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setAdjMsg("Ruxsat yo‘q (inventory:adjust yoki filial doirasi)");
      else setAdjMsg(err instanceof Error ? err.message : "Korreksiya bajarilmadi");
    } finally {
      setAdjBusy(false);
    }
  }

  async function runExpireDue() {
    if (expireBusy) return;
    if (!window.confirm("Muddati o‘tgan bronlarni bo‘shatish ishga tushirilsinmi? Bu server tomonda reservationlarni EXPIRED qiladi.")) {
      return;
    }
    setExpireBusy(true);
    setExpireMsg("");
    try {
      const data = await request("/api/admin/inventory/expire-due", props.token, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setExpireMsg(
        `Tekshirildi: ${Number(data?.examined || 0)} · bo‘shatildi: ${Number(data?.expired || 0)}. ` +
        "Bron muddati tugashi buyurtmani avtomatik bekor qilmaydi (OPEN policy).",
      );
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setExpireMsg("Ruxsat yo‘q (inventory:adjust)");
      else setExpireMsg(err instanceof Error ? err.message : "Bajarilmadi");
    } finally {
      setExpireBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Ombor / Inventory"
        subtitle="Physical · Reserved · Available — product_stocks (server manba). UI hech qachon ombor sonini o‘zi hisoblamaydi."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
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
              setAdjProductId("");
              void load(e.target.value);
            }}
          >
            <option value="">Filial tanlang</option>
            {props.branches.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        ) : (
          <span className="muted">Filial: server doirasi (o‘z filialingiz)</span>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Qidiruv: SKU, nomi" />
      </div>

      {stockBranchId == null ? (
        <div className="card">
          <p className="muted">
            Filial tanlanmagan — <code>/api/admin/products</code> ombor o‘qlarini <code>branchId</code>siz qaytarmaydi.
            Ombor holatini ko‘rish uchun filialni tanlang.
          </p>
        </div>
      ) : (
        <StateBox
          loading={loading}
          error={error || null}
          empty={!loading && !error && filtered.length === 0}
          emptyText={withStock.length ? "Qidiruvga mos mahsulot yo‘q." : "Bu filialda ombor yozuvlari yo‘q."}
        >
          <div className="kpis">
            <div className="card">
              <div className="muted">Filial</div>
              <h2>{props.branches.find((b) => Number(b.id) === stockBranchId)?.name || `#${stockBranchId}`}</h2>
              <div className="muted" style={{ fontSize: 11 }}>stockBranchId={stockBranchId}</div>
            </div>
            <div className="card">
              <div className="muted">Physical (sahifa yig‘indisi)</div>
              <h2>{pageTotals.physical}</h2>
              <div className="muted" style={{ fontSize: 11 }}>{pageTotals.rows} ta mahsulot qatori</div>
            </div>
            <div className="card">
              <div className="muted">Reserved</div>
              <h2>{pageTotals.reserved}</h2>
            </div>
            <div className="card">
              <div className="muted">Available</div>
              <h2>{pageTotals.available}</h2>
              <div className="muted" style={{ fontSize: 11 }}>{pageTotals.zero} ta pozitsiya ≤ 0</div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Yig‘indilar shu ro‘yxatdagi qatorlar bo‘yicha — server tomonda ombor agregat endpointi yo‘q.
          </p>

          <div className="card" style={{ marginTop: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nomi</th>
                  <th>Kategoriya</th>
                  <th>Physical</th>
                  <th>Reserved</th>
                  <th>Available</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const available = Number(item.stock?.available || 0);
                  return (
                    <tr key={item.id}>
                      <td>{item.sku}</td>
                      <td>{item.nameUz}</td>
                      <td>{item.category}</td>
                      <td>{item.stock.physical}</td>
                      <td>{item.stock.reserved}</td>
                      <td>{item.stock.available}</td>
                      <td>
                        {available <= 0 ? (
                          <Badge tone="danger">Mavjud emas</Badge>
                        ) : (
                          <Badge tone="ok">Mavjud</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </StateBox>
      )}

      {canAdjust ? (
        <>
          <form className="card" style={{ marginTop: 16 }} onSubmit={submitAdjust}>
            <h2>Ombor korreksiyasi</h2>
            <p className="muted" style={{ fontSize: 12 }}>
              Faqat <code>POST /api/admin/inventory/adjust</code> orqali. Yakuniy son serverda hisoblanadi,
              o‘zgarish audit logga yoziladi. Reserved o‘qi bu forma orqali o‘zgartirilmaydi.
            </p>
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <select value={adjProductId} onChange={(e) => setAdjProductId(e.target.value)} disabled={stockBranchId == null}>
                <option value="">Mahsulot tanlang</option>
                {withStock.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.sku} — {p.nameUz}
                  </option>
                ))}
              </select>
              <input
                value={adjDelta}
                onChange={(e) => setAdjDelta(e.target.value)}
                type="number"
                step="1"
                placeholder="physicalDelta (±, butun)"
              />
              <input
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Sabab (majburiy): inventarizatsiya, yaroqsiz, qabul…"
              />
              <button className="primary" type="submit" disabled={adjBusy || stockBranchId == null}>
                Tasdiqlab yuborish
              </button>
            </div>
            {adjTarget ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Joriy server holati: physical {adjTarget.stock.physical} · reserved {adjTarget.stock.reserved} ·
                available {adjTarget.stock.available}
              </p>
            ) : null}
            {adjMsg ? <p className="muted">{adjMsg}</p> : null}
          </form>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Muddati o‘tgan bronlar</h2>
            <p className="muted" style={{ fontSize: 12 }}>
              <code>POST /api/admin/inventory/expire-due</code> — ACTIVE bronlardan muddati o‘tganlarini bo‘shatadi.
              Bu in-memory taymer emas, ops triggeri.
            </p>
            <div className="toolbar">
              <button className="ghost" type="button" disabled={expireBusy} onClick={() => void runExpireDue()}>
                Muddati o‘tganlarni bo‘shatish
              </button>
            </div>
            {expireMsg ? <p className="muted">{expireMsg}</p> : null}
          </div>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          Korreksiya uchun <code>inventory:adjust</code> ruxsati kerak — hozir faqat ko‘rish rejimi.
        </p>
      )}
    </>
  );
}
