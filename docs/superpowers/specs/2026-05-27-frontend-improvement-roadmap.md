# Twin System 前端全面改进路线图

> **创建日期**：2026-05-27
> **状态**：阶段 A 进行中
> **参考标准**：Vercel DESIGN.md + Linear DESIGN.md (awesome-design-md) + React Best Practices (70 rules) + Composition Patterns (10 rules)

---

## 总览

本次改进覆盖前端 76 个页面、33 个 API domain 文件、1 个 Zustand store，按 6 个阶段分步执行。

| 阶段 | 目标 | 改动量 | 状态 |
|------|------|--------|------|
| A | 设计系统 + 主题重构 + 通用状态组件 | 新建 8-10 文件 | ⏳ 进行中 |
| B | TanStack Query 全面迁移 | 新建 30+ hook，改造 50+ 页面 | ⏳ 待执行 |
| C | 代码分割 + 懒加载 | 修改 router，~15 个页面拆分 | ⏳ 待执行 |
| D | 内联组件提取 + 架构清理 | 提取 25+ 组件 | ⏳ 待执行 |
| E | localStorage 抽象封装 | 新建 5-8 storage 模块 | ⏳ 待执行 |
| F | React 19 现代化 + 杂项修复 | 批量小改动 | ⏳ 待执行 |

---

## 设计决策记录（跨对话一致性保障）

### 色彩体系（遵循 Vercel DESIGN.md 语义）

| Token | 亮色值 | 用途 |
|-------|--------|------|
| `--twin-ink` | `#171717` | 主文字色（替代 neutral-900） |
| `--twin-body` | `#4d4d4d` | 次要文字（替代 neutral-600） |
| `--twin-mute` | `#888888` | 最低优先级文字/placeholder |
| `--twin-canvas` | `#ffffff` | 卡片/弹窗/模态框表面 |
| `--twin-canvas-soft` | `#fafafa` | 页面默认背景 |
| `--twin-canvas-soft-2` | `#f5f5f5` | 内嵌区（如表格偶数行背景） |
| `--twin-hairline` | `#ebebeb` | 1px 分隔线/卡片边框 |
| `--twin-hairline-strong` | `#a1a1a1` | 强调分隔线 |
| `--twin-link` | `#0070f3` | 链接色 |
| `--twin-link-deep` | `#0761d1` | 链接按下态 |
| `--twin-primary` | `#171717` | 主 CTA 按钮 |
| `--twin-on-primary` | `#ffffff` | 主按钮文字 |
| `--twin-error` | `#ee0000` | 错误/危险操作 |
| `--twin-error-soft` | `#f7d4d6` | 错误背景 |
| `--twin-warning` | `#f5a623` | 警告 |
| `--twin-warning-soft` | `#ffefcf` | 警告背景 |
| `--twin-success` | `#0070f3` | 成功（Vercel 语义，用 link 色做 success） |

### Elevation（阴影层级）

| Level | 用途 | 实现 |
|-------|------|------|
| Level 0 — Flat | 全宽区域（hero、footer） | 无阴影无边框 |
| Level 1 — Inset | 默认卡片 | `0 0 0 1px rgba(0,0,0,0.08)` inset |
| Level 2 — Subtle | 轻度提升卡片 | `0 1px 1px rgba(0,0,0,0.02), 0 2px 2px rgba(0,0,0,0.04)` + inset |
| Level 3 — Soft | 功能网格卡片 | `0 2px 2px rgba(0,0,0,0.04), 0 8px 8px -8px rgba(0,0,0,0.04)` + inset |
| Level 4 — Float | 定价卡/高亮面板 | `0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.04)` + inset |
| Level 5 — Modal | 对话框/下拉 | `0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04), 0 24px 32px -8px rgba(0,0,0,0.06)` + inset |

### 圆角尺度

