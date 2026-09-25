import { useEffect, useMemo, useState } from "react";
import { request, money, fmtDate } from "../api";
import {
  StatusBadge,
  StatusLabelBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  DetailDrawer,
  DrawerSection,
  ConfirmDialog,
  FeedbackBanner,
  ErrorState,
  LoadingBlock,
  paymentLabel,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "To‘lovlar ro‘yxatini ko‘rish uchun ruxsat yo‘q.";
  if (status === 404) return "To‘lov topilmadi.";
  return err instanceof Error ? err.message : fallback;
}

/** Display-only provider labels — no invent beyond known tokens + calm formatting. */
function providerLabel(provider: string): string {
  const raw = String(provider || "").trim();
  if (!raw) return "—";
  const u = raw.toUpperCase();
  const map: Record<string, string> = {
    PAYME: "Payme",
    CLICK: "Click",
    CASH: "Naqd",
    CARD: "Karta",
    POS: "Kassa",
  };
  if (map[u]) return map[u];
  if (/^[A-Z0-9_]+$/.test(raw)) {
    return raw
      .split("_")
      .map((w) => (w ? w.charAt(0) + w.slice(1).toLowerCase() : ""))
      .filter(Boolean)
      .join(" ");
  }
  return raw;
}

export function PaymentsPage(props: {
  token: string;
  permissions: string[];
  branches?: any[];
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [branchFilter, setBranchFilter] = useState("");

  const [snapshot, setSnapshot] = useState<any>(null);
  const [legacy, setLegacy] = useState<any>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMsg, setRefundMsg] = useState("");
  const [confirmRefund, setConfirmRefund] = useState(false);

  const canManage = props.permissions.includes("payments:manage");
  const branches = Array.isArray(props.branches) ? props.branches : [];
  const hasFilters = Boolean(provider || status || branchFilter);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin/payments", props.token);
      setRows(Array.isArray(data?.payments) ? data.payments : []);
    } catch (err) {
      setRows([]);
      setError(errText(err, "To‘lovlarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const providers = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.provider) set.add(String(r.provider));
    return Array.from(set).sort();
  }, [rows]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(String(r.status));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((item) => {
      if (provider && String(item.provider) !== provider) return false;
      if (status && String(item.status) !== status) return false;
      if (branchFilter && String(item.branchId) !== branchFilter) return false;
      return true;
    });
  }, [rows, provider, status, branchFilter]);

  function branchName(id: unknown): string {
    if (id == null || id === "") return "—";
    const hit = branches.find((b) => Number(b.id) === Number(id));
    return hit?.name || `Filial #${id}`;
  }

  function resetFilters() {
    setProvider("");
    setStatus("");
    setBranchFilter("");
  }

  async function openIntent(intentId: number) {
    setSnapLoading(true);
    setSnapError("");
    setRefundMsg("");
    setSnapshot(null);
    setLegacy(null);
    try {
      const data = await request(`/api/admin/payments/intents/${intentId}`, props.token);
      setSnapshot(data);
    } catch (err) {
      setSnapError(errText(err, "To‘lov ochilmadi."));
    } finally {
      setSnapLoading(false);
    }
  }

  function openRow(item: any) {
    if (item?.paymentIntentId != null) {
      void openIntent(Number(item.paymentIntentId));
      return;
    }
    setSnapshot(null);
    setSnapError("");
    setRefundMsg("");
    setLegacy(item);
  }

  async function refund() {
    const intentId = Number(snapshot?.intent?.id);
    if (!intentId || refundBusy) return;
    setRefundBusy(true);
    setRefundMsg("");
    try {
      const data = await request(`/api/admin/payments/intents/${intentId}/refund`, props.token, {
        method: "POST",
        body: JSON.stringify({ reason: "admin_refund" }),
      });
      const pending = operatorCapabilityLabel("CONTRACT_PENDING");
      setRefundMsg(
        `Ichki refund yozuvi: ${paymentLabel(String(data?.refund?.status || "")) || "—"}. ` +
        `Provayder orqali pul qaytarish ${pending.toLowerCase()}. ` +
        "Cashback avtomatik teskari yozilmaydi." +
        (data?.idempotent ? " (takroriy so‘rov)" : ""),
      );
      setConfirmRefund(false);
      await openIntent(intentId);
      await load();
    } catch (err) {
      const st = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (st === 403) setRefundMsg("Ruxsat yo‘q.");
      else setRefundMsg(err instanceof Error ? err.message : "Refund bajarilmadi.");
      setConfirmRefund(false);
    } finally {
      setRefundBusy(false);
    }
  }

  const drawerOpen = Boolean(snapshot) || snapLoading || Boolean(snapError) || Boolean(legacy);
  const showSurface = !error && !(loading && rows.length === 0);
  const refundable = Number(snapshot?.refundableAmount || 0);
  const canRefund = canManage && refundable > 0;

  return (
    <div className="payments-page page-module">
      <AdminPageHeader
        title="To‘lovlar"
        description={PAGE_DESCRIPTIONS.payments}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Holat">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Holat">
              <option value="">Barchasi</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{paymentLabel(s)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="To‘lov usuli">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="To‘lov usuli">
              <option value="">Barchasi</option>
              {providers.map((p) => (
                <option key={p} value={p}>{providerLabel(p)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Filial">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Filial"
            >
              <option value="">Barchasi</option>
              {branches.length > 0
                ? branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>{b.name}</option>
                  ))
                : Array.from(new Set(rows.map((r) => r.branchId).filter((id) => id != null))).map((id) => (
                    <option key={String(id)} value={String(id)}>{branchName(id)}</option>
                  ))}
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
          Filtrlar yuklangan ro‘yxatga qo‘llanadi.
        </p>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? <LoadingBlock rows={3} /> : null}

      {!error && !loading ? (
        <div className="crm-context">
          <span className="crm-result-count">{filtered.length} ta to‘lov</span>
          {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
        </div>
      ) : null}

      {showSurface ? (
        <div className="crm-surface surface-table">
          <DataTable sticky>
            <thead>
              <tr>
                <th>Buyurtma</th>
                <th>Filial</th>
                <th>Usul</th>
                <th>Holat</th>
                <th className="num">Summa</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="crm-empty-row">
                  <td colSpan={5}>
                    <div className="crm-empty">
                      <div className="empty-title">To‘lovlar topilmadi</div>
                      <p className="empty-desc">
                        {hasFilters
                          ? "Bu filtrlar bo‘yicha to‘lov topilmadi."
                          : "Hozircha to‘lovlar mavjud emas."}
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
                  const active =
                    (snapshot?.intent?.id != null && Number(item.paymentIntentId) === Number(snapshot.intent.id))
                    || (legacy?.id != null && legacy.id === item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`crm-row${active ? " is-active" : ""}`}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => openRow(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openRow(item);
                        }
                      }}
                    >
                      <td>
                        <div className="crm-name">
                          {item.orderId != null ? `#${item.orderId}` : "—"}
                        </div>
                        {item.paymentIntentId == null ? (
                          <div className="meta">Eski yozuv</div>
                        ) : null}
                      </td>
                      <td>{branchName(item.branchId)}</td>
                      <td>{providerLabel(item.provider)}</td>
                      <td>
                        <StatusLabelBadge domain="payment" status={item.status || ""} />
                      </td>
                      <td className="num money-md">{money(Number(item.amount || 0))}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
        </div>
      ) : null}

      <DetailDrawer
        open={drawerOpen}
        width="lg"
        title={
          snapshot?.intent
            ? `Buyurtma #${snapshot.intent.orderId ?? "—"}`
            : legacy
              ? `Buyurtma #${legacy.orderId ?? "—"}`
              : "To‘lov"
        }
        subtitle={
          snapshot?.intent
            ? `${providerLabel(snapshot.intent.provider)} · ${branchName(snapshot.intent.branchId)}`
            : legacy
              ? `${providerLabel(legacy.provider)} · ${branchName(legacy.branchId)}`
              : undefined
        }
        status={
          snapshot?.intent ? (
            <StatusLabelBadge domain="payment" status={snapshot.intent.status || ""} />
          ) : legacy ? (
            <StatusLabelBadge domain="payment" status={legacy.status || ""} />
          ) : undefined
        }
        onClose={() => {
          setSnapshot(null);
          setLegacy(null);
          setRefundMsg("");
          setSnapError("");
        }}
        footer={
          snapshot && canRefund ? (
            <button
              className="btn-danger"
              type="button"
              disabled={refundBusy}
              onClick={() => setConfirmRefund(true)}
            >
              Ichki refund
            </button>
          ) : snapshot && canManage ? (
            <span className="meta">Qaytarish hozircha mavjud emas.</span>
          ) : snapshot && !canManage ? (
            <span className="meta">Refund uchun ruxsat yo‘q.</span>
          ) : null
        }
      >
        {snapLoading ? <LoadingBlock rows={2} label="Yuklanmoqda…" /> : null}
        {snapError ? <ErrorState message={snapError} /> : null}

        {legacy && !snapshot ? (
          <>
            <DrawerSection title="To‘lov">
              <dl className="crm-kv">
                <div>
                  <dt>Summa</dt>
                  <dd className="money-md">{money(Number(legacy.amount || 0))}</dd>
                </div>
                <div>
                  <dt>Holat</dt>
                  <dd>
                    <StatusLabelBadge domain="payment" status={legacy.status || ""} />
                  </dd>
                </div>
                <div>
                  <dt>Usul</dt>
                  <dd>{providerLabel(legacy.provider)}</dd>
                </div>
                {legacy.currency ? (
                  <div>
                    <dt>Valyuta</dt>
                    <dd>{legacy.currency}</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>
            <DrawerSection title="Buyurtma">
              <dl className="crm-kv">
                <div>
                  <dt>Buyurtma</dt>
                  <dd>{legacy.orderId != null ? `#${legacy.orderId}` : "—"}</dd>
                </div>
                <div>
                  <dt>Filial</dt>
                  <dd>{branchName(legacy.branchId)}</dd>
                </div>
              </dl>
              <p className="meta">Bu eski to‘lov yozuvi — batafsil intent yo‘q.</p>
            </DrawerSection>
          </>
        ) : null}

        {snapshot?.intent ? (
          <>
            <DrawerSection title="To‘lov">
              <dl className="crm-kv">
                <div>
                  <dt>Summa</dt>
                  <dd className="money-md">{money(Number(snapshot.intent.amount || 0))}</dd>
                </div>
                <div>
                  <dt>Holat</dt>
                  <dd>
                    <StatusLabelBadge domain="payment" status={snapshot.intent.status || ""} />
                  </dd>
                </div>
                <div>
                  <dt>Usul</dt>
                  <dd>{providerLabel(snapshot.intent.provider)}</dd>
                </div>
                {snapshot.intent.currency ? (
                  <div>
                    <dt>Valyuta</dt>
                    <dd>{snapshot.intent.currency}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Yaratilgan</dt>
                  <dd>{fmtDate(snapshot.intent.createdAt)}</dd>
                </div>
                {snapshot.intent.updatedAt ? (
                  <div>
                    <dt>Yangilangan</dt>
                    <dd>{fmtDate(snapshot.intent.updatedAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Buyurtma">
              <dl className="crm-kv">
                <div>
                  <dt>Buyurtma</dt>
                  <dd>{snapshot.intent.orderId != null ? `#${snapshot.intent.orderId}` : "—"}</dd>
                </div>
                <div>
                  <dt>Filial</dt>
                  <dd>{branchName(snapshot.intent.branchId)}</dd>
                </div>
                <div>
                  <dt>Buyurtma to‘lovi</dt>
                  <dd>
                    <StatusLabelBadge
                      domain="payment"
                      status={snapshot.orderPaymentStatus || snapshot.axes?.paymentStatus || ""}
                    />
                  </dd>
                </div>
              </dl>
              <p className="meta">Buyurtma to‘lov o‘qi — fulfillment holatidan alohida.</p>
            </DrawerSection>

            {snapshot.capture ? (
              <DrawerSection title="Qabul qilingan">
                <dl className="crm-kv">
                  <div>
                    <dt>Summa</dt>
                    <dd>{money(Number(snapshot.capture.amount || 0))}</dd>
                  </div>
                  <div>
                    <dt>Vaqt</dt>
                    <dd>{fmtDate(snapshot.capture.capturedAt)}</dd>
                  </div>
                </dl>
              </DrawerSection>
            ) : null}

            <DrawerSection title="Qaytarish">
              <dl className="crm-kv">
                <div>
                  <dt>Qaytarish mumkin</dt>
                  <dd>{money(refundable)}</dd>
                </div>
              </dl>
              {Array.isArray(snapshot.refunds) && snapshot.refunds.length > 0 ? (
                <DataTable>
                  <thead>
                    <tr>
                      <th>Holat</th>
                      <th className="num">Summa</th>
                      <th>Sana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.refunds.map((r: any) => (
                      <tr key={r.id}>
                        <td>
                          <StatusLabelBadge domain="payment" status={r.status || ""} />
                        </td>
                        <td className="num">{money(Number(r.amount || 0))}</td>
                        <td className="meta">{fmtDate(r.createdAt || r.refundedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : (
                <p className="meta">Refund yozuvlari yo‘q.</p>
              )}
              <FeedbackBanner tone="warn">
                <StatusBadge tone="warn">{operatorCapabilityLabel("CONTRACT_PENDING")}</StatusBadge>{" "}
                Payme/Click orqali pul qaytarish. Ichki refund yozuvi mumkin; pul avtomatik qaytmaydi.
                Cashback avtomatik teskari yozilmaydi.
              </FeedbackBanner>
              {refundMsg ? <FeedbackBanner tone="info">{refundMsg}</FeedbackBanner> : null}
            </DrawerSection>

            <details className="payments-tech">
              <summary>Urinishlar</summary>
              {Array.isArray(snapshot.attempts) && snapshot.attempts.length ? (
                <DataTable>
                  <thead>
                    <tr>
                      <th>Usul</th>
                      <th>Holat</th>
                      <th>Tashqi havola</th>
                      <th>Vaqt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.attempts.map((a: any) => (
                      <tr key={a.id}>
                        <td>{providerLabel(a.provider)}</td>
                        <td>
                          <StatusLabelBadge domain="payment" status={a.status || ""} />
                        </td>
                        <td className="meta">{a.externalRef || "—"}</td>
                        <td className="meta">{fmtDate(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : (
                <p className="meta">Urinish yozuvlari yo‘q.</p>
              )}
            </details>
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmRefund}
        title="Ichki refund"
        danger
        busy={refundBusy}
        confirmLabel="Yuborish"
        cancelLabel="Qaytish"
        description={
          <>
            <div>Buyurtma #{snapshot?.intent?.orderId ?? "—"}</div>
            <div>Qaytarish mumkin: {money(refundable)}</div>
            <div className="meta">
              Provayder pul qaytarishi {operatorCapabilityLabel("CONTRACT_PENDING").toLowerCase()}.
              Cashback avtomatik teskari yozilmaydi.
            </div>
          </>
        }
        onCancel={() => setConfirmRefund(false)}
        onConfirm={() => void refund()}
      />
    </div>
  );
}
