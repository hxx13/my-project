# 学生审核页按人显示 + 物资合并 + 今天/历史分区 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 MaterialReviewPage：合并物资待审/已审为单一 tab，全部按当前登录人自动过滤，按今天/历史分区。

**Architecture:** 纯前端改动，单文件 `MaterialReviewPage.tsx`。新增 3 个数据源（material items、scan delay options、current userId），用它们构建过滤映射表。不涉及后端。

**Tech Stack:** React 18 + TypeScript + TanStack Query + Tailwind CSS

---

### Task 1: 添加数据源 —— material items 和 scan delay options

**Files:**
- Modify: `frontend/src/pages/MaterialReviewPage.tsx`

- [ ] **Step 1: 引入新依赖**

更新 react import，添加后续需要的 hooks：

找到：
```tsx
import { useEffect, useState } from "react";
```

替换为：
```tsx
import { useEffect, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
```

在文件顶部 import 区添加新依赖：

```tsx
import { fetchAdminMaterialItems, type MaterialItem } from "@/api/domains/material.api";
import { fetchScanDelayOptions, type ScanDelayOption } from "@/api/domains/scanDelay.api";
```

- [ ] **Step 2: 添加 items 和 options 的 useQuery**

在现有 `useQuery` 调用区域（约第 71-89 行之后）添加：

```tsx
const { data: allItems = [] } = useQuery<MaterialItem[]>({
  queryKey: ["material", "admin", "items"],
  queryFn: () => fetchAdminMaterialItems(),
  staleTime: 60_000,
});

const { data: scanDelayOptions = [] } = useQuery<ScanDelayOption[]>({
  queryKey: ["scan-delay", "options"],
  queryFn: fetchScanDelayOptions,
  staleTime: 60_000,
});
```

- [ ] **Step 3: 构建过滤映射表**

在 `allItems` 和 `scanDelayOptions` 之后添加两个 `useMemo`：

```tsx
const itemReviewerMap = useMemo(() => {
  const map = new Map<number, string[]>();
  for (const item of allItems) {
    const ids: string[] = [];
    try { if (item.reviewerIds) ids.push(...JSON.parse(item.reviewerIds)); } catch {}
    try { if (item.secondReviewerIds) ids.push(...JSON.parse(item.secondReviewerIds)); } catch {}
    map.set(item.id, ids);
  }
  return map;
}, [allItems]);

const optionReviewerMap = useMemo(() => {
  const map = new Map<number, string[]>();
  for (const opt of scanDelayOptions) {
    map.set(opt.id, opt.reviewerUserIds ?? []);
  }
  return map;
}, [scanDelayOptions]);
```

- [ ] **Step 4: 获取当前用户 ID 和过滤工具函数**

在映射表之后添加：

```tsx
const currentUserId = authStorage.getUserIdFromToken() ?? "";

const isMyItem = useCallback(
  (itemId: number) => {
    if (!currentUserId) return false;
    return (itemReviewerMap.get(itemId) ?? []).includes(currentUserId);
  },
  [currentUserId, itemReviewerMap]
);

const isMyOption = useCallback(
  (optionId: number) => {
    if (!currentUserId) return false;
    return (optionReviewerMap.get(optionId) ?? []).includes(currentUserId);
  },
  [currentUserId, optionReviewerMap]
);
```

- [ ] **Step 5: 添加 isToday 工具函数**

在组件外部（文件顶部，`statusBadge` 函数附近）添加：

```tsx
function isToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}
```

