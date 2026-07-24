/** 物资商城页：文档流工具条单行高度（搜索 50% + 右侧入口） */
const MALL_TOOLBAR_H = 46;

/** 进货/上新提示条占用高度（含 margin-top 6px） */
const NOVELTY_HINT_BLOCK_H = 42;

/** 自定义顶栏尺寸（与微信胶囊对齐） */
function readCustomNavMetrics() {
  var sys, menu;
  try {
    sys = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
  } catch (e) {
    sys = { statusBarHeight: 20, windowHeight: 667 };
  }
  try {
    menu = wx.getMenuButtonBoundingClientRect();
  } catch (e) {
    menu = null;
  }
  var statusBarHeight = (sys && sys.statusBarHeight) || 20;
  var menuTop = (menu && typeof menu.top === 'number') ? menu.top : (statusBarHeight + 8);
  var menuHeight = (menu && typeof menu.height === 'number') ? menu.height : 32;
  var navContentHeight = menuHeight || 32;
  // navBarHeight = 状态栏 + 导航内容行 = statusBarHeight + navContentHeight
  // 之前错误地用 (menuTop - statusBarHeight)*2 + navContentHeight，
  // 漏掉了 statusBarHeight，导致 placeholder 比实际 nav bar 矮一整段状态栏高度
  var navBarHeight = statusBarHeight + navContentHeight;
  return {
    statusBarHeight: statusBarHeight,
    navBarHeight: navBarHeight,
    navContentHeight: navContentHeight,
  };
}

function readMaterialMallHeaderMetrics() {
  const nav = readCustomNavMetrics();
  return {
    ...nav,
    mallToolbarHeight: MALL_TOOLBAR_H,
    headerHeight: nav.navBarHeight + MALL_TOOLBAR_H,
  };
}

module.exports = {
  MALL_TOOLBAR_H,
  NOVELTY_HINT_BLOCK_H,
  readCustomNavMetrics,
  readMaterialMallHeaderMetrics,
};
