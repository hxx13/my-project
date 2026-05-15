import type { QueryClient } from "@tanstack/react-query";
import axios from "axios";
import { authHttp } from "@/api/core/authHttp";
import type {
  FacilityLayoutRulesV1,
  PreparedSuite,
  TelemetrySnapshot,
  TelemetryStructuredMetricSlot,
  TelemetryStructuredRoomCard,
  TelemetryTagItem,
  TelemetryWinccDockPollConfig,
} from "@/telemetry-view/index";

export {
  buildStructuredFloorTabs,
  computeDockPollGate,
  DEFAULT_FACILITY_LAYOUT_RULES_V1,
  floorTabKeyForTelemetryItem,
  formatTelemetryStatusOnOff,
  hasStructuredTelemetryItem,
  isSwitchKindRole,
  isSwitchTelemetryMetric,
  isStatusTelemetryMetric,
  isBaseRoomCanonical,
  maxTelemetryItemTimestampsMs,
  normalizeFloorTabKey,
} from "@/telemetry-view/index";
export type {
  FacilityLayoutRulesV1,
  TelemetrySnapshot,
  TelemetryStructuredFloorTab,
  TelemetryStructuredMetricSlot,
  TelemetryStructuredRoomCard,
  TelemetryStructuredSuiteGroup,
  TelemetryTagItem,
  TelemetryWinccDockPollConfig,
} from "@/telemetry-view/index";

/** 与后端 TelemetryFacilityLayoutRulesService 合并默认值后的 JSON（动物房设施折叠/标题分级） */
export async function fetchFacilityLayoutRules(): Promise<FacilityLayoutRulesV1> {
  interface ResultBody<T> {
    code: number;
    success: boolean;
    message: string;
    data: T;
  }
  const res = await authHttp.get<ResultBody<FacilityLayoutRulesV1>>("/v1/telemetry/facility-layout-rules");
  return res.data.data;
}

export type TelemetryRoomCardModel = {
  roomKey: string;
  displayTitle: string;
  temp?: TelemetryTagItem;
  hum?: TelemetryTagItem;
};

export type TelemetryBundleTabModel = {
  bundleCode: string;
  bundleTitle: string;
  cards: TelemetryRoomCardModel[];
  wuVariableNames: string[];
  ungrouped: TelemetryTagItem[];
};

/** React Query：动物房页 GET /animal-room；前缀失效可带上 soloWidthPx 等后缀键 */
export const TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX = ["telemetry", "wincc", "animalRoom"] as const;

/** 与 AnimalRoomTelemetryPage 默认 soloWidthPx=960 一致 */
export const ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY = [...TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX, 960, "web"] as const;

/** Socket.IO：与 TelemetryWinCcSnapshotBroadcastService 事件名一致（定点合并 / 全量快照刷新） */
export const SOCKET_TELEMETRY_ANIMAL_ROOM_TAG_DELTA = "TELEMETRY_ANIMAL_ROOM_TAG_DELTA";
export const SOCKET_TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL = "TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL";

/** 按 WinCC 导入分区（bundleCode）分子标签页，每页内再解析房间卡片 */
export function buildTelemetryBundleTabs(
  items: TelemetryTagItem[] | null | undefined
): TelemetryBundleTabModel[] {
  const list = items?.length ? items : [];
  const byBundle = new Map<string, TelemetryTagItem[]>();
  for (const it of list) {
    const code = (it.bundleCode && String(it.bundleCode).trim()) || "_csv";
    if (!byBundle.has(code)) byBundle.set(code, []);
    byBundle.get(code)!.push(it);
  }
  const tabs: TelemetryBundleTabModel[] = [];
  for (const [bundleCode, sub] of byBundle) {
    const { cards, wuVariableNames, ungrouped } = buildTelemetryRoomCards(sub);
    const titleFrom = sub.find((x) => (x.bundleDisplayName ?? "").trim());
    const bundleTitle =
      titleFrom?.bundleDisplayName?.trim() ||
      (bundleCode === "_csv" ? "CSV / 内置清单" : bundleCode);
    tabs.push({ bundleCode, bundleTitle, cards, wuVariableNames, ungrouped });
  }
  tabs.sort((a, b) => a.bundleTitle.localeCompare(b.bundleTitle, "zh-CN"));
  return tabs;
}

