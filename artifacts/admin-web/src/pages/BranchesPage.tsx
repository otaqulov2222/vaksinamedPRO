import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Pencil, Plus, RefreshCw, Search, Store, Trash2 } from "lucide-react";
import { request, isHqRole, type AdminUser, type ApiError } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterBar,
  FilterField,
  MetricStrip,
  DataTable,
  DetailDrawer,
  DrawerSection,
  FeedbackBanner,
  ConfirmDialog,
  ErrorState,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Server masks stored merchant secrets with this value; it must never be sent back. */
const MASK = "••••";
const BASE_COLUMNS = 5;
/** Server-authored validation / conflict texts (safe to show); anything else maps to fixed copy. */
const CURATED_CODES = new Set(["BRANCH_INVALID", "BRANCH_CODE_TAKEN", "BRANCH_IN_USE"]);
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,24}$/;

type LoadError = { kind: "forbidden" | "session" | "failed"; message: string };

function statusOf(err: unknown) {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
}

function curatedText(err: unknown): string | null {
  const e = err as ApiError | null;
  return e && e.code && CURATED_CODES.has(e.code) ? e.message : null;
}

function listError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Bu bo‘limni ko‘rish uchun ruxsat yo‘q." };
  return { kind: "failed", message: "Filiallarni yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring." };
}

function saveError(err: unknown): string {
  const curated = curatedText(err);
  if (curated) return curated;
  const status = statusOf(err);
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Bu amal uchun ruxsat yo‘q yoki filial doirangizdan tashqarida.";
  if (status === 404) return "Filial topilmadi. Ro‘yxat yangilandi.";
  return "O‘zgarishlar saqlanmadi. Qayta urinib ko‘ring.";
}

type TextKey =
  | "code" | "name" | "region" | "city" | "district" | "address" | "phone" | "hours"
  | "paymeMerchantId" | "clickMerchantId" | "clickServiceId";

type FormState = Record<TextKey, string> & {
  lat: string;
  lng: string;
  isOpen: boolean;
  is24h: boolean;
  paymeKey: string;
  clickSecret: string;
};

type Editor = { mode: "create" } | { mode: "edit"; id: number };

const TEXT_FIELDS: { key: TextKey; label: string }[] = [
  { key: "code", label: "Kod" },
  { key: "name", label: "Nomi" },
  { key: "region", label: "Hudud" },
  { key: "city", label: "Shahar" },
  { key: "district", label: "Tuman" },
  { key: "address", label: "Manzil" },
  { key: "phone", label: "Telefon" },
  { key: "hours", label: "Ish vaqti" },
  { key: "paymeMerchantId", label: "Payme merchant ID" },
  { key: "clickMerchantId", label: "Click merchant ID" },
  { key: "clickServiceId", label: "Click service ID" },
];

function emptyForm(): FormState {
  return {
    code: "", name: "", region: "", city: "", district: "", address: "", phone: "", hours: "",
    paymeMerchantId: "", clickMerchantId: "", clickServiceId: "",
    lat: "", lng: "", isOpen: true, is24h: false, paymeKey: "", clickSecret: "",
  };
}

function toForm(branch: any): FormState {
  const form = emptyForm();
  for (const f of TEXT_FIELDS) form[f.key] = String(branch?.[f.key] ?? "");
  form.lat = branch?.lat != null ? String(branch.lat) : "";
  form.lng = branch?.lng != null ? String(branch.lng) : "";
  form.isOpen = Boolean(branch?.isOpen);
  form.is24h = Boolean(branch?.is24h);
  // Never seed from branch.paymeKey / branch.clickSecret (API returns MASK)
  form.paymeKey = "";
  form.clickSecret = "";
  return form;
}

