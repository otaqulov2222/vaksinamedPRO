import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { customerAddresses, db } from "@workspace/db";
import { requireCustomer } from "../lib/auth";

const router = Router();

const VALID_LABELS = ["home", "work", "other"] as const;

/**
 * GET /api/customer/addresses or /customer/addresses
 * List all saved addresses for the authenticated customer.
 * Default address appears first.
 */
router.get(["/customer/addresses", "/api/customer/addresses"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);

    const addresses = await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customer.id))
      .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt));

    return res.json({
      addresses,
      count: addresses.length,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * POST /api/customer/addresses or /customer/addresses
 * Add a new saved address for the authenticated customer.
 */
router.post(["/customer/addresses", "/api/customer/addresses"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const {
      label = "home",
      title = "",
      formattedAddress,
      latitude,
      longitude,
      district = null,
      street = null,
      house = null,
      apartment = null,
      entrance = null,
      floor = null,
      landmark = null,
      courierNote = null,
      isDefault = false,
    } = req.body;

    if (!formattedAddress || typeof formattedAddress !== "string" || formattedAddress.trim().length < 5) {
      return res.status(400).json({
        code: "ADDRESS_REQUIRED",
        message: "Manzil matni kamida 5 ta belgidan iborat bo'lishi kerak",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      return res.status(400).json({
        code: "INVALID_COORDINATES",
        message: "Manzil koordinatalari to'g'ri ko'rsatilishi shart",
      });
    }

    const cleanLabel = VALID_LABELS.includes(label) ? label : "home";

    // Count existing addresses to make the first address default automatically if not specified
    const existing = await db
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customer.id));

    const shouldBeDefault = Boolean(isDefault || existing.length === 0);

    const inserted = await db.transaction(async (tx) => {
      if (shouldBeDefault) {
        // Demote other addresses
        await tx
          .update(customerAddresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(customerAddresses.customerId, customer.id));
      }

      return (
        await tx
          .insert(customerAddresses)
          .values({
            customerId: customer.id,
            label: cleanLabel,
            title: typeof title === "string" ? title.trim() : "",
            formattedAddress: formattedAddress.trim(),
            latitude: lat,
            longitude: lng,
            district: district ? String(district).trim() : null,
            street: street ? String(street).trim() : null,
            house: house ? String(house).trim() : null,
            apartment: apartment ? String(apartment).trim() : null,
            entrance: entrance ? String(entrance).trim() : null,
            floor: floor ? String(floor).trim() : null,
            landmark: landmark ? String(landmark).trim() : null,
            courierNote: courierNote ? String(courierNote).trim() : null,
            isDefault: shouldBeDefault,
          })
          .returning()
      )[0];
    });

    return res.status(201).json({ address: inserted });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * PATCH /api/customer/addresses/:id or /customer/addresses/:id
 * Update an existing saved address.
 */
router.patch(["/customer/addresses/:id", "/api/customer/addresses/:id"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const addressId = parseInt(rawId, 10);
    if (!Number.isFinite(addressId)) {
      return res.status(400).json({ message: "Noto'g'ri manzil identifikatori" });
    }

    const existing = (
      await db
        .select()
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, addressId),
            eq(customerAddresses.customerId, customer.id)
          )
        )
        .limit(1)
    )[0];

    if (!existing) {
      return res.status(404).json({ code: "ADDRESS_NOT_FOUND", message: "Manzil topilmadi" });
    }

    const {
      label,
      title,
      formattedAddress,
      latitude,
      longitude,
      district,
      street,
      house,
      apartment,
      entrance,
      floor,
      landmark,
      courierNote,
      isDefault,
    } = req.body;

    const updates: Partial<typeof customerAddresses.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (label !== undefined && VALID_LABELS.includes(label)) updates.label = label;
    if (title !== undefined) updates.title = String(title).trim();
    if (formattedAddress !== undefined && typeof formattedAddress === "string" && formattedAddress.trim().length >= 5) {
      updates.formattedAddress = formattedAddress.trim();
    }
    if (latitude !== undefined && Number.isFinite(Number(latitude))) updates.latitude = Number(latitude);
    if (longitude !== undefined && Number.isFinite(Number(longitude))) updates.longitude = Number(longitude);
    if (district !== undefined) updates.district = district ? String(district).trim() : null;
    if (street !== undefined) updates.street = street ? String(street).trim() : null;
    if (house !== undefined) updates.house = house ? String(house).trim() : null;
    if (apartment !== undefined) updates.apartment = apartment ? String(apartment).trim() : null;
    if (entrance !== undefined) updates.entrance = entrance ? String(entrance).trim() : null;
    if (floor !== undefined) updates.floor = floor ? String(floor).trim() : null;
    if (landmark !== undefined) updates.landmark = landmark ? String(landmark).trim() : null;
    if (courierNote !== undefined) updates.courierNote = courierNote ? String(courierNote).trim() : null;

    const settingDefault = isDefault === true;

    const updated = await db.transaction(async (tx) => {
      if (settingDefault) {
        await tx
          .update(customerAddresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(customerAddresses.customerId, customer.id));
        updates.isDefault = true;
      } else if (isDefault === false) {
        updates.isDefault = false;
      }

      return (
        await tx
          .update(customerAddresses)
          .set(updates)
          .where(eq(customerAddresses.id, addressId))
          .returning()
      )[0];
    });

    return res.json({ address: updated });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * DELETE /api/customer/addresses/:id or /customer/addresses/:id
 * Delete a saved address.
 */
router.delete(["/customer/addresses/:id", "/api/customer/addresses/:id"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const addressId = parseInt(rawId, 10);
    if (!Number.isFinite(addressId)) {
      return res.status(400).json({ message: "Noto'g'ri manzil identifikatori" });
    }

    const existing = (
      await db
        .select()
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, addressId),
            eq(customerAddresses.customerId, customer.id)
          )
        )
        .limit(1)
    )[0];

    if (!existing) {
      return res.status(404).json({ code: "ADDRESS_NOT_FOUND", message: "Manzil topilmadi" });
    }

    await db.transaction(async (tx) => {
      await tx.delete(customerAddresses).where(eq(customerAddresses.id, addressId));

      // If we deleted the default address, promote the most recent one to default
      if (existing.isDefault) {
        const remaining = await tx
          .select({ id: customerAddresses.id })
          .from(customerAddresses)
          .where(eq(customerAddresses.customerId, customer.id))
          .orderBy(desc(customerAddresses.createdAt))
          .limit(1);

        if (remaining[0]) {
          await tx
            .update(customerAddresses)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(customerAddresses.id, remaining[0].id));
        }
      }
    });

    return res.json({ success: true });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

export { router as addressesRouter };
