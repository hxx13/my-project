/**
 * 动物房温湿度页：GET /api/v1/telemetry/wincc/animal-room（扁平 JSON：tabs、tagItems、fetchedAt…）
 *
 * 云函数 springProxy 回包有约 1MB 上限：使用 telemetrySummaryOnly / telemetryTabKey 分块拉取后在页面侧 merge。
 */
const springAuth = require('./springAuth.js');
const animalRoomHvacUnits = require('./animalRoomHvacUnits.js');

/** 与 animal-room-telemetry 组件一致，用于首屏选中楼层 */
const MP_ANIMAL_ROOM_TELEMETRY_TAB_KEY = 'mp_animal_room_telemetry_floor_tab_key';

/**
 * 真机轮询：服务端 pollIntervalMs 过短时 JS/网络/整页 setData 频繁，易发热；页面侧 setInterval 统一不低于此值（仍尊重更大的服务端间隔）。
 */
const MIN_TELEMETRY_POLL_INTERVAL_MS = 15000;

function clampTelemetryPollIntervalMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(MIN_TELEMETRY_POLL_INTERVAL_MS, Math.floor(n));
}

function normTelemetryTabKey(k) {
  return String(k || '').trim().toLowerCase();
}

function readStoredTelemetryFloorTabKey() {
  try {
    return String(wx.getStorageSync(MP_ANIMAL_ROOM_TELEMETRY_TAB_KEY) || '').trim();
  } catch (e) {
    return '';
  }
}

function mergeTagItemsByVariableName(prev, next) {
  const map = new Map();
  (prev || []).forEach((it) => {
    const vn = String((it && it.variableName) || '').trim();
    if (vn) map.set(vn, it);
  });
  (next || []).forEach((it) => {
    const vn = String((it && it.variableName) || '').trim();
    if (vn) map.set(vn, it);
  });
  return Array.from(map.values());
}

/**
 * 机房 Tab：GET telemetryTabKey=__hvac_units__ 时 detail 带 hvacMechanicalHubViewChunks，各层 tabs 无 viewChunks。
 * 合并时保留各层已有 viewChunks，仅更新机房块与 tagItems；禁止用 detail.tabs 覆盖楼层块（post-save-no-full-refresh.mdc）。
 */
function mergeHvacMechanicalHubSplitResult(basePage, summary, detail) {
  const prev = basePage || {};
  const sumTabs = (summary && summary.tabs) || prev.tabs || [];
  const baseByKey = new Map((prev.tabs || []).map((t) => [normTelemetryTabKey(t && t.tabKey), t]));
  const hvacChunks =
    detail && Array.isArray(detail.hvacMechanicalHubViewChunks) && detail.hvacMechanicalHubViewChunks.length
      ? detail.hvacMechanicalHubViewChunks
      : prev.hvacMechanicalHubViewChunks || [];
  const tabs = sumTabs.map((st) => {
    const k = normTelemetryTabKey(st && st.tabKey);
    const prevRow = baseByKey.get(k);
    const chunks = prevRow && prevRow.viewChunks ? prevRow.viewChunks : [];
    return Object.assign({}, st, { viewChunks: chunks });
  });
  const tagItems = mergeTagItemsByVariableName(prev.tagItems || [], (detail && detail.tagItems) || []);
  return Object.assign({}, prev, {
    tabs,
    hvacMechanicalHubViewChunks: hvacChunks,
    tagItems,
    fetchedAt: detail && detail.fetchedAt != null ? detail.fetchedAt : summary && summary.fetchedAt,
    winccEnabled:
      detail && detail.winccEnabled !== undefined
        ? detail.winccEnabled
        : summary && summary.winccEnabled !== undefined
          ? summary.winccEnabled
          : prev.winccEnabled,
    pollIntervalMs:
      detail && detail.pollIntervalMs != null
        ? detail.pollIntervalMs
        : summary && summary.pollIntervalMs != null
          ? summary.pollIntervalMs
          : prev.pollIntervalMs,
    runningStatusRooms:
      summary && summary.runningStatusRooms && summary.runningStatusRooms.length
        ? summary.runningStatusRooms
        : prev.runningStatusRooms || [],
  });
}

/**
 * 将摘要（全 tab 元数据）与单 tab 明细合并；轮询时用最新 summary 覆盖排序与计数，并保留非当前 tab 已有 viewChunks。
 */
