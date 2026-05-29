# 学生活跃度统计报表 — 设计文档

## 概述

在现有的"统计与审计"后台报表目录中新增「学生活跃度统计」报表。按课题组筛选成员，以进出流水数据为基准，展示成员活跃度排名与时段分布图表。

**数据源**：`access_log`（进出流水表），与 `DebugTablePage` 流水线页面共用同一数据源。

**核心规则**：仅计入成对的进出记录（entry + exit 配对），不成对的孤立记录（只有进入无离开、或只有离开无进入）直接过滤掉。

## 架构

嵌入现有 analytics 报表框架（方案 A）：
- 后端在 `AnalyticsReportRegistry` 注册新 key `student_activity`
- 前端新建 `StudentActivityReportPanel` 组件
- 复用现有 AdminAnalyticsPage 的报表目录导航

## 后端设计

### 报表注册

`AnalyticsReportRegistry.listReports()` 新增：
```java
new AnalyticsReportDescriptorDto(
    "student_activity",
    "学生活跃度统计",
    "按课题组筛选成员，查看进出次数、在馆时长、时段热力等活跃度指标",
    "人员与活跃度",
    true
)
```

### API 端点

#### 1. 课题组列表（搜索建议）
```
GET /api/v1/analytics/student-activity/groups
Params: keyword (可选模糊搜索), limit (默认20)
Response: { groups: [{ name: "xxx", memberCount: N }] }
```
数据来源：`aro_personnel.project_group_name` 列，拆分逗号去重后返回。

#### 2. 成员活跃度查询
```
GET /api/v1/analytics/student-activity/members
Params:
  - groupName: 课题组名称（必填）
  - startTime: 开始时间 yyyy-MM-dd HH:mm:ss
  - endTime: 结束时间 yyyy-MM-dd HH:mm:ss
  - sortBy: entries | duration | dailyAvg | lastActive（默认 entries）
  - order: desc | asc（默认 desc）
  - page: 页码（默认 1）
  - size: 每页条数（默认 20）
Response: {
  summary: { memberCount, totalEntries, totalDurationMinutes, avgDailyFreq, activeRate },
  members: [{ userId, userName, entryCount, exitCount, totalDurationMinutes, dailyAvgFreq, lastActiveDate, trendPct }],
  total: N
}
```

#### 3. 时段热力图数据
```
GET /api/v1/analytics/student-activity/heatmap
Params: groupName, startTime, endTime
Response: {
  heatmap: [{ dayOfWeek: 1-7, hour: 0-23, entryCount: N, exitCount: N }]
}
```

#### 4. 日趋势数据
```
GET /api/v1/analytics/student-activity/daily-trend
Params: groupName, startTime, endTime
Response: {
  trend: [{ date: "2026-05-01", entryCount: N, exitCount: N }]
}
```

### SQL 核心逻辑

成员活跃度查询需要 JOIN `access_log` (进出流水) 与 `aro_personnel` (人员档案)：

```sql
-- 按课题组筛选成对进出记录，按成员聚合
SELECT
    p.user_id,
    p.name AS user_name,
    COUNT(DISTINCT paired.entry_id) AS entry_count,
    COUNT(DISTINCT paired.exit_id) AS exit_count,
    SUM(paired.duration_minutes) AS total_duration_minutes,
    COUNT(DISTINCT DATE(paired.entry_time)) AS active_days,
    MAX(paired.entry_time) AS last_active_time
FROM aro_personnel p
JOIN (
    -- 子查询：匹配 entry-exit 对
    SELECT e.user_id, e.id AS entry_id, x.id AS exit_id,
           e.access_time AS entry_time, x.access_time AS exit_time,
           TIMESTAMPDIFF(MINUTE, e.access_time, x.access_time) AS duration_minutes
    FROM access_log e
    JOIN access_log x ON e.user_id = x.user_id
        AND x.access_type = 2  -- 离开
        AND x.access_time > e.access_time
        AND x.access_time < DATE_ADD(e.access_time, INTERVAL 24 HOUR)
        AND NOT EXISTS (
            SELECT 1 FROM access_log mid
            WHERE mid.user_id = e.user_id AND mid.access_type = 2
              AND mid.access_time > e.access_time AND mid.access_time < x.access_time
        )
    WHERE e.access_type = 1  -- 进入
      AND e.access_time BETWEEN #{startTime} AND #{endTime}
) paired ON p.user_id = paired.user_id
WHERE p.project_group_name LIKE CONCAT('%', #{groupName}, '%')
GROUP BY p.user_id, p.name
ORDER BY entry_count DESC
```

> 说明：entry-exit 配对使用最近邻匹配策略 — 每条进入记录找其之后最近的一条离开记录，24小时内有效。中间不能有其他离开记录。

### 新增/修改文件（后端）

