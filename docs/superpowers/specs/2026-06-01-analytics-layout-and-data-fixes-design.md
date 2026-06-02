# 统计与审计页面 — 布局优化、数据修正与功能新增

**日期**: 2026-06-01
**范围**: 教职工视图 → 统计与审计 (`/admin/analytics`)
**状态**: 设计中

---

## 概述

五个改动点，均限制在 `frontend/src/` 前端范围内：

1. **报表目录缩小** — `AdminAnalyticsPage.tsx` 最左侧导航 `lg:w-56` → `lg:w-40`
2. **课题组柱状图增强** — 多颜色区分 + 柱顶数值标签
3. **配置可见性开关** — 统计配置可设为 STAFF+ 所有人可见
4. **课题组数据来源修正** — ARO 流水数据按门禁人员名称匹配人员资料库课题组后聚合
5. **修复历史快照点击** — 点击左侧清算记录中的历史快照，右侧图表切换为该快照当时数据

---

## 1. 报表目录缩小

### 现状

[AdminAnalyticsPage.tsx:50](frontend/src/pages/AdminAnalyticsPage.tsx#L50) 左侧 `<nav>` 使用 `lg:w-56`（224px），内部只有 3 个 `ReportNavCard` 条目。

### 改动

```diff
- <nav className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
+ <nav className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-40 lg:flex-col lg:overflow-visible">
```

| 属性 | 当前值 | 目标值 |
|---|---|---|
| 宽度 | `lg:w-56` (224px) | `lg:w-40` (160px) |
| 文件 | `AdminAnalyticsPage.tsx:50` | 仅一行 |

**注意**：中间层「统计配置 + 清算记录」侧栏（`xl:w-72`）保持不变。

---

## 2. 课题组柱状图 — 多颜色 + 数值标签

### 现状

[CategorySnapshotAnalysisCard.tsx:186-207](frontend/src/features/analytics/components/CategorySnapshotAnalysisCard.tsx#L186-L207) 课题组 `BarChart` 所有柱子统一 `fill="#7c6cf0"`，无数值标注。

### 改动

#### 2a. 颜色方案

定义 12 色调色板，按索引轮换：

```ts
const GROUP_BAR_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899",
  "#f97316", "#14b8a6", "#ef4444", "#3b82f6", "#a855f7", "#22c55e",
];
```

#### 2b. 数值标签

使用 Recharts `<LabelList>` 在柱顶显示数值：

```tsx
<Bar dataKey="personTimes" maxBarSize={32} radius={[4, 4, 0, 0]}>
  {
    allGroupsChart.map((entry, idx) => (
      <Cell key={entry.fullName} fill={GROUP_BAR_COLORS[idx % GROUP_BAR_COLORS.length]} />
    ))
  }
  <LabelList dataKey="personTimes" position="top" fontSize={9} fontWeight={600} />
</Bar>
```

`Cell` 来自 recharts，每个柱子单独着色。`LabelList` 在柱顶渲染数值。

---

## 3. 配置可见性开关

### 现状

`AnalyticsUserView` 类型（[analytics.api.ts:115](frontend/src/api/domains/analytics.api.ts#L115)）无私密/公开标记，所有配置仅创建者可见。

### 改动

#### 3a. 类型扩展

在 `AnalyticsUserView` 中新增 `isPublic` 字段（前端先行，后端按需追加）：

```ts
export type AnalyticsUserView = {
  // ... existing fields
  isPublic?: boolean; // 新增：是否对 STAFF+ 所有人可见
};
```

#### 3b. UI 开关

在 [AnalyticsConfigSettingsModal.tsx](frontend/src/features/analytics/components/AnalyticsConfigSettingsModal.tsx) 的「另存为新配置」按钮上方新增 Switch：

```tsx
<div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3">
  <div>
    <p className="text-sm font-semibold text-amber-900">对所有人可见</p>
    <p className="text-xs text-amber-700">所有可进入后台的用户（STAFF+）均可查看和使用此配置</p>
  </div>
  <Switch checked={draft.isPublic} onCheckedChange={(v) => setDraft({ ...draft, isPublic: v })} />
</div>
```

#### 3c. 保存/更新传递

- `SaveAnalyticsConfigModal` 保存时携带 `isPublic`
- `EditAnalyticsViewModal` 编辑时携带 `isPublic`
- `saveAnalyticsView` / `updateAnalyticsView` API 调用时在 filter 或独立字段中传递

#### 3d. 范围

仅 STAFF+ 角色可见（即能进入后台的用户）。学生端不可见。

---

## 4. 课题组数据来源修正

### 现状

`CategorySnapshotAnalysisCard` 中 `groups = detail?.byProjectGroup` 直接从后端 ARO 流水返回。

### 目标

改为：门禁计数的人员名称 → 匹配人员资料库 → 获取课题组 → 聚合统计。

### 实现方案

#### 4a. 数据流

```
detail (IsolationUsageQueryResult)
  ↓ 取 summary.uniqueUsers 涉及的 user 列表
  ↓ （若 detail 无逐用户数据，需后端在 detail 中追加 userLevel 明细）
  ↓
人员资料库 API (fetchAdminPersonnel / 或新批量查询接口)
  ↓ 按 name 匹配 → 得到 projectGroupName
  ↓
前端聚合：按 projectGroupName 分组 count
  ↓
替代 detail.byProjectGroup 渲染柱状图
```

#### 4b. 约束

- **不新增后端接口**：使用现有 `fetchAdminPersonnel` 按关键字搜索匹配。若 detail 中返回了用户级明细（user_id/name），则批量对比。
- 若 `detail` 目前不返回用户级明细，需要后端在 `fetchAuditLogDetail` 响应中追加 `userLevel?: { userId: string; userName: string }[]` 字段——这是唯一可能需要后端配合的点。

#### 4c. 前端实现

在 `CategorySnapshotAnalysisCard` 中新增 `useQuery` 拉取人员资料（按需、分批）：

1. 从 `detail` 获取用户名称列表
2. 分批调用 `fetchAdminPersonnel(keyword=name)` 做精确匹配
3. 构建 `Map<name, projectGroupName>`
4. 聚合为 `ProjectGroupRow[]` 替代 `detail.byProjectGroup`

**注意**：若后端已在 detail 中直接返回逐用户的 `projectGroupName`，则前端无需额外查询，直接聚合即可。

---

## 5. 修复点击历史快照右侧不更新

### 现状分析

点击 `SettlementRecordsPanel` 中历史快照 → `setSelectedLogId(id)` → `selectedLog` 通过 `useMemo` 从 `grouped` 查找 → 传入 `LatestSnapshotsDashboard` → `displayLog` 按 `periodType` 匹配。

### 可能根因

1. **`selectedLog` 查找失败**：`IsolationUsageReportPanel` 中 `selectedLog` 遍历 `grouped` 查找，但 `grouped` 可能不含该 log（`useGroupedAuditLogs` 的 `staleTime: 15_000` + `refetchInterval: 20_000`）。
2. **`LatestSnapshotsDashboard` 的 `entries` useMemo 依赖不完整**：依赖 `[compareCycles, latestByCycle, selectedLog]`——`selectedLog` 是对象引用，变化时应触发重算。
3. **`detailQueries` 缓存**：`staleTime: 60_000` 可能导致切换快照后短时间内仍显示旧数据。

### 修复方案

#### 5a. 确保 `selectedLog` 可靠查找

在 `SettlementRecordsPanel` 中，点击时直接传递完整的 `log` 对象而非仅 `id`，避免二次查找失败：

```tsx
// SettlementRecordsPanel props
onSelectLog: (log: AnalyticsAuditLog) => void;

// IsolationUsageReportPanel
const handleSelectLog = (log: AnalyticsAuditLog) => {
  setSelectedLogId(log.id);
  setSelectedLog(log); // 直接设置对象
};
```

将 `selectedLog` 从 `useMemo` 派生改为 `useState` 直接存储。

#### 5b. 强制刷新 detail

点击历史快照时，invalidate 对应 detail 缓存：

```tsx
const handleSelectLog = (log: AnalyticsAuditLog) => {
  setSelectedLogId(log.id);
  setSelectedLog(log);
  void qc.invalidateQueries({ queryKey: ["analytics", "audit-detail", log.id] });
};
```

#### 5c. `LatestSnapshotsDashboard` 适配

`displayLog` 逻辑保持不变（按 `periodType` 匹配），增加 `selectedLog` 作为直接依赖。

### 涉及文件

| 文件 | 改动 |
|---|---|
| `SettlementRecordsPanel.tsx` | `onSelectLog` 改传完整对象 |
| `IsolationUsageReportPanel.tsx` | 新增 `setSelectedLog` state，点击时 invalidate detail |
| `CageOccupancyReportPanel.tsx` | 同上 |
| `LatestSnapshotsDashboard.tsx` | 依赖调整 |

---

## 影响范围汇总

| # | 改动 | 文件 | 风险 |
|---|---|---|---|
| 1 | 报表目录 w-56→w-40 | `AdminAnalyticsPage.tsx` | 低（单行 CSS） |
| 2 | 柱状图颜色+标签 | `CategorySnapshotAnalysisCard.tsx` | 低（纯视觉） |
| 3 | 可见性开关 | `AnalyticsConfigSettingsModal.tsx`, `SaveAnalyticsConfigModal.tsx`, `EditAnalyticsViewModal.tsx`, `analytics.api.ts` 类型 | 中（需确认后端是否接受 `isPublic`） |
| 4 | 课题组数据来源 | `CategorySnapshotAnalysisCard.tsx` + 可能后端 | 高（依赖 detail 返回用户级数据） |
| 5 | 历史快照修复 | `SettlementRecordsPanel.tsx`, `IsolationUsageReportPanel.tsx`, `CageOccupancyReportPanel.tsx`, `LatestSnapshotsDashboard.tsx` | 中（涉及数据流改动） |

---

## 自审清单

- [x] 无 TBD / TODO 占位
- [x] 各改动点有明确的文件和行号引用
- [x] 前端先行，后端配合点已标注
- [x] 未引入新依赖（recharts `<Cell>` / `<LabelList>` 为已有库）
