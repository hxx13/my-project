import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnimalRoomHubViewChunk, AnimalRoomTelemetryPageDto } from "@/api/telemetryApi";
import {
  ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY,
  buildStructuredFloorTabs,
  buildTelemetryBundleTabs,
  DEFAULT_FACILITY_LAYOUT_RULES_V1,
  fetchAndMergeSingleWinccTagIntoAnimalRoomCache,
  fetchFacilityLayoutRules,
  fetchWinccAnimalRoomTelemetry,
  fetchWinccTelemetrySnapshot,
  floorTabKeyForTelemetryItem,
  formatTelemetryStatusOnOff,
  formatTelemetryTs,
  isSwitchTelemetryMetric,
  isStatusTelemetryMetric,
  mergeTelemetryTagRowsIntoAnimalRoomPageDto,
  patchWatchlistTagAlarmOverrides,
  pollWinccSnapshotUntilWrittenValueMatches,
  postWinccWriteTag,
  queryWatchlistAlarmLimits,
  winccWrittenValueMatches,
} from "@/api/telemetryApi";
import type { FacilityLayoutRulesV1 } from "@/api/telemetryApi";
import {
  ANIMAL_ROOM_HVAC_TAB_KEY,
  buildAnimalRoomFloorRelayRows,
  buildAnimalRoomHubRelayRows,
  buildFloorChunks,
  buildSyntheticHvacHubTab,
  buildSyntheticHvacStructTab,
  collectVariableNamesFromHubChunks,
  collectVariableNamesFromStructuredSuites,
  filterHubChunksExcludeHvacUnits,
  floorChunkIsZoneCard,
  hubChunkIsZoneCard,
  interventionValueTrendForDisplay,
  ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW,
  rowSplitsForBalancedSoloGrid,
  soloMinCardPxForPartition,
  statusMetricSlotDisplayLabel,
  suiteHasChrome,
  suiteLatestMsPrepared,
  stripLeadingSuitePrefixFromRoomDisplay,
  stripSuiteTitlePrefixForDisplay,
  isHvacMechanicalSuiteGroup,
  suiteIsBoilerRoomSuite,
  suiteIsPowerStationSuite,
} from "@/telemetry-view/index";
import type { FloorChunk, PreparedSuite } from "@/telemetry-view/index";
import { compareMetricsInRoomRowOrder } from "@/telemetry-view/roomMetricDisplayOrder";
import type {
  TelemetryRoomCardModel,
  TelemetryStructuredFloorTab,
  TelemetryStructuredMetricSlot,
  TelemetryStructuredRoomCard,
  TelemetryStructuredSuiteGroup,
  TelemetryTagItem,
} from "@/api/telemetryApi";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";
import {
  ArrowBigDown,
  ArrowBigUp,
  ArrowLeft,
  Clock,
  Droplets,
  Gauge,
  Info,
  RefreshCw,
  Thermometer,
  ToggleLeft,
} from "lucide-react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTelemetryArchiveRollingSeries } from "@/hooks/useTelemetryArchiveRollingSeries";

import { ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY } from "@/features/admin/adminTelemetryNav";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import {
  AnimalTelemetryFxIconVariantContext,
  useAnimalTelemetryFxIconVariant,
} from "@/features/twin-chrome/AnimalTelemetryFxIconVariantContext";
import { AnimalTelemetryRoomFxIcon } from "@/features/twin-chrome/AnimalTelemetryRoomFxIcon";
import { AnimalTelemetryWindStreamSvg } from "@/features/twin-chrome/AnimalTelemetryWindStreamSvg";
import { inferAnimalTelemetryRoomFx } from "@/features/twin-chrome/animalTelemetryRoomFx";
import "./animalRoomTelemetryPage.css";
import {
  AnimalRoomTelemetryPartitionDock,
  partitionDockElevatorDisplayLabel,
  type AnimalRoomTelemetryPartitionDockItem,
} from "./AnimalRoomTelemetryPartitionDock";

function readAnimalTelemetryHtmlSciFiAttr(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-twin-animal-telemetry-scifi") === "1";
}

function subscribeAnimalTelemetryHtmlSciFiAttr(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const el = document.documentElement;
  const mo = new MutationObserver(onStoreChange);
  mo.observe(el, { attributes: true, attributeFilter: ["data-twin-animal-telemetry-scifi"] });
  return () => mo.disconnect();
}

/** 当前可见分区测点定点快照：间隔与单次 query 变量数上限（避免 GET query 过长） */
const HIGH_FREQ_VISIBLE_TAB_POLL_MS = 10_000;
const HIGH_FREQ_TAB_POLL_STORAGE_KEY = "animalRoomTelemetryHighFreqTab10s";
const SNAPSHOT_VARIABLE_NAMES_CHUNK = 45;

type WinccAnimalRoomWriteCtx = {
  canWrite: boolean;
  writeTag: (variableName: string, value: unknown) => Promise<void>;
};

const WinccAnimalRoomWriteContext = createContext<WinccAnimalRoomWriteCtx | null>(null);

/** 动物房页：供开关弹窗展示「页面最近拉取」与单点刷新 */
type AnimalRoomTelemetryPageUi = {
  lastFetchFormatted: string;
  refreshTagByVariableName: (vn: string) => Promise<void>;
};
const AnimalRoomTelemetryPageUiContext = createContext<AnimalRoomTelemetryPageUi | null>(null);

function useAnimalRoomTelemetryPageUi(): AnimalRoomTelemetryPageUi | null {
  return useContext(AnimalRoomTelemetryPageUiContext);
}

type TelemetryDialogsCtx = {
  confirm: (title: string, body: string) => Promise<boolean>;
  alertMessage: (body: string) => Promise<void>;
  promptString: (title: string, label: string, defaultValue: string) => Promise<string | null>;
  confirmWinccSwitch: (opts: {
    body: string;
    lastFetchText: string;
    onRefresh: () => Promise<void>;
  }) => Promise<boolean>;
  /** 设定值：与开关弹层一致——最近拉取 + 圆钮刷新 + 输入；无 PageUi 时退回 promptString */
  promptWinccSetpoint: (opts: {
    title: string;
    label: string;
    defaultValue: string;
    lastFetchText: string;
    onRefresh: () => Promise<void>;
  }) => Promise<string | null>;
};

const TelemetryDialogsContext = createContext<TelemetryDialogsCtx | null>(null);

function useTelemetryDialogs(): TelemetryDialogsCtx {
  const ctx = useContext(TelemetryDialogsContext);
  if (!ctx) {
    throw new Error("useTelemetryDialogs must be used within TelemetryDialogsProvider");
  }
  return ctx;
}

type InlineDialogState =
  | { kind: "confirm"; title: string; body: string; resolve: (v: boolean) => void }
  | {
      kind: "confirmWinccSwitch";
      body: string;
      lastFetchText: string;
      onRefresh: () => Promise<void>;
      resolve: (v: boolean) => void;
    }
  | { kind: "alert"; body: string; resolve: () => void }
  | {
      kind: "prompt";
      title: string;
      label: string;
      defaultValue: string;
      resolve: (v: string | null) => void;
    }
  | {
      kind: "promptWinccSetpoint";
      title: string;
      label: string;
      defaultValue: string;
      lastFetchText: string;
      onRefresh: () => Promise<void>;
      resolve: (v: string | null) => void;
    };

/** 动物房页：确认 / 告警 / 单行输入，替代 window.confirm / alert / prompt */
function TelemetryDialogsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InlineDialogState | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [switchRefreshBusy, setSwitchRefreshBusy] = useState(false);
  const [setpointRefreshBusy, setSetpointRefreshBusy] = useState(false);

  useEffect(() => {
    if (state?.kind === "prompt" || state?.kind === "promptWinccSetpoint") setPromptDraft(state.defaultValue);
  }, [state]);

  useEffect(() => {
    if (state?.kind === "confirmWinccSwitch") setSwitchRefreshBusy(false);
  }, [state]);

  useEffect(() => {
    if (state?.kind === "promptWinccSetpoint") setSetpointRefreshBusy(false);
  }, [state]);

  const confirm = useCallback((title: string, body: string) => {
    return new Promise<boolean>((resolve) => {
      setState({ kind: "confirm", title, body, resolve });
    });
  }, []);

  const confirmWinccSwitch = useCallback(
    (opts: { body: string; lastFetchText: string; onRefresh: () => Promise<void> }) => {
      return new Promise<boolean>((resolve) => {
        setState({
          kind: "confirmWinccSwitch",
          body: opts.body,
          lastFetchText: opts.lastFetchText,
          onRefresh: opts.onRefresh,
          resolve,
        });
      });
    },
    []
  );

  const alertMessage = useCallback((body: string) => {
    return new Promise<void>((resolve) => {
      setState({ kind: "alert", body, resolve });
    });
  }, []);

  const promptString = useCallback((title: string, label: string, defaultValue: string) => {
    return new Promise<string | null>((resolve) => {
      setState({ kind: "prompt", title, label, defaultValue, resolve });
    });
  }, []);

  const promptWinccSetpoint = useCallback(
    (opts: {
      title: string;
      label: string;
      defaultValue: string;
      lastFetchText: string;
      onRefresh: () => Promise<void>;
    }) => {
      return new Promise<string | null>((resolve) => {
        setState({
          kind: "promptWinccSetpoint",
          title: opts.title,
          label: opts.label,
          defaultValue: opts.defaultValue,
          lastFetchText: opts.lastFetchText,
          onRefresh: opts.onRefresh,
          resolve,
        });
      });
    },
    []
  );

  const overlay = state ? (
    <div
      data-twin-animal-telemetry-overlay
      className="fixed inset-0 z-[500] flex items-center justify-center bg-zinc-950/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (state.kind === "confirm" || state.kind === "confirmWinccSwitch") {
            state.resolve(false);
            setState(null);
          } else if (state.kind === "promptWinccSetpoint") {
            state.resolve(null);
            setState(null);
          }
        }
      }}
    >
      {state.kind === "confirm" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-950/5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {state.title.trim() ? (
            <p className="text-sm font-semibold text-zinc-900">{state.title}</p>
          ) : null}
          <p className={cn(state.title.trim() ? "mt-2" : "", "whitespace-pre-wrap text-sm leading-relaxed text-zinc-800")}>
            {state.body}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              onClick={() => {
                state.resolve(false);
                setState(null);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
              onClick={() => {
                state.resolve(true);
                setState(null);
              }}
            >
              确认
            </button>
          </div>
        </div>
      ) : null}
      {state.kind === "confirmWinccSwitch" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-950/5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-500">{state.lastFetchText}</p>
            <button
              type="button"
              title="刷新该点"
              aria-label="刷新该点"
              disabled={switchRefreshBusy}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-sky-600 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                setSwitchRefreshBusy(true);
                try {
                  await state.onRefresh();
                } finally {
                  setSwitchRefreshBusy(false);
                }
              }}
            >
              <RefreshCw className={cn("h-3 w-3", switchRefreshBusy && "animate-spin")} aria-hidden />
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{state.body}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              onClick={() => {
                state.resolve(false);
                setState(null);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
              onClick={() => {
                state.resolve(true);
                setState(null);
              }}
            >
              确认
            </button>
          </div>
        </div>
      ) : null}
      {state.kind === "promptWinccSetpoint" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-950/5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-500">{state.lastFetchText}</p>
            <button
              type="button"
              title="刷新该点"
              aria-label="刷新该点"
              disabled={setpointRefreshBusy}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-sky-600 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                setSetpointRefreshBusy(true);
                try {
                  await state.onRefresh();
                } finally {
                  setSetpointRefreshBusy(false);
                }
              }}
            >
              <RefreshCw className={cn("h-3 w-3", setpointRefreshBusy && "animate-spin")} aria-hidden />
            </button>
          </div>
          <p className="text-sm font-semibold text-zinc-900">{state.title}</p>
          <label className="mt-2 block text-[11px] text-zinc-500">{state.label}</label>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm text-zinc-900 shadow-inner focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const t = promptDraft.trim();
                state.resolve(t !== "" ? t : null);
                setState(null);
              }
            }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              onClick={() => {
                state.resolve(null);
                setState(null);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
              onClick={() => {
                const t = promptDraft.trim();
                state.resolve(t !== "" ? t : null);
                setState(null);
              }}
            >
              提交
            </button>
          </div>
        </div>
      ) : null}
      {state.kind === "alert" ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-950/5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-800">{state.body}</p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-900"
              onClick={() => {
                state.resolve();
                setState(null);
              }}
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}
      {state.kind === "prompt" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-950/5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-semibold text-zinc-900">{state.title}</p>
          <label className="mt-2 block text-[11px] text-zinc-500">{state.label}</label>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm text-zinc-900 shadow-inner focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                state.resolve(promptDraft.trim() !== "" ? promptDraft.trim() : null);
                setState(null);
              }
            }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              onClick={() => {
                state.resolve(null);
                setState(null);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
              onClick={() => {
                const t = promptDraft.trim();
                state.resolve(t !== "" ? t : null);
                setState(null);
              }}
            >
              确认
            </button>
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <TelemetryDialogsContext.Provider
      value={{ confirm, confirmWinccSwitch, alertMessage, promptString, promptWinccSetpoint }}
    >
      {children}
      {overlay ? createPortal(overlay, document.body) : null}
    </TelemetryDialogsContext.Provider>
  );
}

