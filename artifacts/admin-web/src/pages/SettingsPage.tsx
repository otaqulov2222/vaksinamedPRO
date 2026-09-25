import { useEffect, useState } from "react";
import { request } from "../api";
import {
  AdminPageHeader,
  StatusBadge,
  ErrorState,
  LoadingBlock,
  FeedbackBanner,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Sozlamalarni ko‘rish uchun ruxsat yo‘q.";
  return err instanceof Error ? err.message : fallback;
}

/**
 * Settings console — only surfaces that have a real read source.
 * No /admin/settings aggregate exists. No write APIs for system settings.
 */
export function SettingsPage(props: { token?: string }) {
  const [rules, setRules] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      // Public rules endpoint returns server-authoritative maxSpendPercent (system_settings).
      const data = await request("/api/cashback/rules", props.token || "");
      setRules(data && typeof data === "object" ? data : null);
    } catch (err) {
      setRules(null);
      setError(errText(err, "Sozlamalarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const maxSpendPercent =
    rules?.maxSpendPercent != null && Number.isFinite(Number(rules.maxSpendPercent))
      ? Math.round(Number(rules.maxSpendPercent))
      : null;

  return (
    <div className="settings-page page-module">
      <AdminPageHeader
        title="Sozlamalar"
        description={PAGE_DESCRIPTIONS.settings}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <FeedbackBanner tone="info">
        Admin sozlamalar API yo‘q. Faqat serverdan o‘qiladigan qiymatlar ko‘rsatiladi —
        saqlash / tahrirlash bu yerda mavjud emas.
      </FeedbackBanner>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !rules && !error ? <LoadingBlock rows={2} /> : null}

      {!error && (rules || !loading) ? (
        <section className="settings-section" aria-labelledby="settings-cashback-title">
          <div className="settings-section-head">
            <h2 id="settings-cashback-title" className="settings-section-title">Cashback</h2>
            <p className="meta settings-section-lead">
              Serverdagi spend limiti. Qiymat o‘zgartirish Admin panel orqali emas.
            </p>
          </div>

          <div className="settings-surface">
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-label">Maksimal cashback ishlatish</div>
                <p className="meta settings-row-desc">
                  Eligible tovar summasidan foiz (yetkazish haqidan emas). Manba: server sozlamasi.
                </p>
              </div>
              <div className="settings-row-aside">
                {maxSpendPercent != null ? (
                  <span className="settings-value" aria-label="Joriy qiymat">
                    {maxSpendPercent}%
                  </span>
                ) : (
                  <span className="meta">—</span>
                )}
                <StatusBadge tone="neutral">Faqat ko‘rish</StatusBadge>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="settings-section" aria-labelledby="settings-admin-title">
        <div className="settings-section-head">
          <h2 id="settings-admin-title" className="settings-section-title">Boshqaruv</h2>
          <p className="meta settings-section-lead">
            Adminlar va ruxsatlar — alohida modulda.
          </p>
        </div>
        <div className="settings-surface">
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Adminlar va ruxsatlar</div>
              <p className="meta settings-row-desc">
                Foydalanuvchi CRUD API yo‘q. Boshqaruv chegarasi Adminlar modulida.
              </p>
            </div>
            <div className="settings-row-aside">
              <span className="meta">Adminlar</span>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-elsewhere-title">
        <div className="settings-section-head">
          <h2 id="settings-elsewhere-title" className="settings-section-title">Boshqa joyda</h2>
          <p className="meta settings-section-lead">
            Quyidagi konfiguratsiya alohida modullarda. Bu yerda takrorlanmaydi yoki maxfiy qiymatlar ochilmaydi.
          </p>
        </div>
        <div className="settings-surface">
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Filial to‘lov kabineti</div>
              <p className="meta settings-row-desc">
                Provider identifikatorlari — Filiallar moduli. Maxfiy kalitlar bu yerda ko‘rsatilmaydi.
              </p>
            </div>
            <div className="settings-row-aside">
              <span className="meta">Filiallar</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">FOM integratsiyasi</div>
              <p className="meta settings-row-desc">
                Holat va shartnoma — FOM moduli. Tashqi POS shartnomasi alohida.
              </p>
            </div>
            <div className="settings-row-aside">
              <span className="meta">FOM</span>
            </div>
          </div>
        </div>
      </section>

      <p className="meta settings-footnote">
        Ombor / yetkazib berish / xabarlar / tizim boshqaruvi uchun Admin API yo‘q —
        soxta boshqaruv yaratilmagan.
      </p>
    </div>
  );
}
