import { useEffect, useState } from "react";
import { request } from "../api";
import { StateBox, Badge, PageHeader } from "../ui";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan (401)";
  if (status === 403) return "FOM holati uchun ruxsat yo‘q";
  return err instanceof Error ? err.message : fallback;
}

export function FomPage(props: { token: string }) {
  const [fom, setFom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/integrations/fom/status", props.token);
      setFom(data);
    } catch (err) {
      setFom(null);
      setError(errText(err, "FOM holati yuklanmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();  }, [props.token]);

  const inventoryWriter = String(fom?.inventoryWriter || "OFF").toUpperCase();
  const writerEnabled = fom?.fomInventoryWriterEnabled === true;

  return (
    <>
      <PageHeader
        title="FOM adapter"
        subtitle="Integratsiya holati. Kunlik ish stoli bu sahifa emas — chap menyudagi «Kassa POS»."
        actions={
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <StateBox loading={loading} error={error || null} empty={!fom} emptyText="FOM holati mavjud emas.">
        <div className="kpis">
          <div className="card">
            <div className="muted">Integratsiya holati</div>
            <h2>
              <Badge tone={fom?.ready === true ? "ok" : "warn"}>
                {fom?.status || fom?.fomPosContract || "CONTRACT_PENDING"}
              </Badge>
            </h2>
            <div className="muted" style={{ fontSize: 11 }}>
              ready={String(fom?.ready)} · rejim: {fom?.mode || "—"}
            </div>
          </div>
          <div className="card">
            <div className="muted">Ombor yozuvchisi</div>
            <h2>
              <Badge tone={inventoryWriter === "OFF" && !writerEnabled ? "ok" : "danger"}>{inventoryWriter}</Badge>
            </h2>
            <div className="muted" style={{ fontSize: 11 }}>
              {writerEnabled
                ? "ENABLED — kutilmagan holat, ombor yozuvi o‘chirilgan bo‘lishi kerak"
                : "disabled — FOM ombor sonini yozmaydi"}
            </div>
          </div>
          <div className="card">
            <div className="muted">FOM_POS shartnomasi</div>
            <h2>
              <Badge tone="warn">{fom?.fomPosContract || "CONTRACT_PENDING"}</Badge>
            </h2>
            <div className="muted" style={{ fontSize: 11 }}>
              barqaror tashqi chek identifikatori yo‘q — o‘ylab topilmaydi
            </div>
          </div>
          <div className="card">
            <div className="muted">Provayder</div>
            <h2 style={{ fontSize: 18 }}>{fom?.provider || "—"}</h2>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h2>Tijorat identifikatori</h2>
          <p className="muted">
            confirm-pos → <b>{fom?.commercialIdentity?.confirmPos || "ORDER"}</b> (
            {fom?.commercialIdentity?.sourceKeyPattern || "order:{orders.id}"})
          </p>
          {fom?.commercialIdentity?.note ? <p className="muted" style={{ fontSize: 12 }}>{fom.commercialIdentity.note}</p> : null}
          {fom?.openDependency ? (
            <p className="muted" style={{ fontSize: 12 }}>Ochiq bog‘liqlik: {fom.openDependency}</p>
          ) : null}
          {fom?.note ? <p className="muted" style={{ fontSize: 12 }}>{fom.note}</p> : null}
        </div>

        {fom?.role ? (
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Rollar taqsimi</h2>
            <table className="table">
              <tbody>
                <tr><td>FOM</td><td>{fom.role.fom || "—"}</td></tr>
                <tr><td>Ilova</td><td>{fom.role.app || "—"}</td></tr>
                <tr><td>Ko‘prik</td><td>{fom.role.bridge || "—"}</td></tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {fom?.endpoints ? (
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Endpointlar</h2>
            <table className="table">
              <tbody>
                {Object.entries(fom.endpoints as Record<string, unknown>).map(([key, value]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td><code style={{ fontSize: 12 }}>{String(value)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12 }}>
              Autentifikatsiya: {fom?.auth || "—"}. Maxfiy kalitlar admin panelda ko‘rsatilmaydi.
            </p>
          </div>
        ) : null}

        {fom?.cashback ? (
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Cashback qoidalari (server)</h2>
            <code style={{ fontSize: 12 }}>{JSON.stringify(fom.cashback)}</code>
          </div>
        ) : null}
      </StateBox>
    </>
  );
}
