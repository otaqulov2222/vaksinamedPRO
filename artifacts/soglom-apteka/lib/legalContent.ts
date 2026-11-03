import type { Language } from '@/lib/languages';

export type LegalDoc = {
  title: string;
  updated: string;
  sections: Array<{ heading: string; body: string }>;
};

const privacy: Record<Language, LegalDoc> = {
  uz: {
    title: 'Maxfiylik siyosati',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. Kim to‘playdi',
        body: 'Vaksina Med ilovasi (operator: Vaksina Med dorixonalar tarmog‘i, O‘zbekiston) foydalanuvchi ma’lumotlarini loyiha xizmatlarini ko‘rsatish uchun qayta ishlaydi.',
      },
      {
        heading: '2. Qanday ma’lumotlar',
        body: 'Telefon raqami, ism/familiya, til, buyurtmalar, cashback balansi va tarixi, tanlangan filial, qurilma/sessiya identifikatorlari. Joylashuv — faqat eng yaqin filialni topish uchun, ruxsat berganingizda. Retsept rasmi — faqat siz yuklaganingizda.',
      },
      {
        heading: '3. Nima uchun',
        body: 'Hisob ochish va SMS orqali kirish, buyurtma/bron, cashback, filial qidiruvi, xavfsizlik va firibgarlikka qarshi choralar. Marketing xabarlari alohida ruxsatsiz yuborilmaydi.',
      },
      {
        heading: '4. Kimga uzatiladi',
        body: 'SMS (OTP) provayderi, hosting/infratuzilma, onlayn to‘lov uchun Payme/Click (filial merchant sozlamalari orqali) va qonun talab qilganda vakolatli organlar. Karta ma’lumotlari bizning serverimizda saqlanmaydi — to‘lov Payme/Click sahifasida amalga oshadi.',
      },
      {
        heading: '5. Saqlash muddati',
        body: 'Hisob faol bo‘lgan davrda va qonuniy muddatlar (buxgalteriya/buyurtma tarixi) tugaguncha. Hisobni o‘chirganingizda shaxsiy identifikatorlar anonimlashtiriladi; ba’zi moliyaviy yozuvlar qonuniy saqlanishi mumkin.',
      },
      {
        heading: '6. Huquqlaringiz',
        body: 'Ma’lumotlaringizni ko‘rish/yangilash (profil), hisobni o‘chirish (Profil → Hisobni o‘chirish) va savollar uchun aloqa: +998 95 340 41 42 yoki vaksinamed.uz.',
      },
      {
        heading: '7. Bolalar',
        body: 'Ilova 16 yoshdan katta foydalanuvchilar uchun mo‘ljallangan. Voyaga yetmaganlar ota-ona/vasiy roziligi bilan foydalanishi kerak.',
      },
    ],
  },
  ru: {
    title: 'Политика конфиденциальности',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. Кто обрабатывает данные',
        body: 'Приложение Vaksina Med (оператор — сеть аптек Vaksina Med, Узбекистан) обрабатывает данные для предоставления сервисов приложения.',
      },
      {
        heading: '2. Какие данные',
        body: 'Номер телефона, имя/фамилия, язык, заказы, баланс и история кэшбэка, выбранный филиал, идентификаторы устройства/сессии. Геолокация — только для поиска ближайшей аптеки при вашем разрешении. Фото рецепта — только если вы его загружаете.',
      },
      {
        heading: '3. Зачем',
        body: 'Регистрация и вход по SMS, бронирование заказов, кэшбэк, поиск филиалов, безопасность. Маркетинговые сообщения без отдельного согласия не отправляем.',
      },
      {
        heading: '4. Передача',
        body: 'Провайдер SMS (OTP), хостинг/инфраструктура, Payme/Click для онлайн-оплаты (по настройкам филиала) и госорганы по закону. Данные карты на наших серверах не хранятся — оплата на стороне Payme/Click.',
      },
      {
        heading: '5. Срок хранения',
        body: 'Пока аккаунт активен и в пределах законных сроков. При удалении аккаунта персональные идентификаторы обезличиваются; часть финансовых записей может храниться по закону.',
      },
      {
        heading: '6. Ваши права',
        body: 'Просмотр/обновление данных в профиле, удаление аккаунта (Профиль → Удалить аккаунт), вопросы: +998 95 340 41 42 или vaksinamed.uz.',
      },
      {
        heading: '7. Дети',
        body: 'Приложение предназначено для пользователей старше 16 лет.',
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. Who processes data',
        body: 'The Vaksina Med app (operator: Vaksina Med pharmacy network, Uzbekistan) processes personal data to provide app services.',
      },
      {
        heading: '2. What we collect',
        body: 'Phone number, name, language, orders, cashback balance/history, selected branch, device/session identifiers. Location — only to find nearby pharmacies when you grant permission. Prescription photos — only if you upload them.',
      },
      {
        heading: '3. Why',
        body: 'Account creation and SMS login, order holds, cashback, branch lookup, and security. We do not send marketing messages without separate consent.',
      },
      {
        heading: '4. Sharing',
        body: 'SMS (OTP) provider, hosting/infrastructure, Payme/Click for online payments (via branch merchant settings), and authorities when required by law. We do not store card data on our servers — payment happens on Payme/Click.',
      },
      {
        heading: '5. Retention',
        body: 'While your account is active and as required by law. After account deletion we anonymize personal identifiers; some financial records may be retained legally.',
      },
      {
        heading: '6. Your rights',
        body: 'View/update profile data, delete your account (Profile → Delete account), contact: +998 95 340 41 42 or vaksinamed.uz.',
      },
      {
        heading: '7. Children',
        body: 'The app is intended for users aged 16+.',
      },
    ],
  },
};

