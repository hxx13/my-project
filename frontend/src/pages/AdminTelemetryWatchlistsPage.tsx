import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createTelemetryMetricKind,
  deleteTelemetryMetricKind,
  deleteTelemetryWatchlist,
  getTelemetryGlobalAlarmLimits,
  importTelemetryWatchlistCsvFileQuick,
  listTelemetryMetricKinds,
  listTelemetryWatchlistTagsAll,
  listTelemetryWatchlistZonesWithTags,
  putTelemetryGlobalAlarmLimits,
  replaceTelemetryWatchlistTags,
  setTelemetryWatchlistPollEnabled,
  updateTelemetryMetricKind,
  type TelemetryGlobalAlarmLimits,
  type TelemetryMetricKind,
  type TelemetryWatchlistTag,
  type TelemetryWatchlistZone,
} from "@/api/domains/telemetryWatchlistAdmin.api";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Gauge,
  Link2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { inferStructuredFromDisplayMapping } from "@/utils/telemetryWatchlistAutofill";
import { isWinccLimitSuffixVariable } from "@/utils/telemetryWatchlistLimitNaming";
import {
  applyMatchedLimitsAutoEnable,
  buildWatchlistManagementGroupsStable,
  canEnableWithoutDisplayMapping,
  sortTagsByManagementTreeOrderDesc,
} from "@/utils/watchlistTagManagementTree";
import { TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX } from "@/api/telemetryApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

const ZONES_KEY = ["telemetry", "watchlists", "zones-with-tags"] as const;
const METRIC_KINDS_KEY = ["telemetry", "watchlists", "metric-kinds"] as const;
const GLOBAL_LIMITS_KEY = ["telemetry", "watchlists", "global-alarm-limits"] as const;

function emptyGlobalLimits(): TelemetryGlobalAlarmLimits {
  return {
    tempMin: "",
    tempMax: "",
    humMin: "",
    humMax: "",
    pressureMin: "",
    pressureMax: "",
  };
}

