import { defineMessages } from '../core';

export default defineMessages({
  uz: {
    heroTitle: 'Har bir filial — o‘z nuqtasida',
    nearestBranch: 'Eng yaqin filial',
    chooseBranch: 'Filial tanlang',
    locationDenied: 'Joylashuv ruxsati berilmagan — masofa ko‘rsatilmaydi. Filial tanlash ishlaydi.',
    locationUnavailable: 'Joylashuvni aniqlab bo‘lmadi — masofa ko‘rsatilmaydi.',
    searchPlaceholder: 'Filial, tuman, ko‘cha…',
    allRegions: 'Barchasi · {count}',
    emptyTitle: 'Filial topilmadi',
    listHeading: 'Dorixonalar ro‘yxati',
    loadFailed: 'Filiallarni yuklab bo‘lmadi',

    distanceKm: '{km} km',
    routeByRoad: 'Yo‘l: {km} km',
    routeStraight: 'Masofa: {km} km',
    routeDurationMin: '~{min} daqiqa',

    showRoute: 'Yo‘lni ko‘rsatish',
    select: 'Tanlash',
    routeA11y: '{name} — yo‘nalishni ko‘rsatish',
    selectA11y: '{name} filialini tanlash',
    callA11y: '{name} ga qo‘ng‘iroq qilish',

    mapTitle: 'Xarita',
    noCoordsMessage: 'Bu filialning koordinatasi mavjud emas.',
    locationTitle: 'Joylashuv',
    locationRequiredMessage:
      'Eng yaqin filialni aniqlash uchun joylashuv ruxsati kerak. Filiallar ro‘yxatidan tanlashingiz mumkin.',
    branchTitle: 'Filial',
    nearestNotFound: 'Yaqin filial topilmadi.',
    pickFailed: 'Filial tanlanmadi',
    branchRequired: 'Filial tanlang',
    branchNotFound: 'Filial topilmadi',
    branchClosed: 'Filial hozir ochiq emas',

    mapNoCoords: 'Xaritada joylashuvi mavjud emas',
    mapActivateA11y: 'Xaritani faollashtirish',
    mapNativeTitle: 'Filiallar xaritasi',
    mapNativeNote:
      'Interaktiv xarita webda ishlaydi. Native uchun `react-native-maps` (yoki Mapbox) paketini qo‘shish kerak — hozircha o‘rnatilmagan.',
  },
  ru: {
    heroTitle: 'Каждая аптека — на своём месте',
    nearestBranch: 'Ближайшая аптека',
    chooseBranch: 'Выберите аптеку',
    locationDenied: 'Нет доступа к геолокации — расстояние не показывается. Выбор аптеки работает.',
    locationUnavailable: 'Не удалось определить местоположение — расстояние не показывается.',
    searchPlaceholder: 'Аптека, район, улица…',
    allRegions: 'Все · {count}',
    emptyTitle: 'Аптеки не найдены',
    listHeading: 'Список аптек',
    loadFailed: 'Не удалось загрузить аптеки',

    distanceKm: '{km} км',
    routeByRoad: 'По дороге: {km} км',
    routeStraight: 'Расстояние: {km} км',
    routeDurationMin: '~{min} мин',

    showRoute: 'Маршрут',
    select: 'Выбрать',
    routeA11y: '{name} — показать маршрут',
    selectA11y: 'Выбрать аптеку {name}',
    callA11y: 'Позвонить в аптеку {name}',

    mapTitle: 'Карта',
    noCoordsMessage: 'У этой аптеки нет координат.',
    locationTitle: 'Геолокация',
    locationRequiredMessage:
      'Чтобы найти ближайшую аптеку, нужен доступ к геолокации. Вы можете выбрать аптеку из списка.',
    branchTitle: 'Аптека',
    nearestNotFound: 'Ближайшая аптека не найдена.',
    pickFailed: 'Не удалось выбрать аптеку',
    branchRequired: 'Выберите аптеку',
    branchNotFound: 'Аптека не найдена',
    branchClosed: 'Аптека сейчас закрыта',

    mapNoCoords: 'Нет местоположения на карте',
    mapActivateA11y: 'Активировать карту',
    mapNativeTitle: 'Карта аптек',
    mapNativeNote:
      'Интерактивная карта работает в веб-версии. Для приложения нужен пакет `react-native-maps` (или Mapbox) — пока не установлен.',
  },
  en: {
    heroTitle: 'Every pharmacy, right on the map',
    nearestBranch: 'Nearest pharmacy',
    chooseBranch: 'Choose a pharmacy',
    locationDenied: 'Location access denied — distance is hidden. You can still choose a pharmacy.',
    locationUnavailable: 'Could not determine your location — distance is hidden.',
    searchPlaceholder: 'Pharmacy, district, street…',
    allRegions: 'All · {count}',
    emptyTitle: 'No pharmacies found',
    listHeading: 'Pharmacy list',
    loadFailed: 'Could not load pharmacies',

    distanceKm: '{km} km',
    routeByRoad: 'By road: {km} km',
    routeStraight: 'Distance: {km} km',
    routeDurationMin: '~{min} min',

    showRoute: 'Show route',
    select: 'Select',
    routeA11y: '{name} — show route',
    selectA11y: 'Select pharmacy {name}',
    callA11y: 'Call {name}',

    mapTitle: 'Map',
    noCoordsMessage: 'This pharmacy has no coordinates.',
    locationTitle: 'Location',
    locationRequiredMessage:
      'Location access is needed to find the nearest pharmacy. You can choose one from the list.',
    branchTitle: 'Pharmacy',
    nearestNotFound: 'No nearby pharmacy found.',
    pickFailed: 'Could not select the pharmacy',
    branchRequired: 'Choose a pharmacy',
    branchNotFound: 'Pharmacy not found',
    branchClosed: 'This pharmacy is currently closed',

    mapNoCoords: 'No location on the map',
    mapActivateA11y: 'Activate map',
    mapNativeTitle: 'Pharmacy map',
    mapNativeNote:
      'The interactive map works on the web. The app needs the `react-native-maps` (or Mapbox) package — not installed yet.',
  },
});