type ApiResult<T> = {
  code?: number;
  success?: boolean;
  message?: string;
  data?: T;
};

export type FetchSnapshotOptions = {
  /** true：先让后端向 WinCC 拉取再返回（「立即刷新」用）；false：只读内存缓存 */
  sync?: boolean;
  /** 逗号分隔；sync=true 时仅对该批变量定点读 WinCC，响应仅含这些行（写入后轮询校验） */
  variableNames?: string;
};

/**
 * 动物房 WinCC 只读快照。
 * - sync=false：读服务端内存（定时任务已刷新）
 * - sync=true：默认全量刷新；若传 variableNames 则仅定点读回并返回子集
 */
export async function fetchWinccTelemetrySnapshot(
  options?: FetchSnapshotOptions
): Promise<TelemetrySnapshot> {
  const sync = options?.sync === true;
  const vn = options?.variableNames?.trim();
  const res = await axios.get<ApiResult<TelemetrySnapshot>>(
    "/api/v1/telemetry/wincc/snapshot",
    {
      params: {
        sync: sync ? "true" : "false",
        ...(vn ? { variableNames: vn } : {}),
      },
    }
  );
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "加载遥测快照失败");
  }
  return body.data;
}

/** 与小程序同源：`GET /api/v1/telemetry/wincc/animal-room-hub` 返回的 viewChunks */
export type AnimalRoomHubSoloRow = {
  cards: TelemetryStructuredRoomCard[];
};

export type AnimalRoomHubSoloPartition = {
  label: string;
  zoneSub?: string | null;
  rows: AnimalRoomHubSoloRow[];
};

export type AnimalRoomHubChromeCell = {
  prepared?: PreparedSuite | null;
  suiteLatestText?: string | null;
  /** Web hubClient=web：与末行带开关套间并排，单房间单测点小卡 2×2 */
  webSoloMicroGrid?: TelemetryStructuredRoomCard[] | null;
  /** Web：与末行「两间×三项」chrome 并排，标题槽+单间卡小套间（最多 3） */
  webSidecarPreparedSuites?: PreparedSuite[] | null;
};

export type AnimalRoomHubViewChunk = {
  kind: string;
  key: string;
  zoneLabel?: string | null;
  suiteHalfRow?: boolean | null;
  suiteLatestText?: string | null;
  prepared?: PreparedSuite;
  rowKind?: string | null;
  list?: AnimalRoomHubChromeCell[];
  partitions?: AnimalRoomHubSoloPartition[];
};

export type AnimalRoomHubTab = {
  tabKey: string;
  title: string;
  roomCount: number;
  suiteCount: number;
  viewChunks: AnimalRoomHubViewChunk[];
};

/** 与后端 {@link com.example.demo.modules.telemetry.animalroom.dto.AnimalRoomHubDto} 对齐 */
export type AnimalRoomHubDto = {
  snapshot: TelemetrySnapshot;
  dockPollConfig: TelemetryWinccDockPollConfig | null;
  structuredTabs: AnimalRoomHubTab[];
  clientPollIntervalMs?: number | null;
};

export type FetchAnimalRoomHubOptions = {
  sync?: boolean;
  /** 传给服务端拆单间行宽；Web 宜略大以便横排多列 */
  soloWidthPx?: number;
  campus?: string;
  /** web：启用带开关套间一行两套 + 末行侧栏 2×2 单间布局（小程序请勿传） */
  hubClient?: "web" | string;
};

/**
 * 动物房 Hub（与微信小程序同源）：快照 + 程序坞配置 + structuredTabs（含服务端组装的 viewChunks）。
 */
