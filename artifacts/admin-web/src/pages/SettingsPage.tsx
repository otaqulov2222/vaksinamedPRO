import { Badge, PageHeader } from "../ui";

/**
 * Honest placeholder. Admin users / roles / system settings API mavjud emas —
 * shuning uchun bu sahifa hech qanday soxta forma yoki soxta ro‘yxat ko‘rsatmaydi.
 */
export function SettingsPage(_props: { token?: string }) {
  return (
    <>
      <PageHeader title="Sozlamalar" subtitle="Tez orada — hozircha server API’si yo‘q." />

      <div className="card">
        <p>
          <Badge tone="warn">Tez orada</Badge>
        </p>
        <p className="muted">
          Admin foydalanuvchilar va rollarni boshqarish API’si hali yo‘q. Ro‘yxat, yaratish yoki ruxsatlarni
          tahrirlash formasi ataylab ko‘rsatilmayapti: ishlamaydigan interfeys ko‘rsatishdan ko‘ra rostini aytish
          to‘g‘ri.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Hozir nima orqali boshqariladi</h2>
        <table className="table">
          <tbody>
            <tr>
              <td>Admin foydalanuvchilar</td>
              <td className="muted">Ma’lumotlar bazasi / seed skriptlari — CRUD endpointi yo‘q</td>
            </tr>
            <tr>
              <td>Rollar va ruxsatlar (RBAC)</td>
              <td className="muted">
                Server tomonda belgilangan. O‘z ruxsatlaringizni <code>GET /api/admin/me</code> qaytaradi
              </td>
            </tr>
            <tr>
              <td>Filial ma’lumotlari va to‘lov kabineti</td>
              <td className="muted">Filiallar bo‘limi (<code>branches:manage</code>)</td>
            </tr>
            <tr>
              <td>Maxfiy kalitlar va muhit o‘zgaruvchilari</td>
              <td className="muted">Faqat server muhiti — admin panelda hech qachon ko‘rsatilmaydi</td>
            </tr>
            <tr>
              <td>Integratsiya holati</td>
              <td className="muted">FOM bo‘limi (faqat ko‘rish)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
        Admin foydalanuvchilar API’si qo‘shilganda bu sahifa haqiqiy ro‘yxat va rol boshqaruvi bilan almashtiriladi.
      </p>
    </>
  );
}
