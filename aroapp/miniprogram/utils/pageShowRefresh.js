/**
 * 控制页面 onShow 的重复刷新，避免频繁返回页面时闪烁。
 * 仅当场景 key 变化，或超过 ttlMs 时，才允许刷新。
 */
function shouldRefreshOnShow(page, options) {
  const opts = options || {};
  const ttlMs = Number(opts.ttlMs || 0);
  const sceneKey = String(opts.sceneKey || '');
  if (!page || typeof page !== 'object') return true;

  const now = Date.now();
  const lastAt = Number(page.__onShowRefreshAt || 0);
  const lastSceneKey = String(page.__onShowSceneKey || '');
  const neverLoaded = !lastAt;
  const sceneChanged = sceneKey !== lastSceneKey;
  const ttlExpired = ttlMs > 0 ? now - lastAt >= ttlMs : false;
  const shouldRefresh = neverLoaded || sceneChanged || ttlExpired;

  if (shouldRefresh) {
    page.__onShowRefreshAt = now;
    page.__onShowSceneKey = sceneKey;
  }
  return shouldRefresh;
}

module.exports = {
  shouldRefreshOnShow,
};