- [ ] **Step 6: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new TypeScript errors related to MaterialReviewPage.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MaterialReviewPage.tsx
git commit -m "feat(MaterialReview): add item/option data sources and filter helpers"
```

---

### Task 2: 重构 Tab 结构 —— 合并物资待审+已审，重定义 tab 类型

**Files:**
- Modify: `frontend/src/pages/MaterialReviewPage.tsx`

- [ ] **Step 1: 替换 TabKey 类型和常量**

找到：
```tsx
type TabKey = "pending" | "all" | "demands" | "scanDelay";
type ScanDelaySubTab = "pending" | "history";
const REVIEW_TABS: TabKey[] = ["pending", "all", "demands", "scanDelay"];
```

替换为：
```tsx
type TabKey = "material" | "scanDelay" | "demands";
const REVIEW_TABS: TabKey[] = ["material", "scanDelay", "demands"];
```

- [ ] **Step 2: 更新 parseReviewTab 默认值**

找到：
```tsx
function parseReviewTab(raw: string | null): TabKey {
  if (raw && REVIEW_TABS.includes(raw as TabKey)) return raw as TabKey;
  return "pending";
}
```

替换为：
```tsx
function parseReviewTab(raw: string | null): TabKey {
  if (raw && REVIEW_TABS.includes(raw as TabKey)) return raw as TabKey;
  return "material";
}
```

- [ ] **Step 3: 删除 ScanDelaySubTab state 和相关逻辑**

删除：
```tsx
const [scanDelaySubTab, setScanDelaySubTab] = useState<ScanDelaySubTab>("pending");
```

- [ ] **Step 4: 更新 switchTab 简化 URL 同步**

找到：
```tsx
const switchTab = (k: TabKey) => {
  if (k === "pending") {
    setSearchParams({}, { replace: true });
    return;
  }
  setSearchParams({ tab: k }, { replace: true });
};
```

替换为：
```tsx
const switchTab = (k: TabKey) => {
  if (k === "material") {
    setSearchParams({}, { replace: true });
    return;
  }
  setSearchParams({ tab: k }, { replace: true });
};
```

- [ ] **Step 5: 更新 loading 计算，移除 scanDelaySubTab 引用**

找到：
```tsx
const loading = tab === "pending" ? pendingLoading : tab === "all" ? finishedLoading : tab === "demands" ? demandLoading : scanDelaySubTab === "history" ? scanDelayHistoryLoading : scanDelayLoading;
```

替换为：
```tsx
const loading = tab === "material"
  ? pendingLoading || finishedLoading
  : tab === "demands"
    ? demandLoading
    : scanDelayLoading || scanDelayHistoryLoading;
```

- [ ] **Step 6: 更新 tab 按钮渲染**

找到 tab 按钮区域（约第 151-160 行），替换为：

```tsx
<div className="flex flex-wrap gap-1">
  {([
    ["material", `物资审核${pendingData || finishedData ? ` (${(pendingData ?? []).length + (finishedData?.data ?? []).length})` : ""}`],
    ["scanDelay", `延迟免冻结${scanDelayPending.length ? ` (${scanDelayPending.length})` : ""}`],
    ["demands", `需求建议${demands.length ? ` (${demands.filter((d: MaterialDemand) => d.status === 0).length})` : ""}`],
  ] as [TabKey, string][]).map(([k, v]) => (
    <button key={k} onClick={() => switchTab(k)} className={`rounded-twin-sm px-4 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"}`}>{v}</button>
  ))}
</div>
```

- [ ] **Step 8: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/MaterialReviewPage.tsx
git commit -m "feat(MaterialReview): merge pending+finished tabs, simplify to material/scanDelay/demands"
```

---

### Task 3: 重写物资审核 tab —— 合并列表 + 过滤 + 今天/历史分区

**Files:**
- Modify: `frontend/src/pages/MaterialReviewPage.tsx`

- [ ] **Step 1: 构建过滤后的合并物资列表**

在组件函数体内，`useMemo` 区域（Step 1 的映射表之后）添加：

```tsx
const filteredMaterialRequests = useMemo(() => {
  const pending = (pendingData ?? []).filter((req) =>
    (req.lines ?? []).some((line) => isMyItem(line.itemId))
  );
  const finished = (finishedData?.data ?? []).filter((req) =>
    (req.lines ?? []).some((line) => isMyItem(line.itemId))
  );
  const all = [...pending, ...finished].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return all;
}, [pendingData, finishedData, isMyItem]);

const materialToday = useMemo(
  () => filteredMaterialRequests.filter((r) => isToday(r.createdAt)),
  [filteredMaterialRequests]
);

const materialHistory = useMemo(
  () => filteredMaterialRequests.filter((r) => !isToday(r.createdAt)),
  [filteredMaterialRequests]
);
```

- [ ] **Step 2: 编写"今天/历史"分区渲染组件**

在组件外部（`isToday` 函数附近）添加：

```tsx
function TimeGroup({
  label,
  count,
  children,
  defaultOpen = true,
}: {
  label: string;
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--twin-ink)]"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {label} ({count})
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}
```

注意：`useState` 和 `ReactNode` 已在文件顶部 import。

- [ ] **Step 3: 替换物资审核 tab 的 JSX 渲染**

找到 `tab === "pending" ? (...)` 和 `tab === "all" ? (...)` 的整个渲染块（约第 322-365 行，即最后一个 else 分支），替换为新的 `tab === "material"` 分支：