function GlobalAlarmLimitsPanel({ queryClient }: { queryClient: QueryClient }) {
  const limitsQ = useQuery({
    queryKey: GLOBAL_LIMITS_KEY,
    queryFn: getTelemetryGlobalAlarmLimits,
    staleTime: 30_000,
  });
  const [draft, setDraft] = useState<TelemetryGlobalAlarmLimits>(() => emptyGlobalLimits());

  useEffect(() => {
    if (!limitsQ.data) return;
    setDraft({
      tempMin: limitsQ.data.tempMin ?? "",
      tempMax: limitsQ.data.tempMax ?? "",
      humMin: limitsQ.data.humMin ?? "",
      humMax: limitsQ.data.humMax ?? "",
      pressureMin: limitsQ.data.pressureMin ?? "",
      pressureMax: limitsQ.data.pressureMax ?? "",
    });
  }, [limitsQ.data]);

  const saveM = useMutation({
    mutationFn: () => putTelemetryGlobalAlarmLimits(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: GLOBAL_LIMITS_KEY });
      void queryClient.invalidateQueries({ queryKey: [...TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX] });
      toast.success("全局报警限已保存");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const cell = (short: string, loKey: keyof TelemetryGlobalAlarmLimits, hiKey: keyof TelemetryGlobalAlarmLimits) => (
    <span className="inline-flex items-center gap-0.5">
      <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-slate-500">{short}</span>
      <input
        type="text"
        inputMode="decimal"
        className="w-[4.5rem] rounded border border-slate-300 px-1.5 py-1 text-xs font-mono tabular-nums"
        placeholder="低"
        title="下限"
        value={(draft[loKey] as string) ?? ""}
        onChange={(e) => setDraft((p) => ({ ...p, [loKey]: e.target.value }))}
      />
      <span className="text-[10px] text-slate-400">~</span>
      <input
        type="text"
        inputMode="decimal"
        className="w-[4.5rem] rounded border border-slate-300 px-1.5 py-1 text-xs font-mono tabular-nums"
        placeholder="高"
        title="上限"
        value={(draft[hiKey] as string) ?? ""}
        onChange={(e) => setDraft((p) => ({ ...p, [hiKey]: e.target.value }))}
      />
    </span>
  );

  return (
    <div className="shrink-0 rounded border border-indigo-200 bg-indigo-50/40 px-2 py-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Gauge className="h-3.5 w-3.5 shrink-0 text-indigo-700" />
        <span className="shrink-0 text-xs font-medium text-slate-800">全局限值</span>
        <span className="hidden text-[10px] text-slate-500 sm:inline" title="温度/湿度/压强三类测点共用">
          （动物房）
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {cell("温", "tempMin", "tempMax")}
          {cell("湿", "humMin", "humMax")}
          {cell("压", "pressureMin", "pressureMax")}
        </div>
        <button
          type="button"
          disabled={saveM.isPending || limitsQ.isLoading}
          onClick={() => void saveM.mutateAsync()}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-400 bg-white px-3 py-1.5 text-sm font-medium text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          保存
        </button>
      </div>
    </div>
  );
}

const KIND_ROLE_OPTIONS = [
  { value: "METRIC", label: "测量值" },
  { value: "LIMIT_MIN", label: "下限" },
  { value: "LIMIT_MAX", label: "上限" },
  { value: "SWITCH", label: "开关" },
] as const;

function sortZonesStable(zones: TelemetryWatchlistZone[]): TelemetryWatchlistZone[] {
  return [...zones].sort((a, b) =>
    (a.bundle.displayName || "").localeCompare(b.bundle.displayName || "", "zh-CN", { sensitivity: "base" })
  );
}

/** 分区标签页文案：去 .csv 后缀，缩短占位 */
function zoneTabLabelShort(displayName: string): string {
  return (displayName || "").trim().replace(/\.csv$/i, "");
}

function patchZoneTagsInCache(queryClient: QueryClient, code: string, tags: TelemetryWatchlistTag[]) {
  queryClient.setQueryData<TelemetryWatchlistZone[]>(ZONES_KEY, (old) => {
    if (!old) return old;
    const merged = old.map((z) => (z.bundle.code === code ? { ...z, tags } : z));
    return sortZonesStable(merged);
  });
}

function patchZonePollInCache(queryClient: QueryClient, code: string, includeInWinccPoll: boolean) {
  queryClient.setQueryData<TelemetryWatchlistZone[]>(ZONES_KEY, (old) => {
    if (!old) return old;
    return sortZonesStable(
      old.map((z) =>
        z.bundle.code === code ? { ...z, bundle: { ...z.bundle, includeInWinccPoll } } : z
      )
    );
  });
}

function hasMappingFromLabel(displayLabel: string | null | undefined): boolean {
  const t = (displayLabel ?? "").trim();
  return t.length > 0 && t !== "无";
}

function fieldEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

/** 与后端列表行对应，避免保存后 useEffect 换新对象导致 x===original 找不到行 */
function tagRowKey(r: TelemetryWatchlistTag): string {
  const du = (r.draftUid ?? "").trim();
  if (du) return `draft:${du}`;
  if (r.id != null && String(r.id).trim() !== "") return `id:${r.id}`;
  return `vn:${r.winccVariableName ?? ""}|so:${r.sortOrder ?? 0}|st:${r.structureType ?? ""}`;
}

function newDraftUid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `d-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyWatchlistDraftRow(existing: TelemetryWatchlistTag[]): TelemetryWatchlistTag {
  const maxSo = existing.reduce((m, r) => Math.max(m, Number(r.sortOrder) || 0), 0);
  return {
    draftUid: newDraftUid(),
    winccVariableName: "",
    enabled: false,
    sortOrder: maxSo + 1,
    structureType: null,
    dataType: null,
    displayLabel: null,
    floorCode: null,
    roomCanonical: null,
    metricKindCode: null,
  };
}

/**
 * 仅当「展示映射」有有效内容时，按展示文本 + 指标字典推断楼层/房间/类别，只补空项（不覆盖已填）。
 * 不使用「名称」列（WinCC 变量名）。
 */
function mergeInferredWatchlistBlanks(
  row: TelemetryWatchlistTag,
  metricKinds: TelemetryMetricKind[]
): TelemetryWatchlistTag {
  if (!hasMappingFromLabel(row.displayLabel)) {
    return row;
  }
  const inf = inferStructuredFromDisplayMapping({
    displayLabel: row.displayLabel,
    metricKinds,
  });
  const next: TelemetryWatchlistTag = { ...row };
  if (!(next.floorCode || "").trim() && inf.floorCode) next.floorCode = inf.floorCode;
  if (!(next.roomCanonical || "").trim() && inf.roomCanonical) next.roomCanonical = inf.roomCanonical;
  if (!(next.metricKindCode || "").trim() && inf.metricKindCode) next.metricKindCode = inf.metricKindCode;
  return next;
}

/** 仅展示映射有内容时可使用「填充」 */
function canClickFillButton(row: TelemetryWatchlistTag): boolean {
  return hasMappingFromLabel(row.displayLabel);
}

/**
 * 编辑「展示映射」时实时同步：推断结果非空则写入对应列（无需先清空）；推断为空的列保留原值，避免半行输入时被清空。
 */
function livePatchFromDisplayLabel(
  row: TelemetryWatchlistTag,
  displayLabel: string | null,
  metricKinds: TelemetryMetricKind[]
): Partial<TelemetryWatchlistTag> {
  const patch: Partial<TelemetryWatchlistTag> = { displayLabel };
  if (!hasMappingFromLabel(displayLabel)) {
    return patch;
  }
  const inf = inferStructuredFromDisplayMapping({ displayLabel, metricKinds });
  patch.floorCode = inf.floorCode != null ? inf.floorCode : row.floorCode ?? null;
  patch.roomCanonical = inf.roomCanonical != null ? inf.roomCanonical : row.roomCanonical ?? null;
  patch.metricKindCode = inf.metricKindCode != null ? inf.metricKindCode : row.metricKindCode ?? null;
  return patch;
}

/**
 * 展示映射无效（空或「无」）→ 一般不勾选；**限值后缀行**若楼层/房间/类别齐备可无映射启用。
 */
function syncEnabledAfterPatch(_prevRow: TelemetryWatchlistTag, u: TelemetryWatchlistTag, patch: Partial<TelemetryWatchlistTag>): boolean {
  const allowOn = hasMappingFromLabel(u.displayLabel) || canEnableWithoutDisplayMapping(u);
  if (!allowOn) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
    return Boolean(patch.enabled);
  }
  return true;
}

/** 展示映射：IME 组字期间不推断结构化列；组字结束或非中文输入防抖后推断，避免乱码与跳行 */
function WatchlistDisplayLabelInput({
  row,
  metricKinds,
  patchRow,
}: {
  row: TelemetryWatchlistTag;
  metricKinds: TelemetryMetricKind[];
  patchRow: (original: TelemetryWatchlistTag, patch: Partial<TelemetryWatchlistTag>) => void;
}) {
  const rowKey = tagRowKey(row);
  const [local, setLocal] = useState(row.displayLabel ?? "");
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(row.displayLabel ?? "");
  }, [rowKey, row.displayLabel]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const flushStructured = useCallback(
    (value: string | null) => {
      patchRow(row, livePatchFromDisplayLabel(row, value, metricKinds));
    },
    [row, metricKinds, patchRow]
  );

  return (
    <input
      className="w-full min-w-[7rem] rounded border border-slate-300 px-2 py-1 text-sm leading-snug"
      value={local}
      placeholder={
        isWinccLimitSuffixVariable(row.winccVariableName) ? "可选；限值可无映射" : "大屏显示名"
      }
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        const v = e.currentTarget.value || null;
        setLocal(v ?? "");
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        flushStructured(v);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (composingRef.current) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          flushStructured(v || null);
        }, 280);
      }}
      onBlur={(e) => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        const v = e.target.value || null;
        setLocal(v ?? "");
        flushStructured(v);
      }}
    />
  );
}

function rowMatchesTelemetryFilter(r: TelemetryWatchlistTag, q: string): boolean {
  if (!q) return true;
  const qq = q.toLowerCase();
  return (
    (r.winccVariableName || "").toLowerCase().includes(qq) ||
    (r.displayLabel || "").toLowerCase().includes(qq) ||
    (r.structureType || "").toLowerCase().includes(qq) ||
    (r.dataType || "").toLowerCase().includes(qq) ||
    (r.floorCode || "").toLowerCase().includes(qq) ||
    (r.roomCanonical || "").toLowerCase().includes(qq) ||
    (r.metricKindCode || "").toLowerCase().includes(qq)
  );
}

/** 与 tbody 渲染顺序一致，用于按条数截断表格 DOM，减轻窄屏纵向占用 */
type TelemetryTableBodyItem =
  | { type: "data"; row: TelemetryWatchlistTag; tierCell: ReactNode; trClassName: string }
  | { type: "orphan-banner" };

function ZoneEditor({
  zone,
  queryClient,
  metricKinds,
}: {
  zone: TelemetryWatchlistZone;
  queryClient: QueryClient;
  metricKinds: TelemetryMetricKind[];
}) {
  const code = zone.bundle.code;
  const [draftRows, setDraftRows] = useState<TelemetryWatchlistTag[]>(() => zone.tags.map((t) => ({ ...t })));
  const [filter, setFilter] = useState("");
  const [dragPaintEnabled, setDragPaintEnabled] = useState<boolean | null>(null);
  const [dragPaintActive, setDragPaintActive] = useState(false);
  /** 收起的父行 parentKey（Set 内有 key 则隐藏其限值子行）；默认含已绑定限值的组全部收起 */
  const [collapsedParentKeys, setCollapsedParentKeys] = useState<Set<string>>(() => new Set());
  /** 表格 DOM 最大行数（含横幅行）；选「全部」时不截断 */
  const [tableRowCap, setTableRowCap] = useState(50);

  useEffect(() => {
    const merged = zone.tags.map((t) => mergeInferredWatchlistBlanks({ ...t }, metricKinds));
    const withAuto = applyMatchedLimitsAutoEnable(merged);
    const sorted = sortTagsByManagementTreeOrderDesc(withAuto, tagRowKey);
    setDraftRows(sorted);
    const tree = buildWatchlistManagementGroupsStable(sorted, tagRowKey);
    const nextCollapsed = new Set<string>();
    for (const g of tree.groups) {
      if (g.children.length > 0) nextCollapsed.add(g.parentKey);
    }
    setCollapsedParentKeys(nextCollapsed);
  }, [zone.tags, metricKinds]);

  useEffect(() => {
    if (!dragPaintActive) return;
    const end = () => {
      setDragPaintActive(false);
      setDragPaintEnabled(null);
      setDraftRows((prev) =>
        prev.map((r) =>
          !hasMappingFromLabel(r.displayLabel) && !canEnableWithoutDisplayMapping(r) && r.enabled
            ? { ...r, enabled: false }
            : r
        )
      );
    };
    window.addEventListener("mouseup", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("mouseup", end);
      window.removeEventListener("blur", end);
    };
  }, [dragPaintActive]);

  const managementTree = useMemo(
    () => buildWatchlistManagementGroupsStable(draftRows, tagRowKey),
    [draftRows]
  );

  const filterQ = filter.trim().toLowerCase();

  const visibleRowsFlat = useMemo(() => {
    const { groups, orphanLimits } = managementTree;
    const q = filterQ;
    const out: TelemetryWatchlistTag[] = [];
    for (const g of groups) {
      const groupHit =
        !q || rowMatchesTelemetryFilter(g.parent, q) || g.children.some((c) => rowMatchesTelemetryFilter(c, q));
      if (!groupHit) continue;
      out.push(g.parent);
      if (!collapsedParentKeys.has(g.parentKey)) {
        for (const c of g.children) {
          if (!q || rowMatchesTelemetryFilter(c, q)) out.push(c);
        }
      }
    }
    for (const o of orphanLimits) {
      if (!q || rowMatchesTelemetryFilter(o, q)) out.push(o);
    }
    return out;
  }, [managementTree, filterQ, collapsedParentKeys]);

  const visibleRowCount = useMemo(() => {
    let n = 0;
    const q = filterQ;
    const { groups, orphanLimits } = managementTree;
    for (const g of groups) {
      const groupHit =
        !q || rowMatchesTelemetryFilter(g.parent, q) || g.children.some((c) => rowMatchesTelemetryFilter(c, q));
      if (!groupHit) continue;
      n += 1;
      if (!collapsedParentKeys.has(g.parentKey)) {
        for (const c of g.children) {
          if (!q || rowMatchesTelemetryFilter(c, q)) n += 1;
        }
      }
    }
    for (const o of orphanLimits) {
      if (!q || rowMatchesTelemetryFilter(o, q)) n += 1;
    }
    return n;
  }, [managementTree, filterQ, collapsedParentKeys]);

  const saveM = useMutation({
    mutationFn: () => replaceTelemetryWatchlistTags(code, draftRows, null),
    onSuccess: async (d) => {
      try {
        const tags = await listTelemetryWatchlistTagsAll(code);
        patchZoneTagsInCache(queryClient, code, tags);
      } catch {
        void queryClient.invalidateQueries({ queryKey: ZONES_KEY });
      }
      void queryClient.invalidateQueries({ queryKey: [...TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX] });
      toast.success(`「${zone.bundle.displayName}」已保存 ${d.saved} 行`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "失败"),
  });

  const deleteM = useMutation({
    mutationFn: () => deleteTelemetryWatchlist(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ZONES_KEY });
      toast.success("已删除该分区");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "失败"),
  });

  const pollM = useMutation({
    mutationFn: (include: boolean) => setTelemetryWatchlistPollEnabled(code, include),
    onSuccess: (_, include) => {
      patchZonePollInCache(queryClient, code, include);
      toast.success(include ? "本分区已参与 WinCC 拉数" : "本分区已暂停 WinCC 拉数");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "失败"),
  });

  const patchRow = useCallback((original: TelemetryWatchlistTag, patch: Partial<TelemetryWatchlistTag>) => {
    const key = tagRowKey(original);
    setDraftRows((prev) => {
      const i = prev.findIndex((x) => tagRowKey(x) === key);
      if (i < 0) {
        console.warn("[telemetry-watchlist] patchRow: row not found", key);
        return prev;
      }
      const prevRow = prev[i];
      const u: TelemetryWatchlistTag = { ...prevRow, ...patch };
      u.enabled = syncEnabledAfterPatch(prevRow, u, patch);
      const next = [...prev];
      next[i] = u;
      return next;
    });
  }, []);

  const applyStructuredInfer = useCallback(
    (row: TelemetryWatchlistTag) => {
      const key = tagRowKey(row);
      setDraftRows((prev) => {
        const i = prev.findIndex((x) => tagRowKey(x) === key);
        if (i < 0) {
          queueMicrotask(() =>
            toast.error("找不到该行（可能已重新加载列表）。请再点一次分区或刷新页面后重试。")
          );
          return prev;
        }
        const cur = prev[i];
        if (!canClickFillButton(cur)) {
          queueMicrotask(() =>
            toast.error("请先填写展示映射（非「无」）；推断仅依据展示映射，不使用名称列")
          );
          return prev;
        }
        const merged = mergeInferredWatchlistBlanks(cur, metricKinds);
        const unchanged =
          fieldEq(merged.floorCode, cur.floorCode) &&
          fieldEq(merged.roomCanonical, cur.roomCanonical) &&
          fieldEq(merged.metricKindCode, cur.metricKindCode);
        if (unchanged) {
          queueMicrotask(() => toast("暂无可填充的空项（已与推断一致）"));
          return prev;
        }
        const prevRow = cur;
        const u: TelemetryWatchlistTag = { ...merged };
        u.enabled = syncEnabledAfterPatch(prevRow, u, {});
        const next = [...prev];
        next[i] = u;
        return next;
      });
    },
    [metricKinds]
  );

  const applyEnabledPaint = useCallback(
    (row: TelemetryWatchlistTag, value: boolean) => {
      if (value && !hasMappingFromLabel(row.displayLabel) && !canEnableWithoutDisplayMapping(row)) {
        toast.error("请先填写展示映射（非「无」），或为限值行补齐楼层/房间/类别（可用「同步限值←主测量」）");
        patchRow(row, { enabled: false });
        return;
      }
      patchRow(row, { enabled: value });
    },
    [patchRow]
  );

  const onEnabledMouseDown = useCallback(
    (row: TelemetryWatchlistTag, e: React.MouseEvent<HTMLInputElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const paintTo = !row.enabled;
      if (paintTo && !hasMappingFromLabel(row.displayLabel) && !canEnableWithoutDisplayMapping(row)) {
        toast.error("请先填写展示映射（非「无」），或为限值行补齐楼层/房间/类别");
        return;
      }
      setDragPaintEnabled(paintTo);
      setDragPaintActive(true);
      applyEnabledPaint(row, paintTo);
    },
    [applyEnabledPaint]
  );

  const onEnabledCellMouseEnter = useCallback(
    (row: TelemetryWatchlistTag) => {
      if (!dragPaintActive || dragPaintEnabled === null) return;
      if (!visibleRowsFlat.includes(row)) return;
      applyEnabledPaint(row, dragPaintEnabled);
    },
    [dragPaintActive, dragPaintEnabled, visibleRowsFlat, applyEnabledPaint]
  );

  const onDeleteZone = () => {
    if (window.confirm(`删除分区「${zone.bundle.displayName}」及其全部变量？`)) void deleteM.mutateAsync();
  };

  const removeDraftRow = useCallback((row: TelemetryWatchlistTag) => {
    const persisted = row.id != null && String(row.id).trim() !== "";
    if (persisted) {
      const vn = (row.winccVariableName || "").trim() || "（未命名变量）";
      if (!window.confirm(`从本表删除「${vn}」？保存本表后将从数据库移除该行。`)) return;
    }
    const key = tagRowKey(row);
    setDraftRows((prev) => prev.filter((x) => tagRowKey(x) !== key));
  }, []);

  const toggleCollapseParent = useCallback((parentKey: string) => {
    setCollapsedParentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(parentKey)) {
        next.delete(parentKey);
      } else {
        next.add(parentKey);
      }
      return next;
    });
  }, []);

  const tableBodyItems = useMemo((): TelemetryTableBodyItem[] => {
    const items: TelemetryTableBodyItem[] = [];
    const q = filterQ;
    for (const g of managementTree.groups) {
      const groupHit =
        !q || rowMatchesTelemetryFilter(g.parent, q) || g.children.some((c) => rowMatchesTelemetryFilter(c, q));
      if (!groupHit) continue;
      const collapsed = collapsedParentKeys.has(g.parentKey);
      const tierParent =
        g.children.length > 0 ? (
          <button
            type="button"
            className="rounded p-0.5 text-slate-600 hover:bg-slate-200"
            aria-expanded={!collapsed}
            title={collapsed ? "展开上下限" : "收起上下限"}
            onClick={() => toggleCollapseParent(g.parentKey)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block w-4 shrink-0" aria-hidden />
        );
      items.push({ type: "data", row: g.parent, tierCell: tierParent, trClassName: "hover:bg-slate-50/90" });
      if (!collapsed) {
        for (const c of g.children) {
          if (q && !rowMatchesTelemetryFilter(c, q)) continue;
          items.push({
            type: "data",
            row: c,
            tierCell: (
              <span className="inline-flex min-h-[1.15rem] items-center border-l border-slate-300 pl-1 text-[10px] font-semibold text-slate-500">
                限
              </span>
            ),
            trClassName: "bg-slate-50/75 hover:bg-slate-100/85",
          });
        }
      }
    }
    const orphanFiltered = managementTree.orphanLimits.filter((o) => !q || rowMatchesTelemetryFilter(o, q));
    if (
      orphanFiltered.length > 0 &&
      managementTree.orphanLimits.some((o) => !filterQ || rowMatchesTelemetryFilter(o, filterQ))
    ) {
      items.push({ type: "orphan-banner" });
    }
    for (const o of orphanFiltered) {
      items.push({
        type: "data",
        row: o,
        tierCell: <span className="text-[10px] font-semibold text-amber-700">未匹配</span>,
        trClassName: "bg-amber-50/35 hover:bg-amber-50/55",
      });
    }
    return items;
  }, [managementTree, filterQ, collapsedParentKeys, toggleCollapseParent]);

  const displayedTableBodyItems = useMemo(() => {
    const cap = tableRowCap >= 9999 ? tableBodyItems.length : tableRowCap;
    return tableBodyItems.slice(0, cap);
  }, [tableBodyItems, tableRowCap]);

  const tableBodyOmitted = tableBodyItems.length - displayedTableBodyItems.length;

  const enableCheckboxTitle =
    "可拖动连续勾选；有展示映射或「限值后缀 + 楼层/房间/类别齐备」时可启用（限值可用「同步限值←主测量」）";

  const renderTelemetryTableRow = useCallback(
    (row: TelemetryWatchlistTag, tierCell: ReactNode, trClassName: string) => (
      <tr key={tagRowKey(row)} className={trClassName}>
        <td
          className="border-b border-slate-100 px-1.5 py-2 align-middle"
          onMouseEnter={() => onEnabledCellMouseEnter(row)}
        >
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => applyEnabledPaint(row, e.target.checked)}
            onMouseDown={(e) => onEnabledMouseDown(row, e)}
            onClick={(e) => e.preventDefault()}
            className="h-4 w-4 cursor-pointer"
            title={enableCheckboxTitle}
          />
        </td>
        <td className="border-b border-slate-100 px-1 py-2 align-middle min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            <span className="shrink-0">{tierCell}</span>
            <input
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-sm leading-snug text-slate-900"
              value={row.winccVariableName ?? ""}
              placeholder="WinCC 变量名"
              aria-label="WinCC 变量名"
              title={(row.structureType || row.dataType) ? `结构: ${row.structureType ?? "—"} · 类型: ${row.dataType ?? "—"}` : undefined}
              onChange={(e) => patchRow(row, { winccVariableName: e.target.value })}
            />
          </div>
        </td>
        <td className="border-b border-slate-100 px-1 py-2 align-middle min-w-0">
          <WatchlistDisplayLabelInput row={row} metricKinds={metricKinds} patchRow={patchRow} />
        </td>
        <td className="border-b border-slate-100 px-1 py-2 align-middle text-center">
          <button
            type="button"
            title={
              isWinccLimitSuffixVariable(row.winccVariableName)
                ? "限值行通常无需填充；请用「同步限值←主测量」或手填楼层/房间/类别"
                : "按展示映射只补空项（不覆盖已手填列）；有展示映射时可点"
            }
            disabled={!canClickFillButton(row)}
            onClick={() => applyStructuredInfer(row)}
            className="inline-flex rounded-md border border-sky-200 bg-sky-50 p-1 text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </td>
        <td className="border-b border-slate-100 px-1 py-2 align-middle">
          <input
            className="w-14 rounded border border-slate-300 px-1.5 py-1 text-sm"
            value={row.floorCode ?? ""}
            placeholder="2F"
            onChange={(e) => {
              const v = e.target.value || null;
              const merged = mergeInferredWatchlistBlanks({ ...row, floorCode: v }, metricKinds);
              patchRow(row, {
                floorCode: merged.floorCode,
                roomCanonical: merged.roomCanonical,
                metricKindCode: merged.metricKindCode,
              });
            }}
          />
        </td>
        <td className="border-b border-slate-100 px-1 py-2 align-middle">
          <input
            className="w-full min-w-0 max-w-[11rem] rounded border border-slate-300 px-2 py-1 text-sm"
            value={row.roomCanonical ?? ""}
            placeholder="如 2F-201A、洁净走道1"
            onChange={(e) => {
              const v = e.target.value || null;
              const merged = mergeInferredWatchlistBlanks({ ...row, roomCanonical: v }, metricKinds);
              patchRow(row, {
                floorCode: merged.floorCode,
                roomCanonical: merged.roomCanonical,
                metricKindCode: merged.metricKindCode,
              });
            }}
          />
        </td>
        <td className="border-b border-slate-100 px-1 py-2 align-middle">
          <select
            className="max-w-[9rem] rounded border border-slate-300 px-1 py-1 text-sm"
            value={row.metricKindCode ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              const merged = mergeInferredWatchlistBlanks({ ...row, metricKindCode: v }, metricKinds);
              patchRow(row, {
                floorCode: merged.floorCode,
                roomCanonical: merged.roomCanonical,
                metricKindCode: merged.metricKindCode,
              });
            }}
          >
            <option value="">—</option>
            {metricKinds
              .filter((k) => k.active !== false)
              .map((k) => (
                <option key={k.code} value={k.code}>
                  {k.labelZh} ({k.code})
                </option>
              ))}
          </select>
        </td>
        <td className="border-b border-slate-100 px-1 py-2 align-middle text-center whitespace-nowrap">
          <button
            type="button"
            title="删除本行（保存本表后写入数据库）"
            onClick={() => removeDraftRow(row)}
            className="inline-flex rounded-md border border-rose-200 bg-rose-50 p-1 text-rose-800 hover:bg-rose-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">删除本行</span>
          </button>
        </td>
      </tr>
    ),
    [
      applyEnabledPaint,
      applyStructuredInfer,
      enableCheckboxTitle,
      mergeInferredWatchlistBlanks,
      metricKinds,
      onEnabledCellMouseEnter,
      onEnabledMouseDown,
      patchRow,
      removeDraftRow,
    ]
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-100 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 overflow-x-auto">
          <span className="hidden max-w-[14rem] truncate text-xs text-slate-500 md:inline" title={zone.bundle.sourceFilename ?? undefined}>
            <span className="font-mono text-slate-700">{code}</span>
            {zone.bundle.sourceFilename && zone.bundle.sourceFilename !== zone.bundle.displayName ? (
              <span> · {zone.bundle.sourceFilename}</span>
            ) : null}
          </span>
          <label
            className="inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            title="参与 WinCC 后台拉数"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={zone.bundle.includeInWinccPoll !== false}
              disabled={pollM.isPending}
              onChange={(e) => void pollM.mutateAsync(e.target.checked)}
            />
            拉数
          </label>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选变量名、映射、楼层…"
            className="min-w-[8rem] flex-1 basis-[12rem] rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="inline-flex shrink-0 items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap">表格行数</span>
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={tableRowCap}
              onChange={(e) => setTableRowCap(Number(e.target.value))}
              aria-label="表格最多显示行数"
            >
              <option value={50}>50 行</option>
              <option value={80}>80 行</option>
              <option value={120}>120 行</option>
              <option value={9999}>全部</option>
            </select>
          </label>
          <button
            type="button"
            title="新增一行"
            onClick={() => setDraftRows((prev) => [...prev, createEmptyWatchlistDraftRow(prev)])}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100"
          >
            <Plus className="h-4 w-4" />
            新增
          </button>
          <button
            type="button"
            title="保存本分区变量表"
            onClick={() => void saveM.mutateAsync()}
            disabled={saveM.isPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-400 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
          <button
            type="button"
            title="按楼层→房间→变量名倒序重排（未自动保存）"
            onClick={() => {
              setDraftRows((prev) => sortTagsByManagementTreeOrderDesc(prev, tagRowKey));
              toast.success("已按楼层→房间→变量名倒序重排（未自动保存）");
            }}
            className="inline-flex shrink-0 items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            重排
          </button>
          <button
            type="button"
            title="同步限值←主测量"
            onClick={() => {
              setDraftRows((prev) => applyMatchedLimitsAutoEnable(prev));
              toast.success("已同步限值结构；已匹配且三列齐备的限值已自动勾选启用");
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100"
          >
            <Link2 className="h-4 w-4" />
            同步限值
          </button>
          <button
            type="button"
            title="删除整个分区"
            onClick={onDeleteZone}
            disabled={deleteM.isPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            删分区
          </button>
          <span className="ml-auto min-w-0 shrink-0 text-right text-xs leading-snug text-slate-500">
            共 {draftRows.length} · 匹配 {visibleRowCount}
            {tableBodyOmitted > 0 ? (
              <span className="text-amber-800">
                {" "}
                · 表内仅前 {tableRowCap >= 9999 ? "全部" : tableRowCap} 行（另有 {tableBodyOmitted} 条未渲染）
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/* 横向滚动与表头 sticky 由 AdminDataTableWrap + index.css；纵向仍由布局 main 承载（未开启 scrollable） */}
      <AdminDataTableWrap className="w-full min-w-0 overscroll-x-contain bg-slate-50/40">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="bg-slate-100">
            <tr className="[&_th]:border-b [&_th]:border-slate-200">
              <th className="px-1.5 py-1 text-left align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap">
                启用
              </th>
              <th className="px-1 py-1 text-left align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap">
                名称
              </th>
              <th className="px-1 py-1 text-left align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap min-w-[10rem]">
                展示映射
              </th>
              <th className="px-1 py-1 text-center align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap w-11">
                填充
              </th>
              <th className="px-1 py-1 text-left align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap">
                楼层
              </th>
              <th className="px-1 py-1 text-left align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap min-w-[5.5rem]">
                房间
              </th>
              <th className="px-1 py-1 text-left align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap min-w-[5.5rem]">
                类别
              </th>
              <th className="px-1 py-1 text-center align-bottom text-sm font-semibold leading-none text-slate-800 whitespace-nowrap w-11">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedTableBodyItems.map((item) =>
              item.type === "orphan-banner" ? (
                <tr key="orphan-banner">
                  <td
                    className="border-b border-amber-100 bg-amber-50/95 px-2 py-2 text-sm font-medium text-amber-900"
                    colSpan={8}
                  >
                    未匹配主测量的限值（核对后缀 _PT_Floor/_TT_Top 等及主行指标类别是否与后缀一致）
                  </td>
                </tr>
              ) : (
                renderTelemetryTableRow(item.row, item.tierCell, item.trClassName)
              )
            )}
            {tableBodyOmitted > 0 ? (
              <tr>
                <td className="border-b border-slate-100 bg-slate-50 px-2 py-2 text-center text-sm text-slate-600" colSpan={8}>
                  为减轻页面高度，仅渲染前 {tableRowCap >= 9999 ? tableBodyItems.length : tableRowCap} 行（当前匹配共 {tableBodyItems.length}{" "}
                  条）；请缩小筛选或把上方「表格」改为「全部」。
                </td>
              </tr>
            ) : null}
            {!visibleRowCount ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                  {draftRows.length ? "无匹配筛选" : "本分区暂无变量，可点「新增」或导入 CSV。"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </AdminDataTableWrap>
    </div>
  );
}

export default function AdminTelemetryWatchlistsPage() {
  const qc = useQueryClient();
  const [lastImportHint, setLastImportHint] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);

  const kindsQ = useQuery({
    queryKey: METRIC_KINDS_KEY,
    queryFn: listTelemetryMetricKinds,
    staleTime: 60_000,
  });

  const [newKindCode, setNewKindCode] = useState("");
  const [newKindLabel, setNewKindLabel] = useState("");
  const [newKindRole, setNewKindRole] = useState<string>("METRIC");
  const createKindM = useMutation({
    mutationFn: () =>
      createTelemetryMetricKind({
        code: newKindCode.trim(),
        labelZh: newKindLabel.trim() || newKindCode.trim(),
        kindRole: newKindRole,
        sortOrder: 100,
        active: true,
      }),
    onSuccess: async () => {
      setNewKindCode("");
      setNewKindLabel("");
      setNewKindRole("METRIC");
      await qc.invalidateQueries({ queryKey: METRIC_KINDS_KEY });
      toast.success("已添加指标类型");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "失败"),
  });

  const updateKindRoleM = useMutation({
    mutationFn: (p: { code: string; kindRole: string }) =>
      updateTelemetryMetricKind(p.code, { kindRole: p.kindRole }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: METRIC_KINDS_KEY });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "更新角色失败"),
  });

  const deleteKindM = useMutation({
    mutationFn: (code: string) => deleteTelemetryMetricKind(code),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: METRIC_KINDS_KEY });
      toast.success("已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "失败"),
  });

  const zonesQ = useQuery({
    queryKey: ZONES_KEY,
    queryFn: listTelemetryWatchlistZonesWithTags,
  });

  const rawZones = zonesQ.data ?? [];
  const sortedZones = useMemo(() => sortZonesStable(rawZones), [rawZones]);

  useEffect(() => {
    if (!sortedZones.length) {
      setActiveCode(null);
      return;
    }
    setActiveCode((prev) => {
      if (prev && sortedZones.some((z) => z.bundle.code === prev)) return prev;
      return sortedZones[0].bundle.code;
    });
  }, [sortedZones]);

  const activeZone = useMemo(
    () => sortedZones.find((z) => z.bundle.code === activeCode) ?? null,
    [sortedZones, activeCode]
  );

  const importM = useMutation({
    mutationFn: (file: File) => importTelemetryWatchlistCsvFileQuick(file),
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: ZONES_KEY });
      void qc.invalidateQueries({ queryKey: [...TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX] });
      setActiveCode(d.bundleCode);
      setLastImportHint(
        `「${d.displayName}」已合并进分区（同名更新，本区未出现在 CSV 的变量仍保留），${d.imported} 行。`
      );
      toast.success(`已导入 ${d.imported} 行`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "失败"),
  });

  const onImportFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("请选择 .csv 文件");
      return;
    }
    void importM.mutateAsync(file);
  };

  const totalVars = sortedZones.reduce((n, z) => n + z.tags.length, 0);

  return (
    <div className="w-full max-w-full overflow-x-hidden pb-2">
      <div className="flex w-full max-w-full min-w-0 flex-col gap-4 p-6">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50/90 py-1">
        <h1 className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-slate-900">
          <Database className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="truncate">WinCC 变量</span>
        </h1>
        <span className="text-xs text-slate-500">
          {sortedZones.length} 分区 · {totalVars} 条
          {importM.isPending ? <span className="text-sky-600"> · 导入中…</span> : null}
        </span>
        <label
          className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-blue-400 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100"
          title="导入 CSV 变量表"
        >
          <Upload className="h-4 w-4" />
          导入 CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              onImportFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {lastImportHint && (
        <p className="shrink-0 truncate px-0.5 py-0.5 text-[11px] text-emerald-800" title={lastImportHint}>
          {lastImportHint}
        </p>
      )}

      <div className="shrink-0 px-0.5">
        <GlobalAlarmLimitsPanel queryClient={qc} />
      </div>

      <div className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-sm">
        <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
          <span className="shrink-0 self-center text-xs font-medium text-slate-800">指标字典</span>
          <input
            className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="code"
            value={newKindCode}
            onChange={(e) => setNewKindCode(e.target.value)}
          />
          <input
            className="min-w-[6rem] max-w-[12rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="中文名"
            value={newKindLabel}
            onChange={(e) => setNewKindLabel(e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={newKindRole}
            onChange={(e) => setNewKindRole(e.target.value)}
            aria-label="新建指标角色"
          >
            {KIND_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={createKindM.isPending || !newKindCode.trim()}
            onClick={() => void createKindM.mutateAsync()}
            className="shrink-0 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-50"
          >
            添加
          </button>
        </div>
        {/* 指标字典与整页共用 main 滚动，禁止此处再嵌套纵向滚动条 */}
        <ul className="mt-1 flex flex-wrap gap-1 text-[11px]">
          {(kindsQ.data ?? []).map((k) => (
            <li
              key={k.code}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5"
            >
              <span>
                {k.labelZh} <span className="font-mono text-slate-600">({k.code})</span>
              </span>
              <select
                className="max-w-[6.5rem] rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                value={(k.kindRole || "METRIC").toUpperCase()}
                disabled={updateKindRoleM.isPending}
                onChange={(e) => {
                  void updateKindRoleM.mutateAsync({ code: k.code, kindRole: e.target.value });
                }}
                aria-label={`${k.code} 角色`}
              >
                {KIND_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {!k.builtin && (
                <button
                  type="button"
                  className="text-rose-600 hover:underline"
                  onClick={() => {
                    if (window.confirm(`删除指标类型「${k.code}」？`)) void deleteKindM.mutateAsync(k.code);
                  }}
                >
                  删
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {!sortedZones.length ? (
        <div className="flex flex-col py-1">
          {zonesQ.isLoading && <p className="shrink-0 p-2 text-sm text-slate-500">加载中…</p>}
          {zonesQ.isError && (
            <p className="shrink-0 p-2 text-sm text-rose-600">{zonesQ.error instanceof Error ? zonesQ.error.message : "加载失败"}</p>
          )}
          {!zonesQ.isLoading && !sortedZones.length && (
            <p className="m-4 shrink-0 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
              尚无分区。上传 CSV，文件名即分区（如 <code className="rounded bg-slate-100 px-1">2f.csv</code>）。需{" "}
              <code className="rounded bg-slate-100 px-1">app.wincc.watchlist-source=database</code>。
            </p>
          )}
        </div>
      ) : null}

      {sortedZones.length > 0 ? (
        <div className="w-full min-w-0 max-w-full flex flex-col">
          <div className="flex w-full min-w-0 shrink-0 items-stretch gap-1 border-b border-slate-200 bg-slate-50/80 px-1 pb-0 pt-1 sm:px-2">
            {sortedZones.map((z) => {
              const on = z.bundle.code === activeCode;
              const short = zoneTabLabelShort(z.bundle.displayName);
              const title = `${z.bundle.displayName}（${z.tags.length} 条）`;
              return (
                <button
                  key={z.bundle.code}
                  type="button"
                  title={title}
                  onClick={() => setActiveCode(z.bundle.code)}
                  className={`relative min-h-[2.25rem] min-w-0 flex-1 basis-0 rounded-t-md border border-b-0 px-1 py-1 text-center text-[11px] font-medium leading-tight shadow-sm transition-colors sm:px-1.5 ${
                    on
                      ? "z-[2] -mb-px border-slate-300 bg-white text-blue-800"
                      : "z-[1] border-slate-200/90 bg-slate-100 text-slate-600 hover:z-[2] hover:bg-slate-50"
                  } `}
                >
                  <span className="block truncate">{short}</span>
                  <span className="tabular-nums text-[10px] opacity-75">{z.tags.length}</span>
                </button>
              );
            })}
          </div>

          <div className="w-full min-w-0 max-w-full border-x border-slate-200 bg-white px-2 pb-2 pt-1">
            {activeZone ? (
              <ZoneEditor
                key={activeZone.bundle.code}
                zone={activeZone}
                queryClient={qc}
                metricKinds={kindsQ.data ?? []}
              />
            ) : (
              <p className="text-sm text-slate-500">请选择上方标签。</p>
            )}
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