function mergeTelemetrySplitResult(basePage, summary, detail, activeTabKey) {
  const prev = basePage || {};
  const tk = String(activeTabKey || '').trim();
  if (animalRoomHvacUnits.isSyntheticHvacTabKey(tk)) {
    return mergeHvacMechanicalHubSplitResult(prev, summary, detail);
  }
  const ntk = normTelemetryTabKey(tk);
  const sumTabs = (summary && summary.tabs) || [];
  const baseByKey = new Map((prev.tabs || []).map((t) => [normTelemetryTabKey(t && t.tabKey), t]));
  const dTabs = (detail && detail.tabs) || [];
  const dTab = dTabs.find((t) => normTelemetryTabKey(t && t.tabKey) === ntk) || dTabs[0];
  const newChunks = (dTab && dTab.viewChunks) || [];

  const tabs = sumTabs.map((st) => {
    const k = normTelemetryTabKey(st && st.tabKey);
    const prevRow = baseByKey.get(k);
    const chunks = k === ntk ? newChunks : (prevRow && prevRow.viewChunks) || [];
    return Object.assign({}, st, { viewChunks: chunks });
  });

  const tagItems = mergeTagItemsByVariableName(prev.tagItems || [], (detail && detail.tagItems) || []);

  return Object.assign({}, prev, {
    tabs,
    tagItems,
    fetchedAt: detail && detail.fetchedAt != null ? detail.fetchedAt : summary && summary.fetchedAt,
    winccEnabled:
      detail && detail.winccEnabled !== undefined
        ? detail.winccEnabled
        : summary && summary.winccEnabled !== undefined
          ? summary.winccEnabled
          : prev.winccEnabled,
    pollIntervalMs:
      detail && detail.pollIntervalMs != null
        ? detail.pollIntervalMs
        : summary && summary.pollIntervalMs != null
          ? summary.pollIntervalMs
          : prev.pollIntervalMs,
    runningStatusRooms:
      summary && summary.runningStatusRooms && summary.runningStatusRooms.length
        ? summary.runningStatusRooms
        : prev.runningStatusRooms || [],
  });
}

function mergeTabDetailIntoPage(basePage, detail, tabKey) {
  if (!basePage) return basePage;
  return mergeTelemetrySplitResult(basePage, basePage, detail, tabKey);
}

function pickInitialTelemetryTabKeyFromSummary(summary) {
  const tabs = (summary && summary.tabs) || [];
  if (!tabs.length) return '';
  const stored = readStoredTelemetryFloorTabKey();
  if (stored) {
    const hit = tabs.find((t) => normTelemetryTabKey(t && t.tabKey) === normTelemetryTabKey(stored));
    if (hit) return String(hit.tabKey || '').trim();
  }
  return String((tabs[0] && tabs[0].tabKey) || '').trim();
}

function unwrapNestedDto(outer) {
  if (outer == null) return null;
  if (typeof outer !== 'object') return outer;
  if (Object.prototype.hasOwnProperty.call(outer, 'data')) return outer.data;
  return outer;
}

function parsePageResponse(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    throw new Error((body && body.message) || '无权限访问');
  }
  if (!body || body.success !== true) {
    throw new Error((body && body.message) || `请求失败(${statusCode || 0})`);
  }
  return unwrapNestedDto(body.data);
}

function normalizeAnimalRoomPage(page) {
  // 后端已按楼层与地下室 E 区分页（如 B1F-E10）；禁止再把分区 tab 合并回单层（post-save-no-full-refresh.mdc 思路：依赖服务端分页）
  return page;
}

/**
 * @param {boolean} sync
 * @param {number} [soloWidthPx]
 * @param {string} [campus]
 * @param {{ telemetrySummaryOnly?: boolean, telemetryTabKey?: string }} [opts]
 */
function fetchAnimalRoomTelemetry(sync, soloWidthPx, campus, opts) {
  const data = {
    sync: sync ? 'true' : 'false',
    soloWidthPx: soloWidthPx != null ? String(soloWidthPx) : '360',
  };
  if (campus) data.campus = campus;
  const o = opts || {};
  if (o.telemetrySummaryOnly) data.telemetrySummaryOnly = 'true';
  if (o.telemetryTabKey) data.telemetryTabKey = String(o.telemetryTabKey).trim();
  return springAuth
    .springRequest({
      url: '/api/v1/telemetry/wincc/animal-room',
      method: 'GET',
      data,
    })
    .then(parsePageResponse)
    .then(normalizeAnimalRoomPage);
}

