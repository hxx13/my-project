const springAuth = require('../../../utils/springAuth.js');
const twinScan = require('../../../utils/twinScanAnalyze.js');
const { hasAiPortraitTab } = require('../../../utils/tabBarHelper.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

const STORAGE_CACHE = springAuth.KEYS.AI_PORTRAIT_CACHE;
const STORAGE_MANUAL_AT = springAuth.KEYS.AI_PORTRAIT_MANUAL_AT;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 10 * 60 * 1000;

function parseOverview(res) {
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
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true || !Array.isArray(body.data)) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode || 0})` };
  }
  return { ok: true, rows: body.data };
}

function parsePredictionBody(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return { ok: false, message: '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, message: `请求失败(${statusCode || 0})` };
  }
  if (Number(body.code) === 404) {
    return { ok: false, message: body.msg || '暂无该房间的预测数据' };
  }
  if (Number(body.code) !== 200 || !body.data) {
    return { ok: false, message: body.msg || body.message || '加载失败' };
  }
  return { ok: true, data: body.data };
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function parseCurve24(v) {
  const out = new Array(24).fill(0);
  let arr = null;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === 'string' && v.trim()) {
    try {
      const j = JSON.parse(v);
      if (Array.isArray(j)) arr = j;
    } catch (e) {
      arr = null;
    }
  }
  if (!arr || !arr.length) return out;
  for (let i = 0; i < 24; i += 1) {
    out[i] = n(arr[i]);
  }
  return out;
}

const WEEK_DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 解析 weekly_* 为 7 个有限数字（旧版为 0–24「时刻」；新版为 0–1 活动份额） */
function parseWeeklySevenNumbers(v) {
  const out = new Array(7).fill(NaN);
  let arr = null;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === 'string' && v.trim()) {
    try {
      const j = JSON.parse(v.trim());
      if (Array.isArray(j)) arr = j;
    } catch (e) {
      arr = null;
    }
  }
  if (!arr || !arr.length) return out;
  for (let i = 0; i < 7; i += 1) {
    if (i >= arr.length) break;
    const x = Number(arr[i]);
    if (!Number.isFinite(x) || x < 0) out[i] = NaN;
    else out[i] = x;
  }
  return out;
}

/**
 * 周维：周一至周日入/离场平均时刻，绘制带状区（纵轴 6h–22h）
 * @returns {{ dayLabel: string, hasBand: boolean, top: number, height: number }[]}
 */
function buildWeekColumns(weeklyEntry, weeklyExit) {
  const LO = 6;
  const HI = 22;
  const span = HI - LO;
  const cols = [];
  for (let i = 0; i < 7; i += 1) {
    const e = weeklyEntry[i];
    const x = weeklyExit[i];
    if (e == null || x == null) {
      cols.push({ dayLabel: WEEK_DAY_LABELS[i], hasBand: false, top: 0, height: 0 });
      continue;
    }
    const lo = Math.min(e, x);
    const hi = Math.max(e, x);
    const top = span > 0 ? ((HI - hi) / span) * 100 : 0;
    const rawH = span > 0 ? ((hi - lo) / span) * 100 : 0;
    const height = hi === lo ? 4 : Math.max(rawH, 5);
    const topR = Math.round(top * 100) / 100;
    const heightR = Math.round(height * 100) / 100;
    cols.push({ dayLabel: WEEK_DAY_LABELS[i], hasBand: true, top: topR, height: heightR });
  }
  return cols;
}

/** 跨房间综合：每个 weekday 对「有数据房间」做入/离场均值，再绘制带状图 */
function aggregateWeeklyAcrossBlocks(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) {
    const entryAvg = new Array(7).fill(null);
    const exitAvg = new Array(7).fill(null);
    return { columns: buildWeekColumns(entryAvg, exitAvg), entryAvg, exitAvg };
  }
  const avgEntry = new Array(7).fill(null);
  const avgExit = new Array(7).fill(null);
  for (let d = 0; d < 7; d += 1) {
    let cnt = 0;
    let sumE = 0;
    let sumX = 0;
    blocks.forEach((b) => {
      const e = b.weeklyEntryRaw && b.weeklyEntryRaw[d];
      const x = b.weeklyExitRaw && b.weeklyExitRaw[d];
      if (Number.isFinite(e) && Number.isFinite(x) && e >= 0 && x >= 0) {
        cnt += 1;
        sumE += e;
        sumX += x;
      }
    });
    if (cnt > 0) {
      avgEntry[d] = sumE / cnt;
      avgExit[d] = sumX / cnt;
    }
  }
  return { columns: buildWeekColumns(avgEntry, avgExit), entryAvg: avgEntry, exitAvg: avgExit };
}

function stripWeeklyRawFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return;
  blocks.forEach((b) => {
    if (!b || typeof b !== 'object') return;
    delete b.weeklyEntryRaw;
    delete b.weeklyExitRaw;
  });
}

function parseTrajectory(raw) {
  if (raw == null || raw === '') return [];
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj)
      .sort((a, b) => n(b[1]) - n(a[1]))
      .slice(0, 5)
      .map(([key, val]) => ({
        name: key === 'EXIT' ? '离开大楼' : String(key),
        prob: `${Math.round(n(val) * 100)}%`,
      }));
  } catch (e) {
    return [];
  }
}

function shortRoomName(roomName) {
  const s = String(roomName || '');
  const i = s.indexOf('-');
  return i >= 0 ? s.slice(i + 1).trim() || s : s;
}

function overviewRoomCandidates(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  rows.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const rawId = r.roomId != null ? r.roomId : r.room_id;
    const roomId = rawId != null ? String(rawId).trim() : '';
    if (!roomId || seen.has(roomId)) return;
    seen.add(roomId);
    const roomName = String(r.roomName != null ? r.roomName : r.room_name || '');
    out.push({ roomId, roomName, shortName: shortRoomName(roomName) });
  });
  return out.sort((a, b) => a.roomName.localeCompare(b.roomName, 'zh'));
}

/** 先探测与流水一致的扫码房间 ID，再探测概览房间，避免 roomId 两套体系对不上或 120 条截断丢数据 */
function mergePortraitProbeOrder(analyzeCandidates, overviewCandidates) {
  const seen = new Set();
  const out = [];
  const pushList = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((c) => {
      if (!c || !c.roomId || seen.has(c.roomId)) return;
      seen.add(c.roomId);
      out.push(c);
    });
  };
  pushList(analyzeCandidates);
  pushList(overviewCandidates);
  return out;
}

function buildPredFromPayload(d) {
  const medianMins = n(d.medianDurationMins);
  const overtimeProb = n(d.overtimeProb);
  return {
    medianText: medianMins >= 60 ? `${(medianMins / 60).toFixed(1)} 小时` : `${Math.round(medianMins)} 分钟`,
    peakEntry: d.peakEntryTime != null ? String(d.peakEntryTime) : '',
    overtimePct: `${Math.round(overtimeProb * 100)}%`,
    overtimeHigh: overtimeProb > 0.6,
    alertMsg: d.alertMsg != null ? String(d.alertMsg) : '',
    isColdStart: !!d.isColdStart,
    entryCurve: parseCurve24(d.entryCurve != null ? d.entryCurve : d.entry_curve_json),
    exitCurve: parseCurve24(d.exitCurve != null ? d.exitCurve : d.exit_curve_json),
  };
}

/**
 * 对概览候选房间并发请求 dashboard，有数据的房间直接组装成一条画像（一次请求只打一遍接口）
 */
async function fetchAllRoomPortraits(userId, candidates, concurrency, maxProbe) {
  const list = maxProbe > 0 ? candidates.slice(0, maxProbe) : candidates.slice();
  const blocks = [];
  for (let i = 0; i < list.length; i += concurrency) {
    const batch = list.slice(i, i + concurrency);
    const part = await Promise.all(
      batch.map(async (c) => {
        try {
          const res = await springAuth.springRequest({
            url: '/api/v1/twin/prediction/dashboard',
            method: 'GET',
            data: { userId, roomId: c.roomId },
          });
          const parsed = parsePredictionBody(res);
          if (!parsed.ok) return null;
          const d = parsed.data || {};
          const weeklyEntry = parseWeeklySevenNumbers(
            d.weeklyEntryCurve != null ? d.weeklyEntryCurve : d.weekly_entry_curve_json
          );
          const weeklyExit = parseWeeklySevenNumbers(
            d.weeklyExitCurve != null ? d.weeklyExitCurve : d.weekly_exit_curve_json
          );
          return {
            roomId: c.roomId,
            roomName: c.roomName,
            shortName: c.shortName,
            pred: buildPredFromPayload(d),
            trajectoryRows: parseTrajectory(
              d.nextRoomPrediction != null ? d.nextRoomPrediction : d.next_room_prob_json
            ),
            weeklyEntryRaw: weeklyEntry,
            weeklyExitRaw: weeklyExit,
          };
        } catch (e) {
          return null;
        }
      })
    );
    part.forEach((x) => {
      if (x) blocks.push(x);
    });
  }
  blocks.sort((a, b) => a.roomName.localeCompare(b.roomName, 'zh'));
  return blocks;
}

function readPortraitCache() {
  try {
    const raw = wx.getStorageSync(STORAGE_CACHE);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

function writePortraitCache(payload) {
  try {
    const safe = { ...payload };
    if (Array.isArray(safe.portraitBlocks)) {
      safe.portraitBlocks = safe.portraitBlocks.map((b) => {
        if (!b || typeof b !== 'object') return b;
        const { chartImageSrc, ...rest } = b;
        return rest;
      });
    }
    wx.setStorageSync(STORAGE_CACHE, JSON.stringify(safe));
  } catch (e) {
    /* ignore quota */
  }
}

function readLastManualAt() {
  try {
    const v = wx.getStorageSync(STORAGE_MANUAL_AT);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

function writeLastManualAt(ms) {
  try {
    wx.setStorageSync(STORAGE_MANUAL_AT, ms);
  } catch (e) {
    /* ignore */
  }
}

Page({
  data: {
    gateDenied: false,
    portraitLoading: false,
    portraitBlocks: [],
    /** 全页综合：各房间周曲线按日聚合后的时间带 */
    globalWeekColumns: [],
    globalWeekEntryAvg: [],
    globalWeekExitAvg: [],
    globalWeekImageSrc: '',
    hasGlobalWeekly: false,
    /** 统一展示：周一到周日入/离场均值带状图 */
    weeklyGlobalLegacy: false,
    /** 来自缓存时展示，否则为空 */
    cacheUpdatedText: '',
    manualRefreshBusy: false,
    /** ADMIN 及以上可见：绕过 12h 缓存与 10 分钟手动冷却，直连拉取（调试用） */
    canDebugPortraitRefresh: false,
    debugPortraitBusy: false,
    portraitEmptyHint:
      '未找到与您账号关联的预测快照：可能尚未跑批，或校内账号与门禁流水中的用户 ID 不一致。',
    chartW: 320,
    chartH: 88,
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();

    if (!hasAiPortraitTab()) {
      this.setData({ gateDenied: true });
      wx.showToast({ title: '请先完成校内绑定', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 450);
      return;
    }
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    this.setData({
      gateDenied: false,
      canDebugPortraitRefresh: hasMinRole(role, 'ADMIN'),
    });
    this.initLayout();
    this.loadAllPortraits({ mode: 'auto' });
  },

  initLayout() {
    const sys = wx.getSystemInfoSync();
    const w = Math.max(280, n(sys.windowWidth) - 36);
    this.setData({ chartW: w, chartH: 88 });
  },

  /**
   * @param {{ mode: 'auto'|'manual' }} opt
   * - auto：12 小时内有缓存则直接展示，否则拉网
   * - manual：受 10 分钟冷却，强制拉网并更新缓存
   */
  loadAllPortraits(opt) {
    const mode = opt && opt.mode === 'manual' ? 'manual' : 'auto';
    const userId = twinScan.readSpringUserId();
    if (!userId) {
      this.setData({
        portraitLoading: false,
        portraitBlocks: [],
        globalWeekColumns: [],
        globalWeekEntryAvg: [],
        globalWeekExitAvg: [],
        globalWeekImageSrc: '',
        hasGlobalWeekly: false,
        weeklyGlobalLegacy: false,
        cacheUpdatedText: '',
      });
      return;
    }
    if (mode === 'manual') {
      if (this.data.debugPortraitBusy) return;
      const last = readLastManualAt();
      const remain = MANUAL_COOLDOWN_MS - (Date.now() - last);
      if (last > 0 && remain > 0) {
        if (remain < 60000) {
          const sec = Math.max(1, Math.ceil(remain / 1000));
          wx.showToast({ title: `${sec} 秒后再试`, icon: 'none' });
        } else {
          const min = Math.ceil(remain / 60000);
          wx.showToast({ title: `${min} 分钟后再手动刷新`, icon: 'none' });
        }
        return;
      }
      this.fetchPortraitsFromNetwork(userId, { isManual: true });
      return;
    }
    const cached = readPortraitCache();
    const now = Date.now();
    if (
      cached &&
      String(cached.userId || '') === userId &&
      typeof cached.fetchedAt === 'number' &&
      now - cached.fetchedAt < CACHE_TTL_MS
    ) {
      const chartW = n(cached.chartW) || this.data.chartW;
      const chartH = n(cached.chartH) || this.data.chartH;
      const blocks = (Array.isArray(cached.portraitBlocks) ? cached.portraitBlocks : []).map((b) => {
        if (!b || typeof b !== 'object') return b;
        const { chartImageSrc, ...rest } = b;
        return rest;
      });
      const globalWeekColumns = Array.isArray(cached.globalWeekColumns) ? cached.globalWeekColumns : [];
      const globalWeekEntryAvg = Array.isArray(cached.globalWeekEntryAvg) ? cached.globalWeekEntryAvg : [];
      const globalWeekExitAvg = Array.isArray(cached.globalWeekExitAvg) ? cached.globalWeekExitAvg : [];
      const hasGlobalWeekly =
        typeof cached.hasGlobalWeekly === 'boolean'
          ? cached.hasGlobalWeekly
          : globalWeekColumns.some((col) => col && col.hasBand);
      const cacheUpdatedText = this._formatCacheHint(cached.fetchedAt);
      this.setData(
        {
          portraitLoading: false,
          portraitBlocks: blocks,
          globalWeekColumns,
          globalWeekEntryAvg,
          globalWeekExitAvg,
          globalWeekImageSrc: '',
          hasGlobalWeekly,
          weeklyGlobalLegacy: false,
          chartW,
          chartH,
          cacheUpdatedText,
          manualRefreshBusy: false,
        },
        () => {
          wx.nextTick(() =>
            setTimeout(() => this.exportGlobalWeekImage(() => this.exportAllChartImages()), 60)
          );
        }
      );
      return;
    }
    this.fetchPortraitsFromNetwork(userId, { isManual: false });
  },

  _formatCacheHint(fetchedAt) {
    const t = typeof fetchedAt === 'number' ? fetchedAt : 0;
    if (!t) return '';
    const d = new Date(t);
    const pad = (x) => (x < 10 ? `0${x}` : `${x}`);
    return `数据更新于 ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  async fetchPortraitsFromNetwork(userId, flags) {
    const isManual = !!(flags && flags.isManual);
    const isDebugForce = !!(flags && flags.isDebugForce);
    if (isDebugForce) {
      const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
      if (!hasMinRole(role, 'ADMIN')) {
        wx.showToast({ title: '无权限', icon: 'none' });
        return;
      }
      this.setData({
        debugPortraitBusy: true,
        portraitLoading: true,
        portraitBlocks: [],
        globalWeekColumns: [],
        globalWeekEntryAvg: [],
        globalWeekExitAvg: [],
        globalWeekImageSrc: '',
        hasGlobalWeekly: false,
        weeklyGlobalLegacy: false,
        cacheUpdatedText: '',
      });
    } else if (isManual) {
      this.setData({ manualRefreshBusy: true });
    } else {
      this.setData({
        portraitLoading: true,
        portraitBlocks: [],
        globalWeekColumns: [],
        globalWeekEntryAvg: [],
        globalWeekExitAvg: [],
        globalWeekImageSrc: '',
        hasGlobalWeekly: false,
        weeklyGlobalLegacy: false,
        cacheUpdatedText: '',
      });
    }
    try {
      const overviewP = springAuth.springRequest({
        url: '/api/v1/twin/dashboard/wechat-overview',
        method: 'GET',
        data: {},
      });
      const analyzeP = springAuth
        .springRequest({
          url: '/api/v1/twin/scan/analyze',
          method: 'GET',
          data: { userId },
        })
        .catch(() => ({ statusCode: 0, data: null }));
      const [ovRes, anRes] = await Promise.all([overviewP, analyzeP]);
      const parsedOv = parseOverview(ovRes);
      if (!parsedOv.ok) throw new Error(parsedOv.message);
      const parsedAn = twinScan.parseAnalyzeResult(anRes);
      const dto = parsedAn.dto && parsedAn.dto.success === true ? parsedAn.dto : null;
      const fromAnalyze = twinScan.scanTargetRoomsToCandidates(dto);
      const fromOverview = overviewRoomCandidates(parsedOv.rows);
      const candidates = mergePortraitProbeOrder(fromAnalyze, fromOverview);
      const CONCURRENCY = 5;
      const MAX_PROBE = 400;
      const portraitBlocks = await fetchAllRoomPortraits(userId, candidates, CONCURRENCY, MAX_PROBE);
      const weekAgg = aggregateWeeklyAcrossBlocks(portraitBlocks);
      const globalWeekColumns = weekAgg.columns;
      const globalWeekEntryAvg = weekAgg.entryAvg;
      const globalWeekExitAvg = weekAgg.exitAvg;
      const hasGlobalWeekly = globalWeekColumns.some((col) => col && col.hasBand);
      stripWeeklyRawFromBlocks(portraitBlocks);
      const sys = wx.getSystemInfoSync();
      const chartW = Math.max(280, n(sys.windowWidth) - 36);
      const chartH = 88;
      const fetchedAt = Date.now();
      writePortraitCache({
        userId,
        fetchedAt,
        portraitBlocks,
        globalWeekColumns,
        globalWeekEntryAvg,
        globalWeekExitAvg,
        hasGlobalWeekly,
        weeklyGlobalLegacy: false,
        chartW,
        chartH,
      });
      if (isManual) {
        writeLastManualAt(fetchedAt);
      }
      const cacheUpdatedText = this._formatCacheHint(fetchedAt);
      this.setData(
        {
          portraitLoading: false,
          manualRefreshBusy: false,
          debugPortraitBusy: false,
          portraitBlocks,
          globalWeekColumns,
          globalWeekEntryAvg,
          globalWeekExitAvg,
          globalWeekImageSrc: '',
          hasGlobalWeekly,
          weeklyGlobalLegacy: false,
          chartW,
          chartH,
          cacheUpdatedText,
        },
        () => {
          wx.nextTick(() =>
            setTimeout(() => this.exportGlobalWeekImage(() => this.exportAllChartImages()), 60)
          );
        }
      );
      if (isManual) {
        wx.showToast({ title: '已更新', icon: 'success' });
      } else if (isDebugForce) {
        wx.showToast({ title: '已强刷（调试用）', icon: 'none' });
      }
    } catch (err) {
      this.setData({
        portraitLoading: false,
        manualRefreshBusy: false,
        debugPortraitBusy: false,
      });
      if (!isManual && !isDebugForce) {
        this.setData({
          portraitBlocks: [],
          globalWeekColumns: [],
          globalWeekEntryAvg: [],
          globalWeekExitAvg: [],
          globalWeekImageSrc: '',
          hasGlobalWeekly: false,
          weeklyGlobalLegacy: false,
        });
      }
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 16) : '加载失败',
        icon: 'none',
      });
    }
  },

  onManualRefresh() {
    if (this.data.debugPortraitBusy) return;
    this.loadAllPortraits({ mode: 'manual' });
  },

  /** 管理员及以上：忽略缓存与手动冷却，立即拉网（仅调试用） */
  onDebugForceRefresh() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (this.data.manualRefreshBusy || this.data.debugPortraitBusy) return;
    const userId = twinScan.readSpringUserId();
    if (!userId) {
      wx.showToast({ title: '缺少用户 ID', icon: 'none' });
      return;
    }
    this.fetchPortraitsFromNetwork(userId, { isDebugForce: true });
  },

  /** 全局周图：入场线 + 离场线 + 带状区，导出成图片供 WXML 展示 */
  exportGlobalWeekImage(onDone) {
    const hasGlobalWeekly = !!this.data.hasGlobalWeekly;
    const entryAvg = this.data.globalWeekEntryAvg || [];
    const exitAvg = this.data.globalWeekExitAvg || [];
    const W = this.data.chartW;
    const H = Math.max(84, Math.round(this.data.chartH * 0.92));
    if (!hasGlobalWeekly || !W || !H || entryAvg.length !== 7 || exitAvg.length !== 7) {
      this.setData({ globalWeekImageSrc: '' }, () => {
        if (typeof onDone === 'function') onDone();
      });
      return;
    }
    const dpr = Math.min(2.5, Math.max(1, wx.getSystemInfoSync().pixelRatio || 2));
    this.drawGlobalWeekChart(entryAvg, exitAvg, 'aiPredExport', W, H, () => {
      wx.canvasToTempFilePath(
        {
          canvasId: 'aiPredExport',
          destWidth: Math.floor(W * dpr),
          destHeight: Math.floor(H * dpr),
          success: (res) => {
            const path = res && res.tempFilePath ? res.tempFilePath : '';
            this.setData({ globalWeekImageSrc: path }, () => {
              if (typeof onDone === 'function') onDone();
            });
          },
          fail: () => {
            this.setData({ globalWeekImageSrc: '' }, () => {
              if (typeof onDone === 'function') onDone();
            });
          },
        },
        this
      );
    });
  },

  drawGlobalWeekChart(entryAvg, exitAvg, canvasId, W, H, onDone) {
    const ctx = wx.createCanvasContext(canvasId, this);
    const padL = Math.max(16, Math.round(W * 0.08));
    const padR = Math.max(16, Math.round(W * 0.06));
    const padT = 8;
    const padB = 16;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const LO = 6;
    const HI = 22;
    const span = HI - LO;
    const xAt = (i) => padL + (plotW * i) / 6;
    const yAt = (h) => {
      const hh = Math.max(LO, Math.min(HI, n(h)));
      return padT + plotH - ((hh - LO) / span) * plotH;
    };

    ctx.setFillStyle('#0f172a');
    ctx.fillRect(0, 0, W, H);
    ctx.setStrokeStyle('rgba(148,163,184,0.18)');
    ctx.setLineWidth(1);
    for (let i = 0; i < 7; i += 1) {
      const x = xAt(i);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }

    const valid = [];
    for (let i = 0; i < 7; i += 1) {
      const e = entryAvg[i];
      const x = exitAvg[i];
      if (Number.isFinite(e) && e >= 0 && Number.isFinite(x) && x >= 0) {
        valid.push(i);
      }
    }
    if (valid.length > 1) {
      ctx.beginPath();
      valid.forEach((i, idx) => {
        const px = xAt(i);
        const py = yAt(entryAvg[i]);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      for (let k = valid.length - 1; k >= 0; k -= 1) {
        const i = valid[k];
        ctx.lineTo(xAt(i), yAt(exitAvg[i]));
      }
      ctx.closePath();
      ctx.setFillStyle('rgba(167,139,250,0.20)');
      ctx.fill();
    }

    const strokeSeries = (arr, color, dash) => {
      let started = false;
      ctx.beginPath();
      ctx.setStrokeStyle(color);
      ctx.setLineWidth(1.6);
      if (dash) ctx.setLineDash([4, 3]);
      else ctx.setLineDash([]);
      for (let i = 0; i < 7; i += 1) {
        const v = arr[i];
        if (!Number.isFinite(v) || v < 0) {
          started = false;
          continue;
        }
        const px = xAt(i);
        const py = yAt(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    strokeSeries(entryAvg, '#60a5fa', false);
    strokeSeries(exitAvg, '#f472b6', true);

    ctx.setFillStyle('#94a3b8');
    ctx.setFontSize(9);
    ctx.setTextAlign('center');
    WEEK_DAY_LABELS.forEach((d, i) => {
      ctx.fillText(d, xAt(i), H - 2);
    });

    if (typeof onDone === 'function') {
      ctx.draw(false, () => wx.nextTick(() => onDone()));
    } else {
      ctx.draw();
    }
  },

  /** 离屏 canvas 导出为图片，避免页面内原生 canvas 在滚动时盖住自定义 tabBar */
  exportAllChartImages() {
    const blocks = this.data.portraitBlocks || [];
    const W = this.data.chartW;
    const H = this.data.chartH;
    if (!blocks.length || !W || !H) return;
    const dpr = Math.min(2.5, Math.max(1, wx.getSystemInfoSync().pixelRatio || 2));
    const step = (idx) => {
      if (idx >= blocks.length) return;
      const block = blocks[idx];
      if (!block || !block.pred) {
        step(idx + 1);
        return;
      }
      this.drawOneChart(block.pred, 'aiPredExport', W, H, () => {
        wx.canvasToTempFilePath(
          {
            canvasId: 'aiPredExport',
            destWidth: Math.floor(W * dpr),
            destHeight: Math.floor(H * dpr),
            success: (res) => {
              const path = res && res.tempFilePath;
              if (path) {
                this.setData({ [`portraitBlocks[${idx}].chartImageSrc`]: path }, () => {
                  setTimeout(() => step(idx + 1), 30);
                });
              } else {
                step(idx + 1);
              }
            },
            fail: () => {
              step(idx + 1);
            },
          },
          this
        );
      });
    };
    wx.nextTick(() => setTimeout(() => step(0), 80));
  },

  drawOneChart(pred, canvasId, W, H, onDone) {
    if (!pred) return;
    const ctx = wx.createCanvasContext(canvasId, this);
    const side = Math.max(10, Math.round(W * 0.05));
    const padL = side;
    const padR = side;
    const padT = 8;
    const padB = 18;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const entry = pred.entryCurve || [];
    const exit = pred.exitCurve || [];
    const dayStart = 7;
    const dayEnd = 19;
    const len = dayEnd - dayStart + 1;
    let maxV = 0.02;
    for (let i = 0; i < len; i += 1) {
      const h = dayStart + i;
      maxV = Math.max(maxV, n(entry[h]), n(exit[h]));
    }

    ctx.setFillStyle('#0f172a');
    ctx.fillRect(0, 0, W, H);

    ctx.setStrokeStyle('rgba(148,163,184,0.25)');
    ctx.setLineWidth(1);
    for (let g = 1; g <= 3; g += 1) {
      const y = padT + (plotH / 4) * g;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
    }

    const xAt = (i) => padL + (len <= 1 ? 0 : (plotW * i) / (len - 1));
    const yAt = (v) => padT + plotH - (plotH * n(v)) / maxV;

    const strokeLine = (arr, color, dash) => {
      ctx.beginPath();
      ctx.setStrokeStyle(color);
      ctx.setLineWidth(1.5);
      if (dash) ctx.setLineDash([4, 3]);
      else ctx.setLineDash([]);
      for (let i = 0; i < len; i += 1) {
        const h = dayStart + i;
        const x = xAt(i);
        const y = yAt(arr[h] || 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    strokeLine(entry, '#60a5fa', false);
    strokeLine(exit, '#a78bfa', true);

    ctx.setFillStyle('#64748b');
    ctx.setFontSize(9);
    ctx.setTextAlign('center');
    const ticks = [7, 10, 13, 16, 19];
    ticks.forEach((h) => {
      const i = h - dayStart;
      if (i >= 0 && i < len) {
        ctx.fillText(String(h), xAt(i), H - 4);
      }
    });

    if (typeof onDone === 'function') {
      ctx.draw(false, () => {
        wx.nextTick(() => onDone());
      });
    } else {
      ctx.draw();
    }
  },
});
