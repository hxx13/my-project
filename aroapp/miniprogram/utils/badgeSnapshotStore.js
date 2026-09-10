/**
 * 全局待办角标快照：TabBar / 首页 / 我的 / 通知 共用，合并并发请求并保留最后一次成功结果，减少闪烁与重复流量。
 * 标记已读后请 refreshPendingBadges({ force: true })，保证与库内状态一致。
 */
const {
  fetchPendingBadgeCounts,
  resetPendingBadgeInflight,
  EMPTY_BADGE_COUNTS,
} = require('./pendingBadgeCounts.js');

/** 上一次成功拉取的 pending-badges 解析结果；注销后为 null */
let lastSnapshot = null;
/** 审核页回写的实时统计（学生审核五项）：网络刷新后要盖回去，否则又变回后端口径 */
let liveOverride = null;
const listeners = new Set();

function peekPendingBadges() {
  return lastSnapshot;
}

function subscribePendingBadges(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitPendingBadges(snapshot) {
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * @param {{ force?: boolean }} [opts]
 */
async function refreshPendingBadges(opts) {
  const r = await fetchPendingBadgeCounts(opts);
  if (r && r.ok) {
    const { ok, ...snapshot } = r;
    lastSnapshot = snapshot;
    return applyOverrideAndEmit();
  }
  /** 网络/5xx/解析失败：保留上次成功快照，避免采购等角标被误清零 */
  return applyOverrideAndEmit();
}

/** 快照合并页面实时覆盖后广播；还没有快照时用空快照兜底，避免把 null 播给订阅方 */
function applyOverrideAndEmit() {
  if (liveOverride) {
    lastSnapshot = Object.assign({}, lastSnapshot || EMPTY_BADGE_COUNTS, liveOverride);
  }
  emitPendingBadges(lastSnapshot);
  return lastSnapshot || { ...EMPTY_BADGE_COUNTS };
}

function clearPendingBadgeCache() {
  lastSnapshot = null;
  liveOverride = null;
  resetPendingBadgeInflight();
}

/** 审核页实时统计覆盖的字段（= 学生审核菜单角标求和口径） */
const STUDENT_REVIEW_LIVE_KEYS = [
  'processMaterial',
  'processScanDelay',
  'processAroTraining',
  'processCageClaim',
  'processCageOp',
];

/**
 * 审核页把「实时」的各 tab 待办数回写进快照。
 *
 * 为什么必须回写：页面各 tab 的角标按实时列表算，菜单角标走 /api/me/pending-badges 的后端计数，
 * 两者口径与时机都不同，会各显示一个数（脱钩）。菜单角标 = 页面各 tab 角标之和这条层级关系要成立，
 * 菜单侧就得用页面那一份实时数；回写后会一直盖在网络值上（含每次网络刷新之后），直到注销。
 * 其余字段（私聊未读、采购、报修、物资等）原样保留，不受影响。
 */
function applyStudentReviewLiveCounts(partial) {
  if (!partial) return lastSnapshot;
  const merged = Object.assign({}, liveOverride);
  STUDENT_REVIEW_LIVE_KEYS.forEach((k) => {
    const v = partial[k];
    if (typeof v === 'number' && v >= 0) merged[k] = v;
  });
  liveOverride = merged;
  return applyOverrideAndEmit();
}

module.exports = {
  peekPendingBadges,
  subscribePendingBadges,
  refreshPendingBadges,
  clearPendingBadgeCache,
  applyStudentReviewLiveCounts,
};