| Token | 值 | 使用场景 |
|-------|-----|---------|
| `--twin-radius-xs` | 4px | chips、badges |
| `--twin-radius-sm` | 6px | 表单输入框、nav 按钮 |
| `--twin-radius-md` | 8px | 卡片、标准按钮 |
| `--twin-radius-lg` | 12px | 大卡片、feature card |
| `--twin-radius-xl` | 16px | hero 图片容器 |
| `--twin-radius-pill` | 100px | marketing CTA（仅登录页用） |
| `--twin-radius-full` | 9999px | 头像、圆形 icon 按钮 |

### 间距尺度（4px 基准，对齐 Tailwind）

与 Tailwind 默认 spacing 完全一致：`1 = 4px`，使用 Tailwind 预设值（`p-4` = 16px、`gap-6` = 24px）。严禁手写 px 值（动态运行时值除外）。

### 字体

- 正文字体：`Figtree Variable`（已引入）— 对齐 Vercel Geist 的几何无衬线风格
- 等宽字体：`ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace`（系统默认）— 对齐 Vercel Geist Mono
- display 字重上限：600（不在正文使用 700+），对齐 Linear + Vercel 规则

### 组件 API 约定

- 使用 `export default function` 命名函数组件（非箭头函数），对齐现有架构文档规则
- 禁止 boolean prop 泛滥：超过 3 个 boolean props 时改用 compound components
- 文件级类型与组件同文件，不拆到 `types/`
- 路径别名统一 `@/`，不写 `../../../`

### 状态管理铁律

- 服务端数据 → TanStack Query（useQuery / useMutation）
- UI 交互态 → Zustand store
- 禁止在组件中直接读写 localStorage（必须通过 `lib/storage.ts` 封装）
- 禁止 useEffect + setState 做派生状态

---

## 阶段 A：设计系统 + 主题重构 + 通用状态组件

### A-1: Tailwind 配置扩展 ✅ / ⬜

**文件**：[frontend/tailwind.config.js](frontend/tailwind.config.js)

**改动**：在 `theme.extend` 中注入项目级 tokens，利用现有 `hsl(var(--xxx))` 机制：

```javascript
// 关键扩展项
theme: {
  extend: {
    // 现有 colors 保留，新增：
    boxShadow: {
      'twin-level-1': '0 0 0 1px rgba(0,0,0,0.08) inset',
      'twin-level-2': '0 1px 1px rgba(0,0,0,0.02), 0 2px 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
      'twin-level-3': '0 2px 2px rgba(0,0,0,0.04), 0 8px 8px -8px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
      'twin-level-4': '0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
      'twin-level-5': '0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04), 0 24px 32px -8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.08)',
    },
    borderRadius: {
      // 扩展现有 lg/md/sm
      'twin-xs': '4px',
      'twin-sm': '6px',
      'twin-md': '8px',
      'twin-lg': '12px',
      'twin-xl': '16px',
      'twin-pill': '100px',
      'twin-full': '9999px',
    },
  }
}
```

### A-2: CSS 变量主题体系 ✅ / ⬜

**文件**：[frontend/src/index.css](frontend/src/index.css)

**改动**：在 `:root` 中补充 `--twin-*` 变量，同时保留现有 shadcn 变量不动。

