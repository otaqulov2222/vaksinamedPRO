import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Info, RefreshCw, Warehouse } from "lucide-react";
import { request, isHqRole, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
  DataTable,
  PaginationBar,
  ConfirmDialog,
  FeedbackBanner,
  DetailDrawer,
  DrawerSection,
  ErrorState,
  stockAxisLabel,
  stockAxisShort,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const PAGE_SIZE = 50;
const TABLE_COLUMNS = 5;

type StockKey = "ok" | "zero" | "held" | "anomaly";
type StockState = { key: StockKey; label: string; tone: "ok" | "warn" | "info" | "danger" };
type LoadError = { kind: "forbidden" | "session" | "failed"; message: string };

function statusOf(err: unknown) {
  return err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
}

function loadError(err: unknown): LoadError {
  const status = statusOf(err);
  if (status === 401) return { kind: "session", message: "Sessiya tugagan. Qayta kiring." };
  if (status === 403) return { kind: "forbidden", message: "Bu filial qoldig‘ini ko‘rish uchun ruxsat yo‘q." };
  return { kind: "failed", message: "Ombor ma’lumotlarini yuklab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring." };
}

function adjustError(err: unknown): string {
  const status = statusOf(err);
  const server = err instanceof Error && err.message ? err.message : "";
  if (status === 403) return "Bu filial yoki amal uchun ruxsat yo‘q.";
  if (status === 404) return "Bu filialda mahsulot uchun ombor qatori yo‘q — korreksiya qilib bo‘lmaydi.";
  if (status === 409) return server || "Ombor holati o‘zgargan. Ma’lumot yangilandi — qayta tekshirib ko‘ring.";
  if (status === 400) return server || "Kiritilgan qiymat noto‘g‘ri.";
  if (!status) return "Aloqa uzildi. Qayta yuborilsa, xuddi shu so‘rov takror qo‘llanmaydi.";
  return server || "Korreksiya bajarilmadi.";
}

/**
 * Presentation-only, derived from the server axes. There is no low-stock threshold policy:
 * Available ≤ 0 is the only availability signal; a negative value is surfaced, never corrected.
 */
function stockState(physical: number, reserved: number, available: number): StockState {
  if (available < 0 || reserved > physical) return { key: "anomaly", label: "Nomuvofiq", tone: "danger" };
  if (available === 0 && reserved > 0) return { key: "held", label: "To‘liq rezervda", tone: "info" };
  if (available === 0) return { key: "zero", label: "Mavjud emas", tone: "warn" };
  return { key: "ok", label: "Mavjud", tone: "ok" };
}

function axesOf(item: any) {
  return {
    physical: Number(item.stock?.physical || 0),
    reserved: Number(item.stock?.reserved || 0),
    available: Number(item.stock?.available || 0),
  };
}

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

function newAdjustKey(branchId: number, productId: number) {
  const nonce = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${performance.now().toString(36)}`;
  return `admin-adjust:${branchId}:${productId}:${nonce}`;
}

export function InventoryPage(props: {
  token: string;
  user: AdminUser | null;
  permissions: string[];
  branches: any[];
}) {
  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const canAdjust = props.permissions.includes("inventory:adjust");

  const [products, setProducts] = useState<any[]>([]);
  const [stockBranchId, setStockBranchId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(!isHq);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [fomWriter, setFomWriter] = useState<"off" | "on" | null>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [availability, setAvailability] = useState("");
  const [offset, setOffset] = useState(0);

  const [selected, setSelected] = useState<any>(null);
  const [adjDelta, setAdjDelta] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjMsg, setAdjMsg] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [confirmAdj, setConfirmAdj] = useState(false);
  const [expireBusy, setExpireBusy] = useState(false);
  const [expireMsg, setExpireMsg] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [confirmExpire, setConfirmExpire] = useState(false);

  const loadSeq = useRef(0);
  const adjustKey = useRef<{ sig: string; key: string } | null>(null);
  const branchSelectRef = useRef<HTMLSelectElement>(null);

  const hasFilters = Boolean(query.trim() || category || availability);

  async function load(nextBranchId?: string) {
    const bid = nextBranchId ?? branchId;
    const seq = ++loadSeq.current;
    if (isHq && !bid) {
      setProducts([]);
      setStockBranchId(null);
      setError(null);
      setLoading(false);
      setLoaded(false);
      return;
    }
    const qs = bid ? `?branchId=${encodeURIComponent(bid)}` : "";
    setLoading(true);
    setError(null);
    try {
      const data = await request(`/api/admin/products${qs}`, props.token);
      if (seq !== loadSeq.current) return;
      setProducts(Array.isArray(data?.products) ? data.products : []);
      setStockBranchId(data?.stockBranchId != null ? Number(data.stockBranchId) : null);
      setLoaded(true);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setProducts([]);
      setStockBranchId(null);
      setError(loadError(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  useEffect(() => {
    let alive = true;
    request("/api/integrations/fom/status", props.token)
      .then((data) => {
        if (!alive) return;
        const off = String(data?.inventoryWriter || "").toUpperCase() === "OFF" && data?.fomInventoryWriterEnabled === false;
        setFomWriter(off ? "off" : "on");
      })
      .catch(() => {
        if (alive) setFomWriter(null);
      });
    return () => {
      alive = false;
    };
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

  const summary = useMemo(() => {
    const out = { total: withStock.length, ok: 0, zero: 0, held: 0, anomaly: 0, reservedSkus: 0, reservedUnits: 0 };
    for (const item of withStock) {
      const a = axesOf(item);
      out[stockState(a.physical, a.reserved, a.available).key] += 1;
      if (a.reserved > 0) {
        out.reservedSkus += 1;
        out.reservedUnits += a.reserved;
      }
    }
    return out;
  }, [withStock]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withStock.filter((item) => {
      if (category && String(item.category) !== category) return false;
      const a = axesOf(item);
      const key = stockState(a.physical, a.reserved, a.available).key;
      if (availability === "positive" && key !== "ok") return false;
      if (availability === "zero" && key !== "zero" && key !== "held") return false;
      if (availability === "reserved" && a.reserved <= 0) return false;
      if (availability === "anomaly" && key !== "anomaly") return false;
      if (!q) return true;
      return `${item.sku} ${item.nameUz} ${item.nameRu || ""} ${item.category}`.toLowerCase().includes(q);
    });
  }, [withStock, query, category, availability]);

  useEffect(() => {
    setOffset(0);
  }, [query, category, availability, stockBranchId]);

  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);

  const branchName =
    props.branches.find((b) => Number(b.id) === stockBranchId)?.name
    || (stockBranchId != null ? `Filial #${stockBranchId}` : "—");

  const selectedAxes = selected?.stock ? axesOf(selected) : null;
  const selectedState = selectedAxes ? stockState(selectedAxes.physical, selectedAxes.reserved, selectedAxes.available) : null;

  const delta = Number(adjDelta);
  const deltaValid = adjDelta.trim() !== "" && Number.isInteger(delta) && delta !== 0;
  const preview = selectedAxes && deltaValid
    ? { physical: selectedAxes.physical + delta, available: selectedAxes.physical + delta - selectedAxes.reserved }
    : null;

  function resetFilters() {
    setQuery("");
    setCategory("");
    setAvailability("");
  }

  function resetAdjust() {
    setAdjDelta("");
    setAdjReason("");
    setAdjMsg(null);
    adjustKey.current = null;
  }

  function openProduct(item: any) {
    setSelected(item);
    resetAdjust();
  }

  function closeDrawer() {
    setSelected(null);
    resetAdjust();
  }

  function focusBranchSelect() {
    const el = branchSelectRef.current as (HTMLSelectElement & { showPicker?: () => void }) | null;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      // showPicker is unsupported or needs user activation in some browsers; focus alone is enough.
    }
  }

  function changeBranch(value: string) {
    setBranchId(value);
    setSelected(null);
    setProducts([]);
    void load(value);
  }

  function requestAdjust(event: FormEvent) {
    event.preventDefault();
    if (!selected || !selectedAxes) return;
    const reason = adjReason.trim();
    if (stockBranchId == null) {
      setAdjMsg({ tone: "warn", text: "Filial tanlanmagan — korreksiya uchun filial majburiy." });
      return;
    }
    if (!deltaValid) {
      setAdjMsg({ tone: "warn", text: "O‘zgarish butun va noldan farqli son bo‘lishi kerak." });
      return;
    }
    if (preview && preview.physical < 0) {
      setAdjMsg({ tone: "warn", text: "Fizik qoldiq manfiy bo‘lishi mumkin emas." });
      return;
    }
    if (preview && preview.physical < selectedAxes.reserved) {
      setAdjMsg({ tone: "warn", text: `Fizik qoldiq rezervdan (${selectedAxes.reserved}) kam bo‘lishi mumkin emas.` });
      return;
    }
    if (!reason) {
      setAdjMsg({ tone: "warn", text: "Sabab majburiy." });
      return;
    }
    const sig = `${stockBranchId}:${selected.id}:${delta}:${reason}`;
    if (adjustKey.current?.sig !== sig) {
      adjustKey.current = { sig, key: newAdjustKey(stockBranchId, Number(selected.id)) };
    }
    setAdjMsg(null);
    setConfirmAdj(true);
  }

  async function submitAdjust() {
    if (adjBusy || !selected || stockBranchId == null || !adjustKey.current) return;
    setAdjBusy(true);
    try {
      const data = await request("/api/admin/inventory/adjust", props.token, {
        method: "POST",
        body: JSON.stringify({
          branchId: stockBranchId,
          productId: Number(selected.id),
          physicalDelta: delta,
          reason: adjReason.trim(),
          idempotencyKey: adjustKey.current.key,
        }),
      });
      const stock = data?.stock;
      const after = `Fizik ${stock?.physicalQuantity ?? "—"} · Rezerv ${stock?.reservedQuantity ?? "—"} · Mavjud ${stock?.availableQuantity ?? "—"}`;
      setAdjMsg(
        data?.idempotent
          ? { tone: "warn", text: `Bu so‘rov avval bajarilgan — qayta qo‘llanmadi. ${after}` }
          : { tone: "ok", text: `Saqlandi. ${after}` },
      );
      setAdjDelta("");
      setAdjReason("");
      adjustKey.current = null;
      setConfirmAdj(false);
      await load();
    } catch (err) {
      setAdjMsg({ tone: "danger", text: adjustError(err) });
      setConfirmAdj(false);
      if (statusOf(err) === 409) await load();
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
    setExpireMsg(null);
    try {
      const data = await request("/api/admin/inventory/expire-due", props.token, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setExpireMsg({
        tone: "info",
        text:
          `Tekshirildi: ${Number(data?.examined || 0)} · bo‘shatildi: ${Number(data?.expired || 0)}. ` +
          "Bron muddati tugashi buyurtmani avtomatik bekor qilmaydi.",
      });
      setConfirmExpire(false);
      await load();
    } catch (err) {
      setExpireMsg({ tone: "warn", text: statusOf(err) === 403 ? "Ruxsat yo‘q." : "Bajarilmadi. Qayta urinib ko‘ring." });
      setConfirmExpire(false);
    } finally {
      setExpireBusy(false);
    }
  }

  const needsBranch = !error && !loading && stockBranchId == null && (isHq ? !branchId || loaded : loaded);
  const initialLoading = loading && withStock.length === 0;
  const showSurface = !error && !needsBranch;
  const branchPending = isHq && !branchId;
  const refreshing = loading && withStock.length > 0;

  return (
    <div className="inventory-page page-module">
      <AdminPageHeader
        title="Ombor"
        description={PAGE_DESCRIPTIONS.inventory}
        actions={
          <>
            {canAdjust ? (
              <button
                className="btn-tertiary"
                type="button"
                disabled={expireBusy}
                onClick={() => setConfirmExpire(true)}
              >
                Muddati o‘tgan bronlar
              </button>
            ) : null}
            <button
              className={`btn-secondary inv-refresh${refreshing ? " is-busy" : ""}`}
              type="button"
              disabled={loading || (isHq && !branchId)}
              onClick={() => void load()}
            >
              <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
              Yangilash
            </button>
          </>
        }
      />

      {expireMsg ? <FeedbackBanner tone={expireMsg.tone}>{expireMsg.text}</FeedbackBanner> : null}

      <section className={`inv-controls${branchPending ? " is-branch-pending" : ""}`} aria-label="Filial, qidiruv va filtrlar">
        <div className="inv-controls-scope">
          {isHq ? (
            <FilterField label="Filial">
              <select
                ref={branchSelectRef}
                className="inv-branch-select"
                value={branchId}
                aria-label="Filial"
                aria-describedby="inv-scope-note"
                onChange={(e) => changeBranch(e.target.value)}
              >
                <option value="">Filial tanlang</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </FilterField>
          ) : (
            <div className="inv-branch-fixed">
              <span className="filter-label">Filial</span>
              <span className="inv-branch-name">{stockBranchId != null ? branchName : "O‘z filiali"}</span>
            </div>
          )}
          <p className="inv-scope-note" id="inv-scope-note">
            {isHq
              ? "Qoldiq bitta filial bo‘yicha ko‘rsatiladi — tarmoq bo‘yicha yig‘ma qoldiq API’da yo‘q."
              : "Faqat o‘z filialingiz qoldig‘i — doirani server belgilaydi."}
          </p>
          {fomWriter === "off" ? (
            <p className="inv-fom" title="Qoldiq FOM tomonidan yozilmaydi: FOM stock contract hali tasdiqlanmagan.">
              <Info size={14} strokeWidth={2} aria-hidden="true" />
              FOM inventar yozuvchisi faol emas
            </p>
          ) : fomWriter === "on" ? (
            <p className="inv-fom is-warn">
              <Info size={14} strokeWidth={2} aria-hidden="true" />
              FOM inventar yozuvchisi holati kutilmagan — FOM sahifasini tekshiring
            </p>
          ) : null}
        </div>
        <div className="inv-controls-primary">
          <FilterField label="Mahsulot" grow>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Nomi yoki SKU"
              disabled={!withStock.length}
            />
          </FilterField>
          <FilterField label="Kategoriya">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Kategoriya"
              disabled={!withStock.length}
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
              disabled={!withStock.length}
            >
              <option value="">Barchasi</option>
              <option value="positive">Mavjud</option>
              <option value="zero">Mavjud emas</option>
              <option value="reserved">Rezervda</option>
              {summary.anomaly > 0 ? <option value="anomaly">Nomuvofiq</option> : null}
            </select>
          </FilterField>
          {showSurface ? (
            <div className="inv-result" aria-live="polite">
              <span className="inv-result-count">
                {initialLoading ? "Yuklanmoqda…" : `${filtered.length} ta mahsulot`}
              </span>
              {hasFilters ? (
                <button className="btn-tertiary" type="button" onClick={resetFilters}>
                  Tozalash
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="inv-controls-note">
          {branchPending
            ? "Qidiruv va filtrlar filial tanlangach faollashadi."
            : "Qidiruv va filtrlar filialning to‘liq ro‘yxatiga qo‘llanadi."}
        </p>
      </section>

      {error ? (
        error.kind === "forbidden" ? (
          <div className="inv-state" role="status">
            <div className="empty-title">Ruxsat yo‘q</div>
            <p className="empty-desc">{error.message} Kerakli filialni administrator orqali oling.</p>
          </div>
        ) : (
          <ErrorState message={error.message} onRetry={error.kind === "failed" ? () => void load() : undefined} />
        )
      ) : null}

      {needsBranch ? (
        <>
          <div className="inv-summary is-idle" aria-hidden="true">
            {["Mahsulot", "Mavjud", "Mavjud emas", "Rezervda"].map((label) => (
              <span key={label} className="inv-summary-cell">
                <span className="inv-summary-k">{label}</span>
                <span className="inv-summary-v">—</span>
                <span className="inv-summary-note">Filial tanlanmagan</span>
              </span>
            ))}
          </div>
          <section className="inv-idle" role="status" aria-labelledby="inv-idle-title">
            <span className="inv-idle-icon" aria-hidden="true">
              <Warehouse size={20} strokeWidth={1.8} />
            </span>
            <span className="inv-idle-eyebrow">Ombor qoldig‘i</span>
            <h2 className="inv-idle-title" id="inv-idle-title">Avval filialni tanlang</h2>
            <p className="inv-idle-desc">
              Ombor qoldig‘i filial kesimida ko‘riladi. Filialni tanlaganingizdan so‘ng fizik, rezerv va mavjud
              miqdorlar shu yerda chiqadi. Tarmoq bo‘yicha yig‘ma qoldiq yo‘q.
            </p>
            <dl className="inv-idle-axes">
              <div>
                <dt>{stockAxisLabel("physical")}</dt>
                <dd>Filialdagi jismoniy miqdor</dd>
              </div>
              <div>
                <dt>{stockAxisLabel("reserved")}</dt>
                <dd>Faol bronlar bilan band</dd>
              </div>
              <div>
                <dt>{stockAxisLabel("available")}</dt>
                <dd>Fizik − Rezerv</dd>
              </div>
            </dl>
            {isHq ? (
              <button className="btn-secondary inv-idle-action" type="button" onClick={focusBranchSelect}>
                Filialni tanlash
              </button>
            ) : null}
          </section>
        </>
      ) : null}

      {showSurface && initialLoading ? (
        <div className="inv-summary is-loading" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="inv-summary-cell">
              <span className="inv-skeleton" />
              <span className="inv-skeleton" />
            </span>
          ))}
        </div>
      ) : showSurface && withStock.length > 0 ? (
        <section className="inv-summary" aria-label={`Filial qoldig‘i: ${branchName}`}>
          <div className="inv-summary-cell is-total">
            <span className="inv-summary-k">Mahsulot</span>
            <span className="inv-summary-v">{summary.total}</span>
            <span className="inv-summary-note">{branchName}</span>
          </div>
          <div className="inv-summary-cell is-ok">
            <span className="inv-summary-k">Mavjud</span>
            <span className="inv-summary-v">{summary.ok}</span>
            <span className="inv-summary-note">Mavjud &gt; 0</span>
          </div>
          <div className="inv-summary-cell is-warn">
            <span className="inv-summary-k">Mavjud emas</span>
            <span className="inv-summary-v">{summary.zero + summary.held}</span>
            <span className="inv-summary-note">
              {summary.held > 0 ? `shundan ${summary.held} ta to‘liq rezervda` : "Mavjud = 0"}
            </span>
          </div>
          <div className="inv-summary-cell is-info">
            <span className="inv-summary-k">Rezervda</span>
            <span className="inv-summary-v">{summary.reservedSkus}</span>
            <span className="inv-summary-note">Jami {summary.reservedUnits} birlik</span>
          </div>
          {summary.anomaly > 0 ? (
            <div className="inv-summary-cell is-danger">
              <span className="inv-summary-k">Nomuvofiq</span>
              <span className="inv-summary-v">{summary.anomaly}</span>
              <span className="inv-summary-note">Rezerv &gt; Fizik — tekshiring</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {showSurface ? (
        <div
          className={`inv-surface surface-table${refreshing ? " is-refreshing" : ""}${!initialLoading && !pageRows.length ? " is-empty" : ""}`}
          aria-busy={loading}
        >
          <DataTable sticky>
            <thead>
              <tr>
                <th>Mahsulot</th>
                <th className="num">{stockAxisShort("physical")}</th>
                <th className="num">{stockAxisShort("reserved")}</th>
                <th className="num inv-avail-col">{stockAxisShort("available")}</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="inv-skeleton-row" aria-hidden="true">
                    {Array.from({ length: TABLE_COLUMNS }).map((__, c) => (
                      <td key={c} className={c > 0 && c < 4 ? "num" : undefined}>
                        <span className="inv-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr className="inv-empty-row">
                  <td colSpan={TABLE_COLUMNS}>
                    <div className="inv-empty">
                      <div className="empty-title">
                        {withStock.length ? "Tanlangan shartlar bo‘yicha qoldiq topilmadi." : "Bu filialda ombor ma’lumoti topilmadi."}
                      </div>
                      <p className="empty-desc">
                        {withStock.length
                          ? "Qidiruv yoki filtrlarni o‘zgartirib ko‘ring."
                          : "Filialda hali mahsulot qoldig‘i yozilmagan."}
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
                pageRows.map((item) => {
                  const physical = Number(item.stock?.physical || 0);
                  const reserved = Number(item.stock?.reserved || 0);
                  const available = Number(item.stock?.available || 0);
                  const state = stockState(physical, reserved, available);
                  const active = selected?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`inv-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      aria-label={`${item.nameUz}: mavjud ${available}`}
                      onClick={() => openProduct(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openProduct(item);
                        }
                      }}
                    >
                      <td className="inv-cell-product">
                        <div className="inv-product">
                          <span className="inv-name">{item.nameUz}</span>
                          <span className="inv-sub">
                            {item.sku || "—"}
                            {item.category ? ` · ${item.category}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="num inv-physical" data-label={stockAxisShort("physical")}>{physical}</td>
                      <td className={`num inv-reserved${reserved > 0 ? " has-value" : ""}`} data-label={stockAxisShort("reserved")}>
                        {reserved}
                      </td>
                      <td className={`num inv-avail is-${state.key}`}>{available}</td>
                      <td className="inv-cell-status">
                        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          {filtered.length > PAGE_SIZE ? (
            <PaginationBar
              offset={offset}
              limit={PAGE_SIZE}
              total={filtered.length}
              hasMore={offset + PAGE_SIZE < filtered.length}
              loading={loading}
              onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              onNext={() => setOffset(offset + PAGE_SIZE)}
            />
          ) : null}
        </div>
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        width="lg"
        title={selected?.nameUz || "Mahsulot"}
        subtitle={selected ? `${selected.sku || "—"} · ${branchName}` : undefined}
        status={selectedState ? <StatusBadge tone={selectedState.tone}>{selectedState.label}</StatusBadge> : undefined}
        onClose={closeDrawer}
      >
        {selected?.stock && selectedAxes ? (
          <>
            <DrawerSection title="Qoldiq">
              <div className="inv-axes">
                <div className="inv-axis">
                  <span className="inv-axis-k">{stockAxisLabel("physical")}</span>
                  <span className="inv-axis-v">{selectedAxes.physical}</span>
                </div>
                <div className="inv-axis">
                  <span className="inv-axis-k">{stockAxisLabel("reserved")}</span>
                  <span className="inv-axis-v">{selectedAxes.reserved}</span>
                </div>
                <div className={`inv-axis is-available is-${selectedState?.key}`}>
                  <span className="inv-axis-k">{stockAxisLabel("available")}</span>
                  <span className="inv-axis-v">{selectedAxes.available}</span>
                </div>
              </div>
              <p className="inv-note">Mavjud = Fizik − Rezerv. Qiymatlar serverdan olinadi, bu yerda qayta hisoblanmaydi.</p>
              {selectedState?.key === "anomaly" ? (
                <FeedbackBanner tone="danger">
                  Rezerv fizik qoldiqdan katta — ombor ma’lumotida nomuvofiqlik. Qiymat tuzatilmagan holda ko‘rsatilmoqda; tekshiruv kerak.
                </FeedbackBanner>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Mahsulot">
              <dl className="inv-kv">
                <div>
                  <dt>Nomi</dt>
                  <dd>{selected.nameUz}</dd>
                </div>
                {selected.sku ? (
                  <div>
                    <dt>SKU</dt>
                    <dd className="inv-kv-mono">{selected.sku}</dd>
                  </div>
                ) : null}
                {selected.category ? (
                  <div>
                    <dt>Kategoriya</dt>
                    <dd>{selected.category}</dd>
                  </div>
                ) : null}
                {typeof selected.requiresPrescription === "boolean" ? (
                  <div>
                    <dt>Retsept</dt>
                    <dd>{selected.requiresPrescription ? "Talab qilinadi" : "Talab qilinmaydi"}</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Filial">
              <dl className="inv-kv">
                <div>
                  <dt>Filial</dt>
                  <dd>{branchName}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Rezerv">
              <p className="inv-note">
                Rezerv — faol bronlar yig‘indisi; manbai bronlar (reservations) jadvali. Buyurtmadagi bron muddati faqat nusxa.
                Bronlar ro‘yxati uchun admin API mavjud emas.
              </p>
            </DrawerSection>

            {canAdjust ? (
              <DrawerSection title="Korreksiya">
                <p className="inv-note">Faqat fizik qoldiq o‘zgaradi. Rezerv bu yerda o‘zgarmaydi. Amal audit jurnaliga yoziladi.</p>
                <form className="inv-adjust-form" onSubmit={requestAdjust}>
                  <label className="filter-field">
                    <span className="filter-label">O‘zgarish (±)</span>
                    <input
                      value={adjDelta}
                      onChange={(e) => setAdjDelta(e.target.value)}
                      type="number"
                      step="1"
                      inputMode="numeric"
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
                    Davom etish
                  </button>
                </form>
                {preview ? (
                  <p className={`inv-preview${preview.physical < selectedAxes.reserved ? " is-error" : ""}`}>
                    Fizik {selectedAxes.physical} → {preview.physical} · Mavjud {selectedAxes.available} → {preview.available}
                  </p>
                ) : null}
                {adjMsg ? <FeedbackBanner tone={adjMsg.tone}>{adjMsg.text}</FeedbackBanner> : null}
              </DrawerSection>
            ) : (
              <p className="inv-note inv-note-block">Korreksiya uchun inventory:adjust ruxsati kerak.</p>
            )}

            <details className="inv-tech">
              <summary>Texnik ma’lumotlar</summary>
              <dl className="inv-kv inv-kv-tech">
                <div>
                  <dt>Mahsulot ID</dt>
                  <dd>{selected.id}</dd>
                </div>
                <div>
                  <dt>Filial ID</dt>
                  <dd>{stockBranchId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Manba</dt>
                  <dd>product_stocks (branch_id, product_id)</dd>
                </div>
              </dl>
            </details>
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmAdj}
        title="Fizik qoldiqni o‘zgartirish"
        danger
        busy={adjBusy}
        confirmLabel="Tasdiqlash"
        cancelLabel="Bekor"
        description={
          <div className="inv-confirm">
            <dl className="inv-kv">
              <div>
                <dt>Filial</dt>
                <dd>{branchName}</dd>
              </div>
              <div>
                <dt>Mahsulot</dt>
                <dd>{selected?.nameUz || "—"}</dd>
              </div>
              <div>
                <dt>O‘zgarish</dt>
                <dd className="inv-kv-strong">{deltaValid ? signed(delta) : "—"}</dd>
              </div>
              {preview && selectedAxes ? (
                <>
                  <div>
                    <dt>{stockAxisShort("physical")}</dt>
                    <dd>{selectedAxes.physical} → {preview.physical}</dd>
                  </div>
                  <div>
                    <dt>{stockAxisShort("available")}</dt>
                    <dd>{selectedAxes.available} → {preview.available}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt>Sabab</dt>
                <dd>{adjReason.trim()}</dd>
              </div>
            </dl>
            <p className="inv-note">Yakuniy natijani server hisoblaydi; rezerv o‘zgarmaydi.</p>
          </div>
        }
        onCancel={() => setConfirmAdj(false)}
        onConfirm={() => void submitAdjust()}
      />

      <ConfirmDialog
        open={confirmExpire}
        title="Muddati o‘tgan bronlarni bo‘shatish"
        busy={expireBusy}
        confirmLabel="Ishga tushirish"
        cancelLabel="Bekor"
        description="Muddati o‘tgan faol bronlar barcha filiallar bo‘yicha bo‘shatiladi (bir martada ko‘pi bilan 100 ta). Buyurtma avtomatik bekor qilinmaydi."
        onCancel={() => setConfirmExpire(false)}
        onConfirm={() => void runExpireDue()}
      />
    </div>
  );
}
