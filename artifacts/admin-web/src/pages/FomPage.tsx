import { useEffect, useState } from "react";
import { request } from "../api";
import {
  AdminPageHeader,
  StatusBadge,
  ErrorState,
  LoadingBlock,
  FeedbackBanner,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "FOM holati uchun ruxsat yo‘q.";
  return err instanceof Error ? err.message : fallback;
}

/** Operator label for FOM contract codes — keep raw in title for honesty. */
function fomStateLabel(raw: string): string {
  const c = String(raw || "").toUpperCase();
  if (c.includes("CONTRACT_PENDING")) return "Hali ulanmagan";
  if (c === "OFF" || c === "DISABLED") return "O‘chirilgan";
  return operatorCapabilityLabel(raw);
}

/**
 * FOM integration console.
 * Only GET /api/integrations/fom/status is used from Admin UI.
 * No invent probe/retry/sync/KPI. Webhook sale is external (not this page).
 */
export function FomPage(props: { token: string }) {
  const [fom, setFom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTech, setShowTech] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/integrations/fom/status", props.token);
      setFom(data && typeof data === "object" ? data : null);
    } catch (err) {
      setFom(null);
      setError(errText(err, "FOM ma'lumotlarini yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const inventoryWriter = String(fom?.inventoryWriter || "OFF").toUpperCase();
  const writerEnabled = fom?.fomInventoryWriterEnabled === true;
  const writerOff = inventoryWriter === "OFF" && !writerEnabled;
  const statusRaw = String(fom?.status || "CONTRACT_PENDING");
  const posContractRaw = String(fom?.fomPosContract || "CONTRACT_PENDING");
  const ready = fom?.ready === true;
  const confirmPos = String(fom?.commercialIdentity?.confirmPos || "ORDER");
  const sourceKey = String(fom?.commercialIdentity?.sourceKeyPattern || "order:{orders.id}");

  return (
    <div className="fom-page page-module">
      <AdminPageHeader
        title="FOM"
        description={PAGE_DESCRIPTIONS.fom}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <FeedbackBanner tone="info">
        Kodda FOM ko‘prigi bor. Production aktivatsiya va tashqi kontrakt — alohida.
        Bu sahifa soxta “ulangan” holat yaratmaydi.
      </FeedbackBanner>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !fom && !error ? <LoadingBlock rows={3} /> : null}

      {!error && !loading && !fom ? (
        <div className="crm-empty crm-empty-idle">
          <div className="empty-title">FOM operatsiyalari mavjud emas.</div>
          <p className="empty-desc">Integratsiya holati yuklanmadi.</p>
        </div>
      ) : null}

      {!error && fom ? (
        <>
          <section className="settings-section" aria-labelledby="fom-state-title">
            <div className="settings-section-head">
              <h2 id="fom-state-title" className="settings-section-title">Integratsiya holati</h2>
              <p className="meta settings-section-lead">
                Server holati. Kod mavjudligi production ulanishini anglatmaydi.
              </p>
            </div>
            <div className="settings-surface">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Umumiy holat</div>
                  <p className="meta settings-row-desc">
                    {ready
                      ? "Server tayyor deb bildirmoqda."
                      : "FOM bo‘yicha kerakli tashqi kontrakt hali tasdiqlanmagan."}
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone={ready ? "ok" : "warn"} title={statusRaw}>
                    {fomStateLabel(statusRaw)}
                  </StatusBadge>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Provayder</div>
                  <p className="meta settings-row-desc">{fom.provider || "—"}</p>
                </div>
                <div className="settings-row-aside">
                  <span className="meta">{fom.mode ? String(fom.mode) : "—"}</span>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Production tayyorligi</div>
                  <p className="meta settings-row-desc">
                    {ready ? "Tayyor" : "Server tayyor emas deb bildirmoqda"}
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone={ready ? "ok" : "neutral"}>
                    {ready ? "Tayyor" : "Tayyor emas"}
                  </StatusBadge>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="fom-inventory-title">
            <div className="settings-section-head">
              <h2 id="fom-inventory-title" className="settings-section-title">Inventar chegarasi</h2>
              <p className="meta settings-section-lead">
                FOM inventar yozuvchisi production gate bilan o‘chirilgan.
              </p>
            </div>
            <div className="settings-surface">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">FOM inventar yozuvi</div>
                  <p className="meta settings-row-desc">
                    {writerOff
                      ? "FOM’dan inventar yozish production rejimida hali yoqilmagan. Bu xavfsizlik — xato emas."
                      : "Diqqat: yozuv holati OFF emas."}
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge
                    tone={writerOff ? "ok" : "danger"}
                    title={String(fom.inventoryWriter || "OFF")}
                  >
                    {writerOff ? "O‘chirilgan" : fomStateLabel(inventoryWriter)}
                  </StatusBadge>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Tashqi ombor sinxronlash</div>
                  <p className="meta settings-row-desc">
                    Sync / last-sync / foiz ko‘rsatkichlari yo‘q — API yo‘q.
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone="warn">{operatorCapabilityLabel("NOT_SUPPORTED")}</StatusBadge>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="fom-sale-title">
            <div className="settings-section-head">
              <h2 id="fom-sale-title" className="settings-section-title">Savdo / POS chegarasi</h2>
              <p className="meta settings-section-lead">
                Cashback manbalari: ORDER · POS · FOM_POS (rezerv).
              </p>
            </div>
            <div className="settings-surface">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">FOM POS</div>
                  <p className="meta settings-row-desc">
                    Tashqi chek identifikatori barqaror emas. FOM_POS hali ulanmagan —
                    soxta receipt yaratilmaydi.
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone="warn" title={posContractRaw}>
                    {fomStateLabel(posContractRaw)}
                  </StatusBadge>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">confirm-pos tijorat identifikatori</div>
                  <p className="meta settings-row-desc">
                    Savdo tasdiqlash: <strong>{confirmPos}</strong>
                    {" · "}
                    <code className="fom-code">{sourceKey}</code>
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone="neutral">Faqat ko‘rish</StatusBadge>
                </div>
              </div>
              {fom.commercialIdentity?.note ? (
                <div className="settings-row">
                  <div className="settings-row-main">
                    <div className="settings-row-label">Izoh</div>
                    <p className="meta settings-row-desc">{String(fom.commercialIdentity.note)}</p>
                  </div>
                </div>
              ) : null}
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Tashqi FOM webhook</div>
                  <p className="meta settings-row-desc">
                    FOM tizimi chek yopganda chaqiradi. Admin panelda probe / Sync now yo‘q.
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone="info">Tashqi</StatusBadge>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="fom-actions-title">
            <div className="settings-section-head">
              <h2 id="fom-actions-title" className="settings-section-title">Operator amallari</h2>
              <p className="meta settings-section-lead">
                Faqat haqiqiy Admin imkoniyatlari.
              </p>
            </div>
            <div className="settings-surface">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Holatni yangilash</div>
                  <p className="meta settings-row-desc">
                    Yuqoridagi Yangilash tugmasi orqali server statusini qayta o‘qiydi.
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone="ok">{operatorCapabilityLabel("AVAILABLE")}</StatusBadge>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Ulanishni tekshirish</div>
                  <p className="meta settings-row-desc">Alohida probe API yo‘q.</p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone="warn">{operatorCapabilityLabel("NOT_SUPPORTED")}</StatusBadge>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-label">Qayta urinish / sync</div>
                  <p className="meta settings-row-desc">
                    Admin FOM retry / Sync now endpoint yo‘q. Worker ichidagi qayta urinish bu yerda emas.
                  </p>
                </div>
                <div className="settings-row-aside">
                  <StatusBadge tone="warn">{operatorCapabilityLabel("NOT_SUPPORTED")}</StatusBadge>
                </div>
              </div>
            </div>
          </section>

          {fom.note ? (
            <p className="meta fom-server-note">{String(fom.note)}</p>
          ) : null}

          <div className="fom-tech-toggle">
            <button className="btn-tertiary" type="button" onClick={() => setShowTech((v) => !v)}>
              {showTech ? "Texnik ma'lumotlarni yashirish" : "Texnik ma'lumotlar"}
            </button>
          </div>

          {showTech ? (
            <section className="settings-section" aria-labelledby="fom-tech-title">
              <div className="settings-section-head">
                <h2 id="fom-tech-title" className="settings-section-title">Texnik ma'lumotlar</h2>
                <p className="meta settings-section-lead">
                  Maxfiy kalitlar ko‘rsatilmaydi.
                </p>
              </div>
              <div className="settings-surface">
                {fom.role && typeof fom.role === "object" ? (
                  <>
                    <div className="settings-row">
                      <div className="settings-row-main">
                        <div className="settings-row-label">FOM roli</div>
                        <p className="meta settings-row-desc">{String((fom.role as any).fom || "—")}</p>
                      </div>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-main">
                        <div className="settings-row-label">Ilova roli</div>
                        <p className="meta settings-row-desc">{String((fom.role as any).app || "—")}</p>
                      </div>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-main">
                        <div className="settings-row-label">Ko‘prik</div>
                        <p className="meta settings-row-desc">{String((fom.role as any).bridge || "—")}</p>
                      </div>
                    </div>
                  </>
                ) : null}
                {fom.endpoints && typeof fom.endpoints === "object" ? (
                  Object.entries(fom.endpoints as Record<string, unknown>).map(([key, value]) => (
                    <div className="settings-row" key={key}>
                      <div className="settings-row-main">
                        <div className="settings-row-label">{key}</div>
                        <p className="meta settings-row-desc">
                          <code className="fom-code">{String(value)}</code>
                        </p>
                      </div>
                    </div>
                  ))
                ) : null}
                {fom.openDependency ? (
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-label">Ochiq bog‘liqlik</div>
                      <p className="meta settings-row-desc">{String(fom.openDependency)}</p>
                    </div>
                  </div>
                ) : null}
                {fom.auth ? (
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-label">Webhook auth (tavsif)</div>
                      <p className="meta settings-row-desc">
                        Header orqali. Qiymat / secret ko‘rsatilmaydi.
                      </p>
                    </div>
                    <div className="settings-row-aside">
                      <StatusBadge tone="neutral">Yashirin</StatusBadge>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
