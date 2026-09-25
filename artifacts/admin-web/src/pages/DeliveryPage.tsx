import { FormEvent, useEffect, useMemo, useState } from "react";
import { request, isHqRole, fmtDate, money, type AdminUser } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  DataTable,
  DetailDrawer,
  DrawerSection,
  ConfirmDialog,
  FeedbackBanner,
  ErrorState,
  LoadingBlock,
  PaginationBar,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

const PAGE_SIZE = 40;

const DELIVERY_STATUSES = [
  "pending",
  "assigned",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
  "failed",
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "Kutilmoqda",
  assigned: "Biriktirilgan",
  picked_up: "Olib ketildi",
  on_the_way: "Yo‘lda",
  delivered: "Yetkazildi",
  cancelled: "Bekor qilindi",
  failed: "Amal bajarilmadi",
};

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" | "info" {
  const s = String(status || "").toLowerCase();
  if (s === "delivered") return "ok";
  if (s === "cancelled" || s === "failed") return "danger";
  if (s === "pending") return "neutral";
  if (s === "on_the_way" || s === "picked_up") return "info";
  return "warn";
}

function statusLabel(status: string): string {
  return STATUS_LABELS[String(status || "").toLowerCase()] || String(status || "—");
}

function providerLabel(provider: unknown, mode: unknown): string {
  const p = String(provider || "").trim().toLowerCase();
  if (!p || p === "none" || p === "internal") {
    return mode ? String(mode) : "Ichki";
  }
  if (p === "external") return "Tashqi xizmat";
  return String(provider);
}

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Yetkazib berishni ko‘rish uchun ruxsat yo‘q.";
  if (status === 404) return "Yetkazib berish ma’lumoti topilmadi.";
  return err instanceof Error ? err.message : fallback;
}

function actionError(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 403) return "Ruxsat yo‘q yoki filial doirasidan tashqari.";
  if (status === 404) return "Buyurtma yoki yetkazib berish topilmadi.";
  if (status === 409) return err instanceof Error ? err.message : "Holat o‘tishi ruxsat etilmagan.";
  return err instanceof Error ? err.message : fallback;
}