export async function fetchWinccAnimalRoomHub(
  options?: FetchAnimalRoomHubOptions
): Promise<AnimalRoomHubDto> {
  const sync = options?.sync === true;
  const soloWidthPx = options?.soloWidthPx ?? 960;
  const campus = options?.campus;
  const hubClient = options?.hubClient;
  const res = await axios.get<ApiResult<AnimalRoomHubDto>>("/api/v1/telemetry/wincc/animal-room-hub", {
    params: {
      sync: sync ? "true" : "false",
      soloWidthPx,
      ...(campus ? { campus } : {}),
      ...(hubClient ? { hubClient } : {}),
    },
  });
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "加载动物房 Hub 失败");
  }
  const d = body.data;
  return {
    ...d,
    structuredTabs: d.structuredTabs ?? [],
  };
}

/** 动物房温湿度页：`GET /api/v1/telemetry/wincc/animal-room`（扁平字段，无嵌套 snapshot） */
export type AnimalRoomTelemetryPageDto = {
  fetchedAt?: string | null;
  winccEnabled: boolean;
  tabs: AnimalRoomHubTab[];
  /** GET telemetryTabKey=__hvac_units__ 时机房合成块；Web/小程序与侧栏「机房」一致 */
  hvacMechanicalHubViewChunks?: unknown[] | null;
  tagItems: TelemetryTagItem[];
  pollIntervalMs?: number | null;
  runningStatusRooms?: unknown[] | null;
};

/**
 * 服务端 tabs 下 UI 从 viewChunks 内嵌的 item 渲染；仅改 tagItems 时开关等仍读旧引用（post-save-no-full-refresh.mdc）。
 * 将快照行按 variableName 合并进 tagItems，并同步所有 tabs[].viewChunks 中同一变量名的 slot.item。
 */
export function mergeTelemetryTagRowsIntoAnimalRoomPageDto(
  old: AnimalRoomTelemetryPageDto,
  rows: TelemetryTagItem[]
): AnimalRoomTelemetryPageDto {
  if (!old.tagItems?.length || !rows.length) return old;
  const byVn = new Map<string, TelemetryTagItem>();
  for (const row of rows) {
    const k = (row.variableName || "").trim().toLowerCase();
    if (k) byVn.set(k, row);
  }
  if (byVn.size === 0) return old;

  const nextTagItems = old.tagItems.map((it) => {
    const k = (it.variableName || "").trim().toLowerCase();
    const row = byVn.get(k);
    return row ? { ...it, ...row } : it;
  });

  const tabsIn = old.tabs ?? [];
  if (!tabsIn.length) {
    return { ...old, tagItems: nextTagItems };
  }

  const vnKey = (slot: TelemetryStructuredMetricSlot) =>
    (slot.item?.variableName || "").trim().toLowerCase();

  function preparedTouchesMap(ps: PreparedSuite): boolean {
    if (ps.titleSlots.some((s) => byVn.has(vnKey(s)))) return true;
    for (const room of ps.suite.rooms) {
      if (room.metrics.some((m) => byVn.has(vnKey(m)))) return true;
    }
    for (const card of ps.visibleRooms) {
      if (card.metrics.some((m) => byVn.has(vnKey(m)))) return true;
    }
    return false;
  }

  function mergeSlot(slot: TelemetryStructuredMetricSlot): TelemetryStructuredMetricSlot {
    const k = vnKey(slot);
    const row = k ? byVn.get(k) : undefined;
    if (!row) return slot;
    return { ...slot, item: { ...slot.item, ...row } };
  }

  function mergeCard(card: TelemetryStructuredRoomCard): TelemetryStructuredRoomCard {
    const metrics = card.metrics.map(mergeSlot);
    if (metrics.every((m, i) => m === card.metrics[i])) return card;
    return { ...card, metrics };
  }

  function mergePrepared(ps: PreparedSuite): PreparedSuite {
    if (!preparedTouchesMap(ps)) return ps;
    return {
      ...ps,
      suite: {
        ...ps.suite,
        rooms: ps.suite.rooms.map((room) => ({
          ...room,
          metrics: room.metrics.map(mergeSlot),
        })),
      },
      titleSlots: ps.titleSlots.map(mergeSlot),
      visibleRooms: ps.visibleRooms.map(mergeCard),
    };
  }

  function mergeChromeCell(cell: AnimalRoomHubChromeCell): AnimalRoomHubChromeCell {
    let next = cell;
    if (cell.prepared && preparedTouchesMap(cell.prepared)) {
      const p = mergePrepared(cell.prepared);
      if (p !== cell.prepared) next = { ...next, prepared: p };
    }
    if (cell.webSoloMicroGrid?.length) {
      const g = cell.webSoloMicroGrid.map(mergeCard);
      if (g.some((c, i) => c !== cell.webSoloMicroGrid![i])) next = { ...next, webSoloMicroGrid: g };
    }
    if (cell.webSidecarPreparedSuites?.length) {
      const s = cell.webSidecarPreparedSuites.map((ps) => (preparedTouchesMap(ps) ? mergePrepared(ps) : ps));
      if (s.some((ps, i) => ps !== cell.webSidecarPreparedSuites![i])) {
        next = { ...next, webSidecarPreparedSuites: s };
      }
    }
    return next;
  }

  function mergePartition(part: AnimalRoomHubSoloPartition): AnimalRoomHubSoloPartition {
    const rows = (part.rows ?? []).map((row) => {
      const cards = (row.cards ?? []).map(mergeCard);
      if (cards.every((c, i) => c === (row.cards ?? [])[i])) return row;
      return { ...row, cards };
    });
    if (rows.every((r, i) => r === (part.rows ?? [])[i])) return part;
    return { ...part, rows };
  }

  function mergeChunk(ch: AnimalRoomHubViewChunk): AnimalRoomHubViewChunk {
    let next = ch;
    if (ch.prepared && preparedTouchesMap(ch.prepared)) {
      const p = mergePrepared(ch.prepared);
      if (p !== ch.prepared) next = { ...next, prepared: p };
    }
    if (ch.list?.length) {
      const list = ch.list.map(mergeChromeCell);
      if (list.some((c, i) => c !== ch.list![i])) next = { ...next, list };
    }
    if (ch.partitions?.length) {
      const partitions = ch.partitions.map(mergePartition);
      if (partitions.some((p, i) => p !== ch.partitions![i])) next = { ...next, partitions };
    }
    return next;
  }

  const nextTabs = tabsIn.map((tab) => ({
    ...tab,
    viewChunks: (tab.viewChunks ?? []).map(mergeChunk),
  }));

  return { ...old, tagItems: nextTagItems, tabs: nextTabs };
}

