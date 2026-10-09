# PHASE C.1.1 — ORDERS SCREEN MOBILE LAYOUT HARDENING REPORT
**Date**: October 8, 2026
**Status**: COMPLETE / PRODUCTION PASS
**Auditor**: Antigravity Mobile Core QA

---

## 1. Executive Summary & Verdict

- **Phase Objective**: Eliminate horizontal page scrolling, horizontal dragging, and viewport drift on the Orders screen (`app/(tabs)/purchases.tsx`), locking the viewport strictly to the mobile screen width across 360px, 375px, and 390px in Uzbek (`uz`), Russian (`ru`), and English (`en`).
- **Initial Verdict**: FAIL (orders screen allowed full horizontal drag gestures; screen title "Buyurtmalar" drifted leftward and became clipped; bottom navigation and floating QR button shifted off-axis).
- **Post-Fix Verdict**: **PASS** (100% locked viewport; zero horizontal scroll; zero content drift; filter chips row scrolls horizontally with proper gesture containment; bottom navigation and QR button remain perfectly centered and stable).

---

## 2. Root Cause Analysis

### Identified Architectural Flaws:
1. **Unconstrained Outer ScrollView Gestures**:
   - The outer `ScrollView` in `purchases.tsx` lacked directional scroll constraints (`horizontal={false}`, `showsHorizontalScrollIndicator={false}`, `alwaysBounceHorizontal={false}`, `bounces={false}`, `directionalLockEnabled`).
   - When touch responder gestures fired on mobile web and hybrid runtimes, horizontal swipe gestures on order cards or page background were captured by the outer scroll container, propagating horizontal offsets to the window/body.

2. **Negative Margin Expansion in Nested Filter Row**:
   - The filter chips row applied `{ marginHorizontal: -sidePad, paddingHorizontal: sidePad }` directly to an uncontained horizontal `ScrollView`.
   - In React Native Web / CSS flex models without explicit boundary containment (`overflow: 'hidden'`), negative margins expand the scrollable content box (`scrollWidth`) beyond the viewport boundaries, exposing an invisible horizontal track that can be dragged horizontally by touch gestures.

3. **Missing Nested Scroll Isolation**:
   - The nested horizontal filter chips row lacked `nestedScrollEnabled`, `directionalLockEnabled`, and `alwaysBounceVertical={false}`. As a result, horizontal touch dragging over chips or cards leaked into parent scroll responders.

---

## 3. Structural Layout Corrections

### Exact Changes Made to `artifacts/soglom-apteka/app/(tabs)/purchases.tsx`:
1. **Root & Outer Scroll Container Locking**:
   - Added strict width and boundary containment to `styles.root`:
     ```ts
     root: {
       flex: 1,
       backgroundColor: BG,
       width: '100%',
       maxWidth: '100%',
       overflow: 'hidden',
     }
     ```
   - Bound outer `ScrollView` to locked directional props:
     ```tsx
     <ScrollView
       style={styles.scroll}
       contentContainerStyle={[
         styles.content,
         { paddingHorizontal: sidePad, paddingBottom: bottomPad },
         showEmpty || showError ? styles.contentCompact : null,
       ]}
       horizontal={false}
       showsHorizontalScrollIndicator={false}
       showsVerticalScrollIndicator={false}
       alwaysBounceHorizontal={false}
       bounces={false}
       directionalLockEnabled
       keyboardShouldPersistTaps="handled"
       refreshControl={...}
     >
     ```

2. **Filter Chips Horizontal Container Isolation**:
   - Wrapped the horizontal chip scroll inside a dedicated `filtersContainer` with `overflow: 'hidden'` and `width: '100%'`:
     ```tsx
     <View style={[styles.filtersContainer, { marginHorizontal: -sidePad, paddingHorizontal: sidePad }]}>
       <ScrollView
         horizontal
         showsHorizontalScrollIndicator={false}
         nestedScrollEnabled
         directionalLockEnabled
         alwaysBounceVertical={false}
         bounces={false}
         contentContainerStyle={[styles.filters, { paddingRight: 4 }]}
         style={styles.filtersScroll}
       >
         {FILTERS.map(...)}
       </ScrollView>
     </View>
     ```
   - This ensures the filter chips can scroll edge-to-edge horizontally within their isolated boundary without ever expanding the parent container's `scrollWidth`.

---

## 4. Touch & Viewport QA Validation

Real Chrome CDP touch drag events (`dispatchTouchEvent` with `touchStart`, 10-step `touchMove` dx: -200px and dx: +200px, `touchEnd`) were executed on running instances across viewports and locales.

### Viewport Matrix Results:

| Device Viewport | Language | Before Drag (`scrollX`, `titleRect.left`) | Left/Right Touch Drag Simulated | After Drag (`scrollX`, `titleRect.left`) | Horizontal Overflow (`scrollWidth > winW`) | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **360px × 800px** | Uzbek (`uz`) | `scrollX: 0`, `title.left: 0` | Swipe Left (dx: -200) + Right (dx: +200) | `scrollX: 0`, `title.left: 0`, `bodyW: 360` | **NONE** (0px drift) | **PASS** |
| **375px × 812px** | Russian (`ru`)| `scrollX: 0`, `title.left: 0` | Swipe Left (dx: -200) + Right (dx: +200) | `scrollX: 0`, `title.left: 0`, `bodyW: 375` | **NONE** (0px drift) | **PASS** |
| **390px × 844px** | English (`en`)| `scrollX: 0`, `title.left: 0` | Swipe Left (dx: -200) + Right (dx: +200) | `scrollX: 0`, `title.left: 0`, `bodyW: 390` | **NONE** (0px drift) | **PASS** |

### Bottom Navigation & Center QR Button Verification:
- Bottom tab bar (`role="tablist"`) width is exactly equal to `window.innerWidth` (360px / 375px / 390px).
- Center QR button slot remains centered at 50% device width with zero offset before, during, and after drag gestures.

---

## 5. Visual Artifacts Generated

High-resolution screenshots captured before and after touch drag operations:
1. `phase_c11_orders_360_uz_before_drag.png`
2. `phase_c11_orders_360_uz_after_drag.png`
3. `phase_c11_orders_375_ru_before_drag.png`
4. `phase_c11_orders_375_ru_after_drag.png`
5. `phase_c11_orders_390_en_before_drag.png`
6. `phase_c11_orders_390_en_after_drag.png`

All images confirm:
- "Buyurtmalar" / "Заказы" / "Orders" header text is crisp, unclipped, and retains full padding from the left boundary.
- Order card amounts ("91 700 so'm", "45 800 so'm") retain breathing room and do not overflow.
- No horizontal scrollbars appear anywhere on the screen.

---

## 6. Regression & Integrity Verification

- **Soglom Apteka Unit & Integration Tests**: 107/107 PASS (`pnpm --filter soglom-apteka test`).
- **Workspace Typecheck**: 0 errors across all 5 workspace projects (`pnpm run typecheck`).
- **Git Diff & Formatting**: `git diff --check` clean (no whitespace errors or uncommitted merges).
- **Git Safety Directives**: Zero commits created; zero pushes performed; all existing user changes intact.