```css
:root {
  /* === 现有 shadcn 变量保留不变 === */

  /* === Twin Design Tokens (Vercel-inspired) === */
  --twin-ink: #171717;
  --twin-body: #4d4d4d;
  --twin-mute: #888888;
  --twin-canvas: #ffffff;
  --twin-canvas-soft: #fafafa;
  --twin-canvas-soft-2: #f5f5f5;
  --twin-hairline: #ebebeb;
  --twin-hairline-strong: #a1a1a1;
  --twin-link: #0070f3;
  --twin-link-deep: #0761d1;
  --twin-primary: #171717;
  --twin-on-primary: #ffffff;
  --twin-error: #ee0000;
  --twin-error-soft: #f7d4d6;
  --twin-warning: #f5a623;
  --twin-warning-soft: #ffefcf;
  --twin-success: #0070f3;

  /* Elevation */
  --twin-shadow-level-1: 0 0 0 1px rgba(0,0,0,0.08) inset;
  --twin-shadow-level-2: 0 1px 1px rgba(0,0,0,0.02), 0 2px 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08);
  --twin-shadow-level-3: 0 2px 2px rgba(0,0,0,0.04), 0 8px 8px -8px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08);
  --twin-shadow-level-4: 0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08);
  --twin-shadow-level-5: 0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04), 0 24px 32px -8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.08);

  /* 页面背景色：用 canvas-soft 替代 bg-neutral-100 */
  --twin-page-bg: #fafafa;
}

.dark {
  /* === 暗色主题预留 === */
  --twin-ink: #f7f8f8;
  --twin-body: #d0d6e0;
  --twin-mute: #8a8f98;
  --twin-canvas: #0f1011;
  --twin-canvas-soft: #010102;
  --twin-canvas-soft-2: #141516;
  --twin-hairline: #23252a;
  --twin-hairline-strong: #34343a;
  /* ... 其余保持反色逻辑 */
}
```

### A-3: 通用状态组件 ✅ / ⬜

创建 3 个组件，遵循 shadcn/ui 风格。

**DataSkeleton** — [frontend/src/components/ui/DataSkeleton.tsx](frontend/src/components/ui/DataSkeleton.tsx)

```typescript
// 三种变体：table | card | form
// table: N 行白色骨架行，模拟 AdminDataTableWrap 结构
// card: 网格排列的卡片骨架
// form: 表单输入项骨架
// Props: variant: 'table' | 'card' | 'form', rows?: number, cols?: number
```

**EmptyState** — [frontend/src/components/ui/EmptyState.tsx](frontend/src/components/ui/EmptyState.tsx)

```typescript
// Props: icon?, title, description?, action?: { label, onClick }
// 参考 Vercel ex-empty-state-card: canvas-soft 背景, rounded-lg, 3xl padding
// 使用 Lucide React 图标
```

**ErrorRetry** — [frontend/src/components/ui/ErrorRetry.tsx](frontend/src/components/ui/ErrorRetry.tsx)

```typescript
// Props: message?, onRetry?, details?
// 显示错误信息 + "重试"按钮 + 可折叠的技术详情
```

### A-4: AdminLayout 布局优化 ✅ / ⬜

**文件**：[frontend/src/layouts/AdminLayout.tsx](frontend/src/layouts/AdminLayout.tsx)

**改动项**：

1. 页面背景从 `bg-neutral-100` → `bg-[var(--twin-canvas-soft)]`，文字从 `text-neutral-800` → `text-[var(--twin-ink)]`
2. Header 背景使用 `bg-[var(--twin-canvas)]` + `shadow-twin-level-2`
3. Main 区域渐变背景替换为纯 `bg-[var(--twin-canvas-soft)]`（Vercel 风格不在内容区使用大气渐变）
4. 侧栏 dark 风格保留（Linear 式 dark sidebar），但色彩 token 用 `--twin-*` 暗色版本
5. 退出登录确认弹窗内按钮统一为 shadcn button 组件
6. SIDEBAR_COLLAPSED_KEY 读写改为 `@/lib/storage` 封装（阶段 E 统一处理）

---

## 阶段 B：TanStack Query 全面迁移

### B-1: Query Key Factory ✅ / ⬜

**新建文件**：[frontend/src/api/hooks/queryKeys.ts](frontend/src/api/hooks/queryKeys.ts)

```typescript
// 集中管理所有 query key，按业务域分组
export const queryKeys = {
  profile: {
    all: ['profile'] as const,
    detail: () => [...queryKeys.profile.all, 'detail'] as const,
  },
  repair: {
    all: ['repair'] as const,
    list: (page: number, size: number, keyword?: string) =>
      [...queryKeys.repair.all, 'list', page, size, keyword ?? ''] as const,
    detail: (id: string) => [...queryKeys.repair.all, 'detail', id] as const,
  },
  purchase: {
    all: ['purchase'] as const,
    list: (page: number, size: number, keyword?: string) =>
      [...queryKeys.purchase.all, 'list', page, size, keyword ?? ''] as const,
  },
  // ... 其余业务域按此模式
};
```

