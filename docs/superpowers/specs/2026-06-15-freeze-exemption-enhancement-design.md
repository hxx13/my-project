# 免冻结功能增强 — 设计规格

| 属性 | 值 |
|------|-----|
| 版本 | 1.0 |
| 日期 | 2026-06-15 |
| 工作流 | ① 新功能开发 |
| 状态 | 设计已批准，待实现计划 |

## 1. 需求概述

当前免冻结（`freeze_exempt_flag=1`）有三重效果：跳过激活/签退规则、绕过扫码弹窗入口时段限制、跳过卡片冻结。本次升级将其拆分为独立可配维度，并新增次数限制模式。

**四个子需求：**

1. **取消规则跳过** — 免冻结人员不再跳过激活规则和签退规则，正常走完整联动流程，仅在最终"冻结卡片"步骤豁免
2. **房间级扫码时段豁免** — 免冻结不再全局绕过扫码弹窗入口时段限制。设置豁免时记录该人的 ARO 房间权限 ID，扫码时仅对授权房间放行时段
3. **新增次数限制模式** — 除时间限制外，新增按"进入授权房间次数"限制，用完自动收回豁免
4. **小程序 dahua-issue 入口** — 房间页审核入口上方新增"大华发卡"按钮，权限与审核入口一致

## 2. 数据库变更

### 2.1 `twin_card_mapping` 新增字段

SQL 迁移文件：`V20260615__freeze_exempt_enhance.sql`

```sql
ALTER TABLE twin_card_mapping
  ADD COLUMN freeze_exempt_room_ids TEXT NULL COMMENT '豁免房间权限ID JSON数组 ["roomId1","roomId2"]',
  ADD COLUMN freeze_exempt_mode VARCHAR(20) NULL DEFAULT 'TIME' COMMENT '豁免模式 TIME/COUNT/BOTH',
  ADD COLUMN freeze_exempt_max_count INT NULL COMMENT '次数限制上限(mode=COUNT/BOTH时有效)',
  ADD COLUMN freeze_exempt_used_count INT NOT NULL DEFAULT 0 COMMENT '已使用次数';
```

### 2.2 Entity 新增字段

`TwinCardMapping.java` 新增：

- `freezeExemptRoomIds: String` — JSON 数组字符串
- `freezeExemptMode: String` — `TIME` / `COUNT` / `BOTH`
- `freezeExemptMaxCount: Integer` — 次数上限
- `freezeExemptUsedCount: Integer` — 已使用次数

## 3. 后端改动

### 3.1 激活/签退规则 — 取消豁免跳过

**文件：** `DahuaSwingRuleEngineService.java`

**改动：** 删除 L156-158 的豁免跳过逻辑：

```java
// 删除以下代码：
if (Integer.valueOf(1).equals(record.getFreezeExemptFlag())
        || twinCardMappingService.isLinkageRuleExempt(userId)) {
    return;
}
```

免冻结人员将完整走激活/签退规则流程（激活门触发、签退门触发、激活后再次刷门签退、自动签退登记）。

**文件：** `DahuaAutoSignoutService.java`

**改动：** `runRiskActions()` (L387-388) 和 `augmentLinkageSignoutDetail()` (L355-356) 中的豁免跳过冻结逻辑**保留不变**。免冻结核心语义 = 卡片不被冻结。

### 3.2 扫码弹窗时段 — 房间级豁免

**文件：** `TwinScanAppService.java` (L217-219)

**改动前：**
```java
if (!entryAllowedNow && twinCardMappingService.isLinkageRuleExempt(realPhysicalId)) {
    entryAllowedNow = true;
}
```

**改动后：**
```java
if (!entryAllowedNow && twinCardMappingService.isRoomExemptForScanEntry(realPhysicalId, roomId)) {
    entryAllowedNow = true;
}
```

**文件：** `TwinScanController.java` (L218-224)

**改动前：**
```java
if (accessType == 1
        && !ScanPopupEntryWindowEvaluator.isEntryAllowedNow(swingCfg, winZone)
        && !twinCardMappingService.isLinkageRuleExempt(userId)) {
```

**改动后：**
```java
if (accessType == 1
        && !ScanPopupEntryWindowEvaluator.isEntryAllowedNow(swingCfg, winZone)
        && !twinCardMappingService.isRoomExemptForScanEntry(userId, roomId)) {
```

**文件：** `TwinCardMappingService.java` — 新增方法

```java
/**
 * 检查免冻结用户是否对指定房间有扫码时段豁免。
 * 条件：freeze_exempt_flag=1 未过期 AND freeze_exempt_room_ids 包含 roomId
 */
public boolean isRoomExemptForScanEntry(String userId, String roomId);
```

实现逻辑：
1. 调 `isFreezeExempt(mapping)` — flag=1 且未过期
2. 若为 false → return false
3. 解析 `freezeExemptRoomIds` JSON 数组
4. 检查 `roomId` 是否在数组中

