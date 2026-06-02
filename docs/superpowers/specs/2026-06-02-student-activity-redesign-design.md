# 学生活跃度统计 — 全面改造设计

**日期**: 2026-06-02
**范围**: 统计与审计页面 → 学生活跃度
**状态**: 设计中

---

## 概述

对统计与审计页面的「学生活跃度」模块进行全面改造，涵盖搜索交互修复、数据计算修正、图表替换、后端架构重写。

### 核心问题

1. 课题组搜索栏存在 bug：选中后输入无法删除、预选内容不全
2. 缺少课题组之间的翻页导航
3. 统计指标计算不准确（日频次应为周频次、活跃率公式错误）
4. 每日进出趋势图对课题组分析无意义，应改为房间偏好
5. 人员资料库同类型搜索分页 bug 需一并修复

---

## 1. 架构决策

**全后端方案**：新建独立的 Student Activity 后端模块，所有数据查询、聚合、计算在服务端完成，前端仅做展示。

```
ARO 门禁流水 + 人员资料库
        ↓
StudentActivityService (Kotlin)
        ↓ 聚合 / 计算 / 排序 / 分页
REST API (新 Controller)
        ↓
React 组件 (纯展示)
```

### 选择理由

- 课题组数量可能较多（50+），前端聚合会造成性能问题
- 人均周频次、同校区活跃度占比等计算涉及跨组聚合，SQL 层完成效率远高于前端
- 分页逻辑必须在后端完成以支持数据量增长
- 人员资料库经验等级需要 JOIN，前端无法高效完成

---

## 2. 后端接口设计

### 2.1 课题组列表（含分页+活跃度排序）

```
GET /v1/analytics/student-activity/groups
```

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| keyword | string | 否 | 课题组名称模糊搜索 |
| startTime | string | 是 | 时间范围起始 |
| endTime | string | 是 | 时间范围截止 |
| page | int | 否 | 页码，默认 1 |
| size | int | 否 | 每页条数，默认 1（每页一个课题组） |

**返回**:

```json
{
  "groups": [
    {
      "name": "神经科学组",
      "campus": "A校区",
      "memberCount": 12,
      "totalEntries": 1248,
      "perCapitaWeeklyFreq": 6.2,
      "activeSharePct": 42.5
    }
  ],
  "total": 8,
  "page": 1,
  "size": 1
}
```

**排序规则**: 按 `activeSharePct` 降序（同校区内人均周频次占比）。搜索关键词仅做过滤，不影响排序。

**计算逻辑**:
1. 按 startTime/endTime 筛选 ARO 门禁流水
2. 按人员资料库匹配课题组名称
3. 按校区分组，计算各组人均周频次 = (组总进出次数 ÷ 组人数) ÷ 时间范围周数
4. 同校区内，activeSharePct = 该组人均周频次 ÷ 同校区所有组人均周频次之和 × 100%

### 2.2 课题组成员活跃明细

```
GET /v1/analytics/student-activity/members
```

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| groupName | string | 是 | 课题组名称 |
| startTime | string | 是 | 时间范围起始 |
| endTime | string | 是 | 时间范围截止 |
| sortBy | string | 否 | 排序字段: entries / totalDurationMinutes / weeklyAvgFreq / lastActiveDate |
| order | string | 否 | desc / asc，默认 desc |
| page | int | 否 | 页码 |
| size | int | 否 | 每页条数 |

**返回**:

```json
{
  "members": [
    {
      "userId": "U001",
      "userName": "张三",
      "experienceLevel": "高级",
      "entryCount": 156,
      "totalDurationMinutes": 1930,
      "weeklyAvgFreq": 6.5,
      "lastActiveDate": "2026-06-02",
      "daysSinceLastActive": 0
    }
  ],
  "total": 12
}
```

**关键变更**:
- `dailyAvgFreq` → `weeklyAvgFreq`（周均频次 = 总进出次数 ÷ 时间范围周数，向上取整，最小 1 周）
- 新增 `experienceLevel` 字段，从人员资料库 JOIN 获取
- `sortKey` 中 `dailyAvgFreq` → `weeklyAvgFreq`

### 2.3 课题组房间进出偏好

```
GET /v1/analytics/student-activity/room-usage
```

**参数**: groupName, startTime, endTime

**返回**:

```json
[
  { "roomName": "A101", "entryCount": 345 },
  { "roomName": "B203", "entryCount": 267 },
  { "roomName": "C105", "entryCount": 189 }
]
```

按 entryCount 降序排列。数据来源：ARO 门禁流水，按该课题组成员名称匹配后按 room 聚合。

### 2.4 进出时段热力图（保留）

```
GET /v1/analytics/student-activity/heatmap
```

参数与返回保持现有接口不变。

### 2.5 汇总 KPI 数据

```
GET /v1/analytics/student-activity/summary
```

**参数**: groupName, startTime, endTime

**返回**:

```json
{
  "memberCount": 12,
  "totalEntries": 1248,
  "perCapitaWeeklyFreq": 6.2,
  "activeSharePct": 42.5,
  "campus": "A校区",
  "timeLabel": "本月"
}
```

`timeLabel` 由后端根据时间范围推断：今日 / 本周 / 本月 / MM/DD-MM/DD。

---

## 3. 前端改动

### 3.1 ActivityFilterBar — 搜索交互修复 + 整合

**Bug 修复**:
- 根因：`value={groupName || keyword}` 导致选中课题组后 keyword 被忽略，输入框无法删除
- 修复：将搜索关键词和选中组名分离为两个独立 state，输入框仅绑定 keyword，选中组名通过组翻页器展示