/** 展示用数值：保留一位小数；若为「数字+后缀」只格式化数字前缀 */
function formatTelemetryValueOneDecimal(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const t = String(raw).trim();
  if (t === "—" || t === "\u2014" || t === "-") return "—";
  const cleaned = t.replace(/,/g, "");
  const m = cleaned.match(/^(-?\d+(?:\.\d*)?)([\s\S]*)$/);
  if (m && m[1] !== "") {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n.toFixed(1) + (m[2] || "");
  }
  const n2 = Number(cleaned);
  if (Number.isFinite(n2)) return n2.toFixed(1);
  return t;
}

function metricStyleFromKind(
  metricKindCode: string | null | undefined,
  labelZh: string
): { unit: string; Icon: LucideIcon } {
  const c = (metricKindCode || "").trim().toUpperCase();
  const lab = (labelZh || "").trim();
  if (c === "TEMP" || (c.length >= 4 && c.startsWith("TEMP"))) return { unit: "℃", Icon: Thermometer };
  if (c === "HUM" || c === "RH") return { unit: "%", Icon: Droplets };
  if (c === "PRESSURE" || (c.length >= 8 && c.startsWith("PRESSURE"))) return { unit: "Pa", Icon: Gauge };
  if (c === "SWITCH" || c === "SETPOINT") return { unit: "", Icon: ToggleLeft };
  if (c === "STATUS") return { unit: "", Icon: ToggleLeft };
  if (lab.includes("温度")) return { unit: "℃", Icon: Thermometer };
  if (lab.includes("湿度")) return { unit: "%", Icon: Droplets };
  if (lab.includes("压差") || lab.includes("差压")) return { unit: "Pa", Icon: Gauge };
  return { unit: "", Icon: Thermometer };
}

/** 仅 UP/DOWN 显示箭头；死区/平缓（null 或 FLAT）仅占位不画箭头 */
function ValueTrendMark({
  trend,
  size = "md",
}: {
  trend: string | null | undefined;
  size?: "sm" | "md";
}) {
  const u = (trend || "").trim().toUpperCase();
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const sw = 3.15;
  if (u === "UP") {
    return (
      <ArrowBigUp
        data-animal-telemetry-trend="up"
        className={cn(dim, "shrink-0 text-emerald-600")}
        strokeWidth={sw}
        aria-hidden
      />
    );
  }
  if (u === "DOWN") {
    return (
      <ArrowBigDown
        data-animal-telemetry-trend="down"
        className={cn(dim, "shrink-0 text-sky-600")}
        strokeWidth={sw}
        aria-hidden
      />
    );
  }
  return <span className={cn(dim, "inline-block shrink-0")} aria-hidden />;
}

/** 详情归档：服务端 ROLLING 定窗（小时）+ 降采样点数；前端仅轮询整包 */
const ARCHIVE_WINDOW_HOURS = 6;
const ARCHIVE_POLL_MS = 20_000;
const ARCHIVE_MAX_POINTS = 96;

