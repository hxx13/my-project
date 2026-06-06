# DashboardPage 右侧栏改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 DashboardPage 右侧栏从两个独立排行榜改造为三块联动面板（统一排行榜 + 热力图 + 房间偏好图）

**Architecture:** 新建 3 个组件替换 2 个旧组件，克隆 1 个热力图组件独立改造。所有新组件自适应宽度，亮色主题。左侧和中间栏完全不改。

**Tech Stack:** React 19 + TypeScript + ECharts (echarts-for-react) + TanStack React Query + GSAP + TailwindCSS + GlassCard

---

## 前置：文件结构规划

| 操作 | 文件路径 | 职责 |
|---|---|---|
| 新建 | `frontend/src/features/dashboard/UnifiedRankingCard.tsx` | 双 Tab 统一排行榜（进出活跃度 + 动物消耗） |
| 新建 | `frontend/src/features/dashboard/DashboardHeatmapChart.tsx` | 克隆版进出时段热力图（7:00–20:00） |
| 新建 | `frontend/src/features/dashboard/RoomPreferenceChart.tsx` | ECharts 横向柱状图房间偏好 |
| 修改 | `frontend/src/pages/DashboardPage.tsx` | 替换 import + 调整右侧 flex 比例 |
| 删除 | `frontend/src/features/dashboard/MonthlyRankCarousel.tsx` | 功能已合并 |
| 删除 | `frontend/src/features/dashboard/AnimalOrderRankingCard.tsx` | 功能已合并 |

---

### Task 1: 克隆热力图组件并改造为 DashboardHeatmapChart

**Files:**
- Create: `frontend/src/features/dashboard/DashboardHeatmapChart.tsx`
- Read: `frontend/src/features/analytics/components/ActivityHeatmapChart.tsx`

**说明:** 复制 ActivityHeatmapChart 的全部代码到新文件，然后独立改造。原组件一行不改。

- [ ] **Step 1: 复制源文件到新位置**

```bash
cp frontend/src/features/analytics/components/ActivityHeatmapChart.tsx frontend/src/features/dashboard/DashboardHeatmapChart.tsx
```

- [ ] **Step 2: 改造导入和类型定义**

将文件顶部修改为：

```typescript
import { useMemo } from "react";
import type { HeatmapCell } from "@/api/domains/analytics.api";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// 仪表盘专用：仅展示 7:00–20:00
const HOUR_START = 7;
const HOUR_END = 20; // inclusive
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

type Props = {
  data: HeatmapCell[];
  loading?: boolean;
};
```

- [ ] **Step 3: 实现过滤逻辑和改造渲染**

完整组件代码：

