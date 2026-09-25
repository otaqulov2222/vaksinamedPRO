import { FormEvent, useEffect, useMemo, useState } from "react";
import { request, isHqRole, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
  DataTable,
  DetailDrawer,
  DrawerSection,
  FeedbackBanner,
  ConfirmDialog,
  ErrorState,
  LoadingBlock,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const MASK = "••••";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Filiallarni ko‘rish uchun ruxsat yo‘q.";
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
    // Never seed from branch.paymeKey / branch.clickSecret (API may return MASK)
    paymeKey: "",
    clickSecret: "",
  };
}

function placeLine(branch: any): string {
  const parts = [branch.region || branch.city, branch.district].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export function BranchesPage(props: {
  token: string;
  user: AdminUser | null;
  permissions: string[];
  onOpenInventory?: () => void;
}) {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);

  const canManage = props.permissions.includes("branches:manage");
  const hasFilters = Boolean(query.trim() || statusFilter || regionFilter);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin/branches", props.token);
      setBranches(Array.isArray(data?.branches) ? data.branches : []);
    } catch (err) {
      setBranches([]);
      setError(errText(err, "Filiallarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const b of branches) {
      const r = String(b.region || b.city || "").trim();
      if (r) set.add(r);
    }
    return Array.from(set).sort();
  }, [branches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return branches.filter((item) => {
      if (statusFilter === "open" && !item.isOpen) return false;
      if (statusFilter === "closed" && item.isOpen) return false;
      if (regionFilter) {
        const r = String(item.region || item.city || "");
        if (r !== regionFilter) return false;
      }
      if (!q) return true;
      return `${item.name} ${item.code} ${item.region} ${item.district} ${item.address} ${item.phone}`
        .toLowerCase()
        .includes(q);
    });
  }, [branches, query, statusFilter, regionFilter]);

  function resetFilters() {
    setQuery("");
    setStatusFilter("");
    setRegionFilter("");
  }

  function openBranch(branch: any) {
    setSelected(branch);
    setEditing(null);
    setMsg("");
  }

  function closeDrawer() {
    setSelected(null);
    setEditing(null);
    setMsg("");
  }

  function startEdit() {
    if (!selected || !canManage) return;
    setEditing(toEditState(selected));
    setMsg("");
  }

  function onSaveForm(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) {
      setMsg("Nomi majburiy.");
      return;
    }
    setConfirmSave(true);
  }

  async function saveConfirmed() {
    if (!editing || saving) return;
    setSaving(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = {
        name: editing.name.trim(),
        phone: editing.phone.trim(),
        hours: editing.hours.trim(),
        address: editing.address.trim(),
        isOpen: editing.isOpen,
        paymeMerchantId: editing.paymeMerchantId.trim(),
        clickMerchantId: editing.clickMerchantId.trim(),
        clickServiceId: editing.clickServiceId.trim(),
      };
      if (editing.paymeKey.trim() && editing.paymeKey.trim() !== MASK) {
        body.paymeKey = editing.paymeKey.trim();
      }
      if (editing.clickSecret.trim() && editing.clickSecret.trim() !== MASK) {
        body.clickSecret = editing.clickSecret.trim();
      }

      const data = await request(`/api/admin/branches/${editing.id}`, props.token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setConfirmSave(false);
      setEditing(null);
      setMsg("Filial yangilandi.");
      await load();
      if (data?.branch) setSelected(data.branch);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setMsg("Ruxsat yo‘q yoki filial doirasidan tashqari.");
      else if (status === 404) setMsg("Filial topilmadi.");
      else setMsg(err instanceof Error ? err.message : "Saqlanmadi.");
      setConfirmSave(false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!selected) return;
    const next = branches.find((b) => Number(b.id) === Number(selected.id));
    if (next) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches]);

  return (
    <div className="branches-page page-module">
      <AdminPageHeader
        title="Filiallar"
        description={PAGE_DESCRIPTIONS.branches}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Qidiruv" grow>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Nomi, kod, manzil, telefon"
            />
          </FilterField>
          <FilterField label="Holat">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Holat">
              <option value="">Barchasi</option>
              <option value="open">Ochiq</option>
              <option value="closed">Yopiq</option>
            </select>
          </FilterField>
          {regions.length > 0 ? (
            <FilterField label="Hudud">
              <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label="Hudud">
                <option value="">Barchasi</option>
                {regions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </FilterField>
          ) : null}
          {hasFilters ? (
            <div className="crm-controls-actions">
              <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
                Tozalash
              </button>
            </div>
          ) : null}
        </div>
        <p className="meta crm-controls-note">
          Qidiruv yuklangan ro‘yxat bo‘yicha.
          {props.user && !isHqRole(props.user.role)
            ? " Filial doirasi serverda saqlanadi."
            : null}
        </p>
      </div>

      {msg && !selected ? (
        <FeedbackBanner tone={msg.includes("yangilandi") ? "ok" : "warn"}>{msg}</FeedbackBanner>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && branches.length === 0 ? <LoadingBlock rows={3} /> : null}

      {!error && !(loading && branches.length === 0) ? (
        <>
          <div className="crm-context">
            <span className="crm-result-count">{filtered.length} ta filial</span>
            {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
          </div>

          <div className="crm-surface surface-table">
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Filial</th>
                  <th>Holat</th>
                  <th>Manzil</th>
                  <th className="branches-col-phone">Telefon</th>
                  <th className="branches-col-hours">Ish vaqti</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr className="crm-empty-row">
                    <td colSpan={5}>
                      <div className="crm-empty">
                        <div className="empty-title">Filiallar topilmadi</div>
                        <p className="empty-desc">
                          {branches.length
                            ? "Tanlangan shartlar bo‘yicha filial mavjud emas."
                            : "Hozircha filiallar ro‘yxati bo‘sh."}
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
                    const active = selected?.id === item.id;
                    const open = Boolean(item.isOpen);
                    return (
                      <tr
                        key={item.id}
                        className={`crm-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        onClick={() => openBranch(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openBranch(item);
                          }
                        }}
                      >
                        <td>
                          <div className="crm-name">{item.name}</div>
                          {item.code ? <div className="meta">{item.code}</div> : null}
                        </td>
                        <td>
                          <StatusBadge tone={open ? "ok" : "danger"}>
                            {open ? "Ochiq" : "Yopiq"}
                          </StatusBadge>
                        </td>
                        <td>
                          <div>{placeLine(item)}</div>
                          {item.address ? <div className="meta">{item.address}</div> : null}
                        </td>
                        <td className="branches-col-phone">{item.phone || "—"}</td>
                        <td className="branches-col-hours">
                          {item.hours || "—"}
                          {item.is24h ? <div className="meta">24/7</div> : null}
                        </td>
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
        open={Boolean(selected)}
        width="lg"
        title={selected?.name || "Filial"}
        subtitle={selected?.code || undefined}
        status={
          selected ? (
            <StatusBadge tone={selected.isOpen ? "ok" : "danger"}>
              {selected.isOpen ? "Ochiq" : "Yopiq"}
            </StatusBadge>
          ) : undefined
        }
        onClose={closeDrawer}
        footer={
          canManage && selected && !editing ? (
            <button className="btn-primary" type="button" onClick={startEdit}>
              Tahrirlash
            </button>
          ) : null
        }
      >
        {selected && !editing ? (
          <>
            <DrawerSection title="Asosiy ma’lumotlar">
              <dl className="crm-kv">
                <div>
                  <dt>Nomi</dt>
                  <dd>{selected.name}</dd>
                </div>
                {selected.code ? (
                  <div>
                    <dt>Kod</dt>
                    <dd>{selected.code}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Holat</dt>
                  <dd>{selected.isOpen ? "Ochiq" : "Yopiq"}</dd>
                </div>
                <div>
                  <dt>Ish vaqti</dt>
                  <dd>
                    {selected.hours || "—"}
                    {selected.is24h ? " · 24/7" : ""}
                  </dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Manzil / aloqa">
              <dl className="crm-kv">
                <div>
                  <dt>Hudud</dt>
                  <dd>{placeLine(selected)}</dd>
                </div>
                <div>
                  <dt>Manzil</dt>
                  <dd>{selected.address || "—"}</dd>
                </div>
                <div>
                  <dt>Telefon</dt>
                  <dd>{selected.phone || "—"}</dd>
                </div>
                {selected.lat != null && selected.lng != null ? (
                  <div>
                    <dt>Koordinata</dt>
                    <dd className="meta">
                      {Number(selected.lat).toFixed(5)}, {Number(selected.lng).toFixed(5)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="To‘lov kabineti">
              <dl className="crm-kv">
                <div>
                  <dt>Payme</dt>
                  <dd>
                    {selected.hasPayme
                      ? <StatusBadge tone="ok">Sozlangan</StatusBadge>
                      : <StatusBadge tone="neutral">Yo‘q</StatusBadge>}
                  </dd>
                </div>
                <div>
                  <dt>Click</dt>
                  <dd>
                    {selected.hasClick
                      ? <StatusBadge tone="ok">Sozlangan</StatusBadge>
                      : <StatusBadge tone="neutral">Yo‘q</StatusBadge>}
                  </dd>
                </div>
              </dl>
              <p className="meta">
                Maxfiy kalitlar ko‘rsatilmaydi ({MASK}). Merchant identifikatorlari tahrirda ochiladi.
              </p>
            </DrawerSection>

            <DrawerSection title="Ombor">
              <p className="meta">Filial qoldig‘i Ombor modulida boshqariladi.</p>
              {props.onOpenInventory ? (
                <button className="btn-tertiary" type="button" onClick={props.onOpenInventory}>
                  Omborni ko‘rish →
                </button>
              ) : null}
            </DrawerSection>

            {msg ? (
              <FeedbackBanner tone={msg.includes("yangilandi") ? "ok" : "warn"}>{msg}</FeedbackBanner>
            ) : null}
            {!canManage ? (
              <p className="meta">Tahrirlash uchun ruxsat yo‘q.</p>
            ) : null}
          </>
        ) : null}

        {selected && editing ? (
          <DrawerSection title="Tahrirlash">
            <form className="branches-form" onSubmit={onSaveForm}>
              <label className="filter-field">
                <span className="filter-label">Nomi *</span>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  aria-label="Nomi"
                  required
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Telefon</span>
                <input
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  aria-label="Telefon"
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Ish vaqti</span>
                <input
                  value={editing.hours}
                  onChange={(e) => setEditing({ ...editing, hours: e.target.value })}
                  aria-label="Ish vaqti"
                />
              </label>
              <label className="filter-field branches-form-full">
                <span className="filter-label">Manzil</span>
                <input
                  value={editing.address}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  aria-label="Manzil"
                />
              </label>
              <label className="branches-check branches-form-full">
                <input
                  type="checkbox"
                  checked={editing.isOpen}
                  onChange={(e) => setEditing({ ...editing, isOpen: e.target.checked })}
                />
                <span>Filial ochiq</span>
              </label>

              <h4 className="branches-form-sub branches-form-full">To‘lov kabineti</h4>
              <p className="meta branches-form-full">
                Maxfiy maydon bo‘sh = o‘zgarmaydi. {MASK} ni qayta yubormang.
              </p>
              <label className="filter-field">
                <span className="filter-label">Payme merchant ID</span>
                <input
                  value={editing.paymeMerchantId}
                  onChange={(e) => setEditing({ ...editing, paymeMerchantId: e.target.value })}
                  aria-label="Payme merchant ID"
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Payme key (yangi)</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={editing.paymeKey}
                  onChange={(e) => setEditing({ ...editing, paymeKey: e.target.value })}
                  aria-label="Payme key"
                  placeholder="Bo‘sh = o‘zgarmaydi"
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Click merchant ID</span>
                <input
                  value={editing.clickMerchantId}
                  onChange={(e) => setEditing({ ...editing, clickMerchantId: e.target.value })}
                  aria-label="Click merchant ID"
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Click service ID</span>
                <input
                  value={editing.clickServiceId}
                  onChange={(e) => setEditing({ ...editing, clickServiceId: e.target.value })}
                  aria-label="Click service ID"
                />
              </label>
              <label className="filter-field branches-form-full">
                <span className="filter-label">Click secret (yangi)</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={editing.clickSecret}
                  onChange={(e) => setEditing({ ...editing, clickSecret: e.target.value })}
                  aria-label="Click secret"
                  placeholder="Bo‘sh = o‘zgarmaydi"
                />
              </label>

              <div className="branches-form-actions branches-form-full">
                <button className="btn-primary" type="submit" disabled={saving}>
                  Saqlash
                </button>
                <button
                  className="btn-tertiary"
                  type="button"
                  onClick={() => { setEditing(null); setMsg(""); }}
                >
                  Bekor qilish
                </button>
              </div>
              {msg ? (
                <FeedbackBanner tone={msg.includes("yangilandi") ? "ok" : "warn"}>{msg}</FeedbackBanner>
              ) : null}
            </form>
          </DrawerSection>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmSave}
        title="Filial o‘zgarishlarini saqlash"
        description={
          editing ? (
            <>
              <div>
                <strong>{editing.name}</strong> · {editing.isOpen ? "Ochiq" : "Yopiq"}
              </div>
              <div className="meta">Maxfiy kalitlar faqat yangi qiymat kiritilganda yangilanadi.</div>
            </>
          ) : null
        }
        confirmLabel="Saqlash"
        cancelLabel="Qaytish"
        busy={saving}
        onCancel={() => setConfirmSave(false)}
        onConfirm={() => void saveConfirmed()}
      />
    </div>
  );
}