function fetchTelemetryArchiveSeries(variableName, fromIso, toIso, maxPoints) {
  const mp = maxPoints != null ? String(maxPoints) : '120';
  return springAuth
    .springRequest({
      url: '/api/v1/telemetry/archive/series',
      method: 'GET',
      data: { variableName, from: fromIso, to: toIso, maxPoints: mp },
    })
    .then(parsePageResponse);
}

/** 服务端 ROLLING 定窗：当前时间为窗末，向前 windowHours 小时；与动物房 Web 详情一致 */
function fetchTelemetryArchiveSeriesRolling(variableName, windowHours, maxPoints) {
  const wh = windowHours != null ? String(windowHours) : '6';
  const mp = maxPoints != null ? String(maxPoints) : '96';
  return springAuth
    .springRequest({
      url: '/api/v1/telemetry/archive/series',
      method: 'GET',
      data: { variableName, seriesScope: 'ROLLING', windowHours: wh, maxPoints: mp },
    })
    .then(parsePageResponse);
}

function queryWatchlistAlarmLimits(variableNames, currentValueByVariable) {
  return springAuth
    .springRequest({
      url: '/api/v1/telemetry/watchlists/alarm-limits/query',
      method: 'POST',
      data: { variableNames, currentValueByVariable: currentValueByVariable || {} },
    })
    .then(parsePageResponse);
}

function writeWinccTag(variableName, value) {
  return springAuth
    .springRequest({
      url: '/api/v1/telemetry/wincc/write-tag',
      method: 'POST',
      data: { variableName, value },
    })
    .then(parsePageResponse);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET 统一快照。
 * - variableNames：逗号分隔；sync=true 时服务端仅对该批变量定点读 WinCC（不全量刷新），回包仅含这些行，用于写入后轮询（post-save-no-full-refresh.mdc）。
 */
function fetchTelemetryWinccSnapshot(sync, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const data = { sync: sync ? 'true' : 'false' };
  const vn = String(o.variableNames || '').trim();
  if (vn) data.variableNames = vn;
  return springAuth
    .springRequest({
      url: '/api/v1/telemetry/wincc/snapshot',
      method: 'GET',
      data,
    })
    .then(parsePageResponse);
}

function findSnapshotTagRow(snapshotDto, variableName) {
  const want = String(variableName || '').trim();
  const items = (snapshotDto && snapshotDto.items) || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it && String(it.variableName || '').trim() === want) return it;
  }
  return null;
}

function normalizeWinccKindRole(role) {
  return String(role || '').trim().toUpperCase();
}

/** 下发目标与快照读数字段 value 是否一致（开关归一为 0/1；设定值按数值比，忽略常见单位后缀） */
function winccWrittenValueMatches(kindRole, expectedWritten, snapshotValueRaw) {
  const kr = normalizeWinccKindRole(kindRole);
  const raw = snapshotValueRaw == null ? '' : String(snapshotValueRaw).trim();
  if (kr === 'SWITCH') {
    let want = Number(expectedWritten);
    if (!Number.isFinite(want)) {
      const es = String(expectedWritten == null ? '' : expectedWritten).trim();
      if (es === '1' || /^true$/i.test(es)) want = 1;
      else if (es === '0' || /^false$/i.test(es)) want = 0;
      else want = NaN;
    }
    let got = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(got)) {
      if (/^true$/i.test(raw)) got = 1;
      else if (/^false$/i.test(raw)) got = 0;
      else got = NaN;
    }
    if (!Number.isFinite(want) || !Number.isFinite(got)) return String(expectedWritten).trim() === raw;
    return (want !== 0 ? 1 : 0) === (got !== 0 ? 1 : 0);
  }
  const expStr = String(expectedWritten == null ? '' : expectedWritten)
    .trim()
    .replace(/,/g, '');
  const expNum = Number(expStr);
  const m = raw.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)/);
  const gotNum = m ? Number(m[1]) : Number(raw.replace(/,/g, ''));
  if (Number.isFinite(expNum) && Number.isFinite(gotNum)) {
    return Math.abs(expNum - gotNum) < 1e-5;
  }
  return expStr === raw;
}