### B-2: 统一 TanStack Query 配置 ✅ / ⬜

**新建文件**：[frontend/src/api/hooks/queryClient.ts](frontend/src/api/hooks/queryClient.ts)

```typescript
// 全局默认值
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5min
      gcTime: 30 * 60 * 1000,      // 30min
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

### B-3: 按业务域创建 Query/Mutation Hooks ✅ / ⬜

每个域创建 `api/hooks/useXxx.ts`，格式如下：

```typescript
// api/hooks/useRepair.ts
export function useRepairList(page: number, size: number, keyword = '') {
  return useQuery({
    queryKey: queryKeys.repair.list(page, size, keyword),
    queryFn: () => fetchRepairList(page, size, keyword),
    placeholderData: keepPreviousData, // 翻页时保留旧数据
  });
}

export function useRepairDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.repair.detail(id),
    queryFn: () => fetchRepairDetail(id),
    enabled: !!id,
  });
}

export function useCreateRepair() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRepair,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success('创建成功');
    },
  });
}

export function useDeleteRepair() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRepair,
    onMutate: async (id) => {
      // 乐观更新：先取消正在进行的列表查询
      await queryClient.cancelQueries({ queryKey: queryKeys.repair.all });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success('删除成功');
    },
    onError: () => {
      toast.error('删除失败');
    },
  });
}
```

**需要创建的 Hook 文件清单**（按影响面排序）：

| 文件 | 对应的 API domain | 包含 Query/Mutation |
|------|-------------------|---------------------|
| `useRepair.ts` | repair.api.ts | list, detail, create, update, delete, submitProcess |
| `usePurchase.ts` | purchase.api.ts | list, detail, create, update, delete |
| `usePersonnel.ts` | (admin/personnel APIs) | list, detail, create, update, batchImport |
| `useSupplies.ts` | supplies.api.ts | list, create, update, delete |
| `useCageShelf.ts` | cageShelf.api.ts | list, loadOptions, update |
| `useAccessRules.ts` | accessFusion.api.ts | list, create, update, toggle |
| `useDahuaSwing.ts` | dahuaSwing.api.ts | list, create, update, toggle |
| `useAsset.ts` | asset.api.ts | list, detail, create, transfer |
| `useContentHub.ts` | (content hub APIs) | list, create, update, publish |
| `useTelemetry.ts` | telemetryArchive.api.ts | rolling series, history |
| `useNotification.ts` | notification.api.ts | list, markRead, markAllRead |
| `useScanner.ts` | (已有，需增强) | 补充 gcTime, retry 配置 |
| `useProfile.ts` | (已有) | 补充 gcTime, retry 配置 |

### B-4: 逐模块页面改造 ✅ / ⬜

**改造模板**（每个页面统一遵循）：

```typescript
// 改造前（反模式）
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);
const loadData = async () => {
  setLoading(true);
  try { const res = await fetchXxxList(page, size); setData(res.data); }
  catch { toast.error('加载失败'); }
  finally { setLoading(false); }
};
useEffect(() => { void loadData(); }, [page, size]);

