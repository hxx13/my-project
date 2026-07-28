import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import ReactECharts from "echarts-for-react";
import { Check, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import {
  fetchOrderAnalyticsReport,
  fetchOrderAnalyticsFilterOptions,
  type SupplierStrainSpecRow,
  type PiCollectorRow,
  type DeptStrainRow,
  type ProjectStrainRow,
  type HeatmapGroupBy,
} from "@/api/domains/analytics.api";
import { cn } from "@/lib/utils";
import {
  analyticsFilterShell,
  analyticsInput,
} from "@/features/analytics/analyticsUiTokens";

/* ── helpers ── */

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const CHART_COLORS = [
  "var(--app-color-accent)",
  "var(--app-color-accent-secondary)",
  "var(--app-color-feedback-success)",
  "var(--app-color-feedback-warning)",
  "var(--app-color-feedback-info)",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
];

/* ── shared ── */

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-color-text-tertiary)] shrink-0">
      {children}
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "font-medium min-w-0 border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent-secondary)] focus:outline-none",
        compact
          ? "px-1 py-0.5 text-[10px] max-w-[80px] rounded"
          : "px-1.5 py-1 text-[11px] max-w-[110px] rounded-md",
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

/**
 * 多选下拉 — 订单状态专用。默认全选，点击展开 checkbox 列表。
 */
function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  onToggleAll,
  placeholder = "订单状态",
}: {
  options: string[];
  selected: string[];
  onToggle: (s: string) => void;
  onToggleAll: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAll = selected.length === options.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = isAll ? "全部状态" : selected.length === 0 ? "未选" : `已选 ${selected.length}`;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition",
          isAll
            ? "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)]"
            : "border-[var(--app-color-accent)] bg-[color-mix(in_srgb,var(--app-color-accent)_22%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]",
        )}
      >
        {placeholder}
        <span className="text-[var(--app-color-text-tertiary)]">{label}</span>
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-[var(--z-dropdown)] min-w-[140px] rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg p-1.5 space-y-0.5">
          <button
            type="button"
            onClick={onToggleAll}
            className="w-full text-left rounded px-2 py-1 text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
          >
            {isAll ? "取消全选" : "全选"}
          </button>
          <div className="h-px bg-[var(--app-color-border-default)]" />
          {options.map((s) => {
            const checked = selected.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onToggle(s)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
              >
                <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition",
                  checked
                    ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]"
                    : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]",
                )}>
                  {checked && <Check className="h-2.5 w-2.5" />}
                </span>
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CollapsibleFilters({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent-secondary)] transition"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        筛选条件
        {!open ? <span className="text-[var(--app-color-text-tertiary)]/60">（点击展开）</span> : null}
      </button>
      {open && <div className="mt-1.5 flex flex-wrap items-center gap-1">{children}</div>}
    </div>
  );
}

/* ── drill-down ── */

type DrillRow = { name: string; totalQty: number; maleQty: number; femaleQty: number; orderCount: number };

function aggregateDrill(rows: SupplierStrainSpecRow[], supplier: string, strain: string): DrillRow[] {
  let filtered = rows;
  if (supplier) filtered = filtered.filter((r) => r.supplierName === supplier);
  if (strain) filtered = filtered.filter((r) => r.strainName === strain);

  const key = !supplier ? "supplierName" : !strain ? "strainName" : "specName";
  const agg = new Map<string, DrillRow>();
  for (const r of filtered) {
    const k = (r as any)[key] || "(空)";
    const cur = agg.get(k) ?? { name: k, totalQty: 0, maleQty: 0, femaleQty: 0, orderCount: 0 };
    cur.totalQty += Number(r.totalQty);
    cur.maleQty += Number(r.maleQty);
    cur.femaleQty += Number(r.femaleQty);
    cur.orderCount += Number(r.orderCount);
    agg.set(k, cur);
  }
  return [...agg.values()].sort((a, b) => b.totalQty - a.totalQty);
}

/* ── PI-collector ── */

type PiGroup = { piName: string; totalQty: number; collectors: PiCollectorRow[] };

function groupPiCollectors(rows: PiCollectorRow[]): PiGroup[] {
  const map = new Map<string, PiGroup>();
  for (const r of rows) {
    const g = map.get(r.piName) ?? { piName: r.piName, totalQty: 0, collectors: [] };
    g.totalQty += Number(r.totalQty);
    g.collectors.push(r);
    map.set(r.piName, g);
  }
  return [...map.values()].sort((a, b) => b.totalQty - a.totalQty);
}

