# 统计与审计页面 — 布局、数据、功能修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复统计与审计页面五个问题：报表目录缩窄、课题组柱状图增强、配置可见性开关、ARO 数据来源修正、历史快照点击修复。

**Architecture:** 纯前端改动，集中在 `AdminAnalyticsPage`、`CategorySnapshotAnalysisCard`、配置弹窗组链、`SettlementRecordsPanel` 及两个 ReportPanel。第 4 点（ARO 数据来源）需要 `fetchAuditLogDetail` 返回中包含用户级明细（若当前无，需后端追加 `userLevel` 字段）。

**Tech Stack:** React, TypeScript, Recharts (`Cell`, `LabelList`), TanStack React Query, Tailwind CSS, @radix-ui/react-switch

---

### Task 1: 报表目录缩小 — `lg:w-56` → `lg:w-40`

**Files:**
- Modify: `frontend/src/pages/AdminAnalyticsPage.tsx:50`

- [ ] **Step 1: 修改宽度类名**

在 `AdminAnalyticsPage.tsx` 第 50 行，将 `<nav>` 的 `lg:w-56` 改为 `lg:w-40`：

```tsx
// 当前 (line 50):
<nav className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">

// 改为:
<nav className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-40 lg:flex-col lg:overflow-visible">
```

- [ ] **Step 2: 确认改动**

运行：`grep -n "lg:w-56" frontend/src/pages/AdminAnalyticsPage.tsx`
预期：无结果（已被替换为 `lg:w-40`）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminAnalyticsPage.tsx
git commit -m "fix: shrink admin analytics report nav from w-56 to w-40 (save 64px for snapshot cards)"
```

---

### Task 2: 课题组柱状图 — 多颜色 + 数值标签

**Files:**
- Modify: `frontend/src/features/analytics/components/CategorySnapshotAnalysisCard.tsx`

- [ ] **Step 1: 添加颜色调色板和 Cell/LabelList 导入**

在文件顶部 import 区，追加 `Cell` 和 `LabelList` 从 recharts：

```tsx
// 当前第 3 行:
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

// 改为:
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
```

在 `CYCLE_TITLE` 常量下方（第 16 行附近），新增颜色调色板：

```tsx
const GROUP_BAR_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899",
  "#f97316", "#14b8a6", "#ef4444", "#3b82f6", "#a855f7", "#22c55e",
] as const;
```

- [ ] **Step 2: 替换课题组柱状图的 Bar 渲染**

在 `CategorySnapshotAnalysisCard` 函数体中，找到课题组 `<BarChart>` 内的 `<Bar>`（约第 206 行）：

```tsx
// 当前 (lines 186-208):
<MeasuredChartBox height={allGroupsChartHeight}>
  <BarChart
    data={allGroupsChart}
    margin={{ top: 8, right: 8, left: 4, bottom: allGroupsChart.length > 6 ? 56 : 24 }}
  >
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
    <XAxis
      dataKey="name"
      tick={{ fontSize: 9 }}
      interval={0}
      angle={allGroupsChart.length > 6 ? -40 : 0}
      textAnchor={allGroupsChart.length > 6 ? "end" : "middle"}
      height={allGroupsChart.length > 6 ? 56 : 24}
    />
    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={40} />
    <Tooltip
      formatter={(v) => [Number(v ?? 0), isAccessPackage ? "条" : metricUnit]}
      labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ""}
    />
    <Bar dataKey="personTimes" fill="#7c6cf0" radius={[4, 4, 0, 0]} maxBarSize={32} />
  </BarChart>
</MeasuredChartBox>

// 改为:
<MeasuredChartBox height={allGroupsChartHeight}>
  <BarChart
    data={allGroupsChart}
    margin={{ top: 20, right: 8, left: 4, bottom: allGroupsChart.length > 6 ? 56 : 24 }}
  >
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
    <XAxis
      dataKey="name"
      tick={{ fontSize: 9 }}
      interval={0}
      angle={allGroupsChart.length > 6 ? -40 : 0}
      textAnchor={allGroupsChart.length > 6 ? "end" : "middle"}
      height={allGroupsChart.length > 6 ? 56 : 24}
    />
    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={40} />
    <Tooltip
      formatter={(v) => [Number(v ?? 0), isAccessPackage ? "条" : metricUnit]}
      labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ""}
    />
    <Bar dataKey="personTimes" radius={[4, 4, 0, 0]} maxBarSize={32}>
      {allGroupsChart.map((entry, idx) => (
        <Cell key={entry.fullName} fill={GROUP_BAR_COLORS[idx % GROUP_BAR_COLORS.length]} />
      ))}
      <LabelList dataKey="personTimes" position="top" fontSize={9} fontWeight={600} fill="#374151" />
    </Bar>
  </BarChart>
