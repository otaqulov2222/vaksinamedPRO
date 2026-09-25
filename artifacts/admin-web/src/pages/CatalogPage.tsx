import { FormEvent, useEffect, useMemo, useState } from "react";
import { request, money, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
  DataTable,
  DetailDrawer,
  DrawerSection,
  FeedbackBanner,
  ErrorState,
  LoadingBlock,
  stockAxisLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Katalogni ko‘rish uchun ruxsat yo‘q.";
  return err instanceof Error ? err.message : fallback;
}

function rxTone(rx: boolean): "warn" | "neutral" {
  return rx ? "warn" : "neutral";
}

function rxLabel(rx: boolean): string {
  return rx ? "Retsept" : "Oddiy";
}

export function CatalogPage(props: {
  token: string;
  user: AdminUser | null;
  permissions: string[];
  branches: any[];
  onOpenInventory?: () => void;
}) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [rxOnly, setRxOnly] = useState("");
  const [msg, setMsg] = useState("");

  const [selected, setSelected] = useState<any | null>(null);
  const [mode, setMode] = useState<"view" | "create">("view");

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editNameUz, setEditNameUz] = useState("");
  const [editNameRu, setEditNameRu] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRx, setEditRx] = useState(false);

  const canManage = props.permissions.includes("products:manage");
  const hasFilters = Boolean(query.trim() || category || rxOnly);

  async function load() {
    setLoading(true);
    setError("");
    try {
      // Catalog = product master data. No branchId — do not pull inventory into this module.
      const data = await request("/api/admin/products", props.token);
      setProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (err) {
      setProducts([]);
      setError(errText(err, "Mahsulotlarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const c = String(p.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((item) => {
      if (category && String(item.category) !== category) return false;
      if (rxOnly === "yes" && !item.requiresPrescription) return false;
      if (rxOnly === "no" && item.requiresPrescription) return false;
      if (!q) return true;
      return `${item.sku} ${item.nameUz} ${item.nameRu} ${item.category}`.toLowerCase().includes(q);
    });
  }, [products, query, category, rxOnly]);

  function resetFilters() {
    setQuery("");
    setCategory("");
    setRxOnly("");
  }

  function openProduct(item: any) {
    setMode("view");
    setSelected(item);
    setEditNameUz(String(item.nameUz || ""));
    setEditNameRu(String(item.nameRu || ""));
    setEditCategory(String(item.category || ""));
    setEditPrice(String(item.price ?? ""));
    setEditDescription(String(item.description || ""));
    setEditRx(Boolean(item.requiresPrescription));
    setMsg("");
  }

  function openCreate() {
    setMode("create");
    setSelected(null);
    setMsg("");
  }

  function closeDrawer() {
    setSelected(null);
    setMode("view");
    setMsg("");
  }

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
      setMode("view");
      setMsg("Mahsulot qo‘shildi.");
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setMsg("Ruxsat yo‘q.");
      else setMsg(err instanceof Error ? err.message : "Mahsulot qo‘shilmadi.");
    } finally {
      setCreating(false);
    }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving) return;
    const price = Number(editPrice);
    if (!editNameUz.trim()) {
      setMsg("Nomi majburiy.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMsg("Narx noto‘g‘ri.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const data = await request(`/api/admin/products/${Number(selected.id)}`, props.token, {
        method: "PATCH",
        body: JSON.stringify({
          nameUz: editNameUz.trim(),
          nameRu: editNameRu.trim() || editNameUz.trim(),
          category: editCategory.trim(),
          price,
          description: editDescription.trim(),
          requiresPrescription: editRx,
        }),
      });
      const next = data?.product || {
        ...selected,
        nameUz: editNameUz.trim(),
        nameRu: editNameRu.trim() || editNameUz.trim(),
        category: editCategory.trim(),
        price,
        description: editDescription.trim(),
        requiresPrescription: editRx,
      };
      setSelected(next);
      setMsg("Saqlandi.");
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setMsg("Ruxsat yo‘q.");
      else if (status === 404) setMsg("Mahsulot topilmadi.");
      else setMsg(err instanceof Error ? err.message : "Saqlanmadi.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!selected) return;
    const next = products.find((p) => Number(p.id) === Number(selected.id));
    if (next) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const drawerOpen = mode === "create" || Boolean(selected);

  return (
    <div className="catalog-page page-module">
      <AdminPageHeader
        title="Mahsulotlar"
        description={PAGE_DESCRIPTIONS.products}
        actions={
          <>
            <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
              Yangilash
            </button>
            {canManage ? (
              <button className="btn-primary" type="button" onClick={openCreate}>
                + Mahsulot qo‘shish
              </button>
            ) : null}
          </>
        }
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Qidiruv" grow>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Nomi yoki SKU"
            />
          </FilterField>
          <FilterField label="Kategoriya">
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategoriya">
              <option value="">Barchasi</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Holat">
            <select value={rxOnly} onChange={(e) => setRxOnly(e.target.value)} aria-label="Holat">
              <option value="">Barchasi</option>
              <option value="yes">Retsept</option>
              <option value="no">Oddiy</option>
            </select>
          </FilterField>
          {hasFilters ? (
            <div className="crm-controls-actions">
              <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
                Tozalash
              </button>
            </div>
          ) : null}
        </div>
        <p className="meta crm-controls-note">
          Qidiruv yuklangan katalog bo‘yicha. Ombor qoldig‘i — Ombor bo‘limida.
        </p>
      </div>

      {msg && !drawerOpen ? (
        <FeedbackBanner tone={msg.includes("qo‘shildi") || msg.includes("Saqlandi") ? "ok" : "warn"}>
          {msg}
        </FeedbackBanner>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && products.length === 0 ? <LoadingBlock rows={3} /> : null}

      {!error && !(loading && products.length === 0) ? (
        <>
          <div className="crm-context">
            <span className="crm-result-count">{filtered.length} ta mahsulot</span>
            {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
          </div>

          <div className="crm-surface surface-table">
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Mahsulot</th>
                  <th className="num">Narx</th>
                  <th>Holat</th>
                  <th>Kategoriya</th>
                  <th className="catalog-col-sku">SKU</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr className="crm-empty-row">
                    <td colSpan={5}>
                      <div className="crm-empty">
                        <div className="empty-title">Mahsulotlar topilmadi</div>
                        <p className="empty-desc">
                          {products.length
                            ? "Tanlangan shartlar bo‘yicha mahsulot mavjud emas."
                            : "Hozircha katalog bo‘sh."}
                        </p>
                        {hasFilters ? (
                          <button className="btn-tertiary" type="button" onClick={resetFilters}>
                            Filtrlarni tozalash
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const active = selected?.id === item.id && mode === "view";
                    const rx = Boolean(item.requiresPrescription);
                    return (
                      <tr
                        key={item.id}
                        className={`crm-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        onClick={() => openProduct(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openProduct(item);
                          }
                        }}
                      >
                        <td>
                          <div className="crm-name">{item.nameUz}</div>
                          {item.nameRu && item.nameRu !== item.nameUz ? (
                            <div className="meta">{item.nameRu}</div>
                          ) : null}
                        </td>
                        <td className="num money-md">{money(Number(item.price || 0))}</td>
                        <td>
                          <StatusBadge tone={rxTone(rx)}>{rxLabel(rx)}</StatusBadge>
                        </td>
                        <td>{item.category || "—"}</td>
                        <td className="catalog-col-sku"><span className="meta">{item.sku || "—"}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>
        </>
      ) : null}

      <DetailDrawer
        open={drawerOpen}
        width="lg"
        title={mode === "create" ? "Yangi mahsulot" : (selected?.nameUz || "Mahsulot")}
        subtitle={mode === "view" && selected ? selected.sku : undefined}
        status={
          mode === "view" && selected ? (
            <StatusBadge tone={rxTone(Boolean(selected.requiresPrescription))}>
              {rxLabel(Boolean(selected.requiresPrescription))}
            </StatusBadge>
          ) : undefined
        }
        onClose={closeDrawer}
      >
        {mode === "create" ? (
          <DrawerSection title="Asosiy ma’lumotlar">
            <form className="catalog-form" onSubmit={addProduct}>
              <label className="filter-field">
                <span className="filter-label">SKU *</span>
                <input name="sku" required aria-label="SKU" />
              </label>
              <label className="filter-field">
                <span className="filter-label">Nomi (uz) *</span>
                <input name="nameUz" required aria-label="Nomi uz" />
              </label>
              <label className="filter-field">
                <span className="filter-label">Nomi (ru)</span>
                <input name="nameRu" aria-label="Nomi ru" />
              </label>
              <label className="filter-field">
                <span className="filter-label">Kategoriya</span>
                <input name="category" aria-label="Kategoriya" />
              </label>
              <label className="filter-field">
                <span className="filter-label">Ishlab chiqaruvchi</span>
                <input name="manufacturer" aria-label="Ishlab chiqaruvchi" />
              </label>
              <label className="filter-field">
                <span className="filter-label">Narx (so‘m) *</span>
                <input name="price" type="number" min="0" required aria-label="Narx" />
              </label>
              <label className="filter-field catalog-form-full">
                <span className="filter-label">Tavsif</span>
                <textarea name="description" aria-label="Tavsif" rows={3} />
              </label>
              <label className="catalog-check catalog-form-full">
                <input type="checkbox" name="requiresPrescription" />
                <span>Retsept talab qiladi</span>
              </label>
              <div className="catalog-form-actions catalog-form-full">
                <button className="btn-primary" type="submit" disabled={creating}>
                  Saqlash
                </button>
                <button className="btn-tertiary" type="button" onClick={closeDrawer}>
                  Bekor qilish
                </button>
              </div>
              <p className="meta catalog-form-full">
                Ombor qoldig‘i bu yerda o‘zgarmaydi — faqat Ombor bo‘limidagi korreksiya orqali.
              </p>
              {msg ? (
                <FeedbackBanner tone={msg.includes("qo‘shildi") ? "ok" : "warn"}>
                  {msg}
                </FeedbackBanner>
              ) : null}
            </form>
          </DrawerSection>
        ) : null}

        {mode === "view" && selected ? (
          <>
            <DrawerSection title="Asosiy ma’lumotlar">
              {canManage ? (
                <form className="catalog-form" onSubmit={saveProduct}>
                  <label className="filter-field">
                    <span className="filter-label">Nomi (uz) *</span>
                    <input
                      value={editNameUz}
                      onChange={(e) => setEditNameUz(e.target.value)}
                      required
                      aria-label="Nomi uz"
                    />
                  </label>
                  <label className="filter-field">
                    <span className="filter-label">Nomi (ru)</span>
                    <input
                      value={editNameRu}
                      onChange={(e) => setEditNameRu(e.target.value)}
                      aria-label="Nomi ru"
                    />
                  </label>
                  <label className="filter-field">
                    <span className="filter-label">Kategoriya</span>
                    <input
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      aria-label="Kategoriya"
                    />
                  </label>
                  <label className="filter-field">
                    <span className="filter-label">SKU</span>
                    <input value={selected.sku || ""} disabled readOnly aria-label="SKU" />
                  </label>
                  <label className="filter-field">
                    <span className="filter-label">Narx (so‘m) *</span>
                    <input
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      type="number"
                      min="0"
                      required
                      aria-label="Narx"
                    />
                  </label>
                  <label className="filter-field catalog-form-full">
                    <span className="filter-label">Tavsif</span>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      aria-label="Tavsif"
                      rows={3}
                    />
                  </label>
                  <label className="catalog-check catalog-form-full">
                    <input
                      type="checkbox"
                      checked={editRx}
                      onChange={(e) => setEditRx(e.target.checked)}
                    />
                    <span>Retsept talab qiladi</span>
                  </label>
                  <div className="catalog-form-actions catalog-form-full">
                    <button className="btn-primary" type="submit" disabled={saving}>
                      Saqlash
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="crm-kv">
                  <div>
                    <dt>Nomi</dt>
                    <dd>{selected.nameUz}</dd>
                  </div>
                  {selected.nameRu && selected.nameRu !== selected.nameUz ? (
                    <div>
                      <dt>Nomi (ru)</dt>
                      <dd>{selected.nameRu}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Kategoriya</dt>
                    <dd>{selected.category || "—"}</dd>
                  </div>
                  <div>
                    <dt>SKU</dt>
                    <dd>{selected.sku || "—"}</dd>
                  </div>
                  <div>
                    <dt>Narx</dt>
                    <dd className="money-md">{money(Number(selected.price || 0))}</dd>
                  </div>
                  <div>
                    <dt>Retsept</dt>
                    <dd>{selected.requiresPrescription ? "Ha" : "Yo‘q"}</dd>
                  </div>
                  {selected.description ? (
                    <div className="catalog-kv-full">
                      <dt>Tavsif</dt>
                      <dd>{selected.description}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
              {msg ? (
                <FeedbackBanner tone={msg.includes("Saqlandi") || msg.includes("qo‘shildi") ? "ok" : "warn"}>
                  {msg}
                </FeedbackBanner>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Ombor">
              <p className="meta">
                Fizik / Band / Mavjud qoldiq Ombor modulida boshqariladi.
              </p>
              {selected.stock ? (
                <dl className="crm-kv">
                  <div>
                    <dt>{stockAxisLabel("physical")}</dt>
                    <dd>{Number(selected.stock.physical || 0)}</dd>
                  </div>
                  <div>
                    <dt>{stockAxisLabel("reserved")}</dt>
                    <dd>{Number(selected.stock.reserved || 0)}</dd>
                  </div>
                  <div>
                    <dt>{stockAxisLabel("available")}</dt>
                    <dd>{Number(selected.stock.available || 0)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="meta">Bu yerda ombor o‘qlari ko‘rsatilmaydi.</p>
              )}
              {props.onOpenInventory ? (
                <button className="btn-tertiary" type="button" onClick={props.onOpenInventory}>
                  Ombor holatini ko‘rish →
                </button>
              ) : null}
            </DrawerSection>
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
