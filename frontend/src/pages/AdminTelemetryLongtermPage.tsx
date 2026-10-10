import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react";
import { AdminDataTableWrap, AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import { TelemetrySeriesChart } from "@/features/telemetry-insights/TelemetrySeriesChart";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatYmd,
  parseYmd,
  todayYmd,
} from "@/features/report-form/utils/datetimePickerCalendar";
import { AdminSelect } from "@/components/admin/AdminSelect";
import CageOpDrawer from "@/components/cage/CageOpDrawer";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import {
  exportLongtermPdf,
  exportLongtermXlsx,
  fetchLongtermCandidateBundles,
  fetchLongtermCandidates,
  fetchLongtermDays,
  fetchLongtermMatrix,
  fetchLongtermPlan,
  fetchLongtermVariables,
  saveLongtermVariables,
  type LongtermDayMatrix,
  type LongtermExportRequest,
  type LongtermMatrixRow,
  type LongtermVariable,
} from "@/api/domains/telemetryLongterm.api";

const inputDateClass =
  "rounded-twin-lg border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";

/** 与 automation-logs（自动化日志）页同一套紧凑控件口径：32px 高 */
const compactInputClass =
  "h-8 min-w-0 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const OUTCOME_ZH: Record<string, string> = { OK: "正常", SKIPPED: "跳过", FAILED: "失败" };

/** 单分区内候选变量一次渲染上限（分区本身已经把量收下来了，这里只是兜底）。 */
const CANDIDATE_RENDER_LIMIT = 200;

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtTime(v: unknown): string {
  const t = formatDateTimeAsiaShanghai(v);
  return t === "-" ? "—" : t;
}

function intervalText(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} 分钟`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} 分钟`;
  return `${seconds} 秒`;
}

/**
 * 曲线 PDF 的**打印视图**。
 *
 * <p>后端出 PDF 时会开无头浏览器导航到本页面，并先把打印参数写进 localStorage；
 * 页面据此只渲染「一天一页、一行两张」的 A4 版式，出完 PDF 那个浏览器上下文就关掉了。
 * 所以这段代码在正常使用时**永不进入**（没那个 key），也不影响页面本身的任何行为。
 */
const PRINT_SEED_KEY = "twin-longterm-print";

type PrintSeed = { days?: string[]; variables?: string[]; title?: string; exp?: number };

