# 物资处理台增强 + 审计去重 — 设计文档

> **日期**：2026-06-12 | **状态**：已确认 | **分支**：feature/knowledge-digital-garden

## 配色约定
全程使用现有 `--twin-*` 令牌体系（`--twin-canvas` / `--twin-hairline` / `--twin-ink` / `--twin-mute` / `--twin-body` / `--twin-canvas-soft`），已适配亮色/暗色双主题。不引入新颜色令牌。

## 需求 1：缩略图展示

**改动**：`SupplyClaimLineView` +coverUrl；后端 toLineView() 查 item.coverUrl；Web + 小程序处理弹窗每行显示缩略图。

## 需求 2：出库备注

**改动**：`FulfillSupplyClaimRequest.Line` +remark；`supply_claim_line` 表 +remark 列；`SupplyClaimLine` entity +remark；`SupplyClaimLineView` +remark；fulfill 时 remark 同步写入 claim_line 和 inventory_movement；Web + 小程序增加备注输入框。

## 需求 3：修改领用单入口

**复用**：Web 处理弹窗增加"修改领用单"按钮，跳转 `/admin/supplies?reviseClaimId=<id>`，复用 `AdminSuppliesMallPage` 已有修订流程。小程序已有此功能无需改动。

## 需求 4：审计去重

**改动**：`listFulfilledHistoryByItemId` / `countFulfilledHistoryByItemId` SQL 增加 `NOT EXISTS (SELECT 1 FROM supply_inventory_movement m WHERE m.claim_line_id = l.id)`，排除已有库存流水的行。

## 改动清单

| 层 | 文件 | 改动 |
|----|------|------|
| Entity | `SupplyClaimLine.java` | +remark |
| DTO | `SupplyClaimLineView.java` | +coverUrl, +remark |
| DTO | `FulfillSupplyClaimRequest.java` | Line +remark |
| Service | `SuppliesService.java` | toLineView 查 coverUrl; fulfill 传 remark |
| Mapper XML | `SupplyClaimLineMapper.xml` | insert/resultMap +remark; listFulfilledHistory +NOT EXISTS |
| Schema | `SuppliesSchemaMigrator.java` | ALTER TABLE supply_claim_line ADD remark |
| API TS | `supplies.api.ts` | SupplyClaimLine +coverUrl/+remark; fulfillSupplyClaim +remark |
| Page | `AdminSuppliesProcessPage.tsx` | 缩略图 + 备注输入 + 修改按钮 |
| MP JS | `suppliesProcess/index.js` | 缩略图 + 备注输入 + fulfill 传 remark |
| MP WXML | `suppliesProcess/index.wxml` | 缩略图 + 备注输入框 |
