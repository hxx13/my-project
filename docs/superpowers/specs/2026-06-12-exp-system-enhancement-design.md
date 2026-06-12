# 经验值系统增强 — 设计规格

| 属性 | 值 |
|------|-----|
| 版本 | 1.0 |
| 日期 | 2026-06-12 |
| 工作流 | ① 新功能开发（全栈） |
| 状态 | 设计已批准 |

## 1. 需求概述

四项经验值（XP）系统增强：
1. **首次进入 XP 面包机动画**：当天首次进入弹 50 XP 面包机动效，非首次不给
2. **违规者阻止 XP**：被滞留·未豁免自动违规定时器判定违规的人，无法获得经验值
3. **自动签退不留 XP**：自动签退的离开记录在历史重算时不计算停留时长 XP
4. **经验值统计管理页面**：后台侧边栏新增，记录所有 XP 流水，支持排行/趋势/来源分布

## 2. 模块一：首次进入 XP 面包机

### 2.1 问题

当前 `ExpToaster` 只要 `expAdded > 0` 就播放动画。但离开时的停留时长 XP 也会触发面包机，这不合理——面包机应该只在"首签 50 XP"时弹出。

### 2.2 设计

**后端**：`ScanExecuteResponseDTO` 新增 `expSource` 字段，区分 XP 来源。

```java
// ScanExecuteResponseDTO 新增
private String expSource; // "FIRST_ENTRY" | "TIME_BASED" | null
```

- ENTER 且当天首次 → 返回 `expAdded=50, expSource="FIRST_ENTRY"`
- EXIT 停留时长结算 → 返回 `expAdded=N, expSource="TIME_BASED"`
- 不给 XP 时 → `expSource=null`

**前端**：`useProfilePopup.ts` 中仅当 `expSource === 'FIRST_ENTRY'` 时触发 ExpToaster。

TypeScript 类型 `ExecuteResult` 新增：
```ts
expSource?: 'FIRST_ENTRY' | 'TIME_BASED' | null;
```

## 3. 模块二：违规感知 — 阻止 XP

### 3.1 检查逻辑

在 `RpgEngineService.predictActionReward()` 开头新增违规检查：

```
查询 twin_automation_log
  WHERE user_id = #{userId}
    AND automation_type = 'AUTO_SIGNOUT'
    AND trigger_type = 'STRANDED_VIOLATION'
    AND success = 1
    AND DATE(event_time) = CURDATE()
  LIMIT 1
```

如有记录 → 返回 `expAdded=0, expSource=null`，跳过所有 XP 计算。

### 3.2 改动文件

- `RpgMapper.java`：新增 `hasTodayStrandedViolation(@Param("userId") String userId)` 
- `RpgMapper.xml`：新增对应 SQL
- `RpgEngineService.java`：`predictActionReward()` 开头注入违规检查
- `rpgDatabaseService`：注入 RpgMapper 调用

## 4. 模块三：自动签退不留 XP（实时 + 历史双路径修复）

### 4.1 问题

`aro_access_log` 表记录所有进出（含自动签退产生的离开记录）。自动签退后 ARO 同步的离开记录会写入 `feed_source = 'TWIN_AUTO_SIGNOUT'`（由 `TwinAccessLogCorrelationService` 匹配写入）。

但 XP 计算的两条路径都未过滤这些记录：
- **实时路径** `calculateRealtimeExp()` → `getTodayRecords()` 查询不区分来源
- **历史路径** `recalculateAllHistoricalExp()` → `getUserLogsForRecalc()` 查询不区分来源

导致：被自动违规签退的人，刷新页面后实时 XP 已包含违规停留时长的 XP。

### 4.2 设计

**SQL 层统一过滤**：两条查询均增加 `feed_source != 'TWIN_AUTO_SIGNOUT'` 条件。

**AroDatabaseMapper.xml — `getTodayRecords`**：
```xml
<select id="getTodayRecords" resultType="map">
    SELECT id, create_time AS event_time,
           accessType AS action,   <!-- 修复：原查询缺失 action 字段，引擎无法识别进出 -->
           CASE WHEN accessType = 1 THEN '进入' ... END AS event_type,
           room_name, name AS person_name
    FROM aro_access_log
    WHERE user_id = #{userId}
      AND create_time >= #{todayStart}
      AND (feed_source IS NULL OR feed_source != 'TWIN_AUTO_SIGNOUT')   <!-- 新增 -->
    ORDER BY create_time DESC
</select>
```

**RpgMapper.xml — `getUserLogsForRecalc`**：
```xml
<select id="getUserLogsForRecalc" resultType="map">
    SELECT create_time, accessType AS action
    FROM aro_access_log
    WHERE user_id = #{userId}
      AND (feed_source IS NULL OR feed_source != 'TWIN_AUTO_SIGNOUT')   <!-- 新增 -->
    ORDER BY create_time ASC
</select>
```

**效果**：实时计算和历史重算均跳过自动签退记录，违规用户的停留时长不会转化为 XP。

## 5. 模块四：XP 流水记录表

### 5.1 表结构

```sql
CREATE TABLE twin_exp_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID',
    user_name VARCHAR(128) DEFAULT NULL COMMENT '用户姓名（冗余，便于统计查询）',
    exp_amount INT NOT NULL DEFAULT 0 COMMENT '经验值数量',
    source_type VARCHAR(32) NOT NULL COMMENT '来源: FIRST_ENTRY / TIME_BASED',
    access_type TINYINT NOT NULL COMMENT '1=进入 2=离开',
    room_id VARCHAR(64) DEFAULT NULL COMMENT '房间ID',
    room_name VARCHAR(128) DEFAULT NULL COMMENT '房间名称（冗余）',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_id (user_id),
    INDEX idx_create_time (create_time),
    INDEX idx_source_type (source_type),
    INDEX idx_user_date (user_id, create_time)
) COMMENT '经验值流水记录';
```

