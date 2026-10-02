import { defineMessages } from '../core';

export default defineMessages({
  uz: {
    subtitle: 'Yagona balans',
    subtitleMuted: 'Barcha qo‘llab-quvvatlanadigan xarid kanallari',
    balanceLabel: 'Mavjud balans',
    balanceA11y: 'Mavjud cashback balansi, {amount}',
    useInPurchases: 'Xaridlarda ishlatish',
    useInPurchasesA11y: 'Cashbackni xaridlarda ishlatish',

    tierNone: 'Daraja mavjud emas',
    tierProgressToA11y: '{tier} darajagacha progress',
    tierProgressA11y: 'Daraja progressi',
    tierTop: 'Siz eng yuqori darajadasiz',
    tierRemaining: '{tier} darajagacha yana {amount} (xaridlar)',
    tierThresholdPending: 'Keyingi daraja chegarasi serverdan',
    tierDetailsA11y: 'Daraja tafsilotlari',
    tierA11y: 'Daraja: {tier}',
    tierCurrentA11y: 'joriy',

    infoTitle: 'Bitta balans — ilova, kassa va boshqa ruxsat etilgan xaridlar.',
    infoBody:
      'Cashback yakunlangan tijorat xaridlaridan hisoblanadi (to‘lov usuli emas). Ishlatish — rasmiylashtirishda yoki kassada QR orqali. Balans faqat server hisobidan.',

    historyTitle: 'So‘nggi cashbacklar',
    historyA11y: 'Cashback tarixi',
    historyCollapseA11y: 'Tarixni yopish',
    historyShowAllA11y: 'Barcha cashbacklarni ko‘rish',
    shopAction: 'Xarid qilish',
    historyOrder: 'Buyurtma {code}',
    historyReceipt: 'Chek {id}',

    emptyTitle: 'Hali cashback yo‘q',
    emptyText: 'Yakunlangan xaridlar (ilova yoki kassa) cashbacki shu yerda ko‘rinadi. Namuna yozuvlar yo‘q.',

    promoA11y: 'Katalogda xarid qilish',
    promoKicker: 'XARID',
    promoTitle: 'Mahsulot tanlang — cashback xaridlaringizdan',
  },
  ru: {
    subtitle: 'Единый баланс',
    subtitleMuted: 'Все поддерживаемые каналы покупок',
    balanceLabel: 'Доступный баланс',
    balanceA11y: 'Доступный баланс кэшбэка, {amount}',
    useInPurchases: 'Оплатить покупки',
    useInPurchasesA11y: 'Использовать кэшбэк для покупок',

    tierNone: 'Уровень не присвоен',
    tierProgressToA11y: 'Прогресс до уровня {tier}',
    tierProgressA11y: 'Прогресс уровня',
    tierTop: 'У вас максимальный уровень',
    tierRemaining: 'До уровня {tier} осталось {amount} (покупки)',
    tierThresholdPending: 'Порог следующего уровня задаёт сервер',
    tierDetailsA11y: 'Сведения об уровне',
    tierA11y: 'Уровень: {tier}',
    tierCurrentA11y: 'текущий',

    infoTitle: 'Один баланс — приложение, касса и другие разрешённые покупки.',
    infoBody:
      'Кэшбэк начисляется за завершённые покупки (не за способ оплаты). Использовать — при оформлении или на кассе по QR. Баланс — только по данным сервера.',

    historyTitle: 'Последний кэшбэк',
    historyA11y: 'История кэшбэка',
    historyCollapseA11y: 'Свернуть историю',
    historyShowAllA11y: 'Показать весь кэшбэк',
    shopAction: 'За покупками',
    historyOrder: 'Заказ {code}',
    historyReceipt: 'Чек {id}',

    emptyTitle: 'Кэшбэка пока нет',
    emptyText: 'Здесь появится кэшбэк за завершённые покупки (в приложении или на кассе). Демо-записей нет.',

    promoA11y: 'Покупки в каталоге',
    promoKicker: 'ПОКУПКИ',
    promoTitle: 'Выберите товар — кэшбэк с ваших покупок',
  },
  en: {
    subtitle: 'Single balance',
    subtitleMuted: 'All supported purchase channels',
    balanceLabel: 'Available balance',
    balanceA11y: 'Available cashback balance, {amount}',
    useInPurchases: 'Use on purchases',
    useInPurchasesA11y: 'Use cashback on purchases',

    tierNone: 'No tier yet',
    tierProgressToA11y: 'Progress to {tier}',
    tierProgressA11y: 'Tier progress',
    tierTop: 'You are at the highest tier',
    tierRemaining: '{amount} more in purchases to reach {tier}',
    tierThresholdPending: 'Next tier threshold is set by the server',
    tierDetailsA11y: 'Tier details',
    tierA11y: 'Tier: {tier}',
    tierCurrentA11y: 'current',

    infoTitle: 'One balance — app, in-store and other eligible purchases.',
    infoBody:
      'Cashback is earned on completed purchases (not on the payment method). Use it at checkout or in store via QR. The balance comes from the server only.',

    historyTitle: 'Recent cashback',
    historyA11y: 'Cashback history',
    historyCollapseA11y: 'Collapse history',
    historyShowAllA11y: 'Show all cashback',
    shopAction: 'Shop now',
    historyOrder: 'Order {code}',
    historyReceipt: 'Receipt {id}',

    emptyTitle: 'No cashback yet',
    emptyText: 'Cashback from completed purchases (in the app or in store) will appear here. No sample entries.',

    promoA11y: 'Shop in the catalog',
    promoKicker: 'SHOP',
    promoTitle: 'Pick a product — earn cashback on your purchases',
  },
});