/** 写入后轮询读回：间隔拉 sync 快照；最多请求次数（含首次快照），避免长时间每 10s 请求导致耗电发热 */
const WINCC_VERIFY_POLL_MS = 10000;
const WINCC_VERIFY_MAX_SNAPSHOT_ATTEMPTS = 10;

/**
 * POST 返回行若已与下发一致则立即成功；否则拉 sync 快照直至读回一致，至多 WINCC_VERIFY_MAX_SNAPSHOT_ATTEMPTS 次（含首次）。
 * 确认后再合并 UI（post-save-no-full-refresh.mdc）
 */
function waitWinccTagValueConfirmed(variableName, expectedWritten, kindRole, initialRow) {
  const vn = String(variableName || '').trim();
  if (!vn) return Promise.reject(new Error('variableName 为空'));
  const kr = normalizeWinccKindRole(kindRole) || 'SETPOINT';

  if (initialRow && winccWrittenValueMatches(kr, expectedWritten, initialRow.value)) {
    return Promise.resolve(initialRow);
  }

  let attempts = 0;

  function pollOnce() {
    attempts += 1;
    return fetchTelemetryWinccSnapshot(true, { variableNames: vn }).then((snap) => {
      const row = findSnapshotTagRow(snap, vn);
      if (row && winccWrittenValueMatches(kr, expectedWritten, row.value)) {
        return row;
      }
      if (attempts >= WINCC_VERIFY_MAX_SNAPSHOT_ATTEMPTS) {
        throw new Error(
          `已轮询 ${WINCC_VERIFY_MAX_SNAPSHOT_ATTEMPTS} 次仍未读到与下发一致的数值，请稍后在页面上查看或重试`
        );
      }
      return delay(WINCC_VERIFY_POLL_MS).then(pollOnce);
    });
  }

  return pollOnce();
}

/** 写入后对单点独立拉快照校验读回值（开关 / 设定值共用） */
function writeWinccTagAndVerify(variableName, value, kindRole) {
  const kr = normalizeWinccKindRole(kindRole) || 'SETPOINT';
  return writeWinccTag(variableName, value).then((row) =>
    waitWinccTagValueConfirmed(variableName, value, kr, row)
  );
}

function patchWatchlistTagAlarmOverrides(bundleCode, tagId, alarmOverrideMin, alarmOverrideMax) {
  const c = encodeURIComponent(bundleCode);
  return springAuth
    .springRequest({
      url: `/api/v1/telemetry/watchlists/${c}/tags/${tagId}/alarm-overrides`,
      method: 'PATCH',
      data: {
        alarmOverrideMin: alarmOverrideMin != null && String(alarmOverrideMin).trim() !== '' ? String(alarmOverrideMin).trim() : null,
        alarmOverrideMax: alarmOverrideMax != null && String(alarmOverrideMax).trim() !== '' ? String(alarmOverrideMax).trim() : null,
      },
    })
    .then(parsePageResponse);
}

/**
 * 已知当前楼层 tabKey：优先 GET /animal-room-with-tab（一次 WinCC+组装）；失败时退回两次 GET 并行。
 */
function fetchAnimalRoomTelemetrySummaryAndTabParallel(sync, soloWidthPx, campus, tabKey) {
  const tk = String(tabKey || '').trim();
  if (!tk) {
    return fetchAnimalRoomTelemetry(!!sync, soloWidthPx, campus, { telemetrySummaryOnly: true }).then((summary) => ({
      summary,
      detail: null,
    }));
  }
  const px = soloWidthPx != null ? soloWidthPx : 360;
  const data = {
    sync: sync ? 'true' : 'false',
    soloWidthPx: String(px),
    telemetryTabKey: tk,
  };
  if (campus) data.campus = campus;
  return springAuth
    .springRequest({
      url: '/api/v1/telemetry/wincc/animal-room-with-tab',
      method: 'GET',
      data,
    })
    .then(parsePageResponse)
    .then((bundle) => {
      const summary = bundle && bundle.summary;
      const detail = bundle && bundle.tabDetail;
      if (!summary || !detail) throw new Error('animal-room-with-tab 响应不完整');
      return { summary, detail };
    })
    .catch(() =>
      Promise.all([
        fetchAnimalRoomTelemetry(!!sync, px, campus, { telemetrySummaryOnly: true }),
        fetchAnimalRoomTelemetry(!!sync, px, campus, { telemetryTabKey: tk }),
      ]).then(([summary, detail]) => ({ summary, detail }))
    );
}

