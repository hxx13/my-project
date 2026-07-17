# 待签退倒计时中间态：滞留监控剔除 + 瀑布流水屏提前注入

## 概述

当人员进入待签退倒计时（`twin_dahua_activation_state.state = 'AUTO_EXIT_SCHEDULED'` 且 `scheduled_exit_at > NOW()`）但尚未实际签退时：

1. **AI滞留监控** 提前将其剔除（不再显示为"滞留中"）
2. **瀑布流水屏** 提前注入一条琥珀色中间态条目（action=`PENDING_EXIT`），排在列表最前面，显示倒计时
3. 实际签退时，中间态条目原地转为正常 EXIT 条目

## 触发条件

`twin_dahua_activation_state` 中同时满足：
- `state = 'AUTO_EXIT_SCHEDULED'`
- `scheduled_exit_at > NOW()`（倒计时未到期）

## 后端改动

### ① retention-warnings API — 排除倒计时中的人

**文件：** `src/main/resources/mapper/TwinDashboardMapper.xml`
**方法：** `getActiveRetentionWarnings`

在现有 WHERE 子句末尾追加 NOT EXISTS 条件：

```sql
AND NOT EXISTS (
    SELECT 1 FROM twin_dahua_activation_state das
    WHERE das.user_id = log.user_id
      AND das.state = 'AUTO_EXIT_SCHEDULED'
      AND das.scheduled_exit_at > NOW()
)
```

无需改动 Controller 或 Service 层。

### ② realtime-feed API — 注入 PENDING_EXIT 虚拟条目

**文件：** `src/main/java/.../twin/dashboard/controller/TwinApiController.java`
**方法：** `getRealtimeFeed()`

改造逻辑：
1. 现有逻辑：查 `aro_access_log` 最近 N 条 → 保持不变
2. 新增：查 `twin_dahua_activation_state` 中符合条件的用户
3. 对每个倒计时用户，回查当天 `aro_access_log` 的 ENTER 记录获取位置/课题组
4. 构造成 `action="PENDING_EXIT"` 的 Map 条目，携带：
   - `action`: `"PENDING_EXIT"`
   - `userId`, `userName`, `groupName`, `areaName`, `roomName`（来自当日 ENTER 记录）
   - `scheduledExitAt`: ISO 时间字符串
   - `countdownSeconds`: 剩余秒数
   - `eventId`: `"pending-" + userId`（用于前端去重和原地更新匹配）
5. PENDING_EXIT 条目排在列表最前面（在正常 access_log 条目之前）

**新增 Mapper 方法：** `TwinDashboardMapper.getActiveSignoutCountdowns()`

```sql
SELECT das.user_id, das.scheduled_exit_at,
       log.name AS user_name, log.project_group_names AS group_name,
       log.area_name, log.room_name, log.room_id
FROM twin_dahua_activation_state das
LEFT JOIN aro_access_log log ON log.user_id = das.user_id
  AND log.accessType = 1
  AND CAST(log.create_time AS DATE) = CURDATE()
WHERE das.state = 'AUTO_EXIT_SCHEDULED'
  AND das.scheduled_exit_at > NOW()
ORDER BY das.scheduled_exit_at ASC
```

## 前端改动

### ① RetentionRadarStream — 无需改动

后端 SQL 已过滤，前端自动不再渲染倒计时中的人员。

### ② TimelineWaterfall — 新增 PENDING_EXIT 渲染

**文件：** `frontend/src/features/realtime-stream/TimelineWaterfall.tsx`

在现有 ENTER/EXIT 双色渲染基础上，增加第三种状态：

| 属性 | PENDING_EXIT |
|------|-------------|
| 颜色主题 | 琥珀/金色（amber-400/amber-500） |
| 中轴图标 | `Clock` 或 `Hourglass`（沙漏） |
| 时间胶囊 | 不显示 HH:MM，显示 `⏳` 或 `待签退` |
| 右侧信息 | 倒计时剩余时间（`formatCountdown` 已存在可复用）+ 预计签退时间 |
| 排序位置 | 列表最前面（最新注入） |
| 签退后行为 | 原地转为正常 EXIT 条目（颜色/图标/时间更新） |

**组件改动要点：**

1. `UniversalEvent` 类型扩展：`action` 增加 `"PENDING_EXIT"` 字面量，增加可选字段 `scheduledExitAt?: string`、`countdownSeconds?: number`
2. 渲染分支：`evt.action === "PENDING_EXIT"` 时走琥珀色渲染路径
3. 倒计时实时更新：使用已有的 `useCountdown` hook 或 `formatCountdown` 工具函数
4. 签退联动：当 WebSocket 推送同一 userId 的真实 EXIT 事件时，通过 `eventId` 前缀匹配（`"pending-" + userId`）找到对应 PENDING_EXIT 条目，原地替换

**ID 匹配规则：**
- PENDING_EXIT 条目 `eventId = "pending-" + userId`
- 真实 EXIT 条目 `eventId = 数据库 id`
- 前端 `useEventStore` 收到真实 EXIT 事件时，查找是否存在 `"pending-" + userId` 条目，若存在则原地替换而非新增

## 签退后的状态转移

```
PENDING_EXIT（琥珀色，倒计时中）
        │
        │ 收到真实 EXIT 事件（WebSocket 或轮询）
        ↓
正常 EXIT 条目（橙/玫红色，显示实际签退时间）
```

中间态条目不产生新的数据库记录，仅在 API 返回层构造。签退后该条目由真实 EXIT 记录接管。

## 边界情况

| 场景 | 处理方式 |
|------|---------|
| 倒计时到期但人未签退 | `scheduled_exit_at <= NOW()` → 不再满足 WHERE 条件 → 自动从瀑布流消失，重新出现在滞留监控中 |
| 同一人多条倒计时 | `ORDER BY scheduled_exit_at ASC` 取最早一条 |
| 用户无当日 ENTER 记录 | LEFT JOIN 返回 NULL → 中间态条目仍显示 userName（来自 user_display_name），位置显示"—" |
| 多 campus（浦东/浦西） | realtime-feed 不区分 campus，全部显示；retention-warnings 按现有 areaName 过滤逻辑 |
| WebSocket 断连 | 前端 60s 轮询 `realtime-feed` 会重新拉取，中间态条目自动恢复 |

## 不改动的部分

- `aro_access_log` 表结构和写入逻辑不变
- `twin_dahua_activation_state` 表结构不变
- WebSocket 推送逻辑不变
- `RetentionRadarStream` 前端组件不变
- `/v1/monitor/timers` 接口不变（已有该查询，本次不依赖它）
- 实际签退流程（`DahuaAutoSignoutService` 等）不变
