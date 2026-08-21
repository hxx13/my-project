# 动物订购时间管理设计（节选）

> 2026-08-21 更新：FIXED 模式语义变更

## ETA 策略 — FIXED 模式

`eta_mode = FIXED` 表示管理员配置 **一个** ISO 星期几（`eta_weekday`，1=周一 … 7=周日），而非固定日历日。

### 计算步骤（`AnimalOrderTimeEngine.estimateDelivery`）

1. **锚点日历日**（与 RELATIVE 相同）：若下单时刻落在不可购区间，取该区间结束时刻的日历日；否则取 `orderAt` 的日历日。
2. **下一固定星期几**：在锚点日 **严格之后** 找第一次出现的 `eta_weekday`。
   - 锚点周一、选周三 → 本周三。
   - 锚点周三、选周三 → **下周三**（同星期永不落在锚点当日）。
3. **工作日 roll-forward**：若该日历日非工作日（周末或 `animal_order_holiday` 中 `HOLIDAY`），按现有 `isWorkday` 逻辑顺延至下一工作日。

RELATIVE 模式（`eta_workday_offset`）不变。

### 数据列

| 列 | 类型 | 说明 |
|---|---|---|
| `eta_weekday` | TINYINT NULL | FIXED 时必填，1–7 |
| ~~`eta_fixed_date`~~ | — | 已废弃（V20260821021 删除） |
