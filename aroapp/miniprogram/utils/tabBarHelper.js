var springAuth = require('./springAuth.js');
var pagePermission = require('./pagePermission.js');
var { isStudentAccount } = require('./roleAccess.js');

var ICON_OVERVIEW = '/pages/assets/images/icon-overview.png';
var ICON_SUPPLIES = '/pages/assets/images/icon-supplies.png';
var ICON_CAGE = '/pages/assets/images/icon-cage.png';
var ICON_ROOM = '/pages/assets/images/icon-room.png';

function buildTabList() {
  if (isStudentAccount()) {
    return buildStudentTabList();
  }
  return buildStaffTabList();
}

function buildStaffTabList() {
  var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  var tabs = [
    { path: '/pages/index/index', text: '首页', icon: 'home-o', minRole: 'STUDENT' },
    {
      path: '/pages/room/index',
      text: '房间',
      icon: '',
      iconSrc: ICON_ROOM,
      minRole: 'STUDENT',
    },
    {
      path: '/pages/overview/index',
      text: '概览',
      icon: 'chart-trending-o',
      iconSrc: ICON_OVERVIEW,
      minRole: 'ADMIN',
    },
    { path: '/pages/telemetry/index', text: '温湿度', icon: 'description', minRole: 'ADMIN' },
  ];
  tabs.push({ path: '/pages/mine/index', text: '我的', icon: 'manager-o', minRole: 'STUDENT' });
  return tabs.filter(function (tab) {
    return pagePermission.canShowMiniEntry('tabbar', tab.path, role, tab.minRole || 'STUDENT');
  });
}

function buildStudentTabList() {
  var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  var tabs = [
    { path: '/pages/index/index', text: '首页', icon: 'home-o', minRole: 'STUDENT' },
    {
      path: '/pages/room/index',
      text: '房间',
      icon: '',
      iconSrc: ICON_ROOM,
      minRole: 'STUDENT',
    },
    {
      path: '/package-feature/pages/studentMaterial/index',
      text: '申领',
      icon: '',
      iconSrc: ICON_SUPPLIES,
      minRole: 'STUDENT',
      isNav: true,
    },
    {
      path: '/package-feature/pages/studentCageShelf/index',
      text: '笼架',
      icon: '',
      iconSrc: ICON_CAGE,
      minRole: 'STUDENT',
      isNav: true,
    },
    { path: '/pages/mine/index', text: '我的', icon: 'manager-o', minRole: 'STUDENT' },
  ];
  return tabs.filter(function (tab) {
    return pagePermission.canShowMiniEntry('tabbar', tab.path, role, tab.minRole || 'STUDENT');
  });
}

var ROOM_CONTEXT_PATHS = [
  '/package-feature/pages/roomAudit/index',
  '/package-feature/pages/dahuaIssue/index',
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
