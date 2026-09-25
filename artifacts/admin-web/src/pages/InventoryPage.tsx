import { FormEvent, useEffect, useMemo, useState } from "react";
import { request, isHqRole, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
  DataTable,
  ConfirmDialog,
  FeedbackBanner,
  DetailDrawer,
  DrawerSection,
  ErrorState,
  LoadingBlock,
  stockAxisLabel,
  stockAxisShort,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Ombor ko‘rish uchun ruxsat yo‘q.";
  return err instanceof Error ? err.message : fallback;
}

function stockState(available: number, reserved: number): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (available <= 0) return { label: "Mavjud emas", tone: "danger" };
  if (reserved > 0) return { label: "Band bor", tone: "warn" };
  return { label: "Mavjud", tone: "ok" };
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
  const [category, setCategory] = useState("");
  const [availability, setAvailability] = useState("");

  const [selected, setSelected] = useState<any>(null);
  const [adjDelta, setAdjDelta] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjMsg, setAdjMsg] = useState("");
  const [confirmAdj, setConfirmAdj] = useState(false);
  const [expireBusy, setExpireBusy] = useState(false);
  const [expireMsg, setExpireMsg] = useState("");
  const [confirmExpire, setConfirmExpire] = useState(false);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const canAdjust = props.permissions.includes("inventory:adjust");
  const hasFilters = Boolean(query.trim() || category || availability);

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
      setError(errText(err, "Ombor ma’lumotini yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const withStock = useMemo(() => products.filter((p) => p.stock), [products]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of withStock) {
      const c = String(p.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [withStock]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withStock.filter((item) => {
      if (category && String(item.category) !== category) return false;
      const avail = Number(item.stock?.available || 0);
      // Mavjud emas = Available ≤ 0 (server available axis; no invented threshold)
      if (availability === "zero" && avail > 0) return false;
      if (availability === "positive" && avail <= 0) return false;
      if (!q) return true;
      return `${item.sku} ${item.nameUz} ${item.category}`.toLowerCase().includes(q);
    });
  }, [withStock, query, category, availability]);

  const zeroCount = useMemo(
    () => withStock.filter((p) => Number(p.stock?.available || 0) <= 0).length,
    [withStock],
  );

  const branchName =
    props.branches.find((b) => Number(b.id) === stockBranchId)?.name
    || (stockBranchId != null ? `Filial #${stockBranchId}` : "—");

  const previewAvailable = useMemo(() => {
    if (!selected?.stock) return null;
    const delta = Number(adjDelta);
    if (!Number.isInteger(delta)) return null;
    return Number(selected.stock.physical) + delta - Number(selected.stock.reserved);
  }, [selected, adjDelta]);

  function resetFilters() {
    setQuery("");
    setCategory("");
    setAvailability("");
  }

  function openProduct(item: any) {
    setSelected(item);
    setAdjDelta("");
    setAdjReason("");
    setAdjMsg("");
  }

  function requestAdjust(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const targetBranch = stockBranchId != null ? stockBranchId : Number(branchId);
    const productId = Number(selected.id);
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
      setAdjMsg("O‘zgarish butun va noldan farqli bo‘lishi kerak.");
      return;
    }
    if (!reason) {
      setAdjMsg("Sabab majburiy.");
      return;
    }
    setConfirmAdj(true);
  }

  async function submitAdjust() {
    if (adjBusy || !selected) return;
    const targetBranch = stockBranchId != null ? stockBranchId : Number(branchId);
    const productId = Number(selected.id);
    const physicalDelta = Number(adjDelta);
    const reason = adjReason.trim();

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
          ? "Takroriy so‘rov — o‘zgarish qilinmadi."
          : `Saqlandi. Fizik ${stock?.physicalQuantity ?? "—"} · Band ${stock?.reservedQuantity ?? "—"} · Mavjud ${stock?.availableQuantity ?? "—"}`,
      );
      setAdjDelta("");
      setAdjReason("");
      setConfirmAdj(false);
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setAdjMsg("Ruxsat yo‘q.");
      else setAdjMsg(err instanceof Error ? err.message : "Korreksiya bajarilmadi.");
      setConfirmAdj(false);
    } finally {
      setAdjBusy(false);
    }
  }

  useEffect(() => {
    if (!selected) return;
    const next = withStock.find((p) => Number(p.id) === Number(selected.id));
    if (next) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withStock]);

  async function runExpireDue() {
    if (expireBusy) return;
    setExpireBusy(true);
    setExpireMsg("");
    try {
      const data = await request("/api/admin/inventory/expire-due", props.token, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setExpireMsg(
        `Tekshirildi: ${Number(data?.examined || 0)} · bo‘shatildi: ${Number(data?.expired || 0)}. ` +
        "Bron muddati tugashi buyurtmani avtomatik bekor qilmaydi.",
      );
      setConfirmExpire(false);
      await load();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 403) setExpireMsg("Ruxsat yo‘q.");
      else setExpireMsg(err instanceof Error ? err.message : "Bajarilmadi.");
      setConfirmExpire(false);
    } finally {
      setExpireBusy(false);
    }
  }

  const needsBranch = isHq && stockBranchId == null && !loading && !error;
  const showSurface = !error && !needsBranch && !(loading && withStock.length === 0);

  return (
    <div className="inventory-page page-module">
      <AdminPageHeader
        title="Ombor"
        description={PAGE_DESCRIPTIONS.inventory}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Filial">
            {isHq ? (
              <select
                value={branchId}
                aria-label="Filial"
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setSelected(null);
                  void load(e.target.value);
                }}
              >
                <option value="">Tanlang</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            ) : (
              <input value="O‘z filiali" disabled readOnly aria-label="Filial" />
            )}
          </FilterField>
          <FilterField label="Mahsulot" grow>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Nomi yoki SKU"
              disabled={stockBranchId == null}
            />
          </FilterField>
          <FilterField label="Kategoriya">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Kategoriya"
              disabled={stockBranchId == null}
            >
              <option value="">Barchasi</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Mavjudlik">
            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              aria-label="Mavjudlik"
              disabled={stockBranchId == null}
            >
              <option value="">Barchasi</option>
              <option value="zero">Mavjud emas</option>
              <option value="positive">Mavjud</option>
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
        {stockBranchId != null ? (
          <p className="meta crm-controls-note">
            Filial: {branchName}. Qidiruv va filtrlar shu filial ro‘yxatiga qo‘llanadi.
          </p>
        ) : null}
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && products.length === 0 ? <LoadingBlock rows={3} /> : null}

      {needsBranch ? (
        <div className="crm-empty crm-empty-idle">
          <div className="empty-title">Filial tanlang</div>
          <p className="empty-desc">Ombor qoldig‘i filial bo‘yicha ochiladi. Yig‘ma qoldiq yo‘q.</p>
        </div>
      ) : null}

      {!error && !loading && stockBranchId != null ? (
        <div className="crm-context">
          <span className="crm-result-count">{filtered.length} ta mahsulot</span>
          {zeroCount > 0 ? (
            <span className="crm-context-hint">{zeroCount} ta mavjud emas</span>
          ) : null}
          {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
        </div>
      ) : null}

      {showSurface ? (
        <div className="crm-surface surface-table">
          <DataTable sticky>
            <thead>
              <tr>
                <th>Mahsulot</th>
                <th className="num inv-avail-col">{stockAxisShort("available")}</th>
                <th className="num inv-axis-secondary">{stockAxisShort("physical")}</th>
                <th className="num inv-axis-secondary">{stockAxisShort("reserved")}</th>
                <th>Holat</th>
                <th className="inv-col-branch">Filial</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="crm-empty-row">
                  <td colSpan={6}>
                    <div className="crm-empty">
                      <div className="empty-title">
                        {withStock.length ? "Bu filtrlar bo‘yicha mahsulot topilmadi." : "Mahsulotlar topilmadi"}
                      </div>
                      <p className="empty-desc">
                        {withStock.length
                          ? "Filtrlarni o‘zgartirib ko‘ring."
                          : "Bu filialda ombor ma’lumoti mavjud emas."}
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
                  const physical = Number(item.stock?.physical || 0);
                  const reserved = Number(item.stock?.reserved || 0);
                  const available = Number(item.stock?.available || 0);
                  const state = stockState(available, reserved);
                  const active = selected?.id === item.id;
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
                        <div className="meta">{item.sku}{item.category ? ` · ${item.category}` : ""}</div>
                      </td>
                      <td className={`num money-md inv-avail${available <= 0 ? " is-zero" : ""}`}>
                        {available}
                      </td>
                      <td className="num inv-axis-secondary">{physical}</td>
                      <td className="num inv-axis-secondary">{reserved}</td>
                      <td>
                        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                      </td>
                      <td className="inv-col-branch">{branchName}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
        </div>
      ) : null}

      {canAdjust && stockBranchId != null ? (
        <div className="inv-ops-bar">
          <button
            className="btn-tertiary"
            type="button"
            disabled={expireBusy}
            onClick={() => setConfirmExpire(true)}
          >
            Muddati o‘tgan bronlarni bo‘shatish
          </button>
          {expireMsg ? <FeedbackBanner tone="info">{expireMsg}</FeedbackBanner> : null}
        </div>
      ) : null}

      {!canAdjust ? (
        <p className="meta">Korreksiya uchun ruxsat yo‘q.</p>
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        width="lg"
        title={selected?.nameUz || "Mahsulot"}
        subtitle={selected ? `${selected.sku || "—"} · ${branchName}` : undefined}
        status={
          selected?.stock ? (
            <StatusBadge
              tone={stockState(Number(selected.stock.available || 0), Number(selected.stock.reserved || 0)).tone}
            >
              {stockState(Number(selected.stock.available || 0), Number(selected.stock.reserved || 0)).label}
            </StatusBadge>
          ) : undefined
        }
        onClose={() => {
          setSelected(null);
          setAdjMsg("");
          setAdjDelta("");
          setAdjReason("");
        }}
      >
        {selected?.stock ? (
          <>
            <DrawerSection title="Mahsulot">
              <dl className="crm-kv">
                <div>
                  <dt>Nomi</dt>
                  <dd>{selected.nameUz}</dd>
                </div>
                {selected.category ? (
                  <div>
                    <dt>Kategoriya</dt>
                    <dd>{selected.category}</dd>
                  </div>
                ) : null}
                {selected.sku ? (
                  <div>
                    <dt>SKU</dt>
                    <dd>{selected.sku}</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Filial">
              <dl className="crm-kv">
                <div>
                  <dt>Filial</dt>
                  <dd>{branchName}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Qoldiq">
              <dl className="crm-kv inv-stock-kv">
                <div>
                  <dt>{stockAxisLabel("physical")}</dt>
                  <dd>{Number(selected.stock.physical || 0)}</dd>
                </div>
                <div>
                  <dt>{stockAxisLabel("reserved")}</dt>
                  <dd>{Number(selected.stock.reserved || 0)}</dd>
                </div>
                <div className="inv-avail-row">
                  <dt>{stockAxisLabel("available")}</dt>
                  <dd className="money-md">{Number(selected.stock.available || 0)}</dd>
                </div>
              </dl>
              <p className="meta">Mavjud = Fizik − Band. Yakuniy son serverda hisoblanadi.</p>
            </DrawerSection>

            {canAdjust ? (
              <DrawerSection title="Korreksiya">
                <p className="meta">Faqat fizik qoldiq o‘zgaradi. Band bronlar bu yerda o‘zgarmaydi.</p>
                <form className="inv-adjust-form" onSubmit={requestAdjust}>
                  <label className="filter-field">
                    <span className="filter-label">O‘zgarish (±)</span>
                    <input
                      value={adjDelta}
                      onChange={(e) => setAdjDelta(e.target.value)}
                      type="number"
                      step="1"
                      aria-label="O‘zgarish"
                    />
                  </label>
                  <label className="filter-field">
                    <span className="filter-label">Sabab</span>
                    <input
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      placeholder="Majburiy"
                      aria-label="Sabab"
                    />
                  </label>
                  <button className="btn-primary" type="submit" disabled={adjBusy}>
                    Tasdiqlash…
                  </button>
                </form>
                {previewAvailable != null ? (
                  <p className="meta">Taxminiy mavjud ≈ {previewAvailable}</p>
                ) : null}
                {adjMsg ? (
                  <FeedbackBanner tone={adjMsg.includes("Saqlandi") ? "ok" : "warn"}>
                    {adjMsg}
                  </FeedbackBanner>
                ) : null}
              </DrawerSection>
            ) : null}
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmAdj}
        title="Inventar o‘zgartirilsinmi?"
        danger
        busy={adjBusy}
        confirmLabel="Tasdiqlash"
        cancelLabel="Qaytish"
        description={
          <>
            <div>Filial: {branchName}</div>
            <div>Mahsulot: {selected?.nameUz || "—"}</div>
            <div>Delta: {Number(adjDelta) > 0 ? `+${adjDelta}` : adjDelta}</div>
            <div>Sabab: {adjReason}</div>
            {previewAvailable != null ? <div className="meta">Taxminiy mavjud ≈ {previewAvailable}</div> : null}
          </>
        }
        onCancel={() => setConfirmAdj(false)}
        onConfirm={() => void submitAdjust()}
      />

      <ConfirmDialog
        open={confirmExpire}
        title="Muddati o‘tgan bronlar"
        busy={expireBusy}
        confirmLabel="Ishga tushirish"
        cancelLabel="Qaytish"
        description="Muddati o‘tgan bronlarni bo‘shatadi. Buyurtma avtomatik bekor qilinmaydi."
        onCancel={() => setConfirmExpire(false)}
        onConfirm={() => void runExpireDue()}
      />
    </div>
  );
}