### 3.3 免冻结授予 — 扩展参数

**文件：** `TwinCardMappingService.updateExemptFlag()`

**接口变更：**

| 参数 | 类型 | 说明 |
|------|------|------|
| cardNo | String | 卡号（不变） |
| flag | Integer | 1=授予 0=取消（不变） |
| durationMinutes | Integer | 时长限制分钟数，-1=今日24:00（不变） |
| mode | String | **新增** `TIME` / `COUNT` / `BOTH` |
| maxCount | Integer | **新增** 次数上限 |
| roomIds | String | **新增** JSON 数组 `["roomId1","roomId2"]` |

写入逻辑：
- `mode=TIME` → 设置 `freezeExemptMaxCount=null`，走现有时长到期逻辑
- `mode=COUNT` → 设置 `freezeExemptExpireAt=null`，仅按次数限制
- `mode=BOTH` → 两者都设置，任一条件触发即收回（先到者生效）
- `roomIds` → 写入 `freezeExemptRoomIds`
- 若 `flag=0`（取消豁免）→ 重置所有新增字段为默认值

**文件：** `TwinCardMappingService` — 新增方法

```java
/**
 * 用户通过扫码进入授权房间时调用。
 * 若免冻结模式为 COUNT/BOTH 且还有剩余次数，则 usedCount+1。
 * 若 usedCount 达到 maxCount，自动收回免冻结。
 */
public void incrementExemptUsedCount(String userId, String roomId);
```

**文件：** `TwinScanController.java` — 扫码进入成功后调用

在 `executeAccessAction` 成功（accessType=1）后，调用：
```java
twinCardMappingService.incrementExemptUsedCount(userId, roomId);
```

### 3.4 过期豁免自动收回 — 扩展

**文件：** `TwinCardMappingService.revokeExpiredTimedExemptions()`

扩展现有 `@Scheduled(fixedRate = 60000)` 方法，除检查 `freeze_exempt_expire_at` 到期外，新增检查 `freeze_exempt_mode IN ('COUNT','BOTH') AND freeze_exempt_used_count >= freeze_exempt_max_count`，满足条件则自动收回。

### 3.5 Controller API 变更

**文件：** `TwinMappingController.java`

**`POST /api/v1/twin/mappings/exempt`** — 请求体扩展：

```json
{
  "cardNo": "ABC123",
  "flag": 1,
  "durationMinutes": 480,
  "mode": "BOTH",
  "maxCount": 5,
  "roomIds": ["room_pd_301", "room_px_102"]
}
```

**`GET /api/v1/twin/mappings/dahua-issue/access-prefill?aroUserId=xxx`** — 已有接口，复用查询房间列表。

### 3.6 `isLinkageRuleExempt` 语义调整

**文件：** `TwinCardMappingService.java`

`isLinkageRuleExempt()` 方法不再被扫码时段检查调用（改为 `isRoomExemptForScanEntry`），但保留供其他可能的调用方使用。其注释更新为仅表示"免冻结标记存在"。

## 4. 前端 Web 改动

### 4.1 豁免弹窗改造

**文件：** `DebugCardMappingPage.tsx`

豁免弹窗新增：

1. **模式选择器** — 三个 Radio/分段按钮：
   - `时长限制` (TIME)
   - `次数限制` (COUNT)
   - `时长+次数` (BOTH)

2. **时长选择** — 已有 `EXEMPT_DURATION_PRESETS`，在 TIME/BOTH 模式下显示

3. **次数输入** — `InputNumber`，在 COUNT/BOTH 模式下显示，min=1

4. **房间权限勾选列表** — 调用 `GET /dahua-issue/access-prefill?aroUserId=xxx` 获取房间列表，以 Checkbox 列表展示，默认全选

5. **提交** — 调用 `updateExemptFlag({ cardNo, flag, durationMinutes, mode, maxCount, roomIds })`

### 4.2 豁免状态展示更新

列表行中的豁免状态 chip 扩展显示：
- `TIME` 模式：显示 "豁免 · 剩余 X 小时"（现有逻辑）
- `COUNT` 模式：显示 "豁免 · 剩余 X/5 次"
- `BOTH` 模式：显示 "豁免 · X 小时 · X/5 次"

### 4.3 API 类型扩展

**文件：** `frontend/src/api/twinApi.ts`

`updateExemptFlag()` 参数接口新增 `mode`, `maxCount`, `roomIds`。

### 4.4 说明文字更新

**文件：** `AdminDahuaSwingRulesPage.tsx`

扫码弹窗入口时段说明文字更新为："免冻结用户仅在授权房间内可绕过时段限制；非授权房间仍受管控"

## 5. 小程序改动

### 5.1 房间页新增 dahua-issue 入口

**文件：** `pages/room/index.wxml`

在 `sidebar-footer`（审核入口）上方新增：