function parseAlarmLimitNumber(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseTelemetryReadingNumber(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const cleaned = String(raw).trim().replace(/,/g, "");
  const m = cleaned.match(/^(-?\d+(?:\.\d*)?)/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 三色报警：高超红、低超蓝、正常绿；无 band 时用读数与限值兜底（与小程序 alarmBandClass 一致） */
function cnTelemetryAlarmBand(item: TelemetryTagItem | null | undefined) {
  const b = (item?.alarmBand || "").trim().toUpperCase();
  if (b === "HIGH") return "telemetry-alarm-high";
  if (b === "LOW") return "telemetry-alarm-low";
  if (b === "OK") return "telemetry-alarm-ok";
  if (item?.alarmOutOfRange === true) return "telemetry-alarm-value";
  const v = parseTelemetryReadingNumber(item?.value);
  const minN = parseAlarmLimitNumber(item?.alarmMinValue);
  const maxN = parseAlarmLimitNumber(item?.alarmMaxValue);
  if (v != null && maxN != null && v > maxN) return "telemetry-alarm-high";
  if (v != null && minN != null && v < minN) return "telemetry-alarm-low";
  return "";
}

/** 与 ValueTrendMark md（w-5）一致；数值列按「+999.0」7 字宽 mono；单位列最小 ch；列距收紧、整块靠右 */
const METRIC_TREND_COL = "1.25rem";
const METRIC_VALUE_COL = "7ch";
/** Pa / ℃ / % 最小栏宽；略大于 3ch 避免「Pa」截断 */
const METRIC_UNIT_COL = "2rem";
/** 套间标题槽：再收紧列宽与间距，腾出横向空间给右侧时间戳一行展示 */
const SUITE_HDR_TREND_COL = "1.125rem";
const SUITE_HDR_VALUE_COL = "6ch";
const SUITE_HDR_UNIT_COL = "1.75rem";

/**
 * 趋势 / 数值 / 单位三列固定边界；数字与单位同档 text-sm。数值格内右对齐、单位格内左对齐，列间小缝。
 */
function MetricTrendValueUnit({
  item,
  display,
  unit,
  suiteTight,
}: {
  item?: TelemetryTagItem;
  display: string;
  unit: string;
  /** 套间标题行胶囊：收窄列距，避免把时间戳挤换行 */
  suiteTight?: boolean;
}) {
  const tc = suiteTight ? SUITE_HDR_TREND_COL : METRIC_TREND_COL;
  const vc = suiteTight ? SUITE_HDR_VALUE_COL : METRIC_VALUE_COL;
  const uc = suiteTight ? SUITE_HDR_UNIT_COL : METRIC_UNIT_COL;
  return (
    <div
      className={cn("grid shrink-0 items-center justify-self-end", suiteTight ? "gap-x-px" : "gap-x-0.5")}
      style={{
        gridTemplateColumns: `${tc} ${vc} ${uc}`,
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: tc,
          minWidth: tc,
          height: tc,
          minHeight: tc,
        }}
      >
        <ValueTrendMark trend={interventionValueTrendForDisplay(item)} size="md" />
      </div>
      <div
        className="flex min-h-[1.25rem] items-center justify-end overflow-hidden"
        style={{ width: vc, minWidth: vc, maxWidth: vc }}
      >
        <span
          data-animal-telemetry-value=""
          className={cn(
            "min-w-0 truncate text-right font-mono text-sm font-semibold tabular-nums tracking-tight text-zinc-900",
            cnTelemetryAlarmBand(item)
          )}
        >
          {display}
        </span>
      </div>
      <div
        className="flex min-h-[1.25rem] items-center justify-start"
        style={{ width: uc, minWidth: uc, maxWidth: uc }}
      >
        {unit ? (
          <span className="min-w-0 truncate text-left text-sm font-medium tabular-nums text-zinc-500">{unit}</span>
        ) : (
          <span className="block w-full min-w-0" aria-hidden />
        )}
      </div>
    </div>
  );
}

function MetricDetailFields({ item }: { item: TelemetryTagItem }) {
  const qc = useQueryClient();
  const vn = (item.variableName || "").trim();
  const bundle = (item.bundleCode || "").trim();
  const tagId = item.watchlistTagId;
  const [minOv, setMinOv] = useState(item.alarmOverrideMin ?? "");
  const [maxOv, setMaxOv] = useState(item.alarmOverrideMax ?? "");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [overrideFocus, setOverrideFocus] = useState<null | "min" | "max">(null);

  useEffect(() => {
    setMinOv(item.alarmOverrideMin ?? "");
    setMaxOv(item.alarmOverrideMax ?? "");
    setSaveErr(null);
    setOverrideFocus(null);
  }, [item.alarmOverrideMin, item.alarmOverrideMax, vn]);

  const archiveQuery = useTelemetryArchiveRollingSeries(vn, {
    windowHours: ARCHIVE_WINDOW_HOURS,
    maxPoints: ARCHIVE_MAX_POINTS,
    pollMs: ARCHIVE_POLL_MS,
  });
  const series = archiveQuery.data;
  const archivePoints = series?.points ?? [];

  const chartData = useMemo(() => {
    return archivePoints
      .map((p) => {
        const tMs = Date.parse(p.t);
        return { tMs, v: p.value ?? null, t: p.t };
      })
      .filter((row) => Number.isFinite(row.tMs));
  }, [archivePoints]);

  const xDomain = useMemo((): [number, number] | undefined => {
    const qf = series?.queriedFrom;
    const qt = series?.queriedTo;
    if (!qf || !qt) return undefined;
    const a = Date.parse(qf);
    const b = Date.parse(qt);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
    return [Math.min(a, b), Math.max(a, b)];
  }, [series?.queriedFrom, series?.queriedTo]);

  /** 本窗折线数据的实际最低/最高采样点（虚线 ReferenceLine），非报警阈值 */
  const { chartYMin, chartYMax, yAxisDomain } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of chartData) {
      const v = row.v;
      if (v != null && Number.isFinite(Number(v))) {
        const n = Number(v);
        lo = Math.min(lo, n);
        hi = Math.max(hi, n);
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      return { chartYMin: null as number | null, chartYMax: null as number | null, yAxisDomain: undefined as [number, number] | undefined };
    }
    const pad = Math.max((hi - lo) * 0.08, 0.35);
    return {
      chartYMin: lo,
      chartYMax: hi,
      yAxisDomain: [lo - pad, hi + pad] as [number, number],
    };
  }, [chartData]);

  const dl = (item.displayLabel || "").trim();
  const q = (item.qualityCode || "").trim();
  const err = (item.error || "").trim();
  const amin = (item.alarmMinValue || "").trim();
  const amax = (item.alarmMaxValue || "").trim();
  const aminVn = (item.alarmMinVariableName || "").trim();
  const amaxVn = (item.alarmMaxVariableName || "").trim();
  const canSave = Boolean(bundle && tagId != null);

  async function onSaveOverrides() {
    if (!canSave || !vn || tagId == null) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const saved = await patchWatchlistTagAlarmOverrides(bundle, tagId, {
        alarmOverrideMin: minOv.trim() || null,
        alarmOverrideMax: maxOv.trim() || null,
      });
      const batch = await queryWatchlistAlarmLimits([vn], { [vn]: item.value ?? "" });
      const entry = batch.byVariableName[vn];
      // 保存后仅合并当前行；同步 viewChunks 内嵌 item，避免服务端 tabs 下 UI 与 tagItems 脱节（post-save-no-full-refresh.mdc）
      qc.setQueryData(ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY, (old: AnimalRoomTelemetryPageDto | undefined) => {
        if (!old?.tagItems) return old;
        return mergeTelemetryTagRowsIntoAnimalRoomPageDto(old, [
          {
            variableName: vn,
            alarmMinValue: entry?.alarmMinValue ?? item.alarmMinValue,
            alarmMaxValue: entry?.alarmMaxValue ?? item.alarmMaxValue,
            alarmOutOfRange: entry?.alarmOutOfRange ?? item.alarmOutOfRange,
            alarmBand: entry?.alarmBand ?? item.alarmBand,
            alarmOverrideMin: saved.alarmOverrideMin ?? null,
            alarmOverrideMax: saved.alarmOverrideMax ?? null,
          } as TelemetryTagItem,
        ]);
      });
      setOverrideFocus(null);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <dl className="space-y-1.5 text-[11px] leading-snug text-zinc-700">
        <div>
          <dt className="font-medium text-zinc-500">测点时刻</dt>
          <dd className="mt-0.5 font-mono text-zinc-900">{formatTelemetryTs(item.timestamp)}</dd>
        </div>
        {dl ? (
          <div>
            <dt className="font-medium text-zinc-500">展示名</dt>
            <dd className="mt-0.5 text-zinc-800">{dl}</dd>
          </div>
        ) : null}
      </dl>

      <div className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50/80 p-2">
        <div className="mb-1 text-[10px] font-semibold text-zinc-600">近 {ARCHIVE_WINDOW_HOURS} 小时归档</div>
        <div className="mb-1 text-[9px] leading-tight text-zinc-400">
          服务端定窗查询并降采样；每 {ARCHIVE_POLL_MS / 1000}s 自动刷新。虚线对齐本窗数据的最低/最高采样点。
        </div>
        <div className="h-[88px] w-full">
          {archiveQuery.isError ? (
            <div className="text-[10px] text-zinc-400">暂无曲线数据</div>
          ) : archiveQuery.isPending ? (
            <div className="text-[10px] text-zinc-400">加载中…</div>
          ) : chartData.length === 0 ? (
            <div className="text-[10px] text-zinc-400">尚无归档点</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 2, left: 0, bottom: 14 }}>
                <XAxis
                  type="number"
                  dataKey="tMs"
                  domain={xDomain ?? ["dataMin", "dataMax"]}
                  tick={{ fontSize: 9, fill: "#71717a" }}
                  tickFormatter={(ms) =>
                    new Date(ms).toLocaleString(undefined, {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                <YAxis hide domain={yAxisDomain ?? ["auto", "auto"]} />
                {chartYMin != null ? <ReferenceLine y={chartYMin} stroke="#94a3b8" strokeDasharray="4 3" /> : null}
                {chartYMax != null ? <ReferenceLine y={chartYMax} stroke="#94a3b8" strokeDasharray="4 3" /> : null}
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(value: unknown) => [
                    value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(1),
                    "值",
                  ]}
                  labelFormatter={(ms) =>
                    typeof ms === "number" && Number.isFinite(ms)
                      ? formatTelemetryTs(new Date(ms).toISOString())
                      : String(ms)
                  }
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="#0ea5e9"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <dl className="space-y-1.5 text-[11px] leading-snug text-zinc-700">
        {amin || amax ? (
          <div>
            <dt className="font-medium text-zinc-500">当前有效报警限</dt>
            <dd className="mt-0.5 space-y-1 text-zinc-800">
              {amin ? (
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                  <span>下限：</span>
                  {canSave ? (
                    <button
                      type="button"
                      className="font-mono text-[11px] font-semibold text-sky-700 underline decoration-sky-400/80 underline-offset-2 hover:text-sky-900"
                      onClick={() => {
                        setOverrideFocus("min");
                        setMinOv(item.alarmOverrideMin ?? "");
                      }}
                    >
                      {amin}
                    </button>
                  ) : (
                    <span className="font-mono text-[11px]">{amin}</span>
                  )}
                  {overrideFocus === "min" && canSave ? (
                    <span className="flex w-full flex-wrap items-center gap-1.5 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1">
                      <input
                        value={minOv}
                        onChange={(e) => setMinOv(e.target.value)}
                        className="h-6 w-[5.5rem] shrink-0 rounded border border-zinc-200 px-1 font-mono text-[11px]"
                        placeholder="空则清除"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onSaveOverrides()}
                        className="rounded bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverrideFocus(null)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-800"
                      >
                        取消
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {amax ? (
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                  <span>上限：</span>
                  {canSave ? (
                    <button
                      type="button"
                      className="font-mono text-[11px] font-semibold text-sky-700 underline decoration-sky-400/80 underline-offset-2 hover:text-sky-900"
                      onClick={() => {
                        setOverrideFocus("max");
                        setMaxOv(item.alarmOverrideMax ?? "");
                      }}
                    >
                      {amax}
                    </button>
                  ) : (
                    <span className="font-mono text-[11px]">{amax}</span>
                  )}
                  {overrideFocus === "max" && canSave ? (
                    <span className="flex w-full flex-wrap items-center gap-1.5 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1">
                      <input
                        value={maxOv}
                        onChange={(e) => setMaxOv(e.target.value)}
                        className="h-6 w-[5.5rem] shrink-0 rounded border border-zinc-200 px-1 font-mono text-[11px]"
                        placeholder="空则清除"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onSaveOverrides()}
                        className="rounded bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverrideFocus(null)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-800"
                      >
                        取消
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {aminVn ? (
                <div className="break-all font-mono text-[10px] text-zinc-500">配对下限变量名：{aminVn}</div>
              ) : null}
              {amaxVn ? (
                <div className="break-all font-mono text-[10px] text-zinc-500">配对上限变量名：{amaxVn}</div>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium text-zinc-500">变量名（调试）</dt>
          <dd className="mt-0.5 break-all font-mono text-[10px] text-zinc-600">{item.variableName || "—"}</dd>
        </div>
        {q ? (
          <div>
            <dt className="font-medium text-zinc-500">质量码</dt>
            <dd className="mt-0.5 font-mono">{q}</dd>
          </div>
        ) : null}
        {err ? (
          <div>
            <dt className="font-medium text-rose-600">错误</dt>
            <dd className="mt-0.5 text-rose-800">{err}</dd>
          </div>
        ) : null}
      </dl>

      {saveErr ? <div className="text-[10px] text-rose-600">{saveErr}</div> : null}
      {!canSave && (amin || amax) ? (
        <p className="text-[10px] text-zinc-500">未绑定清单行 ID 时不可改覆盖；请使用 database 源并刷新快照。</p>
      ) : null}
    </div>
  );
}

/** 无遮罩：固定定位详情层，实底不透明 */
function MetricInfoPopover({ item, label }: { item: TelemetryTagItem; label: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const reposition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const panelW = 300;
    const margin = 10;
    let left = r.right - panelW;
    if (left < margin) left = margin;
    if (left + panelW > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - panelW - margin);
    }
    const estH = 400;
    let top = r.bottom + 8;
    if (top + estH > window.innerHeight - margin) {
      top = Math.max(margin, r.top - estH - 8);
    }
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScrollResize = () => reposition();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open, reposition]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-label={`「${label}」测点详情`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-sky-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        <Info className="h-4 w-4" strokeWidth={2} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`${label} 详情`}
            data-twin-animal-telemetry-popover
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 300,
              zIndex: 400,
            }}
            className="pointer-events-auto max-h-[min(75vh,520px)] overflow-y-auto rounded-xl border border-zinc-300 bg-white p-3.5 text-left shadow-xl shadow-zinc-900/15"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-2 border-b border-zinc-100 pb-2 text-xs font-semibold text-zinc-900">{label}</div>
            <MetricDetailFields item={item} />
          </div>,
          document.body
        )}
    </>
  );
}

function MetricRow({
  label,
  value,
  item,
  detailLabel,
  metricKindCode,
  roomDisplayTitle,
}: {
  label: string;
  value: string;
  item?: TelemetryTagItem;
  detailLabel: string;
  metricKindCode?: string | null;
  /** 设定值等：与房间展示名组合（如「201 · 设定值」） */
  roomDisplayTitle?: string | null;
}) {
  const winccW = useContext(WinccAnimalRoomWriteContext);
  const dialogs = useTelemetryDialogs();
  const pageUi = useAnimalRoomTelemetryPageUi();
  const { unit, Icon } = metricStyleFromKind(metricKindCode ?? null, label);
  const kr = (item?.kindRole || "").trim().toUpperCase();
  const mk = (metricKindCode || "").trim().toUpperCase();
  /** 与小程序 enrichMetricMet：kind_role 或 metric_kind.code 任一为 SETPOINT 即视为设定值 */
  const isSetpoint = kr === "SETPOINT" || mk === "SETPOINT";
  const roomPart = (roomDisplayTitle || "").trim();
  const isSw = isSwitchTelemetryMetric(
    item?.kindRole,
    metricKindCode,
    label,
    item?.displayLabel ?? undefined,
    item?.variableName ?? undefined
  );
  const statusText =
    !isSw &&
    isStatusTelemetryMetric(metricKindCode, item?.metricKindLabel ?? label)
      ? formatTelemetryStatusOnOff(item?.value ?? value)
      : null;
  const display = statusText ?? formatTelemetryValueOneDecimal(value);
  const labelForRow = isSw ? stripSwitchMetricLabel(label) : label;
  const rowLabel =
    isSetpoint && roomPart ? `${roomPart} · ${labelForRow}` : labelForRow;
  const vnSetpoint = (item?.variableName || "").trim();
  const setpointEditable = isSetpoint && winccW?.canWrite && !!vnSetpoint;

  const isSwitch = isSw;
  const tri = parseWinccSwitchTriState(item?.value);
  const switchChecked = tri === true;
  const switchUnknown = tri === null;
  const switchDisabled = switchUnknown || !winccW?.canWrite || !(item?.variableName || "").trim();

  const middle = isSwitch ? (
    <div className="flex min-h-[1.25rem] items-center justify-end">
      <WinccStripSwitch
        checked={switchChecked}
        unknown={switchUnknown}
        disabled={switchDisabled}
        onCommit={async (next) => {
          const vn = (item?.variableName || "").trim();
          if (!vn || !winccW?.canWrite) return;
          const ok = pageUi
            ? await dialogs.confirmWinccSwitch({
                body: winccSwitchConfirmBody(next, item),
                lastFetchText: `页面最近拉取：${pageUi.lastFetchFormatted}`,
                onRefresh: () => pageUi.refreshTagByVariableName(vn),
              })
            : await dialogs.confirm("", winccSwitchConfirmBodyFallback(next, item, "—"));
          if (!ok) return;
          try {
            await winccW.writeTag(vn, next ? 1 : 0);
          } catch (e) {
            await dialogs.alertMessage(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </div>
  ) : setpointEditable ? (
    <button
      type="button"
      title="点击数值修改设定值（提交至 WinCC）"
      className="flex min-h-[1.25rem] cursor-pointer justify-end rounded border border-transparent bg-transparent text-left hover:border-sky-200 hover:bg-sky-50/80"
      onClick={async () => {
        const def = String(item!.value ?? "").trim();
        const raw = pageUi
          ? await dialogs.promptWinccSetpoint({
              title: "修改设定值",
              label: rowLabel || detailLabel,
              defaultValue: def,
              lastFetchText: `页面最近拉取：${pageUi.lastFetchFormatted}`,
              onRefresh: () => pageUi.refreshTagByVariableName(vnSetpoint),
            })
          : await dialogs.promptString("修改设定值", rowLabel || detailLabel, def);
        if (raw == null) return;
        const t = String(raw).trim();
        if (!t) return;
        try {
          await winccW!.writeTag(vnSetpoint, t);
        } catch (e) {
          await dialogs.alertMessage(e instanceof Error ? e.message : String(e));
        }
      }}
    >
      <MetricTrendValueUnit item={item} display={display} unit={unit} />
    </button>
  ) : (
    <MetricTrendValueUnit item={item} display={display} unit={unit} />
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)_auto] items-center gap-x-1.5 border-b border-zinc-100 py-0.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-zinc-600">
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
        {rowLabel}
      </span>
      {middle}
      <div className="flex shrink-0 items-center justify-end gap-0.5">
        {item && !isSwitch ? (
          <MetricInfoPopover item={item} label={detailLabel} />
        ) : (
          <span className="inline-flex h-7 w-7 shrink-0" aria-hidden />
        )}
      </div>
    </div>
  );
}

/** 单间横排：房间越多略压宽度；指标越多略增宽度（rem） */
/** 开关展示名：去掉清单 label_zh 里「（读写值）」「·读写值」等（库内常为「开关（读写值）」，仅靠行尾「读写值」无法匹配） */
function stripSwitchMetricLabel(label: string): string {
  return label
    .replace(/[（(]\s*读写值\s*[）)]/gu, "")
    .replace(/[·•]\s*读写值\s*$/u, "")
    .replace(/\s*读写值\s*$/u, "")
    .trim();
}

/** WinCC 开关二次确认：确认启动/关闭 + 楼层 + 房间（无标题行，仅正文一行） */
function winccSwitchConfirmBody(next: boolean, item?: TelemetryTagItem): string {
  const floor = (item?.floorCode ?? "").trim() || "—";
  const rc = (item?.roomCanonical ?? "").trim();
  const room = stripLeadingSuitePrefixFromRoomDisplay(rc) || rc || "—";
  return next ? `确认启动${floor}${room}?` : `确认关闭${floor}${room}?`;
}

/** 无 PageUi 上下文时的兜底：正文附带最近拉取说明 */
function winccSwitchConfirmBodyFallback(next: boolean, item: TelemetryTagItem | undefined, lastTs: string): string {
  return `${winccSwitchConfirmBody(next, item)}\n\n（页面最近拉取：${lastTs}）`;
}

/** WinCC 布尔开关：不展示原文 true/false，仅用于驱动开关 UI */
function parseWinccSwitchTriState(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (t === "" || t === "—" || t === "\u2014" || t === "-") return null;
  if (t === "开") return true;
  if (t === "关") return false;
  const u = t.toLowerCase();
  if (u === "1" || u === "true" || u === "on" || u === "yes") return true;
  if (u === "0" || u === "false" || u === "off" || u === "no") return false;
  const n = Number(t.replace(/,/g, "."));
  if (n === 1) return true;
  if (n === 0) return false;
  return null;
}

/** WinCC 布尔开关：整块按钮，绿开 / 红关；未知态灰底（与小程序语义一致） */
function WinccStripSwitch({
  checked,
  disabled,
  unknown,
  onCommit,
}: {
  checked: boolean;
  disabled?: boolean;
  /** 无法解析 true/false 时避免误显示为「关」红态 */
  unknown?: boolean;
  onCommit: (next: boolean) => void;
}) {
  const dragRef = useRef(false);
  const startX = useRef(0);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "开" : "关"}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
        dragRef.current = false;
        startX.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (disabled || e.buttons !== 1) return;
        if (Math.abs(e.clientX - startX.current) > 5) dragRef.current = true;
      }}
      onPointerUp={(e) => {
        if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
        let next = !checked;
        if (dragRef.current) {
          const r = e.currentTarget.getBoundingClientRect();
          next = e.clientX >= r.left + r.width * 0.5;
        }
        dragRef.current = false;
        if (next !== checked) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onCommit(!checked);
        }
      }}
      className={cn(
        "h-7 min-w-[3rem] shrink-0 touch-pan-y rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors duration-200 select-none",
        unknown
          ? "border-zinc-300 bg-zinc-200 text-zinc-600"
          : checked
            ? "border-emerald-700 bg-emerald-600 text-white"
            : "border-rose-700 bg-rose-600 text-white",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer active:opacity-95"
      )}
    />
  );
}

function soloRoomCardWidthRem(totalRooms: number, maxMetricCount: number): number {
  const m = Math.max(1, maxMetricCount);
  let w = 8.75 + m * 1.85;
  if (totalRooms >= 14) w -= 2.25;
  else if (totalRooms >= 10) w -= 1.75;
  else if (totalRooms >= 7) w -= 1.25;
  else if (totalRooms >= 4) w -= 0.75;
  return Math.min(20, Math.max(9.25, w));
}

function StructuredRoomCard({
  card,
  className,
  widthMode = "solo",
}: {
  card: TelemetryStructuredRoomCard;
  className?: string;
  /** grid：套间内旧式铺满列；suiteRow：固定 rem；suiteRowFill/soloFill：父级 flex/grid 内均分宽 */
  widthMode?: "grid" | "solo" | "soloFill" | "suiteRow" | "suiteRowFill";
}) {
  const metricsOrdered = useMemo(
    () => [...card.metrics].sort(compareMetricsInRoomRowOrder),
    [card.metrics]
  );
  const roomFx = useMemo(() => inferAnimalTelemetryRoomFx(card.displayTitle ?? ""), [card.displayTitle]);
  const airFx = roomFx === "supply-air" || roomFx === "exhaust-air";
  const fxVariant = useAnimalTelemetryFxIconVariant();
  const boilerSteamSciFi =
    fxVariant === "scifi" && /锅炉房/.test(String(card.displayTitle ?? ""));
  return (
    <article
      data-animal-card-fx={roomFx}
      data-animal-boiler-steam-scifi={boilerSteamSciFi ? "1" : undefined}
      className={cn(
        "relative overflow-hidden flex min-h-0 flex-col rounded-lg border border-zinc-200/90 bg-white p-2 shadow-sm ring-1 ring-zinc-950/[0.03]",
        widthMode === "grid" && "w-full min-w-0 max-w-none",
        widthMode === "solo" && "w-[min(100%,var(--telemetry-solo-w,15rem))] shrink-0",
        /** 单间分区：网格单元内拉满，由父级 grid 均分宽度 */
        widthMode === "soloFill" && "w-full min-w-0",
        widthMode === "suiteRow" && "w-[var(--telemetry-suite-room-w,17rem)] shrink-0",
        widthMode === "suiteRowFill" && "w-full min-w-0",
        className
      )}
    >
      <span className="animal-telemetry-fiber-wave pointer-events-none absolute inset-0 z-0 rounded-[inherit]" aria-hidden />
      <header className="relative z-10 mb-0.5 flex min-w-0 items-center gap-2 border-b border-zinc-100 pb-1">
        <AnimalTelemetryRoomFxIcon kind={roomFx} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{card.displayTitle}</h3>
      </header>
      <div className="relative z-10 min-h-0 flex-1">
        {metricsOrdered.map((m) => {
          const isSt = isStatusTelemetryMetric(m.metricKindCode, m.item?.metricKindLabel);
          const label =
            (isSt ? statusMetricSlotDisplayLabel(m.item) : "") ||
            (m.metricKindLabel ?? m.metricKindCode) ||
            "—";
          const detailLabel = isSt
            ? (m.item?.metricKindLabel?.trim() || m.metricKindCode || "—")
            : label;
          return (
            <MetricRow
              key={`${m.item.variableName}-${m.metricKindCode}`}
              label={label}
              value={m.item.value ?? "—"}
              item={m.item}
              detailLabel={detailLabel}
              metricKindCode={m.metricKindCode}
              roomDisplayTitle={card.displayTitle ?? card.roomCanonical}
            />
          );
        })}
      </div>
      {airFx ? (
        <div
          className={cn(
            "animal-telemetry-wind-field pointer-events-none absolute inset-0 rounded-[inherit]",
            roomFx === "supply-air" ? "animal-telemetry-wind-field--supply" : "animal-telemetry-wind-field--exhaust"
          )}
          aria-hidden
        >
          <AnimalTelemetryWindStreamSvg variant={roomFx === "supply-air" ? "supply" : "exhaust"} />
        </div>
      ) : null}
    </article>
  );
}

function LegacyRoomCard({ card, className }: { card: TelemetryRoomCardModel; className?: string }) {
  const roomFx = useMemo(() => inferAnimalTelemetryRoomFx(card.displayTitle ?? ""), [card.displayTitle]);
  return (
    <article
      data-animal-card-fx={roomFx}
      className={cn(
        "relative overflow-hidden flex min-h-0 w-[min(100%,15rem)] shrink-0 flex-col rounded-lg border border-zinc-200/90 bg-white p-2 shadow-sm ring-1 ring-zinc-950/[0.03]",
        className
      )}
    >
      <span className="animal-telemetry-fiber-wave pointer-events-none absolute inset-0 z-0 rounded-[inherit]" aria-hidden />
      <header className="relative z-10 mb-0.5 flex min-w-0 items-center gap-2 border-b border-zinc-100 pb-1">
        <AnimalTelemetryRoomFxIcon kind={roomFx} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{card.displayTitle}</h3>
      </header>
      <div className="relative z-10 min-h-0 flex-1">
        <MetricRow label="温度" value={card.temp?.value ?? "—"} item={card.temp} detailLabel="温度" metricKindCode="TEMP" />
        <MetricRow label="湿度" value={card.hum?.value ?? "—"} item={card.hum} detailLabel="湿度" metricKindCode="HUM" />
      </div>
    </article>
  );
}

/** 套间标题行胶囊：SWITCH 整块色块按钮 + 页内确认；>4 个参数时收紧间距 */
function SuiteTitleMetricPill({
  m,
  compactTitleSlots,
}: {
  m: TelemetryStructuredMetricSlot;
  compactTitleSlots?: boolean;
}) {
  const dialogs = useTelemetryDialogs();
  const winccW = useContext(WinccAnimalRoomWriteContext);
  const pageUi = useAnimalRoomTelemetryPageUi();
  const rawLabel = m.metricKindLabel ?? m.metricKindCode ?? "";
  const label = stripSwitchMetricLabel(rawLabel);
  const { unit, Icon } = metricStyleFromKind(m.metricKindCode, rawLabel);
  const krSlot = (m.item?.kindRole || "").trim().toUpperCase();
  const mkSlot = (m.metricKindCode || "").trim().toUpperCase();
  /** 与 MetricRow / 小程序：code 或 kind_role 任一为 SETPOINT */
  const isSetpointSlot = krSlot === "SETPOINT" || mkSlot === "SETPOINT";
  const vnSetpointSlot = (m.item?.variableName || "").trim();

  if (
    isSwitchTelemetryMetric(
      m.item?.kindRole,
      m.metricKindCode,
      rawLabel,
      m.item?.displayLabel ?? undefined,
      m.item?.variableName ?? undefined
    )
  ) {
    const tri = parseWinccSwitchTriState(m.item?.value);
    const checked = tri === true;
    const vn = (m.item?.variableName || "").trim();
    const unknown = tri === null;
    const disabled = unknown || !winccW?.canWrite || !vn;
    return (
      <button
        type="button"
        disabled={disabled}
        title={label}
        onClick={async (e) => {
          e.stopPropagation();
          if (disabled || !vn || !winccW?.canWrite) return;
          const next = !checked;
          const ok = pageUi
            ? await dialogs.confirmWinccSwitch({
                body: winccSwitchConfirmBody(next, m.item),
                lastFetchText: `页面最近拉取：${pageUi.lastFetchFormatted}`,
                onRefresh: () => pageUi.refreshTagByVariableName(vn),
              })
            : await dialogs.confirm("", winccSwitchConfirmBodyFallback(next, m.item, "—"));
          if (!ok) return;
          try {
            await winccW.writeTag(vn, next ? 1 : 0);
          } catch (err) {
            await dialogs.alertMessage(err instanceof Error ? err.message : String(err));
          }
        }}
        className={cn(
          "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs shadow-sm transition-colors",
          unknown && "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500",
          !unknown && checked && "border-emerald-700 bg-emerald-600 text-white",
          !unknown && !checked && "border-rose-700 bg-rose-600 text-white",
          !disabled && !unknown && "cursor-pointer hover:opacity-95 active:opacity-90"
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            unknown ? "text-zinc-400" : "text-white/95"
          )}
          aria-hidden
        />
        <span className="min-w-0 max-w-[10rem] shrink truncate font-medium">{label}</span>
      </button>
    );
  }

  if (isSetpointSlot && winccW?.canWrite && vnSetpointSlot) {
    const roomPart = stripLeadingSuitePrefixFromRoomDisplay(m.item?.roomCanonical ?? "") || "";
    const rowLabel = roomPart ? `${roomPart} · ${label}` : label;
    const displaySp = formatTelemetryValueOneDecimal(m.item.value);
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center rounded-md border border-zinc-200/80 bg-white/90 text-xs shadow-sm",
          "gap-0.5 px-1.5 py-0.5"
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
        <span className="shrink-0 text-zinc-500">{rawLabel}</span>
        <button
          type="button"
          title="点击数值修改设定值（提交至 WinCC）"
          className="rounded border border-transparent hover:border-sky-200 hover:bg-sky-50/80"
          onClick={async (e) => {
            e.stopPropagation();
            const def = String(m.item?.value ?? "").trim();
            const raw = pageUi
              ? await dialogs.promptWinccSetpoint({
                  title: "修改设定值",
                  label: rowLabel || rawLabel,
                  defaultValue: def,
                  lastFetchText: `页面最近拉取：${pageUi.lastFetchFormatted}`,
                  onRefresh: () => pageUi.refreshTagByVariableName(vnSetpointSlot),
                })
              : await dialogs.promptString("修改设定值", rowLabel || rawLabel, def);
            if (raw == null) return;
            const t = String(raw).trim();
            if (!t) return;
            try {
              await winccW!.writeTag(vnSetpointSlot, t);
            } catch (err) {
              await dialogs.alertMessage(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          <MetricTrendValueUnit item={m.item} display={displaySp} unit={unit} suiteTight />
        </button>
        <MetricInfoPopover item={m.item} label={rawLabel} />
      </span>
    );
  }

  const display =
    (isStatusTelemetryMetric(m.metricKindCode, rawLabel)
      ? formatTelemetryStatusOnOff(m.item?.value)
      : null) ?? formatTelemetryValueOneDecimal(m.item.value);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border border-zinc-200/80 bg-white/90 text-xs shadow-sm",
        "gap-0.5 px-1.5 py-0.5"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
      <span className="shrink-0 text-zinc-500">{rawLabel}</span>
      <MetricTrendValueUnit item={m.item} display={display} unit={unit} suiteTight />
      <MetricInfoPopover item={m.item} label={rawLabel} />
    </span>
  );
}

/**
 * 套间壳：默认宽度随内容（w-max）；fillGridCell 时占满父级 flex 格，用于一行内多套间平分宽度。
 */
function SuiteSection({
  tabKey,
  prepared,
  fillGridCell = false,
  facilityLayoutRules,
}: {
  tabKey: string;
  prepared: PreparedSuite;
  fillGridCell?: boolean;
  /** 用于识别动力站套间（四间时改 2×2 网格，避免一行挤满） */
  facilityLayoutRules?: FacilityLayoutRulesV1;
}) {
  const { suite, titleSlots, visibleRooms } = prepared;
  const compactTitleSlots = titleSlots.length > 4;
  const suiteLatest = suiteLatestMsPrepared(prepared);
  const suiteFx = useMemo(
    () =>
      inferAnimalTelemetryRoomFx(
        suite.suiteTitle,
        ...visibleRooms.map((c) => c.displayTitle ?? "")
      ),
    [suite.suiteTitle, visibleRooms]
  );
  const n = visibleRooms.length;
  const layoutRulesForSuite = facilityLayoutRules ?? DEFAULT_FACILITY_LAYOUT_RULES_V1;
  const fxVariant = useAnimalTelemetryFxIconVariant();
  const boilerSteamSciFi =
    fxVariant === "scifi" && suiteIsBoilerRoomSuite(suite, layoutRulesForSuite);
  const powerStationFourRoomsTwoRows =
    fillGridCell && n === 4 && suiteIsPowerStationSuite(suite, layoutRulesForSuite);
  const maxM = n > 0 ? Math.max(1, ...visibleRooms.map((r) => r.metrics.length)) : 1;
  const suiteRoomWRem = n > 0 ? soloRoomCardWidthRem(n, maxM) : 15;
  const roomRow =
    n >= 2 ? (
      fillGridCell ? (
        <div
          className={cn(
            "grid w-full min-w-0 gap-2 pb-0.5",
            powerStationFourRoomsTwoRows && "grid-cols-2"
          )}
          style={
            powerStationFourRoomsTwoRows
              ? undefined
              : { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }
          }
        >
          {visibleRooms.map((card) => (
            <div key={`${tabKey}-${card.roomCanonical}-cell`} className="min-w-0">
              <StructuredRoomCard card={card} widthMode="suiteRowFill" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex w-full min-w-0 gap-2 pb-0.5">
          {visibleRooms.map((card) => (
            <div key={`${tabKey}-${card.roomCanonical}-cell`} className="min-w-0 flex-1 basis-0">
              <StructuredRoomCard card={card} widthMode="suiteRowFill" />
            </div>
          ))}
        </div>
      )
    ) : n === 1 ? (
      fillGridCell ? (
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 pb-0.5">
          <div className="min-w-0">
            <StructuredRoomCard card={visibleRooms[0]!} widthMode="suiteRowFill" />
          </div>
        </div>
      ) : (
        <div
          className="flex flex-wrap content-start justify-start gap-2 pb-0.5"
          style={{ "--telemetry-suite-room-w": `${suiteRoomWRem}rem` } as CSSProperties}
        >
          <StructuredRoomCard
            key={`${tabKey}-${visibleRooms[0]!.roomCanonical}`}
            card={visibleRooms[0]!}
            widthMode="solo"
          />
        </div>
      )
    ) : (
      <div className="flex flex-wrap content-start justify-start gap-2 pb-0.5">
        {visibleRooms.map((card) => (
          <StructuredRoomCard
            key={`${tabKey}-${card.roomCanonical}`}
            card={card}
            widthMode="suiteRow"
          />
        ))}
      </div>
    );

  return (
    <section
      data-animal-card-fx={suiteFx}
      data-animal-suite-boiler-steam={boilerSteamSciFi ? "1" : undefined}
      className={cn(
        "shrink-0 rounded-xl border border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-950/[0.04]",
        boilerSteamSciFi && "relative isolate overflow-hidden",
        fillGridCell ? "w-full min-w-0 max-w-none" : "w-max"
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-nowrap items-center justify-between gap-x-2 border-b border-zinc-100 bg-zinc-50/80 px-3 py-2",
          fillGridCell ? "w-full min-w-0 max-w-full" : "w-max max-w-full"
        )}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
            <div
            className={cn(
              "flex min-w-0 flex-nowrap items-center overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]",
              compactTitleSlots ? "gap-x-1" : "gap-x-1.5"
            )}
          >
            <AnimalTelemetryRoomFxIcon kind={suiteFx} />
            <h2 className="shrink-0 whitespace-nowrap text-sm font-semibold text-zinc-900">
              {stripSuiteTitlePrefixForDisplay(suite.suiteTitle)}
            </h2>
            {titleSlots.map((m) => (
              <SuiteTitleMetricPill
                key={`${m.item.variableName}-${m.metricKindCode}`}
                m={m}
                compactTitleSlots={compactTitleSlots}
              />
            ))}
          </div>
        </div>
        <div className="ml-1 shrink-0 whitespace-nowrap text-right text-[10px] text-zinc-500">
          <span className="block leading-tight text-zinc-400">本套最新</span>
          <span className="font-mono leading-tight text-zinc-800">
            {suiteLatest != null ? new Date(suiteLatest).toLocaleString() : "—"}
          </span>
        </div>
      </div>
      <div className="min-w-0 p-2">{roomRow}</div>
    </section>
  );
}

function SoloBalancedPartition({
  tabKey,
  label,
  zoneSub,
  cards,
  chunkKey,
  /** 单间卡网格每行最多列数；动物房半栏与 relay「三拼」一致，默认 3 */
  maxGridCols = ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW,
}: {
  tabKey: string;
  label: string;
  zoneSub?: string;
  cards: TelemetryStructuredRoomCard[];
  chunkKey: string;
  maxGridCols?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const minCardPx = soloMinCardPxForPartition(label);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setCw(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(
    () =>
      rowSplitsForBalancedSoloGrid(cards, cw, minCardPx, {
        maxCols: maxGridCols,
        /** 半栏固定最多 3 列；余 1 独占末行、余 2 末行并排两张；不因容器宽度被压成 2 列 */
        forceFixedMaxCols: maxGridCols === ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW,
      }),
    [cards, cw, minCardPx, maxGridCols]
  );

  const showTitle = Boolean(label?.trim());
  return (
    <div
      ref={wrapRef}
      className="w-full min-w-0 rounded-lg border border-dashed border-zinc-300/70 bg-zinc-50/30 px-2 py-1.5"
    >
      {showTitle ? <p className="mb-1 text-[11px] font-medium text-zinc-500">{label}</p> : null}
      {zoneSub ? <p className="mb-0.5 text-[10px] leading-snug text-zinc-400">{zoneSub}</p> : null}
      <div className="w-full min-w-0 space-y-2">
        {rows.map((row, ri) => (
          <div
            key={`${chunkKey}-${label}-r${ri}`}
            className="grid w-full min-w-0 gap-2"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((card) => (
              <StructuredRoomCard
                key={`${tabKey}-${card.roomCanonical}`}
                card={card}
                widthMode="soloFill"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 分区/楼层标识卡：半幅体量，与套间、单间同一接力行内排版（夹在机组之间） */
function AnimalRoomTelemetryZoneCard({ tabKey, zoneLabel }: { tabKey: string; zoneLabel: string }) {
  const z = zoneLabel.trim() || "—";
  const isHvac = tabKey.trim() === ANIMAL_ROOM_HVAC_TAB_KEY;
  const sciFi = useSyncExternalStore(subscribeAnimalTelemetryHtmlSciFiAttr, readAnimalTelemetryHtmlSciFiAttr, () => false);
  return (
    <div
      data-animal-telemetry-zone-card
      role="note"
      aria-label={isHvac ? `机房楼层 ${z}` : `分区 ${z}`}
      className={cn(
        "relative w-full max-w-[min(100%,50%)] shrink-0 overflow-hidden rounded-lg border shadow-sm backdrop-blur-sm",
        sciFi
          ? "border-cyan-500/30 bg-gradient-to-r from-slate-950/95 via-slate-900/85 to-slate-950/90 ring-1 ring-cyan-400/18"
          : isHvac
            ? "border-zinc-300/75 bg-gradient-to-r from-white/92 via-zinc-50/82 to-white/88 ring-1 ring-zinc-900/[0.05]"
            : "border-zinc-200/90 bg-white/85 ring-1 ring-zinc-900/[0.04]"
      )}
    >
      <div
        className={cn(
          "absolute bottom-0 left-0 top-0 w-[3px] rounded-l-lg",
          sciFi
            ? "bg-gradient-to-b from-cyan-400 via-sky-500 to-cyan-600 shadow-[0_0_10px_rgba(34,211,238,0.32)]"
            : isHvac
              ? "bg-gradient-to-b from-sky-500 via-sky-500 to-cyan-600"
              : "bg-sky-500"
        )}
        aria-hidden
      />
      <div className="px-2.5 py-1.5 pl-[13px] sm:px-3 sm:py-2 sm:pl-[14px]">
        <p
          className={cn(
            "text-[9px] font-semibold uppercase tracking-[0.14em]",
            sciFi ? "text-cyan-200/85" : "text-zinc-500"
          )}
        >
          {isHvac ? "楼层" : "分区"}
        </p>
        <p
          className={cn(
            "mt-0.5 text-xs font-semibold leading-snug tracking-tight sm:text-[13px]",
            sciFi ? "text-slate-50" : "text-zinc-900"
          )}
        >
          {z}
        </p>
      </div>
    </div>
  );
}

/** 渲染服务端 GET /animal-room 下发的 tabs[].viewChunks（单栏；双栏外层见 HubFloorDualColumnContent） */
function HubFloorContent({
  tabKey,
  chunks,
  suiteFillGridCell = false,
  facilityLayoutRules,
}: {
  tabKey: string;
  chunks: AnimalRoomHubViewChunk[];
  /** 双列打包行内并排套间时均分宽度 */
  suiteFillGridCell?: boolean;
  facilityLayoutRules?: FacilityLayoutRulesV1;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 pb-1">
      {chunks.map((ch) => {
        if (ch.kind === "zoneBand" || ch.kind === "zoneCard") {
          return (
            <AnimalRoomTelemetryZoneCard key={ch.key} tabKey={tabKey} zoneLabel={String(ch.zoneLabel ?? "—")} />
          );
        }
        if (ch.kind === "suite" && ch.prepared) {
          return (
            <SuiteSection
              key={ch.key}
              tabKey={tabKey}
              prepared={ch.prepared}
              fillGridCell={suiteFillGridCell}
              facilityLayoutRules={facilityLayoutRules}
            />
          );
        }
        if (ch.kind === "chromeSuiteRow" && ch.list?.length) {
          return (
            <div key={ch.key} className="flex w-full min-w-0 gap-2 pb-0.5">
              {ch.list.map((cell, cellIdx) => {
                const micro = cell.webSoloMicroGrid?.filter(Boolean) ?? [];
                const sidePrep = cell.webSidecarPreparedSuites?.filter(Boolean) ?? [];
                if (micro.length > 0) {
                  return (
                    <div
                      key={`${ch.key}-webSoloMicro-${cellIdx}`}
                      className="min-w-0 flex-1 basis-0"
                    >
                      <div className="grid h-full min-h-0 w-full min-w-0 grid-cols-2 gap-2">
                        {micro.map((card) => (
                          <StructuredRoomCard
                            key={`${tabKey}-${card.roomCanonical}-micro`}
                            card={card}
                            widthMode="soloFill"
                          />
                        ))}
                      </div>
                    </div>
                  );
                }
                if (sidePrep.length > 0) {
                  return (
                    <div
                      key={`${ch.key}-webSidecarPrep-${cellIdx}`}
                      className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-2"
                    >
                      {sidePrep.map((ps, pi) => (
                        <SuiteSection
                          key={`${tabKey}-${ps.suite.suiteNorm}-sideprep-${pi}`}
                          tabKey={tabKey}
                          prepared={ps}
                          fillGridCell
                          facilityLayoutRules={facilityLayoutRules}
                        />
                      ))}
                    </div>
                  );
                }
                if (cell.prepared) {
                  return (
                    <div
                      key={`${tabKey}-${cell.prepared.suite.suiteNorm}`}
                      className="min-w-0 flex-1 basis-0"
                    >
                      <SuiteSection
                        tabKey={tabKey}
                        prepared={cell.prepared}
                        fillGridCell
                        facilityLayoutRules={facilityLayoutRules}
                      />
                    </div>
                  );
                }
                return null;
              })}
            </div>
          );
        }
        if (ch.kind === "solos" && ch.partitions?.length) {
          return (
            <div key={ch.key} className="flex w-full min-w-0 flex-col gap-2">
              {ch.partitions.map((part) => {
                const cards = (part.rows ?? []).flatMap((row) => row.cards ?? []);
                return (
                  <SoloBalancedPartition
                    key={`${ch.key}-${part.label}`}
                    chunkKey={ch.key}
                    tabKey={tabKey}
                    label={part.label}
                    zoneSub={part.zoneSub ?? undefined}
                    cards={cards}
                  />
                );
              })}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/** Hub 接力列：套间在格内撑满宽度；默认按左右列估算高度平衡分列；`relaySplit: 'leftFirst'` 时为顺序 ⌈n/2⌉ 且列内每行一单（纵向） */
function HubPackedColumn({
  tabKey,
  rows,
  aria,
  facilityLayoutRules,
}: {
  tabKey: string;
  rows: AnimalRoomHubViewChunk[][];
  aria: string;
  facilityLayoutRules?: FacilityLayoutRulesV1;
}) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2" aria-label={aria}>
      {rows.map((cells, ri) => (
        <div
          key={`r-${ri}-${cells.map((c) => c.key).join("-")}`}
          className={cn("flex w-full min-w-0 gap-2", cells.length === 1 && "flex-col")}
        >
          {cells.map((ch) => (
            <div
              key={ch.key}
              className={cn(
                "min-w-0",
                cells.length >= 2 && cells.length <= 3 ? "flex-1 basis-0" : "w-full",
                hubChunkIsZoneCard(ch) && cells.length === 1 && "self-start"
              )}
            >
              <HubFloorContent
                tabKey={tabKey}
                chunks={[ch]}
                suiteFillGridCell={ch.kind === "suite"}
                facilityLayoutRules={facilityLayoutRules}
              />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/**
 * 区域带全宽；**与其它楼层 Tab 相同**：双栏默认按左右列估算高度平衡分列（与结构化楼层一致）。
 * 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
 */
function HubFloorDualColumnContent({
  tabKey,
  chunks,
  facilityLayoutRules,
}: {
  tabKey: string;
  chunks: AnimalRoomHubViewChunk[];
  facilityLayoutRules?: FacilityLayoutRulesV1;
}) {
  const rows = useMemo(() => buildAnimalRoomHubRelayRows(chunks, { tabKey }), [chunks, tabKey]);
  return (
    <div className="flex min-w-0 flex-col gap-2 pb-1">
      {rows.map((row) => {
        const { leftRows, rightRows } = row;
        const leftEmpty = leftRows.length === 0 || leftRows.every((r) => r.length === 0);
        const rightEmpty = rightRows.length === 0 || rightRows.every((r) => r.length === 0);
        if (leftEmpty && rightEmpty) return null;
        if (rightEmpty) {
          return (
            <HubPackedColumn
              key={row.key}
              tabKey={tabKey}
              rows={leftRows}
              aria="第一顺序（左列优先）"
              facilityLayoutRules={facilityLayoutRules}
            />
          );
        }
        if (leftEmpty) {
          return (
            <HubPackedColumn
              key={row.key}
              tabKey={tabKey}
              rows={rightRows}
              aria="第二顺序"
              facilityLayoutRules={facilityLayoutRules}
            />
          );
        }
        return (
          <div
            key={row.key}
            className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch lg:gap-x-4"
          >
            <div className="flex min-h-0 min-w-0 flex-col lg:h-full">
              <HubPackedColumn
                tabKey={tabKey}
                rows={leftRows}
                aria="第一顺序（左列优先）"
                facilityLayoutRules={facilityLayoutRules}
              />
            </div>
            <div
              className="flex min-h-0 min-w-0 flex-col gap-2 border-t border-zinc-200/80 pt-3 lg:h-full lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
              aria-label="第二顺序（接力列）"
            >
              <HubPackedColumn
                tabKey={tabKey}
                rows={rightRows}
                aria="第二顺序（接力列）"
                facilityLayoutRules={facilityLayoutRules}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StructuredFloorChunksContent({
  tabKey,
  chunks,
  suiteFillGridCell = false,
  facilityLayoutRules,
}: {
  tabKey: string;
  chunks: FloorChunk[];
  suiteFillGridCell?: boolean;
  facilityLayoutRules?: FacilityLayoutRulesV1;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 pb-1">
      {chunks.map((ch) => {
        if (ch.kind === "zoneBand" || ch.kind === "zoneCard") {
          return <AnimalRoomTelemetryZoneCard key={ch.key} tabKey={tabKey} zoneLabel={ch.zoneLabel} />;
        }
        if (ch.kind === "suite") {
          return (
            <SuiteSection
              key={ch.key}
              tabKey={tabKey}
              prepared={ch.prepared}
              fillGridCell={suiteFillGridCell}
              facilityLayoutRules={facilityLayoutRules}
            />
          );
        }
        if (ch.kind === "chromeSuiteRow") {
          return (
            <div key={ch.key} className="flex w-full min-w-0 gap-2 pb-0.5">
              {ch.preparedList.map((ps) => (
                <div key={`${tabKey}-${ps.suite.suiteNorm}`} className="min-w-0 flex-1 basis-0">
                  <SuiteSection tabKey={tabKey} prepared={ps} fillGridCell facilityLayoutRules={facilityLayoutRules} />
                </div>
              ))}
            </div>
          );
        }
        if (ch.kind === "solos") {
          return (
            <div key={ch.key} className="flex w-full min-w-0 flex-col gap-2">
              {ch.partitions.map((part) => (
                <SoloBalancedPartition
                  key={`${ch.key}-${part.label}`}
                  chunkKey={ch.key}
                  tabKey={tabKey}
                  label={part.label}
                  zoneSub={part.zoneSub}
                  cards={part.cards}
                />
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function StructuredPackedColumn({
  tabKey,
  rows,
  aria,
  facilityLayoutRules,
}: {
  tabKey: string;
  rows: FloorChunk[][];
  aria: string;
  facilityLayoutRules?: FacilityLayoutRulesV1;
}) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2" aria-label={aria}>
      {rows.map((cells, ri) => (
        <div
          key={`sr-${ri}-${cells.map((c) => c.key).join("-")}`}
          className={cn("flex w-full min-w-0 gap-2", cells.length === 1 && "flex-col")}
        >
          {cells.map((ch) => (
            <div
              key={ch.key}
              className={cn(
                "min-w-0",
                cells.length >= 2 && cells.length <= 3 ? "flex-1 basis-0" : "w-full",
                floorChunkIsZoneCard(ch) && cells.length === 1 && "self-start"
              )}
            >
              <StructuredFloorChunksContent
                tabKey={tabKey}
                chunks={[ch]}
                suiteFillGridCell={ch.kind === "suite"}
                facilityLayoutRules={facilityLayoutRules}
              />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/** 结构化楼层双栏：与 Hub 同 relay（含机房 Tab） */
function StructuredFloorDualColumnContent({
  tab,
  facilityLayoutRules,
}: {
  tab: TelemetryStructuredFloorTab;
  facilityLayoutRules: FacilityLayoutRulesV1;
}) {
  const chunks = useMemo(
    () =>
      buildFloorChunks(tab, {
        webBasementFacilityLayout: true,
        facilityLayoutRules,
        emitZoneBands: true,
      }),
    [tab, facilityLayoutRules]
  );
  const rows = useMemo(() => buildAnimalRoomFloorRelayRows(chunks, { tabKey: tab.tabKey }), [chunks, tab.tabKey]);
  return (
    <div className="flex min-w-0 flex-col gap-2 pb-1">
      {rows.map((row) => {
        const { leftRows, rightRows } = row;
        const leftEmpty = leftRows.length === 0 || leftRows.every((r) => r.length === 0);
        const rightEmpty = rightRows.length === 0 || rightRows.every((r) => r.length === 0);
        if (leftEmpty && rightEmpty) return null;
        if (rightEmpty) {
          return (
            <StructuredPackedColumn
              key={row.key}
              tabKey={tab.tabKey}
              rows={leftRows}
              aria="第一顺序（左列优先）"
              facilityLayoutRules={facilityLayoutRules}
            />
          );
        }
        if (leftEmpty) {
          return (
            <StructuredPackedColumn
              key={row.key}
              tabKey={tab.tabKey}
              rows={rightRows}
              aria="第二顺序"
              facilityLayoutRules={facilityLayoutRules}
            />
          );
        }
        return (
          <div
            key={row.key}
            className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch lg:gap-x-4"
          >
            <div className="flex min-h-0 min-w-0 flex-col lg:h-full">
              <StructuredPackedColumn
                tabKey={tab.tabKey}
                rows={leftRows}
                aria="第一顺序（左列优先）"
                facilityLayoutRules={facilityLayoutRules}
              />
            </div>
            <div
              className="flex min-h-0 min-w-0 flex-col gap-2 border-t border-zinc-200/80 pt-3 lg:h-full lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
              aria-label="第二顺序（接力列）"
            >
              <StructuredPackedColumn
                tabKey={tab.tabKey}
                rows={rightRows}
                aria="第二顺序（接力列）"
                facilityLayoutRules={facilityLayoutRules}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StructuredFloorContent({
  tab,
  facilityLayoutRules,
}: {
  tab: TelemetryStructuredFloorTab;
  facilityLayoutRules: FacilityLayoutRulesV1;
}) {
  return <StructuredFloorDualColumnContent tab={tab} facilityLayoutRules={facilityLayoutRules} />;
}

export default function AnimalRoomTelemetryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const returnToPath = useMemo(() => {
    const st = (location.state as { returnTo?: string } | null)?.returnTo?.trim();
    if (st) return st;
    try {
      const s = sessionStorage.getItem(ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY);
      return s?.trim() || null;
    } catch {
      return null;
    }
  }, [location.state, location.key]);

  const handleReturnToPriorPage = useCallback(() => {
    if (!returnToPath) return;
    try {
      sessionStorage.removeItem(ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY);
    } catch {
      /* ignore */
    }
    navigate(returnToPath, { replace: true });
  }, [navigate, returnToPath]);

  const [gateTick, setGateTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setGateTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const winccWriteCtx = useMemo<WinccAnimalRoomWriteCtx>(
    () => ({
      canWrite: hasMinRole(authStorage.getRole(), "SUPER_ADMIN"),
      writeTag: async (variableName: string, value: unknown) => {
        const key = ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY;
        const prevPage = queryClient.getQueryData<AnimalRoomTelemetryPageDto>(key);
        const prevItem = prevPage?.tagItems?.find(
          (it) => (it.variableName || "").trim() === (variableName || "").trim()
        );
        const kindRole = String(prevItem?.kindRole || "SETPOINT").trim().toUpperCase() || "SETPOINT";

        const mergeTagRow = (row: TelemetryTagItem) => {
          // 保存后仅合并当前行 + viewChunks 内嵌 item，禁止整表 load/refetch（post-save-no-full-refresh.mdc）
          queryClient.setQueryData(key, (old: AnimalRoomTelemetryPageDto | undefined) => {
            if (!old?.tagItems?.length) return old;
            return mergeTelemetryTagRowsIntoAnimalRoomPageDto(old, [row]);
          });
        };

        const row = await postWinccWriteTag(variableName, value);
        mergeTagRow(row);
        if (winccWrittenValueMatches(kindRole, value, row.value)) return;

        await pollWinccSnapshotUntilWrittenValueMatches(variableName, value, kindRole, {
          onEachSnapshotRow: mergeTagRow,
        });
      },
    }),
    [queryClient]
  );

  const pageQ = useQuery({
    queryKey: ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY,
    queryFn: () =>
      fetchWinccAnimalRoomTelemetry({ soloWidthPx: 960, hubClient: "web" }),
    staleTime: 8_000,
    placeholderData: (prev) => prev,
    retry: 1,
    refetchInterval: (query) => {
      void gateTick;
      const d = query.state.data;
      if (!d || d.winccEnabled === false) return false;
      const ms = d.pollIntervalMs;
      if (ms == null || ms <= 0) return false;
      const hasTabs = (d.tabs?.length ?? 0) > 0;
      const hasItems = (d.tagItems?.length ?? 0) > 0;
      if (!hasTabs && !hasItems) return false;
      return Math.max(5_000, ms);
    },
  });

  if (pageQ.isError) {
    console.warn("[AnimalRoomTelemetry] GET /animal-room failed", pageQ.error);
  }

  const page = pageQ.data;

  const facilityLayoutRulesQ = useQuery({
    queryKey: ["telemetry", "facilityLayoutRules"] as const,
    queryFn: fetchFacilityLayoutRules,
    staleTime: 300_000,
    retry: 1,
  });
  const facilityLayoutRules = facilityLayoutRulesQ.data ?? DEFAULT_FACILITY_LAYOUT_RULES_V1;

  const refreshTagByVariableName = useCallback(
    async (vn: string) => {
      await fetchAndMergeSingleWinccTagIntoAnimalRoomCache(queryClient, vn);
    },
    [queryClient]
  );

  const animalRoomPageUiValue = useMemo(
    () => ({
      lastFetchFormatted: page?.fetchedAt ? formatTelemetryTs(page.fetchedAt) : "—",
      refreshTagByVariableName,
    }),
    [page?.fetchedAt, refreshTagByVariableName]
  );

  const serverTabs = page?.tabs ?? [];
  const useServerTabs = pageQ.isSuccess && serverTabs.length > 0;

  const legacyTabs = useMemo(() => buildTelemetryBundleTabs(page?.tagItems), [page?.tagItems]);
  const structTabs = useMemo(
    () => buildStructuredFloorTabs(page?.tagItems, facilityLayoutRules),
    [page?.tagItems, facilityLayoutRules]
  );

  const displayServerTabs = useMemo(() => {
    const base = page?.tabs ?? [];
    const hv = buildSyntheticHvacHubTab(base, facilityLayoutRules, { emitSourceTabBands: true });
    return hv ? [...base, hv] : base;
  }, [page?.tabs, facilityLayoutRules]);

  const displayStructTabs = useMemo(() => {
    const hv = buildSyntheticHvacStructTab(structTabs, facilityLayoutRules);
    return hv ? [...structTabs, hv] : structTabs;
  }, [structTabs, facilityLayoutRules]);

  const useStructuredLocal = !useServerTabs && structTabs.length > 0;
  const useLegacy = !useServerTabs && !useStructuredLocal && legacyTabs.length > 0;

  const headerSubtitle = useMemo(() => {
    if (useServerTabs) {
      return winccWriteCtx.canWrite
        ? "服务端分页 · 超级管理员可写开关/设定值"
        : "只读 · 服务端分页与排版";
    }
    if (structTabs.length > 0) {
      return winccWriteCtx.canWrite
        ? "本地结构化 · 超级管理员可写开关/设定值"
        : "只读 · 本地结构化排版";
    }
    return winccWriteCtx.canWrite ? "超级管理员可写开关/设定值" : "只读 · 温湿度数据";
  }, [useServerTabs, structTabs.length, winccWriteCtx.canWrite]);

  const legacyTotalCards = useMemo(() => legacyTabs.reduce((n, t) => n + t.cards.length, 0), [legacyTabs]);
  const structTotalCards = useMemo(
    () => structTabs.reduce((n, t) => n + t.suiteGroups.reduce((m, s) => m + s.rooms.length, 0), 0),
    [structTabs]
  );
  const serverTotalRooms = useMemo(() => serverTabs.reduce((n, t) => n + t.roomCount, 0), [serverTabs]);

  const itemCount = page?.tagItems?.length ?? 0;
  const [activeTab, setActiveTab] = useState(0);

  const tabCount = useServerTabs
    ? displayServerTabs.length
    : useStructuredLocal
      ? displayStructTabs.length
      : legacyTabs.length;

  useEffect(() => {
    if (activeTab >= tabCount) {
      setActiveTab(Math.max(0, tabCount - 1));
    }
  }, [tabCount, activeTab]);

  const currentServerTab = useServerTabs ? displayServerTabs[activeTab] : null;
  const currentStruct = useStructuredLocal ? displayStructTabs[activeTab] : null;
  const currentLegacy = useLegacy ? legacyTabs[activeTab] : null;

  /** 楼层 Tab 展示层去掉机房套间，避免与「机房」Tab 重复卡片 */
  const hubChunksForFloorDisplay = useMemo(() => {
    if (!useServerTabs || !currentServerTab) return [] as AnimalRoomHubViewChunk[];
    const raw = currentServerTab.viewChunks ?? [];
    if ((currentServerTab.tabKey || "").trim() === ANIMAL_ROOM_HVAC_TAB_KEY) return raw;
    return filterHubChunksExcludeHvacUnits(raw, facilityLayoutRules);
  }, [useServerTabs, currentServerTab, facilityLayoutRules]);

  const structTabForFloorDisplay = useMemo(() => {
    if (!currentStruct) return null;
    if ((currentStruct.tabKey || "").trim() === ANIMAL_ROOM_HVAC_TAB_KEY) return currentStruct;
    const groups = currentStruct.suiteGroups ?? [];
    const filtered = groups.filter((g: TelemetryStructuredSuiteGroup) => !isHvacMechanicalSuiteGroup(g, facilityLayoutRules));
    if (filtered.length === groups.length) return currentStruct;
    return { ...currentStruct, suiteGroups: filtered };
  }, [currentStruct, facilityLayoutRules]);

  /** 默认开启；仅当用户曾勾选关闭时 sessionStorage 为 "0" */
  const [highFreqVisibleTabPoll, setHighFreqVisibleTabPoll] = useState(() => {
    try {
      if (typeof sessionStorage === "undefined") return true;
      return sessionStorage.getItem(HIGH_FREQ_TAB_POLL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const persistHighFreqVisibleTabPoll = useCallback((v: boolean) => {
    try {
      sessionStorage.setItem(HIGH_FREQ_TAB_POLL_STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    setHighFreqVisibleTabPoll(v);
  }, []);

  const [headerLogoFailed, setHeaderLogoFailed] = useState(false);

  /** 切换分区 Tab 时自动开启 10s 定点拉数（仍仅请求当前分区变量） */
  const selectPartitionTab = useCallback(
    (idx: number) => {
      setActiveTab(idx);
      persistHighFreqVisibleTabPoll(true);
    },
    [persistHighFreqVisibleTabPoll]
  );

  const partitionDockItems = useMemo((): AnimalRoomTelemetryPartitionDockItem[] => {
    if (useServerTabs) {
      return displayServerTabs.map((t, i) => {
        const label = (t.title || t.tabKey || "—").trim() || "—";
        return {
          key: (t.tabKey || `tab-${i}`).trim() || `tab-${i}`,
          label,
          displayLabel: partitionDockElevatorDisplayLabel(label),
          index: i,
        };
      });
    }
    if (useStructuredLocal) {
      return displayStructTabs.map((t, i) => {
        const label = (t.title || t.bundleTitle || t.tabKey || "—").trim() || "—";
        return {
          key: (t.tabKey || `stab-${i}`).trim() || `stab-${i}`,
          label,
          displayLabel: partitionDockElevatorDisplayLabel(label),
          index: i,
        };
      });
    }
    if (useLegacy) {
      return legacyTabs.map((t, i) => {
        const label = (t.bundleTitle || t.bundleCode || "—").trim() || "—";
        return {
          key: (t.bundleCode || `leg-${i}`).trim() || `leg-${i}`,
          label,
          displayLabel: partitionDockElevatorDisplayLabel(label),
          index: i,
        };
      });
    }
    return [];
  }, [useServerTabs, useStructuredLocal, useLegacy, displayServerTabs, displayStructTabs, legacyTabs]);

  /** 当前选中的标签页（分区）对应的 variableName 列表，用于 snapshot?variableNames 定点拉取 */
  const visibleTabVariableNames = useMemo(() => {
    if (!page?.tagItems?.length) return [] as string[];
    const out = new Set<string>();
    const add = (it: TelemetryTagItem) => {
      const v = (it.variableName || "").trim();
      if (v) out.add(v);
    };
    if (useServerTabs && currentServerTab?.tabKey) {
      const tk = currentServerTab.tabKey.trim();
      if (tk === ANIMAL_ROOM_HVAC_TAB_KEY) {
        return collectVariableNamesFromHubChunks(currentServerTab.viewChunks ?? []);
      }
      const tkl = tk.toLowerCase();
      for (const it of page.tagItems) {
        const fk = floorTabKeyForTelemetryItem(it);
        if (fk && fk.toLowerCase() === tkl) add(it);
      }
      return Array.from(out);
    }
    if (useStructuredLocal && currentStruct?.tabKey) {
      const tk = currentStruct.tabKey.trim();
      if (tk === ANIMAL_ROOM_HVAC_TAB_KEY) {
        return collectVariableNamesFromStructuredSuites(currentStruct.suiteGroups ?? []);
      }
      const tkl = tk.toLowerCase();
      for (const it of page.tagItems) {
        const fk = floorTabKeyForTelemetryItem(it);
        if (fk && fk.toLowerCase() === tkl) add(it);
      }
      return Array.from(out);
    }
    if (useLegacy && currentLegacy) {
      const bc = (currentLegacy.bundleCode || "").trim();
      for (const it of page.tagItems) {
        const b = (it.bundleCode || "").trim() || "_csv";
        if (b === bc) add(it);
      }
      return Array.from(out);
    }
    return [];
  }, [
    page?.tagItems,
    useServerTabs,
    useStructuredLocal,
    useLegacy,
    currentServerTab?.tabKey,
    currentStruct?.tabKey,
    currentLegacy?.bundleCode,
  ]);

  const visibleTabVariableNamesKey = useMemo(
    () => [...visibleTabVariableNames].sort().join("\0"),
    [visibleTabVariableNames]
  );

  useEffect(() => {
    if (!highFreqVisibleTabPoll || page?.winccEnabled === false) return;
    const names = visibleTabVariableNames;
    if (!names.length) return;

    const mergeSnapshotRows = (rows: TelemetryTagItem[]) => {
      if (!rows.length) return;
      // 高频拉数：合并 tagItems + tabs.viewChunks 内嵌 item，禁止整表 refetch（post-save-no-full-refresh.mdc）
      queryClient.setQueryData(ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY, (old: AnimalRoomTelemetryPageDto | undefined) => {
        if (!old?.tagItems?.length) return old;
        return mergeTelemetryTagRowsIntoAnimalRoomPageDto(old, rows);
      });
    };

    const tick = async () => {
      try {
        const acc: TelemetryTagItem[] = [];
        // names 仅含当前选中分区 tabKey/bundle 对应变量，禁止扩大为全页 tagItems
        for (let i = 0; i < names.length; i += SNAPSHOT_VARIABLE_NAMES_CHUNK) {
          const chunk = names.slice(i, i + SNAPSHOT_VARIABLE_NAMES_CHUNK);
          const snap = await fetchWinccTelemetrySnapshot({
            sync: true,
            variableNames: chunk.join(","),
          });
          if (snap.items?.length) acc.push(...snap.items);
        }
        mergeSnapshotRows(acc);
      } catch {
        /* 单次失败静默 */
      }
    };

    void tick();
    const id = window.setInterval(tick, HIGH_FREQ_VISIBLE_TAB_POLL_MS);
    return () => window.clearInterval(id);
  }, [
    highFreqVisibleTabPoll,
    page?.winccEnabled,
    visibleTabVariableNamesKey,
    activeTab,
    queryClient,
  ]);

  const hasAnyCards =
    (useServerTabs && serverTotalRooms > 0) || structTotalCards > 0 || legacyTotalCards > 0;

  const bootLoading = !page && pageQ.isPending;

  const showRefreshing = pageQ.isFetching && hasAnyCards;

  const showMisconfigHint =
    !bootLoading && !useServerTabs && itemCount > 0 && legacyTotalCards === 0 && structTotalCards === 0;

  const telemetryFxIconVariant = useSyncExternalStore(
    subscribeAnimalTelemetryHtmlSciFiAttr,
    readAnimalTelemetryHtmlSciFiAttr,
    () => false
  );

  return (
    <AnimalTelemetryFxIconVariantContext.Provider value={telemetryFxIconVariant ? "scifi" : "standard"}>
    <AnimalRoomTelemetryPageUiContext.Provider value={animalRoomPageUiValue}>
      <WinccAnimalRoomWriteContext.Provider value={winccWriteCtx}>
        <TelemetryDialogsProvider>
    <div
      data-twin-animal-telemetry-root
      data-animal-telemetry-ui={telemetryFxIconVariant ? "scifi" : "standard"}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden text-zinc-900",
        telemetryFxIconVariant
          ? "bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100"
          : "bg-gradient-to-b from-zinc-100 via-zinc-50 to-zinc-100/90"
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/80",
          telemetryFxIconVariant
            ? "border-cyan-500/20 bg-slate-950/88 supports-[backdrop-filter]:bg-slate-950/72"
            : "border-zinc-200/90 bg-white/90 supports-[backdrop-filter]:bg-white/80"
        )}
      >
        <div className="w-full px-2 py-1 sm:px-3">
          <div className="flex flex-nowrap items-center gap-2 sm:gap-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
              <div
                className={cn(
                  "relative box-border flex shrink-0 items-center leading-none text-base sm:text-lg",
                  "h-[1em] max-h-[1.75rem] w-auto max-w-[min(8rem,38vw)] min-w-0 overflow-hidden sm:max-w-[9rem]",
                  telemetryFxIconVariant && "rounded-sm ring-1 ring-cyan-400/25"
                )}
              >
                {!headerLogoFailed ? (
                  <img
                    src={SHSMU_LOGO_URL}
                    alt="上海医学院"
                    width={320}
                    height={96}
                    decoding="async"
                    className={cn(
                      "h-full w-auto max-w-full object-contain object-left",
                      telemetryFxIconVariant && "brightness-0 invert opacity-95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    )}
                    onError={() => setHeaderLogoFailed(true)}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-full w-full min-w-[1.25em] items-center justify-center rounded bg-gradient-to-br text-[10px] font-bold text-white shadow-inner sm:text-[11px]",
                      telemetryFxIconVariant
                        ? "from-cyan-600 to-sky-800 ring-1 ring-cyan-400/30"
                        : "from-sky-500 to-sky-700"
                    )}
                    aria-hidden
                  >
                    医
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <h1
                  className={cn(
                    "animal-telemetry-page-title truncate text-base font-extrabold leading-none sm:text-lg",
                    telemetryFxIconVariant
                      ? "bg-gradient-to-r from-cyan-100 via-sky-200 to-cyan-100 bg-clip-text text-transparent"
                      : "bg-gradient-to-r from-slate-800 via-sky-700 to-slate-800 bg-clip-text text-transparent"
                  )}
                >
                  动物房温湿度监测
                </h1>
                <p
                  className={cn(
                    "mt-0 truncate text-[10px] leading-tight sm:text-[11px]",
                    telemetryFxIconVariant ? "text-cyan-100/65" : "text-zinc-500"
                  )}
                >
                  {headerSubtitle}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {page?.fetchedAt ? (
                <span
                  className={cn(
                    "inline-flex max-w-[7.5rem] min-w-0 items-center gap-1 rounded-full px-1.5 py-0 font-mono text-[10px] ring-1 sm:max-w-[11rem] sm:px-2 sm:text-[11px]",
                    telemetryFxIconVariant
                      ? "bg-slate-800/90 text-cyan-50/90 ring-cyan-500/25"
                      : "bg-zinc-100/90 text-zinc-700 ring-zinc-200/80"
                  )}
                  title={`最近拉取 ${formatTelemetryTs(page.fetchedAt)}`}
                >
                  <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 truncate">{formatTelemetryTs(page.fetchedAt)}</span>
                </span>
              ) : null}
              {showRefreshing ? (
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap text-[10px] sm:text-[11px]",
                    telemetryFxIconVariant ? "text-cyan-300/80" : "text-sky-600"
                  )}
                >
                  刷新中…
                </span>
              ) : null}
              <label
                className={cn(
                  "inline-flex cursor-pointer select-none items-center gap-1 rounded-md border px-1.5 py-0 text-[10px] font-medium shadow-sm ring-zinc-900/5 sm:gap-1.5 sm:px-2 sm:text-[11px]",
                  telemetryFxIconVariant
                    ? "border-cyan-500/30 bg-slate-900/80 text-cyan-50/90"
                    : "border-zinc-200/90 bg-white text-zinc-700"
                )}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 shrink-0 rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
                  checked={highFreqVisibleTabPoll}
                  onChange={(e) => persistHighFreqVisibleTabPoll(e.target.checked)}
                  disabled={page?.winccEnabled === false}
                />
                <span className="hidden whitespace-nowrap sm:inline" title="仅请求当前标签页变量 snapshot，每 10 秒合并数值">
                  当前分区 10s 拉数
                </span>
                <span className="sm:hidden" title="当前分区 10 秒定点拉数">
                  10s
                </span>
              </label>
              {returnToPath ? (
                <button
                  type="button"
                  onClick={handleReturnToPriorPage}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold shadow-sm transition-colors sm:px-2 sm:text-xs",
                    telemetryFxIconVariant
                      ? "border-cyan-500/35 bg-slate-900/90 text-cyan-50 hover:bg-slate-800/95"
                      : "border-sky-200/90 bg-gradient-to-b from-sky-50 to-white text-sky-900 hover:from-sky-100 hover:to-sky-50"
                  )}
                  title="返回上一页"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="hidden min-[380px]:inline">返回</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main
        data-animal-telemetry-scroll="main"
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-3 pb-4 pt-1 sm:px-4 sm:pb-6 sm:pt-1.5"
      >
        {showMisconfigHint && (
          <div
            role="status"
            className="mb-2 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-sm ring-1 ring-amber-900/5"
          >
            服务端已有 {itemCount} 条测点，但未配置结构化字段（楼层 / 房间 / 指标类型）。请在后台 WinCC 变量表填写
            <strong>展示映射</strong>（非「无」）及<strong>楼层、房间、类别</strong>；保存后仅完整行参与拉数。
          </div>
        )}

        {useServerTabs && currentServerTab && (
          <HubFloorDualColumnContent
            tabKey={currentServerTab.tabKey}
            chunks={hubChunksForFloorDisplay}
            facilityLayoutRules={facilityLayoutRules}
          />
        )}

        {useStructuredLocal && structTabForFloorDisplay && (
          <StructuredFloorContent tab={structTabForFloorDisplay} facilityLayoutRules={facilityLayoutRules} />
        )}

        {useLegacy && currentLegacy && (
          <div className="flex flex-wrap content-start justify-start gap-2">
            {currentLegacy.cards.map((card) => (
              <LegacyRoomCard key={card.roomKey} card={card} />
            ))}
          </div>
        )}

        {pageQ.isError && !page ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/90 py-10 text-center">
            <p className="text-sm font-medium text-rose-900">加载失败</p>
            <p className="mt-1 max-w-sm text-xs text-rose-700">
              {pageQ.error instanceof Error ? pageQ.error.message : "请检查网络与后端 /api/v1/telemetry/wincc/animal-room"}
            </p>
          </div>
        ) : null}

        {!pageQ.isError && !bootLoading && tabCount === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white/60 py-10 text-center">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
              <Thermometer className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-zinc-600">暂无分区卡片数据</p>
            <p className="mt-0.5 max-w-sm text-xs text-zinc-400">请确认 WinCC 清单与展示映射已配置并参与拉数。</p>
          </div>
        )}

        {bootLoading && tabCount === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white/80 py-10 text-center">
            <div className="mb-2 h-9 w-9 animate-pulse rounded-lg bg-zinc-200" />
            <p className="text-sm text-zinc-500">加载中…</p>
          </div>
        )}
      </main>

      {tabCount > 0 ? (
        <AnimalRoomTelemetryPartitionDock
          scifi={telemetryFxIconVariant}
          items={partitionDockItems}
          activeIndex={activeTab}
          onSelect={selectPartitionTab}
        />
      ) : null}
    </div>
        </TelemetryDialogsProvider>
      </WinccAnimalRoomWriteContext.Provider>
    </AnimalRoomTelemetryPageUiContext.Provider>
    </AnimalTelemetryFxIconVariantContext.Provider>
  );
}
