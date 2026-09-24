import { FormEvent, useEffect, useMemo, useState } from "react";
import { request, isHqRole, type AdminUser } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

const MASK = "••••";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "Filiallar uchun ruxsat yo‘q (branches:read)";
  return err instanceof Error ? err.message : fallback;
}

type EditState = {
  id: number;
  name: string;
  phone: string;
  hours: string;
  address: string;
  isOpen: boolean;
  paymeMerchantId: string;
  clickMerchantId: string;
  clickServiceId: string;
  /** Always starts empty — masked values are never loaded back into inputs. */
  paymeKey: string;
  clickSecret: string;
};

function toEditState(branch: any): EditState {
  return {
    id: Number(branch.id),
    name: String(branch.name || ""),
    phone: String(branch.phone || ""),
    hours: String(branch.hours || ""),
    address: String(branch.address || ""),
    isOpen: Boolean(branch.isOpen),
    paymeMerchantId: String(branch.paymeMerchantId || ""),
    clickMerchantId: String(branch.clickMerchantId || ""),
    clickServiceId: String(branch.clickServiceId || ""),
    paymeKey: "",
    clickSecret: "",
  };
}

export function BranchesPage(props: { token: string; user: AdminUser | null; permissions: string[] }) {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const canManage = props.permissions.includes("branches:manage");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin/branches", props.token);
      setBranches(Array.isArray(data?.branches) ? data.branches : []);
    } catch (err) {
      setBranches([]);
      setError(errText(err, "Filiallar yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((item) =>
      `${item.name} ${item.code} ${item.region} ${item.district} ${item.address} ${item.phone}`
        .toLowerCase()
        .includes(q),
    );
  }, [branches, query]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = {
        name: editing.name,
        phone: editing.phone,
        hours: editing.hours,
        address: editing.address,
        isOpen: editing.isOpen,
        paymeMerchantId: editing.paymeMerchantId,
        clickMerchantId: editing.clickMerchantId,
        clickServiceId: editing.clickServiceId,
      };
      // Bo‘sh kalit maydoni = o‘zgartirmaslik. Masklangan qiymat hech qachon qaytarib yuborilmaydi.
      if (editing.paymeKey.trim() && editing.paymeKey.trim() !== MASK) body.paymeKey = editing.paymeKey.trim();
      if (editing.clickSecret.trim() && editing.clickSecret.trim() !== MASK) body.clickSecret = editing.clickSecret.trim();

      await request(`/api/admin/branches/${editing.id}`, props.token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditing(null);
      setMsg("Saqlandi");
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setMsg("Ruxsat yo‘q (branches:manage yoki filial doirasi)");
      else setMsg(err instanceof Error ? err.message : "Saqlanmadi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Filiallar"
        subtitle="Har bir filialning o‘z Payme/Click kabineti. Maxfiy kalitlar hech qachon ko‘rsatilmaydi — faqat mavjudlik holati."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="toolbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Qidiruv: nom, kod, tuman, manzil, telefon"
        />
      </div>

      {msg ? <p className="muted">{msg}</p> : null}

      <StateBox
        loading={loading}
        error={error || null}
        empty={!loading && !error && filtered.length === 0}
        emptyText={branches.length ? "Qidiruvga mos filial yo‘q." : "Filiallar yo‘q."}
      >
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Filial</th>
                <th>Manzil</th>
                <th>Telefon</th>
                <th>Ish vaqti</th>
                <th>Koordinata</th>
                <th>Holat</th>
                <th>To‘lov kabineti</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    <div className="muted">{item.code}</div>
                  </td>
                  <td>
                    {item.region || item.city || "—"}
                    {item.district ? ` · ${item.district}` : ""}
                    <div className="muted">{item.address}</div>
                  </td>
                  <td>{item.phone || "—"}</td>
                  <td>
                    {item.hours || "—"}
                    {item.is24h ? <div className="muted">24/7</div> : null}
                  </td>
                  <td>
                    {item.lat != null && item.lng != null ? (
                      <span className="muted">{Number(item.lat).toFixed(5)}, {Number(item.lng).toFixed(5)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {item.isOpen ? <Badge tone="ok">Ochiq</Badge> : <Badge tone="danger">Yopiq</Badge>}
                  </td>
                  <td>
                    {item.hasPayme ? <Badge tone="ok">Payme sozlangan</Badge> : <Badge tone="neutral">Payme yo‘q</Badge>}{" "}
                    {item.hasClick ? <Badge tone="ok">Click sozlangan</Badge> : <Badge tone="neutral">Click yo‘q</Badge>}
                  </td>
                  {canManage ? (
                    <td>
                      <button className="ghost" type="button" onClick={() => { setMsg(""); setEditing(toEditState(item)); }}>
                        Tahrirlash
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateBox>

      {!canManage ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Tahrirlash uchun <code>branches:manage</code> ruxsati kerak (faqat ko‘rish rejimi).
        </p>
      ) : props.user && !isHqRole(props.user.role) ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Filial doirasi serverda tekshiriladi: siz faqat o‘z filialingizni
          {props.user.branchId != null ? ` (#${props.user.branchId})` : ""} tahrirlay olasiz.
        </p>
      ) : null}

      {canManage && editing ? (
        <form className="card" style={{ marginTop: 16 }} onSubmit={save}>
          <h2>{editing.name} — tahrirlash</h2>
          <div className="toolbar" style={{ flexDirection: "column" }}>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Nomi" />
            <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="Telefon" />
            <input value={editing.hours} onChange={(e) => setEditing({ ...editing, hours: e.target.value })} placeholder="Ish vaqti" />
            <input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} placeholder="Manzil" />
            <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={editing.isOpen}
                onChange={(e) => setEditing({ ...editing, isOpen: e.target.checked })}
              />
              Filial ochiq
            </label>
          </div>

          <h2 style={{ marginTop: 8 }}>To‘lov kabineti</h2>
          <p className="muted" style={{ fontSize: 12 }}>
            Maxfiy kalitlar server tomonda saqlanadi va API’da <code>{MASK}</code> sifatida qaytadi. Maydon bo‘sh qolsa —
            mavjud kalit o‘zgarmaydi. Yangi qiymat kiritilsagina almashtiriladi.
          </p>
          <div className="toolbar" style={{ flexDirection: "column" }}>
            <input
              value={editing.paymeMerchantId}
              onChange={(e) => setEditing({ ...editing, paymeMerchantId: e.target.value })}
              placeholder="Payme merchant ID (ochiq)"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={editing.paymeKey}
              onChange={(e) => setEditing({ ...editing, paymeKey: e.target.value })}
              placeholder="Payme key — yangi qiymat (bo‘sh = o‘zgarmaydi)"
            />
            <input
              value={editing.clickMerchantId}
              onChange={(e) => setEditing({ ...editing, clickMerchantId: e.target.value })}
              placeholder="Click merchant ID (ochiq)"
            />
            <input
              value={editing.clickServiceId}
              onChange={(e) => setEditing({ ...editing, clickServiceId: e.target.value })}
              placeholder="Click service ID (ochiq)"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={editing.clickSecret}
              onChange={(e) => setEditing({ ...editing, clickSecret: e.target.value })}
              placeholder="Click secret — yangi qiymat (bo‘sh = o‘zgarmaydi)"
            />
          </div>
          <div className="toolbar">
            <button className="primary" type="submit" disabled={saving}>Saqlash</button>
            <button className="ghost" type="button" disabled={saving} onClick={() => setEditing(null)}>Bekor qilish</button>
          </div>
        </form>
      ) : null}
    </>
  );
}