/** Mirrors server validation so most mistakes are caught before a request. */
function validateForm(form: FormState): string | null {
  if (!form.code.trim()) return "Kod majburiy.";
  if (!CODE_PATTERN.test(form.code.trim())) return "Kod faqat lotin harf, raqam, - va _ dan iborat bo‘lsin (2–32 belgi).";
  if (!form.name.trim()) return "Nomi majburiy.";
  if (!form.region.trim()) return "Hudud majburiy.";
  if (!form.address.trim()) return "Manzil majburiy.";
  if (!form.phone.trim()) return "Telefon majburiy.";
  if (!PHONE_PATTERN.test(form.phone.trim())) return "Telefon raqami noto‘g‘ri (masalan, +998 71 123-45-67).";
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (form.lat.trim() === "" || !Number.isFinite(lat) || Math.abs(lat) > 90) return "Kenglik −90…90 oralig‘idagi son bo‘lsin.";
  if (form.lng.trim() === "" || !Number.isFinite(lng) || Math.abs(lng) > 180) return "Uzunlik −180…180 oralig‘idagi son bo‘lsin.";
  return null;
}

function secretChanges(form: FormState, body: Record<string, unknown>, labels: string[]) {
  const paymeKey = form.paymeKey.trim();
  if (paymeKey && paymeKey !== MASK) {
    body.paymeKey = paymeKey;
    labels.push("Payme kaliti almashtiriladi");
  }
  const clickSecret = form.clickSecret.trim();
  if (clickSecret && clickSecret !== MASK) {
    body.clickSecret = clickSecret;
    labels.push("Click kaliti almashtiriladi");
  }
}

/** Create: full body. Edit: changed fields only; unchanged fields are not re-sent. */
function buildRequest(form: FormState, current: any | null) {
  const body: Record<string, unknown> = {};
  const labels: string[] = [];
  for (const f of TEXT_FIELDS) {
    const next = form[f.key].trim();
    if (!current || next !== String(current?.[f.key] ?? "")) {
      if (current || next) body[f.key] = next;
      if (current) labels.push(f.label);
    }
  }
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (!current || lat !== Number(current.lat) || lng !== Number(current.lng)) {
    body.lat = lat;
    body.lng = lng;
    if (current) labels.push("Koordinata");
  }
  if (!current || form.is24h !== Boolean(current.is24h)) {
    body.is24h = form.is24h;
    if (current) labels.push(`Ish rejimi → ${form.is24h ? "24/7" : "Belgilangan vaqt"}`);
  }
  const openChanged = current ? form.isOpen !== Boolean(current.isOpen) : false;
  if (!current || openChanged) {
    body.isOpen = form.isOpen;
    if (current) labels.push(`Holat → ${form.isOpen ? "Ochiq" : "Yopiq"}`);
  }
  secretChanges(form, body, labels);
  return { body, labels, openChanged };
}