function shortName(name: string, max = 3): string {
  if (!name) return "";
  return name.length > max ? name.slice(0, max) + "…" : name;
}

/* ── heatmap builder ── */

function buildHeatmapMatrix(
  rows: (DeptStrainRow | ProjectStrainRow)[],
  rowKey: "departmentName" | "projectName",
) {
  const rowNames = [...new Set(rows.map((r) => (r as any)[rowKey] as string))];
  const strains = [...new Set(rows.map((r) => r.strainName))];
  const matrix: Record<string, Record<string, number>> = {};
  for (const rn of rowNames) {
    matrix[rn] = {};
    for (const st of strains) matrix[rn][st] = 0;
  }
  for (const r of rows) {
    const rn = (r as any)[rowKey] as string;
    if (matrix[rn]) matrix[rn][r.strainName] = Number(r.totalQty);
  }
  return { rows: rowNames, cols: strains, matrix };
}

/* ══════════════════════════════════════════════════════════════════ */
/* ── LAYOUT: 4-cell card container ── */

const CARD_SHELL =
  "flex flex-col min-h-0 overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm";

function CardHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  if (!title && !actions) return null;
  return (
    <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-2 border-b border-[var(--app-color-border-default)]">
      <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)]">{title}</h3>
      {actions}
    </div>
  );
}

/**
 * 四格卡片容器 — 硬性约束：
 * - 外层 section overflow:hidden → 绝不超出网格单元
 * - 内容区 flex-1 min-h-0 overflow-auto → 内部滚动
 */