```tsx
) : tab === "material" ? (
  <>
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setMaterialAutoApproveOpen(true)}
        className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
      >
        自动审批
      </button>
    </div>
    {loading ? <DataSkeleton variant="card" rows={5} /> : null}
    {filteredMaterialRequests.length === 0 && !loading ? (
      <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无你负责审核的物资申领</p>
    ) : (
      <div className="space-y-6">
        {materialToday.length > 0 && (
          <TimeGroup label="今天" count={materialToday.length}>
            {materialToday.map((req) => (
              <MaterialRequestCard
                key={req.id}
                req={req}
                canDelete={canDelete}
                approve={approve}
                reject={reject}
                deleteReq={deleteReq}
                handleExportPersonal={handleExportPersonal}
              />
            ))}
          </TimeGroup>
        )}
        {materialHistory.length > 0 && (
          <TimeGroup label="历史" count={materialHistory.length} defaultOpen={false}>
            {materialHistory.map((req) => (
              <MaterialRequestCard
                key={req.id}
                req={req}
                canDelete={canDelete}
                approve={approve}
                reject={reject}
                deleteReq={deleteReq}
                handleExportPersonal={handleExportPersonal}
              />
            ))}
          </TimeGroup>
        )}
      </div>
    )}
  </>
```

- [ ] **Step 4: 提取 MaterialRequestCard 组件**

在文件底部（`export default function MaterialReviewPage` 之后）添加独立卡片组件：

```tsx
function MaterialRequestCard({
  req,
  canDelete,
  approve,
  reject,
  deleteReq,
  handleExportPersonal,
}: {
  req: MaterialRequest;
  canDelete: boolean;
  approve: ReturnType<typeof useApproveMaterialRequest>;
  reject: ReturnType<typeof useRejectMaterialRequest>;
  deleteReq: ReturnType<typeof useDeleteMaterialRequest>;
  handleExportPersonal: (reqId: string) => void;
}) {
  return (
    <div key={req.id} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--twin-mute)] font-mono">{req.id}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${statusBadge(req.status)}`}>{statusLabel(req.status)}</span>
          <button onClick={() => handleExportPersonal(req.id)} className="text-[11px] text-blue-600 hover:underline">导出</button>
          {canDelete && <button onClick={() => { if (!window.confirm("删除此申领？")) return; deleteReq.mutate(req.id); }} className="text-[11px] text-red-500 hover:underline">删除</button>}
        </div>
      </div>
      <div>
        <span className="font-medium text-[var(--twin-ink)]">{req.applicantName || req.userId}</span>
        {req.applicantGroup && <span className="text-[var(--twin-mute)] ml-2">({req.applicantGroup})</span>}
      </div>
      <div className="space-y-1">{req.lines?.map((l: MaterialRequestLine, i: number) => (<div key={i} className="flex items-center justify-between text-sm"><span className="text-[var(--twin-body)]">{l.snapshotName} × {l.qty}</span>{l.fulfilledQty > 0 && <span className="text-xs text-green-600">已出库 {l.fulfilledQty}</span>}</div>))}</div>
      <div className="text-xs text-[var(--twin-mute)]">{req.createdAt ? formatBeijingDateTimeFull(req.createdAt) : "—"}</div>
      {(req.status === "PENDING" || req.status === "FIRST_OK") && (
        <div className="flex gap-2 pt-1 border-t border-[var(--twin-hairline)]">
          <button onClick={() => approve.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "审核失败") })} className="rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white">
            {req.status === "FIRST_OK" ? "复审通过并出库" : req.workflowType === "DUAL_REVIEW" ? "初审通过" : "通过并出库"}
          </button>
          <button onClick={() => reject.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "操作失败") })} className="rounded-twin-sm bg-red-500 px-4 py-1.5 text-sm font-medium text-white">拒绝</button>
        </div>
      )}
    </div>
  );
}
```

注意：`MaterialRequestCard` 内部使用 `statusBadge` 和 `statusLabel`，这两个函数已在文件顶部定义，无需重复。

- [ ] **Step 5: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MaterialReviewPage.tsx
git commit -m "feat(MaterialReview): merge material pending+finished, add reviewer filter + today/history split"
```

---

### Task 4: 重写延迟免冻结 tab —— 合并待审+历史 + 过滤 + 今天/历史分区

