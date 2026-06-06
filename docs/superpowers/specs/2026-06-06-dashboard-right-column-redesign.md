# 仪表盘右侧栏改造设计文档

**日期:** 2026-06-06  
**范围:** DashboardPage 右侧 25% 栏  
**分支:** refactor/twin-package-split

---

## 1. 目标

将 DashboardPage 右侧栏从两个独立排行榜组件改造为三块联动面板：

| 位置 | 当前 | 改造后 |
|---|---|---|
| 右上 | MonthlyRankCarousel（进出活跃度） | **UnifiedRankingCard**（进出活跃度 + 动物消耗，统一格式，Top20，自动滚动） |
| 右上 | AnimalOrderRankingCard（动物消耗） | 合并到 UnifiedRankingCard 的 Tab 内 |
| 右下上半 | 不存在 | **DashboardHeatmapChart**（克隆自 ActivityHeatmapChart，7:00–20:00，独立改造） |
| 右下下半 | 不存在 | **RoomPreferenceChart**（ECharts 横向柱状图，TOP5 房间偏好） |

---

## 2. 右上：UnifiedRankingCard

### 2.1 数据来源

| 数据 | API | 刷新 |
|---|---|---|
| 进出活跃度排名 | `GET /api/v1/twin/dashboard/ranking?timeType=MONTH&region=TOTAL\|PUDONG\|PUXI` | 每 5 分钟 |
| 动物消耗排名 | `GET /api/v1/twin/dashboard/animal-order-ranking?region=TOTAL\|PUDONG\|PUXI` | 每 30 分钟 |
| 排名变化（↑↓→） | 后端已有字段或前端客户端对比上一轮快照 | 随 API 刷新 |

### 2.2 UI 规格

- **Tab 切换**：`进出活跃` | `动物消耗`，8 秒自动轮播，点击手动切换后 8 秒恢复
- **园区筛选**：`全部` | `浦东` | `浦西` 胶囊按钮
- **排名数量**：统一 Top 20
- **前三展示**：领奖台 podium 形式，缩小版（金 28px / 银 20px / 铜 16px 柱高），辉光呼吸动画
- **动物消耗特殊规则**：不采用领奖台形式（涉及金钱），全部用扁平排行条
- **4-20 名**：统一排行条格式 — `排名 | 名称 | 流光进度条 | 数值 | ↑↓→箭头`
  - 箭头位置：数值之后（末尾）
  - 箭头样式：加粗 900 weight，9px，↑ 绿色、↓ 红色、→ 灰色，弹跳动画
  - 进度条：按比例自适应宽度（flex），流光扫过动画
- **自动滚动**：列表容器 `overflow-y:auto` + 自动 scroll 引擎（GSAP）

### 2.3 组件文件

```
frontend/src/features/dashboard/UnifiedRankingCard.tsx  （新建）
```

**删除文件：**
```
frontend/src/features/dashboard/MonthlyRankCarousel.tsx
frontend/src/features/dashboard/AnimalOrderRankingCard.tsx
```

---

## 3. 右下上半：DashboardHeatmapChart

### 3.1 数据来源

| 数据 | API | 刷新 |
|---|---|---|
| 进出时段热力数据 | `GET /api/v1/analytics/student-activity/heatmap?groupName=ALL&startTime=&endTime=` | 每 5 分钟 |

### 3.2 组件策略

**克隆，不修改原组件。**

- 源组件：`frontend/src/features/analytics/components/ActivityHeatmapChart.tsx`
- 新组件：`frontend/src/features/dashboard/DashboardHeatmapChart.tsx`
- 原组件继续供统计与审计页面使用，一行不改
- 克隆后在副本内独立改造

### 3.3 UI 规格

- **时间范围**：仅 7:00–20:00（14 列），缩短横向跨度
- **行数**：周一至周日（7 行）
- **表格**：`table-layout:fixed` + `colgroup` 百分比列宽（10% + 6.4% × 14），等比例缩放
- **配色**：紫色渐变（`rgba(124,58,237, 0.06→0.48)`），亮色主题
- **峰值突出**：高峰值格 `box-shadow` 紫色外发光 + 白色文字 + `brightness` 呼吸动画
- **表头**：渐变淡紫底，星期列左对齐

---

## 4. 右下下半：RoomPreferenceChart

### 4.1 数据来源

| 数据 | API | 刷新 |
|---|---|---|
| 房间偏好排行 | `GET /api/v1/analytics/student-activity/room-usage?groupName=ALL&startTime=&endTime=` | 每 5 分钟 |

