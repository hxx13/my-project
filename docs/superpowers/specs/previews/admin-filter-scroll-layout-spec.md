# 管理端 filter+scroll 标准布局规范

> **版本**: 2026-07-05 | **参考页面**: `AdminAssetRecordPage.tsx`, `DebugCardMappingPage.tsx`, `AdminDoorControlPage.tsx`, `AdminAssetTransferRecordPage.tsx`, `MaterialAuditExportPage.tsx`, `AdminCageEventLogPage.tsx`, `AdminSuppliesAuditExportPage.tsx`, `AdminTelemetryArchivePage.tsx`

---

## 一、目标效果

- **上方**：操作+筛选卡片（`AdminFormCard`），固定不滚动。第一行放页面 CRUD/跳转按钮（右对齐，底部有分隔线），第二行放表格筛选控件
- **下方**：表格区域，带阴影边界包裹，内部独立滚动，表头 sticky 固定，翻页始终可见
- **整体高度**：恰好填满视窗（`100dvh` 减去 AdminLayout 的 header + padding）
- **零标题**：`AdminPageShell` 不传任何 props；`AdminFormCard` 不传 `title` 和 `actions` prop

---

## 二、AdminFormCard 双行布局

操作按钮与筛选控件分属两行，以 `border-b` 分隔线区隔：

| 行 | 位置 | 内容 | 样式 |
|----|------|------|------|
| 第一行 | 分隔线**上方** | 左侧页面入口名称，右侧 CRUD/跳转按钮 | `justify-between`，左右分布 |
| 第二行 | 分隔线**下方** | 表格筛选控件（搜索框、tab 切换、下拉过滤等） | `items-end` |

分隔线：`border-b border-[var(--app-color-border-default)] pb-3 mb-3` 加在第一行容器上。

---

## 三、表头配色规范

sticky 表头必须使用以下令牌，确保滚动时表头在视觉上区隔于数据行：

| 元素 | 令牌 | 说明 |
|------|------|------|
| `<thead>` | `border-b-2 border-[var(--app-color-border-strong)]` | 表头与表体之间的粗分隔线 |
| `<tr>` | `bg-[var(--app-color-surface-hover)]` | 表头底色，略深于数据行 |
| `<tr>` | `text-[var(--app-color-text-secondary)]` | 表头文字色 |
| `<tr>` | `font-bold` | 表头加粗 |
| `<tr>` | `shadow-[var(--app-elevation-card)]` | 滚动时产生阴影，与下方内容形成层次 |
| `<tr>` | `sticky top-0 z-[2]` | 粘性定位（z=[2] 高于表体 z=0，低于弹窗/dropdown） |

完整写法：
```html
<thead className="border-b-2 border-[var(--app-color-border-strong)]">
<tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
```

> **th/td padding 一致性**：`<th>` 与 `<td>` 必须使用相同的 padding（推荐 `p-3`）。padding 不一致会导致表头与内容列错位。固定宽列（`w-16`、`w-20`）在 `<th>` 上声明即可，`<td>` 会自动跟随。

---

## 四、标准 JSX 模板

```tsx
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";

// 组件内 — 与浏览器标签页标题、侧边栏同源（REGISTRY → PATH_TITLE_MAP → SECONDARY_ROUTE_TITLE）：
const location = useLocation();
const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

return (
  <AdminPageShell>
    {/* hidden inputs 等零高度元素放这里 */}

    <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">

      {/* ═══ 第一层：操作+筛选卡片（shrink-0，始终可见） ═══ */}
      <AdminFormCard className="shrink-0 mb-3">

        {/* 第一行：入口名称（左，来自 nav registry 动态解析） + 操作按钮（右），下方有分隔线 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
          <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton ...>新建</AdminButton>
            <AdminButton ...>导出</AdminButton>
            <DropdownMenu>更多操作</DropdownMenu>
          </div>
        </div>

        {/* 第二行：表格筛选控件 */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-40 shrink-0 flex-col gap-1">...</label>
        </div>
      </AdminFormCard>

      {/* ═══ 第二层：表格 + 翻页（flex-1，填满剩余空间） ═══ */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">

        {/* 表格滚动区 */}
        <div className="flex-1 min-h-0 overflow-auto">
          {isLoading ? (
            /* 加载态 */
            <div className="flex min-h-[200px] items-center justify-center ...">加载中…</div>
          ) : rows.length === 0 ? (
            /* 空态 */
            <div className="flex min-h-[160px] items-center justify-center ...">暂无数据</div>
          ) : (
            /* 表格本体 — 注意：此 div 不能有 overflow-x-auto！ */
            <div>
              <table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse">
                <thead className="border-b-2 border-[var(--app-color-border-strong)]">
                  <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                    <th>列1</th>
                    <th>列2</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => <tr>...</tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 翻页（shrink-0，始终可见） */}
        <div className="shrink-0 flex items-center justify-end gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm">
          <AdminButton ...>上一页</AdminButton>
          <span>第 {page} / {totalPages} 页，共 {total} 条</span>
          <AdminButton ...>下一页</AdminButton>
        </div>

      </div>{/* 表格阴影容器结束 */}
    </div>{/* 外层 max-h 容器结束 */}

    {/* Portal 弹窗等放在最外层，不参与 flex 布局 */}
  </AdminPageShell>
);
```

