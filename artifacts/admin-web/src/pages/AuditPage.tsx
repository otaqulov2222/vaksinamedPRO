import { useEffect, useMemo, useState } from "react";
import { request, fmtDate } from "../api";
import {
  AdminPageHeader,
  FilterField,
  DataTable,
  DetailDrawer,
  DrawerSection,
  ErrorState,
  LoadingBlock,
  PaginationBar,
  fulfillmentLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const AUDIT_PAGE = 40;

/** Client defense-in-depth — server already sanitizes; never show these keys. */
const SENSITIVE_KEY =
  /password|otp|token|secret|authorization|merchant.?key|payme.?key|click.?secret|api.?key|session|refresh/i;

const ENTITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Barchasi" },
  { value: "order", label: "Buyurtma" },
  { value: "product", label: "Mahsulot" },
  { value: "product_stock", label: "Ombor" },
  { value: "branch", label: "Filial" },
  { value: "admin_user", label: "Admin" },
];

/** Known actions observed in backend audit inserts — do not invent others. */
const ACTION_LABELS: Record<string, string> = {
  "admin.login": "Admin kirishi",
  "branch.update": "Filial yangilandi",
  "product.create": "Mahsulot yaratildi",
  "product.update": "Mahsulot yangilandi",
  "inventory.adjust": "Ombor tuzatildi",
  "inventory.expire_due": "Muddati o‘tgan bronlar bo‘shatildi",
  "order.confirm_pos": "POS tasdiq",
  "order.cancel": "Buyurtma bekor qilindi",
  "fom.sale_confirmed": "FOM sotuv tasdiqlandi",
};

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Audit uchun ruxsat yo‘q.";
  return err instanceof Error ? err.message : fallback;
}

function scrubMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (typeof v === "string" && SENSITIVE_KEY.test(v) && v.length > 12) {
      out[k] = "••••••••";
      continue;
    }
    out[k] = v;
  }
  return out;
}

function actionLabel(action: string): string {
  const raw = String(action || "").trim();
  if (!raw) return "Noma'lum amal";
  if (ACTION_LABELS[raw]) return ACTION_LABELS[raw];

  if (raw.startsWith("order.transition.")) {
    const status = raw.slice("order.transition.".length);
    const human = fulfillmentLabel(status);
    return human && human !== status ? `Buyurtma: ${human}` : `Buyurtma holati: ${status}`;
  }
  if (raw.startsWith("order.refund_cashback.")) {
    const mode = raw.slice("order.refund_cashback.".length);
    return `Cashback qaytarish (${mode})`;
  }
  return `Amal: ${raw}`;
}

function entityLabel(entity: string): string {
  const e = String(entity || "").trim();
  if (e === "order") return "Buyurtma";
  if (e === "product") return "Mahsulot";
  if (e === "product_stock") return "Ombor";
  if (e === "branch") return "Filial";
  if (e === "admin_user") return "Admin";
  return e || "—";
}

function objectPrimary(row: {
  entity?: string;
  metadata?: Record<string, unknown>;
}): { primary: string; secondary?: string } {
  const meta = scrubMeta(row.metadata);
  const entity = String(row.entity || "");

  if (entity === "order") {
    if (meta.orderCode != null && String(meta.orderCode).trim()) {
      return { primary: String(meta.orderCode), secondary: meta.orderId != null ? `ID ${meta.orderId}` : undefined };
    }
    if (meta.orderId != null) return { primary: `Buyurtma #${meta.orderId}` };
    return { primary: "Buyurtma" };
  }
  if (entity === "product") {
    if (meta.sku != null && String(meta.sku).trim()) {
      return { primary: String(meta.sku), secondary: meta.productId != null ? `ID ${meta.productId}` : undefined };
    }
    if (meta.productId != null) return { primary: `Mahsulot #${meta.productId}` };
    return { primary: "Mahsulot" };
  }
  if (entity === "product_stock") {
    const bits = [];
    if (meta.productId != null) bits.push(`mahsulot #${meta.productId}`);
    if (meta.branchId != null) bits.push(`filial #${meta.branchId}`);
    return { primary: bits.length ? bits.join(" · ") : "Ombor" };
  }
  if (entity === "branch") {
    if (meta.id != null) return { primary: `Filial #${meta.id}` };
    if (meta.branchId != null) return { primary: `Filial #${meta.branchId}` };
    return { primary: "Filial" };
  }
  if (entity === "admin_user") {
    if (meta.adminId != null) return { primary: `Admin #${meta.adminId}` };
    return { primary: "Admin" };
  }
  return { primary: entityLabel(entity) };
}

function formatMetaValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Ha" : "Yo‘q";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  try {
    const s = JSON.stringify(value);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(value);
  }
}

