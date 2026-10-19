import assert from "node:assert/strict";
import { describe, it } from "node:test";

interface Product {
  id: number;
  nameUz: string;
  nameRu: string;
  price: number;
  analogGroup: string;
  category: string;
  manufacturer: string;
}

interface ProductStock {
  productId: number;
  branchId: number;
  physicalQuantity: number;
  reservedQuantity: number;
}

function computeSmartAnalogs(
  targetProduct: Product,
  catalogProducts: Product[],
  stocks: ProductStock[],
  selectedBranchId?: number
) {
  // Find candidates with matching analogGroup or same category, excluding the product itself
  let candidates: Product[] = [];
  if (targetProduct.analogGroup && targetProduct.analogGroup.trim()) {
    candidates = catalogProducts.filter(
      (p) => p.analogGroup === targetProduct.analogGroup && p.id !== targetProduct.id
    );
  } else {
    candidates = catalogProducts.filter(
      (p) => p.category === targetProduct.category && p.id !== targetProduct.id
    );
  }

  // Sort by price ascending
  candidates.sort((a, b) => a.price - b.price);

  const enriched = candidates.map((analog) => {
    const stocksForAnalog = stocks.filter((s) => s.productId === analog.id);
    const totalAvailable = stocksForAnalog.reduce(
      (sum, s) => sum + Math.max(0, s.physicalQuantity - s.reservedQuantity),
      0
    );

    const branchStock = selectedBranchId
      ? stocksForAnalog.find((s) => s.branchId === selectedBranchId)
      : null;

    const available = branchStock
      ? Math.max(0, branchStock.physicalQuantity - branchStock.reservedQuantity)
      : totalAvailable;

    const isCheaper = analog.price < targetProduct.price;
    const savings = Math.max(0, targetProduct.price - analog.price);
    const savingsPercent = isCheaper ? Math.round((savings / targetProduct.price) * 100) : 0;

    return {
      ...analog,
      isCheaper,
      savings,
      savingsPercent,
      inStock: available > 0,
      availableQuantity: available,
      totalAvailableAcrossBranches: totalAvailable,
    };
  });

  const cheaperAnalogs = enriched.filter((a) => a.isCheaper);
  const maxSavings = cheaperAnalogs.length > 0 ? cheaperAnalogs[0].savings : 0;
  const maxSavingsPercent = cheaperAnalogs.length > 0 ? cheaperAnalogs[0].savingsPercent : 0;

  return {
    product: targetProduct,
    hasCheaperAlternative: cheaperAnalogs.length > 0,
    cheaperCount: cheaperAnalogs.length,
    maxSavings,
    maxSavingsPercent,
    analogs: enriched,
  };
}

describe("Phase 16: Smart Generic Substitution & Analogs Engine", () => {
  const catalog: Product[] = [
    {
      id: 1,
      nameUz: "Nurofen 200 mg",
      nameRu: "Нурофен 200 мг",
      price: 28000,
      analogGroup: "analgesic",
      category: "Og‘riq va isitma",
      manufacturer: "Reckitt",
    },
    {
      id: 2,
      nameUz: "Ibuprofen 400 mg",
      nameRu: "Ибупрофен 400 мг",
      price: 14000,
      analogGroup: "analgesic",
      category: "Og‘riq va isitma",
      manufacturer: "Bosnalijek",
    },
    {
      id: 3,
      nameUz: "Paratsetamol 500 mg",
      nameRu: "Парацетамол 500 мг",
      price: 8000,
      analogGroup: "analgesic",
      category: "Og‘riq va isitma",
      manufacturer: "Nika Pharm",
    },
    {
      id: 4,
      nameUz: "Klaritin 10 mg",
      nameRu: "Кларитин 10 мг",
      price: 34000,
      analogGroup: "allergy",
      category: "Allergiya",
      manufacturer: "Bayer",
    },
  ];

  const stocks: ProductStock[] = [
    { productId: 2, branchId: 1, physicalQuantity: 15, reservedQuantity: 2 },
    { productId: 3, branchId: 1, physicalQuantity: 50, reservedQuantity: 0 },
    { productId: 3, branchId: 2, physicalQuantity: 20, reservedQuantity: 5 },
  ];

  it("identifies cheaper alternatives for expensive brand Nurofen", () => {
    const nurofen = catalog[0];
    const result = computeSmartAnalogs(nurofen, catalog, stocks);

    assert.equal(result.hasCheaperAlternative, true);
    assert.equal(result.cheaperCount, 2);
    // Cheapest is Paratsetamol at 8000: saves 28000 - 8000 = 20000 UZS (71%)
    assert.equal(result.maxSavings, 20000);
    assert.equal(result.maxSavingsPercent, 71);
    assert.equal(result.analogs[0].id, 3);
    assert.equal(result.analogs[0].savings, 20000);
    assert.equal(result.analogs[1].id, 2);
    assert.equal(result.analogs[1].savings, 14000);
  });

  it("checks stock availability correctly across branches", () => {
    const nurofen = catalog[0];
    const result = computeSmartAnalogs(nurofen, catalog, stocks, 1);

    const paracetamol = result.analogs.find((a) => a.id === 3)!;
    assert.equal(paracetamol.inStock, true);
    assert.equal(paracetamol.availableQuantity, 50);

    const ibuprofen = result.analogs.find((a) => a.id === 2)!;
    assert.equal(ibuprofen.inStock, true);
    assert.equal(ibuprofen.availableQuantity, 13); // 15 - 2
  });

  it("handles products with no cheaper alternatives gracefully", () => {
    const paracetamol = catalog[2]; // 8000 is already the cheapest
    const result = computeSmartAnalogs(paracetamol, catalog, stocks);

    assert.equal(result.hasCheaperAlternative, false);
    assert.equal(result.cheaperCount, 0);
    assert.equal(result.maxSavings, 0);
  });
});