---

## 五、关键 CSS 变量

| 变量 | 定义位置 | 值 | 说明 |
|------|---------|-----|------|
| `--admin-chrome-offset` | `.admin-page-content` | `calc(64px + var(--page-pad-y) * 2)` | 视口顶部到页面内容起点的偏移 |
| `--page-pad-y` | `.admin-page-content` | `1.5rem` (mobile) / `2rem` (sm+) | 页面垂直内边距 |

**外层 max-h 计算公式**：
```
max-h = 100dvh - var(--admin-chrome-offset)
      = 100dvh - (64px header + page-pad-y × 2)
```

---

## 六、踩坑记录（必读）

### 坑 1：sticky 表头不生效

**现象**：`<thead><tr className="sticky top-0">` 不固定，跟随内容滚动。

**根因**：表格包裹 div 有 `overflow-x-auto`。CSS 规范规定 sticky 定位相对于**最近的可滚动祖先**。`overflow-x-auto` 创建了一个横向滚动容器，截胡了 sticky 锚定目标。因为该容器不滚 Y，sticky 失去效果。

**修复**：
- ✅ 表格 `<div>` **不能**有 `overflow-x-auto`、`overflow-y-auto`、`overflow-hidden`
- ✅ 滚动由**上层** `overflow-auto` 统一处理 X/Y 双方向
- ✅ 表格用 `w-full min-w-max whitespace-nowrap` 保证宽表可横向滚动且列对齐

### 坑 2：AdminTableShell 自带 overflow-x-auto

**现象**：换用 `AdminTableShell` 组件后表头又不固定了。

**根因**：`AdminTableShell` 内部渲染 `<div className="overflow-x-auto ...">`。

**修复**：
- ✅ 不用 `AdminTableShell`，直接手写 `<div>` + `<table>`
- ✅ 或者传 `className="!overflow-x-visible"` 覆盖（不推荐，cn/tailwind-merge 可能不认 `!` 前缀）
- ✅ 加载态/空态也手写（就是两个居中的 div，不复杂）

### 坑 3：外层和表格尺寸不匹配（重叠/留白过多）

**现象**：筛选卡和表格重叠，或者底部大段空白。

**根因**：外层 `flex flex-col` + `max-h` 链条断裂。常见断裂点：
- 中间某层用了固定 `h-[XXpx]` 而不是 `flex-1`
- 外层漏了 `min-h-0`（flex 子项默认 `min-height: auto`，内容多时会撑破容器）
- 多个 `overflow-y-auto` 嵌套（双滚动条）

**修复**：
- ✅ 整个高度链条上的每个 flex 子项都要 `min-h-0`
- ✅ 只有**一个** `overflow-auto`（最内层滚动区）
- ✅ 不要用 `AdminFillScrollRegion`（它为旧 fillHeight 模式设计，与 max-h 冲突）

### 坑 4：翻页被滚动吞掉

**现象**：翻页在滚动区内，滚下去就看不见。

**修复**：
- ✅ 翻页 `<div className="shrink-0">` 放在滚动区**外面**（同级，不是子级）
- ✅ 用 `flex-1 min-h-0 flex flex-col` 包裹「滚动区 + 翻页」

### 坑 5：AdminPageShell 残留 title prop

**现象**：明明删了 h3，页面顶部还有标题和多余空白。

**根因**：`<AdminPageShell title="XX" description="XX" actions={XX}>` 还有残余 props。

**修复**：
- ✅ `<AdminPageShell>` 不传任何 prop
- ✅ `hasHeader` 为 false → header 完全不渲染 → 零空白

### 坑 6：删除 props 时留下语法碎片

**现象**：Agent 删 `title={<>...<Button/></>}` 时只删了前半，留下 `</Button></>}>`。