export type FetchAnimalRoomTelemetryOptions = FetchAnimalRoomHubOptions;

/** WinCC 单点写入（仅超级管理员）；成功后合并返回行到缓存见调用方 setQueryData —— post-save-no-full-refresh.mdc */
export async function postWinccWriteTag(variableName: string, value: unknown): Promise<TelemetryTagItem> {
  const res = await authHttp.post<ApiResult<TelemetryTagItem>>("/v1/telemetry/wincc/write-tag", {
    variableName,
    value,
  });
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "WinCC 写入失败");
  }
  return body.data;
}

function normalizeWinccKindRole(role: string | null | undefined): string {
  return String(role || "").trim().toUpperCase();
}

/** 与小程序 animalRoomTelemetryApi.winccWrittenValueMatches 一致：开关归一 0/1；设定值按数值比 */
export function winccWrittenValueMatches(
  kindRole: string,
  expectedWritten: unknown,
  snapshotValueRaw: string | null | undefined
): boolean {
  const kr = normalizeWinccKindRole(kindRole) || "SETPOINT";
  const raw = snapshotValueRaw == null ? "" : String(snapshotValueRaw).trim();
  if (kr === "SWITCH") {
    let want = Number(expectedWritten);
    if (!Number.isFinite(want)) {
      const es = String(expectedWritten == null ? "" : expectedWritten).trim();
      if (es === "1" || /^true$/i.test(es)) want = 1;
      else if (es === "0" || /^false$/i.test(es)) want = 0;
      else want = NaN;
    }
    let got = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(got)) {
      if (/^true$/i.test(raw)) got = 1;
      else if (/^false$/i.test(raw)) got = 0;
      else got = NaN;
    }
    if (!Number.isFinite(want) || !Number.isFinite(got)) return String(expectedWritten).trim() === raw;
    return (want !== 0 ? 1 : 0) === (got !== 0 ? 1 : 0);
  }
  const expStr = String(expectedWritten == null ? "" : expectedWritten)
    .trim()
    .replace(/,/g, "");
  const expNum = Number(expStr);
  const m = raw.replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)/);
  const gotNum = m ? Number(m[1]) : Number(raw.replace(/,/g, ""));
  if (Number.isFinite(expNum) && Number.isFinite(gotNum)) {
    return Math.abs(expNum - gotNum) < 1e-5;
  }
  return expStr === raw;
}

