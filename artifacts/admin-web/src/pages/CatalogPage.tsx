import { FormEvent, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { request, softRequest, money, fmtDate, isHqRole, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  PaginationBar,
  ConfirmDialog,
  DetailDrawer,
  DrawerSection,
  FeedbackBanner,
  ErrorState,
  stockAxisLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Server cap of GET /api/catalog/products (MAX_LIMIT = 50). */
const PAGE_SIZE = 50;
/** Server truncates `q` to 80 characters (MAX_QUERY_LEN). */
const MAX_QUERY = 80;
/** products.price is a Postgres integer column. */
const PRICE_MAX = 2_147_483_647;

type Sort = "default" | "name" | "price_asc" | "price_desc";
type Filters = { q: string; category: string; sort: Sort };
type Mode = "view" | "edit" | "create";
type Notice = { tone: "ok" | "warn" | "danger"; text: string };
type Draft = {
  sku: string;
  nameUz: string;
  nameRu: string;
  category: string;
  manufacturer: string;
  price: string;
  description: string;
  requiresPrescription: boolean;
};
type Change = { key: string; label: string; from: string; to: string; value: string | number | boolean };
type Pending = { kind: "create" } | { kind: "edit"; changes: Change[] };

const EMPTY_FILTERS: Filters = { q: "", category: "", sort: "default" };
const EMPTY_DRAFT: Draft = {
  sku: "",
  nameUz: "",
  nameRu: "",
  category: "",
  manufacturer: "",
  price: "",
  description: "",
  requiresPrescription: false,
};
const SORTS: { value: Sort; label: string }[] = [
  { value: "default", label: "Standart (ID)" },
  { value: "name", label: "Nomi (A–Z)" },
  { value: "price_asc", label: "Narx: arzonidan" },
  { value: "price_desc", label: "Narx: qimmatidan" },
];

function statusOf(err: unknown) {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
}

function mutationError(err: unknown, kind: "create" | "edit"): string {
  const status = statusOf(err);
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Bu amal uchun ruxsat yo‘q.";
  if (status === 404) return "Mahsulot topilmadi — ro‘yxat yangilandi.";
  if (!status) return "Aloqa uzildi — natija noma’lum. Ro‘yxatni yangilab, SKU bo‘yicha tekshiring.";
  return kind === "create"
    ? "Mahsulot qo‘shilmadi. Bu SKU katalogda allaqachon bo‘lishi mumkin — tekshirib, qayta urinib ko‘ring."
    : "O‘zgarishlar saqlanmadi. Qayta urinib ko‘ring.";
}

function parsePrice(raw: string): number | null {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n <= PRICE_MAX ? n : null;
}

function draftFrom(item: any): Draft {
  return {
    sku: String(item.sku || ""),
    nameUz: String(item.nameUz || ""),
    nameRu: String(item.nameRu || ""),
    category: String(item.category || ""),
    manufacturer: String(item.manufacturer || ""),
    price: String(item.price ?? ""),
    description: String(item.description || ""),
    requiresPrescription: Boolean(item.requiresPrescription),
  };
}

function validate(d: Draft, mode: Mode): string {
  if (mode === "create" && !d.sku.trim()) return "SKU majburiy.";
  if (!d.nameUz.trim()) return "Nomi (uz) majburiy.";
  if (parsePrice(d.price) == null) return "Narx butun son bo‘lishi kerak (so‘m, 0 yoki undan katta).";
  return "";
}

function rxText(rx: boolean) {
  return rx ? "Talab qilinadi" : "Talab qilinmaydi";
}

/** Only fields accepted by PATCH /api/admin/products/:id, and only those that changed. */
function diffDraft(item: any, d: Draft): Change[] {
  const out: Change[] = [];
  const nameUz = d.nameUz.trim();
  const nameRu = d.nameRu.trim() || nameUz;
  const category = d.category.trim();
  const description = d.description.trim();
  const price = parsePrice(d.price) ?? Number(item.price);
  if (nameUz !== String(item.nameUz || "")) out.push({ key: "nameUz", label: "Nomi (uz)", from: String(item.nameUz || "—"), to: nameUz, value: nameUz });
  if (nameRu !== String(item.nameRu || "")) out.push({ key: "nameRu", label: "Nomi (ru)", from: String(item.nameRu || "—"), to: nameRu, value: nameRu });
  if (category !== String(item.category || "")) out.push({ key: "category", label: "Kategoriya", from: String(item.category || "—"), to: category || "—", value: category });
  if (price !== Number(item.price)) out.push({ key: "price", label: "Narx", from: money(Number(item.price || 0)), to: money(price), value: price });
  if (description !== String(item.description || "")) out.push({ key: "description", label: "Tavsif", from: item.description ? "matn" : "—", to: description ? "yangi matn" : "—", value: description });
  if (d.requiresPrescription !== Boolean(item.requiresPrescription)) {
    out.push({ key: "requiresPrescription", label: "Retsept", from: rxText(Boolean(item.requiresPrescription)), to: rxText(d.requiresPrescription), value: d.requiresPrescription });
  }
  return out;
}

export function CatalogPage(props: {
  token: string;
  user: AdminUser | null;
  permissions: string[];
  branches: any[];
  onOpenInventory?: () => void;
}) {
  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const canManage = props.permissions.includes("products:manage");
  /** Branch staff see the available axis of their own branch; HQ reads stock in Ombor. */
  const scopeBranchId = !isHq && props.user?.branchId ? Number(props.user.branchId) : null;
  const scopeBranchName = scopeBranchId
    ? String(props.branches.find((b) => Number(b.id) === scopeBranchId)?.name || "o‘z filialingiz")
    : "";
  const tableColumns = scopeBranchId ? 5 : 4;

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [categories, setCategories] = useState<string[] | null>([]);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [mode, setMode] = useState<Mode>("view");
  const [openId, setOpenId] = useState<number | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [drawerNotice, setDrawerNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const listSeq = useRef(0);
  const hasFilters = Boolean(applied.q.trim() || applied.category);
  const drawerOpen = mode === "create" || openId != null;

  async function loadPage(opts?: { offset?: number; filters?: Filters }) {
    const nextOffset = opts?.offset ?? 0;
    const f = opts?.filters ?? filters;
    const qs = new URLSearchParams();
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String(nextOffset));
    if (f.q.trim()) qs.set("q", f.q.trim().slice(0, MAX_QUERY));
    if (f.category) qs.set("category", f.category);
    if (f.sort !== "default") qs.set("sort", f.sort);
    if (scopeBranchId) qs.set("branchId", String(scopeBranchId));

    const seq = ++listSeq.current;
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/catalog/products?${qs}`, props.token);
      if (seq !== listSeq.current) return;
      const list = Array.isArray(data?.products) ? data.products : [];
      const count = Number(data?.pagination?.total ?? data?.total ?? 0);
      if (!list.length && nextOffset > 0 && count > 0) {
        void loadPage({ offset: 0, filters: f });
        return;
      }
      setRows(list);
      setTotal(count);
      setHasMore(Boolean(data?.pagination?.hasMore ?? data?.hasMore));
      setOffset(nextOffset);
      setApplied(f);
      setLoaded(true);
    } catch {
      if (seq !== listSeq.current) return;
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError("Katalogni yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring.");
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }

  async function loadCategories() {
    const data = await softRequest("/api/catalog/categories", props.token);
    setCategories(Array.isArray(data?.categories) ? data.categories.map(String) : null);
  }

  useEffect(() => {
    void loadPage({ offset: 0 });
    void loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  useEffect(() => {
    if (mode !== "view" || openId == null) return;
    const next = rows.find((p) => Number(p.id) === openId);
    if (next) setSelected(next);
  }, [rows, mode, openId]);

  function applyFilter(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void loadPage({ offset: 0, filters: next });
  }

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    void loadPage({ offset: 0 });
  }

  function onSearchChange(value: string) {
    if (!value && applied.q) applyFilter({ q: "" });
    else setFilters({ ...filters, q: value });
  }

  function resetFilters() {
    const next = { ...EMPTY_FILTERS, sort: filters.sort };
    setFilters(next);
    void loadPage({ offset: 0, filters: next });
  }

  function refresh() {
    setNotice(null);
    void loadPage({ offset, filters: applied });
    void loadCategories();
  }

  function openProduct(item: any) {
    setMode("view");
    setOpenId(Number(item.id));
    setSelected(item);
    setFormError("");
    setDrawerNotice(null);
  }

  function startCreate() {
    setMode("create");
    setOpenId(null);
    setSelected(null);
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setDrawerNotice(null);
    setNotice(null);
  }

  function startEdit() {
    if (!selected) return;
    setDraft(draftFrom(selected));
    setMode("edit");
    setFormError("");
    setDrawerNotice(null);
  }

  function cancelEdit() {
    setMode(selected ? "view" : "create");
    setFormError("");
  }

  function closeDrawer() {
    if (busy) return;
    setMode("view");
    setOpenId(null);
    setSelected(null);
    setFormError("");
    setDrawerNotice(null);
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setFormError("");
  }

  function submitForm(e: FormEvent) {
    e.preventDefault();
    const problem = validate(draft, mode);
    if (problem) {
      setFormError(problem);
      return;
    }
    if (mode === "create") {
      setPending({ kind: "create" });
      return;
    }
    if (!selected) return;
    const changes = diffDraft(selected, draft);
    if (!changes.length) {
      setFormError("Hech narsa o‘zgarmadi.");
      return;
    }
    setPending({ kind: "edit", changes });
  }

  async function confirmPending() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      if (pending.kind === "create") {
        const nameUz = draft.nameUz.trim();
        const data = await request("/api/admin/products", props.token, {
          method: "POST",
          body: JSON.stringify({
            sku: draft.sku.trim(),
            nameUz,
            nameRu: draft.nameRu.trim() || nameUz,
            category: draft.category.trim(),
            manufacturer: draft.manufacturer.trim(),
            price: parsePrice(draft.price) ?? 0,
            description: draft.description.trim(),
            requiresPrescription: draft.requiresPrescription,
          }),
        });
        const created = data?.product;
        setPending(null);
        setMode("view");
        if (created?.id != null) {
          setOpenId(Number(created.id));
          setSelected(created);
          setDrawerNotice({ tone: "ok", text: "Mahsulot qo‘shildi." });
        } else {
          setOpenId(null);
          setSelected(null);
          setNotice({ tone: "ok", text: "Mahsulot qo‘shildi." });
        }
        void loadPage({ offset: 0, filters: applied });
        void loadCategories();
      } else if (selected) {
        const payload: Record<string, string | number | boolean> = {};
        for (const c of pending.changes) payload[c.key] = c.value;
        const data = await request(`/api/admin/products/${Number(selected.id)}`, props.token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setPending(null);
        setSelected(data?.product ? { ...selected, ...data.product } : { ...selected, ...payload });
        setMode("view");
        setDrawerNotice({ tone: "ok", text: "O‘zgarishlar saqlandi." });
        void loadPage({ offset, filters: applied });
        if (payload.category !== undefined) void loadCategories();
      }
    } catch (err) {
      setPending(null);
      setFormError(mutationError(err, pending.kind));
      if (statusOf(err) === 404) void loadPage({ offset, filters: applied });
    } finally {
      setBusy(false);
    }
  }

  const initialLoading = loading && !loaded;
  const categoryOptions = categories || [];
  const formMode = mode === "create" || mode === "edit";
  const drawerTitle = mode === "create" ? "Yangi mahsulot" : String(selected?.nameUz || "Mahsulot");

  return (
    <div className="catalog-page page-module">
      <AdminPageHeader
        title="Katalog"
        description={PAGE_DESCRIPTIONS.products}
        meta={canManage ? undefined : <span className="cat-readonly">Faqat ko‘rish — tahrirlash ruxsati yo‘q</span>}
        actions={
          <>
            <button
              className={`btn-secondary cat-refresh${loading ? " is-busy" : ""}`}
              type="button"
              disabled={loading}
              onClick={refresh}
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
              Yangilash
            </button>
            {canManage ? (
              <button className="btn-primary cat-create" type="button" onClick={startCreate}>
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Mahsulot qo‘shish
              </button>
            ) : null}
          </>
        }
      />

      <section className="cat-controls" aria-label="Katalog qidiruvi va filtrlari">
        <form className="cat-search" role="search" onSubmit={applySearch}>
          <FilterField label="Qidiruv" grow>
            <span className="cat-search-box">
              <Search size={15} strokeWidth={2} aria-hidden="true" className="cat-search-icon" />
              <input
                type="search"
                value={filters.q}
                maxLength={MAX_QUERY}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Nomi, SKU yoki ishlab chiqaruvchi"
                enterKeyHint="search"
              />
            </span>
          </FilterField>
          <button className="btn-secondary cat-search-go" type="submit" disabled={initialLoading}>
            Qidirish
          </button>
        </form>
        <FilterField label="Kategoriya">
          <select
            value={filters.category}
            disabled={categories === null}
            title={categories === null ? "Kategoriyalar ro‘yxati yuklanmadi" : undefined}
            onChange={(e) => applyFilter({ category: e.target.value })}
          >
            <option value="">Barcha kategoriyalar</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Saralash">
          <select value={filters.sort} onChange={(e) => applyFilter({ sort: e.target.value as Sort })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </FilterField>
      </section>

      <div className="cat-summary" aria-live="polite">
        <span className="cat-result-count">
          {initialLoading ? "Yuklanmoqda…" : error ? "—" : `${total} ta mahsulot`}
        </span>
        {!error && !hasFilters && categories && categories.length ? (
          <span className="cat-summary-hint">{categories.length} ta kategoriya</span>
        ) : null}
        {scopeBranchId ? (
          <span className="cat-summary-hint">Qoldiq: {scopeBranchName}</span>
        ) : null}
        {hasFilters ? (
          <>
            <span className="cat-summary-hint">Filtr qo‘llangan</span>
            <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
              Tozalash
            </button>
          </>
        ) : null}
        <span className="cat-summary-note">Qidiruv va filtr serverda · sahifada {PAGE_SIZE} tadan</span>
      </div>

      {notice ? <FeedbackBanner tone={notice.tone}>{notice.text}</FeedbackBanner> : null}

      {error ? (
        <ErrorState message={error} onRetry={() => void loadPage({ offset, filters: applied })} />
      ) : (
        <div
          className={`cat-surface surface-table${loading && rows.length ? " is-refreshing" : ""}${!loading && !rows.length ? " is-empty" : ""}`}
          aria-busy={loading}
        >
          <DataTable sticky>
            <thead>
              <tr>
                <th>Mahsulot</th>
                <th>Kategoriya</th>
                <th className="num">Narx</th>
                <th>Retsept</th>
                {scopeBranchId ? (
                  <th className="num" title={`${stockAxisLabel("available")} — ${scopeBranchName}`}>Filialda</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="cat-skeleton-row" aria-hidden="true">
                    {Array.from({ length: tableColumns }).map((__, c) => (
                      <td key={c} className={c === 2 || c === 4 ? "num" : undefined}>
                        <span className="cat-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr className="cat-empty-row">
                  <td colSpan={tableColumns}>
                    <div className="cat-empty" role="status">
                      <div className="empty-title">
                        {hasFilters ? "Tanlangan shartlar bo‘yicha mahsulot topilmadi." : "Mahsulotlar topilmadi."}
                      </div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Qidiruv so‘zini yoki kategoriyani o‘zgartiring."
                          : canManage
                            ? "Katalogda hali mahsulot yo‘q. Birinchisini «Mahsulot qo‘shish» orqali kiriting."
                            : "Katalogda hali mahsulot yo‘q."}
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
                rows.map((item) => {
                  const active = openId === Number(item.id) && mode !== "create";
                  const rx = Boolean(item.requiresPrescription);
                  const name = String(item.nameUz || "—");
                  const available = Number(item.availableQuantity ?? 0);
                  return (
                    <tr
                      key={item.id}
                      className={`cat-row${active ? " is-active" : ""}`}
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
                      <td className="cat-cell-product">
                        <div className="cat-product">
                          <span className="cat-mark" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                          <span className="cat-identity">
                            <span className="cat-name">{name}</span>
                            <span className="cat-sub">
                              <span className="cat-sku">{item.sku || "—"}</span>
                              {item.manufacturer ? <span> · {item.manufacturer}</span> : null}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="cat-cell-category">{item.category || "—"}</td>
                      <td className="num cat-cell-price">
                        <span className="cat-price">{money(Number(item.price || 0))}</span>
                        {item.unit ? <span className="cat-unit"> / {item.unit}</span> : null}
                      </td>
                      <td className="cat-cell-rx">
                        {rx ? <StatusBadge tone="warn">Retsept</StatusBadge> : <span className="cat-muted">Retseptsiz</span>}
                      </td>
                      {scopeBranchId ? (
                        <td className={`num cat-cell-stock${available > 0 ? "" : " is-zero"}`} data-label="Filialda">
                          {available}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          {rows.length > 0 ? (
            <PaginationBar
              offset={offset}
              limit={PAGE_SIZE}
              total={total}
              hasMore={hasMore}
              loading={loading}
              onPrev={() => void loadPage({ offset: Math.max(0, offset - PAGE_SIZE), filters: applied })}
              onNext={() => void loadPage({ offset: offset + PAGE_SIZE, filters: applied })}
            />
          ) : null}
        </div>
      )}

      <DetailDrawer
        open={drawerOpen}
        width="lg"
        title={drawerTitle}
        subtitle={mode !== "create" && selected ? `SKU ${selected.sku || "—"}` : undefined}
        status={
          mode !== "create" && selected?.requiresPrescription ? (
            <StatusBadge tone="warn">Retsept talab qilinadi</StatusBadge>
          ) : undefined
        }
        onClose={closeDrawer}
        footer={
          formMode ? (
            <div className="cat-drawer-actions">
              <button className="btn-primary" type="submit" form="cat-form" disabled={busy}>
                {mode === "create" ? "Qo‘shish" : "Saqlash"}
              </button>
              <button
                className="btn-tertiary"
                type="button"
                disabled={busy}
                onClick={mode === "create" ? closeDrawer : cancelEdit}
              >
                Bekor qilish
              </button>
            </div>
          ) : canManage && selected ? (
            <div className="cat-drawer-actions">
              <button className="btn-secondary" type="button" onClick={startEdit}>
                Tahrirlash
              </button>
            </div>
          ) : undefined
        }
      >
        {drawerNotice && mode === "view" ? (
          <FeedbackBanner tone={drawerNotice.tone}>{drawerNotice.text}</FeedbackBanner>
        ) : null}

        {formMode ? (
          <form id="cat-form" className="cat-form" onSubmit={submitForm} noValidate>
            {mode === "create" ? (
              <FeedbackBanner tone="warn">
                Server yangi mahsulotni barcha filiallarga boshlang‘ich 10 dona fizik qoldiq bilan qo‘shadi.
                Bu ombor harakati sifatida yozilmaydi — qo‘shgandan so‘ng qoldiqni Ombor bo‘limida tekshiring.
              </FeedbackBanner>
            ) : null}
            <DrawerSection title="Asosiy ma’lumotlar">
              <div className="cat-form-grid">
                {mode === "create" ? (
                  <label className="filter-field">
                    <span className="filter-label">SKU *</span>
                    <input value={draft.sku} onChange={(e) => setField("sku", e.target.value)} required autoComplete="off" />
                  </label>
                ) : null}
                <label className="filter-field">
                  <span className="filter-label">Nomi (uz) *</span>
                  <input value={draft.nameUz} onChange={(e) => setField("nameUz", e.target.value)} required />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Nomi (ru)</span>
                  <input
                    value={draft.nameRu}
                    onChange={(e) => setField("nameRu", e.target.value)}
                    placeholder="Bo‘sh qolsa — uzbekcha nom"
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Kategoriya</span>
                  <input
                    value={draft.category}
                    list="cat-category-list"
                    onChange={(e) => setField("category", e.target.value)}
                    placeholder={mode === "create" ? "Bo‘sh qolsa — «Boshqa»" : undefined}
                  />
                </label>
                {mode === "create" ? (
                  <label className="filter-field">
                    <span className="filter-label">Ishlab chiqaruvchi</span>
                    <input
                      value={draft.manufacturer}
                      onChange={(e) => setField("manufacturer", e.target.value)}
                      placeholder="Bo‘sh qolsa — «Vaksina Med»"
                    />
                  </label>
                ) : null}
                <label className="filter-field">
                  <span className="filter-label">Narx (so‘m) *</span>
                  <input
                    value={draft.price}
                    onChange={(e) => setField("price", e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                  />
                </label>
                <label className="filter-field cat-form-full">
                  <span className="filter-label">Tavsif</span>
                  <textarea value={draft.description} onChange={(e) => setField("description", e.target.value)} rows={3} />
                </label>
                <label className="cat-check cat-form-full">
                  <input
                    type="checkbox"
                    checked={draft.requiresPrescription}
                    onChange={(e) => setField("requiresPrescription", e.target.checked)}
                  />
                  <span>Retsept talab qiladi</span>
                </label>
              </div>
              <datalist id="cat-category-list">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="cat-note">
                {mode === "create"
                  ? "Narx butun so‘mda saqlanadi. Qoldiq Katalogda kiritilmaydi."
                  : "SKU, ishlab chiqaruvchi va o‘lchov birligi mavjud API orqali o‘zgartirilmaydi. Qoldiq — Ombor bo‘limida."}
              </p>
              {formError ? <FeedbackBanner tone="danger">{formError}</FeedbackBanner> : null}
            </DrawerSection>
          </form>
        ) : null}

        {mode === "view" && selected ? (
          <>
            <DrawerSection title="Mahsulot">
              <dl className="cat-kv">
                <div>
                  <dt>Nomi (uz)</dt>
                  <dd className="cat-kv-strong">{selected.nameUz || "—"}</dd>
                </div>
                <div>
                  <dt>Nomi (ru)</dt>
                  <dd>{selected.nameRu || "—"}</dd>
                </div>
                <div>
                  <dt>SKU</dt>
                  <dd className="cat-kv-mono">{selected.sku || "—"}</dd>
                </div>
                {selected.manufacturer ? (
                  <div>
                    <dt>Ishlab chiqaruvchi</dt>
                    <dd>{selected.manufacturer}</dd>
                  </div>
                ) : null}
                {selected.unit ? (
                  <div>
                    <dt>O‘lchov birligi</dt>
                    <dd>{selected.unit}</dd>
                  </div>
                ) : null}
                {selected.description ? (
                  <div className="cat-kv-block">
                    <dt>Tavsif</dt>
                    <dd>{selected.description}</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Narx va tasnif">
              <dl className="cat-kv">
                <div>
                  <dt>Narx</dt>
                  <dd>
                    <span className="cat-kv-price">{money(Number(selected.price || 0))}</span>
                    {selected.unit ? <span className="cat-unit"> / {selected.unit}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt>Kategoriya</dt>
                  <dd>{selected.category || "—"}</dd>
                </div>
                <div>
                  <dt>Retsept</dt>
                  <dd>{rxText(Boolean(selected.requiresPrescription))}</dd>
                </div>
                {selected.analogGroup ? (
                  <div>
                    <dt>Analog guruhi</dt>
                    <dd className="cat-kv-mono">{selected.analogGroup}</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Ombor">
              {scopeBranchId ? (
                <dl className="cat-kv">
                  <div>
                    <dt>{stockAxisLabel("available")}</dt>
                    <dd className="cat-kv-strong">
                      {selected.availableQuantity != null ? Number(selected.availableQuantity) : "—"}
                      <span className="cat-unit"> · {scopeBranchName}</span>
                    </dd>
                  </div>
                </dl>
              ) : null}
              <p className="cat-note">
                {scopeBranchId
                  ? "Fizik qoldiq, rezerv va korreksiya Ombor bo‘limida. Katalog qoldiqni o‘zgartirmaydi."
                  : "Qoldiq filial kesimida Ombor bo‘limida ko‘riladi. Katalog qoldiqni ko‘rsatmaydi va o‘zgartirmaydi."}
              </p>
              {props.onOpenInventory ? (
                <button className="btn-tertiary cat-inventory-link" type="button" onClick={props.onOpenInventory}>
                  Ombor holatini ko‘rish →
                </button>
              ) : null}
            </DrawerSection>

            <details className="cat-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="cat-kv cat-kv-tech">
                <div>
                  <dt>Mahsulot ID</dt>
                  <dd className="cat-kv-mono">{selected.id}</dd>
                </div>
                <div>
                  <dt>Yaratilgan</dt>
                  <dd>{selected.createdAt ? fmtDate(selected.createdAt) : "—"}</dd>
                </div>
                {selected.icon ? (
                  <div>
                    <dt>Ilova ikonka kodi</dt>
                    <dd className="cat-kv-mono">{selected.icon}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={pending?.kind === "create"}
        title="Mahsulotni qo‘shish"
        confirmLabel="Qo‘shish"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
        description={
          <div className="cat-confirm">
            <dl className="cat-kv">
              <div>
                <dt>SKU</dt>
                <dd className="cat-kv-mono">{draft.sku.trim()}</dd>
              </div>
              <div>
                <dt>Nomi</dt>
                <dd>{draft.nameUz.trim()}</dd>
              </div>
              <div>
                <dt>Narx</dt>
                <dd className="cat-kv-strong">{money(parsePrice(draft.price) ?? 0)}</dd>
              </div>
              <div>
                <dt>Kategoriya</dt>
                <dd>{draft.category.trim() || "Boshqa"}</dd>
              </div>
              <div>
                <dt>Retsept</dt>
                <dd>{rxText(draft.requiresPrescription)}</dd>
              </div>
            </dl>
            <p className="cat-note">
              Server barcha filiallarga boshlang‘ich 10 dona fizik qoldiq yozadi. Keyin qoldiqni Ombor bo‘limida tekshiring.
            </p>
          </div>
        }
      />

      <ConfirmDialog
        open={pending?.kind === "edit"}
        title="O‘zgarishlarni saqlash"
        confirmLabel="Saqlash"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
        description={
          pending?.kind === "edit" ? (
            <div className="cat-confirm">
              <p className="cat-note">{selected?.nameUz} · SKU {selected?.sku}</p>
              <dl className="cat-kv">
                {pending.changes.map((c) => (
                  <div key={c.key}>
                    <dt>{c.label}</dt>
                    <dd>
                      <span className="cat-from">{c.from}</span> → <strong>{c.to}</strong>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null
        }
      />
    </div>
  );
}