function readPrintSeed(): PrintSeed | null {
  try {
    const raw = localStorage.getItem(PRINT_SEED_KEY);
    if (!raw) {
      return null;
    }
    /*
     * **一次性消费**。这个 key 是后端出 PDF 时注入进来的，读完必须立刻删掉：
     * 留着的话，用户下次正常打开本页会直接落进打印视图 —— 而打印视图是 portal 到 body 的，
     * 屏幕上的主内容区就成了空白（实测踩到：看着像整个后台白屏）。
     * 带 exp 还兜住「写入后渲染超时、页面根本没读过」的残留。
     */
    localStorage.removeItem(PRINT_SEED_KEY);
    const parsed = JSON.parse(raw) as PrintSeed;
    if (!Array.isArray(parsed?.days) || parsed.days.length === 0) {
      return null;
    }
    if (typeof parsed.exp === "number" && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * A4 纵向；一天一页（break-after）。
 *
 * <p>**只藏不删是不够的**：`visibility:hidden` 不隐藏背景，后台壳的灰底会照印上去、卡片又是透明的，
 * 整页就发灰；而且打印根节点留在壳的 DOM 里时，`position:absolute` 是相对壳那一层解析的，内容会偏到右边。
 * 所以打印根节点用 portal 挂到 body 上，打印时把**其它所有节点 display:none**（连背景一起消失）。
 */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
.longterm-print-root { background: #fff; }
.longterm-print-day { break-after: page; page-break-after: always; }
.longterm-print-day:last-child { break-after: auto; page-break-after: auto; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(.longterm-print-root) { display: none !important; }
}
`;

/** 「最小 x / 最大 x」——写成 HTML 文字，保证进 PDF（图上的标注可能被导出丢掉） */
function extremeText(row: Pick<LongtermMatrixRow, "values">): string {
  const nums = row.values
    .map((v) => (v == null || v.trim() === "" ? Number.NaN : Number(v)))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 2) {
    return "";
  }
  return `最小 ${Math.min(...nums).toFixed(1)} / 最大 ${Math.max(...nums).toFixed(1)}`;
}

/** 一天一张曲线：横轴 = 槽位名义时间点，一行两张，每天另起一页 */
function PrintCurves({ seed, tables }: { seed: PrintSeed; tables: LongtermDayMatrix[] }) {
  const wanted = seed.variables ?? [];
  return createPortal(
    <div className="longterm-print-root bg-white text-black">
      <style>{PRINT_CSS}</style>
      {tables.map((t) => {
        const rows = wanted.length ? t.rows.filter((r) => wanted.includes(r.variableName)) : t.rows;
        return (
          <section key={t.day} className="longterm-print-day pt-1">
            <h1 className="text-[14px] font-bold">{t.day} 监测数据曲线</h1>
            <div className="mb-1 text-[10px] text-neutral-600">
              采样槽 {t.columns.length}/{t.slotCount} · 变量 {rows.length} 个
            </div>
            <div className="grid grid-cols-2 gap-3">
              {rows.map((r) => (
                <div key={r.variableName} className="break-inside-avoid rounded border border-neutral-300 bg-white p-2">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold">
                      {r.roomCanonical || r.displayLabel || r.variableName}
                      {r.unit ? <span className="ml-1 font-normal text-neutral-500">({r.unit})</span> : null}
                    </span>
                    <span className="shrink-0 text-[10px] text-neutral-500">{extremeText(r)}</span>
                  </div>
                  <TelemetrySeriesChart
                    points={seriesPoints(t, r)}
                    metricKind={r.metricKindCode ?? undefined}
                    yMinSpanRatio={2}
                    showExtremeLabels
                    height={112}
                    seriesLabel={r.displayLabel || r.variableName}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>,
    document.body
  );
}

/**
 * 曲线上的点：槽的**名义时间点** → 数值；非数值（OFF）与缺值给 null，图表自己断线。
 * 表格与打印视图共用同一份算法，免得两边画的曲线不一样。
 */
function seriesPoints(
  table: Pick<LongtermDayMatrix, "day" | "columns">,
  row: Pick<LongtermMatrixRow, "values">
) {
  return table.columns.map((c, i) => {
    const raw = row.values[i];
    const num = raw == null || raw.trim() === "" ? null : Number(raw);
    return { t: `${table.day}T${c.time}:00`, value: num != null && Number.isFinite(num) ? num : null };
  });
}

/**
 * 单元格显示值：数值取**一位小数**（原始串有 5 位小数，表格里读起来吵；导出仍是原始值）；
 * 非数值（如 OFF）原样、缺值显示破折号。
 */
function fmtCell(v: string | null): string {
  if (v == null || v.trim() === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : v;
}

/**
 * 一行里的最大/最小格（**自动高亮**，一眼看出当天极值落在哪个时刻）。
 * 少于两个不同的数值就不标 —— 只有一个值时标"最大"等于没标。
 */
function rowExtremes(values: (string | null)[]): { minIdx: number; maxIdx: number; distinct: boolean } {
  let min = Infinity;
  let max = -Infinity;
  let minIdx = -1;
  let maxIdx = -1;
  values.forEach((v, i) => {
    if (v == null || v.trim() === "") return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    if (n < min) {
      min = n;
      minIdx = i;
    }
    if (n > max) {
      max = n;
      maxIdx = i;
    }
  });
  return { minIdx, maxIdx, distinct: minIdx >= 0 && maxIdx >= 0 && min !== max };
}

/**
 * 变量行：左侧抓手拖拽排序（dnd-kit），右侧保留上移/下移/移除。
 * 拖拽用指针事件（鼠标 + 触摸同一套），与仓库其它排序列表（时段规则、侧栏管理）同一套做法。
 */
function SortableVariableRow({
  variable,
  index,
  count,
  onMove,
  onRemove,
  onToggleEnabled,
}: {
  variable: LongtermVariable;
  index: number;
  count: number;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  onToggleEnabled: (index: number, enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: variable.winccVariableName,
  });
  return (
    <tr
      ref={setNodeRef}
      /* 字号写在行上：`.twin-table` 里的 text-sm 会盖掉表级工具类，但盖不掉行自己的 */
      className="text-[11px]"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <td className="px-3 py-1 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            title="拖拽调整顺序"
            aria-label="拖拽调整顺序"
            className="cursor-grab text-[var(--twin-mute)] hover:text-[var(--twin-link)]"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono">{index + 1}</span>
        </div>
      </td>
      <td className="px-3 py-1 font-mono">{variable.winccVariableName}</td>
      <td className="px-3 py-1">{variable.displayLabel || "—"}</td>
      <td className="px-3 py-1">{variable.unit || "—"}</td>
      <td className="px-3 py-1 text-center">
        <AdminSwitchScaled
          size="3.5"
          checked={variable.enabled}
          onChange={(c) => onToggleEnabled(index, c)}
        />
      </td>
      <td className="px-3 py-1 text-right">
        <div className="flex justify-end gap-1">
          <AdminButton tone="secondary" size="sm" disabled={index === 0} onClick={() => onMove(index, -1)}>
            上移
          </AdminButton>
          <AdminButton tone="secondary" size="sm" disabled={index === count - 1} onClick={() => onMove(index, 1)}>
            下移
          </AdminButton>
          <AdminButton tone="secondary" size="sm" onClick={() => onRemove(index)}>
            移除
          </AdminButton>
        </div>
      </td>
    </tr>
  );
}

export default function AdminTelemetryLongtermPage() {
  const queryClient = useQueryClient();

  // 计划与间隔在定时管理页改，本页必须每次进来重取，否则用户看到的是 5 分钟前的旧值
  const { data: plan } = useQuery({
    queryKey: ["telemetryLongterm", "plan"] as const,
    queryFn: fetchLongtermPlan,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: variables = [] } = useQuery({
    queryKey: ["telemetryLongterm", "variables"] as const,
    queryFn: fetchLongtermVariables,
    staleTime: 0,
  });

  // 日历选**一天**：默认今天。只加载那一天 —— 整月一次性下发（31 天 × 二十几个变量 × 上百个槽）
  // 是实打实的数据压力，前后端都吃不消。
  const [day, setDay] = useState<string>(todayYmd());
  const [calOpen, setCalOpen] = useState(false);
  const [calYm, setCalYm] = useState(() => {
    const p = parseYmd(todayYmd());
    return { year: p?.year ?? 2026, month: p?.month ?? 1 };
  });
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [variableFilter, setVariableFilter] = useState("");

  // 明细按「天 × 槽」矩阵取：**一天一张表，行=变量、列=平分槽位**（列头带槽序号与名义时间点）
  const {
    data: matrix,
    isLoading: matrixLoading,
    error: matrixError,
    refetch: refetchMatrix,
  } = useQuery({
    queryKey: ["telemetryLongterm", "matrix", day] as const,
    queryFn: () => fetchLongtermMatrix({ day }),
    // 数据会被定时任务持续写入，也必须每次重取
    staleTime: 0,
  });

  // 日历上标「哪天有数据」
  const calMonthKey = `${calYm.year}-${String(calYm.month).padStart(2, "0")}`;
  const { data: daysWithData = [] } = useQuery({
    queryKey: ["telemetryLongterm", "days", calMonthKey] as const,
    queryFn: () => fetchLongtermDays({ month: calMonthKey }),
    staleTime: 0,
  });

  const saveVars = useMutation({
    mutationFn: (list: LongtermVariable[]) => saveLongtermVariables(list),
    onSuccess: () => {
      toast.success("已保存");
      void queryClient.invalidateQueries({ queryKey: ["telemetryLongterm", "variables"] });
      void queryClient.invalidateQueries({ queryKey: ["telemetryLongterm", "plan"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  /** 顺序变化一律「重排数组 → 按新下标写 sortOrder → 整份保存」。 */
  const saveOrdered = (list: LongtermVariable[]) =>
    saveVars.mutate(list.map((v, i) => ({ ...v, sortOrder: i })));

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= variables.length) return;
    const next = [...variables];
    [next[idx], next[j]] = [next[j], next[idx]];
    saveOrdered(next);
  };
  const remove = (idx: number) => saveOrdered(variables.filter((_, i) => i !== idx));
  const toggleEnabled = (idx: number, enabled: boolean) =>
    saveVars.mutate(variables.map((v, i) => (i === idx ? { ...v, enabled } : v)));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onVarDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = variables.findIndex((v) => v.winccVariableName === active.id);
    const to = variables.findIndex((v) => v.winccVariableName === over.id);
    if (from < 0 || to < 0) return;
    saveOrdered(arrayMove(variables, from, to));
  };

  // 设置弹窗：常用操作是「变量选择」，归档计划配好之后不必常看 → 默认收起
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  // 候选变量抽屉：先选**分区**（变量目录原本的导入分区），再列该分区的变量
  const [addOpen, setAddOpen] = useState(false);
  const [pickedBundle, setPickedBundle] = useState<string | null>(null);
  const [candidateKeyword, setCandidateKeyword] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { data: bundles = [] } = useQuery({
    queryKey: ["telemetryLongterm", "candidateBundles"] as const,
    queryFn: fetchLongtermCandidateBundles,
    enabled: addOpen,
    staleTime: 0,
  });
  const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
    queryKey: ["telemetryLongterm", "candidates", pickedBundle, candidateKeyword] as const,
    queryFn: () =>
      fetchLongtermCandidates({ bundle: pickedBundle || undefined, keyword: candidateKeyword || undefined }),
    enabled: addOpen && !!pickedBundle,
    staleTime: 0,
  });
  const openAdd = () => {
    setChecked(new Set());
    setCandidateKeyword("");
    setPickedBundle(null);
    setAddOpen(true);
  };
  const toggleCandidate = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const confirmAdd = () => {
    const existingNames = new Set(variables.map((v) => v.winccVariableName));
    const toAdd: LongtermVariable[] = candidates
      .filter((c) => checked.has(c.winccVariableName) && !existingNames.has(c.winccVariableName))
      .map((c) => ({
        winccVariableName: c.winccVariableName,
        sortOrder: 0,
        displayLabel: c.displayLabel,
        unit: null,
        enabled: true,
        floorCode: c.floorCode,
        roomCanonical: c.roomCanonical,
        metricKindCode: c.metricKindCode,
      }));
    setAddOpen(false);
    if (toAdd.length === 0) return;
    saveOrdered([...variables, ...toAdd]);
  };

  // 导出抽屉：形式（表格 / 曲线）+ **日历点选时间范围**（不选不允许导出）
  const [exportOpen, setExportOpen] = useState(false);
  const [exportForm, setExportForm] = useState<"TABLE" | "CURVE">("TABLE");
  const [exportLayout, setExportLayout] = useState<"LONG" | "WIDE">("LONG");
  const [exportDays, setExportDays] = useState<string[]>([]);
  const openExport = () => {
    setExportForm("TABLE");
    setExportLayout("LONG");
    setExportDays([day]); // 默认就是当前看的那天；可以在日历上再多点几天
    // 日历先定位到当前查看那天所在的月份
    const p = parseYmd(day);
    if (p) setCalYm({ year: p.year, month: p.month });
    setExportOpen(true);
  };
  const toggleExportDay = (d: string) =>
    setExportDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  /** 文件名主干：单天就是那天，多天用 ~ 连接两端（与后端命名口径一致） */
  const exportStem = () => {
    if (exportDays.length === 0) return day;
    const sorted = [...exportDays].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return first === last ? first : `${first}~${last}`;
  };
  const buildExportReq = (): LongtermExportRequest => ({
    form: exportForm,
    layout: exportLayout,
    // 不勾变量：一律导出全部已选变量（空数组 = 全部，后端同口径）
    variableNames: [],
    // 时间范围必填：后端也卡（未选直接 400）
    days: exportDays,
  });
  const exportM = useMutation({
    mutationFn: () =>
      exportForm === "CURVE" ? exportLongtermPdf(buildExportReq()) : exportLongtermXlsx(buildExportReq()),
    onSuccess: (blob) => {
      const suffix = exportForm === "CURVE" ? "监测数据曲线图.pdf" : "监测数据表格.xlsx";
      downloadBlob(blob, `${exportStem()}${suffix}`);
      toast.success("已导出");
      setExportOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "导出失败"),
  });

  const runs = plan?.recentRuns ?? [];
  /** 只加载选中那一天，所以最多一张表 */
  const dayTable = matrix?.dayTables?.[0] ?? null;
  /** 变量筛选是**行筛选**：矩阵本身已经把所有变量都列出来了 */
  const visibleRows = dayTable
    ? variableFilter
      ? dayTable.rows.filter((r) => r.variableName === variableFilter)
      : dayTable.rows
    : [];

  const shiftDay = (delta: number) => {
    const p = parseYmd(day);
    if (!p) return;
    const d = new Date(p.year, p.month - 1, p.day + delta);
    setDay(formatYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  };
  const shiftCalMonth = (delta: number) =>
    setCalYm((prev) => {
      const d = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  /** 当前这天的曲线点（算法与打印视图共用同一份） */
  const seriesPointsOf = (row: LongtermMatrixRow) => (dayTable ? seriesPoints(dayTable, row) : []);
  const pickedBundleName = bundles.find((b) => b.code === pickedBundle)?.displayName || pickedBundle;

  // ===== 打印视图（只有后端出 PDF 时才会走到；正常使用 localStorage 里没那个 key，永不进入）=====
  const [printSeed] = useState<PrintSeed | null>(() => readPrintSeed());
  const printSortedDays = [...(printSeed?.days ?? [])].sort();
  const printFrom = printSortedDays.length ? `${printSortedDays[0]}T00:00:00` : null;
  const printTo = printSortedDays.length ? `${printSortedDays[printSortedDays.length - 1]}T23:59:59` : null;
  const { data: printMatrix } = useQuery({
    queryKey: ["telemetryLongterm", "printMatrix", printFrom, printTo] as const,
    queryFn: () => fetchLongtermMatrix({ from: printFrom as string, to: printTo as string }),
    enabled: !!printFrom && !!printTo,
    staleTime: 0,
  });
  const printTables = (printMatrix?.dayTables ?? []).filter((t) => (printSeed?.days ?? []).includes(t.day));
  useEffect(() => {
    if (!printSeed || !printMatrix) {
      return;
    }
    // 举手告诉后端「打印视图就绪」——它在等这个标志；给一帧让 recharts 把图画完
    const id = window.setTimeout(() => {
      (window as unknown as { __longtermPrintReady?: boolean }).__longtermPrintReady = true;
    }, 400);
    return () => window.clearTimeout(id);
  }, [printSeed, printMatrix]);

  if (printSeed) {
    return <PrintCurves seed={printSeed} tables={printTables} />;
  }

  return (
    <AdminPageShell>
      {/* relative：设置面板绝对定位在这一层里 —— 遮罩只覆盖本页内容区，不会盖住左侧入口栏 */}
      {/* h- 而不是 max-h-：定高才能让下方的表卡**撑满剩余高度**（max-h 会随内容收缩，
          数据少时底部留一大片空白）；pb-3 是底部留出的间隙。 */}
      <div className="relative flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px] flex-col pb-3">
        {/* ═══ 第一层：标题 + 筛选（照 automation-logs 的范式：标题行右侧放操作按钮，紧凑 h-8 控件） ═══ */}
        <AdminFormCard className="mb-3 shrink-0">
          {/* 标题 / 日期 / 变量筛选 / 操作按钮**同一行**：省下来的那一行高度全给表格
              （控件自带语义：日期有日历图标、下拉显示「全部变量」，不再各占一行配小标题） */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="shrink-0 text-base font-bold text-[var(--app-color-text-primary)]">数据监测</h2>
            {/* 日历选一天：**只加载那一天**（整月下发是数据压力），带圆点的表示那天有数据 */}
            <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label="选择日期"
                  aria-expanded={calOpen}
                  onClick={() => {
                    const p = parseYmd(day);
                    if (p) setCalYm({ year: p.year, month: p.month });
                    setCalOpen((v) => !v);
                  }}
                  className={`${compactInputClass} flex items-center gap-2 text-left font-mono`}
                >
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  {day}
                </button>
              {calOpen && (
                <div className="absolute left-0 top-full z-40 mt-1 w-[268px] rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 shadow-twin-level-4">
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      type="button"
                      aria-label="上个月"
                      onClick={() => shiftCalMonth(-1)}
                      className="rounded p-1 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-semibold text-[var(--twin-ink)]">
                      {calYm.year} 年 {calYm.month} 月
                    </span>
                    <button
                      type="button"
                      aria-label="下个月"
                      onClick={() => shiftCalMonth(1)}
                      className="rounded p-1 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-[11px]">
                    {WEEKDAY_LABELS.map((w) => (
                      <div key={w} className="py-0.5 text-center text-[var(--twin-mute)]">
                        {w}
                      </div>
                    ))}
                    {buildMonthGrid(calYm.year, calYm.month).map((d, i) => {
                      if (d === null) return <div key={`pad-${i}`} />;
                      const ymd = formatYmd(calYm.year, calYm.month, d);
                      const has = daysWithData.includes(ymd);
                      const selected = ymd === day;
                      return (
                        <button
                          key={ymd}
                          type="button"
                          onClick={() => {
                            setDay(ymd);
                            setCalOpen(false);
                          }}
                          className={`relative rounded-twin-sm py-1 text-center transition-colors ${
                            selected
                              ? "bg-[var(--app-color-primary,#2563eb)] text-white"
                              : "hover:bg-[var(--twin-canvas-soft)]"
                          } ${!has && !selected ? "text-[var(--twin-mute)]" : ""}`}
                        >
                          {d}
                          {has && (
                            <span
                              className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                                selected ? "bg-white" : "bg-[var(--twin-link)]"
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[var(--twin-hairline)] pt-2">
                    <AdminButton tone="secondary" size="sm" onClick={() => shiftDay(-1)}>
                      前一天
                    </AdminButton>
                    <span className="text-[10px] text-[var(--twin-mute)]">带圆点 = 那天有数据</span>
                    <AdminButton tone="secondary" size="sm" onClick={() => shiftDay(1)}>
                      后一天
                    </AdminButton>
                  </div>
                </div>
              )}
            </div>
            <AdminSelect
              aria-label="按变量筛选"
              className="h-8 w-[13rem] shrink-0 px-2 text-xs"
              value={variableFilter}
              onChange={(e) => setVariableFilter(e.target.value)}
            >
              <option value="">全部变量</option>
              {(dayTable?.rows ?? variables.map((v) => ({ variableName: v.winccVariableName, roomCanonical: null, displayLabel: v.displayLabel }))).map(
                (r) => (
                  <option key={r.variableName} value={r.variableName}>
                    {r.roomCanonical || r.displayLabel || r.variableName}
                  </option>
                )
              )}
            </AdminSelect>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <AdminSegmentedControl
                size="sm"
                aria-label="切换表现形式"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "table", label: "表格" },
                  { value: "chart", label: "曲线" },
                ]}
              />
              <AdminButton tone="secondary" size="sm" className="h-8 px-3 text-xs" onClick={() => setSettingsOpen(true)}>
                设置
              </AdminButton>
              <AdminButton tone="secondary" size="sm" className="h-8 px-3 text-xs" onClick={() => void refetchMatrix()}>
                刷新
              </AdminButton>
              <AdminButton tone="primary" size="sm" className="h-8 px-3 text-xs" onClick={openExport}>
                导出
              </AdminButton>
            </div>
          </div>
        </AdminFormCard>

        {/* ═══ 第二层：表卡（单个双轴滚动区 + 底部信息条，照 automation-logs 的范式） ═══ */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
          <div className="min-h-0 flex-1 overflow-auto">
            {matrixLoading ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">
                加载中…
              </div>
            ) : matrixError ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-sm text-[var(--app-color-feedback-error)]">
                <p>归档数据加载失败</p>
                <AdminButton tone="secondary" size="sm" className="h-8 px-3 text-xs" onClick={() => void refetchMatrix()}>
                  重试
                </AdminButton>
              </div>
            ) : !dayTable ? (
              <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">
                {day} 没有采样数据
              </div>
            ) : viewMode === "chart" ? (
              /* 曲线：每个变量一张小多图，复用环境监测那套标准图表（合规区间/参考线都现成） */
              <div className="grid grid-cols-1 gap-3 p-3 xl:grid-cols-2">
                {visibleRows.map((r) => (
                  <div key={r.variableName} className="rounded-twin-lg border border-[var(--twin-hairline)] p-2">
                    <div
                      className="mb-1 truncate text-[11px] font-semibold text-[var(--twin-ink)]"
                      title={r.displayLabel || r.variableName}
                    >
                      {r.displayLabel || r.variableName}
                      {r.unit ? <span className="ml-1 font-normal text-[var(--twin-mute)]">({r.unit})</span> : null}
                    </div>
                    <TelemetrySeriesChart
                      points={seriesPointsOf(r)}
                      metricKind={r.metricKindCode ?? undefined}
                      /* 纵轴至少铺满「合规区间的两倍」：一天内的波动本来就小，
                         贴紧数据画会把几度的差异放大成剧烈起伏 */
                      yMinSpanRatio={2}
                      showExtremeLabels
                      height={170}
                      seriesLabel={r.displayLabel || r.variableName}
                    />
                  </div>
                ))}
                {visibleRows.length === 0 && (
                  <p className="py-6 text-center text-xs text-[var(--twin-mute)]">这一天没有该变量的数据</p>
                )}
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs twin-table">
                <thead className="sticky top-0 z-[3] border-b-2 border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-hover)] shadow-[var(--app-elevation-card)]">
                  <tr className="h-9 font-bold text-[var(--app-color-text-secondary)]">
                    {/* 变量列：**不换行、不截断**（名字要显示完整），列宽随内容自适应到 360px 上限；
                        行高由行上的 h-9 定死，单元格 align-middle 保证垂直居中 —— 名字长的行不会再被顶高。 */}
                    <th className="w-[240px] min-w-[240px] max-w-[360px] whitespace-nowrap px-2 py-1.5 text-center">房间</th>
                    {dayTable.columns.map((c) => (
                      <th key={c.slot} className="w-[72px] px-2 py-1.5 whitespace-nowrap text-center">
                        {/* 槽序号弱化、**时间点用主色加粗**：表头继承的是 tertiary 灰，
                            一屏扫下来根本看不出几点，得把时间单独拎出来。 */}
                        <span className="font-mono text-[var(--app-color-text-tertiary)]">#{c.slot}</span>
                        <span className="ml-1 font-semibold text-[var(--app-color-text-primary)]">{c.time}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const ext = rowExtremes(r.values);
                    return (
                      <tr key={r.variableName} className="h-9 border-b hover:bg-[var(--twin-canvas-soft)]">
                        <td
                          className="w-[240px] min-w-[240px] max-w-[360px] whitespace-nowrap px-2 py-1.5 text-center"
                          title={`${r.roomCanonical || r.displayLabel || r.variableName}\n${r.variableName}`}
                        >
                          {/* 显示的是**变量映射的房间**（用户看的是「哪个房间的温湿度」）；
                              变量名只在 title 里留一份便于追溯 */}
                          {r.roomCanonical || r.displayLabel || r.variableName}
                          {r.unit ? <span className="ml-1 text-[10px] text-[var(--twin-mute)]">({r.unit})</span> : null}
                        </td>
                        {r.values.map((v, i) => {
                          const isMax = ext.distinct && i === ext.maxIdx;
                          const isMin = ext.distinct && i === ext.minIdx;
                          return (
                            <td
                              key={i}
                              title={isMax ? "该行最大" : isMin ? "该行最小" : undefined}
                              className={`px-2 py-1.5 text-center font-mono ${
                                isMax
                                  ? "bg-[var(--app-color-feedback-warning-soft)] font-semibold text-[var(--app-color-feedback-warning)]"
                                  : isMin
                                    ? "bg-[var(--app-color-feedback-info-soft)] font-semibold text-[var(--app-color-feedback-info)]"
                                    : ""
                              }`}
                            >
                              {fmtCell(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={dayTable.columns.length + 1}
                        className="px-2 py-6 text-center text-[var(--twin-mute)]"
                      >
                        这一天没有该变量的数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--app-color-border-default)] px-3 py-2 text-sm">
            <span className="text-xs text-[var(--app-color-text-tertiary)]">
              {day}
              {dayTable
                ? ` · 变量 ${visibleRows.length} 个 · 采样槽 ${dayTable.columns.length}/${dayTable.slotCount} · 列头 = 槽序号 + 该槽名义时间点`
                : ""}
            </span>
            <span className="text-xs text-[var(--app-color-text-tertiary)]">
              {viewMode === "chart" ? "曲线视图" : "表格视图"}
            </span>
          </div>
        </div>
      </div>

      {/* 设置面板：**主体是变量选择**（常用操作），归档计划收成一行、点开才看。
          **锚在本页内容区**（absolute 于上面那层 relative），遮罩不覆盖左侧入口栏。 */}
      {settingsOpen && (
        <div
          role="presentation"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="归档设置"
            className="flex h-[min(78vh,720px)] max-h-full w-full max-w-[min(980px,100%)] flex-col overflow-hidden rounded-[var(--app-radius-container,16px)] border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[var(--twin-ink)]">归档设置</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="ml-auto text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                title="关闭"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
              {/* ── 归档计划：收成一行摘要，点开才看细节与留痕 ── */}
              <div className="mb-3 shrink-0 rounded-twin-md border border-[var(--twin-hairline)]">
                <button
                  type="button"
                  onClick={() => setPlanOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  aria-expanded={planOpen}
                >
                  {planOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-[var(--twin-mute)]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--twin-mute)]" />
                  )}
                  <span className="text-xs font-semibold text-[var(--twin-ink)]">归档计划</span>
                  <span className="truncate text-xs text-[var(--twin-mute)]">
                    {plan
                      ? `${plan.scheduleEnabled ? "已启用" : "未启用"} · 间隔 ${intervalText(plan.pollIntervalSeconds)} · ${
                          plan.scheduleStartTime ? `${plan.scheduleStartTime}~${plan.scheduleEndTime ?? "—"}` : "—"
                        } · 累计 ${plan.sampleRows} 行`
                      : "正在读取归档计划…"}
                  </span>
                </button>
                {planOpen && (
                  <div className="border-t border-[var(--twin-hairline)] px-3 py-2">
                    <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                      <span>
                        已选变量数：<span className="font-mono">{plan?.variableCount ?? "—"}</span>
                      </span>
                      <span>
                        累计样本行数：<span className="font-mono">{plan?.sampleRows ?? "—"}</span>
                      </span>
                      <AdminButton
                        tone="secondary"
                        size="sm"
                        onClick={() => window.open("/#/console/admin/settings/scheduler", "_blank")}
                      >
                        去定时管理调整
                      </AdminButton>
                    </div>
                    <div className="text-xs font-medium text-[var(--twin-body)]">最近若干轮采集留痕</div>
                    <AdminDataTableWrap className="mt-2">
                      <table className="min-w-full text-xs twin-table">
                        <thead>
                          <tr>
                            <th>时间</th>
                            <th>结果</th>
                            <th className="text-center">写入行数</th>
                            <th>说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.map((r, i) => (
                            <tr key={`${r.runAt}-${i}`}>
                              <td className="whitespace-nowrap px-3 py-2 font-mono">{fmtTime(r.runAt)}</td>
                              <td className="px-3 py-2">{OUTCOME_ZH[r.outcome] ?? r.outcome}</td>
                              <td className="px-3 py-2 text-center font-mono">{r.rowsWritten}</td>
                              <td className="px-3 py-2">{r.reason || "—"}</td>
                            </tr>
                          ))}
                          {runs.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-[var(--twin-mute)]">
                                暂无采集记录
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </AdminDataTableWrap>
                  </div>
                )}
              </div>

              {/* ── 变量选择：弹窗主体，占满剩余高度、表格内部滚动（变量多了也不会把弹窗撑爆） ── */}
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex shrink-0 items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--twin-ink)]">
                    变量选择（{variables.length}）
                    <span className="ml-2 font-normal text-[var(--twin-mute)]">
                      拖拽左侧抓手或上移/下移调整顺序 —— 顺序即宽表导出的列序
                    </span>
                  </span>
                  <AdminButton tone="primary" size="sm" onClick={openAdd}>
                    加入变量
                  </AdminButton>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <AdminDataTableWrap>
                    <table className="min-w-full text-[11px] twin-table">
                      <thead>
                        <tr>
                          <th className="text-center">顺序</th>
                          <th>变量名</th>
                          <th>显示标签</th>
                          <th>单位</th>
                          <th className="text-center">启用</th>
                          <th className="text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={onVarDragEnd}
                          /* 拖着往上下边缘靠时自动加速滚动 —— 变量多了要能边拖边快速翻 */
                          autoScroll={{ acceleration: 12, threshold: { x: 0.2, y: 0.15 } }}
                        >
                          <SortableContext
                            items={variables.map((v) => v.winccVariableName)}
                            strategy={verticalListSortingStrategy}
                          >
                            {variables.map((v, i) => (
                              <SortableVariableRow
                                key={v.winccVariableName}
                                variable={v}
                                index={i}
                                count={variables.length}
                                onMove={move}
                                onRemove={remove}
                                onToggleEnabled={toggleEnabled}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                        {variables.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-[var(--twin-mute)]">
                              还没有选择变量，点「加入变量」开始
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </AdminDataTableWrap>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 候选变量抽屉：用笼架页那套通用右侧抽屉壳（CageOpDrawer）。
          变量目录有五千多个点位，**先按分区加载**：第一步选分区，第二步列该分区的变量。
          从设置弹窗里打开，层级必须高过弹窗遮罩，否则点不到。 */}
      {addOpen && (
        <CageOpDrawer
          title="加入变量"
          hint={
            pickedBundle
              ? `分区：${pickedBundleName ?? pickedBundle}`
              : "变量目录按导入分区分组，先选一个分区再挑变量"
          }
          countText={`已勾选 ${checked.size}`}
          collapseLabel="加入变量"
          onClose={() => setAddOpen(false)}
          zIndex={900}
          width={560}
          footer={
            <div className="flex justify-end gap-2">
              <AdminButton tone="secondary" onClick={() => setAddOpen(false)}>
                取消
              </AdminButton>
              <AdminButton tone="primary" loading={saveVars.isPending} onClick={confirmAdd}>
                加入
              </AdminButton>
            </div>
          }
        >
          {!pickedBundle ? (
            <div className="space-y-1">
              {bundles.length === 0 && <p className="text-xs text-[var(--twin-mute)]">变量目录里还没有分区</p>}
              {bundles.map((b) => (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => setPickedBundle(b.code)}
                  className="flex w-full items-center justify-between rounded-twin-md px-3 py-2 text-left text-sm hover:bg-[var(--twin-canvas-soft)]"
                >
                  <span className="truncate">{b.displayName}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-[var(--twin-mute)]">{b.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setPickedBundle(null);
                    setCandidateKeyword("");
                  }}
                  className="text-xs text-[var(--twin-link)] hover:underline"
                >
                  ← 换分区
                </button>
                <span className="truncate text-xs text-[var(--twin-mute)]">{pickedBundleName ?? pickedBundle}</span>
              </div>
              <input
                className={`${inputDateClass} w-full`}
                placeholder="按变量名 / 标签搜索…"
                value={candidateKeyword}
                onChange={(e) => setCandidateKeyword(e.target.value)}
              />
              <div className="space-y-1">
                {candidatesLoading && <p className="text-xs text-[var(--twin-mute)]">加载中…</p>}
                {!candidatesLoading && candidates.length === 0 && (
                  <p className="text-xs text-[var(--twin-mute)]">该分区下没有匹配的变量</p>
                )}
                {candidates.slice(0, CANDIDATE_RENDER_LIMIT).map((c) => (
                  <label
                    key={c.winccVariableName}
                    className={`flex items-center gap-2 rounded-twin-md px-2 py-1.5 text-sm ${
                      c.selected ? "opacity-60" : ""
                    }`}
                  >
                    {c.selected ? (
                      <span className="text-xs text-[var(--twin-mute)]">已加入</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={checked.has(c.winccVariableName)}
                        onChange={() => toggleCandidate(c.winccVariableName)}
                      />
                    )}
                    <span className="font-mono text-xs">{c.winccVariableName}</span>
                    {c.displayLabel && <span className="truncate text-xs text-[var(--twin-mute)]">{c.displayLabel}</span>}
                  </label>
                ))}
                {!candidatesLoading && candidates.length > CANDIDATE_RENDER_LIMIT && (
                  <p className="text-xs text-[var(--twin-mute)]">
                    还有 {candidates.length - CANDIDATE_RENDER_LIMIT} 条未列出 —— 输入关键词收窄
                  </p>
                )}
              </div>
            </div>
          )}
        </CageOpDrawer>
      )}

      {/* 导出：**内容自适应的居中弹层**。右侧抽屉是固定全高，内容少时下方会空一大片 */}
      {exportOpen && (
        <div
          role="presentation"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setExportOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="导出数据"
            className="flex max-h-full w-full max-w-[min(560px,100%)] flex-col overflow-hidden rounded-[var(--app-radius-container,16px)] border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[var(--twin-ink)]">导出数据</span>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="ml-auto text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                title="关闭"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {/* 顶部一行集成「形式 + 布局」：布局只在表格形式下出现，不单独占一行 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs font-medium text-[var(--twin-body)]">形式</span>
                <AdminSegmentedControl
                  size="sm"
                  aria-label="选择导出形式"
                  value={exportForm}
                  onChange={setExportForm}
                  options={[
                    { value: "TABLE", label: "表格" },
                    { value: "CURVE", label: "曲线" },
                  ]}
                />
                {exportForm === "TABLE" && (
                  <>
                    <span className="ml-2 text-xs font-medium text-[var(--twin-body)]">布局</span>
                    <AdminSegmentedControl
                      size="sm"
                      aria-label="选择表格布局"
                      value={exportLayout}
                      onChange={setExportLayout}
                      options={[
                        { value: "LONG", label: "长表" },
                        { value: "WIDE", label: "宽表" },
                      ]}
                    />
                  </>
                )}
              </div>
              <p className="text-[11px] text-[var(--twin-mute)]">
                {exportForm === "CURVE"
                  ? "曲线出 A4 纵向 PDF：一天一页、一行两张，多天合到一份文件里"
                  : exportLayout === "WIDE"
                    ? "宽表 Excel：一行一个时间点、变量一列；多天按天分段上下堆叠"
                    : "长表 Excel：一行一条采样；多天连成一张表、多一列「日期」从上往下排"}
              </p>

            {/* 时间范围：**日历点选**（点中的高亮）；必选 —— 不选不允许导出 */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--twin-body)]">
                  时间范围（可多选）<span className="text-[var(--app-color-feedback-danger)]">*</span>
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-[11px] text-[var(--twin-link)] hover:underline"
                    onClick={() => setExportDays([...daysWithData].sort())}
                  >
                    本月全选
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-[var(--twin-link)] hover:underline"
                    onClick={() => setExportDays([])}
                  >
                    清空
                  </button>
                </span>
              </div>
              <div className="rounded-twin-md border border-[var(--twin-hairline)] p-2">
                <div className="mb-1 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="上个月"
                    onClick={() => shiftCalMonth(-1)}
                    className="rounded p-1 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-semibold text-[var(--twin-ink)]">
                    {calYm.year} 年 {calYm.month} 月
                  </span>
                  <button
                    type="button"
                    aria-label="下个月"
                    onClick={() => shiftCalMonth(1)}
                    className="rounded p-1 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-[11px]">
                  {WEEKDAY_LABELS.map((w) => (
                    <div key={w} className="py-0.5 text-center text-[var(--twin-mute)]">
                      {w}
                    </div>
                  ))}
                  {buildMonthGrid(calYm.year, calYm.month).map((d, i) => {
                    if (d === null) return <div key={`ep-${i}`} />;
                    const ymd = formatYmd(calYm.year, calYm.month, d);
                    const has = daysWithData.includes(ymd);
                    const selected = exportDays.includes(ymd);
                    return (
                      <button
                        key={ymd}
                        type="button"
                        disabled={!has}
                        onClick={() => toggleExportDay(ymd)}
                        title={has ? (selected ? "点击取消" : "点击选中") : "那天没有数据"}
                        className={`relative rounded-twin-sm py-1 text-center transition-colors ${
                          selected
                            ? "bg-[var(--app-color-primary,#2563eb)] font-semibold text-white"
                            : has
                              ? "hover:bg-[var(--twin-canvas-soft)]"
                              : "cursor-not-allowed text-[var(--twin-mute)] opacity-40"
                        }`}
                      >
                        {d}
                        {has && (
                          <span
                            className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                              selected ? "bg-white" : "bg-[var(--twin-link)]"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-[var(--twin-mute)]">
                {exportDays.length === 0 ? "未选择（不选不允许导出）" : `已选 ${exportDays.length} 天：${exportStem()}`}
              </p>
            </div>

            </div>
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-4 py-2.5">
              <span className="text-[11px] text-[var(--twin-mute)]">
                {exportDays.length === 0 ? "请先选择时间范围" : `已选 ${exportDays.length} 天 · ${exportStem()}`}
              </span>
              <div className="flex gap-2">
                <AdminButton tone="secondary" onClick={() => setExportOpen(false)}>
                  取消
                </AdminButton>
                <AdminButton
                  tone="primary"
                  loading={exportM.isPending}
                  disabled={exportDays.length === 0}
                  onClick={() => exportM.mutate()}
                >
                  {exportForm === "CURVE" ? "导出 PDF" : "导出 Excel"}
                </AdminButton>
              </div>
            </footer>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