function placeLine(branch: any): string {
  const region = String(branch.region || "").trim();
  const district = String(branch.district || "").trim();
  const parts = [region, district && district !== region && district !== branch.city ? district : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function telHref(phone: unknown) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : undefined;
}

function hasCoords(branch: any) {
  return Number.isFinite(Number(branch?.lat)) && Number.isFinite(Number(branch?.lng));
}

function mapHref(branch: any) {
  return `https://www.google.com/maps/search/?api=1&query=${Number(branch.lat)},${Number(branch.lng)}`;
}

export function BranchesPage(props: {
  token: string;
  user: AdminUser | null;
  permissions: string[];
  onOpenInventory?: () => void;
  onBranchesChanged?: () => void;
}) {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const listSeq = useRef(0);

  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [drawerMsg, setDrawerMsg] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const canManage = props.permissions.includes("branches:manage");
  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const canCreateDelete = canManage && isHq;
  const ownBranchOnly = canManage && !isHq;
  const hasFilters = Boolean(appliedQuery || statusFilter || regionFilter || modeFilter);
  const columns = BASE_COLUMNS + (canManage ? 1 : 0);

  async function load() {
    const seq = ++listSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await request("/api/admin/branches", props.token);
      if (seq !== listSeq.current) return;
      setBranches(Array.isArray(data?.branches) ? data.branches : []);
      setLoaded(true);
    } catch (err) {
      if (seq !== listSeq.current) return;
      setBranches([]);
      setError(listError(err));
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const selected = selectedId != null ? branches.find((b) => Number(b.id) === selectedId) || null : null;
  const creating = editor?.mode === "create";
  const editing = editor?.mode === "edit" && selected ? selected : null;

  useEffect(() => {
    if (selectedId != null && loaded && !loading && !error && !selected) {
      setSelectedId(null);
      setEditor(null);
      setNotice({ tone: "warn", text: "Tanlangan filial ro‘yxatda topilmadi." });
    }
  }, [selectedId, loaded, loading, error, selected]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const b of branches) {
      const r = String(b.region || "").trim();
      if (r) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [branches]);

  const counts = useMemo(() => {
    let open = 0;
    let h24 = 0;
    for (const b of branches) {
      if (b.isOpen) open += 1;
      if (b.is24h) h24 += 1;
    }
    return { total: branches.length, open, closed: branches.length - open, h24 };
  }, [branches]);

  const filtered = useMemo(() => {
    const q = appliedQuery.toLowerCase();
    return branches.filter((item) => {
      if (statusFilter === "open" && !item.isOpen) return false;
      if (statusFilter === "closed" && item.isOpen) return false;
      if (modeFilter === "24h" && !item.is24h) return false;
      if (modeFilter === "hours" && item.is24h) return false;
      if (regionFilter && String(item.region || "") !== regionFilter) return false;
      if (!q) return true;
      return [item.name, item.code, item.region, item.city, item.district, item.address, item.phone]
        .map((v) => String(v || ""))
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [branches, appliedQuery, statusFilter, regionFilter, modeFilter]);

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    setAppliedQuery(query.trim());
  }

  function resetFilters() {
    setQuery("");
    setAppliedQuery("");
    setStatusFilter("");
    setRegionFilter("");
    setModeFilter("");
  }

  function openBranch(branch: any) {
    setSelectedId(Number(branch.id));
    setEditor(null);
    setFormMsg("");
    setDrawerMsg("");
    setNotice(null);
  }

  function closeDrawer() {
    setSelectedId(null);
    setEditor(null);
    setFormMsg("");
    setDrawerMsg("");
    setConfirmSave(false);
  }

  function rowKeys(branch: any) {
    return (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openBranch(branch);
      }
    };
  }

  function startCreate() {
    if (!canCreateDelete) return;
    setSelectedId(null);
    setForm(emptyForm());
    setEditor({ mode: "create" });
    setFormMsg("");
    setDrawerMsg("");
    setNotice(null);
  }

  function startEdit(branch: any, preset?: Partial<FormState>) {
    if (!branch || !canManage) return;
    setSelectedId(Number(branch.id));
    setForm({ ...toForm(branch), ...preset });
    setEditor({ mode: "edit", id: Number(branch.id) });
    setFormMsg("");
    setDrawerMsg("");
    setNotice(null);
  }

  function cancelEditor() {
    if (creating) {
      closeDrawer();
      return;
    }
    setEditor(null);
    setFormMsg("");
  }

  function rowAction(fn: () => void) {
    return (e: MouseEvent) => {
      e.stopPropagation();
      fn();
    };
  }

  const pending = creating ? buildRequest(form, null) : editing ? buildRequest(form, editing) : null;

  function onSaveForm(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    const invalid = validateForm(form);
    if (invalid) {
      setFormMsg(invalid);
      return;
    }
    if (editing && !pending.labels.length) {
      setFormMsg("O‘zgarish yo‘q.");
      return;
    }
    setFormMsg("");
    setConfirmSave(true);
  }

  async function saveConfirmed() {
    if (!pending || saving || !editor) return;
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const data = await request("/api/admin/branches", props.token, {
          method: "POST",
          body: JSON.stringify(pending.body),
        });
        setConfirmSave(false);
        setEditor(null);
        setNotice({ tone: "ok", text: "Filial yaratildi." });
        await load();
        if (data?.branch?.id) setSelectedId(Number(data.branch.id));
      } else {
        await request(`/api/admin/branches/${editor.id}`, props.token, {
          method: "PATCH",
          body: JSON.stringify(pending.body),
        });
        setConfirmSave(false);
        setEditor(null);
        setNotice({ tone: "ok", text: "Filial yangilandi." });
        await load();
      }
      props.onBranchesChanged?.();
    } catch (err) {
      setConfirmSave(false);
      setFormMsg(saveError(err));
      if (statusOf(err) === 404) void load();
    } finally {
      setSaving(false);
    }
  }

  function askDelete(branch: any) {
    if (!canCreateDelete || !branch) return;
    setDrawerMsg("");
    setDeleteTarget(branch);
  }

  async function deleteConfirmed() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await request(`/api/admin/branches/${target.id}`, props.token, { method: "DELETE" });
      setDeleteTarget(null);
      if (selectedId === Number(target.id)) closeDrawer();
      setNotice({ tone: "ok", text: `«${target.name}» filiali o‘chirildi.` });
      await load();
      props.onBranchesChanged?.();
    } catch (err) {
      setDeleteTarget(null);
      const text = saveError(err);
      if (selectedId === Number(target.id)) setDrawerMsg(text);
      else setNotice({ tone: "warn", text });
      if (statusOf(err) === 404) void load();
    } finally {
      setDeleting(false);
    }
  }

  const initialLoading = loading && !loaded;
  const kpi = (n: number) => (loaded && !error ? n : "—");
  const drawerOpen = creating || Boolean(selected);

  return (
    <div className="branches-page page-module">
      <AdminPageHeader
        title="Filiallar"
        description={PAGE_DESCRIPTIONS.branches}
        meta={
          <span className="bs-mode">
            {canCreateDelete
              ? "Qo‘shish, tahrirlash va o‘chirish mumkin"
              : ownBranchOnly
                ? "Faqat o‘z filialingizni tahrirlash mumkin"
                : "Faqat ko‘rish — tahrirlash uchun ruxsat yo‘q"}
          </span>
        }
        actions={
          <>
            <button
              className={`btn-secondary bs-refresh${loading ? " is-busy" : ""}`}
              type="button"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
              Yangilash
            </button>
            {canCreateDelete ? (
              <button className="btn-primary bs-create" type="button" onClick={startCreate} disabled={initialLoading}>
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Yangi filial
              </button>
            ) : null}
          </>
        }
      />

      <section className="bs-overview" aria-label="Filiallar tarmog‘i holati">
        <MetricStrip
          className="bs-metrics"
          items={[
            { hero: true, label: "Jami filiallar", value: kpi(counts.total), hint: "Serverdagi to‘liq ro‘yxat" },
            { label: "Ochiq", value: kpi(counts.open), hint: "Buyurtma qabul qiladi" },
            { label: "Yopiq", value: kpi(counts.closed), hint: "Ilovada tanlanmaydi" },
            { label: "24/7", value: kpi(counts.h24), hint: "Kechayu kunduz" },
            { label: "Hududlar", value: kpi(regions.length), hint: "Viloyat / shahar" },
          ]}
        />
      </section>

      {notice ? <FeedbackBanner tone={notice.tone}>{notice.text}</FeedbackBanner> : null}

      <section className="bs-list" aria-label="Filiallar ro‘yxati">
        <FilterBar
          meta={
            <span className="bs-controls-note">
              Admin API barcha filiallarni bir so‘rovda qaytaradi — qidiruv va filtrlar shu yuklangan ro‘yxat bo‘yicha ishlaydi. Sahifalash yo‘q.
            </span>
          }
        >
          <form className="bs-search" role="search" onSubmit={applySearch}>
            <FilterField label="Qidiruv" grow>
              <span className="bs-search-box">
                <Search size={15} strokeWidth={2} aria-hidden="true" className="bs-search-icon" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nomi, kod, hudud, manzil yoki telefon"
                  enterKeyHint="search"
                  maxLength={80}
                />
              </span>
            </FilterField>
            <button className="btn-secondary bs-search-go" type="submit" disabled={initialLoading}>
              Qidirish
            </button>
          </form>
          <FilterField label="Holat">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Barchasi</option>
              <option value="open">Ochiq</option>
              <option value="closed">Yopiq</option>
            </select>
          </FilterField>
          <FilterField label="Hudud">
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} disabled={!regions.length}>
              <option value="">Barchasi</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Ish rejimi">
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
              <option value="">Barchasi</option>
              <option value="24h">24/7</option>
              <option value="hours">Belgilangan vaqt</option>
            </select>
          </FilterField>
          {hasFilters ? (
            <button className="btn-tertiary bs-clear" type="button" onClick={resetFilters}>
              Tozalash
            </button>
          ) : null}
        </FilterBar>

        <div className="bs-summary" aria-live="polite">
          <span className="bs-result-count">
            {initialLoading
              ? "Yuklanmoqda…"
              : error
                ? "—"
                : hasFilters
                  ? `${filtered.length} ta filial topildi · jami ${branches.length}`
                  : `${branches.length} ta filial`}
          </span>
          {appliedQuery && !error ? <span className="bs-summary-hint">«{appliedQuery}» bo‘yicha</span> : null}
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={error.kind === "failed" ? () => void load() : undefined} />
        ) : (
          <div
            className={`bs-surface surface-table${loading && loaded ? " is-refreshing" : ""}${loaded && !filtered.length ? " is-empty" : ""}${canManage ? " has-actions" : ""}`}
            aria-busy={loading}
          >
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Filial</th>
                  <th>Holat</th>
                  <th>Manzil</th>
                  <th className="bs-col-hours">Ish vaqti</th>
                  <th className="bs-col-phone">Aloqa</th>
                  {canManage ? <th className="bs-col-actions"><span className="sr-only">Amallar</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {initialLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="bs-skeleton-row" aria-hidden="true">
                      {Array.from({ length: columns }).map((__, c) => (
                        <td key={c} className={c === 3 ? "bs-col-hours" : c === 4 ? "bs-col-phone" : c === 5 ? "bs-col-actions" : undefined}>
                          <span className="bs-skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr className="bs-empty-row">
                    <td colSpan={columns}>
                      <div className="bs-empty" role="status">
                        <div className="empty-title">
                          {branches.length ? "Tanlangan shartlar bo‘yicha filial topilmadi." : "Filiallar mavjud emas."}
                        </div>
                        <p className="empty-desc">
                          {branches.length
                            ? "Qidiruv so‘zini yoki filtrlarni o‘zgartiring."
                            : canCreateDelete
                              ? "Birinchi filialni «Yangi filial» tugmasi orqali qo‘shing."
                              : "Server filiallar ro‘yxatini bo‘sh qaytardi."}
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
                    const active = selectedId === Number(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`bs-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        aria-label={`${item.name} — filial tafsiloti`}
                        onClick={() => openBranch(item)}
                        onKeyDown={rowKeys(item)}
                      >
                        <td className="bs-cell-main">
                          <div className="bs-main">
                            <span className="bs-mark" aria-hidden="true"><Store size={15} strokeWidth={1.9} /></span>
                            <span className="bs-ident">
                              <span className="bs-name">{item.name}</span>
                              <span className="bs-code">{item.code || `#${item.id}`}</span>
                            </span>
                          </div>
                        </td>
                        <td className="bs-cell-status">
                          <StatusBadge tone={item.isOpen ? "ok" : "warn"}>{item.isOpen ? "Ochiq" : "Yopiq"}</StatusBadge>
                          {item.is24h ? <span className="bs-chip">24/7</span> : null}
                        </td>
                        <td className="bs-cell-place">
                          <span className="bs-place">{placeLine(item)}</span>
                          <span className="bs-address">{item.address || "—"}</span>
                        </td>
                        <td className="bs-cell-hours bs-col-hours">{item.hours || "—"}</td>
                        <td className="bs-cell-phone bs-col-phone">{item.phone || "—"}</td>
                        {canManage ? (
                          <td className="bs-cell-actions bs-col-actions">
                            <div className="bs-row-actions">
                              <button
                                type="button"
                                className="btn-secondary btn-icon bs-act"
                                aria-label={`${item.name} — tahrirlash`}
                                title="Tahrirlash"
                                onClick={rowAction(() => startEdit(item))}
                              >
                                <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                              </button>
                              {canCreateDelete ? (
                                <button
                                  type="button"
                                  className="btn-secondary btn-icon bs-act bs-act-danger"
                                  aria-label={`${item.name} — o‘chirish`}
                                  title="O‘chirish"
                                  onClick={rowAction(() => askDelete(item))}
                                >
                                  <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>
        )}
      </section>

      <DetailDrawer
        open={drawerOpen}
        width="lg"
        title={creating ? "Yangi filial" : selected?.name || "Filial"}
        subtitle={creating ? "Barcha majburiy maydonlarni to‘ldiring" : selected?.code || undefined}
        status={
          selected && !creating ? (
            <div className="bs-drawer-status">
              <StatusBadge tone={selected.isOpen ? "ok" : "warn"}>{selected.isOpen ? "Ochiq" : "Yopiq"}</StatusBadge>
              {selected.is24h ? <span className="bs-chip">24/7</span> : null}
            </div>
          ) : undefined
        }
        onClose={closeDrawer}
        footer={
          canManage && selected && !editor ? (
            <div className="bs-drawer-actions">
              <button className="btn-primary" type="button" onClick={() => startEdit(selected)}>
                <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                Tahrirlash
              </button>
              {canCreateDelete ? (
                <button className="btn-secondary bs-delete" type="button" onClick={() => askDelete(selected)}>
                  <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                  O‘chirish
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected && !editor ? (
          <>
            {drawerMsg ? (
              <div className="bs-drawer-alert">
                <FeedbackBanner tone="warn">{drawerMsg}</FeedbackBanner>
                {canManage && selected.isOpen ? (
                  <button className="btn-secondary" type="button" onClick={() => startEdit(selected, { isOpen: false })}>
                    Filialni yopish
                  </button>
                ) : null}
              </div>
            ) : null}
            <DrawerSection title="Filial">
              <dl className="bs-kv">
                <div><dt>Nomi</dt><dd className="bs-kv-strong">{selected.name}</dd></div>
                <div><dt>Kod</dt><dd className="bs-kv-mono">{selected.code || "—"}</dd></div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Holat">
              <dl className="bs-kv">
                <div>
                  <dt>Holat</dt>
                  <dd><StatusBadge tone={selected.isOpen ? "ok" : "warn"}>{selected.isOpen ? "Ochiq" : "Yopiq"}</StatusBadge></dd>
                </div>
                <div><dt>Ish rejimi</dt><dd>{selected.is24h ? "24/7" : "Belgilangan vaqt"}</dd></div>
              </dl>
              <p className="bs-note">Yopiq filialni ilovada savatga tanlab bo‘lmaydi va unda yangi buyurtma yaratilmaydi.</p>
            </DrawerSection>
            <DrawerSection title="Manzil">
              <dl className="bs-kv">
                <div><dt>Hudud</dt><dd>{selected.region || "—"}</dd></div>
                {selected.city && selected.city !== selected.region ? (
                  <div><dt>Shahar</dt><dd>{selected.city}</dd></div>
                ) : null}
                {selected.district && selected.district !== selected.region && selected.district !== selected.city ? (
                  <div><dt>Tuman</dt><dd>{selected.district}</dd></div>
                ) : null}
                <div><dt>Manzil</dt><dd>{selected.address || "—"}</dd></div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Ish vaqti">
              <dl className="bs-kv">
                <div><dt>Ish vaqti</dt><dd>{selected.hours || "—"}</dd></div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Aloqa">
              <dl className="bs-kv">
                <div>
                  <dt>Telefon</dt>
                  <dd>
                    {selected.phone && telHref(selected.phone) ? (
                      <a className="bs-link" href={telHref(selected.phone)}>{selected.phone}</a>
                    ) : (
                      selected.phone || "—"
                    )}
                  </dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Koordinata">
              {hasCoords(selected) ? (
                <dl className="bs-kv">
                  <div>
                    <dt>Kenglik / uzunlik</dt>
                    <dd className="bs-kv-mono">{Number(selected.lat).toFixed(5)}, {Number(selected.lng).toFixed(5)}</dd>
                  </div>
                  <div>
                    <dt>Xarita</dt>
                    <dd>
                      <a className="bs-link" href={mapHref(selected)} target="_blank" rel="noopener noreferrer">
                        Xaritada ochish
                        <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                        <span className="sr-only"> (yangi oynada)</span>
                      </a>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="bs-note">Koordinata mavjud emas.</p>
              )}
            </DrawerSection>
            <DrawerSection title="Onlayn to‘lov">
              <dl className="bs-kv">
                <div>
                  <dt>Payme</dt>
                  <dd><StatusBadge tone={selected.hasPayme ? "ok" : "neutral"}>{selected.hasPayme ? "Sozlangan" : "Sozlanmagan"}</StatusBadge></dd>
                </div>
                <div>
                  <dt>Click</dt>
                  <dd><StatusBadge tone={selected.hasClick ? "ok" : "neutral"}>{selected.hasClick ? "Sozlangan" : "Sozlanmagan"}</StatusBadge></dd>
                </div>
              </dl>
              <p className="bs-note">Maxfiy kalitlar hech qachon ko‘rsatilmaydi ({MASK}).</p>
            </DrawerSection>
            <DrawerSection title="Bog‘liq bo‘limlar">
              <p className="bs-note bs-note-top">Qoldiq, buyurtma, to‘lov va kassa ko‘rsatkichlari tegishli bo‘limlarda — bu sahifada hisoblanmaydi.</p>
              {props.onOpenInventory ? (
                <button className="btn-tertiary bs-related" type="button" onClick={props.onOpenInventory}>
                  Omborni ko‘rish →
                </button>
              ) : null}
            </DrawerSection>
            <details className="bs-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="bs-kv bs-kv-tech">
                <div><dt>Filial ID</dt><dd className="bs-kv-mono">{selected.id}</dd></div>
                <div><dt>Kod</dt><dd className="bs-kv-mono">{selected.code || "—"}</dd></div>
                <div><dt>Koordinata (xom)</dt><dd className="bs-kv-mono">{String(selected.lat ?? "—")}, {String(selected.lng ?? "—")}</dd></div>
                <div><dt>Yaratilgan (UTC)</dt><dd className="bs-kv-mono">{selected.createdAt ? String(selected.createdAt) : "—"}</dd></div>
              </dl>
            </details>
            {!canManage ? <p className="bs-note">Tahrirlash uchun ruxsat yo‘q.</p> : null}
          </>
        ) : null}

        {editor && (creating || editing) ? (
          <form className="bs-form" onSubmit={onSaveForm} noValidate>
            <DrawerSection title="Asosiy ma’lumotlar">
              <div className="bs-form-grid">
                <label className="filter-field">
                  <span className="filter-label">Kod *</span>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="VM-122"
                    maxLength={32}
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Telefon *</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+998 71 123-45-67"
                    inputMode="tel"
                    maxLength={32}
                    required
                  />
                </label>
                <label className="filter-field bs-form-full">
                  <span className="filter-label">Nomi *</span>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} required />
                </label>
              </div>
            </DrawerSection>
            <DrawerSection title="Manzil">
              <div className="bs-form-grid">
                <label className="filter-field">
                  <span className="filter-label">Hudud *</span>
                  <input
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    list="bs-region-options"
                    maxLength={80}
                    required
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Shahar</span>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Bo‘sh = hudud"
                    maxLength={80}
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Tuman</span>
                  <input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} maxLength={80} />
                </label>
                <label className="filter-field bs-form-full">
                  <span className="filter-label">Manzil *</span>
                  <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={240} required />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Kenglik (lat) *</span>
                  <input
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    inputMode="decimal"
                    placeholder="41.31108"
                    required
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Uzunlik (lng) *</span>
                  <input
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    inputMode="decimal"
                    placeholder="69.24056"
                    required
                  />
                </label>
              </div>
              <datalist id="bs-region-options">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <p className="bs-note">Koordinata ilovada eng yaqin filialni aniqlash uchun ishlatiladi.</p>
            </DrawerSection>
            <DrawerSection title="Ish rejimi va holat">
              <div className="bs-form-grid">
                <label className="filter-field bs-form-full">
                  <span className="filter-label">Ish vaqti</span>
                  <input
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    placeholder={form.is24h ? "24/7" : "08:00 — 22:00"}
                    maxLength={80}
                  />
                </label>
              </div>
              <label className="bs-check">
                <input type="checkbox" checked={form.is24h} onChange={(e) => setForm({ ...form, is24h: e.target.checked })} />
                <span>24/7 ishlaydi</span>
              </label>
              <label className="bs-check">
                <input type="checkbox" checked={form.isOpen} onChange={(e) => setForm({ ...form, isOpen: e.target.checked })} />
                <span>Filial ochiq</span>
              </label>
              <p className="bs-note">Yopilsa, ilovada savatga tanlab bo‘lmaydi va yangi buyurtma yaratilmaydi.</p>
            </DrawerSection>
            <DrawerSection title="To‘lov kabineti">
              <p className="bs-note bs-note-top">
                {creating
                  ? "Ixtiyoriy. Kalitlar shifrlangan holda saqlanadi va keyin ko‘rsatilmaydi."
                  : "Kalit maydoni bo‘sh qolsa, saqlangan kalit o‘zgarmaydi. Kalitlar shifrlangan holda saqlanadi."}
              </p>
              <div className="bs-form-grid">
                <label className="filter-field">
                  <span className="filter-label">Payme merchant ID</span>
                  <input value={form.paymeMerchantId} onChange={(e) => setForm({ ...form, paymeMerchantId: e.target.value })} autoComplete="off" maxLength={64} />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Payme kaliti (yangi)</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={form.paymeKey}
                    onChange={(e) => setForm({ ...form, paymeKey: e.target.value })}
                    placeholder="Bo‘sh = o‘zgarmaydi"
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Click merchant ID</span>
                  <input value={form.clickMerchantId} onChange={(e) => setForm({ ...form, clickMerchantId: e.target.value })} autoComplete="off" maxLength={64} />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Click service ID</span>
                  <input value={form.clickServiceId} onChange={(e) => setForm({ ...form, clickServiceId: e.target.value })} autoComplete="off" maxLength={64} />
                </label>
                <label className="filter-field bs-form-full">
                  <span className="filter-label">Click kaliti (yangi)</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={form.clickSecret}
                    onChange={(e) => setForm({ ...form, clickSecret: e.target.value })}
                    placeholder="Bo‘sh = o‘zgarmaydi"
                  />
                </label>
              </div>
            </DrawerSection>
            {creating ? (
              <p className="bs-note">Yangi filial barcha mahsulotlar uchun 0 qoldiq bilan ochiladi — qoldiqni Ombor bo‘limida kiriting.</p>
            ) : null}
            {ownBranchOnly ? <p className="bs-note">Faqat o‘z filialingizni tahrirlashingiz mumkin — server tekshiradi.</p> : null}
            {formMsg ? <FeedbackBanner tone="warn">{formMsg}</FeedbackBanner> : null}
            <div className="bs-form-actions">
              <button className="btn-primary" type="submit" disabled={saving}>
                {creating ? "Yaratish" : "Saqlash"}
              </button>
              <button className="btn-tertiary" type="button" disabled={saving} onClick={cancelEditor}>
                Bekor qilish
              </button>
            </div>
          </form>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmSave && Boolean(pending)}
        title={creating ? "Yangi filial yaratish" : "Filial o‘zgarishlarini saqlash"}
        danger={Boolean(pending?.openChanged && !form.isOpen)}
        description={
          pending ? (
            <div className="bs-confirm">
              <div className="bs-confirm-name">
                {form.name.trim()} <span className="bs-confirm-code">{form.code.trim()}</span>
              </div>
              {creating ? (
                <p className="bs-confirm-text">
                  {form.region.trim()} · {form.address.trim()}
                  <br />
                  {form.isOpen ? "Filial darhol ilovada ko‘rinadi va buyurtma qabul qiladi." : "Filial yopiq holda yaratiladi."}
                </p>
              ) : (
                <ul className="bs-confirm-list">
                  {pending.labels.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              {pending.openChanged ? (
                <p className="bs-confirm-warn">
                  {form.isOpen
                    ? "Filial ilovada yana tanlanadi va buyurtma qabul qiladi."
                    : "Filial yopiladi: ilovada savatga tanlab bo‘lmaydi va unda yangi buyurtma yaratilmaydi."}
                </p>
              ) : null}
            </div>
          ) : null
        }
        confirmLabel={creating ? "Yaratish" : "Saqlash"}
        cancelLabel="Qaytish"
        busy={saving}
        onCancel={() => setConfirmSave(false)}
        onConfirm={() => void saveConfirmed()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Filialni o‘chirish"
        danger
        description={
          deleteTarget ? (
            <div className="bs-confirm">
              <div className="bs-confirm-name">
                {deleteTarget.name} <span className="bs-confirm-code">{deleteTarget.code}</span>
              </div>
              <p className="bs-confirm-warn">
                Bu amalni qaytarib bo‘lmaydi. Buyurtma, sotuv, qoldiq yoki xodim bog‘langan filialni server o‘chirmaydi — bunday filialni yoping.
              </p>
            </div>
          ) : null
        }
        confirmLabel="O‘chirish"
        cancelLabel="Qaytish"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteConfirmed()}
      />
    </div>
  );
}