function findSnapshotTagRow(items: TelemetryTagItem[] | null | undefined, variableName: string): TelemetryTagItem | null {
  const want = String(variableName || "").trim();
  if (!want || !Array.isArray(items)) return null;
  for (const it of items) {
    if (it && String(it.variableName || "").trim() === want) return it;
  }
  return null;
}

/** WinCC 定点读回后仅合并动物房页中对应 variableName 行（post-save-no-full-refresh.mdc） */
export async function fetchAndMergeSingleWinccTagIntoAnimalRoomCache(
  queryClient: QueryClient,
  variableName: string
): Promise<void> {
  const vn = String(variableName || "").trim();
  if (!vn) return;
  const snap = await fetchWinccTelemetrySnapshot({ sync: true, variableNames: vn });
  const row = findSnapshotTagRow(snap.items, vn);
  if (!row) return;
  queryClient.setQueryData(ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY, (old: AnimalRoomTelemetryPageDto | undefined) => {
    if (!old?.tagItems?.length) return old;
    return mergeTelemetryTagRowsIntoAnimalRoomPageDto(old, [row]);
  });
}

const WINCC_WEB_WRITE_VERIFY_MAX_MS = 2 * 60 * 60 * 1000;

/**
 * Web：写入后连续请求 `GET snapshot?sync=true`（请求间无节流），每次回调合并单行，直到读回与下发一致或超时。
 * 调用方须在 onEachSnapshotRow 内仅合并当前 variableName 对应行，禁止整表 refetch（post-save-no-full-refresh.mdc）。
 */
export async function pollWinccSnapshotUntilWrittenValueMatches(
  variableName: string,
  expectedWritten: unknown,
  kindRole: string,
  options?: {
    onEachSnapshotRow?: (row: TelemetryTagItem) => void;
    maxWaitMs?: number;
  }
): Promise<TelemetryTagItem> {
  const vn = String(variableName || "").trim();
  if (!vn) throw new Error("variableName 为空");
  const kr = normalizeWinccKindRole(kindRole) || "SETPOINT";
  const deadline = Date.now() + (options?.maxWaitMs ?? WINCC_WEB_WRITE_VERIFY_MAX_MS);
  let lastSig = "";
  const yieldMs = 120;
  while (Date.now() < deadline) {
    const snap = await fetchWinccTelemetrySnapshot({ sync: true, variableNames: vn });
    const row = findSnapshotTagRow(snap.items, vn);
    if (row) {
      const sig = `${row.value ?? ""}\0${row.timestamp ?? ""}\0${row.qualityCode ?? ""}`;
      if (sig !== lastSig) {
        lastSig = sig;
        options?.onEachSnapshotRow?.(row);
      }
      if (winccWrittenValueMatches(kr, expectedWritten, row.value)) {
        return row;
      }
    }
    /* 短间隔 yield，避免无节流连打 setQueryData 导致排版/布局抖动 */
    await new Promise((r) => setTimeout(r, yieldMs));
  }
  throw new Error("长时间未读到与下发一致的同步数据，请稍后刷新页面或重试");
}

export async function fetchWinccAnimalRoomTelemetry(
  options?: FetchAnimalRoomTelemetryOptions
): Promise<AnimalRoomTelemetryPageDto> {
  const sync = options?.sync === true;
  const soloWidthPx = options?.soloWidthPx ?? 960;
  const campus = options?.campus;
  const hubClient = options?.hubClient;
  const res = await authHttp.get<ApiResult<AnimalRoomTelemetryPageDto>>("/v1/telemetry/wincc/animal-room", {
    params: {
      sync: sync ? "true" : "false",
      soloWidthPx,
      ...(campus ? { campus } : {}),
      ...(hubClient ? { hubClient } : {}),
    },
  });
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "加载动物房温湿度数据失败");
  }
  const d = body.data;
  return {
    ...d,
    tabs: d.tabs ?? [],
    tagItems: d.tagItems ?? [],
  };
}

