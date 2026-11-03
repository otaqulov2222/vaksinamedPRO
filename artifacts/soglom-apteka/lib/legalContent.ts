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
        heading: '1. Umumiy qoidalar',
        body: 'Ushbu Maxfiylik siyosati Vaksina Med mobil ilovasi va bog‘liq veb-interfeyslar orqali shaxsga doir ma’lumotlarni qanday yig‘ishimiz, qayta ishlashimiz, saqlashimiz va kimga uzatishimizni tushuntiradi. Siyosat O‘zbekiston Respublikasining «Shaxsga doir ma’lumotlar to‘g‘risida»gi qonuni (O‘RQ-547) talablariga muvofiq tuzilgan. Ilavadan foydalanish — ushbu siyosat bilan tanishganingizni bildiradi.',
      },
      {
        heading: '2. Operator va aloqa',
        body: 'Operator: Vaksina Med dorixonalar tarmog‘i, O‘zbekiston. Maxfiylik bo‘yicha savollar va so‘rovlar: +998 95 340 41 42, vaksinamed.uz. Yuridik shaxs rekvizitlari (STIR va boshqalar) yangilanganda shu bo‘limda e’lon qilinadi.',
      },
      {
        heading: '3. Qayta ishlash asoslari',
        body: 'Ma’lumotlar quyidagi asoslarda qayta ishlanadi: xizmatni ko‘rsatish (hisob, buyurtma, cashback); siz bergan rozilik (masalan, joylashuv, kamera, push); qonuniy majburiyatlar (buyurtma/to‘lov yozuvlari, vakolatli organ so‘rovlari). Faqat xizmat uchun zarur bo‘lgan ma’lumotlar yig‘iladi.',
      },
      {
        heading: '4. Qanday ma’lumotlar',
        body: 'Hisob: telefon raqami, ism/familiya, til, ixtiyoriy tug‘ilgan kun, parolning xeshi (ochiq matn saqlanmaydi). Buyurtma va savat: mahsulotlar, filial, holat, manzil matni (yetkazish bo‘lsa), to‘lov usuli, izoh. Cashback: balans, daraja, hisob-kitob yozuvlari. Oila: siz kiritgan a’zo ismi, aloqa, tug‘ilgan kun, eslatmalar/yozuvlar. Dori eslatmalari: dori nomi, vaqt, bajarilish jurnali. Qurilma: sessiya tokeni, User-Agent, push token (ruxsat berilganda). Baholar: buyurtma bo‘yicha reyting va izoh. Telegram Mini App orqali ochilganda texnik identifikator faqat shu muhitda qo‘llanilishi mumkin; ishlab chiqarishda asosiy kirish telefon + sessiya orqali.',
      },
      {
        heading: '5. Sezgir ruxsatlar',
        body: 'Joylashuv — faqat eng yaqin filialni topish, yo‘nalish yoki yetkazish manzilini belgilash uchun, qurilma ruxsati bilan; fon kuzatuvi yo‘q. Kamera/galereya — retsept yoki rasm yuklash uchun, siz boshlaganingizda; retsept rasmi doimiy ma’lumotlar bazasiga saqlanmaydi (so‘rov davomida qayta ishlanadi). Tibbiy chat matnlari ham so‘rov davomida qayta ishlanadi, tashqi tibbiy AI bulutiga yuborilmaydi.',
      },
      {
        heading: '6. Maqsadlar',
        body: 'Hisob ochish va SMS (OTP) orqali kirish; buyurtmani bron qilish va kuzatish; cashback hisoblash; filial va manzil qidiruvi; eslatma va bildirishnomalar; xavfsizlik (sessiya, rate-limit, firibgarlikka qarshi). Marketing xabarlari alohida rozilikisiz yuborilmaydi. Mahsulot reklamasi uchun uchinchi tomon analitika SDK ishlatilmaydi.',
      },
      {
        heading: '7. Uchinchi shaxslar',
        body: 'Eskiz — OTP SMS. Payme va/yoki Click — onlayn to‘lov (filial merchant sozlamalari bo‘lsa); karta raqami (PAN) bizning serverimizda saqlanmaydi, to‘lov ular sahifasida. Expo Push — mahalliy bildirishnomalar (native token bo‘lsa). Xarita: OSRM (marshrut), Yandex geokoder (kalit sozlanganda), OpenStreetMap plitkalar/Nominatim (zaruratga qarab). Hosting/infratuzilma — server va ma’lumotlar bazasi. Qonun talab qilganda — vakolatli organlar. Shaxsga doir ma’lumotlar sotilmaydi.',
      },
      {
        heading: '8. Transchegaraviy uzatish',
        body: 'Ba’zi provayderlar (SMS, to‘lov, push, xarita) xizmatni ko‘rsatish uchun ma’lumotni o‘z infratuzilmasi orqali qayta ishlashi mumkin. Uzatish faqat yuqoridagi maqsadlar uchun. Yevropa GDPR ga alohida da’vo qilinmaydi; asosiy huquqiy rejim — O‘zbekiston qonunchiligi.',
      },
      {
        heading: '9. Saqlash muddati',
        body: 'Hisob faol bo‘lgan davrda saqlanadi. OTP — qisqa muddatli (muddati tugagach yoki tasdiqlangach o‘chiriladi). Sessiyalar — belgilangan muddatgacha. Buyurtma, to‘lov va cashback yozuvlari — qonuniy/buxgalteriya muddatlari tugaguncha. Push token — qurilma faol yoki o‘chirilgunga qadar.',
      },
      {
        heading: '10. Hisobni o‘chirish',
        body: 'Profil → Hisobni o‘chirish. So‘rovdan keyin telefon, ism va shunga o‘xshash identifikatorlar anonimlashtiriladi, sessiyalar bekor qilinadi, parol o‘chiriladi. Buyurtma, to‘lov va cashback yozuvlari ichki identifikator bo‘yicha qonuniy/moliyaviy sabablarga ko‘ra saqlanishi mumkin — bu to‘liq «barcha tarixni o‘chirish» emas.',
      },
      {
        heading: '11. Huquqlaringiz',
        body: 'Ma’lumotlaringizni profil orqali ko‘rish va yangilash; hisobni o‘chirish so‘rovi; qayta ishlash haqida ma’lumot so‘rash. So‘rovlar: +998 95 340 41 42 yoki vaksinamed.uz. Qonunda belgilangan tartibda javob beriladi.',
      },
      {
        heading: '12. Xavfsizlik',
        body: 'Uzatish HTTPS orqali; parol va OTP xeshlanadi; sessiya tokenlari himoyalanadi. Mutlaq xavfsizlik kafolatlanmaydi — internet orqali uzatishda xavf qolishi mumkin. Shubhali kirishni sezsangiz, parolni almashtiring va biz bilan bog‘laning.',
      },
      {
        heading: '13. Bolalar',
        body: 'Ilova bolalarga maxsus mo‘ljallanmagan. Voyaga yetmaganlar ota-ona yoki vasiy roziligi va nazorati bilan foydalanishi kerak. Aniq raqamli yosh chegarasi ushbu siyosatda belgilanmagan — alohida kompaniya/yuridik qaror bilan belgilanadi.',
      },
      {
        heading: '14. Mahalliy saqlash',
        body: 'Qurilmada (AsyncStorage / brauzer mahalliy xotirasi) kirish tokeni, til, bildirishnoma sozlamalari va shunga o‘xshash texnik qiymatlar saqlanishi mumkin. Server autentifikatsiyasi Bearer token orqali; cookie asosidagi mijoz sessiyasi qo‘llanilmaydi.',
      },
      {
        heading: '15. O‘zgarishlar',
        body: 'Siyosat yangilanishi mumkin. Yangilanish sanasi yuqorida ko‘rsatiladi. Muhim o‘zgarishlar ilova ichida yoki vaksinamed.uz da e’lon qilinishi mumkin. Davom etib foydalanish — yangi tahrir bilan tanishishni anglatadi.',
      },
      {
        heading: '16. Aloqa',
        body: 'Maxfiylik va shaxsga doir ma’lumotlar: +998 95 340 41 42, vaksinamed.uz. Operator: Vaksina Med dorixonalar tarmog‘i, O‘zbekiston.',
      },
    ],
  },
  ru: {
    title: 'Политика конфиденциальности',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. Общие положения',
        body: 'Настоящая Политика конфиденциальности объясняет, как приложение Vaksina Med и связанные веб-интерфейсы собирают, обрабатывают, хранят и передают персональные данные. Политика составлена с учётом Закона Республики Узбекистан «О персональных данных» (ЗРУ-547). Пользуясь приложением, вы подтверждаете ознакомление с этой Политикой.',
      },
      {
        heading: '2. Оператор и контакты',
        body: 'Оператор: сеть аптек Vaksina Med, Узбекистан. Вопросы по конфиденциальности: +998 95 340 41 42, vaksinamed.uz. Реквизиты юридического лица (ИНН/СТИР и др.) при появлении будут указаны в этом разделе.',
      },
      {
        heading: '3. Основания обработки',
        body: 'Данные обрабатываются: для оказания услуги (аккаунт, заказ, кэшбэк); на основании вашего согласия (геолокация, камера, push); для исполнения закона (записи заказов/оплат, запросы органов). Собираем только данные, необходимые для сервиса.',
      },
      {
        heading: '4. Какие данные',
        body: 'Аккаунт: телефон, имя/фамилия, язык, дата рождения (по желанию), хеш пароля (открытый текст не хранится). Заказы и корзина: товары, филиал, статус, адрес доставки, способ оплаты, комментарий. Кэшбэк: баланс, уровень, проводки. Семья: данные членов, которые вы вводите. Напоминания о лекарствах: название, время, журнал. Устройство: токен сессии, User-Agent, push-токен (при разрешении). Оценки: рейтинг и отзыв по заказу. В Telegram Mini App может использоваться технический идентификатор среды; в production основной вход — телефон и сессия.',
      },
      {
        heading: '5. Чувствительные разрешения',
        body: 'Геолокация — только для ближайших аптек, маршрута или адреса доставки, с разрешения устройства; фонового трекинга нет. Камера/галерея — для загрузки рецепта/фото по вашему действию; изображение рецепта не сохраняется постоянно в БД (обрабатывается в рамках запроса). Тексты медчата также обрабатываются в рамках запроса и не отправляются во внешний медицинский AI-облако.',
      },
      {
        heading: '6. Цели',
        body: 'Регистрация и вход по SMS (OTP); бронирование и отслеживание заказов; кэшбэк; поиск филиалов и адресов; напоминания и уведомления; безопасность (сессии, rate-limit, антифрод). Маркетинговые сообщения без отдельного согласия не отправляем. Сторонние рекламные/продуктовые analytics SDK не используются.',
      },
      {
        heading: '7. Третьи лица',
        body: 'Eskiz — OTP SMS. Payme и/или Click — онлайн-оплата (если настроены merchant-ключи филиала); номер карты (PAN) на наших серверах не хранится. Expo Push — нативные уведомления. Карты: OSRM, Yandex Geocoder (при ключе), OpenStreetMap/Nominatim по необходимости. Хостинг/инфраструктура. По закону — уполномоченные органы. Персональные данные не продаём.',
      },
      {
        heading: '8. Трансграничная передача',
        body: 'Отдельные провайдеры (SMS, оплата, push, карты) могут обрабатывать данные в своей инфраструктуре для оказания услуги. Передача только для целей выше. Отдельных заявлений о GDPR не делаем; основной режим — законодательство Узбекистана.',
      },
      {
        heading: '9. Срок хранения',
        body: 'Пока аккаунт активен. OTP — краткосрочно. Сессии — до истечения срока. Заказы, оплаты и кэшбэк — в пределах законных/учётных сроков. Push-токен — пока устройство активно или не удалено.',
      },
      {
        heading: '10. Удаление аккаунта',
        body: 'Профиль → Удалить аккаунт. После запроса телефон, имя и подобные идентификаторы обезличиваются, сессии отзываются, пароль удаляется. Записи заказов, оплат и кэшбэка могут сохраняться по внутреннему ID по законным/финансовым причинам — это не полное стирание всей истории.',
      },
      {
        heading: '11. Ваши права',
        body: 'Просмотр и обновление данных в профиле; запрос на удаление аккаунта; запрос сведений об обработке. Контакты: +998 95 340 41 42 или vaksinamed.uz. Ответ — в порядке, установленном законом.',
      },
      {
        heading: '12. Безопасность',
        body: 'Передача по HTTPS; пароль и OTP хешируются; токены сессий защищаются. Абсолютная безопасность не гарантируется. При подозрении на несанкционированный доступ смените пароль и свяжитесь с нами.',
      },
      {
        heading: '13. Дети',
        body: 'Приложение не предназначено специально для детей. Несовершеннолетние должны пользоваться им с согласия и под контролем родителя/опекуна. Числовой возрастной порог в Политике не указан — он определяется отдельным решением компании/юристов.',
      },
      {
        heading: '14. Локальное хранение',
        body: 'На устройстве (AsyncStorage / локальное хранилище браузера) могут храниться токен входа, язык, настройки уведомлений и технические значения. Аутентификация на сервере — Bearer-токен; cookie-сессия клиента не используется.',
      },
      {
        heading: '15. Изменения',
        body: 'Политика может обновляться. Дата обновления указана выше. Существенные изменения могут публиковаться в приложении или на vaksinamed.uz. Продолжение использования означает ознакомление с новой редакцией.',
      },
      {
        heading: '16. Контакты',
        body: 'По вопросам конфиденциальности: +998 95 340 41 42, vaksinamed.uz. Оператор: сеть аптек Vaksina Med, Узбекистан.',
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: '2026-11-03',
    sections: [
      {
        heading: '1. General',
        body: 'This Privacy Policy explains how the Vaksina Med mobile app and related web interfaces collect, process, store, and share personal data. It is prepared with regard to the Law of the Republic of Uzbekistan “On Personal Data” (LRU-547). By using the app, you acknowledge this Policy.',
      },
      {
        heading: '2. Operator and contact',
        body: 'Operator: Vaksina Med pharmacy network, Uzbekistan. Privacy questions: +998 95 340 41 42, vaksinamed.uz. Legal-entity details (tax ID and similar), when available, will be stated in this section.',
      },
      {
        heading: '3. Legal bases',
        body: 'We process data to provide the service (account, orders, cashback); based on your consent (location, camera, push); and for legal obligations (order/payment records, lawful authority requests). We collect only what is needed for the service.',
      },
      {
        heading: '4. What we collect',
        body: 'Account: phone, name, language, optional birth date, password hash (no plaintext). Orders and cart: items, branch, status, delivery address text, payment method, comments. Cashback: balance, tier, ledger. Family: member details you enter. Medication reminders: medicine name, schedule, logs. Device: session token, User-Agent, push token (if allowed). Ratings: order rating and comment. In Telegram Mini App a technical environment id may apply; in production primary login is phone + session.',
      },
      {
        heading: '5. Sensitive permissions',
        body: 'Location — only to find nearby branches, routing, or set a delivery address, with device permission; no background tracking. Camera/gallery — when you upload a prescription/photo; prescription images are not stored permanently in the database (processed for the request). Medical chat text is also request-scoped and is not sent to an external medical AI cloud.',
      },
      {
        heading: '6. Purposes',
        body: 'Registration and SMS (OTP) login; order holds and tracking; cashback; branch and address lookup; reminders and notifications; security (sessions, rate limits, anti-abuse). We do not send marketing without separate consent. No third-party advertising/product analytics SDKs are used.',
      },
      {
        heading: '7. Third parties',
        body: 'Eskiz — OTP SMS. Payme and/or Click — online payment when branch merchant keys are configured; card numbers (PAN) are not stored on our servers. Expo Push — native notifications. Maps: OSRM, Yandex Geocoder (when keyed), OpenStreetMap/Nominatim as needed. Hosting/infrastructure. Authorities when required by law. We do not sell personal data.',
      },
      {
        heading: '8. Cross-border transfers',
        body: 'Some providers (SMS, payments, push, maps) may process data on their infrastructure to deliver the service. Transfers are only for the purposes above. We do not claim separate GDPR applicability; the primary regime is Uzbekistan law.',
      },
      {
        heading: '9. Retention',
        body: 'While the account is active. OTP — short-lived. Sessions — until expiry. Orders, payments, and cashback — for applicable legal/accounting periods. Push tokens — while the device is active or until removed.',
      },
      {
        heading: '10. Account deletion',
        body: 'Profile → Delete account. After your request we anonymize phone, name, and similar identifiers, revoke sessions, and clear the password. Order, payment, and cashback records may be retained under an internal id for legal/financial reasons — this is not a full wipe of all history.',
      },
      {
        heading: '11. Your rights',
        body: 'View and update profile data; request account deletion; ask about processing. Contact: +998 95 340 41 42 or vaksinamed.uz. We respond as required by law.',
      },
      {
        heading: '12. Security',
        body: 'Transit over HTTPS; passwords and OTPs are hashed; session tokens are protected. Absolute security is not guaranteed. If you suspect unauthorized access, change your password and contact us.',
      },
      {
        heading: '13. Children',
        body: 'The app is not directed at children. Minors should use it only with parent/guardian consent and supervision. No numeric age threshold is stated here — it is set by a separate company/legal decision.',
      },
      {
        heading: '14. Local storage',
        body: 'The device (AsyncStorage / browser local storage) may keep the auth token, language, notification settings, and similar technical values. Server auth uses a Bearer token; cookie-based customer sessions are not used.',
      },
      {
        heading: '15. Changes',
        body: 'This Policy may be updated. The update date is shown above. Material changes may be announced in the app or on vaksinamed.uz. Continued use means you have reviewed the revised Policy.',
      },
      {
        heading: '16. Contact',
        body: 'Privacy and personal data: +998 95 340 41 42, vaksinamed.uz. Operator: Vaksina Med pharmacy network, Uzbekistan.',
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
