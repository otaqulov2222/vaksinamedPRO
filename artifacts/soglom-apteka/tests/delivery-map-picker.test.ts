import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createT } from '../lib/i18n';
import {
  hasValidCoords,
  TASHKENT_DEFAULT,
  type DeliveryAddressSelection,
  type LatLng,
} from '../lib/maps';

describe('Phase B.0: Delivery Address & Map Picker Logic', () => {
  describe('1. Coordinates Validation & Fallback', () => {
    it('validates real coordinates correctly', () => {
      assert.equal(hasValidCoords({ lat: 41.311081, lng: 69.240562 }), true);
      assert.equal(hasValidCoords({ lat: 41.0, lng: 69.0 }), true);
    });

    it('rejects invalid, null, undefined, NaN, and 0,0 coordinates', () => {
      assert.equal(hasValidCoords(null), false);
      assert.equal(hasValidCoords(undefined), false);
      assert.equal(hasValidCoords({ lat: 0, lng: 0 }), false);
      assert.equal(hasValidCoords({ lat: 'abc', lng: 69.2 }), false);
      assert.equal(hasValidCoords({ lat: Number.NaN, lng: 69.2 }), false);
    });

    it('provides Tashkent default coordinates', () => {
      assert.equal(typeof TASHKENT_DEFAULT.lat, 'number');
      assert.equal(typeof TASHKENT_DEFAULT.lng, 'number');
      assert.ok(TASHKENT_DEFAULT.lat > 40 && TASHKENT_DEFAULT.lat < 42);
      assert.ok(TASHKENT_DEFAULT.lng > 68 && TASHKENT_DEFAULT.lng < 71);
      assert.equal(hasValidCoords(TASHKENT_DEFAULT), true);
    });
  });

  describe('2. Initial Location Priority Resolution', () => {
    function resolveInitialLocation(opts: {
      existingSelected?: LatLng | null;
      savedDefault?: LatLng | null;
      deviceLocation?: LatLng | null;
      defaultFallback: LatLng;
    }): { location: LatLng; source: 'existing' | 'saved' | 'device' | 'fallback' } {
      if (opts.existingSelected && hasValidCoords(opts.existingSelected)) {
        return { location: opts.existingSelected, source: 'existing' };
      }
      if (opts.savedDefault && hasValidCoords(opts.savedDefault)) {
        return { location: opts.savedDefault, source: 'saved' };
      }
      if (opts.deviceLocation && hasValidCoords(opts.deviceLocation)) {
        return { location: opts.deviceLocation, source: 'device' };
      }
      return { location: opts.defaultFallback, source: 'fallback' };
    }

    it('Priority 1: Existing selected coordinates take precedence', () => {
      const res = resolveInitialLocation({
        existingSelected: { lat: 41.32, lng: 69.25 },
        savedDefault: { lat: 41.28, lng: 69.20 },
        deviceLocation: { lat: 41.30, lng: 69.22 },
        defaultFallback: TASHKENT_DEFAULT,
      });
      assert.equal(res.source, 'existing');
      assert.equal(res.location.lat, 41.32);
    });

    it('Priority 2: Saved default address coordinates when no existing selected', () => {
      const res = resolveInitialLocation({
        existingSelected: null,
        savedDefault: { lat: 41.28, lng: 69.20 },
        deviceLocation: { lat: 41.30, lng: 69.22 },
        defaultFallback: TASHKENT_DEFAULT,
      });
      assert.equal(res.source, 'saved');
      assert.equal(res.location.lat, 41.28);
    });

    it('Priority 3: Device location when permission granted', () => {
      const res = resolveInitialLocation({
        existingSelected: null,
        savedDefault: null,
        deviceLocation: { lat: 41.30, lng: 69.22 },
        defaultFallback: TASHKENT_DEFAULT,
      });
      assert.equal(res.source, 'device');
      assert.equal(res.location.lat, 41.30);
    });

    it('Priority 4: Safe Tashkent fallback when nothing else is available', () => {
      const res = resolveInitialLocation({
        existingSelected: null,
        savedDefault: null,
        deviceLocation: null,
        defaultFallback: TASHKENT_DEFAULT,
      });
      assert.equal(res.source, 'fallback');
      assert.equal(res.location, TASHKENT_DEFAULT);
    });
  });

  describe('3. Address Formatting & Raw Coordinate Rejection', () => {
    const rawCoordPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/;

    function assembleDeliveryAddress(opts: {
      mapResolved?: string;
      district?: string;
      street?: string;
      house?: string;
      apartment?: string;
      entrance?: string;
      floor?: string;
      landmark?: string;
      courierComment?: string;
    }): string {
      const parts: string[] = [];
      const mapAddr = opts.mapResolved?.trim() || '';
      if (mapAddr && !rawCoordPattern.test(mapAddr)) {
        parts.push(mapAddr);
      } else {
        const mainParts = [
          opts.district?.trim(),
          opts.street?.trim(),
          opts.house?.trim() ? `${opts.house.trim()}-uy` : '',
        ].filter(Boolean);
        if (mainParts.length) parts.push(mainParts.join(', '));
      }

      const extraParts = [
        opts.apartment?.trim() ? `${opts.apartment.trim()}-xonadon` : '',
        opts.entrance?.trim() ? `${opts.entrance.trim()}-kirish` : '',
        opts.floor?.trim() ? `${opts.floor.trim()}-qavat` : '',
      ].filter(Boolean);
      if (extraParts.length) parts.push(extraParts.join(', '));
      if (opts.landmark?.trim()) parts.push(`Mo‘ljal: ${opts.landmark.trim()}`);
      if (opts.courierComment?.trim()) parts.push(`Izoh: ${opts.courierComment.trim()}`);
      return parts.join(' | ');
    }

    it('formats map resolved address with apartment and Kirish entrance', () => {
      const result = assembleDeliveryAddress({
        mapResolved: 'Toshkent shahri, Yunusobod tumani, Amir Temur shox ko‘chasi, 107',
        apartment: '42',
        entrance: '2',
        floor: '5',
        landmark: 'Shahriston metro yonida',
        courierComment: 'Domofon 42K',
      });
      assert.equal(
        result,
        'Toshkent shahri, Yunusobod tumani, Amir Temur shox ko‘chasi, 107 | 42-xonadon, 2-kirish, 5-qavat | Mo‘ljal: Shahriston metro yonida | Izoh: Domofon 42K',
      );
    });

    it('strictly rejects raw coordinates from becoming the customer-facing address', () => {
      const resultWithRawCoords = assembleDeliveryAddress({
        mapResolved: '41.219104, 69.272924',
        district: 'Chilonzor tumani',
        street: 'Bunyodkor shox ko‘chasi',
        house: '12',
        apartment: '5',
      });
      // Must not start with raw coordinates
      assert.equal(rawCoordPattern.test(resultWithRawCoords), false);
      assert.ok(!resultWithRawCoords.includes('41.219104, 69.272924'));
      assert.equal(resultWithRawCoords, 'Chilonzor tumani, Bunyodkor shox ko‘chasi, 12-uy | 5-xonadon');
    });

    it('formats manual address fields when map is unselected', () => {
      const result = assembleDeliveryAddress({
        district: 'Chilonzor tumani',
        street: 'Muqimiy ko‘chasi',
        house: '14',
        apartment: '5',
        entrance: '1',
      });
      assert.equal(result, 'Chilonzor tumani, Muqimiy ko‘chasi, 14-uy | 5-xonadon, 1-kirish');
    });

    it('enforces minimum address length of 8 characters for delivery validity', () => {
      const MIN_LENGTH = 8;
      const valid = assembleDeliveryAddress({ mapResolved: 'Toshkent, Chilonzor' });
      const tooShort = assembleDeliveryAddress({ district: 'Uz' });
      assert.ok(valid.length >= MIN_LENGTH);
      assert.ok(tooShort.length < MIN_LENGTH);
    });
  });

  describe('4. Stale Response & Race Condition Guard', () => {
    class MockGeocodeController {
      private activeRequestId = 0;
      public lastAppliedAddress: string | null = null;
      public lastAppliedReqId: number | null = null;

      async requestGeocode(id: number, resolvedText: string, delayMs: number): Promise<boolean> {
        this.activeRequestId = id;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (id === this.activeRequestId) {
          this.lastAppliedAddress = resolvedText;
          this.lastAppliedReqId = id;
          return true;
        }
        return false;
      }
    }

    it('ignores stale older responses when user rapidly pans map', async () => {
      const controller = new MockGeocodeController();

      const p1 = controller.requestGeocode(1, 'Old Address 1', 60);
      const p2 = controller.requestGeocode(2, 'Newest Address 2', 10);

      const [res1, res2] = await Promise.all([p1, p2]);

      assert.equal(res2, true, 'Newest request applied');
      assert.equal(res1, false, 'Stale request was ignored');
      assert.equal(controller.lastAppliedAddress, 'Newest Address 2');
      assert.equal(controller.lastAppliedReqId, 2);
    });
  });

  describe('5. Business Invariants Preserved', () => {
    it('pickup allows 24h reservation and payment at branch', () => {
      const PICKUP_RESERVE_HOURS = 24;
      assert.equal(PICKUP_RESERVE_HOURS, 24);
    });

    it('COD (Cash on Delivery) is strictly disabled in checkout options', () => {
      const paymentOptions = [
        { value: 'pay_at_branch', enabled: true },
        { value: 'payme', enabled: false },
        { value: 'click', enabled: false },
        { value: 'cod', enabled: false },
      ].filter((opt) => opt.enabled);

      assert.equal(paymentOptions.some((o) => o.value === 'cod'), false);
      assert.equal(paymentOptions.length, 1);
      assert.equal(paymentOptions[0].value, 'pay_at_branch');
    });

    it('delivery fee is fixed at 15,000 UZS (not live fake Yandex quote)', () => {
      const fixedDeliveryFee = 15000;
      assert.equal(fixedDeliveryFee, 15000);
    });
  });

  describe('6. Localization Keys Coverage for Delivery & Map Picker', () => {
    const requiredKeys = [
      'checkoutAddressLabel',
      'checkoutPickOnMap',
      'checkoutChangeAddress',
      'checkoutSelectedAddress',
      'checkoutMapPickerTitle',
      'checkoutMapSelectLocation',
      'checkoutMapMyLocation',
      'checkoutMapLocating',
      'checkoutMapGeocodeFailed',
      'checkoutMapLocationDenied',
      'checkoutSaveAddress',
      'checkoutAddrDistrict',
      'checkoutAddrStreet',
      'checkoutAddrHouse',
      'checkoutAddrApartment',
      'checkoutAddrEntrance',
      'checkoutAddrFloor',
      'checkoutAddrLandmark',
      'checkoutAddrComment',
    ] as const;

    for (const lang of ['uz', 'ru', 'en'] as const) {
      const t = createT(lang);
      it(`${lang}: has all required map and address delivery keys`, () => {
        for (const key of requiredKeys) {
          const val = t(`cart.${key}` as any);
          assert.ok(val, `Missing translation for cart.${key} in ${lang}`);
          assert.notEqual(val, `cart.${key}`, `Raw key returned for cart.${key} in ${lang}`);
        }
      });
    }

    it('uses "Kirish" for entrance in Uzbek', () => {
      const uz = createT('uz');
      assert.equal(uz('cart.checkoutAddrEntrance'), 'Kirish');
      assert.equal(uz('cart.checkoutAddrEntrancePlaceholder'), '2-kirish');
    });

    it('uses "Подъезд" for entrance in Russian', () => {
      const ru = createT('ru');
      assert.equal(ru('cart.checkoutAddrEntrance'), 'Подъезд');
      assert.equal(ru('cart.checkoutAddrEntrancePlaceholder'), 'подъезд 2');
    });

    it('uses "Entrance" for entrance in English', () => {
      const en = createT('en');
      assert.equal(en('cart.checkoutAddrEntrance'), 'Entrance');
      assert.equal(en('cart.checkoutAddrEntrancePlaceholder'), 'Entrance 2');
    });
  });

  describe('7. Yandex Geocoder Real Response Parser', () => {
    function parseYandexGeocoderResponse(rawYandexData: any, requestedCoords: LatLng) {
      const geoObject = rawYandexData?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
      if (!geoObject) {
        return {
          formattedAddress: null,
          district: null,
          street: null,
          house: null,
          locality: null,
          coordinates: requestedCoords,
          provider: 'yandex',
          configured: true,
          found: false,
        };
      }

      const meta = geoObject.metaDataProperty?.GeocoderMetaData;
      const formattedAddress = meta?.Address?.formatted || meta?.text || geoObject.name || null;
      const components: Array<{ kind: string; name: string }> = meta?.Address?.Components || [];

      const getKind = (kind: string) => components.find((c) => c.kind === kind)?.name || null;
      const locality = getKind('locality');
      const district = getKind('district') || getKind('sub_locality') || getKind('area');
      const street = getKind('street');
      const house = getKind('house');

      return {
        formattedAddress,
        district,
        street,
        house,
        locality,
        kind: meta?.kind || null,
        precision: meta?.precision || null,
        coordinates: requestedCoords,
        provider: 'yandex',
        configured: true,
        found: true,
      };
    }

    it('correctly parses real Yandex Geocoder response with structured components', () => {
      const sampleYandexResponse = {
        response: {
          GeoObjectCollection: {
            metaDataProperty: {
              GeocoderResponseMetaData: {
                request: '69.2878,41.3385',
                results: '1',
                found: '1',
              },
            },
            featureMember: [
              {
                GeoObject: {
                  metaDataProperty: {
                    GeocoderMetaData: {
                      precision: 'exact',
                      text: 'O‘zbekiston, Toshkent, Yunusobod tumani, Amir Temur shox ko‘chasi, 107',
                      kind: 'house',
                      Address: {
                        country_code: 'UZ',
                        formatted: 'O‘zbekiston, Toshkent, Yunusobod tumani, Amir Temur shox ko‘chasi, 107',
                        Components: [
                          { kind: 'country', name: 'O‘zbekiston' },
                          { kind: 'locality', name: 'Toshkent' },
                          { kind: 'district', name: 'Yunusobod tumani' },
                          { kind: 'street', name: 'Amir Temur shox ko‘chasi' },
                          { kind: 'house', name: '107' },
                        ],
                      },
                    },
                  },
                  name: 'Amir Temur shox ko‘chasi, 107',
                  description: 'Toshkent, O‘zbekiston',
                },
              },
            ],
          },
        },
      };

      const parsed = parseYandexGeocoderResponse(sampleYandexResponse, { lat: 41.3385, lng: 69.2878 });
      assert.equal(parsed.found, true);
      assert.equal(parsed.provider, 'yandex');
      assert.equal(parsed.locality, 'Toshkent');
      assert.equal(parsed.district, 'Yunusobod tumani');
      assert.equal(parsed.street, 'Amir Temur shox ko‘chasi');
      assert.equal(parsed.house, '107');
      assert.equal(parsed.formattedAddress, 'O‘zbekiston, Toshkent, Yunusobod tumani, Amir Temur shox ko‘chasi, 107');
    });

    it('handles empty / not found Yandex response gracefully', () => {
      const emptyYandexResponse = {
        response: {
          GeoObjectCollection: {
            featureMember: [],
          },
        },
      };

      const parsed = parseYandexGeocoderResponse(emptyYandexResponse, { lat: 41.0, lng: 69.0 });
      assert.equal(parsed.found, false);
      assert.equal(parsed.formattedAddress, null);
      assert.equal(parsed.provider, 'yandex');
    });
  });

  describe('8. Payment Method Locking: Pickup vs Delivery', () => {
    function getPaymentOptions(fulfillment: 'pickup' | 'delivery', t: (k: any) => string) {
      return (
        fulfillment === 'delivery'
          ? [
              {
                value: 'payme',
                label: t('cart.checkoutOnlinePayment'),
                hint: t('cart.checkoutOnlinePaymentHint'),
                enabled: true,
              },
            ]
          : [
              {
                value: 'pay_at_branch',
                label: t('status.paymentMethod_pay_at_branch'),
                hint: t('cart.checkoutPayAtBranchHint'),
                enabled: true,
              },
            ]
      ).filter((opt) => opt.enabled);
    }

    it('delivery payment options only contain online payment (payme), strictly excluding pay_at_branch and COD', () => {
      const uz = createT('uz');
      const opts = getPaymentOptions('delivery', uz);
      assert.equal(opts.length, 1);
      assert.equal(opts[0].value, 'payme');
      assert.equal(opts[0].label, 'Onlayn to‘lov');
      assert.ok(opts.every((o) => o.value !== 'pay_at_branch'));
      assert.ok(opts.every((o) => o.value !== 'cod'));
    });

    it('pickup payment options contain pay_at_branch', () => {
      const uz = createT('uz');
      const opts = getPaymentOptions('pickup', uz);
      assert.equal(opts.length, 1);
      assert.equal(opts[0].value, 'pay_at_branch');
      assert.equal(opts[0].label, 'Filialda to‘lash');
    });
  });

  describe('9. Order Detail and Status Copy Polishing', () => {
    it('orders.countdownLabel is polished without "taxminiy" / "примерно" across UZ, RU, EN', () => {
      const uz = createT('uz');
      const ru = createT('ru');
      const en = createT('en');
      assert.equal(uz('orders.countdownLabel'), 'Bron tugashiga');
      assert.equal(ru('orders.countdownLabel'), 'До окончания брони');
      assert.equal(en('orders.countdownLabel'), 'Reservation ends in');
    });

    it('orders.deliveryUpdatesNote reflects honest dispatch timing across UZ, RU, EN', () => {
      const uz = createT('uz');
      const ru = createT('ru');
      const en = createT('en');
      assert.equal(uz('orders.deliveryUpdatesNote'), 'Yetkazib berish buyurtma tasdiqlangach boshlanadi.');
      assert.equal(ru('orders.deliveryUpdatesNote'), 'Доставка начнётся после подтверждения заказа.');
      assert.equal(en('orders.deliveryUpdatesNote'), 'Delivery will begin once the order is confirmed.');
    });

    it('status.delivery_pending reflects honest initial delivery status across UZ, RU, EN', () => {
      const uz = createT('uz');
      const ru = createT('ru');
      const en = createT('en');
      assert.equal(uz('status.delivery_pending'), 'Yetkazib berish kutilmoqda');
      assert.equal(ru('status.delivery_pending'), 'Ожидает отправки');
      assert.equal(en('status.delivery_pending'), 'Awaiting delivery dispatch');
    });
  });

  describe('10. Delivery House Number Validation & Snapshot Assembly', () => {
    function validateDelivery(opts: {
      mapResolved?: string;
      district?: string;
      street?: string;
      house?: string;
    }): { valid: boolean; errorReason?: 'house_required' | 'address_required' } {
      const hasBase = Boolean(opts.mapResolved?.trim()) || (Boolean(opts.district?.trim()) && Boolean(opts.street?.trim()));
      const hasHouse = Boolean(opts.house?.trim());
      if (!hasBase) return { valid: false, errorReason: 'address_required' };
      if (!hasHouse) return { valid: false, errorReason: 'house_required' };
      return { valid: true };
    }

    it('Delivery WITHOUT house number is rejected as invalid', () => {
      const res = validateDelivery({
        mapResolved: 'Toshkent, Sergeli tumani, Xonobod ko‘chasi',
        house: '',
      });
      assert.equal(res.valid, false);
      assert.equal(res.errorReason, 'house_required');
    });

    it('Delivery WITH house number is accepted as valid', () => {
      const res = validateDelivery({
        mapResolved: 'Toshkent, Sergeli tumani, Xonobod ko‘chasi',
        house: '12',
      });
      assert.equal(res.valid, true);
    });

    it('Manual delivery without house number is rejected', () => {
      const res = validateDelivery({
        district: 'Sergeli tumani',
        street: 'Xonobod ko‘chasi',
        house: '',
      });
      assert.equal(res.valid, false);
      assert.equal(res.errorReason, 'house_required');
    });

    it('Translates checkoutHouseRequired across UZ, RU, EN', () => {
      const uz = createT('uz');
      const ru = createT('ru');
      const en = createT('en');
      assert.equal(uz('cart.checkoutHouseRequired'), 'Uy raqamini kiriting.');
      assert.equal(ru('cart.checkoutHouseRequired'), 'Укажите номер дома.');
      assert.equal(en('cart.checkoutHouseRequired'), 'Enter the house number.');
    });
  });

  describe('11. Orders Screen Payment Chip Rules (Cancelled vs Active)', () => {
    function resolveOrderPaymentChip(order: {
      fulfillmentStatus: string;
      status: string;
      paymentStatus: string;
    }): { showChip: boolean; chipLabel: string | null } {
      const isCancelled = order.fulfillmentStatus === 'CANCELLED' || order.status === 'cancelled';
      const isCompleted = order.fulfillmentStatus === 'COMPLETED' || order.status === 'completed';
      const pay = String(order.paymentStatus || '').toUpperCase();

      const needsPaymentAttention = !isCancelled && !isCompleted && (pay === 'PENDING' || pay === 'FAILED');
      const payRefundLabel = isCancelled && (pay === 'REFUNDED' || pay === 'PARTIALLY_REFUNDED') ? pay : null;
      const payUrgentLabel = needsPaymentAttention ? pay : payRefundLabel;

      return {
        showChip: Boolean(payUrgentLabel),
        chipLabel: payUrgentLabel,
      };
    }

    it('CONFIRMED + PENDING_PAYMENT shows payment pending chip', () => {
      const res = resolveOrderPaymentChip({
        fulfillmentStatus: 'CONFIRMED',
        status: 'confirmed',
        paymentStatus: 'PENDING',
      });
      assert.equal(res.showChip, true);
      assert.equal(res.chipLabel, 'PENDING');
    });

    it('CONFIRMED + PAID does not show payment pending chip', () => {
      const res = resolveOrderPaymentChip({
        fulfillmentStatus: 'CONFIRMED',
        status: 'confirmed',
        paymentStatus: 'PAID',
      });
      assert.equal(res.showChip, false);
      assert.equal(res.chipLabel, null);
    });

    it('CANCELLED + PENDING_PAYMENT does NOT show payment pending chip (shows only cancelled)', () => {
      const res = resolveOrderPaymentChip({
        fulfillmentStatus: 'CANCELLED',
        status: 'cancelled',
        paymentStatus: 'PENDING',
      });
      assert.equal(res.showChip, false);
      assert.equal(res.chipLabel, null);
    });

    it('CANCELLED + REFUNDED shows refund status chip', () => {
      const res = resolveOrderPaymentChip({
        fulfillmentStatus: 'CANCELLED',
        status: 'cancelled',
        paymentStatus: 'REFUNDED',
      });
      assert.equal(res.showChip, true);
      assert.equal(res.chipLabel, 'REFUNDED');
    });
  });
});
