# Play Market / App Store — Vaksina Med release checklist

Ilova kodida bajarilganlar: Privacy/Terms sahifalari, hisobni o‘chirish API+UI, Payme/Click checkout + `/payments/methods` (filial merchant kalitlari kerak), kamera/GPS permission matnlari.

## Hali operator tomonidan kerak

1. **Apple Developer** ($99/yil) va **Google Play Console** ($25) hisoblari.
2. Expo EAS: `eas login` + haqiqiy `extra.eas.projectId` (`eas init`).
3. Production domen (masalan `app.vaksinamed.uz`) — `privacyPolicyUrl` / API base URL ni yangilash.
4. Store listing: 6.5–6.7" screenshotlar (kamida 2–8), qisqa/uzun tavsif UZ+RU (+EN ixtiyoriy), yosh reytingi.
5. Google **Data safety** va Apple **App Privacy** formalari (telefon, buyurtma, joylashuv, surat).
6. Ichki test: `eas build --profile preview` (APK) → keyin `production` AAB/IPA.
7. Payme/Click: `PAYME_MERCHANT_API_ENABLED=1` / `CLICK_MERCHANT_API_ENABLED=1` + test checkout URL; Admin→Filiallar merchant kalitlari; `PAYME_LIVE`/`CLICK_LIVE` faqat prod host uchun.

## Submit oldidan smoke

- [ ] `/privacy` va `/terms` ochiladi (HTTPS)
- [ ] Ro‘yxatdan o‘tish → Privacy/Terms linklari ishlaydi
- [ ] Profil → Hisobni o‘chirish → qayta login bo‘lmaydi
- [ ] Joylashuv / kamera ruxsat dialoglari to‘g‘ri matn bilan
- [ ] Checkout Payme/Click faqat `available` bo‘lganda tanlanadi; kalit yo‘q bo‘lsa hint ko‘rsatadi
