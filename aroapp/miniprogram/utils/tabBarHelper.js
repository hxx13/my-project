var springAuth = require('./springAuth.js');
var pagePermission = require('./pagePermission.js');
var { isStudentAccount } = require('./roleAccess.js');

var ICON_SUPPLIES = '/pages/assets/images/icon-supplies.png';
var ICON_CAGE = '/pages/assets/images/icon-cage.png';
var ICON_ROOM = '/pages/assets/images/icon-room.png';
var ICON_HOME = '/pages/assets/images/icon-home.png';
var ICON_TELEMETRY = '/pages/assets/images/icon-telemetry.png';
var ICON_MINE = '/pages/assets/images/icon-mine.png';

function buildTabList() {
  var tabs = isStudentAccount() ? buildStudentTabList() : buildStaffTabList();
  // 球球（智能助手）嵌在 tabBar 正中间一位。它不切页，点开是对话抽屉，
  // 所以没有 path；activeIndexForRoute 按 path 找下标，不会认错它。
  //
  // **要正中，两套列表都得是偶数项**（插完是奇数，Math.floor(n/2) 才是正中那一格）。
  // 现在是：教职工 4 → 5，学生 4 → 5，都正中。往任一套里加/减一项前先算一遍，
  // 否则助手会偏一格（看起来像"居中的按钮歪了"，很难查回这里）。
  tabs.splice(Math.floor(tabs.length / 2), 0, {
    isAi: true,
    path: '',
    text: '助手',
    icon: '',
    iconSrc: '',
  });
  return tabs;
}

function buildStaffTabList() {
  var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  var tabs = [
    { path: '/pages/index/index', text: '首页', icon: '', iconSrc: ICON_HOME, minRole: 'STUDENT' },
    {
      path: '/pages/room/index',
      text: '房间',
      icon: '',
      iconSrc: ICON_ROOM,
      minRole: 'STUDENT',
    },
    {
      path: '/pages/telemetry/index',
      text: '温湿度',
      icon: '',
      iconSrc: ICON_TELEMETRY,
      minRole: 'ADMIN',
    },
  ];
  tabs.push({ path: '/pages/mine/index', text: '我的', icon: '', iconSrc: ICON_MINE, minRole: 'STUDENT' });
  return tabs.filter(function (tab) {
    return pagePermission.canShowMiniEntry('tabbar', tab.path, role, tab.minRole || 'STUDENT');
  });
}

function buildStudentTabList() {
  var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  var tabs = [
    { path: '/pages/index/index', text: '首页', icon: '', iconSrc: ICON_HOME, minRole: 'STUDENT' },
    {
      path: '/pages/room/index',
      text: '房间',
      icon: '',
      iconSrc: ICON_ROOM,
      minRole: 'STUDENT',
    },
    {
      path: '/package-student/pages/studentMaterial/index',
      text: '申领',
      icon: '',
      iconSrc: ICON_SUPPLIES,
      minRole: 'STUDENT',
      isNav: true,
    },
    // 学生端**不放「笼架」**：首页那张九宫格里有笼架入口，底部再占一格是重复；
    // 而且去掉它之后本列表是 4 项，插入助手正好 5 项、助手落在**正中间**（见 buildTabList）。
    // 以后要往这里加项，先看那条注释 —— 加回第 5 项会把助手挤偏。
    { path: '/pages/mine/index', text: '我的', icon: '', iconSrc: ICON_MINE, minRole: 'STUDENT' },
  ];
  return tabs.filter(function (tab) {
    return pagePermission.canShowMiniEntry('tabbar', tab.path, role, tab.minRole || 'STUDENT');
  });
}

var ROOM_CONTEXT_PATHS = [
  '/package-feature/pages/roomAudit/index',
  '/package-door/pages/dahuaIssue/index',
];

function activeIndexForRoute(route) {
  var path = route.startsWith('/') ? route : '/' + route;
  var tabs = buildTabList();
  var idx = tabs.findIndex(function (t) { return t.path === path; });
  if (idx >= 0) return idx;
  if (ROOM_CONTEXT_PATHS.indexOf(path) >= 0) {
    var roomIdx = tabs.findIndex(function (t) { return t.path === '/pages/room/index'; });
    if (roomIdx >= 0) return roomIdx;
  }
  return 0;
}

function hasAiPortraitTab() {
  var token = wx.getStorageSync(springAuth.KEYS.TOKEN);
  return !!token;
}

module.exports = {
  buildTabList,
  buildStudentTabList: buildStudentTabList,
  buildStaffTabList: buildStaffTabList,
  activeIndexForRoute,
  hasAiPortraitTab: hasAiPortraitTab,
};