const terms: Record<Language, LegalDoc> = {
  uz: {
    title: 'Foydalanish shartlari',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. Xizmat',
        body: 'Ilova Vaksina Med filiallarini topish, mahsulotlarni ko‘rish, buyurtmani bron qilish va cashback balansini kuzatish uchun mo‘ljallangan. Dorixonadagi yakuniy narx, mavjudlik va berish filial qoidalariga bog‘liq.',
      },
      {
        heading: '2. Hisob',
        body: 'Telefon raqamingiz va SMS kodi orqali ro‘yxatdan o‘tasiz. Hisob xavfsizligi uchun parolingizni sir saqlang. Hisobni istalgan vaqtda o‘chirishingiz mumkin.',
      },
      {
        heading: '3. Buyurtma va to‘lov',
        body: 'Ilovada bron qilingan buyurtma odatda tanlangan filialda olinadi. To‘lov: filialda (naqd/terminal) yoki Payme/Click onlayn (filialda merchant kalitlari sozlangan bo‘lsa).',
      },
      {
        heading: '4. Cashback',
        body: 'Cashback qoidalari (foiz, muddat, FIFO) ilova va filial siyosatiga muvofiq qo‘llanadi. Ballar to‘lov usuli emas; ular faqat loyihalangan chegirma/bonus mexanizmidir.',
      },
      {
        heading: '5. Tibbiy maslahat emas',
        body: 'Ilova tibbiy tashxis yoki shaxsiy davolash tavsiyasi o‘rnini bosmaydi. Dori tanlashda farmatsevt yoki shifokorga murojaat qiling.',
      },
      {
        heading: '6. O‘zgarishlar',
        body: 'Shartlar yangilanishi mumkin. Muhim o‘zgarishlar ilova orqali yoki vaksinamed.uz da e’lon qilinadi. Davom etish yangilangan shartlarga rozilik bildirish hisoblanadi.',
      },
    ],
  },
  ru: {
    title: 'Условия использования',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. Сервис',
        body: 'Приложение помогает находить филиалы Vaksina Med, просматривать товары, бронировать заказы и отслеживать кэшбэк. Итоговая цена и выдача зависят от правил аптеки.',
      },
      {
        heading: '2. Аккаунт',
        body: 'Регистрация по номеру телефона и SMS. Храните пароль в секрете. Аккаунт можно удалить в любой момент.',
      },
      {
        heading: '3. Заказ и оплата',
        body: 'Забронированный заказ обычно получают в выбранном филиале. Оплата: в аптеке (наличные/терминал) или онлайн через Payme/Click при настроенных merchant-ключах филиала.',
      },
      {
        heading: '4. Кэшбэк',
        body: 'Правила кэшбэка применяются согласно политике сети. Баллы — не способ оплаты, а бонусный механизм.',
      },
      {
        heading: '5. Не медуслуга',
        body: 'Приложение не заменяет диагноз или назначение врача. По лекарствам консультируйтесь с фармацевтом/врачом.',
      },
      {
        heading: '6. Изменения',
        body: 'Условия могут обновляться. Продолжение использования означает согласие с новой редакцией.',
      },
    ],
  },
  en: {
    title: 'Terms of Use',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. Service',
        body: 'The app helps you find Vaksina Med branches, browse products, hold orders, and track cashback. Final price and dispensing follow pharmacy rules.',
      },
      {
        heading: '2. Account',
        body: 'You register with phone + SMS. Keep your password secret. You may delete your account at any time.',
      },
      {
        heading: '3. Orders & payment',
        body: 'Held orders are typically picked up at the selected branch. Pay in store (cash/terminal) or online via Payme/Click when the branch has merchant keys configured.',
      },
      {
        heading: '4. Cashback',
        body: 'Cashback follows network policy. Points are a loyalty mechanism, not a payment method.',
      },
      {
        heading: '5. Not medical advice',
        body: 'The app does not replace diagnosis or a doctor’s prescription. Ask a pharmacist or clinician about medicines.',
      },
      {
        heading: '6. Changes',
        body: 'Terms may be updated. Continued use means you accept the revised terms.',
      },
    ],
  },
};

export function getPrivacyDoc(lang: Language): LegalDoc {
  return privacy[lang] || privacy.uz;
}

export function getTermsDoc(lang: Language): LegalDoc {
  return terms[lang] || terms.uz;
}
