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

    res.json({
      distanceKm: Number((route.distance / 1000).toFixed(1)),
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      provider: "osrm",
      yandexUrl: `https://yandex.ru/maps/?rtext=${fromLat},${fromLng}~${toLat},${toLng}&rtt=auto`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