/** 与后端 {@code TelemetrySequentialDiagnosticDto.StepResult} 对齐 */
export type TelemetryDiagnosticStep = {
  label?: string | null;
  variableCount?: number;
  variablePreview?: string[] | null;
  success?: boolean;
  durationMs?: number;
  responseRowCount?: number | null;
  errorMessage?: string | null;
};

export type TelemetrySequentialDiagnostic = {
  winccEnabled: boolean;
  disabledReason?: string | null;
  stepBuiltInDefaults?: TelemetryDiagnosticStep | null;
  stepWatchlist?: TelemetryDiagnosticStep | null;
};

/**
 * 顺序诊断：① 内置默认前 5 点 ② 当前 watchlist；不更新内存快照。
 * `GET /api/v1/telemetry/wincc/diagnostic/sequential-built-in-then-watchlist`
 */

function metricKindFromChinese(rest: string): "temp" | "hum" | null {
  const s = rest.trim();
  if (!s) return null;
  if (/湿度|\bRH\b/i.test(s)) return "hum";
  if (/温度|气温|℃/i.test(s)) return "temp";
  return null;
}

/**
 * 从展示名/变量名解析房间与温湿度测点。
 * - 自定义映射：`房间名·温度` / `房间名|湿度` 等
 * - WinCC 导出：`A203S_4.房间温度` / `.房间湿度`
 */
export function parseTelemetryRoomMetric(
  item: TelemetryTagItem
): { room: string; metric: "temp" | "hum" } | null {
  const vn = (item.variableName || "").trim();
  const dl = (item.displayLabel || "").trim();
  if (dl === "无") return null;
  const primary = dl || vn;
  if (!primary) return null;
  const sep = /[·・|]/.exec(primary);
  if (sep && sep.index !== undefined) {
    const room = primary.slice(0, sep.index).trim();
    const rest = primary.slice(sep.index + sep[0].length).trim();
    if (!room || !rest) return null;
    const metric = metricKindFromChinese(rest);
    if (!metric) return null;
    return { room, metric };
  }
  const wincc = vn.match(/^(.+)\.(房间温度|房间湿度)$/);
  if (wincc) {
    return { room: wincc[1], metric: wincc[2] === "房间温度" ? "temp" : "hum" };
  }
  const winccLabel = primary.match(/^(.+)\.(房间温度|房间湿度)$/);
  if (winccLabel) {
    return { room: winccLabel[1], metric: winccLabel[2] === "房间温度" ? "temp" : "hum" };
  }
  return null;
}

export function buildTelemetryRoomCards(items: TelemetryTagItem[] | null | undefined): {
  cards: TelemetryRoomCardModel[];
  wuVariableNames: string[];
  ungrouped: TelemetryTagItem[];
} {
  const list = items?.length ? items : [];
  const wuVariableNames: string[] = [];
  const ungrouped: TelemetryTagItem[] = [];
  const map = new Map<string, TelemetryRoomCardModel>();

  for (const item of list) {
    const dl = (item.displayLabel || "").trim();
    if (dl === "无" && item.variableName) {
      wuVariableNames.push(item.variableName);
      continue;
    }
    const parsed = parseTelemetryRoomMetric(item);
    if (!parsed) {
      ungrouped.push(item);
      continue;
    }
    let card = map.get(parsed.room);
    if (!card) {
      card = { roomKey: parsed.room, displayTitle: parsed.room };
      map.set(parsed.room, card);
    }
    if (parsed.metric === "temp") card.temp = item;
    else card.hum = item;
  }

  const cards = Array.from(map.values()).sort((a, b) =>
    a.displayTitle.localeCompare(b.displayTitle, "zh-CN")
  );
  return { cards, wuVariableNames, ungrouped };
}

