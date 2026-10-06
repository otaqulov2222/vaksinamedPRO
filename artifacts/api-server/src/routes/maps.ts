import { Router } from "express";

const router = Router();

router.get("/maps/route", async (req, res, next) => {
  try {
    const fromLat = Number(req.query.fromLat);
    const fromLng = Number(req.query.fromLng);
    const toLat = Number(req.query.toLat);
    const toLng = Number(req.query.toLng);
    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
      return res.status(400).json({ message: "Koordinatalar noto‘g‘ri" });
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ message: "Marshrut xizmati vaqtincha ishlamayapti" });
    }
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      return res.status(404).json({ message: "Marshrut topilmadi" });
    }

    return res.json({
      distanceKm: Number((route.distance / 1000).toFixed(1)),
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      provider: "osrm",
      yandexUrl: `https://yandex.ru/maps/?rtext=${fromLat},${fromLng}~${toLat},${toLng}&rtt=auto`,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/maps/geocode", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const lang = typeof req.query.lang === "string" ? req.query.lang : "uz_UZ";
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Koordinatalar noto‘g‘ri", code: "INVALID_COORDINATES" });
    }

    const apiKey = process.env.YANDEX_MAPS_API_KEY || process.env.YANDEX_GEOCODER_API_KEY || "";
    if (!apiKey) {
      // Graceful fallback when API key is not configured in environment
      return res.json({
        formattedAddress: null,
        district: null,
        street: null,
        house: null,
        locality: null,
        coordinates: { lat, lng },
        provider: "none",
        configured: false,
      });
    }

    // Yandex Geocoder requires: geocode=lng,lat
    const yandexUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(apiKey)}&geocode=${lng},${lat}&format=json&lang=${encodeURIComponent(lang)}&results=1`;
    const response = await fetch(yandexUrl, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({ message: "Geokoder so‘rovlar chegarasiga yetdi", code: "RATE_LIMITED" });
      }
      return res.status(502).json({ message: "Geokoder xizmati vaqtincha ishlamayapti", code: "GEOCODER_UNAVAILABLE" });
    }

    const data = await response.json();
    const geoObject = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    if (!geoObject) {
      return res.json({
        formattedAddress: null,
        district: null,
        street: null,
        house: null,
        locality: null,
        coordinates: { lat, lng },
        provider: "yandex",
        found: false,
      });
    }

    const meta = geoObject.metaDataProperty?.GeocoderMetaData;
    const formattedAddress = meta?.text || geoObject.name || null;
    const components: Array<{ kind: string; name: string }> = meta?.Address?.Components || [];

    const getKind = (kind: string) => components.find((c) => c.kind === kind)?.name || null;
    const locality = getKind("locality");
    const district = getKind("district") || getKind("sub_locality");
    const street = getKind("street");
    const house = getKind("house");

    return res.json({
      formattedAddress,
      district,
      street,
      house,
      locality,
      kind: meta?.kind || null,
      precision: meta?.precision || null,
      coordinates: { lat, lng },
      provider: "yandex",
      found: true,
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      return res.status(504).json({ message: "Geokoder javob bermadi", code: "GEOCODER_TIMEOUT" });
    }
    return next(error);
  }
});

export default router;