// 改造后
const { data, isLoading, isError, error, refetch } = useXxxList(page, size);
if (isLoading) return <DataSkeleton variant="table" />;
if (isError) return <ErrorRetry message={error.message} onRetry={refetch} />;
```

**改造页面清单**（按优先级分组）：

**第1批 — 高频 CRUD 页面** (10 pages):
- [ ] AdminPersonnelPage.tsx
- [ ] AdminSuppliesMallPage.tsx
- [ ] AdminCageShelfPage.tsx
- [ ] AdminAccessRulesPage.tsx
- [ ] AdminDahuaSwingRulesPage.tsx
- [ ] AdminDahuaSwingTasksPage.tsx
- [ ] AdminDeviceChannelPage.tsx
- [ ] AdminAssetRecordPage.tsx
- [ ] AdminContentHubPage.tsx
- [ ] AdminHomePage.tsx

**第2批 — 流程页面** (6 pages):
- [ ] RepairRequestPage.tsx
- [ ] RepairProcessPage.tsx
- [ ] PurchaseRequestPage.tsx
- [ ] PurchaseProcessPage.tsx（如存在）
- [ ] ProfileSecurityPage.tsx
- [ ] StaffMessagesPage.tsx

**第3批 — 只读/看板页面** (8 pages):
- [ ] DashboardPage.tsx（已有 useQuery，增强 error/loading state）
- [ ] AdminAnalyticsPage.tsx
- [ ] AdminTelemetryArchivePage.tsx
- [ ] AdminTelemetryWatchlistsPage.tsx
- [ ] AdminDoorControlPage.tsx（已有 useQuery，增强）
- [ ] AnimalRoomTelemetryPage.tsx
- [ ] AnimalRoomCockpitPage.tsx
- [ ] LoginPage.tsx（branding fetch → useQuery）

---

## 阶段 C：代码分割 + 懒加载

### C-1: Router 懒加载改造 ✅ / ⬜

**文件**：[frontend/src/router/index.tsx](frontend/src/router/index.tsx)

**改动**：将直接 import 改为 `React.lazy` + `Suspense`。

```typescript
// 改造前
import DashboardPage from '@/pages/DashboardPage';

// 改造后
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));
```

**懒加载分组**（建议 chunk 划分）：

| Chunk | 包含页面 | 触发条件 |
|-------|---------|---------|
| `main` | Dashboard, Login, Register, AdminHome | 首屏 |
| `admin-crud` | Personnel, Supplies, CageShelf, AccessRules, Assets, ContentHub | 管理端导航 |
| `admin-flow` | RepairRequest, RepairProcess, PurchaseRequest, PurchaseProcess | 管理端导航 |
| `telemetry` | AnimalRoomTelemetry, AnimalRoomCockpit, TelemetryArchive, Watchlists | 遥测入口 |
| `debug` | DebugTable, DebugPersonnel, DebugPrediction, DebugHeatmap, DebugCardStatus, DebugCardMapping, DebugOrder | Debug 路由 |
| `digital-twin` | digital-twin-screen 全部页面 | 数字孪生入口 |
| `analytics` | AdminAnalytics, analytics 相关 | 分析入口 |
| `staff` | StaffMessages, Notifications | 消息入口 |

**Suspense fallback**：使用 `<DataSkeleton variant="card" rows={4} />` 作为统一 fallback。

---

## 阶段 D：内联组件提取 + 架构清理

### D-1: AnimalRoomTelemetryPage 拆分 ✅ / ⬜

**现状**：AnimalRoomTelemetryPage.tsx 内含 21 个内联函数组件。

**目标结构**：

```
features/telemetry/
├── index.ts                       ← barrel export
├── components/
│   ├── TelemetryDialogsProvider.tsx
│   ├── ValueTrendMark.tsx
│   ├── MetricTrendValueUnit.tsx
│   ├── MetricDetailFields.tsx
│   ├── MetricInfoPopover.tsx
│   ├── MetricRow.tsx
│   ├── WinccStripSwitch.tsx
│   ├── StructuredRoomCard.tsx
│   ├── LegacyRoomCard.tsx
│   ├── SuiteTitleMetricPill.tsx
│   ├── SuiteSection.tsx
│   ├── SoloBalancedPartition.tsx
│   ├── AnimalRoomTelemetryZoneCard.tsx
│   ├── HubFloorContent.tsx
│   ├── HubPackedColumn.tsx
│   ├── HubFloorDualColumnContent.tsx
│   ├── StructuredFloorChunksContent.tsx
│   ├── StructuredPackedColumn.tsx
│   ├── StructuredFloorDualColumnContent.tsx
│   └── StructuredFloorContent.tsx
└── AnimalRoomTelemetryPage.tsx     ← 仅保留页面级组装逻辑
```

### D-2: 其他页面内联组件提取 ✅ / ⬜

- [ ] `AdminCageShelfPage.tsx:90` → 提取 `ShelfGrid` 到 `features/cage-shelf/components/ShelfGrid.tsx`
- [ ] `AdminAnalyticsPage.tsx:118` → 提取 `ReportNavCard` 到 `features/analytics/components/ReportNavCard.tsx`
- [ ] `AdminRoomMappingPage.tsx:19` → 提取 `OfficialLevelEditor` 到 `features/room-mapping/components/OfficialLevelEditor.tsx`
- [ ] `AdminTelemetryWatchlistsPage.tsx:L61,280,374` → 提取 3 个内联组件到 `features/telemetry/components/`
- [ ] `AnimalRoomCockpitPage.tsx:L87,155` → 提取 2 个内联组件到 `features/cockpit/components/`

### D-3: Index-as-key 修复 ✅ / ⬜

约 20 处需要修复，逐个替换为稳定的唯一 ID（如 `item.id`、`item.name`）。

**关键修复点**：
- [ ] `AnimatedRoomButton.tsx:39,56`
- [ ] `AIPredictionCard.tsx:248`
- [ ] `CapacityStatusList.tsx:33`
- [ ] `AdminAccessRulesPage.tsx:504`
- [ ] `AdminApiDocsPage.tsx:278`
- [ ] `AdminAutomationLogsPage.tsx:244`
- [ ] `AdminDahuaSwingRulesPage.tsx:177`
- [ ] `CodexNoticeStreamPanel.tsx:36,38`

---

## 阶段 E：localStorage 抽象封装

### E-1: Storage 基类 ✅ / ⬜

**新建文件**：[frontend/src/lib/storage.ts](frontend/src/lib/storage.ts)

```typescript
// 为所有 localStorage 操作提供统一抽象
// - 自动添加项目前缀 "twin:"
// - JSON 序列化/反序列化安全包裹
// - 版本号支持（迁移逻辑入口）
// - SSR 安全（检查 typeof window）