export function formatTelemetryTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString();
}

export async function fetchWinccDockPollConfig(): Promise<TelemetryWinccDockPollConfig> {
  const res = await axios.get<ApiResult<TelemetryWinccDockPollConfig>>(
    "/api/v1/telemetry/wincc/dock-poll-config"
  );
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "加载程序坞轮询配置失败");
  }
  return body.data;
}

export async function fetchWinccSequentialDiagnostic(): Promise<TelemetrySequentialDiagnostic> {
  const res = await axios.get<ApiResult<TelemetrySequentialDiagnostic>>(
    "/api/v1/telemetry/wincc/diagnostic/sequential-built-in-then-watchlist"
  );
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "顺序诊断请求失败");
  }
  return body.data;
}

export type WatchlistAlarmLimitEntry = {
  variableName?: string | null;
  alarmMinValue?: string | null;
  alarmMaxValue?: string | null;
  alarmOutOfRange?: boolean | null;
  alarmBand?: string | null;
};

export type WatchlistAlarmLimitsBatch = {
  byVariableName: Record<string, WatchlistAlarmLimitEntry>;
};

export async function queryWatchlistAlarmLimits(
  variableNames: string[],
  currentValueByVariable?: Record<string, string | null | undefined>
): Promise<WatchlistAlarmLimitsBatch> {
  const res = await axios.post<ApiResult<WatchlistAlarmLimitsBatch>>("/api/v1/telemetry/watchlists/alarm-limits/query", {
    variableNames,
    currentValueByVariable: currentValueByVariable ?? {},
  });
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "查询报警限失败");
  }
  return body.data;
}

export type TelemetryWatchlistTagDto = {
  id: number;
  winccVariableName?: string | null;
  alarmOverrideMin?: string | null;
  alarmOverrideMax?: string | null;
};

export async function patchWatchlistTagAlarmOverrides(
  bundleCode: string,
  tagId: number,
  payload: { alarmOverrideMin?: string | null; alarmOverrideMax?: string | null }
): Promise<TelemetryWatchlistTagDto> {
  const code = encodeURIComponent(bundleCode);
  const res = await axios.patch<ApiResult<TelemetryWatchlistTagDto>>(
    `/api/v1/telemetry/watchlists/${code}/tags/${tagId}/alarm-overrides`,
    payload
  );
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "保存报警覆盖失败");
  }
  return body.data;
}

export type TelemetryArchiveSeriesPoint = { t: string; value: number | null };

export type TelemetryArchiveSeries = {
  variableName: string;
  points: TelemetryArchiveSeriesPoint[];
  /** 服务端实际查询窗起点（ISO-8601）；ROLLING 定窗时与请求无关 */
  queriedFrom?: string | null;
  queriedTo?: string | null;
};

/** 按 from/to 范围查询（默认 RANGE）；与旧版调用兼容 */
export async function fetchTelemetryArchiveSeries(
  variableName: string,
  fromIso: string,
  toIso: string,
  maxPoints = 120
): Promise<TelemetryArchiveSeries> {
  const res = await authHttp.get<ApiResult<TelemetryArchiveSeries>>("/v1/telemetry/archive/series", {
    params: { variableName, from: fromIso, to: toIso, maxPoints },
  });
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "加载归档曲线失败");
  }
  return body.data;
}

/** 服务端定窗 ROLLING：以当前时间为窗末、向前 windowHours 小时；降采样 maxPoints */
export async function fetchTelemetryArchiveSeriesRolling(
  variableName: string,
  options?: { windowHours?: number; maxPoints?: number }
): Promise<TelemetryArchiveSeries> {
  const windowHours = options?.windowHours ?? 6;
  const maxPoints = options?.maxPoints ?? 120;
  const res = await authHttp.get<ApiResult<TelemetryArchiveSeries>>("/v1/telemetry/archive/series", {
    params: {
      variableName,
      seriesScope: "ROLLING",
      windowHours,
      maxPoints,
    },
  });
  const body = res.data;
  if (!body?.success || body.data == null) {
    throw new Error(body?.message || "加载归档曲线失败");
  }
  return body.data;
}