| 文件 | 操作 |
|---|---|
| `modules/analytics/service/AnalyticsReportRegistry.java` | 新增 student_activity 注册 |
| `modules/analytics/controller/StudentActivityController.java` | 新建，4个端点 |
| `modules/analytics/service/StudentActivityService.java` | 新建，核心查询逻辑 |
| `modules/twin/common/mapper/TwinDashboardMapper.java` | 新增 3 个查询方法 |
| `resources/mapper/TwinDashboardMapper.xml` | 新增对应 SQL |

## 前端设计

### 组件树

```
AdminAnalyticsPage (已有)
└── StudentActivityReportPanel (新建)
    ├── ActivityFilterBar (课题组搜索 + 时间选择)
    ├── ActivityKpiCards (4个 KPI 卡片)
    ├── ActivityMemberTable (排名表，可排序列)
    │   └── 分页控件
    ├── ActivityHeatmapChart (时段热力图)
    └── ActivityTrendChart (日趋势折线图)
```

### UI 布局（已确认）

- **顶部**：课题组搜索下拉 + 时间预设（今日/本周/本月）+ 自定义日期范围 + 导出CSV
- **KPI 行**：课题组人数 / 总进出次数 / 人均日频次 / 近期活跃率（7天内有过进出的占比）
- **排名表**：排名/姓名/进出次数/总时长/日均频次/最近活跃/环比趋势，列头点击排序
- **双图表**：左侧时段热力图（横轴0-23时，纵轴周一~周日），右侧每日趋势折线图

### 新增/修改文件（前端）

| 文件 | 操作 |
|---|---|
| `api/domains/analytics.api.ts` | 新增 4 个 API 函数 + 类型定义 |
| `features/analytics/components/StudentActivityReportPanel.tsx` | 新建，主面板 |
| `features/analytics/components/ActivityFilterBar.tsx` | 新建，筛选栏 |
| `features/analytics/components/ActivityMemberTable.tsx` | 新建，排名表 |
| `features/analytics/components/ActivityHeatmapChart.tsx` | 新建，热力图 |
| `features/analytics/components/ActivityTrendChart.tsx` | 新建，趋势图 |
| `pages/AdminAnalyticsPage.tsx` | 修改：新增 student_activity case，渲染新 Panel |

图表库：使用项目已有的 `recharts`（已在 `MeasuredChartBox` 等组件中使用）。

### 课题组选择器交互

1. 输入框聚焦后，显示默认课题组列表（从 `/student-activity/groups` 获取）
2. 键入文字后实时模糊搜索，防抖 300ms
3. 选中课题组后，自动触发成员数据加载
4. 支持清空已选，重新搜索

## Bug 修复：搜索后翻页失效

### 问题定位

`AdminPersonnelPage.tsx` 第39行 `const [page, setPage] = useState(1)` — 当用户在搜索框输入关键词时，`keyword` 状态更新触发 `useQuery` 重新请求，但 `page` 状态未重置为 1。若用户当时在第 N 页（N > 1），搜索后的新结果集可能不足 N 页，导致显示空数据。

### 修复

在搜索框的提交处理（Enter 按键或点击"查询"按钮）中，增加 `setPage(1)`：

```tsx
// AdminPersonnelPage.tsx 第318-329行附近
onKeyDown={(e) => {
  if (e.key === "Enter") {
    setPage(1);  // ← 新增
    activeTab === "personnel" ? refetchPersonnel() : refetchSystem();
  }
}}
// 查询按钮点击同样加 setPage(1)
```

同样检查 `DebugTablePage.tsx` 第54-56行的 `useEffect` 已正确处理 reset page，无需修改。

### 修复文件

| 文件 | 操作 |
|---|---|
| `pages/AdminPersonnelPage.tsx` | 搜索提交时增加 `setPage(1)` |

## 实现步骤

1. **后端 — 报表注册**：`AnalyticsReportRegistry` 新增 `student_activity`
2. **后端 — Mapper + XML**：`TwinDashboardMapper` 新增 3 个查询（课题组列表、成员活跃度、热力图/趋势）
3. **后端 — Service + Controller**：`StudentActivityService` + `StudentActivityController`
4. **前端 — API 层**：`analytics.api.ts` 新增类型与请求函数
5. **前端 — 组件**：依次实现 FilterBar → KpiCards → MemberTable → Heatmap → Trend
6. **前端 — 集成**：`AdminAnalyticsPage.tsx` 挂载新 Panel
7. **Bug 修复**：`AdminPersonnelPage.tsx` 搜索时重置页码
8. **验证**：启动应用，手动测试课题组筛选 → 排序 → 翻页 → 图表渲染

## 备注

- 数据成对过滤在 SQL 层完成，Service 层不重复处理
- 课题组筛选使用 LIKE 匹配（`project_group_name` 为逗号分隔多值字段）
- 时区：所有时间以服务器时区为准
- 报表无快照/订阅机制（实时查询），不接入 analytics 的 AuditLog 清算流程