describe("Phase 16: Family Health Profile & Caregiver Alerts", () => {
  interface FamilyMember {
    id: number;
    customerId: number;
    fullName: string;
    relationship: "father" | "mother" | "child" | "spouse" | "other";
    birthDate: string | null;
    notifyCaregiver: boolean;
  }

  interface Reminder {
    id: number;
    familyMemberId: number | null;
    medicineName: string;
    currentStock: number;
    lowStockThreshold: number;
    refillReminderEnabled: boolean;
  }

  function computeCaregiverAlerts(member: FamilyMember, reminders: Reminder[]) {
    const memberReminders = reminders.filter((r) => r.familyMemberId === member.id);
    const lowStockItems = memberReminders.filter(
      (r) => r.currentStock <= r.lowStockThreshold && r.refillReminderEnabled
    );

    const needsAlert = lowStockItems.length > 0 && member.notifyCaregiver;
    const alertMessage = needsAlert
      ? `${member.fullName} uchun ${lowStockItems.length} ta dori tugamoqda!`
      : null;

    return {
      memberId: member.id,
      memberName: member.fullName,
      relationship: member.relationship,
      activeRemindersCount: memberReminders.length,
      lowStockCount: lowStockItems.length,
      needsAlert,
      alertMessage,
      items: lowStockItems,
    };
  }

  it("generates caregiver alert when an elder's medicine is running out", () => {
    const father: FamilyMember = {
      id: 10,
      customerId: 1,
      fullName: "Abdulla ota",
      relationship: "father",
      birthDate: "1955-08-15",
      notifyCaregiver: true,
    };

    const reminders: Reminder[] = [
      {
        id: 101,
        familyMemberId: 10,
        medicineName: "Enap 10 mg (Qon bosimi)",
        currentStock: 3,
        lowStockThreshold: 5,
        refillReminderEnabled: true,
      },
      {
        id: 102,
        familyMemberId: 10,
        medicineName: "Kardiomagnil 75 mg",
        currentStock: 25,
        lowStockThreshold: 5,
        refillReminderEnabled: true,
      },
    ];

    const alert = computeCaregiverAlerts(father, reminders);
    assert.equal(alert.needsAlert, true);
    assert.equal(alert.activeRemindersCount, 2);
    assert.equal(alert.lowStockCount, 1);
    assert.equal(alert.alertMessage, "Abdulla ota uchun 1 ta dori tugamoqda!");
    assert.equal(alert.items[0].medicineName, "Enap 10 mg (Qon bosimi)");
  });

  it("does not generate caregiver alert if notifyCaregiver is false", () => {
    const child: FamilyMember = {
      id: 11,
      customerId: 1,
      fullName: "Temurbek",
      relationship: "child",
      birthDate: "2015-05-20",
      notifyCaregiver: false,
    };

    const reminders: Reminder[] = [
      {
        id: 103,
        familyMemberId: 11,
        medicineName: "Vitamin C",
        currentStock: 2,
        lowStockThreshold: 5,
        refillReminderEnabled: true,
      },
    ];

    const alert = computeCaregiverAlerts(child, reminders);
    assert.equal(alert.needsAlert, false);
    assert.equal(alert.alertMessage, null);
  });
});
