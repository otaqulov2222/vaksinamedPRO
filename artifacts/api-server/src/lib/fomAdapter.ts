/**
 * P9 — FOM commercial adapter boundary.
 * Inventory writer is DISABLED until a verified FOM stock contract exists.
 */

/** Explicit kill-switch — never write product_stocks from FOM. */
export const FOM_INVENTORY_WRITER_ENABLED = false;

export function assertFomInventoryWriterDisabled(): void {
  if (FOM_INVENTORY_WRITER_ENABLED) {
    throw Object.assign(new Error("FOM inventory writer must remain disabled"), {
      status: 500,
      code: "FOM_INVENTORY_WRITER_MUST_STAY_OFF",
    });
  }
}

export type FomCommercialResult = {
  mode: "order" | "walk_in";
  inventoryWriter: "DISABLED";
  barcodesProcessed: false;
  receiptId: string;
};