### 5.2 写入时机

`TwinScanController.execute()` 中 XP > 0 时写入，与 `flowLog.ok()` 同级。

写入字段来源：
- `user_id`：扫描用户
- `user_name`：从 `personnel` 表或 `analyze` 阶段缓存获取
- `exp_amount`：`expAdded`
- `source_type`：`expSource`
- `access_type`：1 或 2
- `room_id` / `room_name`：从 `effectiveRoomId` 解析

## 6. 模块五：经验值统计管理页面

### 6.1 后端 API

**汇总统计** `GET /api/v1/twin/rpg/exp/summary`：

```json
{
  "totalExp": 125000,
  "todayExp": 2340,
  "activeUsers": 87,
  "violationBlockedCount": 12,
  "todayFirstEntryCount": 45,
  "topEarners": [
    { "userId": "xxx", "userName": "张三", "level": 15, "totalExp": 5200, "todayExp": 150 }
  ]
}
```

**分页流水** `GET /api/v1/twin/rpg/exp/records`：

参数：`pageNum`, `pageSize`, `userId`(可选), `sourceType`(可选), `startDate`(可选), `endDate`(可选)

返回标准分页结果，按 `create_time DESC`。

**Controller**：`RpgController.java` 中新增两个端点。

**Service**：`RpgEngineService` 或新建 `TwinExpStatsService`。

### 6.2 前端页面

**文件**：`frontend/src/pages/AdminExpStatsPage.tsx`

**路由**：`/admin/exp-stats`，`AdminGuard` 包裹

**侧边栏注册**：`ADMIN_NAV_REGISTRY` → `access-meta-env` 分组，label="经验值统计"

**布局**（Bento Grid）：

```
┌─────────────────────────────────────────────────┐
│  📊 总经验值      📅 今日经验       👥 活跃用户    🚫 违规拦截  │
│   125,000          +2,340            87 人        12 次     │
├─────────────────────────────────────────────────┤
│  经验值排行表 (Top 50)                              │
│  ┌────┬──────┬──────┬──────┬──────┐              │
│  │排名│ 用户  │ 等级 │总经验│今日  │              │
│  ├────┼──────┼──────┼──────┼──────┤              │
│  │ 1  │ 张三  │ LV15 │ 5200 │ +150 │              │
├─────────────────────────────────────────────────┤
│  来源分布              每日经验趋势（近7天）         │
│  [简易柱状/比例条]      [柱状趋势图]                │
└─────────────────────────────────────────────────┘
```

**筛选栏**：日期范围选择器 + 用户搜索 + 来源类型下拉

**主题适配**：
- 所有颜色通过 `var(--app-color-*)` 令牌引用
- 卡片使用 Bento 标准样式：`bg-[var(--app-color-surface-container)]` + `border-[var(--app-color-border-default)]`
- 表格行 hover 使用 `var(--app-color-surface-hover)`
- 图表色值从语义令牌映射（accent=Peach, secondary=Steel）
- 暗色主题下图表色值跟随 `standard-dark` 映射自动切换

### 6.3 实现分工

| 层 | 工作项 |
|----|--------|
| 数据库 | SQL 迁移 `V{timestamp}__create_twin_exp_record.sql` |
| 后端 Entity | `TwinExpRecord.java` |
| 后端 Mapper | `TwinExpRecordMapper.java` + XML |
| 后端 Service | `TwinExpStatsService.java` |
| 后端 Controller | `RpgController.java` 新增 API |
| 后端 DTO | `ScanExecuteResponseDTO` 新增 `expSource` |
| 后端 Engine | `RpgEngineService` 违规检查 + expSource |
| 后端 Mapper | `RpgMapper` 新增违规查询 + 历史重算过滤 |
| 前端类型 | `scanner.ts` 新增 `expSource` |
| 前端组件 | `useProfilePopup.ts` 面包机触发条件 |
| 前端页面 | `AdminExpStatsPage.tsx` |
| 前端路由 | `router/index.tsx` 注册 |
| 前端导航 | `adminNavRegistry.ts` 注册 |

## 7. 数据流

```
扫码进入 → analyze() → 返回 userInfo.rpg（实时等级/EXP）
  │
  └→ execute(ENTER)
       ├─ predictActionReward()
       │    ├─ [新增] hasTodayStrandedViolation? → skip
       │    ├─ first entry today? → expSource=FIRST_ENTRY, expAdded=50
       │    └─ not first → expAdded=0
       ├─ [新增] expAdded>0 → insert twin_exp_record
       └→ result { expAdded, expSource }
            │
            └→ 前端 useProfilePopup
                 └─ expSource==='FIRST_ENTRY' → ExpToaster 面包机动画
                 └─ 其他 → 静默更新 XP 数值

扫码离开 → execute(EXIT)
  ├─ predictActionReward()
  │    ├─ [新增] hasTodayStrandedViolation? → skip
  │    └─ calc minutes × 1.0
  ├─ [新增] expAdded>0 → insert twin_exp_record (source=TIME_BASED)
  └→ result { expAdded, expSource }

自动签退（独立路径，不经过 execute）
  └→ DahuaAutoSignoutService
       ├─ ARO submit leave
       ├─ write automation log (trigger_reason = ...)
       └→ [不产生 XP] ✓（已有正确行为）

历史重算 recalculateAllHistoricalExp()
  ├─ read access_log
  ├─ [新增] LEFT JOIN twin_access_log_correlation
  ├─ [新增] skip WHERE source_type = 'AUTO_SIGNOUT'
  └→ recalculate
```