function CellCard({
  title,
  actions,
  children,
  className,
  filterBar,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  filterBar?: React.ReactNode;
}) {
  return (
    <section className={cn(CARD_SHELL, className)}>
      <CardHeader title={title} actions={actions} />
      {filterBar ? <div className="shrink-0 px-5 pt-1.5 pb-1">{filterBar}</div> : null}
      <div className="flex-1 min-h-0 overflow-hidden px-5 pb-5 pt-0">
        {children}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════ */

export default function OrderAnalyticsReportPanel() {
  return (
    <div
      className="flex flex-col gap-3 h-full"
    >
      <style>{`
        .order-analytics-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .order-analytics-scroll::-webkit-scrollbar-track { background: transparent; }
        .order-analytics-scroll::-webkit-scrollbar-thumb { background: var(--app-color-border-default); border-radius: 4px; }
      `}</style>
      {/* KPI Banner — shrink-0 */}
      <KpiBanner />

      {/* 2×2 四格布局 */}
      <div
        className="grid gap-3 min-h-0 flex-1"
        style={{
          gridTemplateColumns: "7fr 3fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        {/* 左上：下钻 */}
        <DrilldownCard />

        {/* 右上：PI 排名 */}
        <PiRankingCard />

        {/* 左下：热力图 */}
        <HeatmapCard />

        {/* 右下：校区 + 性别 */}
        <CampusGenderCard />
      </div>
    </div>
  );
}

/* ════════════════════ KPI BANNER ════════════════════ */

function KpiBanner() {
  const [startDate, setStartDate] = useState(() => daysAgoStr(30));
  const [endDate, setEndDate] = useState(() => todayStr());
  const [activePreset, setActivePreset] = useState("近一个月");

  const { data } = useQuery({
    queryKey: ["order-analytics", "kpi", startDate, endDate],
    queryFn: () => fetchOrderAnalyticsReport({ startDate, endDate }),
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
  });
  const summary = data?.summary;

  const applyPreset = (key: string) => {
    setActivePreset(key);
    const now = new Date();
    const today = todayStr();
    switch (key) {
      case "全部":
        setStartDate("2000-01-01");
        setEndDate(today);
        break;
      case "今年":
        setStartDate(`${now.getFullYear()}-01-01`);
        setEndDate(today);
        break;
      case "去年": {
        const y = now.getFullYear() - 1;
        setStartDate(`${y}-01-01`);
        setEndDate(`${y}-12-31`);
        break;
      }
      case "上一个月": {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        setStartDate(d.toISOString().slice(0, 10));
        setEndDate(lastDay.toISOString().slice(0, 10));
        break;
      }
      case "本月":
        setStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
        setEndDate(today);
        break;
      case "近一个月":
        setStartDate(daysAgoStr(30));
        setEndDate(today);
        break;
      case "近一周":
        setStartDate(daysAgoStr(7));
        setEndDate(today);
        break;
    }
  };

  const PRESETS = ["全部", "今年", "去年", "上一个月", "本月", "近一个月", "近一周"];

  return (
    <div className={cn(analyticsFilterShell, "shrink-0")}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FilterLabel>日期</FilterLabel>
        {/* preset chips */}
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applyPreset(p)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition",
              activePreset === p
                ? "border-[var(--app-color-accent)] bg-[color-mix(in_srgb,var(--app-color-accent)_22%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]"
                : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-accent-secondary)]",
            )}
          >
            {p}
          </button>
        ))}
        {/* manual date inputs */}
        <span className="mx-1 h-5 w-px bg-[var(--app-color-border-default)]" />
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setActivePreset(""); }} className={cn("w-[125px] px-2 py-1.5 text-xs", analyticsInput)} />
        <span className="text-xs text-[var(--app-color-text-tertiary)]">至</span>
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setActivePreset(""); }} className={cn("w-[125px] px-2 py-1.5 text-xs", analyticsInput)} />
      </div>
      {summary ? (
        <div className="flex items-center overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
          <div className="flex items-center gap-3 px-5 py-3" style={{ background: "color-mix(in srgb, var(--app-color-accent-soft) 50%, var(--app-color-surface-container))", flex: "2 2 0%" }}>
            <div>
              <p className="text-[11px] font-semibold text-[var(--app-color-text-secondary)]">总订购数量</p>
              <p className="text-2xl font-extrabold tracking-tight text-[var(--app-color-text-primary)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                {Number(summary.totalQty).toLocaleString()}
              </p>
            </div>
            <div className="ml-2 flex gap-2 border-l border-[var(--app-color-border-default)] pl-2">
              <div className="text-center"><p className="text-sm font-bold text-[var(--app-color-text-primary)]">{Number(summary.totalMale).toLocaleString()}</p><p className="text-[9px] font-semibold uppercase text-[var(--app-color-text-tertiary)]">♂ 雄</p></div>
              <div className="text-center"><p className="text-sm font-bold text-[var(--app-color-text-primary)]">{Number(summary.totalFemale).toLocaleString()}</p><p className="text-[9px] font-semibold uppercase text-[var(--app-color-text-tertiary)]">♀ 雌</p></div>
            </div>
          </div>
          {[
            ["总订单数", summary.totalOrders],
            ["供应商", summary.uniqueSuppliers],
            ["品系", summary.uniqueStrains],
            ["PI 负责人", summary.uniquePis],
            ["领用人", summary.uniqueCollectors],
            ["课题组", summary.uniqueProjects],
          ].map(([lbl, val], i) => (
            <div key={lbl as string} className="flex items-stretch" style={{ flex: "1 1 0%" }}>
              {i > 0 ? <span className="my-2 w-px bg-[var(--app-color-border-default)]" /> : null}
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-2">
                <p className="text-base font-bold text-[var(--app-color-text-primary)]" style={{ fontVariantNumeric: "tabular-nums" }}>{Number(val).toLocaleString()}</p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--app-color-text-tertiary)]">{lbl as string}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ════════════════════ 左上：下钻 ════════════════════ */

function DrilldownCard() {
  const [startDate, setStartDate] = useState(() => daysAgoStr(30));
  const [endDate, setEndDate] = useState(() => todayStr());
  const [areaName, setAreaName] = useState("");
  const [consumeType, setConsumeType] = useState("");
  const [room, setRoom] = useState("");
  const [orderStates, setOrderStates] = useState<string[]>([]);

  const [drillSupplier, setDrillSupplier] = useState("上海灵畅生物科技有限公司");
  const [drillStrain, setDrillStrain] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const { data: filterOpts } = useQuery({
    queryKey: ["order-analytics", "filters"],
    queryFn: fetchOrderAnalyticsFilterOptions,
    staleTime: 300_000,
  });

  const allOrderStates = filterOpts?.orderStates ?? [];

  useEffect(() => {
    if (allOrderStates.length > 0 && orderStates.length === 0) {
      setOrderStates([...allOrderStates]);
    }
  }, [allOrderStates]);

  useEffect(() => {
    setDrillSupplier("");
    setDrillStrain("");
  }, [startDate, endDate, areaName, consumeType, room, orderStates.join(",")]);

  const osKey = orderStates.join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["order-analytics", "drilldown", startDate, endDate, areaName, consumeType, room, osKey],
    queryFn: () =>
      fetchOrderAnalyticsReport({
        startDate, endDate, areaName, consumeType, room,
        orderStates: orderStates.length === allOrderStates.length ? undefined : orderStates,
      }),
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
  });

  const drillData = useMemo(
    () => aggregateDrill(data?.supplierStrainSpec ?? [], drillSupplier, drillStrain),
    [data, drillSupplier, drillStrain],
  );

  // 稳定的回调引用 — 避免 Recharts 的 React.memo + propsAreEqual 因内联函数而失效
  const handleDrillClick = useCallback((name: string) => {
    if (!name) return;
    if (!drillSupplier) setDrillSupplier(name);
    else if (!drillStrain) setDrillStrain(name);
  }, [drillSupplier, drillStrain]);

  const isAllStates = orderStates.length === allOrderStates.length;
  const clearFilters = useCallback(() => {
    setStartDate(daysAgoStr(30));
    setEndDate(todayStr());
    setAreaName("");
    setConsumeType("");
    setRoom("");
    setOrderStates([...allOrderStates]);
  }, [allOrderStates]);
  const toggleOrderState = (s: string) => {
    setOrderStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  // Level: 0=supplier, 1=strain, 2=spec (deepest)
  const drillLevel = !drillSupplier ? 0 : !drillStrain ? 1 : 2;
  const isDeepest = drillLevel === 2;
  const levelLabel = drillLevel === 0 ? "点击供应商 → 查看品系" : drillLevel === 1 ? "点击品系 → 查看规格" : undefined;

  const headerActions = (
    <button
      type="button"
      onClick={() => setFilterOpen((v) => !v)}
      className="flex items-center gap-1 text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent-secondary)] transition shrink-0"
    >
      {filterOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      筛选
    </button>
  );

  return (
    <CellCard title="柱状图" actions={headerActions}>
      {filterOpen && (
        <div className="shrink-0 flex flex-wrap items-center gap-1 px-5 pb-1.5">
          <FilterLabel>日期</FilterLabel>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[110px] px-1.5 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[110px] px-1.5 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
          <span className="w-px h-4 bg-[var(--app-color-border-default)] mx-0.5" />
          <FilterLabel>校区</FilterLabel>
          <FilterSelect value={areaName} onChange={setAreaName} options={filterOpts?.areaNames ?? []} placeholder="全部" />
          <FilterLabel>领用</FilterLabel>
          <FilterSelect value={consumeType} onChange={setConsumeType} options={filterOpts?.consumeTypes ?? []} placeholder="全部" />
          <FilterLabel>房间</FilterLabel>
          <FilterSelect value={room} onChange={setRoom} options={filterOpts?.rooms ?? []} placeholder="全部" />
          <MultiSelectDropdown options={allOrderStates} selected={orderStates} onToggle={toggleOrderState} onToggleAll={() => setOrderStates(isAllStates ? [] : [...allOrderStates])} />
          <button onClick={clearFilters} className="ml-auto text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)] shrink-0 inline-flex items-center gap-0.5">
            <RotateCcw className="h-3 w-3" />清除
          </button>
        </div>
      )}

      {/* content area: breadcrumb + chart, flex column.
           h-full works because CellCard's content div (flex-1) has a definite computed height. */}
      <div className="h-full flex flex-col">

      {/* breadcrumb — sticky, no background, underline style */}
      <div className="flex items-center gap-1 text-xs shrink-0 sticky top-16 z-10 bg-[var(--app-color-surface-container)] pt-2 mb-2 pb-2 border-b-2 border-[var(--app-color-accent-soft)]">
        <button
          onClick={() => { setDrillSupplier(""); setDrillStrain(""); }}
          className={cn(
            "font-bold transition border-b-2 -mb-[10px] pb-2",
            drillLevel === 0
              ? "text-[var(--app-color-accent)] border-[var(--app-color-accent)]"
              : "text-[var(--app-color-text-secondary)] border-transparent hover:text-[var(--app-color-accent-secondary)] hover:border-[var(--app-color-accent-secondary)]",
          )}>
          全部供应商
        </button>
        {drillSupplier && (
          <>
            <span className="text-[var(--app-color-text-tertiary)] mx-1">▸</span>
            <button
              onClick={() => setDrillStrain("")}
              className={cn(
                "font-bold transition border-b-2 -mb-[10px] pb-2",
                drillLevel === 1
                  ? "text-[var(--app-color-accent)] border-[var(--app-color-accent)]"
                  : "text-[var(--app-color-text-secondary)] border-transparent hover:text-[var(--app-color-accent-secondary)] hover:border-[var(--app-color-accent-secondary)]",
              )}>
              {drillSupplier}
            </button>
          </>
        )}
        {drillStrain && (
          <>
            <span className="text-[var(--app-color-text-tertiary)] mx-1">▸</span>
            <span className="font-bold text-[var(--app-color-accent)] border-b-2 border-[var(--app-color-accent)] -mb-[10px] pb-2">
              {drillStrain}
            </span>
          </>
        )}
        {isDeepest && (
          <span className="ml-2 text-[10px] text-[var(--app-color-feedback-warning)] font-semibold italic">
            已到最深层级
          </span>
        )}
      </div>

      {/* chart — flex-1 fills remaining space exactly, no calc() fractional pixels */}
      <div className="flex-1 min-h-0 w-full select-none overflow-hidden" tabIndex={-1} style={{ maxWidth: "100%" }}>
        {isLoading && !data ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">加载中…</div>
        ) : drillData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={drillData} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap={4}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: "var(--app-color-text-secondary)", textAnchor: "end" }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + "…" : v} />
              <Bar dataKey="totalQty" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false}
                activeBar={false}
                label={({ x, y, width, height, value, payload }: any) => {
                  const v = Number(value).toLocaleString();
                  const name = payload?.name;
                  return (
                    <g style={{ cursor: "pointer" }} onMouseDown={(e: any) => e.preventDefault()} onClick={() => handleDrillClick(name)}>
                      <text x={x + width + 4} y={y + height / 2} dominantBaseline="middle" fill="var(--app-color-text-primary)" fontSize={11} fontWeight={600} style={{ userSelect: "none", WebkitUserSelect: "none" }}>
                        <tspan>{v}</tspan>
                        <tspan fill="var(--app-color-accent-secondary)" fontSize={9} fontWeight={500}>{' 点击'}</tspan>
                      </text>
                    </g>
                  );
                }}
                onMouseDown={(e: any) => e.preventDefault()}
                onClick={(d: any) => handleDrillClick(d?.name)}>
                {drillData.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent" strokeWidth={0} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      </div>{/* /flex column wrapper */}
    </CellCard>
  );
}

/* ════════════════════ 左下：热力图 ════════════════════ */

function HeatmapCard() {
  const [startDate, setStartDate] = useState(() => daysAgoStr(30));
  const [endDate, setEndDate] = useState(() => todayStr());
  const [areaName, setAreaName] = useState("");
  const [consumeType, setConsumeType] = useState("");
  const [room, setRoom] = useState("");
  const [orderStates, setOrderStates] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<HeatmapGroupBy>("department");
  const [departmentName, setDepartmentName] = useState("");

  const { data: filterOpts } = useQuery({
    queryKey: ["order-analytics", "filters"],
    queryFn: fetchOrderAnalyticsFilterOptions,
    staleTime: 300_000,
  });

  const allOrderStates = filterOpts?.orderStates ?? [];

  useEffect(() => {
    if (allOrderStates.length > 0 && orderStates.length === 0) {
      setOrderStates([...allOrderStates]);
    }
  }, [allOrderStates]);

  const osKey = orderStates.join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["order-analytics", "heatmap", startDate, endDate, areaName, consumeType, room, osKey, departmentName],
    queryFn: () =>
      fetchOrderAnalyticsReport({
        startDate, endDate, areaName, consumeType, room, departmentName,
        orderStates: orderStates.length === allOrderStates.length ? undefined : orderStates,
      }),
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
  });

  const heatmapData = useMemo(() => {
    const rows = groupBy === "department" ? (data?.departmentStrain ?? []) : (data?.projectStrain ?? []);
    return buildHeatmapMatrix(rows, groupBy === "department" ? "departmentName" : "projectName");
  }, [data, groupBy]);

  const isAllStates = orderStates.length === allOrderStates.length;
  const clearFilters = useCallback(() => {
    setStartDate(daysAgoStr(30));
    setEndDate(todayStr());
    setAreaName("");
    setConsumeType("");
    setRoom("");
    setDepartmentName("");
    setOrderStates([...allOrderStates]);
  }, [allOrderStates]);
  const toggleOrderState = (s: string) => {
    setOrderStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const title = groupBy === "department" ? "院系 × 品系 热力图" : "课题组 × 品系 热力图";

  const [filterOpen, setFilterOpen] = useState(false);

  const headerActions = (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => setFilterOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent-secondary)] transition"
      >
        {filterOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        筛选
      </button>
      <div className="inline-flex rounded-md border border-[var(--app-color-border-default)] overflow-hidden shrink-0">
        <button type="button" onClick={() => setGroupBy("department")}
          className={cn("px-2 py-0.5 text-[10px] font-semibold border-r border-[var(--app-color-border-default)] transition",
            groupBy === "department" ? "bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]" : "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]")}>
          院系×品系
        </button>
        <button type="button" onClick={() => setGroupBy("project")}
          className={cn("px-2 py-0.5 text-[10px] font-semibold transition",
            groupBy === "project" ? "bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]" : "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]")}>
          课题组×品系
        </button>
      </div>
    </div>
  );

  return (
    <CellCard title={title} actions={headerActions}>
      {filterOpen && (
        <div className="shrink-0 sticky top-16 z-[15] flex flex-wrap items-center gap-1 px-5 py-1.5 bg-[var(--app-color-surface-container)] border-b border-[var(--app-color-border-default)]">
          <FilterLabel>日期</FilterLabel>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[110px] px-1.5 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[110px] px-1.5 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
          <span className="w-px h-4 bg-[var(--app-color-border-default)] mx-0.5" />
          <FilterLabel>院系</FilterLabel>
          <FilterSelect value={departmentName} onChange={setDepartmentName} options={filterOpts?.departments ?? []} placeholder="全部" />
          <FilterLabel>校区</FilterLabel>
          <FilterSelect value={areaName} onChange={setAreaName} options={filterOpts?.areaNames ?? []} placeholder="全部" />
          <FilterLabel>领用</FilterLabel>
          <FilterSelect value={consumeType} onChange={setConsumeType} options={filterOpts?.consumeTypes ?? []} placeholder="全部" />
          <FilterLabel>房间</FilterLabel>
          <FilterSelect value={room} onChange={setRoom} options={filterOpts?.rooms ?? []} placeholder="全部" />
          <MultiSelectDropdown options={allOrderStates} selected={orderStates} onToggle={toggleOrderState} onToggleAll={() => setOrderStates(isAllStates ? [] : [...allOrderStates])} />
          <button onClick={clearFilters} className="ml-auto text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)] shrink-0 inline-flex items-center gap-0.5">
            <RotateCcw className="h-3 w-3" />清除
          </button>
        </div>
      )}
      <div className="h-full overflow-auto pr-1 order-analytics-scroll [scrollbar-width:thin] [scrollbar-color:var(--app-color-border-default)_transparent]">
      {isLoading && !data ? (
        <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">加载中…</div>
      ) : heatmapData.rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">暂无数据</div>
      ) : (
        <table className="border-collapse text-[11px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-30 top-0 bg-[var(--app-color-surface-container)] px-2 py-1.5 text-left font-semibold text-[var(--app-color-text-secondary)] border-b border-[var(--app-color-border-default)]">
                {groupBy === "department" ? "院系\\品系" : "课题组\\品系"}
              </th>
              {heatmapData.cols.map((st) => (
                <th key={st} className="sticky top-0 z-20 bg-[var(--app-color-surface-container)] px-2 py-1.5 font-semibold text-[var(--app-color-text-secondary)] border-b border-[var(--app-color-border-default)] whitespace-nowrap">{st}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapData.rows.map((rn) => (
              <tr key={rn}>
                <td className="sticky left-0 z-10 bg-[var(--app-color-surface-container)] px-2 py-1.5 font-semibold text-[var(--app-color-text-secondary)] border-b border-[var(--app-color-border-default)] whitespace-nowrap">{rn}</td>
                {heatmapData.cols.map((st) => {
                  const v = heatmapData.matrix[rn]?.[st] ?? 0;
                  const allVals = Object.values(heatmapData.matrix[rn] ?? {}).filter(Number) as number[];
                  const maxV = Math.max(...allVals, 1);
                  const intensity = v / maxV;
                  return (
                    <td key={st} className="px-2 py-1.5 text-center font-medium border-b border-[var(--app-color-border-default)] whitespace-nowrap"
                      style={{ background: `color-mix(in srgb, var(--app-color-accent) ${Math.round(intensity * 90)}%, var(--app-color-surface-container))`, color: intensity > 0.6 ? "var(--app-color-text-inverse)" : "var(--app-color-text-primary)" }}>
                      {v > 0 ? v.toLocaleString() : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
    </CellCard>
  );
}

/* ════════════════════ 右上：PI 排名 ════════════════════ */

function PiRankingCard() {
  const [startDate, setStartDate] = useState(() => daysAgoStr(30));
  const [endDate, setEndDate] = useState(() => todayStr());
  const [areaName, setAreaName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [piName, setPiName] = useState("");
  const [consumeType, setConsumeType] = useState("");
  const [room, setRoom] = useState("");
  const [orderStates, setOrderStates] = useState<string[]>([]);

  const { data: filterOpts } = useQuery({
    queryKey: ["order-analytics", "filters"],
    queryFn: fetchOrderAnalyticsFilterOptions,
    staleTime: 300_000,
  });

  const allOrderStates = filterOpts?.orderStates ?? [];

  useEffect(() => {
    if (allOrderStates.length > 0 && orderStates.length === 0) {
      setOrderStates([...allOrderStates]);
    }
  }, [allOrderStates]);

  const osKey = orderStates.join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["order-analytics", "piranking", startDate, endDate, areaName, departmentName, piName, consumeType, room, osKey],
    queryFn: () =>
      fetchOrderAnalyticsReport({
        startDate, endDate, areaName, departmentName, piName, consumeType, room,
        orderStates: orderStates.length === allOrderStates.length ? undefined : orderStates,
      }),
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
  });

  const piGroups = useMemo(() => groupPiCollectors(data?.byPiCollectors ?? []), [data]);
  const isAllStates = orderStates.length === allOrderStates.length;
  const clearFilters = useCallback(() => {
    setStartDate(daysAgoStr(30));
    setEndDate(todayStr());
    setAreaName("");
    setDepartmentName("");
    setPiName("");
    setConsumeType("");
    setRoom("");
    setOrderStates([...allOrderStates]);
  }, [allOrderStates]);
  const toggleOrderState = (s: string) => {
    setOrderStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const filterBar = (
    <CollapsibleFilters>
      <FilterLabel>日期</FilterLabel>
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[100px] px-1 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[100px] px-1 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
      <span className="w-px h-4 bg-[var(--app-color-border-default)] mx-0.5" />
      <FilterLabel>院系</FilterLabel>
      <FilterSelect compact value={departmentName} onChange={setDepartmentName} options={filterOpts?.departments ?? []} placeholder="全部" />
      <FilterLabel>PI</FilterLabel>
      <FilterSelect compact value={piName} onChange={setPiName} options={filterOpts?.piNames ?? []} placeholder="全部" />
      <FilterLabel>校区</FilterLabel>
      <FilterSelect compact value={areaName} onChange={setAreaName} options={filterOpts?.areaNames ?? []} placeholder="全部" />
      <FilterLabel>领用</FilterLabel>
      <FilterSelect compact value={consumeType} onChange={setConsumeType} options={filterOpts?.consumeTypes ?? []} placeholder="全部" />
      <FilterLabel>房间</FilterLabel>
      <FilterSelect compact value={room} onChange={setRoom} options={filterOpts?.rooms ?? []} placeholder="全部" />
      <MultiSelectDropdown options={allOrderStates} selected={orderStates} onToggle={toggleOrderState} onToggleAll={() => setOrderStates(isAllStates ? [] : [...allOrderStates])} />
      <button onClick={clearFilters} className="ml-auto text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)] shrink-0 inline-flex items-center gap-0.5">
        <RotateCcw className="h-3 w-3" />清除
      </button>
    </CollapsibleFilters>
  );

  return (
    <CellCard title="课题组排名（点击展开）" filterBar={filterBar}>
      <div className="h-full overflow-y-auto pr-2 order-analytics-scroll [scrollbar-width:thin] [scrollbar-color:var(--app-color-border-default)_transparent]">
      {isLoading && !data ? (
        <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">加载中…</div>
      ) : piGroups.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">暂无数据</div>
      ) : (
        piGroups.slice(0, 15).map((g) => (
          <details key={g.piName} className="group">
            <summary className="flex cursor-pointer items-center gap-1.5 py-1 text-xs list-none">
              <span className="text-[10px] text-[var(--app-color-text-tertiary)] transition group-open:rotate-90 shrink-0">▶</span>
              <span className="shrink-0 text-left text-[11px] font-semibold text-[var(--app-color-text-secondary)]" style={{ width: "3.5em" }} title={g.piName}>{shortName(g.piName, 3)}</span>
              <div className="flex-1 h-1.5 rounded bg-[var(--app-color-accent-soft)] relative min-w-0">
                <div className="absolute inset-y-0 left-0 rounded bg-[var(--app-color-accent)]" style={{ width: `${Math.min((g.totalQty / (piGroups[0]?.totalQty || 1)) * 100, 100)}%` }} />
              </div>
              <span className="shrink-0 w-12 text-right text-[11px] font-bold text-[var(--app-color-text-primary)] pr-1">{g.totalQty.toLocaleString()}</span>
            </summary>
            <div className="ml-5 border-l-2 border-[var(--app-color-accent-soft)] pl-3 py-0.5">
              {g.collectors.sort((a, b) => Number(b.totalQty) - Number(a.totalQty)).map((c) => (
                <div key={c.collectorName} className="flex items-center gap-1.5 py-0.5">
                  <span className="shrink-0 text-left text-[10px] text-[var(--app-color-text-tertiary)]" style={{ width: "3em" }} title={c.collectorName}>{shortName(c.collectorName, 3)}</span>
                  <div className="flex-1 h-1 rounded bg-[var(--app-color-accent-soft)] min-w-0">
                    <div className="h-full rounded bg-[var(--app-color-accent-secondary)]" style={{ width: `${Math.min((Number(c.totalQty) / Number(g.collectors[0]?.totalQty || 1)) * 100, 100)}%` }} />
                  </div>
                  <span className="shrink-0 w-12 text-right text-[10px] font-semibold text-[var(--app-color-text-primary)] pr-1">{Number(c.totalQty).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </details>
        ))
      )}
      </div>
    </CellCard>
  );
}

/* ════════════════════ 右下：校区 + 性别 ════════════════════ */

function CampusGenderCard() {
  const [startDate, setStartDate] = useState(() => "2000-01-01");
  const [endDate, setEndDate] = useState(() => todayStr());
  const [areaName, setAreaName] = useState("");

  const { data: filterOpts } = useQuery({
    queryKey: ["order-analytics", "filters"],
    queryFn: fetchOrderAnalyticsFilterOptions,
    staleTime: 300_000,
  });

  const { data } = useQuery({
    queryKey: ["order-analytics", "campusgender", startDate, endDate, areaName],
    queryFn: () => fetchOrderAnalyticsReport({ startDate, endDate, areaName }),
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
  });

  const summary = data?.summary;
  const campusDonut = useMemo(() => {
    let male = 0, female = 0;
    if (summary) { male = Number(summary.totalMale) || 0; female = Number(summary.totalFemale) || 0; }
    return { puxi: 55, pudong: 45, male, female };
  }, [summary]);

  const filterBar = (
    <div className="flex flex-wrap items-center gap-1">
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[100px] px-1 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[100px] px-1 py-0.5 text-[10px] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]" />
      <FilterSelect compact value={areaName} onChange={setAreaName} options={filterOpts?.areaNames ?? []} placeholder="校区" />
    </div>
  );

  const OUTER_COLORS = ["#5B8CB8", "#E8926A"]; // 外圈·校区：钢蓝 / 暖陶
  const INNER_COLORS = ["#2E8B57", "#CD5C5C"]; // 内圈·性别：海绿♂ / 印度红♀

  return (
    <CellCard title="校区分布/雌雄比例" filterBar={filterBar}>
      <div className="w-full h-full relative">
        <ReactECharts
          style={{ height: "100%", width: "100%" }}
          option={{
            tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
            legend: {
              bottom: 0,
              textStyle: { fontSize: 10, color: "var(--app-color-text-secondary)" },
              itemWidth: 8, itemHeight: 8,
            },
            series: [
              {
                name: "校区", type: "pie",
                radius: ["55%", "78%"],
                center: ["50%", "43%"],
                itemStyle: { borderColor: "var(--app-color-surface-container)", borderWidth: 3, borderRadius: 4 },
                label: { show: true, position: "inside", fontSize: 10, color: "#fff", formatter: (p: any) => `${p.name}\n${Math.round(p.percent)}%` },
                emphasis: { disabled: true },
                data: [
                  { value: campusDonut.puxi, name: "浦西", itemStyle: { color: OUTER_COLORS[0] } },
                  { value: campusDonut.pudong, name: "浦东", itemStyle: { color: OUTER_COLORS[1] } },
                ],
              },
              {
                name: "性别", type: "pie",
                radius: ["25%", "48%"],
                center: ["50%", "43%"],
                itemStyle: { borderColor: "var(--app-color-surface-container)", borderWidth: 2, borderRadius: 3 },
                label: { show: true, position: "inside", fontSize: 10, color: "#fff", formatter: (p: any) => `${p.name}\n${Math.round(p.percent)}%` },
                emphasis: { disabled: true },
                data: [
                  { value: campusDonut.male, name: "♂ 雄", itemStyle: { color: INNER_COLORS[0] } },
                  { value: campusDonut.female, name: "♀ 雌", itemStyle: { color: INNER_COLORS[1] } },
                ],
              },
            ],
          }}
        />
      </div>
    </CellCard>
  );
}
