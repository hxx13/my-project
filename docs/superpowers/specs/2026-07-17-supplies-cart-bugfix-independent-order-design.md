# Supplies Cart Bugfix + Independent Order Feature

**Date:** 2026-07-17
**Status:** Approved → Implementation

## Overview

Three items for the staff supplies (物资领用) system in the WeChat mini-program:

1. **Bug Fix 1**: Cart cache leak when entering via revise-claim deep link then navigating away without submitting
2. **Bug Fix 2**: Missing "clear all" button in cart sheet popup
3. **Feature**: `independentOrder` flag on items — when set, item must be its own claim, cannot mix with others

## Bug Fix 1 — Cart Cache Leak

### Root Cause

`aroapp/miniprogram/package-feature/pages/supplies/index.js`

When a user enters via `reviseClaimId` (deep link from "modify claim"):
1. `maybeBootstrapReviseClaim()` loads claim items into cart, sets `claimReviseOrderId`
2. User navigates away → `_navOutToSubPage = true`
3. On return, `pullCartFromServer()` is called but line 819 checks:
   ```js
   if (String(this.data.claimReviseOrderId || '').trim()) return;
   ```
   → early return, cart never refreshed from server
4. Local cart retains the revise-claim items permanently

### Fix

In `onShow()`, when `_navOutToSubPage === true`, clear `claimReviseOrderId` before calling `pullCartFromServer()`. This abandons the revise flow on navigation exit.

**File:** `aroapp/miniprogram/package-feature/pages/supplies/index.js`
**Lines:** ~3 added in the `_navOutToSubPage` branch of `onShow()`

## Bug Fix 2 — Clear Cart Button

### Current State

Cart sheet (`index.wxml` lines 241-247) footer has only "收起" and "去提交".

### Fix

Add "清空" button to `sheet-foot`. On tap: confirm dialog → clear local + remote cart.

**Files:**
- `supplies/index.wxml` — add "清空" button in `sheet-foot`
- `supplies/index.js` — add `clearCart()` method
- `supplies/index.wxss` — minor style for new button

## Feature — Independent Order (`independentOrder`)

### Behavior

When submitting a claim:
- If cart has independent items + other items → auto-split into N claims
- Each independent item → its own claim
- All non-independent items → merged into one claim
- If all items are independent → each gets its own claim
- Show toast: "检测到独立下单物资，已自动拆分为 N 单"

### Data Model

New column on both `supply_item` and `material_item`:
```sql
ALTER TABLE supply_item ADD COLUMN independent_order TINYINT NOT NULL DEFAULT 0;
ALTER TABLE material_item ADD COLUMN independent_order TINYINT NOT NULL DEFAULT 0;
```

### Backend Changes (Supplies — Staff)

| File | Change |
|------|--------|
| `SupplyItem.java` | Add `private Integer independentOrder;` |
| `SupplyItemUpsertRequest.java` | Add `private Integer independentOrder;` |
| `SupplyItemView.java` | Add `private Integer independentOrder;` |
| `SupplyItemMapper.xml` | Add `independent_order` to all column lists |
| `SuppliesService.java` | `createClaim()` + `revisePendingClaimLines()`: split logic |
| SQL migration | `V{ts}__supply_item_independent_order.sql` |

### Backend Changes (Material — Student)

| File | Change |
|------|--------|
| `MaterialItem.java` | Add `private Integer independentOrder;` |
| `MaterialItemUpsertReq.java` | Add `private Integer independentOrder;` |
| `MaterialItemView.java` | Add `private Integer independentOrder;` |
| Material Mapper XML | Add `independent_order` to all column lists |
| `MaterialService.java` | `createRequest()`: split logic |
| SQL migration | `V{ts}__material_item_independent_order.sql` |

### Mini-Program Changes

| File | Change |
|------|--------|
| `materialAdmin/index.js` | Form state: `independentOrder` field + submit inclusion |
| `materialAdmin/index.wxml` | Switch UI for independent order in create/edit form |
| `supplies/index.js` | Pre-submit check: detect independent items, warn about split |

### Web Frontend Changes

| File | Change |
|------|--------|
| `MaterialManagePage.tsx` | Add independent order switch in item form |
| `AdminSuppliesManagePage.tsx` | Add independent order switch in item form |

### Split Logic (SuppliesService.createClaim)

```
function createClaim(user, req):
  lines = validateLines(req)
  independent = lines.filter(l -> item(l).independentOrder == 1)
  regular = lines.filter(l -> item(l).independentOrder != 1)

  results = []
  for each independent line:
    results.push(createSingleClaim(user, [line]))
  if regular not empty:
    results.push(createSingleClaim(user, regular))

  return results (multi-claim)
```

### Item Count Limit

Independent items cap: `MAX_INDEPENDENT_SPLITS = 10` to prevent abuse.

## Files NOT Changed

- Cloud functions — no changes needed
- Notification system — split claims generate standard notifications
- PDF export — unchanged, per-claim export still works
- `suppliesAdmin` mini-program page — independent order config is on `materialAdmin` page for supplies items (same form pattern)

## Verification Checklist

- [ ] Bug 1: Enter revise → navigate away → return → cart is user's own (not claim items)
- [ ] Bug 2: Cart sheet shows "清空" button, clears all items
- [ ] Feature: Create item with independentOrder=1, verify it appears in cart
- [ ] Feature: Cart with [independent A, regular B, regular C] → submit → 2 claims created
- [ ] Feature: Cart with [independent A, independent B] → submit → 2 claims created
- [ ] Feature: Cart with [regular B, regular C] → submit → 1 claim (no regression)
- [ ] Feature: Web admin form has independent order switch
- [ ] Feature: Mini-program admin form has independent order switch