export function DeliveryPage(props: {
  token: string;
  user: AdminUser | null;
  branches: any[];
  onOpenOrder?: (orderId: number) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [externalNote, setExternalNote] = useState("");

  const [selected, setSelected] = useState<any | null>(null);
  const [courierName, setCourierName] = useState("");
  const [courierId, setCourierId] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [confirmStatus, setConfirmStatus] = useState(false);

  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const hasFilters = Boolean(branchId || statusFilter);

  async function load(opts?: {
    branchId?: string;
    status?: string;
    offset?: number;
  }) {
    const bid = opts?.branchId ?? branchId;
    const st = opts?.status ?? statusFilter;
    const nextOffset = opts?.offset ?? offset;
    const qs = new URLSearchParams();
    if (bid) qs.set("branchId", bid);
    if (st) qs.set("status", st);
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String(nextOffset));
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/deliveries?${qs}`, props.token);
      setRows(Array.isArray(data?.deliveries) ? data.deliveries : []);
      setTotal(Number(data?.total ?? data?.pagination?.total ?? 0));
      setHasMore(Boolean(data?.hasMore ?? data?.pagination?.hasMore));
      setOffset(nextOffset);
      if (data?.externalProvider) {
        setExternalNote(String(data.externalProvider));
      }
    } catch (err) {
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setError(errText(err, "Yetkazib berish ma’lumotlarini yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  function branchName(id: unknown): string {
    if (id == null || id === "") return "—";
    const hit = props.branches.find((b) => Number(b.id) === Number(id));
    return hit?.name || `Filial #${id}`;
  }

  function resetFilters() {
    setBranchId("");
    setStatusFilter("");
    void load({ branchId: "", status: "", offset: 0 });
  }

  function openRow(item: any) {
    setSelected(item);
    setCourierName(String(item.courierName || ""));
    setCourierId(item.courierId != null ? String(item.courierId) : "");
    setNextStatus("");
    setReason("");
    setMsg("");
    setSyncMsg("");
  }

  function closeDrawer() {
    setSelected(null);
    setMsg("");
    setSyncMsg("");
    setConfirmStatus(false);
  }

  async function assignCourier(event: FormEvent) {
    event.preventDefault();
    if (busy || !selected) return;
    const id = Number(selected.orderId);
    if (!Number.isFinite(id) || id <= 0) {
      setMsg("Buyurtma topilmadi.");
      return;
    }
    if (!courierName.trim()) {
      setMsg("Kuryer ismi majburiy.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = { courierName: courierName.trim() };
      if (courierId.trim()) body.courierId = Number(courierId.trim());
      const data = await request(`/api/deliveries/${id}/assign`, props.token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const next = data?.delivery
        ? { ...selected, ...data.delivery, orderCode: selected.orderCode, branchId: selected.branchId }
        : selected;
      setSelected(next);
      setMsg("Kuryer biriktirildi.");
      await load();
    } catch (err) {
      setMsg(actionError(err, "Biriktirish bajarilmadi."));
    } finally {
      setBusy(false);
    }
  }

  function requestStatusChange(event: FormEvent) {
    event.preventDefault();
    if (!selected || !nextStatus) {
      setMsg("Holat tanlanmagan.");
      return;
    }
    setConfirmStatus(true);
  }

  async function applyStatusChange() {
    if (busy || !selected) return;
    const id = Number(selected.orderId);
    setBusy(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = { status: nextStatus };
      if (reason.trim()) body.reason = reason.trim();
      if (courierName.trim()) body.courierName = courierName.trim();
      if (courierId.trim()) body.courierId = Number(courierId.trim());
      const data = await request(`/api/deliveries/${id}/status`, props.token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const next = data?.delivery
        ? { ...selected, ...data.delivery, orderCode: selected.orderCode, branchId: selected.branchId }
        : selected;
      setSelected(next);
      setMsg("Holat yangilandi.");
      setConfirmStatus(false);
      setNextStatus("");
      await load();
    } catch (err) {
      setMsg(actionError(err, "Holat o‘zgartirilmadi."));
      setConfirmStatus(false);
    } finally {
      setBusy(false);
    }
  }

  async function externalSync() {
    if (busy || !selected) return;
    const id = Number(selected.orderId);
    setBusy(true);
    setSyncMsg("");
    try {
      const data = await request(`/api/deliveries/${id}/external/sync`, props.token, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const raw = String(data?.contract || data?.status || data?.code || "CONTRACT_PENDING");
      setSyncMsg(
        `Tashqi xizmat: ${operatorCapabilityLabel(raw)}${data?.message ? ` — ${data.message}` : ""}`,
      );
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 501) {
        setSyncMsg("Yetkazib berish xizmati hali ulanmagan — sinxronizatsiya mavjud emas.");
      } else {
        setSyncMsg(actionError(err, "Tekshirib bo‘lmadi."));
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!selected) return;
    const next = rows.find((r) => Number(r.id) === Number(selected.id));
    if (next) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const countLabel = useMemo(() => {
    if (total > 0) return `${total} ta yetkazib berish`;
    return `${rows.length} ta yetkazib berish`;
  }, [total, rows.length]);

  return (
    <div className="delivery-page page-module">
      <AdminPageHeader
        title="Yetkazib berish"
        description={PAGE_DESCRIPTIONS.delivery}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="crm-controls">
        <div className="crm-controls-primary">
          {isHq ? (
            <FilterField label="Filial">
              <select
                value={branchId}
                aria-label="Filial"
                onChange={(e) => {
                  setBranchId(e.target.value);
                  void load({ branchId: e.target.value, offset: 0 });
                }}
              >
                <option value="">Barchasi</option>
                {props.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </FilterField>
          ) : (
            <FilterField label="Filial">
              <input value="O‘z filiali" disabled readOnly aria-label="Filial" />
            </FilterField>
          )}
          <FilterField label="Holat">
            <select
              value={statusFilter}
              aria-label="Holat"
              onChange={(e) => {
                setStatusFilter(e.target.value);
                void load({ status: e.target.value, offset: 0 });
              }}
            >
              <option value="">Barchasi</option>
              {DELIVERY_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
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
          Filial va holat serverda qo‘llanadi.
          {externalNote
            ? ` Tashqi yetkazib berish: ${operatorCapabilityLabel(externalNote).toLowerCase()}.`
            : null}
        </p>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? <LoadingBlock rows={3} /> : null}

      {!error && !(loading && rows.length === 0) ? (
        <>
          <div className="crm-context">
            <span className="crm-result-count">{countLabel}</span>
            {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
          </div>

          <div className="crm-surface surface-table">
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Buyurtma</th>
                  <th>Filial</th>
                  <th>Manzil</th>
                  <th>Holat</th>
                  <th className="delivery-col-courier">Kuryer</th>
                  <th className="delivery-col-window">Vaqt oynasi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="crm-empty-row">
                    <td colSpan={6}>
                      <div className="crm-empty">
                        <div className="empty-title">
                          {hasFilters ? "Yetkazib berishlar topilmadi" : "Yetkazib berishlar hozircha mavjud emas."}
                        </div>
                        <p className="empty-desc">
                          {hasFilters
                            ? "Tanlangan shartlar bo‘yicha natija mavjud emas."
                            : "Yetkazib berish yozuvlari paydo bo‘lganda shu yerda ko‘rinadi."}
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
                    const active = selected?.id === item.id;
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
                            {item.orderCode || (item.orderId != null ? `#${item.orderId}` : "—")}
                          </div>
                        </td>
                        <td>{branchName(item.branchId)}</td>
                        <td>
                          <div className="delivery-address">{item.address || "—"}</div>
                        </td>
                        <td>
                          <StatusBadge tone={statusTone(item.status)}>
                            {statusLabel(item.status)}
                          </StatusBadge>
                        </td>
                        <td className="delivery-col-courier">
                          {item.courierName
                            ? item.courierName
                            : <span className="meta">Biriktirilmagan</span>}
                        </td>
                        <td className="delivery-col-window">
                          {item.timeWindow
                            ? item.timeWindow
                            : <span className="meta">Aniqlanmagan</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
            {total > PAGE_SIZE || offset > 0 || hasMore ? (
              <PaginationBar
                offset={offset}
                limit={PAGE_SIZE}
                total={total}
                hasMore={hasMore}
                loading={loading}
                onPrev={() => void load({ offset: Math.max(0, offset - PAGE_SIZE) })}
                onNext={() => void load({ offset: offset + PAGE_SIZE })}
              />
            ) : null}
          </div>
        </>
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        width="lg"
        title={
          selected
            ? (selected.orderCode || (selected.orderId != null ? `Buyurtma #${selected.orderId}` : "Yetkazib berish"))
            : "Yetkazib berish"
        }
        subtitle={selected ? branchName(selected.branchId) : undefined}
        status={
          selected ? (
            <StatusBadge tone={statusTone(selected.status)}>
              {statusLabel(selected.status)}
            </StatusBadge>
          ) : undefined
        }
        onClose={closeDrawer}
      >
        {selected ? (
          <>
            <DrawerSection title="Buyurtma">
              <dl className="crm-kv">
                <div>
                  <dt>Kod</dt>
                  <dd>{selected.orderCode || (selected.orderId != null ? `#${selected.orderId}` : "—")}</dd>
                </div>
                <div>
                  <dt>Filial</dt>
                  <dd>{branchName(selected.branchId)}</dd>
                </div>
                {selected.deliveryFee != null ? (
                  <div>
                    <dt>Yetkazish to‘lovi</dt>
                    <dd>{money(Number(selected.deliveryFee || 0))}</dd>
                  </div>
                ) : null}
              </dl>
              {props.onOpenOrder && selected.orderId != null ? (
                <button
                  className="btn-tertiary"
                  type="button"
                  onClick={() => props.onOpenOrder?.(Number(selected.orderId))}
                >
                  Buyurtmani ko‘rish →
                </button>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Yetkazib berish">
              <dl className="crm-kv">
                <div>
                  <dt>Holat</dt>
                  <dd>{statusLabel(selected.status)}</dd>
                </div>
                <div>
                  <dt>Manzil</dt>
                  <dd>{selected.address || "—"}</dd>
                </div>
                <div>
                  <dt>Vaqt oynasi</dt>
                  <dd>
                    {selected.timeWindow
                      ? selected.timeWindow
                      : "Yetkazish vaqti hali aniqlanmagan."}
                  </dd>
                </div>
                <div>
                  <dt>Kuryer</dt>
                  <dd>
                    {selected.courierName
                      ? selected.courierName
                      : "Kuryer hali biriktirilmagan."}
                  </dd>
                </div>
                <div>
                  <dt>Yetkazish turi</dt>
                  <dd>{providerLabel(selected.provider, selected.mode)}</dd>
                </div>
              </dl>
              <p className="meta">Jonli kuzatuv mavjud emas.</p>
            </DrawerSection>

            <DrawerSection title="Vaqt belgilari">
              <dl className="crm-kv">
                {selected.assignedAt ? (
                  <div>
                    <dt>Biriktirildi</dt>
                    <dd>{fmtDate(selected.assignedAt)}</dd>
                  </div>
                ) : null}
                {selected.pickedUpAt ? (
                  <div>
                    <dt>Olib ketildi</dt>
                    <dd>{fmtDate(selected.pickedUpAt)}</dd>
                  </div>
                ) : null}
                {selected.outAt ? (
                  <div>
                    <dt>Yo‘lda</dt>
                    <dd>{fmtDate(selected.outAt)}</dd>
                  </div>
                ) : null}
                {selected.deliveredAt ? (
                  <div>
                    <dt>Yetkazildi</dt>
                    <dd>{fmtDate(selected.deliveredAt)}</dd>
                  </div>
                ) : null}
                {selected.cancelledAt ? (
                  <div>
                    <dt>Bekor</dt>
                    <dd>{fmtDate(selected.cancelledAt)}</dd>
                  </div>
                ) : null}
                {!selected.assignedAt && !selected.pickedUpAt && !selected.outAt
                  && !selected.deliveredAt && !selected.cancelledAt ? (
                  <div>
                    <dt>Belgilar</dt>
                    <dd className="meta">Hali yo‘q</dd>
                  </div>
                ) : null}
              </dl>
            </DrawerSection>

            <DrawerSection title="Kuryer biriktirish">
              <form className="delivery-form" onSubmit={assignCourier}>
                <label className="filter-field">
                  <span className="filter-label">Kuryer ismi *</span>
                  <input
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    aria-label="Kuryer ismi"
                    required
                  />
                </label>
                <label className="filter-field">
                  <span className="filter-label">Kuryer ID</span>
                  <input
                    value={courierId}
                    onChange={(e) => setCourierId(e.target.value)}
                    aria-label="Kuryer ID"
                    placeholder="Ixtiyoriy"
                  />
                </label>
                <div className="delivery-form-actions delivery-form-full">
                  <button className="btn-primary" type="submit" disabled={busy}>
                    Biriktirish
                  </button>
                </div>
              </form>
            </DrawerSection>

            <DrawerSection title="Holatni o‘zgartirish">
              <form className="delivery-form" onSubmit={requestStatusChange}>
                <label className="filter-field">
                  <span className="filter-label">Yangi holat</span>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    aria-label="Yangi holat"
                  >
                    <option value="">Tanlang</option>
                    {DELIVERY_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </label>
                <label className="filter-field">
                  <span className="filter-label">Sabab</span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-label="Sabab"
                    placeholder="Ixtiyoriy"
                  />
                </label>
                <div className="delivery-form-actions delivery-form-full">
                  <button className="btn-primary" type="submit" disabled={busy || !nextStatus}>
                    O‘tkazish…
                  </button>
                </div>
              </form>
            </DrawerSection>

            <DrawerSection title="Tashqi xizmat">
              <p className="meta">
                Yetkazib berish xizmati hali ulanmagan. Sinxronizatsiya mavjud emas.
              </p>
              <button className="btn-tertiary" type="button" disabled={busy} onClick={() => void externalSync()}>
                Ulanishni tekshirish
              </button>
              {syncMsg ? <FeedbackBanner tone="info">{syncMsg}</FeedbackBanner> : null}
            </DrawerSection>

            {msg ? (
              <FeedbackBanner tone={msg.includes("yangilandi") || msg.includes("biriktirildi") ? "ok" : "warn"}>
                {msg}
              </FeedbackBanner>
            ) : null}
          </>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmStatus}
        title="Holat o‘zgartirilsinmi?"
        busy={busy}
        confirmLabel="Tasdiqlash"
        cancelLabel="Qaytish"
        description={
          selected ? (
            <>
              <div>
                Buyurtma: {selected.orderCode || `#${selected.orderId}`}
              </div>
              <div>
                {statusLabel(selected.status)} → {statusLabel(nextStatus)}
              </div>
              {reason.trim() ? <div className="meta">Sabab: {reason.trim()}</div> : null}
            </>
          ) : null
        }
        onCancel={() => setConfirmStatus(false)}
        onConfirm={() => void applyStatusChange()}
      />
    </div>
  );
}