**Files:**
- Modify: `frontend/src/pages/MaterialReviewPage.tsx`

- [ ] **Step 1: 构建过滤后的合并延迟免冻结列表**

在 `useMemo` 区域（`materialHistory` 之后）添加：

```tsx
const filteredScanDelayPending = useMemo(
  () => scanDelayPending.filter((r) => isMyOption(r.optionId)),
  [scanDelayPending, isMyOption]
);

const filteredScanDelayHistory = useMemo(
  () => scanDelayHistory.filter(
    (r) => isMyOption(r.optionId) && !!r.reviewedBy
  ),
  [scanDelayHistory, isMyOption]
);

const allScanDelay = useMemo(
  () => [
    ...filteredScanDelayPending.map((r) => ({ ...r, _kind: "pending" as const })),
    ...filteredScanDelayHistory.map((r) => ({ ...r, _kind: "history" as const })),
  ].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  ),
  [filteredScanDelayPending, filteredScanDelayHistory]
);

const scanDelayToday = useMemo(
  () => allScanDelay.filter((r) => isToday(r.createdAt)),
  [allScanDelay]
);

const scanDelayHistory2 = useMemo(
  () => allScanDelay.filter((r) => !isToday(r.createdAt)),
  [allScanDelay]
);
```

- [ ] **Step 2: 替换 scanDelay tab 的 JSX 渲染**

找到 `tab === "scanDelay"` 的整个代码块（约第 162-291 行），替换为：

```tsx
{tab === "scanDelay" ? (
  <div className="space-y-3">
    {!scanDelayLoading && filteredScanDelayPending.length > 0 ? (
      <div
        className="rounded-twin-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="alert"
      >
        <p className="font-semibold">
          您有 {filteredScanDelayPending.length} 条延迟免冻结待审核
        </p>
        <p className="mt-1 text-xs text-amber-800/90">
          请核对姓名、课题组与历史通过次数后审批；新申请到达时页面顶部也会出现强提醒横幅。
        </p>
      </div>
    ) : null}
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setAutoApproveOpen(true)}
        className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
      >
        自动审批
      </button>
    </div>
    {scanDelayLoading && scanDelayHistoryLoading ? <DataSkeleton variant="card" rows={4} /> : null}
    {allScanDelay.length === 0 && !scanDelayLoading && !scanDelayHistoryLoading ? (
      <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无你负责审核的延迟免冻结记录</p>
    ) : (
      <div className="space-y-6">
        {scanDelayToday.length > 0 && (
          <TimeGroup label="今天" count={scanDelayToday.length}>
            {scanDelayToday.map((item) =>
              item._kind === "pending" ? (
                <ScanDelayPendingCard
                  key={`p-${item.id}`}
                  req={item}
                  highlightRequestId={highlightRequestId}
                  onReview={handleScanDelayReview}
                />
              ) : (
                <ScanDelayHistoryCard key={`h-${item.id}`} req={item} />
              )
            )}
          </TimeGroup>
        )}
        {scanDelayHistory2.length > 0 && (
          <TimeGroup label="历史" count={scanDelayHistory2.length} defaultOpen={false}>
            {scanDelayHistory2.map((item) =>
              item._kind === "pending" ? (
                <ScanDelayPendingCard
                  key={`p-${item.id}`}
                  req={item}
                  highlightRequestId={highlightRequestId}
                  onReview={handleScanDelayReview}
                />
              ) : (
                <ScanDelayHistoryCard key={`h-${item.id}`} req={item} />
              )
            )}
          </TimeGroup>
        )}
      </div>
    )}
  </div>
) : tab === "demands" ? (
```

注意：`ScanDelayPendingCard` 和 `ScanDelayHistoryCard` 在下一步定义。

- [ ] **Step 3: 提取 ScanDelayPendingCard 和 ScanDelayHistoryCard 组件**

在文件底部添加：

