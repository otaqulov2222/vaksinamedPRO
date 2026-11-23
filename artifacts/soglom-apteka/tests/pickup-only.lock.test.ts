/**
 * Product lock: home delivery + delivery address map are OUT of scope.
 * Checkout is pickup-only. Pharmacy branch map (Dorixonalar) remains.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Pickup-only product lock (no home delivery)', () => {
  it('checkout hard-codes fulfillment pickup and has no delivery mode UI', () => {
    const checkout = read('app/checkout.tsx');
    assert.match(checkout, /fulfillment:\s*'pickup'/);
    assert.doesNotMatch(checkout, /fulfillment:\s*'delivery'/);
    assert.doesNotMatch(checkout, /DeliveryMapPicker|InteractiveMapPicker|checkoutDeliveryTitle/);
    assert.doesNotMatch(checkout, /setFulfillment|fulfillmentMode|deliveryAddress/);
  });

  it('cart summary is pickup-only', () => {
    const cart = read('app/cart.tsx');
    assert.match(cart, /fulfillmentTypeLabel\(t,\s*'pickup'\)/);
    assert.doesNotMatch(cart, /fulfillmentTypeLabel\(t,\s*'delivery'\)/);
    assert.doesNotMatch(cart, /DeliveryMapPicker|InteractiveMapPicker/);
  });

  it('Manzillarim is selected-branch only — no courier address CRUD', () => {
    const addresses = read('app/addresses.tsx');
    assert.match(addresses, /Home delivery remains disabled|Pickup-only/i);
    assert.doesNotMatch(addresses, /api\.getAddresses\(|api\.createAddress\(|DeliveryMapPicker/);
    assert.match(addresses, /profile\.selectedBranchTitle/);
  });

  it('dead delivery address map components are removed', () => {
    assert.equal(existsSync(path.join(root, 'components/DeliveryMapPickerModal.tsx')), false);
    assert.equal(existsSync(path.join(root, 'components/InteractiveMapPicker.tsx')), false);
    assert.equal(existsSync(path.join(root, 'components/InteractiveMapPicker.web.tsx')), false);
  });

  it('COD remains disabled in checkout payment options contract tests via i18n/status copy', () => {
    // Structural guard: no cash-on-delivery payment id in customer checkout.
    const checkout = read('app/checkout.tsx');
    assert.doesNotMatch(checkout, /cash_on_delivery|cod\b|naqd_yetkaz/i);
  });
});
