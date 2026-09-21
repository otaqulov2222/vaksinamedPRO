/**
 * P8 — DeliveryProviderAdapter boundary.
 * External provider execution: CONTRACT_PENDING (no invented vendor API).
 */

export type DeliveryProviderName = "internal" | "external";

export type DeliveryAdapterResult = {
  ok: boolean;
  code?: "CONTRACT_PENDING" | "NOT_APPLICABLE" | "NOT_CONFIGURED";
  message: string;
  providerRef?: string | null;
};

export interface DeliveryProviderAdapter {
  readonly name: DeliveryProviderName | string;
  createDelivery(input: {
    deliveryId: number;
    orderId: number;
    address: string;
  }): Promise<DeliveryAdapterResult>;
  cancelDelivery(input: { deliveryId: number; providerRef?: string }): Promise<DeliveryAdapterResult>;
  syncStatus?(input: { deliveryId: number; providerRef?: string }): Promise<DeliveryAdapterResult>;
}

export class InternalDeliveryAdapter implements DeliveryProviderAdapter {
  readonly name = "internal" as const;
  async createDelivery(): Promise<DeliveryAdapterResult> {
    return { ok: true, code: "NOT_APPLICABLE", message: "Internal courier — no external provider call" };
  }
  async cancelDelivery(): Promise<DeliveryAdapterResult> {
    return { ok: true, code: "NOT_APPLICABLE", message: "Internal courier cancel is local-only" };
  }
}

export class ExternalDeliveryAdapter implements DeliveryProviderAdapter {
  readonly name = "external" as const;
  async createDelivery(): Promise<DeliveryAdapterResult> {
    return {
      ok: false,
      code: "CONTRACT_PENDING",
      message: "External delivery provider contract pending — no fake success",
      providerRef: null,
    };
  }
  async cancelDelivery(): Promise<DeliveryAdapterResult> {
    return {
      ok: false,
      code: "CONTRACT_PENDING",
      message: "External delivery cancel contract pending",
    };
  }
  async syncStatus(): Promise<DeliveryAdapterResult> {
    return {
      ok: false,
      code: "CONTRACT_PENDING",
      message: "External delivery status sync contract pending",
    };
  }
}

export function getDeliveryAdapter(provider: string): DeliveryProviderAdapter {
  const p = String(provider || "internal").toLowerCase();
  if (p === "external") return new ExternalDeliveryAdapter();
  return new InternalDeliveryAdapter();
}
