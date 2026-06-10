# 自动签退倒计时显示 — 设计规格

| 属性 | 值 |
|------|-----|
| 版本 | 1.0 |
| 日期 | 2026-06-10 |
| 工作流 | ① 新功能开发 |
| 状态 | 设计已批准，待实现计划 |

## 1. 需求概述

人员刷卡处于"进入(INSIDE)"状态时，若存在自动签退计时器（`twin_dahua_activation_state` 表中的 `PENDING_ACTIVATION` 或 `AUTO_EXIT_SCHEDULED`），在离开确认 UI 中显示实时倒计时。

## 2. 设计方案

### 2.1 数据流

```
刷卡 → GET /api/v1/twin/scan/analyze
         │
         ├─ TwinScanAppService.analyzeScan()
         │     ├─ [现有] processScanStatus() → currentState
         │     └─ [新增] dahuaSwingMapper.listActivationStatesByUserId(userId)
         │           └─ 提取所有 scheduled_exit_at，取最早未到期的
         │           └─ 计算 remainingSeconds = max(scheduled_exit_at - now, 0)
         │
         └─ ScanAnalyzeResponseDTO [新增3字段]
               ├─ autoSignoutState: "PENDING_ACTIVATION" | "AUTO_EXIT_SCHEDULED" | null
               ├─ autoSignoutScheduledAt: "yyyy-MM-dd HH:mm:ss" | null
               └─ autoSignoutSecondsRemaining: Integer seconds | null

前端 ScannerPanel
  ├─ UiverseProfilePopup
  │     └─ ActionButtons 区域：简短标签 "⏱ 自动签退 MM:SS"
  └─ SwipeExitConfirmDialog：完整倒计时 + 文案 + 归零自动刷新
```

### 2.2 后端改动

#### Mapper 新增查询

`DahuaSwingMapper.java` 新增方法：
```java
List<DahuaActivationState> listActivationStatesByUserId(@Param("userId") String userId);
```

`DahuaSwingMapper.xml` 新增 SQL：
```xml
<select id="listActivationStatesByUserId" resultType="...DahuaActivationState">
    SELECT ... FROM twin_dahua_activation_state
    WHERE user_id = #{userId}
      AND scheduled_exit_at IS NOT NULL
    ORDER BY scheduled_exit_at ASC
</select>
```

#### DTO 新增字段

`ScanAnalyzeResponseDTO.java`：
- `autoSignoutState: String` — 计时器状态枚举值
- `autoSignoutScheduledAt: String` — 计划签退时刻
- `autoSignoutSecondsRemaining: Integer` — 剩余秒数（已计算好，前端可直接用）

#### Service 注入 + 计算逻辑

`TwinScanAppService.java`：
- 注入 `DahuaSwingMapper`
- 在 `analyzeScan()` 方法 return 前：
  1. 若 `currentState == "INSIDE"` 则有意义，否则跳过（OUTSIDE 无计时器）
  2. 调 `dahuaSwingMapper.listActivationStatesByUserId(userId)`
  3. 遍历结果，取 `scheduledExitAt` 最早的未到期行
  4. 计算 `LocalDateTime.now()` 到 `scheduledExitAt` 的秒数差，>=0 则填充 DTO

### 2.3 前端改动

#### TypeScript 类型

`scanner.ts` — `AnalyzeResponse` 新增：
```ts
autoSignoutState?: string | null;
autoSignoutScheduledAt?: string | null;
autoSignoutSecondsRemaining?: number | null;
```

#### useProfilePopup

从 `result` 提取 timer 字段透传到 `state`，新增：
```ts
autoSignoutState: result?.autoSignoutState ?? null,
autoSignoutSecondsRemaining: result?.autoSignoutSecondsRemaining ?? null,
```

#### ActionButtons 区域

在离开按钮区域上方，若 `autoSignoutSecondsRemaining > 0`，显示简短标签：
```
⏱ 自动签退 03:12
```
使用 `useEffect` + `setInterval(1000)` 本地递减。

#### SwipeExitConfirmDialog

新增 props：
```ts
autoSignoutSeconds?: number | null;  // 初始剩余秒数
onCountdownEnd?: () => void;         // 归零回调
```

内部逻辑：
- `useState` 维护本地倒计时秒数
- `useEffect` + `setInterval(1000)` 每秒递减
- 归零时清除 interval，调 `onCountdownEnd`
- 显示完整文案："当前已进入自动签退阶段，系统将在 MM:SS 后自动为您签退。要现在手动签退吗？"
- 组件卸载时清除 interval

### 2.4 倒计时归零行为

```
倒计时归零
  → SwipeExitConfirmDialog.onCountdownEnd()
    → 关闭弹窗 (onCancel)
    → 调 onRefresh() 重新 analyze（此时后端 timer 已到期，可能已签退）
    → 前端自然展示新状态
```

## 3. 边界情况

| 场景 | 处理 |
|------|------|
| 无计时器 | `autoSignoutSecondsRemaining = null`，不显示倒计时 |
| 计时器已到期（秒数<=0） | 后端返回 0，前端不显示倒计时 |
| 多行激活状态 | 取 `scheduled_exit_at` 最早且未到期的 |
| 用户在倒计时中关闭弹窗 | interval 随组件卸载清除 |
| 弹窗打开时倒计时仅剩 2 秒 | 正常显示 00:02，归零后自动关闭 |
| OUTSIDE 状态 | 后端不查激活表（无意义） |
| 豁免用户 | 后端 isLinkageRuleExempt → 不返回计时器 |

## 4. 不涉及

- 不修改定时器启动/到期逻辑
- 不新增数据库表或迁移
- 不修改签退执行流程
- 不动 DahuaAutoSignoutService / DahuaSwingRuleEngineService 核心逻辑