```xml
<view wx:if="{{ showAuditEntry }}" class="sidebar-footer sidebar-footer-issue" bindtap="onDahuaIssueTap">
  <text class="sidebar-footer-text">大华发卡</text>
</view>
```

**文件：** `pages/room/index.js`

新增方法：
```js
onDahuaIssueTap() {
  wx.navigateTo({ url: '/package-feature/pages/dahuaIssue/index' });
}
```

权限控制：复用 `showAuditEntry` 的 `hasMinRole(role, 'SENIOR')` 判断。

### 5.2 豁免操作扩展

**文件：** `package-feature/pages/roomAudit/index.js` — `onToggleExempt()`

现有逻辑：弹出时长选择 actionSheet → 直接调 API。

新逻辑：
1. 弹出设置面板（van-popup 或 actionSheet）：模式选择 → 时长/次数输入 → 房间勾选
2. 调 `GET /dahua-issue/access-prefill?aroUserId=xxx` 获取房间列表
3. 提交时传完整参数

**文件：** `package-feature/pages/dahuaIssue/index.js` — `onToggleExempt()`

同上，豁免弹窗同步扩展。

### 5.3 豁免状态展示

**文件：** `roomAudit/index.wxml`、`dahuaIssue/index.wxml`

卡状态行显示扩展：根据 `freezeExemptMode` 显示不同格式：
- `TIME`：免冻结 开 · 剩余X小时
- `COUNT`：免冻结 开 · 剩余X/5次
- `BOTH`：免冻结 开 · 3小时 · 2/5次

### 5.4 工具函数扩展

**文件：** `package-feature/utils/exemptDurationPresets.js`

新增：
- `formatExemptRemainingForMode(row)` — 根据 mode 格式化剩余时间/次数
- `EXEMPT_MODE_LABELS` — `{ TIME: '时长限制', COUNT: '次数限制', BOTH: '时长+次数' }`

## 6. 数据流

```
┌─────────────────────────────────────────────────────────┐
│ 设置免冻结（管理员 Web/小程序）                           │
│                                                         │
│  1. 选人 → GET /dahua-issue/access-prefill?aroUserId=x  │
│     └→ 返回 ARO 房间权限列表 [{roomId, roomName}]        │
│  2. 选模式 TIME/COUNT/BOTH + 时长/次数                    │
│  3. 勾选房间 → POST /api/v1/twin/mappings/exempt         │
│     body: { cardNo, flag:1, mode, durationMinutes,       │
│              maxCount, roomIds }                         │
│     └→ 写入 twin_card_mapping 新字段                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 扫码进入（用户）                                         │
│                                                         │
│  1. analyze 接口:                                        │
│     ├→ ScanPopupEntryWindowEvaluator 检查全局时段        │
│     ├→ 若不在时段内 → isRoomExemptForScanEntry(userId,   │
│     │   roomId) 检查房间级豁免                            │
│     └→ 返回 scanPopupEntryAllowedNow                     │
│                                                         │
│  2. execute 接口:                                        │
│     ├→ 同样的房间级豁免检查（执行侧）                      │
│     ├→ 不再检查 isLinkageRuleExempt（已删除）             │
│     ├→ executeAccessAction 成功                         │
│     └→ incrementExemptUsedCount(userId, roomId)          │
│         └→ 若 usedCount >= maxCount → 自动收回豁免       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 激活/签退联动（DahuaSwingRuleEngineService）              │
│                                                         │
│  刷卡事件到达 → 不再检查 freezeExemptFlag                 │
│  → 免冻结人员正常走完整联动流程：                          │
│     ├→ 激活门触发 → 启动激活计时器                       │
│     ├→ 签退门触发 → 启动自动签退计时器                   │
│     └→ DahuaAutoSignoutService.runRiskActions()          │
│         └→ freezeExemptFlag==1 → 跳过卡片冻结（保留）    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ @Scheduled 每60s: revokeExpiredTimedExemptions()         │
│                                                         │
│  扫描 twin_card_mapping WHERE freeze_exempt_flag=1:      │
│  ├→ TIME/BOTH: freeze_exempt_expire_at 已过期 → 收回     │
│  └→ COUNT/BOTH: used_count >= max_count → 收回          │
└─────────────────────────────────────────────────────────┘
```

## 7. 兼容性

- `freeze_exempt_mode` 默认值 `TIME`，存量免冻结数据自动视为时长模式，行为不变
- `freeze_exempt_room_ids` 为 NULL 时 `isRoomExemptForScanEntry()` 返回 false（无房间豁免）
- `isLinkageRuleExempt()` 方法保留但调用方改为 `isRoomExemptForScanEntry()`
- API 新增字段均为可选，旧调用方不传则按默认值处理

## 8. 自审清单

- [x] 无 TBD/TODO 占位
- [x] 数据库字段类型和默认值明确
- [x] 所有文件路径和改动范围明确
- [x] 前后端接口契约一致
- [x] 兼容性方案明确
- [x] 定时任务覆盖次数耗尽场景
