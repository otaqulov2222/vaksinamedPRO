import { FormEvent, useEffect, useState } from "react";
import { request, isHqRole, fmtDate, type AdminUser } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

const DELIVERY_STATUSES = ["pending", "assigned", "picked_up", "on_the_way", "delivered", "cancelled", "failed"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Kutilmoqda",
  assigned: "Kuryer tayinlangan",
  picked_up: "Olib ketildi",
  on_the_way: "Yo‘lda",
  delivered: "Yetkazildi",
  cancelled: "Bekor qilindi",
  failed: "Muvaffaqiyatsiz",
};

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = String(status || "").toLowerCase();
  if (s === "delivered") return "ok";
  if (s === "cancelled" || s === "failed") return "danger";
  if (s === "pending") return "neutral";
  return "warn";
}

export function DeliveryPage(props: { token: string; user: AdminUser | null; branches: any[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [orderId, setOrderId] = useState("");
  const [courierName, setCourierName] = useState("");
  const [courierId, setCourierId] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [lastDelivery, setLastDelivery] = useState<any>(null);
  const [syncMsg, setSyncMsg] = useState("");

  const isHq = Boolean(props.user && isHqRole(props.user.role));

  async function load(opts?: { branchId?: string; status?: string }) {
    const bid = opts?.branchId ?? branchId;
    const st = opts?.status ?? statusFilter;
    const qs = new URLSearchParams();
    if (bid) qs.set("branchId", bid);
    if (st) qs.set("status", st);
    const suffix = qs.toString() ? `?${qs}` : "";
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/deliveries${suffix}`, props.token);
      setRows(Array.isArray(data?.deliveries) ? data.deliveries : []);
    } catch (err) {
      setRows([]);
      const st2 = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (st2 === 404) {
        setError(
          "Yetkazib berish ro‘yxati endpointi (/api/admin/deliveries) serverda hali mavjud emas. " +
          "Pastdagi amallar buyurtma ID bo‘yicha haqiqiy endpointlar orqali ishlaydi.",
        );
      } else if (st2 === 401) setError("Sessiya tugagan (401)");
      else if (st2 === 403) setError("Yetkazib berish uchun ruxsat yo‘q (delivery:update)");
      else setError(err instanceof Error ? err.message : "Ro‘yxat yuklanmadi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  function actionError(err: unknown, fallback: string) {
    const st = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
    if (st === 403) return "Ruxsat yo‘q (delivery:update yoki filial doirasi)";
    if (st === 404) return "Buyurtma yoki yetkazib berish topilmadi";
    return err instanceof Error ? err.message : fallback;
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const id = Number(orderId);
    if (!Number.isFinite(id) || id <= 0) {
      setMsg("Buyurtma ID kiritilmagan.");
      return;
    }
    if (!courierName.trim()) {
      setMsg("Kuryer ismi majburiy (courierName).");
      return;
    }
    setBusy(true);
    setMsg("");
    setSyncMsg("");
    try {
      const body: Record<string, unknown> = { courierName: courierName.trim() };
      if (courierId.trim()) body.courierId = Number(courierId.trim());
      const data = await request(`/api/deliveries/${id}/assign`, props.token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLastDelivery(data?.delivery || null);
      setMsg(`Kuryer tayinlandi: ${data?.delivery?.courierName || courierName.trim()} · holat ${data?.delivery?.status || "—"}`);
      await load();
    } catch (err) {
      setMsg(actionError(err, "Tayinlash bajarilmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const id = Number(orderId);
    if (!Number.isFinite(id) || id <= 0) {
      setMsg("Buyurtma ID kiritilmagan.");
      return;
    }
    if (!status) {
      setMsg("Holat tanlanmagan.");
      return;
    }
    if (!window.confirm(`Buyurtma #${id} yetkazib berish holati «${status}» ga o‘tkazilsinmi?`)) return;
    setBusy(true);
    setMsg("");
    setSyncMsg("");
    try {
      const body: Record<string, unknown> = { status };
      if (reason.trim()) body.reason = reason.trim();
      if (courierName.trim()) body.courierName = courierName.trim();
      if (courierId.trim()) body.courierId = Number(courierId.trim());
      const data = await request(`/api/deliveries/${id}/status`, props.token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLastDelivery(data?.delivery || null);
      setMsg(`Holat yangilandi: ${data?.delivery?.status || status}`);
      await load();
    } catch (err) {
      setMsg(actionError(err, "Holat o‘zgartirilmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function externalSync() {
    if (busy) return;
    const id = Number(orderId);
    if (!Number.isFinite(id) || id <= 0) {
      setSyncMsg("Buyurtma ID kiritilmagan.");
      return;
    }
    setBusy(true);
    setSyncMsg("");
    try {
      const data = await request(`/api/deliveries/${id}/external/sync`, props.token, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSyncMsg(
        `Tashqi provayder javobi: ${data?.contract || data?.status || data?.code || "CONTRACT_PENDING"}` +
        `${data?.message ? ` — ${data.message}` : ""}`,
      );
    } catch (err) {
      const st = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (st === 501) setSyncMsg("Tashqi provayder integratsiyasi CONTRACT_PENDING — sinxronizatsiya mavjud emas.");
      else setSyncMsg(actionError(err, "Sinxronizatsiya bajarilmadi"));
    } finally {
      setBusy(false);
    }
  }

  const branchName = (id: unknown) =>
    props.branches.find((b) => Number(b.id) === Number(id))?.name || (id != null ? `#${id}` : "—");

  return (
    <>
      <PageHeader
        title="Yetkazib berish"
        subtitle="Kuryer tayinlash va holat o‘tishlari server lifecycle qoidalari bo‘yicha. ETA hisoblanmaydi — faqat haqiqiy vaqt belgilari."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        {isHq ? (
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              void load({ branchId: e.target.value });
            }}
          >
            <option value="">Filial: barchasi</option>
            {props.branches.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        ) : (
          <span className="muted">Filial: o‘z filialingiz (server)</span>
        )}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            void load({ status: e.target.value });
          }}
        >
          <option value="">Holat: barchasi</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]} ({s})</option>
          ))}
        </select>
      </div>

      <StateBox
        loading={loading}
        error={error || null}
        empty={!loading && !error && rows.length === 0}
        emptyText="Yetkazib berish yozuvlari yo‘q."
      >
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Buyurtma</th>
                <th>Manzil</th>
                <th>Vaqt oynasi</th>
                <th>Holat</th>
                <th>Kuryer</th>
                <th>Provayder</th>
                <th>Belgilar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.orderCode || (item.orderId != null ? `#${item.orderId}` : "—")}
                    {item.branchId != null ? <div className="muted">{branchName(item.branchId)}</div> : null}
                  </td>
                  <td>{item.address || "—"}</td>
                  <td>{item.timeWindow || "—"}</td>
                  <td>
                    <Badge tone={statusTone(item.status)}>{STATUS_LABELS[item.status] || item.status}</Badge>
                    <div className="muted" style={{ fontSize: 11 }}>{item.status}</div>
                  </td>
                  <td>
                    {item.courierName || <span className="muted">tayinlanmagan</span>}
                    {item.courierId != null ? <div className="muted">id {item.courierId}</div> : null}
                  </td>
                  <td>
                    {item.provider || "—"}
                    {item.mode ? <div className="muted">{item.mode}</div> : null}
                    {item.providerRef ? <div className="muted">{item.providerRef}</div> : null}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {item.assignedAt ? <div>tayinlandi: {fmtDate(item.assignedAt)}</div> : null}
                    {item.pickedUpAt ? <div>olindi: {fmtDate(item.pickedUpAt)}</div> : null}
                    {item.outAt ? <div>yo‘lda: {fmtDate(item.outAt)}</div> : null}
                    {item.deliveredAt ? <div>yetkazildi: {fmtDate(item.deliveredAt)}</div> : null}
                    {item.cancelledAt ? <div>bekor: {fmtDate(item.cancelledAt)}</div> : null}
                  </td>
                  <td>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => {
                        setOrderId(String(item.orderId ?? ""));
                        setCourierName(String(item.courierName || ""));
                        setCourierId(item.courierId != null ? String(item.courierId) : "");
                        setStatus("");
                        setMsg("");
                        setSyncMsg("");
                      }}
                    >
                      Amallar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateBox>

      <form className="card" style={{ marginTop: 16 }} onSubmit={assign}>
        <h2>Kuryer tayinlash</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          <code>POST /api/deliveries/:orderId/assign</code> — filial doirasi va lifecycle serverda tekshiriladi.
        </p>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Buyurtma ID" />
          <input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="Kuryer ismi (majburiy)" />
          <input value={courierId} onChange={(e) => setCourierId(e.target.value)} placeholder="Kuryer ID (ixtiyoriy)" />
          <button className="primary" type="submit" disabled={busy}>Tayinlash</button>
        </div>
      </form>

      <form className="card" style={{ marginTop: 16 }} onSubmit={changeStatus}>
        <h2>Holatni o‘zgartirish</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          <code>POST /api/deliveries/:orderId/status</code> — ruxsat etilmagan o‘tish serverda rad etiladi.
        </p>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Holat tanlang</option>
            {DELIVERY_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]} ({s})</option>
            ))}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sabab (ixtiyoriy)" />
          <button className="primary" type="submit" disabled={busy}>O‘tkazish</button>
        </div>
      </form>

      {msg ? <p className="muted">{msg}</p> : null}

      {lastDelivery ? (
        <div className="card">
          <h2>Oxirgi server javobi</h2>
          <p>
            Buyurtma #{lastDelivery.orderId} ·{" "}
            <Badge tone={statusTone(lastDelivery.status)}>{STATUS_LABELS[lastDelivery.status] || lastDelivery.status}</Badge>
          </p>
          <p className="muted">
            Kuryer: {lastDelivery.courierName || "—"} · provayder: {lastDelivery.provider || "—"} · rejim:{" "}
            {lastDelivery.mode || "—"} · manzil: {lastDelivery.address || "—"} · vaqt oynasi:{" "}
            {lastDelivery.timeWindow || "—"}
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            Yetkazib berish vaqti prognozi (ETA) tizimda hisoblanmaydi — faqat server yozgan vaqt belgilari ko‘rsatiladi.
          </p>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Tashqi provayder sinxronizatsiyasi</h2>
        <p>
          <Badge tone="warn">CONTRACT_PENDING</Badge>
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          <code>POST /api/deliveries/:orderId/external/sync</code> — tashqi kuryer xizmati shartnomasi hali yo‘q,
          shuning uchun server ochiq-oydin CONTRACT_PENDING qaytaradi. Hech qanday holat taxmin qilinmaydi.
        </p>
        <div className="toolbar">
          <button className="ghost" type="button" disabled={busy} onClick={() => void externalSync()}>
            Sinxronizatsiyani tekshirish
          </button>
        </div>
        {syncMsg ? <p className="muted">{syncMsg}</p> : null}
      </div>
    </>
  );
}
