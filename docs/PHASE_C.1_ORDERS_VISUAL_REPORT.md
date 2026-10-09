# PHASE C.1 — ORDERS SCREEN VISUAL QA & RIGHT-EDGE LAYOUT FIX REPORT

**Date:** 2026-10-08
**Scope:** Mobile UI — Orders (Buyurtmalar) Screen (rtifacts/soglom-apteka/app/(tabs)/purchases.tsx)
**Verdict:** **PASS WITH BLOCKERS** (Visual defect resolved cleanly; external providers and production staging prerequisites remain tracked blockers)

---

## 1. Root Cause Analysis

### A. Right Edge Crowding on Order Amounts
In rtifacts/soglom-apteka/app/(tabs)/purchases.tsx, the OrderCard component previously laid out order metadata and total monetary values using:
`	sx
<View style={styles.metaRow}>
  <View style={styles.metaLeft}>
    {placeLine ? <Text style={styles.metaText}>{placeLine}</Text> : null}
    {qtyTotal > 0 ? <Text style={styles.metaText}>{qtyTotal}</Text> : null}
  </View>
  <Text style={styles.totalValue}>{totalLabel}</Text>
</View>
`
With styles:
`	s
card: { padding: 14 },
metaRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
totalValue: { fontFamily: 'Inter_700Bold', fontSize: 16, maxWidth: '46%', textAlign: 'right' }
`
**Why this failed visually:**
1. Symmetrical padding of 14px on the card did not provide visual optical balance for bold text (Inter_700Bold), creating an illusion that the amount text (91 700 so'm, 45 800 so'm) was jammed directly against the card border.
2. The Text component was directly inside the metaRow without a dedicated right-aligned container (	otalCol), causing alignment inconsistencies when the left text wrapped or resized across 360px, 375px, and 390px viewports.

### B. Title Clipping / Safe Area Inset Vulnerability
The top title Buyurtmalar used:
`	s
topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
`
On notched mobile devices and certain browser web viewports, an 8px or 12px fallback caused the 28px bold header (Inter_700Bold, line height 34px) to render too close to status bar cutouts or upper container boundaries.

---

## 2. Structural Layout Solution (No Margin Hacks)

### A. OrderCard Asymmetric Protection & Dedicated Total Column
Instead of arbitrary margin hacks, the layout was refactored structurally:
1. **Asymmetric Card Padding:**
   `	s
   card: {
     backgroundColor: CARD,
     borderRadius: 16,
     borderWidth: 1,
     borderColor: BORDER,
     paddingTop: 15,
     paddingBottom: 15,
     paddingLeft: 16,
     paddingRight: 18, // Dedicated optical breathing room from card border
   }
   `
2. **Dedicated 	otalCol Structural Container:**
   `	sx
   <View style={styles.metaRow}>
     <View style={styles.metaLeft}>
       {placeLine ? (
         <Text style={styles.metaText} numberOfLines={2}>
           {placeLine}
         </Text>
       ) : null}
       {qtyTotal > 0 ? (
         <Text style={styles.metaText} numberOfLines={1}>
           {t('orders.itemsCount', { count: qtyTotal })}
         </Text>
       ) : null}
     </View>
     <View style={styles.totalCol}>
       <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
         {totalLabel}
       </Text>
     </View>
   </View>
   `
3. **Container Flex and Spacing Rules:**
   `	s
   metaRow: {
     flexDirection: 'row',
     alignItems: 'flex-end',
     justifyContent: 'space-between',
     gap: 12,
     marginBottom: 10,
   },
   metaLeft: { flex: 1, minWidth: 0, gap: 2 },
   totalCol: {
     flexShrink: 0,
     alignItems: 'flex-end',
     justifyContent: 'flex-end',
     paddingLeft: 4,
     maxWidth: '48%',
   },
   totalValue: {
     fontFamily: 'Inter_700Bold',
     fontSize: 16,
     lineHeight: 21,
     color: PURPLE_DEEP,
     textAlign: 'right',
   },
   `

### B. Safe Area & Header Inset Hardening
Updated PurchasesScreen:
`	s
const topPad = Platform.OS === 'web' ? 16 : Math.max(insets.top, 16) + 4;
`
And added proper semantic header accessibility:
`	sx
<Text style={styles.pageTitle} accessibilityRole=header>
  {t('common.navOrders')}
</Text>
`

---

## 3. Responsive Screen Width & Localization Verification

The layout has been verified across key mobile dimensions:
- **360px (Narrow Android):** Amount column is constrained to max 48% width with automatic font scaling (down to 0.8 scale if required), ensuring zero overflow and clear right-side breathing room.
- **375px (iPhone SE / Standard):** Ample room for both branch details / item count on the left and full XX XXX so'm on the right with 18px card edge margin.
- **390px (iPhone 13 / 14 / 15):** Generous breathing room across all status chips and currency values.
- **Languages (UZ / RU / EN):** Clean handling of Buyurtmalar (UZ), Заказы (RU), and Orders (EN) without title clipping or pill badge overlap.

---

## 4. Invariant Preservation & Status Chip Logic

1. **Cancelled Orders:**
   - Never display a misleading To'lov kutilmoqda (Pending Payment) chip when an order is cancelled.
   - Only display refund status chips (Qaytarildi) when refund accounting has occurred.
2. **Active Orders:**
   - Display urgent payment action chip only when PENDING or FAILED and user action is required.
3. **No Commits / No Pushes:**
   - All changes preserved in working tree.
   - git diff --check passed cleanly with 0 whitespace or formatting errors.

---

## 5. Verification Results

| Suite / Check | Command | Result |
| :--- | :--- | :--- |
| **Mobile Test Suite** | pnpm --filter soglom-apteka test | **107 / 107 PASS** (0 failures) |
| **Full Workspace Typecheck** | pnpm run typecheck | **0 errors across 5 projects** |
| **Git Diff Quality Check** | git diff --check | **0 errors / clean** |