const PREFIX = 'twin:';
const VERSION_KEY = 'twin:storage_version';

interface StorageAdapter<T> {
  get(): T | null;
  set(value: T): void;
  remove(): void;
}

export function createStorage<T>(key: string, defaultValue?: T): StorageAdapter<T> {
  const fullKey = PREFIX + key;
  return {
    get() {
      try {
        const raw = localStorage.getItem(fullKey);
        if (raw === null) return defaultValue ?? null;
        return JSON.parse(raw) as T;
      } catch { return defaultValue ?? null; }
    },
    set(value: T) {
      try { localStorage.setItem(fullKey, JSON.stringify(value)); }
      catch { /* quota exceeded */ }
    },
    remove() {
      try { localStorage.removeItem(fullKey); }
      catch { /* ignore */ }
    },
  };
}
```

### E-2: 按域创建 Storage 模块 ✅ / ⬜

- [ ] **sidebarStorage** — `sidebarCollapsed`, `sidebarOpenGroups`
- [ ] **themeStorage** — `twinChromeTheme`, `sciFiDashboard`
- [ ] **sceneLayoutStorage** — 数字孪生场景布局
- [ ] **llmPromptStorage** — LLM prompt 缓存
- [ ] **apiDocsStorage** — `try_it_token`

### E-3: 替换所有直接 localStorage 调用 ✅ / ⬜

| 原位置 | 替换为 |
|--------|--------|
| AdminLayout.tsx (SIDEBAR_COLLAPSED_KEY) | sidebarStorage.get/set |
| AdminLayout.tsx (ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY) | sessionStorage → sidebarStorage（session 变体） |
| TwinChromeThemeContext.tsx | themeStorage |
| sceneLayoutStorage.ts | 改用基类 createStorage |
| ductLayoutStorage.ts | 改用基类 createStorage |
| useProfilePopup.ts (TWIN_ENTRY_MODE) | createStorage |
| AdminApiDocsPage.tsx (try_it_token) | apiDocsStorage |
| AdminSuppliesMallPage.tsx (cart migration) | createStorage |
| llmInsightPromptStorage.ts | 改用基类 createStorage |

---

## 阶段 F：React 19 现代化 + 杂项修复

### F-1: useOptimistic 用于列表操作 ✅ / ⬜

在列表删除/状态切换场景使用 `useOptimistic`：

```typescript
// 示例：删除操作
const [optimisticList, removeOptimistic] = useOptimistic(
  data,
  (prev, id: string) => prev.filter(item => item.id !== id)
);
```

### F-2: 移除 forwardRef ✅ / ⬜

React 19 允许直接用 `ref` prop，无需 `forwardRef` 包裹。检查所有 `forwardRef` 使用并迁移。

### F-3: useActionState 用于表单 ✅ / ⬜

在登录页、报修表单、申购表单等使用 `useActionState` 替代手动 error/success state。

### F-4: use() 用于 Suspense 数据获取 ✅ / ⬜

在支持 Suspense 的 TanStack Query 调用中，使用 `use()` hook 替代数据条件渲染。

---

## 执行检查清单

### 阶段 A 完成条件
- [ ] `tailwind.config.js` 新增 boxShadow + borderRadius tokens
- [ ] `index.css` 新增 `--twin-*` CSS 变量（亮色 + 暗色）
- [ ] `DataSkeleton.tsx` 创建完成，支持 table/card/form 变体
- [ ] `EmptyState.tsx` 创建完成，含 icon + 描述 + action
- [ ] `ErrorRetry.tsx` 创建完成，含重试按钮
- [ ] AdminLayout 背景色/阴影迁移到新 token
- [ ] `npm run build` 通过（或 `tsc --noEmit` 无错误）

### 阶段 B 完成条件
- [ ] `queryKeys.ts` 覆盖所有业务域
- [ ] `queryClient.ts` 全局配置就绪
- [ ] 所有 useXxx hook 文件创建
- [ ] 所有目标页面的 useEffect+fetch 已替换
- [ ] 所有 useMutation 页面的 CRUD 操作迁移完成
- [ ] `npm run build` 通过

### 阶段 C 完成条件
- [ ] router 中 React.lazy 拆分完成
- [ ] Suspense fallback 就绪
- [ ] 首屏 bundle 体积显著减少（可用 `vite build --mode analyze` 验证）
- [ ] `npm run build` 通过

### 阶段 D 完成条件
- [ ] AnimalRoomTelemetryPage 的 21 个内联组件全部提取
- [ ] 其他页面内联组件提取完毕
- [ ] ~20 处 index-as-key 全部修复
- [ ] `npm run build` 通过

### 阶段 E 完成条件
- [ ] `lib/storage.ts` 基类创建完成
- [ ] 各域 storage 模块创建完成
- [ ] 全部 15+ 处直接 localStorage 调用替换完毕
- [ ] `npm run build` 通过

### 阶段 F 完成条件
- [ ] 至少 3 个页面使用 useOptimistic
- [ ] 所有 forwardRef 已移除
- [ ] 至少 2 个表单使用 useActionState
- [ ] `npm run build` 通过

---

## 关联文档

- [后端底层架构规范](ARCHITECTURE_BACKEND.md)
- [Web 前端参考架构](ARCHITECTURE_FRONTEND_WEB.md)
- [后端技术改造路线](IMPROVEMENT_ROADMAP.md)
- 外部参考：`awesome-design-md-main/design-md/vercel/DESIGN.md`
- 外部参考：`awesome-design-md-main/design-md/linear.app/DESIGN.md`
- 技能参考：React Best Practices (70 rules)
- 技能参考：Composition Patterns (10 rules)
- 技能参考：Web Design Guidelines
