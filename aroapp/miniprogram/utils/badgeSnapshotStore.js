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
    emitPendingBadges(lastSnapshot);
    return lastSnapshot;
  }
  /** 网络/5xx/解析失败：保留上次成功快照，避免采购等角标被误清零 */
  emitPendingBadges(lastSnapshot);
  return lastSnapshot || { ...EMPTY_BADGE_COUNTS };
}

function clearPendingBadgeCache() {
  lastSnapshot = null;
  resetPendingBadgeInflight();
}

module.exports = {
  peekPendingBadges,
  subscribePendingBadges,
  refreshPendingBadges,
  clearPendingBadgeCache,
};