</MeasuredChartBox>
```

关键改动：
- `margin.top` 从 `8` 改为 `20`（为顶部数值标签留空间）
- 移除 `fill="#7c6cf0"`，改为 `<Cell>` 逐柱着色
- 新增 `<LabelList>` 在柱顶渲染数值

- [ ] **Step 3: 同样处理 PI 课题组笼位柱状图（仅 cage 报表）**

找到 PI 课题组横向柱状图（约第 234-242 行），同样添加颜色和标签。但横向图用 `layout="vertical"`，LabelList 需调整位置：

```tsx
// 当前 (lines 233-242):
<Bar dataKey="personTimes" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={16} />

// 改为:
<Bar dataKey="personTimes" radius={[0, 4, 4, 0]} barSize={16}>
  {topPis.map((entry, idx) => (
    <Cell key={entry.fullName} fill={GROUP_BAR_COLORS[idx % GROUP_BAR_COLORS.length]} />
  ))}
  <LabelList dataKey="personTimes" position="right" fontSize={9} fontWeight={600} fill="#374151" />
</Bar>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/analytics/components/CategorySnapshotAnalysisCard.tsx
git commit -m "feat: multi-color bars with value labels for research group chart in analytics"
```

---

### Task 3: 配置可见性开关（isPublic）

**Files:**
- Modify: `frontend/src/api/domains/analytics.api.ts` — 类型扩展
- Modify: `frontend/src/features/analytics/components/AnalyticsConfigSettingsModal.tsx` — 新增 Switch
- Modify: `frontend/src/features/analytics/components/SaveAnalyticsConfigModal.tsx` — 传递 isPublic
- Modify: `frontend/src/features/analytics/components/EditAnalyticsViewModal.tsx` — 传递 isPublic
- Modify: `frontend/src/features/analytics/components/IsolationUsageReportPanel.tsx` — handleSaveConfig 携带 isPublic
- Modify: `frontend/src/features/analytics/components/CageOccupancyReportPanel.tsx` — handleSaveConfig 携带 isPublic

- [ ] **Step 1: 扩展 AnalyticsUserView 类型**

在 `analytics.api.ts` 第 115-125 行，追加 `isPublic` 字段：

```tsx
export type AnalyticsUserView = {
  id: number;
  reportKey: string;
  name: string;
  filter: AnalyticsViewFilter;
  defaultView: boolean;
  subscribed: boolean;
  sortOrder: number;
  isPublic?: boolean;  // 新增：是否对 STAFF+ 所有人可见
  createdAt?: string;
  updatedAt?: string;
};
```

同时扩展 `SaveConfigOptions` 类型（在 `SaveAnalyticsConfigModal.tsx` 中）和 `saveAnalyticsView` / `updateAnalyticsView` 的调用参数。

- [ ] **Step 2: 在 AnalyticsConfigSettingsModal 中新增 Switch**

在 `AnalyticsConfigSettingsModal.tsx` 底部按钮区（「另存为新配置」上方），约第 145 行 `</div>` 闭合前新增：

```tsx
{/* 在 </div> (line 143) 之前插入，即 CompareCyclesField 之后 */}
<div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3">
  <div className="min-w-0 flex-1">
    <p className="text-sm font-semibold text-amber-900">对所有人可见</p>
    <p className="text-xs text-amber-700">所有可进入后台的用户（STAFF+）均可查看和使用此配置</p>
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={!isCage ? (props as IsolationProps).draft.isPublic === true : false}
    onClick={() => {
      if (!isCage) {
        const iso = props as IsolationProps;
        iso.onDraftChange({ ...iso.draft, isPublic: !iso.draft.isPublic });
      }
    }}
    className={`ml-3 shrink-0 inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors ${
      !isCage && (props as IsolationProps).draft.isPublic ? "bg-amber-500" : "bg-neutral-300"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        !isCage && (props as IsolationProps).draft.isPublic ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
</div>
```

注意：仅在 `!isCage`（即隔离服使用统计）时显示此开关，笼位统计暂不涉及。

- [ ] **Step 3: 扩展 AnalyticsDraftFilter 类型**

在 `analyticsPipelineFilter.ts` 的 `AnalyticsScopeFilter` 类型中新增 `isPublic`：

```tsx
export type AnalyticsScopeFilter = {
  // ... existing fields
  isPublic?: boolean;  // 新增
};
```

`AnalyticsDraftFilter` 是 `AnalyticsScopeFilter` 的别名，自动继承。同时更新 `defaultAnalyticsDraftFilter()` 返回默认 `isPublic: false`。

- [ ] **Step 4: 在 SaveAnalyticsConfigModal 中新增 isPublic**

在 `SaveAnalyticsConfigModal.tsx` 中：

```tsx
// 扩展 SaveConfigOptions (line 10-16):
export type SaveConfigOptions = {
  name: string;
  compareCycles: AnalyticsCompareCycle[];
  subscribe: boolean;
  backfillHistory: boolean;
  backfillUntil: string;
  isPublic?: boolean;  // 新增
};
```

在组件内新增 state（约第 38 行）：

```tsx
const [isPublic, setIsPublic] = useState(false);
```

在 `handleSubmit` 中传递给 `onConfirm`（约第 64 行）：

```tsx
await onConfirm({
  name: trimmed,
  compareCycles,
  subscribe,
  backfillHistory: subscribe && backfillHistory,
  backfillUntil,
  isPublic,  // 新增
});
```

在 UI 中 `HistoryBackfillField` 之后新增 checkbox（约第 127 行之后）：

```tsx
<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
  <input
    type="checkbox"
    className="h-4 w-4 rounded border-amber-300 text-amber-600"
    checked={isPublic}
    onChange={(e) => setIsPublic(e.target.checked)}
  />
  <span className="text-sm text-amber-900">
    对所有人可见（STAFF+ 角色用户均可查看和使用此配置）
  </span>
</label>
```

同时在 `reset` 逻辑中加上 `setIsPublic(false)`。

- [ ] **Step 5: 在 EditAnalyticsViewModal 中新增 isPublic**

在 `EditAnalyticsViewModal.tsx` 中新增 state 和 UI。在 `useEffect` 初始化时从 `view` 读取 `isPublic`：

```tsx
const [isPublic, setIsPublic] = useState(false);

// 在 useEffect 中 (line 62-75) 追加:
setIsPublic((view.filter as Record<string, any>)?.isPublic === true);
```

在订阅 checkbox 之后新增可见性 checkbox，并在 `onSave` 时将 `isPublic` 写入 filter。

- [ ] **Step 6: 在 IsolationUsageReportPanel 中贯通 isPublic**

在 `handleSaveConfig`（第 209 行）中将 `opts.isPublic` 写入 filter：

```tsx
const filter = scopeFilterOnly({ ...draft, compareCycles: opts.compareCycles });
// 新增: 将 isPublic 写入 filter
if (opts.isPublic) {
  (filter as any).isPublic = true;
}
```

在 `handleUpdateView` 中同样处理。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/domains/analytics.api.ts \
        frontend/src/features/analytics/analyticsPipelineFilter.ts \
        frontend/src/features/analytics/components/AnalyticsConfigSettingsModal.tsx \
        frontend/src/features/analytics/components/SaveAnalyticsConfigModal.tsx \
        frontend/src/features/analytics/components/EditAnalyticsViewModal.tsx \
        frontend/src/features/analytics/components/IsolationUsageReportPanel.tsx
git commit -m "feat: add isPublic toggle to analytics config for STAFF+ visibility"
```

---

### Task 4: 课题组数据来源修正 — 门禁人员匹配人员资料库

**Files:**
- Modify: `frontend/src/features/analytics/components/CategorySnapshotAnalysisCard.tsx`
- Reference: `frontend/src/api/domains/admin.api.ts` (`fetchAdminPersonnel`)
- Reference: `frontend/src/api/domains/analytics.api.ts` (`IsolationUsageQueryResult`)

**前提**: `fetchAuditLogDetail` 返回的 `IsolationUsageQueryResult` 需要包含用户级明细（至少 `userName` 列表）。检查 `auxiliaryFlow` 或其他字段是否已有；若无，需后端在 detail 响应中追加。

- [ ] **Step 1: 检查 detail 响应中是否有用户级数据**

首先在浏览器 Network 面板中检查 `/v1/analytics/audit-logs/:id/detail` 的响应体，确认是否包含：
- `auxiliaryFlow.rawUsers?: { userId: string; userName: string }[]`
- 或其他逐用户字段

若**无用户级数据**：此 Task 标记为「需后端配合——在 detail 响应中追加 `userLevel: { userId: string; userName: string; personTimes: number }[]`」，暂停前端改动，先联系后端。

若**有用户级数据**：继续 Step 2。

- [ ] **Step 2: 扩展 IsolationUsageQueryResult 类型**

在 `analytics.api.ts` 的 `IsolationUsageQueryResult` 中追加（假设后端已加）：

```tsx
export type IsolationUsageQueryResult = {
  // ... existing fields
  userLevel?: { userId: string; userName: string; personTimes: number }[];  // 新增
};
```

- [ ] **Step 3: 在 CategorySnapshotAnalysisCard 中实现匹配聚合**

新增 `useQuery` 拉取人员资料库。核心逻辑在组件内：

```tsx
// 新增 import
import { useQuery } from "@tanstack/react-query";
import { fetchAdminPersonnel } from "@/api/domains/admin.api";

// 在 CategorySnapshotAnalysisCard 函数体内，groups 计算之后追加:
const userLevel = detail?.userLevel ?? [];

// 从 userLevel 提取用户名称，匹配人员资料库
const { data: personnelData } = useQuery({
  queryKey: ["admin", "personnel", "batch", userLevel.map(u => u.userName).join(",")],
  queryFn: async () => {
    // 分批查询：fetchAdminPersonnel 支持 keyword 搜索
    // 逐个名称查询并合并结果
    const results: Map<string, string> = new Map(); // name → projectGroupName
    for (const u of userLevel) {
      try {
        const page = await fetchAdminPersonnel(1, 5, u.userName);
        const match = page.data.find(
          (p) => p.name === u.userName || p.name.includes(u.userName)
        );
        if (match?.projectGroupName) {
          results.set(u.userName, match.projectGroupName);
        }
      } catch { /* skip failed lookups */ }
    }
    return results;
  },
  enabled: userLevel.length > 0,
  staleTime: 300_000,
});

// 聚合为 ProjectGroupRow[]
const matchedGroups = useMemo(() => {
  if (!personnelData || personnelData.size === 0) return null;
  const agg = new Map<string, number>();
  for (const u of userLevel) {
    const group = personnelData.get(u.userName);
    if (group) {
      agg.set(group, (agg.get(group) ?? 0) + u.personTimes);
    }
  }
  return [...agg.entries()]
    .map(([groupName, personTimes]) => ({ groupName, personTimes }))
    .sort((a, b) => b.personTimes - a.personTimes);
}, [personnelData, userLevel]);

// 若匹配成功则使用 matchedGroups，否则回退到 detail.byProjectGroup
const groups = matchedGroups ?? (detail?.byProjectGroup ?? []);
```

- [ ] **Step 4: 更新课题组标题提示**

```tsx
// 当前 (line 180):
{`课题组${isAccessPackage ? "（ARO 流水）" : metricUnit}（本期，全部 ${allGroupsChart.length} 个）`}

// 改为:
{`课题组${isAccessPackage ? (matchedGroups ? "（人员库匹配）" : "（ARO 流水）") : metricUnit}（本期，全部 ${allGroupsChart.length} 个）`}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/analytics/components/CategorySnapshotAnalysisCard.tsx \
        frontend/src/api/domains/analytics.api.ts
git commit -m "fix: derive research group stats from personnel DB matching instead of raw ARO flow"
```

---

### Task 5: 修复点击历史快照右侧不更新

**Files:**
- Modify: `frontend/src/features/analytics/components/SettlementRecordsPanel.tsx`
- Modify: `frontend/src/features/analytics/components/IsolationUsageReportPanel.tsx`
- Modify: `frontend/src/features/analytics/components/CageOccupancyReportPanel.tsx`
- Modify: `frontend/src/features/analytics/components/LatestSnapshotsDashboard.tsx`

- [ ] **Step 1: SettlementRecordsPanel — onSelectLog 改传完整对象**

在 `SettlementRecordsPanel.tsx` 中，将 `onSelectLog` 签名从 `(id: number) => void` 改为 `(log: AnalyticsAuditLog) => void`：

```tsx
// 当前 Props (line 28):
onSelectLog: (id: number) => void;

// 改为:
onSelectLog: (log: AnalyticsAuditLog) => void;
```

`RecordRow` 的 `onClick` 改为传完整对象：

```tsx
// 当前 RecordRow (line 157):
onClick={() => onSelectLog(log.id)}

// 改为:
onClick={() => onSelectLog(log)}
```

同步更新 `RecordSection` 中传递给 `RecordRow` 的 props。

- [ ] **Step 2: IsolationUsageReportPanel — selectedLog 改为 useState**

将 `selectedLog` 从 `useMemo` 派生改为 `useState` 直接存储：

```tsx
// 当前 (line 100-107):
const selectedLog = useMemo(() => {
  if (selectedLogId == null) return null;
  for (const list of grouped.values()) {
    const hit = list.find((l) => l.id === selectedLogId);
    if (hit) return hit;
  }
  return null;
}, [grouped, selectedLogId]);

// 改为:
const [selectedLog, setSelectedLog] = useState<AnalyticsAuditLog | null>(null);
```

在 `SettlementRecordsPanel` 的 `onSelectLog` 回调中直接设置：

```tsx
// 当前 (line 498):
onSelectLog={setSelectedLogId}

// 改为:
onSelectLog={(log) => {
  setSelectedLogId(log.id);
  setSelectedLog(log);
  // 强制刷新该快照的 detail 缓存
  void qc.invalidateQueries({ queryKey: ["analytics", "audit-detail", log.id] });
}}
```

移除不再需要的 `selectedLog` useMemo 和相关 import。

- [ ] **Step 3: 相同改动应用到 CageOccupancyReportPanel**

在 `CageOccupancyReportPanel.tsx` 中做完全相同的改动：
- `selectedLog` 改为 `useState`
- `onSelectLog` 回调中同时设置 `setSelectedLogId` 和 `setSelectedLog`
- invalidate detail 缓存

- [ ] **Step 4: LatestSnapshotsDashboard — 接受 selectedLog 作为直接依赖**

`LatestSnapshotsDashboard` 的 `entries` useMemo 依赖已经包含 `selectedLog`，但因 `selectedLog` 现在由 state 直接维护，引用稳定。确保 `detailQueries` 的 `staleTime` 在点击历史快照时不会阻碍更新：

```tsx
// 当前 (lines 55-59):
staleTime: 60_000,

// 改为:
staleTime: 0,  // 点击历史快照时总是拉取最新 detail
```

同时在 `LatestSnapshotsDashboard` 中当 `selectedLog` 变化时，`displayLog` 应正确切换（现有逻辑已正确处理 `selectedLog.periodType === cycle` 匹配）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/analytics/components/SettlementRecordsPanel.tsx \
        frontend/src/features/analytics/components/IsolationUsageReportPanel.tsx \
        frontend/src/features/analytics/components/CageOccupancyReportPanel.tsx \
        frontend/src/features/analytics/components/LatestSnapshotsDashboard.tsx
git commit -m "fix: historical snapshot click now correctly updates right-side charts"
```

---

## 验证步骤

完成所有 Task 后：

1. **Task 1**: 打开 `/admin/analytics`，确认报表目录宽度缩小至 ~160px，中间和右侧面板无溢出
2. **Task 2**: 确保有月快照数据（课题组 > 5 个），展开课题组柱状图，确认每个柱子颜色不同且有数值标签
3. **Task 3**: 打开统计配置弹窗 → 确认可见性开关存在 → 保存配置时勾选 → 用另一个 STAFF 账号登录确认可看到
4. **Task 4**: 查看隔离服使用统计的课题组柱状图，确认标题显示「课题组（人员库匹配）」且数据来自人员资料库
5. **Task 5**: 点击左侧清算记录中非最新的历史快照 → 右侧图表切换到该快照的周期数据（含 detail 柱状图）

---

## 自审清单

- [x] 每个 Task 有明确的文件和代码内容
- [x] Task 4 标注了「需后端配合」的前提条件
- [x] 无 TBD / TODO 占位
- [x] 所有 import 和类型引用与现有代码一致
- [x] Commit message 遵循 conventional commits
