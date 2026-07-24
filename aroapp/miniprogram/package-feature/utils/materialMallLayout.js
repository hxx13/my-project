const { MALL_TOOLBAR_H, NOVELTY_HINT_BLOCK_H, readCustomNavMetrics } = require('../../utils/customNavMetrics.js');

const BOTTOM_BAR_H = 54;

/** 标准布局：固定导航 + fixed 工具条/提示条 + 列表 scroll-view（px 高度） */
function calcMaterialMallLayout(options) {
  const noveltyVisible = !!(options && options.noveltyVisible);
  const sys = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const winH = sys.windowHeight || 667;
  const safe = (sys.safeAreaInsets && sys.safeAreaInsets.bottom) || 0;
  const nav = readCustomNavMetrics();
  const noveltyH = noveltyVisible ? NOVELTY_HINT_BLOCK_H : 0;
  const headerBodyH = MALL_TOOLBAR_H + noveltyH;
  const mainScrollH = Math.max(
    160,
    Math.floor(winH - nav.navBarHeight - headerBodyH - BOTTOM_BAR_H - safe)
  );
  return {
    pageHeight: winH,
    navBarHeight: nav.navBarHeight,
    headerBodyH,
    mainScrollH,
  };
}

/** @deprecated 使用 calcMaterialMallLayout */
function calcMaterialMallMainScrollH(options) {
  const layout = calcMaterialMallLayout(options);
  return { mainScrollH: layout.mainScrollH, navBarHeight: layout.navBarHeight };
}

module.exports = {
  BOTTOM_BAR_H,
  MALL_TOOLBAR_H,
  calcMaterialMallLayout,
  calcMaterialMallMainScrollH,
};