function findTabIndexByKey(tabs, tabKey) {
  const n = normTelemetryTabKey(tabKey);
  const list = tabs || [];
  for (let i = 0; i < list.length; i++) {
    if (normTelemetryTabKey(list[i] && list[i].tabKey) === n) return i;
  }
  return -1;
}

/** 摘要行有房间/套间但尚无 viewChunks，判定为未拉过明细，适合预取 */
function tabRowNeedsDetailPrefetch(tab) {
  if (!tab) return false;
  const rc = (Number(tab.roomCount) || 0) + (Number(tab.suiteCount) || 0);
  if (rc <= 0) return false;
  const ch = tab.viewChunks;
  if (!Array.isArray(ch) || ch.length === 0) return true;
  return false;
}

/**
 * 空闲预拉左右邻层明细并 mergeTabDetailIntoPage；切层时常已缓存。
 * 仅用 sync=false 减 WinCC 压力；合并仅影响对应 tab 的 viewChunks/tagItems，禁止整表 load（post-save-no-full-refresh.mdc）
 */
function prefetchAdjacentAnimalRoomFloorDetails(options) {
  const o = options || {};
  const soloWidthPx = o.soloWidthPx != null ? o.soloWidthPx : 360;
  const campus = o.campus;
  const activeTabKey = String(o.activeTabKey || '').trim();
  const getPage = typeof o.getPage === 'function' ? o.getPage : () => null;
  const onMerged = typeof o.onMerged === 'function' ? o.onMerged : () => {};

  if (!activeTabKey) return Promise.resolve();
  if (animalRoomHvacUnits.isSyntheticHvacTabKey(activeTabKey)) return Promise.resolve();

  const page = getPage();
  const tabs = (page && page.tabs) || [];
  if (tabs.length < 2) return Promise.resolve();

  const idx = findTabIndexByKey(tabs, activeTabKey);
  if (idx < 0) return Promise.resolve();

  const neighborKeys = [];
  if (idx > 0) neighborKeys.push(String(tabs[idx - 1].tabKey || '').trim());
  if (idx < tabs.length - 1) neighborKeys.push(String(tabs[idx + 1].tabKey || '').trim());

  const unique = [...new Set(neighborKeys.filter(Boolean))];
  const toFetch = unique.filter((k) => {
    const row = tabs.find((t) => normTelemetryTabKey(t && t.tabKey) === normTelemetryTabKey(k));
    return tabRowNeedsDetailPrefetch(row);
  });

  if (!toFetch.length) return Promise.resolve();

  return toFetch.reduce(
    (chain, tk) =>
      chain.then(() =>
        fetchAnimalRoomTelemetry(false, soloWidthPx, campus, { telemetryTabKey: tk })
          .then((detail) => {
            const cur = getPage();
            if (!cur || !Array.isArray(cur.tabs)) return;
            const merged = mergeTabDetailIntoPage(cur, detail, tk);
            onMerged(merged);
          })
          .catch(() => {})
      ),
    Promise.resolve()
  );
}

module.exports = {
  fetchAnimalRoomTelemetry,
  fetchAnimalRoomTelemetrySummaryAndTabParallel,
  mergeTelemetrySplitResult,
  mergeTabDetailIntoPage,
  pickInitialTelemetryTabKeyFromSummary,
  clampTelemetryPollIntervalMs,
  /** 与组件侧栏 storage 同源；轮询前父页 _telemetryActiveTabKey 为空时兜底 */
  readStoredTelemetryFloorTabKey,
  fetchTelemetryArchiveSeries,
  fetchTelemetryArchiveSeriesRolling,
  fetchTelemetryWinccSnapshot,
  queryWatchlistAlarmLimits,
  patchWatchlistTagAlarmOverrides,
  writeWinccTag,
  writeWinccTagAndVerify,
  waitWinccTagValueConfirmed,
  prefetchAdjacentAnimalRoomFloorDetails,
};