/** Prefer readable labels for known metadata keys. */
function metaKeyLabel(key: string): string {
  const map: Record<string, string> = {
    orderId: "Buyurtma ID",
    orderCode: "Buyurtma kodi",
    productId: "Mahsulot ID",
    branchId: "Filial ID",
    adminId: "Admin ID",
    sku: "SKU",
    from: "Oldingi holat",
    to: "Yangi holat",
    reason: "Sabab",
    physicalDelta: "Fizik o‘zgarish",
    paymentStatus: "To‘lov holati",
    fulfillmentStatus: "Bajarish holati",
    mode: "Rejim",
    role: "Rol",
    receiptId: "Chek",
    amount: "Summa",
    idempotent: "Idempotent",
    adjusted: "Tuzatildi",
    wasPaid: "To‘langan edi",
    paymentRefundRequired: "Refund talab",
    customerId: "Mijoz ID",
    earnReversalAmount: "Earn qaytarish",
    reversalAmount: "Qaytarish summasi",
  };
  return map[key] || key;
}

export function AuditPage(props: {
  token: string;
  branches?: any[];
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionDraft, setActionDraft] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const branchMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of props.branches || []) {
      m.set(String(b.id), String(b.name || `Filial #${b.id}`));
    }
    return m;
  }, [props.branches]);

  function branchName(id: unknown): string {
    if (id == null || id === "") return "—";
    return branchMap.get(String(id)) || `Filial #${id}`;
  }

  async function load(opts?: { offset?: number; action?: string; entity?: string }) {
    const nextOffset = opts?.offset ?? 0;
    const nextAction = opts?.action ?? action;
    const nextEntity = opts?.entity ?? entity;
    const qs = new URLSearchParams();
    qs.set("limit", String(AUDIT_PAGE));
    qs.set("offset", String(nextOffset));
    if (nextAction.trim()) qs.set("action", nextAction.trim());
    if (nextEntity.trim()) qs.set("entity", nextEntity.trim());
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/audit?${qs}`, props.token);
      setRows(Array.isArray(data?.audit) ? data.audit : []);
      setTotal(Number(data?.pagination?.total || 0));
      setHasMore(Boolean(data?.pagination?.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(errText(err, "Audit ma'lumotlarini yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, action, entity]);

  function applyActionFilter() {
    setAction(actionDraft.trim());
  }

  function resetFilters() {
    setActionDraft("");
    setAction("");
    setEntity("");
  }

  const hasFilters = Boolean(action.trim() || entity.trim());
  const selectedMeta = selected ? scrubMeta(selected.metadata) : {};
  const selectedObj = selected ? objectPrimary(selected) : null;

  const contextParts = useMemo(() => {
    if (!selected) return { primary: [] as Array<{ key: string; label: string; value: string }>, rest: [] as string[] };
    const meta = scrubMeta(selected.metadata);
    const preferred = [
      "orderCode",
      "orderId",
      "productId",
      "sku",
      "branchId",
      "from",
      "to",
      "reason",
      "physicalDelta",
      "paymentStatus",
      "fulfillmentStatus",
      "mode",
      "role",
      "receiptId",
      "amount",
      "idempotent",
      "adjusted",
    ];
    const shown = new Set<string>();
    const primary: Array<{ key: string; label: string; value: string }> = [];
    for (const k of preferred) {
      if (!(k in meta)) continue;
      shown.add(k);
      let value = formatMetaValue(meta[k]);
      if (k === "branchId") value = branchName(meta[k]);
      if ((k === "from" || k === "to" || k === "fulfillmentStatus") && typeof meta[k] === "string") {
        const lab = fulfillmentLabel(String(meta[k]));
        if (lab) value = lab;
      }
      primary.push({ key: k, label: metaKeyLabel(k), value });
    }
    return { primary, rest: Object.keys(meta).filter((k) => !shown.has(k)) };
  }, [selected, branchMap]);

  return (
    <div className="audit-page page-module">
      <AdminPageHeader
        title="Audit"
        description={PAGE_DESCRIPTIONS.audit}
        actions={
          <button
            className="btn-tertiary"
            type="button"
            disabled={loading}
            onClick={() => void load({ offset })}
          >
            Yangilash
          </button>
        }
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Amal">
            <input
              value={actionDraft}
              onChange={(e) => setActionDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyActionFilter();
                }
              }}
              placeholder="masalan order. yoki inventory."
              aria-label="Amal"
            />
          </FilterField>
          <FilterField label="Obyekt">
            <select
              value={entity}
              aria-label="Obyekt"
              onChange={(e) => setEntity(e.target.value)}
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FilterField>
          <div className="crm-controls-actions">
            <button className="btn-primary" type="button" disabled={loading} onClick={applyActionFilter}>
              Qo‘llash
            </button>
            {hasFilters ? (
              <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
                Tozalash
              </button>
            ) : null}
          </div>
        </div>
        <p className="meta crm-controls-note">
          Amal — qisman moslash (server). Obyekt — aniq moslash. Sana / filial / operator filtrlari API da yo‘q.
        </p>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load({ offset })} /> : null}
      {loading && rows.length === 0 && !error ? <LoadingBlock rows={4} /> : null}

      {!error && (rows.length > 0 || (!loading && rows.length === 0)) ? (
        <>
          <div className="crm-context">
            <span className="crm-result-count">
              {total > 0 ? `${total} ta qayd` : `${rows.length} ta qayd`}
            </span>
            {hasFilters ? <span className="crm-context-hint">Filtrlangan</span> : null}
          </div>

          <div className="crm-surface surface-table">
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Operator</th>
                  <th>Amal</th>
                  <th>Obyekt</th>
                  <th className="audit-col-branch">Filial</th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 ? (
                  <tr className="crm-empty-row">
                    <td colSpan={5}>
                      <div className="crm-empty">
                        <div className="empty-title">Audit qaydlari topilmadi</div>
                        <p className="empty-desc">
                          {hasFilters
                            ? "Tanlangan filtrlar bo‘yicha qayd mavjud emas."
                            : "Hozircha audit qaydlari yo‘q."}
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
                  rows.map((row) => {
                    const meta = scrubMeta(row.metadata);
                    const obj = objectPrimary(row);
                    const active = selected?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={`crm-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        onClick={() => setSelected(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(row);
                          }
                        }}
                      >
                        <td>
                          <div className="audit-time" title={fmtDate(row.createdAt)}>
                            {fmtDate(row.createdAt)}
                          </div>
                        </td>
                        <td>
                          <div className="crm-name">{row.actor || "Noma'lum operator"}</div>
                        </td>
                        <td>
                          <div className="crm-name">{actionLabel(row.action)}</div>
                          <div className="meta audit-action-raw">{row.action}</div>
                        </td>
                        <td>
                          <div className="crm-name">{obj.primary}</div>
                          <div className="meta">{entityLabel(row.entity)}</div>
                        </td>
                        <td className="audit-col-branch">
                          {meta.branchId != null ? branchName(meta.branchId) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
            {total > 0 || hasMore || offset > 0 ? (
              <PaginationBar
                offset={offset}
                limit={AUDIT_PAGE}
                total={total}
                hasMore={hasMore}
                loading={loading}
                onPrev={() => void load({ offset: Math.max(0, offset - AUDIT_PAGE) })}
                onNext={() => void load({ offset: offset + AUDIT_PAGE })}
              />
            ) : null}
          </div>
        </>
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        title="Audit tafsiloti"
        subtitle={selected ? actionLabel(selected.action) : undefined}
        width="md"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <DrawerSection title="Amal">
              <dl className="crm-kv">
                <div>
                  <dt>Tavsif</dt>
                  <dd>{actionLabel(selected.action)}</dd>
                </div>
                <div>
                  <dt>Kod</dt>
                  <dd><span className="meta">{selected.action || "—"}</span></dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Operator">
              <dl className="crm-kv">
                <div>
                  <dt>Aktor</dt>
                  <dd>{selected.actor || "Noma'lum operator"}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Vaqt">
              <dl className="crm-kv">
                <div>
                  <dt>Yozilgan</dt>
                  <dd>{fmtDate(selected.createdAt)}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Obyekt">
              <dl className="crm-kv">
                <div>
                  <dt>Tur</dt>
                  <dd>{entityLabel(selected.entity)}</dd>
                </div>
                <div>
                  <dt>Belgi</dt>
                  <dd>{selectedObj?.primary || "—"}</dd>
                </div>
                {selectedObj?.secondary ? (
                  <div>
                    <dt>Texnik</dt>
                    <dd><span className="meta">{selectedObj.secondary}</span></dd>
                  </div>
                ) : null}
                {selectedMeta.branchId != null ? (
                  <div>
                    <dt>Filial</dt>
                    <dd>{branchName(selectedMeta.branchId)}</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            {contextParts.primary.length > 0 ? (
              <DrawerSection title="Kontekst">
                <dl className="crm-kv">
                  {contextParts.primary.map((r) => (
                    <div key={r.key}>
                      <dt>{r.label}</dt>
                      <dd>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </DrawerSection>
            ) : null}

            {contextParts.rest.length > 0 ? (
              <DrawerSection title="Texnik ma'lumotlar">
                <details className="audit-tech">
                  <summary>Qo‘shimcha maydonlar</summary>
                  <dl className="crm-kv">
                    {contextParts.rest.map((k) => (
                      <div key={k}>
                        <dt>{metaKeyLabel(k)}</dt>
                        <dd>{formatMetaValue(selectedMeta[k])}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </DrawerSection>
            ) : null}
          </>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
