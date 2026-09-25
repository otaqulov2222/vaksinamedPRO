import { useMemo } from "react";
import { isHqRole, type AdminUser } from "../api";
import {
  AdminPageHeader,
  StatusBadge,
  FeedbackBanner,
  operatorCapabilityLabel,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/**
 * Access-management boundary.
 * Confirmed: no GET/POST/PATCH/DELETE /admin/users (or roles) management APIs.
 * Current session identity/permissions come from GET /admin/me (already in shell).
 */
export function AdminAccessPage(props: {
  user: AdminUser | null;
  permissions: string[];
  branches?: any[];
}) {
  const role = String(props.user?.role || "").trim();
  const roleLabel = role ? role.replace(/_/g, " ") : "—";
  const isHq = Boolean(props.user && isHqRole(props.user.role));
  const branchLabel = useMemo(() => {
    if (!props.user) return "—";
    if (props.user.branchId == null) return isHq ? "HQ (barcha filiallar)" : "—";
    const name = (props.branches || []).find((b) => Number(b.id) === Number(props.user!.branchId))?.name;
    return name || `Filial #${props.user.branchId}`;
  }, [props.user, props.branches, isHq]);

  const perms = useMemo(
    () => [...(props.permissions || [])].map(String).filter(Boolean).sort(),
    [props.permissions],
  );

  return (
    <div className="access-page page-module">
      <AdminPageHeader
        title="Adminlar va ruxsatlar"
        description={PAGE_DESCRIPTIONS.admins}
      />

      <FeedbackBanner tone="info">
        Admin foydalanuvchilar va rollarni boshqarish uchun backend API hali ulanmagan.
        Bu sahifa soxta CRUD yaratmaydi.
      </FeedbackBanner>

      <section className="settings-section" aria-labelledby="access-mgmt-title">
        <div className="settings-section-head">
          <h2 id="access-mgmt-title" className="settings-section-title">Boshqaruv</h2>
          <p className="meta settings-section-lead">
            Quyidagi amallar uchun Admin API yo‘q.
          </p>
        </div>
        <div className="settings-surface">
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Admin foydalanuvchilar</div>
              <p className="meta settings-row-desc">
                Ro‘yxat, yaratish, tahrirlash va o‘chirish — ulanmagan.
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="warn">{operatorCapabilityLabel("API_REQUIRED")}</StatusBadge>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Rol tayinlash</div>
              <p className="meta settings-row-desc">
                Operator rolini o‘zgartirish Admin UI orqali emas.
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="warn">{operatorCapabilityLabel("API_REQUIRED")}</StatusBadge>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Ruxsat matritsasi</div>
              <p className="meta settings-row-desc">
                Permission assignment API yo‘q. Checkbox matritsa yaratilmagan.
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="warn">{operatorCapabilityLabel("API_REQUIRED")}</StatusBadge>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Filial biriktirish</div>
              <p className="meta settings-row-desc">
                Admin–filial bog‘lash UI yo‘q. Serverdagi branchId majburiy.
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="warn">{operatorCapabilityLabel("API_REQUIRED")}</StatusBadge>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="access-live-title">
        <div className="settings-section-head">
          <h2 id="access-live-title" className="settings-section-title">Hozir ishlayotgan</h2>
          <p className="meta settings-section-lead">
            Bu boshqaruv emas — serverda allaqachon majburiy bo‘lgan himoya.
          </p>
        </div>
        <div className="settings-surface">
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Backend RBAC</div>
              <p className="meta settings-row-desc">
                Har bir Admin API `requirePermission` / rol bilan himoyalangan.
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="ok">Majburiy</StatusBadge>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Filial doirasi</div>
              <p className="meta settings-row-desc">
                Kassir faqat o‘z filialida. HQ global ko‘rishi mumkin.
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="ok">Majburiy</StatusBadge>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Server rollari</div>
              <p className="meta settings-row-desc">
                Seed: <code>super_admin</code>, <code>cashier</code>. Tahrirlash UI yo‘q.
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="neutral">Faqat ko‘rish</StatusBadge>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="access-session-title">
        <div className="settings-section-head">
          <h2 id="access-session-title" className="settings-section-title">Joriy sessiya</h2>
          <p className="meta settings-section-lead">
            Faqat o‘zingizning joriy sessiyangiz. Boshqa adminlar ro‘yxati emas.
          </p>
        </div>
        <div className="settings-surface">
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Operator</div>
              <p className="meta settings-row-desc">
                {props.user?.name || "—"}
                {props.user?.email ? ` · ${props.user.email}` : ""}
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="neutral">Faqat ko‘rish</StatusBadge>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Rol</div>
              <p className="meta settings-row-desc">{roleLabel}</p>
            </div>
            <div className="settings-row-aside">
              <span className="access-role-code">{role || "—"}</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Filial doirasi</div>
              <p className="meta settings-row-desc">{branchLabel}</p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="neutral">Faqat ko‘rish</StatusBadge>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">Ruxsatlar</div>
              <p className="meta settings-row-desc">
                {perms.length > 0
                  ? `${perms.length} ta — sessiyangizga biriktirilgan`
                  : "Ruxsatlar yuklanmagan"}
              </p>
            </div>
            <div className="settings-row-aside">
              <StatusBadge tone="neutral">Faqat ko‘rish</StatusBadge>
            </div>
          </div>
        </div>

        {perms.length > 0 ? (
          <ul className="access-perm-list" aria-label="Sessiya ruxsatlari">
            {perms.map((p) => (
              <li key={p} className="access-perm-item">
                <code>{p}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="meta settings-footnote">
        Parol, token va maxfiy kalitlar ko‘rsatilmaydi. Audit jurnalida admin.login qaydlari alohida modulda.
      </p>
    </div>
  );
}