**修复**：
- ✅ 删多行 props 时必须连 `</>` `}` `>` 一起删干净
- ✅ 改完跑 `npx tsc --noEmit`

### 坑 7：AdminFormCard 不传 title 仍有标题占位空白

**现象**：`<AdminFormCard className="...">` 不传任何 prop，卡片顶部仍有一条 `border-b pb-2 mb-3` 的空白 header 区域。

**根因**：`AdminFormCard` 原先 `title` 为必填 prop，即使不传 header 也强制渲染（React 不报错时 DOM 仍有空节点）。

**修复**：
- ✅ `AdminFormCard` 的 `title` 已在框架层改为可选，`hasHeader` 为 false 时完全不渲染 header
- ✅ 设计规范页统一不传 `title`、`actions` prop，两行内容直接作为 children

### 坑 8：表头与内容列错位

**现象**：`<th>` 列与下方 `<td>` 列不对齐，表头文字偏左/偏右或列宽不一致。

**根因**：`<th>` 用 `p-4` 而 `<td>` 用 `p-3`，padding 差异导致列宽计算不一致。

**修复**：
- ✅ `<th>` 与 `<td>` 使用相同 padding（统一 `p-3`）
- ✅ 表格 class 用 `w-full min-w-max whitespace-nowrap`（先填满容器再允许溢出，非 `w-max min-w-full`）
- ✅ 固定宽列（`w-16`、`w-20`）只在 `<th>` 声明，`<td>` 自动跟随

---

## 七、改造检查清单

改造任意页面时，逐项确认：

- [ ] `AdminPageShell` 无 `title` / `description` / `actions` / `fillHeight` prop
- [ ] 无 `<h1>` / `<h2>` / `<h3>` 页面级标题
- [ ] 操作+筛选区用 `AdminFormCard className="shrink-0 mb-3"`（无 `title`，无 `actions` prop）
- [ ] 第一行 `justify-between` + `border-b pb-3 mb-3`：左侧 `<h2>` 页面入口名称，右侧 CRUD/跳转按钮；第二行放表格筛选控件
- [ ] 外层 `flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]`
- [ ] 表格区用 `rounded-xl border shadow-sm overflow-hidden` 包住
- [ ] 滚动容器 `flex-1 min-h-0 overflow-auto`（唯一滚动）
- [ ] 表格包裹 `<div>` 无 overflow 属性
- [ ] `<thead className="border-b-2 border-[var(--app-color-border-strong)]">` + `<tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">`
- [ ] 翻页 `shrink-0` 在滚动区外
- [ ] 弹窗/Portal 放在外层 `</div>` 之后
- [ ] `npx tsc --noEmit` 通过
---

## 八、AdminPageTabs + Tab 内容变体

当页面使用 `AdminPageTabs`（file-folder 风格标签栏），各 tab 内容按需为 form card 或表格。与标准模板**完全相同的高度链**。

参考页面：`AdminStudentViolationsPage.tsx`。

### 8.1 核心模式

```
div.flex.flex-col.h-[calc(100dvh-var(--admin-chrome-offset))]
  ├─ AdminFormCard.shrink-0                    ← 顶部卡片
  │   ├─ Row 1: AdminPageTabs [+ 操作按钮]     ← 标签栏（上）
  │   └─ Row 2: 子菜单按钮（条件渲染）           ← tab 专属切换（下）
  └─ div.flex-1.min-h-0.flex.flex-col           ← 下方容器
       └─ AdminTabPanel.flex-1.min-h-0.flex.flex-col
            └─ TabContent                        ← 单列或双列
```

**关键变化**（对比标准 filter+scroll）：
- 无 `<h2>` 页面标题——标签栏本身就是导航标识
- `AdminPageTabs` 放在 Row 1，取代标题
- Row 2 可放 tab 专属子菜单（仅该 tab active 时显示）
- 下方容器通过 `AdminTabPanel` 路由到不同内容组件

### 8.2 顶部卡片模板

```tsx
<AdminFormCard className="sticky top-0 z-[--z-sticky] shrink-0 mb-3">
  {/* Row 1: 标签栏 */}
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
    <AdminPageTabs
      tabs={PAGE_TABS}
      value={activeTab}
      onChange={(id) => { setActiveTab(id); /* reset sub-panel */ }}
    />
    {/* 可选：操作按钮（如刷新，用 invisible 占位保持高度） */}
  </div>
  {/* Row 2: 子菜单（条件渲染） */}
  {activeTab === "some-tab" && (
    <div className="flex items-center gap-2">
      {SUB_PANELS.map(p => (
        <button
          key={p.id}
          onClick={() => setSubPanel(p.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            subPanel === p.id
              ? "bg-[var(--app-color-accent)] text-white"
              : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )}
</AdminFormCard>
```