**新增**:
- 课题组翻页器：← 上一个 | 组名 | 第 X/Y 个课题组 | 下一个 →
- 导出按钮移至筛选栏右侧（`flex: 1` 占位 + 靠右按钮）
- 搜索仅做过滤，不影响分页和排序

### 3.2 StudentActivityReportPanel — KPI 卡片 + 图表更新

**KPI 卡片标题时间参数化**:

| 时间预设 | 标题格式 |
|---|---|
| 今日 | 课题组人数（今日）、总进出次数（今日）、人均周频次（今日）、近期活跃度占比（今日） |
| 本周 | 同上，后缀改为（本周） |
| 本月 | 同上，后缀改为（本月） |
| 自定义 | 同上，后缀改为（MM/DD-MM/DD） |

**图表区**:
- 左：进出时段热力图（保留）
- 右：每日进出趋势 → **该课题组喜好进出房间** 柱状图（新组件 ActivityRoomChart）

### 3.3 ActivityMemberTable — 新增经验等级列 + 频次更名

**列变更**:

| 当前 | 改为 |
|---|---|
| 日均频次 (dailyAvgFreq) | 周均频次 (weeklyAvgFreq) |
| （无） | 经验等级 (experienceLevel) |

`SortKey` 类型中 `dailyAvgFreq` → `weeklyAvgFreq`。

### 3.4 新组件

- **GroupPaginator**: 课题组翻页导航条，展示当前组名 + 页码 + 前/后按钮
- **ActivityRoomChart**: 替代 ActivityTrendChart，X 轴为房间名，Y 轴为进出次数，按房间着色

### 3.5 人员资料库分页 bug 修复

**文件**: `DebugPersonnelPage.tsx`

**根因**:
1. `searchPersonnel(keyword)` 返回全部匹配结果的平面数组，无分页参数
2. 搜索时 `isSearching=true` 直接禁用翻页按钮（`disabled={page === 1 \|\| isSearching}`）
3. 页码显示硬编码为 `"— / —"`
4. 清空搜索框后 `isSearching=false` 回到原始列表，用户无法在搜索结果间翻页

**修复**:
- 后端 `searchPersonnel` 接口增加 `page`/`size` 分页参数，返回 `{ data, total }`
- 前端搜索模式下保持分页控件可用，基于搜索结果 `total` 计算 `totalPages`
- 页码指示器在搜索模式下显示实际搜索结果页码而非 `"— / —"`

---

## 4. API 类型更新

`analytics.api.ts` 类型变更：

```typescript
// StudentActivityGroup — 新增字段
type StudentActivityGroup = {
  name: string;
  campus: string;             // 新增
  memberCount: number;         // 新增
  totalEntries: number;        // 新增
  perCapitaWeeklyFreq: number; // 新增
  activeSharePct: number;      // 新增
};

// StudentActivitySummary — 字段更名+新增
type StudentActivitySummary = {
  memberCount: number;
  totalEntries: number;
  perCapitaWeeklyFreq: number; // 替代 avgDailyFreq
  activeSharePct: number;      // 替代 activeRate
  campus: string;              // 新增
  timeLabel: string;           // 新增
};

// StudentActivityMember — 字段更名+新增
type StudentActivityMember = {
  // ... 保留字段
  weeklyAvgFreq: number;       // 替代 dailyAvgFreq
  experienceLevel: string;     // 新增
};

// 新增类型
type RoomUsageItem = {
  roomName: string;
  entryCount: number;
};

// 新增接口函数
fetchStudentActivityRoomUsage(params: { groupName, startTime, endTime }): Promise<RoomUsageItem[]>
fetchStudentActivitySummary(params: { groupName, startTime, endTime }): Promise<StudentActivitySummary>
```

移除类型: `DailyTrendPoint`（不再使用）。

---

## 5. 涉及文件清单

| 层级 | 文件 | 操作 |
|---|---|---|
| 后端 | `StudentActivityController.kt` | **新建** |
| 后端 | `StudentActivityService.kt` | **新建** |
| 前端 API | `analytics.api.ts` | 修改类型 + 新增/改造接口函数 |
| 前端 | `ActivityFilterBar.tsx` | 修复搜索 bug + 整合导出按钮 + 组翻页器 |
| 前端 | `StudentActivityReportPanel.tsx` | KPI 标题时间参数化、新图表、移除趋势图 |
| 前端 | `ActivityMemberTable.tsx` | 经验等级列 + 周频次列 |
| 前端 | `GroupPaginator.tsx` | **新建** |
| 前端 | `ActivityRoomChart.tsx` | **新建**（替代 ActivityTrendChart） |
| 前端 | `DebugPersonnelPage.tsx` | 修复搜索后分页 bug（翻页禁用 + 页码显示） |
| 后端 | 现有 Personnel 搜索接口 | 增加 page/size 分页参数，返回 total |

---

## 6. 不涉及的范围

- 人员资料库的数据结构改动（仅读取经验等级字段）
- 其他统计报告模块（隔离服统计、笼位占用等）
- 学生端页面
- 热力图逻辑（保留现有实现）

---

## 自审清单

- [x] 无 TBD / TODO 占位
- [x] 各改动点有明确的接口契约和字段定义
- [x] 核心计算公式有明确的 SQL/逻辑描述
- [x] 前端后端边界清晰：前端纯展示，后端负责全部计算
- [x] Bug 根因已定位并给出修复方向
- [x] 未引入新依赖