```typescript
import { useMemo } from "react";
import type { HeatmapCell } from "@/api/domains/analytics.api";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

type Props = {
  data: HeatmapCell[];
  loading?: boolean;
};

export function DashboardHeatmapChart({ data, loading }: Props) {
  // 过滤仅保留 7:00–20:00 的数据
  const filtered = useMemo(
    () => data.filter((d) => d.hour >= HOUR_START && d.hour <= HOUR_END),
    [data]
  );

  const maxCount = useMemo(
    () => Math.max(1, ...filtered.map((d) => d.count)),
    [filtered]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        加载热力数据…
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        暂无热力数据
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-md border border-purple-100">
      <table
        className="border-collapse text-[6px]"
        style={{ width: "100%", tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: "10%" }} />
          {HOURS.map((h) => (
            <col key={h} style={{ width: `${90 / HOURS.length}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: "linear-gradient(180deg, #faf5ff, #f3e8ff)" }}>
            <th
              style={{
                padding: "2px 3px",
                color: "#7c3aed",
                fontWeight: 600,
                fontSize: 6,
              }}
            >
              📅
            </th>
            {HOURS.map((h) => (
              <th
                key={h}
                style={{
                  padding: "2px 1px",
                  color: "#a78bfa",
                  fontWeight: 400,
                  fontSize: 6,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
            const rowCells = HOURS.map((h) => {
              const cell = filtered.find(
                (c) => c.dayOfWeek === dow && c.hour === h
              );
              return cell;
            });
            const hasData = rowCells.some((c) => c && c.count > 0);

            return (
              <tr key={dow}>
                <td
                  style={{
                    padding: "2px 3px",
                    fontWeight: hasData ? 600 : 400,
                    color: hasData ? "#6d28d9" : "#a78bfa",
                    background: "#faf5ff",
                    fontSize: 6,
                  }}
                >
                  {DAY_LABELS[dow]}
                </td>
                {rowCells.map((cell, i) => {
                  const h = HOURS[i];
                  if (!cell || cell.count === 0) {
                    return (
                      <td
                        key={h}
                        style={{ textAlign: "center", color: "#e5e7eb" }}
                      >
                        ·
                      </td>
                    );
                  }
                  const intensity = cell.count / maxCount;
                  const alpha = Math.max(0.06, intensity);
                  const isPeak = intensity >= 0.35;
                  return (
                    <td
                      key={h}
                      style={{
                        textAlign: "center",
                        backgroundColor: `rgba(124,58,237,${alpha})`,
                        fontWeight: isPeak ? 700 : 400,
                        color: isPeak ? "#fff" : undefined,
                        boxShadow: isPeak
                          ? `0 0 ${4 + intensity * 10}px rgba(124,58,237,${0.2 + intensity * 0.2})`
                          : undefined,
                        animation: isPeak
                          ? "cellBreathe 2s ease-in-out infinite"
                          : undefined,
                        fontSize: 6,
                      }}
                      title={`${DAY_LABELS[dow]} ${h}:00 — ${cell.count} 次`}
                    >
                      {cell.count}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 在 DashboardPage 中无需 CSS keyframes（cellBreathe 用内联 style 或全局样式）**

由于 Tailwind 不支持自定义 keyframes，在 DashboardPage 已有的 `<style>` 标签中添加：

```css
@keyframes cellBreathe {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.15); }
}
```

- [ ] **Step 5: 验证组件编译通过**

```bash
cd frontend && npx tsc --noEmit src/features/dashboard/DashboardHeatmapChart.tsx
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/features/dashboard/DashboardHeatmapChart.tsx
git commit -m "feat: add DashboardHeatmapChart — cloned from ActivityHeatmapChart, 7-20h range, peak glow"
```

---

### Task 2: 创建 RoomPreferenceChart 组件

**Files:**
- Create: `frontend/src/features/dashboard/RoomPreferenceChart.tsx`

- [ ] **Step 1: 编写完整组件代码**

```typescript
import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { RoomUsageItem } from "@/api/domains/analytics.api";

const BAR_COLORS = [
  ["#ec4899", "#f472b6"], // pink — 1st
  ["#6366f1", "#818cf8"], // indigo — 2nd
  ["#06b6d4", "#22d3ee"], // cyan — 3rd
  ["#f59e0b", "#fbbf24"], // amber — 4th
  ["#22c55e", "#4ade80"], // green — 5th
];

type Props = {
  data: RoomUsageItem[];
  loading?: boolean;
};

export function RoomPreferenceChart({ data, loading }: Props) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.entryCount - a.entryCount).slice(0, 5),
    [data]
  );

  const option = useMemo(() => {
    if (sorted.length === 0) return {};

    const names = sorted.map((r) => r.roomName);
    const values = sorted.map((r) => r.entryCount);

    return {
      grid: { left: "18%", right: "12%", top: 5, bottom: 5 },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        formatter: (params: { name: string; value: number }[]) =>
          `${params[0].name}<br/>本周进出: <b>${params[0].value} 次</b>`,
      },
      xAxis: {
        type: "value" as const,
        show: false,
        max: Math.max(...values) * 1.15,
      },
      yAxis: {
        type: "category" as const,
        data: names,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#475569",
          fontSize: 10,
          fontWeight: 600,
        },
        inverse: true,
      },
      series: [
        {
          type: "bar",
          data: values.map((v, i) => ({
            value: v,
            itemStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: BAR_COLORS[i]?.[0] ?? "#a78bfa" },
                  { offset: 1, color: BAR_COLORS[i]?.[1] ?? "#c4b5fd" },
                ],
              },
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 12,
          label: {
            show: true,
            position: "right",
            color: "#475569",
            fontSize: 9,
            fontWeight: 700,
            formatter: "{c} 次",
          },
          animationEasing: "elasticOut" as const,
          animationDelay: (idx: number) => idx * 80,
        },
      ],
    };
  }, [sorted]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        加载房间数据…
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        暂无房间偏好数据
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ width: "100%", height: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/features/dashboard/RoomPreferenceChart.tsx
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/features/dashboard/RoomPreferenceChart.tsx
git commit -m "feat: add RoomPreferenceChart — ECharts horizontal bar, top 5 room preference"
```

---

### Task 3: 创建 UnifiedRankingCard 组件（核心）

**Files:**
- Create: `frontend/src/features/dashboard/UnifiedRankingCard.tsx`

**数据依赖:**
- `fetchGroupRanking(timeType, region)` — 进出活跃度排名
- `fetchAnimalOrderRanking(region)` — 动物消耗排名

- [ ] **Step 1: 编写组件代码（第一部分 — imports + 类型）**

```typescript
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGroupRanking, fetchAnimalOrderRanking } from "@/api/twinApi";
import { Trophy } from "lucide-react";

type Region = "TOTAL" | "PUDONG" | "PUXI";
type TabKey = "activity" | "animal";

const REGIONS: Region[] = ["TOTAL", "PUDONG", "PUXI"];
const REGION_LABELS: Record<Region, string> = {
  TOTAL: "全部",
  PUDONG: "浦东",
  PUXI: "浦西",
};

type RankItem = {
  name: string;
  value: number;
  trend: "up" | "down" | "same";
  trendValue: number;
};

const MAX_ITEMS = 20;
```

- [ ] **Step 2: 编写组件代码（第二部分 — hooks + 状态）**

```typescript
export function UnifiedRankingCard() {
  const [activeTab, setActiveTab] = useState<TabKey>("activity");
  const [region, setRegion] = useState<Region>("TOTAL");
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const prevRankMapRef = useRef<Map<string, number>>(new Map());
  const autoTabTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 数据获取 ----
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ["dashboard", "ranking", "MONTH", region],
    queryFn: () => fetchGroupRanking("MONTH", region),
    refetchInterval: 300_000, // 5min
  });

  const { data: animalData, isLoading: animalLoading } = useQuery({
    queryKey: ["dashboard", "animalRanking", region],
    queryFn: () => fetchAnimalOrderRanking(region),
    refetchInterval: 1_800_000, // 30min
    enabled: activeTab === "animal",
  });
```

- [ ] **Step 3: 编写组件代码（第三部分 — 排名变化计算）**

```typescript
  // ---- 排名变化计算 ----
  const rawList: { name?: string; value?: number; count?: number }[] =
    activeTab === "activity"
      ? (Array.isArray(activityData) ? activityData : [])
      : (Array.isArray(animalData) ? animalData : []);

  const rankedList = useMemo<RankItem[]>(() => {
    const items: RankItem[] = rawList.slice(0, MAX_ITEMS).map((item, idx) => {
      const name = item.name ?? "";
      const value = item.value ?? item.count ?? 0;
      const prevRank = prevRankMapRef.current.get(name);
      let trend: RankItem["trend"] = "same";
      let trendValue = 0;
      if (prevRank !== undefined) {
        if (prevRank > idx + 1) {
          trend = "up";
          trendValue = prevRank - (idx + 1);
        } else if (prevRank < idx + 1) {
          trend = "down";
          trendValue = idx + 1 - prevRank;
        }
      }
      return { name, value, trend, trendValue };
    });

    // 更新快照
    const newMap = new Map<string, number>();
    items.forEach((item, i) => newMap.set(item.name, i + 1));
    prevRankMapRef.current = newMap;

    return items;
  }, [rawList]);

  const top3 = rankedList.slice(0, 3);
  const rest = rankedList.slice(3);
  const maxValue = rankedList.length > 0 ? Math.max(rankedList[0].value, 1) : 1;
```

- [ ] **Step 4: 编写组件代码（第四部分 — 自动滚动 + Tab 轮播）**

```typescript
  // ---- 自动滚动 ----
  useEffect(() => {
    if (!isAutoPlaying || rankedList.length <= 3) return;
    let active = true;
    let raf: number;

    const scroll = () => {
      if (!active || !scrollBoxRef.current) return;
      const el = scrollBoxRef.current;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      const start = performance.now();
      const duration = maxScroll * 40; // ~40ms per px for smooth scroll

      const animate = (now: number) => {
        if (!active) return;
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.scrollTop = eased * maxScroll;
        if (progress < 1) {
          raf = requestAnimationFrame(animate);
        }
      };
      raf = requestAnimationFrame(animate);
    };

    const timeout = setTimeout(scroll, 2000);
    return () => {
      active = false;
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [isAutoPlaying, rankedList.length]);

  // ---- Tab 自动轮播 ----
  useEffect(() => {
    if (!isAutoPlaying) return;
    autoTabTimerRef.current = setInterval(() => {
      setActiveTab((prev) => (prev === "activity" ? "animal" : "activity"));
    }, 8000);
    return () => {
      if (autoTabTimerRef.current) clearInterval(autoTabTimerRef.current);
    };
  }, [isAutoPlaying]);

  const handleTabClick = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setIsAutoPlaying(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setIsAutoPlaying(true), 8000);
  }, []);

  const handleRegionClick = useCallback((reg: Region) => {
    setRegion(reg);
  }, []);

  const isLoading = activeTab === "activity" ? activityLoading : animalLoading;
```

- [ ] **Step 5: 编写组件代码（第五部分 — 渲染函数）**

```typescript
  // ---- 渲染辅助 ----
  const trendEl = (trend: RankItem["trend"], trendValue: number) => {
    if (trend === "up") {
      return (
        <span
          style={{
            color: "#22c55e",
            fontSize: 9,
            fontWeight: 900,
            animation: "arrowBounce 1.3s ease-in-out infinite",
          }}
        >
          ↑{trendValue}
        </span>
      );
    }
    if (trend === "down") {
      return (
        <span
          style={{
            color: "#ef4444",
            fontSize: 9,
            fontWeight: 900,
            animation: "arrowBounce 1.5s ease-in-out 0.4s infinite",
          }}
        >
          ↓{trendValue}
        </span>
      );
    }
    return (
      <span style={{ color: "#94a3b8", fontSize: 9, fontWeight: 900 }}>→</span>
    );
  };

  const podiumColors = [
    {
      bg: "linear-gradient(180deg, #fef3c7, #fbbf24, #f59e0b)",
      height: 28,
      medal: "🥇",
      anim: "glowPulse 2s ease-in-out infinite",
    },
    {
      bg: "linear-gradient(180deg, #e2e8f0, #94a3b8)",
      height: 20,
      medal: "🥈",
      anim: "silverPulse 2.5s ease-in-out infinite",
    },
    {
      bg: "linear-gradient(180deg, #fed7aa, #f97316, #ea580c)",
      height: 16,
      medal: "🥉",
      anim: "bronzePulse 3s ease-in-out infinite",
    },
  ];
```

- [ ] **Step 6: 编写组件代码（第六部分 — JSX 渲染）**

```typescript
  return (
    <div className="w-full h-full flex flex-col gap-1 overflow-hidden bg-transparent">
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-amber-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <div
            className="w-[18px] h-[18px] rounded-md flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              boxShadow: "0 0 8px rgba(245,158,11,0.3)",
            }}
          >
            <Trophy className="w-3 h-3 text-white" />
          </div>
          <span
            className="text-[13px] font-black tracking-wider"
            style={{
              background: "linear-gradient(90deg, #b45309, #d97706)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            排行榜
          </span>
        </div>
        <div
          className="flex p-0.5 rounded-md"
          style={{ background: "#fef3c7" }}
        >
          <button
            onClick={() => handleTabClick("activity")}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 8,
              background: activeTab === "activity" ? "#fbbf24" : "transparent",
              color: activeTab === "activity" ? "#fff" : "#b45309",
              boxShadow:
                activeTab === "activity"
                  ? "0 1px 3px rgba(245,158,11,0.3)"
                  : "none",
            }}
          >
            进出活跃
          </button>
          <button
            onClick={() => handleTabClick("animal")}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 8,
              background: activeTab === "animal" ? "#fbbf24" : "transparent",
              color: activeTab === "animal" ? "#fff" : "#b45309",
              boxShadow:
                activeTab === "animal"
                  ? "0 1px 3px rgba(245,158,11,0.3)"
                  : "none",
            }}
          >
            动物消耗
          </button>
        </div>
      </div>

      {/* Region filter */}
      <div className="flex gap-2 items-center shrink-0">
        {REGIONS.map((reg) => (
          <button
            key={reg}
            onClick={() => handleRegionClick(reg)}
            style={{
              padding: "1px 8px",
              borderRadius: 3,
              fontWeight: 700,
              fontSize: 7,
              background: region === reg ? "#3b82f6" : "transparent",
              color: region === reg ? "#fff" : "#94a3b8",
              boxShadow:
                region === reg ? "0 1px 4px rgba(59,130,246,0.3)" : "none",
            }}
          >
            {REGION_LABELS[reg]}
          </button>
        ))}
        <span className="ml-auto text-[7px] text-slate-300">Top 20</span>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400 animate-pulse">
          加载中…
        </div>
      ) : (
        <>
          {/* Podium — only for 进出活跃 tab */}
          {activeTab === "activity" && top3.length > 0 && (
            <div
              className="flex items-end justify-center gap-1 shrink-0 pt-1"
              style={{ gap: 5 }}
            >
              {/* 2nd, 1st, 3rd order */}
              {[1, 0, 2].map((podiumIdx) => {
                const item = top3[podiumIdx];
                if (!item) return null;
                const colors = podiumColors[podiumIdx];
                const widths = [50, 44, 40];
                return (
                  <div
                    key={item.name}
                    style={{
                      textAlign: "center",
                      width: widths[podiumIdx],
                    }}
                  >
                    <div style={{ fontSize: podiumIdx === 0 ? 18 : podiumIdx === 1 ? 14 : 12 }}>
                      {colors.medal}
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: podiumIdx === 0 ? 7 : 6,
                        color: podiumIdx === 0 ? "#b45309" : "#475569",
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        background: colors.bg,
                        height: colors.height,
                        borderRadius: "2px 2px 0 0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                        animation: colors.anim,
                        position: "relative",
                        boxShadow:
                          podiumIdx === 0
                            ? "0 0 12px rgba(251,191,36,0.3)"
                            : undefined,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 900,
                          fontSize: podiumIdx === 0 ? 12 : podiumIdx === 1 ? 9 : 8,
                          color: "#fff",
                        }}
                      >
                        {podiumIdx + 1}
                      </span>
                    </div>
                    <div style={{ marginTop: 1, fontSize: 6 }}>
                      {item.value}{" "}
                      {trendEl(item.trend, item.trendValue)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Flat list for animal tab or 4-20 for activity tab */}
          <div
            ref={scrollBoxRef}
            className="flex-1 flex flex-col gap-[1.5px] overflow-y-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            {rest.map((item, i) => {
              const rank = i + 4;
              const pct = (item.value / maxValue) * 100;
              const shimmerDelay = (i * 0.3) % 3;

              return (
                <div
                  key={item.name}
                  className="flex items-center px-[1%] py-[1px] rounded-sm"
                  style={{
                    gap: "2%",
                    background: i % 2 === 0 ? "#f8fafc" : "transparent",
                  }}
                >
                  <span
                    style={{
                      flex: "0.06",
                      textAlign: "center",
                      fontWeight: 800,
                      fontSize: 7,
                      color: "#cbd5e1",
                      minWidth: 0,
                    }}
                  >
                    {rank}
                  </span>
                  <span
                    style={{
                      flex: "0.22",
                      fontSize: 7,
                      color: "#334155",
                      textAlign: "right",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                      minWidth: 0,
                    }}
                  >
                    {item.name}
                  </span>
                  <div
                    style={{
                      flex: "0.45",
                      height: 4,
                      background: "#f1f5f9",
                      borderRadius: 2,
                      overflow: "hidden",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                        borderRadius: 2,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background:
                            "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                          backgroundSize: "200% 100%",
                          animation: `shimmer 2s ease-in-out ${shimmerDelay}s infinite`,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 7,
                      color: "#475569",
                      flex: "0.12",
                      textAlign: "right",
                      minWidth: 0,
                    }}
                  >
                    {item.value}
                  </span>
                  <span
                    style={{
                      flex: "0.08",
                      textAlign: "right",
                      minWidth: 0,
                    }}
                  >
                    {trendEl(item.trend, item.trendValue)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/features/dashboard/UnifiedRankingCard.tsx
```

- [ ] **Step 8: 提交**

```bash
git add frontend/src/features/dashboard/UnifiedRankingCard.tsx
git commit -m "feat: add UnifiedRankingCard — dual-tab ranking with podium, trend arrows, top 20 auto-scroll"
```

---

### Task 4: 修改 DashboardPage.tsx 接入新组件

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: 替换 import 语句**

将：

```typescript
import { MonthlyRankCarousel } from '@/features/dashboard/MonthlyRankCarousel';
import {AnimalOrderRankingCard} from "@/features/dashboard/AnimalOrderRankingCard.tsx";
```

替换为：

```typescript
import { UnifiedRankingCard } from '@/features/dashboard/UnifiedRankingCard';
import { DashboardHeatmapChart } from '@/features/dashboard/DashboardHeatmapChart';
import { RoomPreferenceChart } from '@/features/dashboard/RoomPreferenceChart';
```

- [ ] **Step 2: 添加热力图和房间偏好的数据查询**

在 `lineChartData` 查询之后添加：

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchStudentActivityHeatmap, fetchStudentActivityRoomUsage } from '@/api/domains/analytics.api';

// ... 在组件内，lineChartData 查询之后添加:

// 本周起止时间
const thisWeekRange = useMemo(() => {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  return { startTime: fmt(monday), endTime: fmt(sunday) };
}, []);

const { data: heatmapData, isLoading: isHeatmapLoading } = useQuery({
  queryKey: ["dashboard", "heatmap", thisWeekRange.startTime, thisWeekRange.endTime],
  queryFn: () => fetchStudentActivityHeatmap({
    groupName: "",
    startTime: thisWeekRange.startTime,
    endTime: thisWeekRange.endTime,
  }),
  refetchInterval: 300_000,
});

const { data: roomUsageData, isLoading: isRoomLoading } = useQuery({
  queryKey: ["dashboard", "roomUsage", thisWeekRange.startTime, thisWeekRange.endTime],
  queryFn: () => fetchStudentActivityRoomUsage({
    groupName: "",
    startTime: thisWeekRange.startTime,
    endTime: thisWeekRange.endTime,
  }),
  refetchInterval: 300_000,
});
```

注意：需要在文件顶部新增 `import { useMemo } from "react";`

- [ ] **Step 3: 替换右侧栏 JSX**

将：

```tsx
{/* 右侧 25% */}
<div className="flex min-h-0 flex-col gap-[15px]">
    <div className="flex min-h-0 flex-[5] dash-card">
        <GlassCard blobColor="rgba(191,90,242,0.3)">
            <MonthlyRankCarousel />
        </GlassCard>
    </div>
    <div className="flex min-h-0 flex-[5] dash-card">
        <GlassCard blobColor="rgba(255,59,48,0.3)">
            <AnimalOrderRankingCard />
        </GlassCard>
    </div>
</div>
```

替换为：

```tsx
{/* 右侧 25% */}
<div className="flex min-h-0 flex-col gap-[15px]">
    <div className="flex min-h-0 flex-[5] dash-card">
        <GlassCard blobColor="rgba(191,90,242,0.3)">
            <UnifiedRankingCard />
        </GlassCard>
    </div>
    <div className="flex min-h-0 flex-[2.5] dash-card">
        <GlassCard blobColor="rgba(124,58,237,0.15)">
            <DashboardHeatmapChart
                data={heatmapData ?? []}
                loading={isHeatmapLoading}
            />
        </GlassCard>
    </div>
    <div className="flex min-h-0 flex-[2.5] dash-card">
        <GlassCard blobColor="rgba(236,72,153,0.12)">
            <RoomPreferenceChart
                data={roomUsageData ?? []}
                loading={isRoomLoading}
            />
        </GlassCard>
    </div>
</div>
```

- [ ] **Step 4: 在现有 <style> 标签中添加 CSS keyframes**

在 `DashboardPage` 中已有的 `@keyframes fadeInUp` 等动画之后添加：

```css
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes arrowBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 8px rgba(251,191,36,0.3), 0 0 20px rgba(251,191,36,0.1); }
  50% { box-shadow: 0 0 16px rgba(251,191,36,0.5), 0 0 36px rgba(251,191,36,0.2); }
}
@keyframes silverPulse {
  0%, 100% { box-shadow: 0 0 6px rgba(148,163,184,0.25); }
  50% { box-shadow: 0 0 12px rgba(148,163,184,0.4); }
}
@keyframes bronzePulse {
  0%, 100% { box-shadow: 0 0 5px rgba(249,115,22,0.2); }
  50% { box-shadow: 0 0 10px rgba(249,115,22,0.35); }
}
@keyframes cellBreathe {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.15); }
}
```

- [ ] **Step 5: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/pages/DashboardPage.tsx
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: replace right-column rankings with UnifiedRankingCard + heatmap + room preference chart"
```

---

### Task 5: 删除旧组件文件

**Files:**
- Delete: `frontend/src/features/dashboard/MonthlyRankCarousel.tsx`
- Delete: `frontend/src/features/dashboard/AnimalOrderRankingCard.tsx`

- [ ] **Step 1: 删除文件并验证没有残留引用**

```bash
rm frontend/src/features/dashboard/MonthlyRankCarousel.tsx
rm frontend/src/features/dashboard/AnimalOrderRankingCard.tsx
```

- [ ] **Step 2: 全量类型检查确认无编译错误**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/features/dashboard/MonthlyRankCarousel.tsx frontend/src/features/dashboard/AnimalOrderRankingCard.tsx
git commit -m "chore: remove deprecated MonthlyRankCarousel and AnimalOrderRankingCard"
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 启动前端 dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: 浏览器打开 `http://localhost:5173`**

检查项：
1. 右侧栏三个面板正常渲染
2. 排行榜 Tab 可切换（进出活跃 ↔ 动物消耗）
3. 园区筛选按钮可切换（全部/浦东/浦西）
4. 前三领奖台辉光动画正常
5. 4-20 排行列表流光扫过动画正常
6. 热力图 7:00-20:00 时段正确
7. 热力图峰值格有发光效果
8. 房间偏好柱状图宽度自适应
9. 整体亮色主题一致
10. 左侧栏和中间栏不受影响

- [ ] **Step 3: 修复发现的问题并提交**

```bash
git add -A
git commit -m "fix: dashboard right column verification fixes"
```

---

### Task 7: 后端适配（如需要）

**如果** `fetchStudentActivityHeatmap` 和 `fetchStudentActivityRoomUsage` 在 `groupName=""` 时不返回全量数据，需要调用方确认后端 `StudentActivityController` 是否支持空 groupName 查全部。

- [ ] **Step 1: 检查后端接口行为**

```bash
# 用 curl 测试空 groupName 是否返回全量
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/v1/analytics/student-activity/heatmap?groupName=&startTime=2026-06-01%2000:00:00&endTime=2026-06-07%2023:59:59"
```

- [ ] **Step 2: 如不支持全量，两种方案择一**

  - **方案 A (推荐)**: 修改后端 `StudentActivityController`，当 `groupName` 为空时返回全课题组聚合数据
  - **方案 B**: 前端先用 `fetchStudentActivityGroups` 获取所有课题组，再逐个请求 heatmap/roomUsage 并前端合并（请求量大，不推荐）

---

## 检查清单

- [ ] DashboardPage 不报编译错误
- [ ] 三个新组件各自独立可用
- [ ] 旧组件已删除且无残留引用
- [ ] 左侧栏和中间栏不受影响
- [ ] 亮色主题一致
- [ ] 所有面板宽度自适应，无横向溢出
- [ ] 排名箭头弹跳 + 进度条流光 + podium 辉光动画正常
- [ ] 热力图 7:00-20:00，峰值发光正常
- [ ] 房间偏好 ECharts 柱状图自适应宽度