### 4.2 UI 规格

- **图表类型**：ECharts 横向柱状图
- **宽度**：`width:100%` 自适应容器，不固定 px
- **数量**：TOP5 热门房间
- **配色**：五色渐变条（粉 `#ec4899` → 靛 `#6366f1` → 青 `#06b6d4` → 琥珀 `#f59e0b` → 绿 `#22c55e`）
- **特效**：bar 流光扫过（ECharts `animationEasing` + `animationDelay`）
- **标签**：房间名左对齐，数值右对齐

### 4.3 组件文件

```
frontend/src/features/dashboard/RoomPreferenceChart.tsx  （新建）
```

---

## 5. DashboardPage.tsx 布局改动

### 5.1 右侧栏 flex 分配

```tsx
// 当前
<div className="flex min-h-0 flex-col gap-[15px]">
  <div className="flex min-h-0 flex-[5] dash-card">{/* MonthlyRankCarousel */}</div>
  <div className="flex min-h-0 flex-[5] dash-card">{/* AnimalOrderRankingCard */}</div>
</div>

// 改造后
<div className="flex min-h-0 flex-col gap-[15px]">
  <div className="flex min-h-0 flex-[5] dash-card">{/* UnifiedRankingCard */}</div>
  <div className="flex min-h-0 flex-[2.5] dash-card">{/* DashboardHeatmapChart */}</div>
  <div className="flex min-h-0 flex-[2.5] dash-card">{/* RoomPreferenceChart */}</div>
</div>
```

### 5.2 导入变更

```tsx
// 移除
- import { MonthlyRankCarousel } from '@/features/dashboard/MonthlyRankCarousel';
- import { AnimalOrderRankingCard } from '@/features/dashboard/AnimalOrderRankingCard';

// 新增
+ import { UnifiedRankingCard } from '@/features/dashboard/UnifiedRankingCard';
+ import { DashboardHeatmapChart } from '@/features/dashboard/DashboardHeatmapChart';
+ import { RoomPreferenceChart } from '@/features/dashboard/RoomPreferenceChart';
```

---

## 6. 数据对接清单

| 序号 | 新建/改造 | 文件 | 数据源 | 说明 |
|---|---|---|---|---|
| 1 | 新建 | `UnifiedRankingCard.tsx` | `fetchGroupRanking(MONTH, region)` + `fetchAnimalOrderRanking(region)` | 双 Tab 统一排行榜，含排名变化计算 |
| 2 | 新建 | `DashboardHeatmapChart.tsx` | `fetchStudentActivityHeatmap({...})` | 克隆自 ActivityHeatmapChart，时段 7-20 |
| 3 | 新建 | `RoomPreferenceChart.tsx` | `fetchStudentActivityRoomUsage({...})` | ECharts 横向柱状图 |
| 4 | 修改 | `DashboardPage.tsx` | — | 替换 import + 调整 flex 比例 |
| 5 | 删除 | `MonthlyRankCarousel.tsx` | — | 功能已合并到 UnifiedRankingCard |
| 6 | 删除 | `AnimalOrderRankingCard.tsx` | — | 功能已合并到 UnifiedRankingCard |

---

## 7. 排名变化计算策略

进出活跃度排名的 ↑↓→ 箭头标记，后端 API 目前不提供历史排名对比。前端实现方案：

1. 组件内维护 `useRef(previousRankMap)` 存储上一轮排名快照
2. 每次 API 刷新后，对比新旧排名 Map：
   - rank 上升 → 绿色 ↑N
   - rank 下降 → 红色 ↓N
   - rank 不变 → 灰色 →
   - 新增进榜 → 绿色 NEW
3. 首次加载无历史数据时，统一显示 →

---

## 8. 亮色主题适配

所有新建组件遵循 DashboardPage 现有亮色主题：
- 背景：白色 `#fff` / 浅灰 `#f8fafc`
- 边框：`#e2e8f0` / `#f1f5f9`
- 主文字：`#1e293b` / `#334155`
- 辅助文字：`#64748b` / `#94a3b8`
- 强调色沿用现有 sci-fi 视觉体系中的配色

---

## 9. 约束与原则

- **不修改** `ActivityHeatmapChart.tsx`（统计与审计页依赖）
- **不修改** 左侧栏和中间栏的任意组件
- **不修改** DashboardPage 的 grid 三栏布局结构
- 所有新组件宽度自适应，不设固定 px
- 右侧栏 flex 比例变化需确保不影响左侧和中间栏