```tsx
function ScanDelayPendingCard({
  req,
  highlightRequestId,
  onReview,
}: {
  req: ScanDelayPendingRequest;
  highlightRequestId: string | null;
  onReview: (req: ScanDelayPendingRequest, approve: boolean) => Promise<void>;
}) {
  return (
    <div
      className={`rounded-twin-lg border bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-2 ${
        highlightRequestId && String(req.id) === highlightRequestId
          ? "border-[var(--twin-primary)] ring-2 ring-[var(--twin-primary)]/30"
          : "border-[var(--twin-hairline)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-[var(--twin-mute)]">#{req.id}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">待审核</span>
      </div>
      <p className="text-sm text-[var(--twin-ink)]">
        <span className="font-medium">{req.roomName || req.roomId}</span>
        <span className="text-[var(--twin-mute)]"> · {req.optionLabel || "延迟免冻结"}</span>
      </p>
      <p className="text-sm font-medium text-[var(--twin-ink)]">
        {req.subjectDisplayName || req.subjectUserId}
        <span className="font-normal text-[var(--twin-mute)]">
          {" "}· {req.subjectGroupName || "未标注课题组"}{" "}
          · 历史已通过 {req.approvedCount ?? 0} 次
          {(req.referenceSeq ?? 0) > 0 ? `（本次为第 ${req.referenceSeq} 次）` : ""}
        </span>
      </p>
      {req.createdAt ? (
        <p className="text-xs text-[var(--twin-mute)]">申请于 {formatBeijingDateTimeFull(req.createdAt)}</p>
      ) : null}
      <div className="flex gap-2 pt-2 border-t border-[var(--twin-hairline)]">
        <button
          type="button"
          onClick={() => void onReview(req, true)}
          className="rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white"
        >
          通过并授予免冻结
        </button>
        <button
          type="button"
          onClick={() => void onReview(req, false)}
          className="rounded-twin-sm bg-red-500 px-4 py-1.5 text-sm font-medium text-white"
        >
          拒绝
        </button>
      </div>
    </div>
  );
}

function ScanDelayHistoryCard({ req }: { req: ScanDelayHistoryRequest }) {
  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-[var(--twin-mute)]">#{req.id}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${req.status === "APPROVED" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {req.status === "APPROVED" ? "已通过" : "已拒绝"}
        </span>
      </div>
      <p className="text-sm text-[var(--twin-ink)]">
        <span className="font-medium">{req.roomName || req.roomId}</span>
        <span className="text-[var(--twin-mute)]"> · {req.optionLabel || "延迟免冻结"}</span>
      </p>
      <p className="text-sm font-medium text-[var(--twin-ink)]">
        {req.subjectDisplayName || req.subjectUserId}
        <span className="font-normal text-[var(--twin-mute)]"> · {req.subjectGroupName || "未标注课题组"}</span>
      </p>
      {req.createdAt ? (
        <p className="text-xs text-[var(--twin-mute)]">申请于 {formatBeijingDateTimeFull(req.createdAt)}</p>
      ) : null}
      {req.reviewedAt ? (
        <p className="text-xs text-[var(--twin-mute)]">
          处理于 {formatBeijingDateTimeFull(req.reviewedAt)}
          {req.reviewedBy ? <span> · 审核人 {req.reviewedBy}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 更新 SSE 刷新事件中的 queryKey 引用**

找到 SSE 事件监听中的 `invalidateQueries`（约第 111-116 行），确认 `["scan-delay", "history"]` 仍然存在（无需改动，只是确认）：

```tsx
// 这段保持不变，确认即可
if (tab === "scanDelay") {
  void qc.invalidateQueries({ queryKey: ["scan-delay", "history"] });
}
```

- [ ] **Step 5: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MaterialReviewPage.tsx
git commit -m "feat(MaterialReview): rewrite scanDelay tab with merged list, reviewer filter, today/history split"
```

---

### Task 5: 清理 + 最终验证

**Files:**
- Modify: `frontend/src/pages/MaterialReviewPage.tsx`

- [ ] **Step 1: 删除不再使用的变量和逻辑**

删除旧的 `list` 变量：
```tsx
// 删除这行
const list = tab === "pending" ? (pendingData ?? []) : tab === "all" ? (finishedData?.data ?? []) : [];
```

删除旧的 `tab === "pending"` 分支中的"自动审批"按钮（已移到各自 tab 内）。

- [ ] **Step 2: 确认 UI 设计规范合规**

Run:
```bash
cd frontend && grep -n 'bg-\[#' src/pages/MaterialReviewPage.tsx
```
Expected: 无结果（不应有硬编码颜色）

Run:
```bash
cd frontend && grep -n 'z-\[[0-9]' src/pages/MaterialReviewPage.tsx
```
Expected: 无结果（不应有裸 z-index）

- [ ] **Step 3: 完整 TypeScript 编译检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/MaterialReviewPage.tsx
git commit -m "chore(MaterialReview): cleanup unused variables, verify design token compliance"
```
