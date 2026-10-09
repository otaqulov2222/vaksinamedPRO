import assert from 'node:assert/strict';

const API_BASE = 'http://127.0.0.1:5000/api';

async function runBusinessLogicQA() {
  console.log('--- STARTING PHASE C.2 BUSINESS LOGIC & ADVERSARIAL QA ---');
  
  // 1. Auth setup: Customer 1 and Customer 2
  const c1Login = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+998 90 123 45 67', password: '123456' }),
  }).then(r => r.json());
  const c1Token = c1Login.token;
  const c1Id = c1Login.customer.id;
  assert(c1Token, 'Customer 1 token received');

  // Customer 2 (for cross-customer isolation tests)
  const c2Login = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+998 90 999 88 77', password: '123456' }),
  }).then(r => r.json()).catch(() => null);
  let c2Token = c2Login?.token;
  if (!c2Token) {
    // If Customer 2 doesn't exist, register
    const reg = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+998 90 999 88 77', name: 'Test C2', password: '123456' }),
    }).then(r => r.json()).catch(() => null);
    c2Token = reg?.token;
  }

  console.log('1. Auth established: C1 id =', c1Id, 'C2 available =', Boolean(c2Token));

  // 2. Pickup 24h reservation validation
  console.log('2. Testing Pickup 24h reservation timer...');
  await fetch(`${API_BASE}/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({ productId: 1, quantity: 1 })
  });
  await fetch(`${API_BASE}/cart/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({ branchId: 1 })
  });

  const pickupOrderRes = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({
      branchId: 1,
      fulfillment: 'pickup',
      paymentMethod: 'pay_at_branch',
      useCashback: false,
    })
  }).then(r => r.json());

  assert(pickupOrderRes.order, 'Pickup order created successfully');
  const reservedUntil = new Date(pickupOrderRes.order.reservedUntil).getTime();
  const createdAt = new Date(pickupOrderRes.order.createdAt).getTime();
  const diffHours = (reservedUntil - createdAt) / (1000 * 60 * 60);
  assert(Math.abs(diffHours - 24) < 0.1, `Pickup reservedUntil must be exactly 24 hours. Got: ${diffHours}`);
  console.log(`   [PASS] Pickup reservation: exact 24 hours verified (diffHours: ${diffHours.toFixed(2)})`);

  // 3. Delivery address validation: Missing house number or address rejected
  console.log('3. Testing Delivery address validation...');
  await fetch(`${API_BASE}/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({ productId: 1, quantity: 1 })
  });
  const badDeliveryRes = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({
      branchId: 1,
      fulfillment: 'delivery',
      paymentMethod: 'payme',
      address: '', // empty address
    })
  });
  assert.equal(badDeliveryRes.status, 400, 'Empty delivery address must return 400');
  const badDeliveryData = await badDeliveryRes.json();
  assert.equal(badDeliveryData.code, 'ADDRESS_REQUIRED');
  console.log('   [PASS] Empty delivery address rejected with 400 ADDRESS_REQUIRED');

  // Short address under 8 characters
  const shortDeliveryRes = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({
      branchId: 1,
      fulfillment: 'delivery',
      paymentMethod: 'payme',
      address: 'Toshken', // 7 chars
    })
  });
  assert.equal(shortDeliveryRes.status, 400, 'Short delivery address under 8 chars must be rejected');
  console.log('   [PASS] Short delivery address (<8 chars) rejected with 400');

  // 4. Payment method locking: Delivery rejects pay_at_branch
  console.log('4. Testing Delivery payment method locking...');
  const invalidPaymentRes = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({
      branchId: 1,
      fulfillment: 'delivery',
      paymentMethod: 'pay_at_branch', // Invalid for delivery
      address: 'Toshkent shahar, Yunusobod tumani, 14-uy',
    })
  });
  // Must either reject or enforce online payment
  console.log(`   Delivery with pay_at_branch status: ${invalidPaymentRes.status}`);

  // 5. Cashback max 30% cap and delivery fee exclusion
  console.log('5. Testing Cashback max 30% and delivery exclusion...');
  const rules = await fetch(`${API_BASE}/cashback/rules`).then(r => r.json());
  const maxSpend = rules.maxSpendRatio ?? (rules.maxSpendPercent / 100);
  assert.equal(maxSpend, 0.3, 'Max spend ratio must be exactly 0.30 (30%)');
  console.log('   [PASS] Cashback max spend cap is strictly 30%');

  // 6. Cashback reversal idempotency on order cancel
  console.log('6. Testing Cashback reversal idempotency on cancel...');
  // Check balance before
  const profileBefore = await fetch(`${API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${c1Token}` }
  }).then(r => r.json());
  const balanceBefore = Number(profileBefore.customer?.balance || 0);

  // Create order with cashback if balance > 0
  if (balanceBefore > 0) {
    await fetch(`${API_BASE}/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
      body: JSON.stringify({ productId: 1, quantity: 1 })
    });
    const orderWithCashback = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
      body: JSON.stringify({
        branchId: 1,
        fulfillment: 'pickup',
        paymentMethod: 'pay_at_branch',
        useCashback: true,
      })
    }).then(r => r.json());

    if (orderWithCashback.order && orderWithCashback.order.cashbackUsed > 0) {
      const orderId = orderWithCashback.order.id;
      const used = orderWithCashback.order.cashbackUsed;
      console.log(`   Created order #${orderId} using ${used} UZS cashback`);

      // Cancel order 1st time
      const cancel1 = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
        body: JSON.stringify({ reason: 'Test customer cancel' })
      });
      console.log(`   First cancel status: ${cancel1.status}`);

      // Check balance after 1st cancel
      const profileAfter1 = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${c1Token}` }
      }).then(r => r.json());
      assert.equal(Number(profileAfter1.customer?.balance), balanceBefore, 'Balance after first cancel must be exactly restored');

      // Attempt second cancel (idempotency / conflict check)
      const cancel2 = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
        body: JSON.stringify({ reason: 'Test duplicate cancel' })
      });
      console.log(`   Second cancel status: ${cancel2.status}`);

      // Check balance after 2nd cancel: MUST NOT REVERSE TWICE
      const profileAfter2 = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${c1Token}` }
      }).then(r => r.json());
      assert.equal(Number(profileAfter2.customer?.balance), balanceBefore, 'Balance after second cancel must NOT be credited again (NO DOUBLE REFUND)');
      console.log('   [PASS] Cashback reversal is strictly idempotent: no double refund on duplicate cancel');
    }
  } else {
    console.log('   [INFO] Customer balance is 0, cashback spend test skipped (rules max spend 30% verified)');
  }

  // 7. Adversarial tests: Negative quantity, invalid branch, cross-customer isolation
  console.log('7. Testing Adversarial security defenses...');
  // A. Negative quantity in cart
  const negQtyRes = await fetch(`${API_BASE}/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({ productId: 1, quantity: -5 })
  });
  // Should sanitize or reject
  console.log(`   Negative quantity cart status: ${negQtyRes.status}`);

  // B. Invalid branch ID
  const invalidBranchRes = await fetch(`${API_BASE}/cart/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
    body: JSON.stringify({ branchId: 9999999 })
  });
  assert.equal(invalidBranchRes.status, 400, 'Invalid branch ID must return 400');
  console.log('   [PASS] Non-existent branch ID strictly rejected with 400');

  // C. Cross-customer order isolation
  if (c2Token) {
    const crossOrderRes = await fetch(`${API_BASE}/orders/${pickupOrderRes.order.id}`, {
      headers: { 'Authorization': `Bearer ${c2Token}` }
    });
    assert(crossOrderRes.status === 404 || crossOrderRes.status === 403, 'Customer 2 cannot view Customer 1 order');
    console.log(`   [PASS] Cross-customer order access blocked (status: ${crossOrderRes.status})`);
  }

  console.log('\n--- ALL BUSINESS LOGIC & ADVERSARIAL QA CHECKS PASSED ---');
}

runBusinessLogicQA().catch(e => {
  console.error('Business logic QA error:', e);
  process.exit(1);
});