### 8.3 下方容器：单列

```tsx
<div className="flex-1 min-h-0 flex flex-col">
  <AdminTabPanel ... className="flex-1 min-h-0 flex flex-col">
    <SomeTabContent />   {/* 内部 flex-1 min-h-0 + overflow-y-auto */}
  </AdminTabPanel>
</div>
```

### 8.4 下方容器：双列

tab 内容组件内部用 grid 左右分栏：

```tsx
// TabContent 组件内
<div className="flex-1 min-h-0 grid grid-cols-2 gap-4">
  <AdminFormCard className="overflow-y-auto">{/* 左 */}</AdminFormCard>
  <AdminFormCard className="overflow-y-auto">{/* 右 */}</AdminFormCard>
</div>
```

### 8.5 子面板切换（tab 内多视图）

当单个 tab 内还需切换不同视图（如 announcement tab 的「新建/配置/列表」），状态由父页面管理、通过 props 传入：

```tsx
// 父页面
const [subPanel, setSubPanel] = useState<"create" | "settings" | "list">("create");

// 切换 tab 时重置子面板
onChange={(id) => { setActiveTab(id); setSubPanel("create"); }}

// 传入内容组件
<SomeTabContent subPanel={subPanel} onSubPanelChange={setSubPanel} />

// 内容组件内 — 条件渲染，每个面板单独 overflow-y-auto
{subPanel === "create"  && <AdminFormCard className="flex-1 min-h-0 overflow-y-auto">...</AdminFormCard>}
{subPanel === "settings" && <AdminFormCard className="flex-1 min-h-0 overflow-y-auto">...</AdminFormCard>}
{subPanel === "list"    && <AdminFormCard className="flex-1 min-h-0 overflow-y-auto">...</AdminFormCard>}
```

### 8.6 踩坑

- **坑 T1**：不要用 `calc()` 猜偏移量。父级 `h-[calc(100dvh-var(--admin-chrome-offset))]` 定边界，子级全部 `flex-1 min-h-0` 自然填满。
- **坑 T2**：高度链每层都必须 `flex-1 min-h-0`——外层 div → AdminTabPanel → TabContent → 内部 grid/card。任何一处断裂高度就传不下去。
- **坑 T3**：`AdminPageTabs`（underline 风格）和 inline pill 标签（`bg-[var(--twin-canvas-soft-2)]` track）是两种不同设计语言，不要在同一行混用。Pill 标签用于 tab 内子视图切换（Row 2 子菜单）。
- **坑 T4**：双列时每个 card 加 `overflow-y-auto`，高度由 grid 自动分配，**不要设 `max-h`**。
- **坑 T5**：子面板切换只是同一个 tab 内的视图切换，不要和 URL tab 参数混淆。子面板用 `useState` 管理即可。
- **坑 T6**：顶部卡片 Row 2 的子菜单按钮使用 `--app-color-accent` 激活态（与 `AdminPageTabs` 的 primary 色一致），不要用 `twin-*` 令牌。
- **坑 T7**（2026-07-08 实录）：**永远从外往内套模板，不要从内往外修。** `CageLinkageTab` 重构时，AI 在组件内部反复尝试 `h-[calc()]`、`fillHeight`、`flex-1 min-h-0` 各种组合试图让卡片填满视口——连续失败数轮。根因：Section 四的标准模板早已定义了外层 `max-h` → `overflow-hidden` 壳 → `overflow-auto` 的层级，组件只需作为内容放入 `overflow-auto` 区域内即可。组件内部不需要任何视口高度计算。教训：**先读文档、先套外壳、再填内容。** 不要从组件内部反向推算页面级布局。

---

## 九、监控面板独立卡片列表变体

当标签内容为卡片网格（健康卡片、资源指标）而非表格时，卡片区直接使用无边框的 `<section>` + Grid 布局，不包在 `AdminTableShell` 里。

```tsx
<section>
  <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">系统健康</h3>
  <div className="grid gap-[var(--app-space-element-gap)]"
       style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
    {items.map(item => <HealthCard key={item.label} item={item} />)}
  </div>
</section>
```

关键：卡片不套 `AdminFormCard`（双重嵌套卡片是 Impeccable 绝对禁止项）。
