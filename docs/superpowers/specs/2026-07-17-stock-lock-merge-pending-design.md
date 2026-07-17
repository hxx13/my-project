# Stock Lock on Pending Claims + Merge-Into-Pending-Order Prompt

**Date:** 2026-07-17
**Status:** Approved → Implementation
**Builds on:** 2026-07-17-supplies-cart-bugfix-independent-order-design.md

## Part A — Supplies Stock Locking (new)

Staff supplies claims currently deduct stock only at fulfillment. Add pre-locking at submit so pending claims reserve stock.

### Data Model

`supply_item.locked_qty INT NOT NULL DEFAULT 0` (mirrors material's `lockedQty` pattern).
Available = `stock_qty - locked_qty` (QUANTIFIED mode only; FLAG mode ignores locking).

Migration backfills `locked_qty` from existing non-deleted PENDING claims so
pre-feature pending orders participate in the release lifecycle correctly.

### Lock Lifecycle

| Event | Action |
|---|---|
| createClaim (PENDING) | Atomic lock per line: `UPDATE ... SET locked_qty = locked_qty + qty WHERE (stock_qty - locked_qty) >= qty`; 0 rows → 库存不足, transaction rolls back |
| withdraw | Release all locks of the order's lines |
| deleteClaimOrder (→ recycle) | Release (only if status was PENDING) |
| restore from recycle | Re-lock without availability check (over-lock allowed; available floors at 0) |
| revisePendingClaimLines | Release old lines' locks → lock new lines (atomic check) |
| fulfill | `stock_qty -= fulfilledQty` AND release each line's full requested lock (granted or not) |
| FLAG mode | Never locked |

Release uses `GREATEST(0, locked_qty - qty)` to guard underflow.

### API Surface

`SupplyItemView` gains `lockedQty` and `availableQty` (= max(0, stockQty - lockedQty) for QUANTIFIED; = stockQty for FLAG).
Mall frontends show availableQty as 库存 and cap quantity by it; admin surfaces show both.

## Part B — Merge Prompt (supplies: mini-program mall + web mall)

On submit (NOT in revise mode): fetch own pending claims
(`GET /api/supplies/claims/mine?status=PENDING`). If any:

Dialog: 「您还有待处理的订单，是否合并？」 — lists pending claims (id, time, line count), user picks one.
Buttons: [合并到选中单] / [直接新建] / [取消].

- Merge: `GET /api/supplies/claims/{id}` → existing lines (itemId, qty, specSnapshot, remark)
  concatenated with cart lines → `PUT /api/supplies/claims/{id}/lines`.
  Backend merges by (itemId, spec) composite key and auto-splits independent items
  (existing revise logic — splitCount/splitOrderIds in response, split toast).
  On success: clear durable cart (local + remote) as a normal submit does.
- 直接新建: existing POST /claims flow.
- Already in revise mode (claimReviseOrderId set): skip the merge prompt entirely.

No new supplies backend endpoint needed.

## Part C — Material Merge (student mini-program)

Material has approval workflow + reviewer-group splitting and no revise endpoint.

### Rules

- Merge target must be status PENDING (待审) only. FIRST_OK (复审中) excluded — merging would bypass completed first review.
- New endpoint: `POST /api/material/requests/{id}/merge` body `{ lines: [{itemId, qty, specSnapshot?, remark?}] }`
  - Lines whose reviewer-group key matches the target request's group → appended to the target (locks stock for appended lines, same merge-by-(item,spec) semantics)
  - All other lines (different reviewer group, independent-order items with their |IND: group) → routed through the normal createRequest grouping, producing new requests
  - Response: `Result<List<MaterialRequestView>>` — affected + newly created requests
  - Pre-validate everything before any write (no partial commit); owner-only; target must be PENDING and not deleted
- Frontend: studentMaterial mini-program submit flow gets the same merge dialog
  (`GET /api/material/requests/mine?status=PENDING` to list targets).

## Verification Checklist

- [ ] Submit claim → item availableQty drops; second user cannot over-order
- [ ] Withdraw/delete → available restored; restore from recycle → locked again
- [ ] Revise/merge → locks track the new line set
- [ ] Fulfill → stock deducted once, locks fully released (no residue)
- [ ] Pre-feature pending claims: backfilled locks release correctly on fulfill/withdraw
- [ ] Merge dialog appears only when own PENDING claims exist and not in revise mode
- [ ] Merge respects independent-order splitting; toast reports splits
- [ ] Material merge: same-group append + different-group new requests; FIRST_OK rejected
- [ ] mvnw compile, tsc -b, node --check all pass
