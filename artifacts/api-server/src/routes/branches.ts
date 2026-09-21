import { Router } from "express";
import { eq } from "drizzle-orm";
import { branches, db } from "@workspace/db";
import { haversineKm } from "../lib/money";

const router = Router();

function serializeBranch(branch: typeof branches.$inferSelect, origin?: { lat: number; lng: number }) {
  const distanceKm = origin ? Number(haversineKm(origin.lat, origin.lng, branch.lat, branch.lng).toFixed(2)) : null;
  return {
    ...branch,
    paymeKey: branch.paymeKey ? "••••" : "",
    clickSecret: branch.clickSecret ? "••••" : "",
    distanceKm,
    hasPayme: Boolean(branch.paymeMerchantId && branch.paymeKey),
    hasClick: Boolean(branch.clickMerchantId && branch.clickSecret),
  };
}

router.get("/branches", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const region = typeof req.query.region === "string" ? req.query.region.trim() : "";
    const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
    const rows = await db.select().from(branches);
    const filtered = rows.filter((item) => {
      if (region && item.region !== region && item.district !== region) return false;
      if (!q) return true;
      return `${item.name} ${item.district} ${item.region} ${item.address}`.toLowerCase().includes(q);
    }).map((item) => serializeBranch(item, origin));
    filtered.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    const regions = [...new Set(rows.map((item) => item.region))].sort();
    return res.json({ branches: filtered, total: filtered.length, regions, network: { claimed: "137+", regions: "9+", founded: 2015, certifications: ["GDP", "GPP"] } });
  } catch (error) {
    return next(error);
  }
});

router.get("/branches/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
    if (!rows[0]) return res.status(404).json({ message: "Filial topilmadi" });
    return res.json({ branch: serializeBranch(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

export default router;
