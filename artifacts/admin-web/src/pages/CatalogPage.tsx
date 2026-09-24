import { FormEvent, useEffect, useMemo, useState } from "react";
import { request, money, isHqRole, type AdminUser } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Katalog uchun ruxsat yo‘q (products:read)";
  return err instanceof Error ? err.message : fallback;
}

export function CatalogPage(props: {
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
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const canManage = props.permissions.includes("products:manage");

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
      setError(errText(err, "Katalog yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((item) =>
      `${item.sku} ${item.nameUz} ${item.nameRu} ${item.category}`.toLowerCase().includes(q),
    );
  }, [products, query]);

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setCreating(true);
    setMsg("");
    try {
      await request("/api/admin/products", props.token, {
        method: "POST",
        body: JSON.stringify({
          sku: String(data.get("sku") || "").trim(),
          nameUz: String(data.get("nameUz") || "").trim(),
          nameRu: String(data.get("nameRu") || data.get("nameUz") || "").trim(),
          category: String(data.get("category") || "").trim(),
          manufacturer: String(data.get("manufacturer") || "").trim(),
          price: Number(data.get("price")) || 0,
          description: String(data.get("description") || "").trim(),
          requiresPrescription: data.get("requiresPrescription") === "on",
        }),
      });
      form.reset();
      setMsg("Mahsulot qo‘shildi");
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setMsg("Ruxsat yo‘q (products:manage)");
      else setMsg(err instanceof Error ? err.message : "Mahsulot qo‘shilmadi");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Katalog"
        subtitle="Ombor o‘qlari (product_stocks): Physical · Reserved · Available (= physical − reserved). Server manba — UI inventar yaratmaydi."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Qidiruv: SKU, nomi, kategoriya" />
        {isHq ? (
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              void load(e.target.value);
            }}
          >
            <option value="">Filial tanlang (ombor o‘qlari)</option>
            {props.branches.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        ) : null}
      </div>

      {isHq ? (
        <p className="muted">
          {stockBranchId != null
            ? `Ombor o‘qlari: filial #${stockBranchId} (product_stocks).`
            : "Ombor: filial tanlanmagan — stock=null. Katalog narxi ko‘rinadi, ombor soni ko‘rsatilmaydi."}
        </p>
      ) : (
        <p className="muted">
          Filial ombori: {stockBranchId != null ? `filial #${stockBranchId}` : "server filial doirasi"}
        </p>
      )}

      {msg ? <p className="muted">{msg}</p> : null}

      {canManage ? (
        <form className="card" onSubmit={addProduct}>
          <h2>Yangi mahsulot</h2>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            <input name="sku" placeholder="SKU" required />
            <input name="nameUz" placeholder="Nomi (uz)" required />
            <input name="nameRu" placeholder="Nomi (ru) — ixtiyoriy" />
            <input name="category" placeholder="Kategoriya" />
            <input name="manufacturer" placeholder="Ishlab chiqaruvchi" />
            <input name="price" type="number" min="0" placeholder="Narx (so‘m)" required />
          </div>
          <textarea name="description" placeholder="Tavsif" />
          <div className="toolbar">
            <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="requiresPrescription" style={{ width: "auto" }} />
              Retsept talab qiladi
            </label>
            <button className="primary" type="submit" disabled={creating}>Qo‘shish</button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Mahsulot yaratilganda server barcha filiallarda boshlang‘ich stock yozuvini ochadi. Ombor sonini
            o‘zgartirish faqat Ombor bo‘limidagi rasmiy korreksiya orqali.
          </p>
        </form>
      ) : null}

      <StateBox
        loading={loading}
        error={error || null}
        empty={!loading && !error && filtered.length === 0}
        emptyText={products.length ? "Qidiruvga mos mahsulot yo‘q." : "Katalog bo‘sh."}
      >
        <div className="card" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nomi</th>
                <th>Kategoriya</th>
                <th>Narx</th>
                <th>Physical</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Retsept</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>
                    {item.nameUz}
                    {item.nameRu && item.nameRu !== item.nameUz ? <div className="muted">{item.nameRu}</div> : null}
                  </td>
                  <td>{item.category}</td>
                  <td>{money(Number(item.price || 0))}</td>
                  <td>{item.stock ? item.stock.physical : <span className="muted">—</span>}</td>
                  <td>{item.stock ? item.stock.reserved : <span className="muted">—</span>}</td>
                  <td>{item.stock ? item.stock.available : <span className="muted">—</span>}</td>
                  <td>{item.requiresPrescription ? <Badge tone="warn">Ha</Badge> : <Badge tone="neutral">Yo‘q</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateBox>
    </>
  );
}
