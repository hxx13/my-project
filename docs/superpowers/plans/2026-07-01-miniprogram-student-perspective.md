# 小程序学生视角首页改造 + 统一登录 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 H5 学生端首页（进出状态指示条 + 七入口宫格）迁移到小程序，并统一"我的"为账号密码登录入口。

**Architecture:** 通过 `isStudentAccount()` 在首页 + custom-tab-bar + mine 页三个位置条件渲染不同布局。学生视角显示 H5 同款七入口 + 状态指示条 + 底部五Tab（首页/房间/申领/笼架/我的）；教职工视角完全保持现有布局不变。登录统一调用 Web 端 `/api/auth/login/web`。

**Tech Stack:** 微信小程序原生框架 + Vant Weapp 组件库 + 云函数 springProxy 转发

**前置检查:** 确保云函数 `springProxy` 的 `ALLOWED_API_PREFIXES` 环境变量包含 `/api/auth`（登录/注册接口需要）和 `/api/student`（presence 接口需要）。

---

### Task 1: roleAccess.js — 新增 isStudentAccount() 并修复角色映射

**Files:**
- Modify: `aroapp/miniprogram/utils/roleAccess.js`

- [ ] **Step 1: 添加 isStudentAccount() 函数并修复 STUDENT→MEMBER 映射**

`roleAccess.js` 当前将 `STUDENT` 映射为 level 1，但 Web 端后端实际使用 `MEMBER` 作为 role 枚举值。需要在 `ROLE_LEVEL_MAP` 中同时支持 `MEMBER` 和 `STUDENT`，并新增 `isStudentAccount()` 函数。

修改 `aroapp/miniprogram/utils/roleAccess.js`，完整替换为：

```javascript
/**
 * 与 frontend/src/features/auth/roleAccess.ts 保持一致，供小程序侧权限判断。
 */

const ROLE_LEVEL_MAP = {
  MEMBER: 1,
  STUDENT: 1,
  STAFF: 2,
  SENIOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
  PLATFORM_OWNER: 6,
};

function getRoleLevel(role) {
  if (!role) return ROLE_LEVEL_MAP.MEMBER;
  return ROLE_LEVEL_MAP[String(role).toUpperCase()] ?? ROLE_LEVEL_MAP.MEMBER;
}

function hasMinRole(currentRole, minRole) {
  return getRoleLevel(currentRole) >= getRoleLevel(minRole);
}

/**
 * 判定当前用户是否为学生账号。
 * 优先使用 accountSource，与 Web 端 postLoginNavigation.ts 的 isStudentAccount() 完全一致。
 * @returns {boolean}
 */
function isStudentAccount() {
  try {
    var raw = wx.getStorageSync('springUserInfo');
    if (raw) {
      var ui = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (ui && ui.accountSource === 'STUDENT') return true;
      if (ui && ui.accountSource === 'STAFF') return false;
    }
  } catch (e) {
    // fall through to role-level check
  }
  var role = wx.getStorageSync('springRole') || '';
  return !hasMinRole(role, 'STAFF');
}

module.exports = {
  ROLE_LEVEL_MAP,
  getRoleLevel,
  hasMinRole,
  isStudentAccount,
};
```

- [ ] **Step 2: 验证语法正确**

Run: 在微信开发者工具中重新编译，确保无语法错误。

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/utils/roleAccess.js
git commit -m "fix: add isStudentAccount() + MEMBER role mapping to match web auth"
```

---

### Task 2: tabBarHelper.js — 新增学生底部 Tab 列表

**Files:**
- Modify: `aroapp/miniprogram/utils/tabBarHelper.js`

- [ ] **Step 1: 添加 buildStudentTabList() 和对应的 activeIndex**

修改 `aroapp/miniprogram/utils/tabBarHelper.js`，完整替换为：

```javascript
var springAuth = require('./springAuth.js');
var pagePermission = require('./pagePermission.js');
var { isStudentAccount } = require('./roleAccess.js');

var ICON_OVERVIEW = '/pages/assets/images/icon-overview.png';
var ICON_SUPPLIES = '/pages/assets/images/icon-supplies.png';
var ICON_CAGE = '/pages/assets/images/icon-cage.png';

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
    { path: '/pages/room/index', text: '房间', icon: 'location-o', minRole: 'STUDENT' },
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
    { path: '/pages/room/index', text: '房间', icon: 'location-o', minRole: 'STUDENT' },
    {
      path: '/package-feature/pages/studentMaterial/index',
      text: '申领',
      icon: '',
      iconSrc: ICON_SUPPLIES,
      minRole: 'STUDENT',
      isNav: true,
    },
    {
      path: '',
      text: '笼架',
      icon: '',
      iconSrc: ICON_CAGE,
      minRole: 'STUDENT',
      isNav: true,
      isPlaceholder: true,
    },
    { path: '/pages/mine/index', text: '我的', icon: 'manager-o', minRole: 'STUDENT' },
  ];
  return tabs.filter(function (tab) {
    return pagePermission.canShowMiniEntry('tabbar', tab.path, role, tab.minRole || 'STUDENT');
  });
}

function activeIndexForRoute(route) {
  var path = route.startsWith('/') ? route : '/' + route;
  var tabs = buildTabList();
  var idx = tabs.findIndex(function (t) { return t.path === path; });
  if (idx >= 0) return idx;
  return 0;
}

module.exports = {
  buildTabList,
  buildStudentTabList: buildStudentTabList,
  buildStaffTabList: buildStaffTabList,
  activeIndexForRoute,
};
```

- [ ] **Step 2: 验证编译通过**

在微信开发者工具中重新编译。

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/utils/tabBarHelper.js
git commit -m "feat: add student bottom tab list (首页/房间/申领/笼架/我的)"
```

---

### Task 3: custom-tab-bar — 支持学生 Tab 的非 switchTab 跳转

**Files:**
- Modify: `aroapp/miniprogram/custom-tab-bar/index.js`

custom-tab-bar 的 `onChange` 当前对所有 tab 执行 `wx.switchTab`。学生视角下"申领"和"笼架"不是 tabBar 页面，需用 `wx.navigateTo`。

- [ ] **Step 1: 修改 onChange 支持 navigateTo**

修改 `aroapp/miniprogram/custom-tab-bar/index.js`，仅改动 `onChange` 方法（其余代码保持不变）：

找到 `onChange` 方法（约第95行），替换为：

```javascript
    onChange(event) {
      var index = Number(event.detail);
      var tabList = this.data.tabList;
      if (Number.isNaN(index) || index < 0 || index >= tabList.length) return;
      var tab = tabList[index];
      if (tab.isPlaceholder) {
        wx.showToast({ title: '即将上线', icon: 'none' });
        return;
      }
      if (tab.isNav) {
        wx.navigateTo({ url: tab.path });
        return;
      }
      wx.switchTab({ url: tab.path });
      this.setData({ active: index });
    },
```

- [ ] **Step 2: 编译验证，确保教职工 Tab 不受影响**

在开发者工具中切换不同角色的账号验证 tab 点击行为。

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/custom-tab-bar/index.js
git commit -m "feat: custom-tab-bar supports navigateTo for student tabs"
```

---

### Task 4: pages/index/index.js — 新增学生视角数据与事件处理

**Files:**
- Modify: `aroapp/miniprogram/pages/index/index.js`

- [ ] **Step 1: 在文件头部添加引用和图标常量**

在 `aroapp/miniprogram/pages/index/index.js` 顶部，在现有常量声明之后、`Page({` 之前插入：

```javascript
var { isStudentAccount } = require('../../utils/roleAccess.js');

var ICON_ROOM = '/pages/assets/images/icon-room.png';
var ICON_SUPPLIES = '/pages/assets/images/icon-supplies.png';
var ICON_CAGE = '/pages/assets/images/icon-cage.png';
var ICON_RECORDS = '/pages/assets/images/icon-records.png';
var ICON_NOTIFY = '/pages/assets/images/icon-notify.png';
var ICON_GROUP = '/pages/assets/images/icon-group.png';
var ICON_VIOLATION = '/pages/assets/images/icon-violation.png';
```

- [ ] **Step 2: 在 data 中添加学生布局相关字段**

在 `Page({ data: { ... } })` 的 `data` 对象末尾（`navContentHeight: 32` 之后）添加：

```javascript
    isStudentView: false,

    iconRoom: ICON_ROOM,
    iconSupplies: ICON_SUPPLIES,
    iconCage: ICON_CAGE,
    iconRecords: ICON_RECORDS,
    iconNotify: ICON_NOTIFY,
    iconGroup: ICON_GROUP,
    iconViolation: ICON_VIOLATION,

    hasStudentPresence: false,
    presencePhase: '',
    presenceLabel: '',
    presenceRoomName: '',
    presenceDwellText: '',
    presenceCountdownText: '',
    presenceCountdownUrgent: false,
    presenceShowDwell: false,
    presenceShowCountdown: false,
    presencePhaseOutside: false,
    presencePhaseUnknown: false,

    hasExemptRow: false,
    exemptPhase: '',
    exemptBadge: '',
    exemptRoomNames: '',
    exemptRightPill: '',
    exemptAccent: '',
    exemptSoft: '',
    exemptBorder: '',
    exemptText: '',

    studentUpperRow: [
      { id: 'room', title: '房间', iconSrc: ICON_ROOM },
      { id: 'material', title: '申领', iconSrc: ICON_SUPPLIES },
      { id: 'cage', title: '笼架', iconSrc: ICON_CAGE },
    ],
    studentLowerRow: [
      { id: 'records', title: '出入记录', iconSrc: ICON_RECORDS },
      { id: 'notices', title: '通知', iconSrc: ICON_NOTIFY, badge: '' },
      { id: 'group', title: '课题组', iconSrc: ICON_GROUP },
      { id: 'violations', title: '违规记录', iconSrc: ICON_VIOLATION },
    ],
```

- [ ] **Step 3: 在 onShow 中调用 isStudentAccount() 判定视角**

在 `onShow()` 方法开头（`this.refreshLoginBar()` 之后、`pagePermission.refreshMiniPermissions()` 之前）插入：

```javascript
    var studentView = isStudentAccount();
    this.setData({ isStudentView: studentView });
    if (studentView) {
      this.loadPresenceStatus();
    }
```

- [ ] **Step 4: 添加 loadPresenceStatus() 方法和 presence 主题映射**

在 `Page({ ... })` 的 methods 中（在现有方法的 `},` 之后、`Page` 闭合前）添加：

```javascript

  PRESENCE_COLORS: {
    inside:        { accent: '#16a34a', soft: '#f0fdf4', border: '#bbf7d0', text: '#166534', badgeBg: '#dcfce7', badgeText: '#166534', iconBg: '#dcfce7', roomNameColor: '#166534', cardBg: 'rgba(240,253,244,0.96)' },
    pending_activation: { accent: '#d97706', soft: '#fffbeb', border: '#fde68a', text: '#92400e', badgeBg: '#fef3c7', badgeText: '#92400e', iconBg: '#fef3c7', roomNameColor: '#92400e', cardBg: 'rgba(255,251,235,0.96)' },
    pending_leave: { accent: '#dc2626', soft: '#fef2f2', border: '#fecaca', text: '#991b1b', badgeBg: '#fee2e2', badgeText: '#991b1b', iconBg: '#fee2e2', roomNameColor: '#991b1b', cardBg: 'rgba(254,242,242,0.96)' },
    outside:       { accent: '#6b7280', soft: '#f9fafb', border: '#e5e7eb', text: '#4b5563', badgeBg: '#f3f4f6', badgeText: '#4b5563', iconBg: '#f3f4f6', roomNameColor: '#6b7280', cardBg: 'rgba(255,255,255,0.92)' },
    unknown:       { accent: '#d97706', soft: '#fffbeb', border: '#fde68a', text: '#92400e', badgeBg: '#fef3c7', badgeText: '#92400e', iconBg: '#fef3c7', roomNameColor: '#6b7280', cardBg: 'rgba(255,251,235,0.96)' },
  },

  EXEMPT_THEME: {
    pending_review:   { accent: '#d97706', soft: '#fffbeb', border: '#fde68a', text: '#92400e', badge: '待审核' },
    approved_active:  { accent: '#16a34a', soft: '#f0fdf4', border: '#bbf7d0', text: '#166534', badge: '已授权' },
    approved_expired: { accent: '#dc2626', soft: '#fef2f2', border: '#fecaca', text: '#991b1b', badge: '已过期' },
    rejected:         { accent: '#6b7280', soft: '#f9fafb', border: '#e5e7eb', text: '#4b5563', badge: '已拒绝' },
  },

  loadPresenceStatus: function () {
    var self = this;
    var token = wx.getStorageSync('springToken');
    if (!token) return;
    springAuth.springRequest({
      url: '/api/student/mobile/presence',
      method: 'GET',
      data: {},
    }).then(function (res) {
      if (res.statusCode !== 200) return;
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (!body || !body.success || !body.data) return;
      var snap = body.data;
      self.applyPresenceSnapshot(snap);
    }).catch(function () {});
  },

  applyPresenceSnapshot: function (snap) {
    if (snap.loading) return;
    var phase = snap.phase || 'unknown';
    var theme = this.PRESENCE_COLORS[phase] || this.PRESENCE_COLORS['unknown'];
    var countdownUrgent = (snap.countdownSeconds || 0) > 0 && (snap.countdownSeconds || 0) <= 60;
    var countdownText = snap.countdownSeconds != null ? this.formatCountdown(snap.countdownSeconds) : '';
    var showRoomName = phase === 'inside' || phase === 'pending_activation' || phase === 'pending_leave';
    var dwellText = '';
    if (phase === 'inside' && snap.dwellSeconds != null) {
      dwellText = '在场 ' + this.formatElapsed(snap.dwellSeconds);
    }
    var showDwell = phase === 'inside' && snap.dwellSeconds != null;
    var showCountdown = (phase === 'pending_activation' || phase === 'pending_leave') && countdownText;

    var exempt = snap.exemptStatus;
    var hasExempt = exempt && exempt.phase && exempt.phase !== 'none';
    var exemptData = {};
    if (hasExempt) {
      var exTheme = this.EXEMPT_THEME[exempt.phase] || {};
      var roomNames = (exempt.roomNames && exempt.roomNames.length > 0) ? exempt.roomNames.join(' · ') : '—';
      var rightPill = '';
      if (exempt.phase === 'pending_review') {
        rightPill = exempt.extendUntilTime ? '延长至 ' + exempt.extendUntilTime : '';
      } else if (exempt.phase === 'approved_active') {
        if (exempt.remainingText) rightPill = exempt.remainingText;
        if (exempt.maxCount != null) {
          var remainCount = Math.max(0, exempt.maxCount - (exempt.usedCount || 0));
          rightPill = rightPill ? rightPill + ' · 剩余 ' + remainCount + '/' + exempt.maxCount + ' 次' : '剩余 ' + remainCount + '/' + exempt.maxCount + ' 次';
        }
      } else if (exempt.phase === 'approved_expired') {
        rightPill = exempt.expireAt ? '已到期（至 ' + (exempt.expireAt.slice(11, 16) || '') + '）' : '已到期';
      }
      exemptData = {
        hasExemptRow: true,
        exemptPhase: exempt.phase,
        exemptBadge: exTheme.badge || '',
        exemptRoomNames: exempt.phase === 'rejected' ? '已申请 · ' + roomNames + ' · 已拒绝' : roomNames,
        exemptRightPill: rightPill,
        exemptAccent: exTheme.accent || '',
        exemptSoft: exTheme.soft || '',
        exemptBorder: exTheme.border || '',
        exemptText: exTheme.text || '',
      };
    }

    this.setData({
      hasStudentPresence: true,
      presencePhase: phase,
      presenceLabel: (phase === 'inside' ? '已进入' : phase === 'pending_activation' ? '待激活' : phase === 'pending_leave' ? '待离开' : phase === 'outside' ? '已离开' : ''),
      phaseLabel: phase === 'inside' ? '已进入' : phase === 'pending_activation' ? '待激活' : phase === 'pending_leave' ? '待离开' : phase === 'outside' ? '已离开' : '',
      presenceRoomName: snap.roomName || '',
      presenceDwellText: dwellText,
      presenceCountdownText: countdownText,
      presenceCountdownUrgent: countdownUrgent,
      presenceShowDwell: showDwell,
      presenceShowCountdown: showCountdown,
      presencePhaseOutside: phase === 'outside',
      presencePhaseUnknown: phase === 'unknown',
      presenceAccent: theme.accent,
      presenceSoft: theme.soft,
      presenceBorder: theme.border,
      presenceText: theme.text,
      presenceBadgeBg: theme.badgeBg,
      presenceBadgeText: theme.badgeText,
      presenceIconBg: theme.iconBg,
      presenceRoomNameColor: theme.roomNameColor,
      presenceCardBg: theme.cardBg,
      hasExemptRow: exemptData.hasExemptRow || false,
      exemptPhase: exemptData.exemptPhase || '',
      exemptBadge: exemptData.exemptBadge || '',
      exemptRoomNames: exemptData.exemptRoomNames || '',
      exemptRightPill: exemptData.exemptRightPill || '',
      exemptAccent: exemptData.exemptAccent || '',
      exemptSoft: exemptData.exemptSoft || '',
      exemptBorder: exemptData.exemptBorder || '',
      exemptText: exemptData.exemptText || '',
    });
  },

  formatCountdown: function (seconds) {
    if (seconds == null || seconds < 0) return '';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    if (m > 0) return m + '分' + (s > 0 ? s + '秒' : '');
    return s + '秒';
  },

  formatElapsed: function (seconds) {
    if (seconds == null || seconds < 0) return '';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return h + '小时' + (m > 0 ? m + '分' : '');
    return m + '分钟';
  },
```

- [ ] **Step 5: 添加七入口点击处理函数**

在上一步代码之后、Page 闭合前继续添加：

```javascript

  onStudentUpperTap: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === 'room') {
      wx.switchTab({ url: '/pages/room/index' });
    } else if (id === 'material') {
      wx.navigateTo({ url: '/package-feature/pages/studentMaterial/index' });
    } else if (id === 'cage') {
      wx.showToast({ title: '即将上线', icon: 'none' });
    }
  },

  onStudentLowerTap: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === 'records') {
      wx.showToast({ title: '即将上线', icon: 'none' });
    } else if (id === 'notices') {
      var role = wx.getStorageSync('springRole') || '';
      if (role === 'STAFF' || role === 'SENIOR' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'PLATFORM_OWNER') {
        wx.navigateTo({ url: '/package-feature/pages/staffChatHub/index' });
      } else {
        wx.navigateTo({ url: '/package-feature/pages/notifications/index' });
      }
    } else if (id === 'group') {
      wx.showToast({ title: '即将上线', icon: 'none' });
    } else if (id === 'violations') {
      wx.showToast({ title: '即将上线', icon: 'none' });
    }
  },
```

- [ ] **Step 6: 编译验证**

在微信开发者工具中编译，确保语法无错误。

- [ ] **Step 7: Commit**

```bash
git add aroapp/miniprogram/pages/index/index.js
git commit -m "feat: add student view data + presence status + 7-entrance handlers to index page"
```

---

### Task 5: pages/index/index.wxml — 新增学生布局模板

**Files:**
- Modify: `aroapp/miniprogram/pages/index/index.wxml`

- [ ] **Step 1: 在现有布局外套一层条件渲染**

将整个 `<view class="home">` 内容替换为条件分支结构。在现有 `<view class="home-body">` 中的 `<view class="service-card">` 区域改为条件渲染。

找到 `<view class="home-body">` 下的 `<view class="service-card">`（约第72-154行），用以下代码替换整个 `service-card` 块及其内容：

```xml
  <view class="home-body">
    <!-- ====== 学生视角布局 ====== -->
    <block wx:if="{{ isStudentView }}">

      <!-- 进出状态指示条 -->
      <view wx:if="{{ hasStudentPresence }}" class="presence-bar" style="background:{{ presenceCardBg }};border-color:{{ presenceBorder }};box-shadow:0 4rpx 14rpx rgba(0,0,0,0.04);">
        <view class="presence-top-row">
          <view class="presence-icon-circle" style="background:{{ presenceIconBg }};">
            <view class="presence-icon-inner" style="color:{{ presenceAccent }};">
              <text wx:if="{{ presencePhase === 'inside' }}" style="color:{{ presenceAccent }};font-size:32rpx;">▶</text>
              <text wx:elif="{{ presencePhase === 'pending_activation' }}" style="color:{{ presenceAccent }};font-size:32rpx;">⏳</text>
              <text wx:elif="{{ presencePhase === 'pending_leave' }}" style="color:{{ presenceAccent }};font-size:32rpx;">◀</text>
              <text wx:elif="{{ presencePhase === 'outside' }}" style="color:{{ presenceAccent }};font-size:32rpx;">■</text>
              <text wx:else style="color:{{ presenceAccent }};font-size:32rpx;">?</text>
            </view>
          </view>
          <view class="presence-info">
            <view class="presence-label-row">
              <view class="presence-phase-badge" style="background:{{ presenceBadgeBg }};color:{{ presenceBadgeText }};">{{ presenceLabel }}</view>
              <text wx:if="{{ presenceRoomName }}" class="presence-room-name" style="color:{{ presenceRoomNameColor }};">{{ presenceRoomName }}</text>
              <text wx:if="{{ presencePhaseOutside }}" class="presence-outside-hint">当前不在实验区域内</text>
              <text wx:if="{{ presencePhaseUnknown }}" class="presence-unknown-hint">等待系统同步</text>
            </view>
          </view>
          <view wx:if="{{ presenceShowDwell || presenceShowCountdown }}" class="presence-right-pills">
            <view wx:if="{{ presenceShowDwell }}" class="presence-pill" style="background:{{ presenceSoft }};border-color:{{ presenceBorder }};color:{{ presenceText }};">{{ presenceDwellText }}</view>
            <view wx:if="{{ presenceShowCountdown }}" class="presence-pill presence-pill--urgent" style="background:{{ presenceSoft }};border-color:{{ presenceBorder }};color:{{ presenceText }};">
              {{ presencePhase === 'pending_activation' ? '激活 ' : '签退 ' }}{{ presenceCountdownText }}
            </view>
          </view>
        </view>

        <!-- 豁免状态行 -->
        <view wx:if="{{ hasExemptRow }}" class="presence-exempt-row" style="border-top-color:{{ exemptBorder }};">
          <view class="presence-exempt-badge" style="background:{{ exemptSoft }};color:{{ exemptText }};">{{ exemptBadge }}</view>
          <text class="presence-exempt-rooms">{{ exemptRoomNames }}</text>
          <text wx:if="{{ exemptRightPill }}" class="presence-exempt-right">{{ exemptRightPill }}</text>
        </view>
      </view>

      <!-- 七入口宫格 -->
      <view class="service-card student-service-card">
        <!-- 上排三入口 -->
        <view class="service-primary-row">
          <view
            wx:for="{{ studentUpperRow }}"
            wx:key="id"
            class="service-primary-item"
            hover-class="service-primary-item--hover"
            catchtap="onStudentUpperTap"
            data-id="{{ item.id }}"
          >
            <view class="service-primary-icon-wrap">
              <view class="service-primary-icon service-primary-icon--image">
                <image class="service-primary-icon-img" src="{{ item.iconSrc }}" mode="aspectFit" show-menu-by-longpress="{{ false }}" />
                <view class="icon-hit-mask" />
              </view>
            </view>
            <text class="service-primary-title">{{ item.title }}</text>
          </view>
        </view>

        <view class="service-divider" />

        <!-- 下排四入口 -->
        <view class="quick-row">
          <view
            wx:for="{{ studentLowerRow }}"
            wx:key="id"
            class="quick-item"
            hover-class="quick-item--hover"
            catchtap="onStudentLowerTap"
            data-id="{{ item.id }}"
          >
            <view class="quick-icon-wrap">
              <view wx:if="{{ item.badge && item.badge.length }}" class="quick-badge">{{ item.badge }}</view>
              <view class="quick-icon quick-icon--image">
                <image class="quick-icon-img" src="{{ item.iconSrc }}" mode="aspectFit" show-menu-by-longpress="{{ false }}" />
                <view class="icon-hit-mask" />
              </view>
            </view>
            <text class="quick-label">{{ item.title }}</text>
          </view>
        </view>
      </view>
    </block>

    <!-- ====== 教职工视角布局（原有代码） ====== -->
    <block wx:else>
      <view class="service-card">
        <view class="service-primary-row">
          <!-- 保持原有 primarySlots / quick-row 代码不变 -->
          <view
            wx:for="{{ primarySlots }}"
            wx:key="id"
            class="service-primary-item"
            hover-class="service-primary-item--hover"
            catchtap="onPrimarySlotTap"
            data-id="{{ item.id }}"
          >
            <view class="service-primary-icon-wrap">
              <view wx:if="{{ item.badge }}" class="service-primary-badge">{{ item.badge }}</view>
              <view wx:if="{{ item.placeholder }}" class="service-primary-icon service-primary-icon--placeholder">
                <van-icon name="plus" size="36rpx" color="rgba(172, 23, 54, 0.45)" />
              </view>
              <view wx:else class="service-primary-icon {{ item.iconSrc ? 'service-primary-icon--image' : 'service-primary-icon--active' }}">
                <image
                  wx:if="{{ item.iconSrc }}"
                  class="service-primary-icon-img"
                  src="{{ item.iconSrc }}"
                  mode="aspectFit"
                  show-menu-by-longpress="{{ false }}"
                />
                <van-icon
                  wx:else
                  name="{{ item.iconName }}"
                  size="36rpx"
                  color="rgb(172, 23, 54)"
                />
              </view>
              <view class="icon-hit-mask" />
            </view>
            <text class="service-primary-title">{{ item.title }}</text>
          </view>
        </view>

        <view class="service-divider" />

        <view class="quick-row">
            <view wx:if="{{ canQuickRepairRequest }}" class="quick-item" hover-class="quick-item--hover" catchtap="goRepairRequest">
              <view class="quick-icon-wrap">
                <view wx:if="{{ badgeRepairText }}" class="quick-badge">{{ badgeRepairText }}</view>
                <view class="quick-icon quick-icon--image">
                  <image class="quick-icon-img" src="{{ iconRepair }}" mode="aspectFit" show-menu-by-longpress="{{ false }}" />
                </view>
                <view class="icon-hit-mask" />
              </view>
              <text class="quick-label">报修</text>
            </view>
            <view wx:if="{{ canQuickPurchaseRequest }}" class="quick-item" hover-class="quick-item--hover" catchtap="goPurchaseRequest">
              <view class="quick-icon-wrap">
                <view wx:if="{{ badgePurchaseText }}" class="quick-badge">{{ badgePurchaseText }}</view>
                <view class="quick-icon quick-icon--image">
                  <image class="quick-icon-img" src="{{ iconPurchase }}" mode="aspectFit" show-menu-by-longpress="{{ false }}" />
                </view>
                <view class="icon-hit-mask" />
              </view>
              <text class="quick-label">采购</text>
            </view>
            <view wx:if="{{ canQuickNotifications }}" class="quick-item" hover-class="quick-item--hover" catchtap="goNotifications">
              <view class="quick-icon-wrap">
                <view wx:if="{{ badgeNotifyText }}" class="quick-badge">{{ badgeNotifyText }}</view>
                <view class="quick-icon quick-icon--image">
                  <image class="quick-icon-img" src="{{ iconNotify }}" mode="aspectFit" show-menu-by-longpress="{{ false }}" />
                </view>
                <view class="icon-hit-mask" />
              </view>
              <text class="quick-label">信息</text>
            </view>
            <view wx:if="{{ canQuickSupplies }}" class="quick-item" hover-class="quick-item--hover" catchtap="goSupplies">
              <view class="quick-icon-wrap">
                <view wx:if="{{ badgeSuppliesText }}" class="quick-badge">{{ badgeSuppliesText }}</view>
                <view class="quick-icon quick-icon--image">
                  <image class="quick-icon-img" src="{{ iconSupplies }}" mode="aspectFit" show-menu-by-longpress="{{ false }}" />
                </view>
                <view class="icon-hit-mask" />
              </view>
              <text class="quick-label">物资</text>
            </view>
        </view>
      </view>
    </block>
```

- [ ] **Step 2: 编译验证布局显示**

在微信开发者工具中分别以学生和教职工身份验证首页布局。

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/pages/index/index.wxml
git commit -m "feat: add student view layout (presence bar + 7-entrance grid) to index wxml"
```

---

### Task 6: pages/index/index.wxss — 新增学生布局样式

**Files:**
- Modify: `aroapp/miniprogram/pages/index/index.wxss`

- [ ] **Step 1: 在 wxss 文件末尾追加学生布局样式**

在 `aroapp/miniprogram/pages/index/index.wxss` 文件末尾追加：

```css
/* ====== 学生视角：进出状态指示条 ====== */
.presence-bar {
  margin: 8rpx 24rpx 0;
  border-radius: 24rpx;
  padding: 20rpx 24rpx;
  position: relative;
  z-index: 1;
  transition: background 0.3s ease;
}

.presence-top-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}

.presence-icon-circle {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.presence-icon-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.presence-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.presence-label-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
  flex-wrap: wrap;
}

.presence-phase-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  font-size: 24rpx;
  font-weight: 700;
  flex-shrink: 0;
}

.presence-room-name {
  font-size: 40rpx;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  line-height: 1.2;
}

.presence-outside-hint,
.presence-unknown-hint {
  font-size: 22rpx;
  color: #94a3b8;
  flex-shrink: 0;
}

.presence-right-pills {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
  margin-left: auto;
}

.presence-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  font-size: 22rpx;
  font-weight: 700;
  border: 1rpx solid;
  white-space: nowrap;
}

.presence-pill--urgent {
  box-shadow: 0 0 0 2rpx currentColor;
  opacity: 0.9;
}

/* 豁免状态行 */
.presence-exempt-row {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 2rpx dashed;
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-wrap: wrap;
}

.presence-exempt-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  font-size: 22rpx;
  font-weight: 700;
  flex-shrink: 0;
}

.presence-exempt-rooms {
  font-size: 24rpx;
  font-weight: 600;
  color: #323233;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.presence-exempt-right {
  display: inline-flex;
  align-items: center;
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  font-size: 20rpx;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto;
}

/* ====== 学生视角：服务卡微调 ====== */
.student-service-card {
  margin-top: 16rpx;
}
```

- [ ] **Step 2: 编译验证样式效果**

在开发者工具中确认状态指示条和入口宫格样式正确。

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/pages/index/index.wxss
git commit -m "feat: add student presence bar + entrance grid styles to index wxss"
```

---

### Task 7: pages/mine/index.js — 新增账号密码登录与注册逻辑

**Files:**
- Modify: `aroapp/miniprogram/pages/mine/index.js`

- [ ] **Step 1: 在 data 中添加登录/注册表单字段**

在 `Page({ data: { ... } })` 的 `data` 对象末尾添加：

```javascript
    showLoginForm: false,
    loginUsername: '',
    loginPassword: '',
    loginSubmitting: false,

    showRegisterForm: false,
    registerType: 'student',
    registerStudentId: '',
    registerStudentName: '',
    registerStudentPassword: '',
    registerStudentPassword2: '',
    registerStaffUser: '',
    registerStaffPassword: '',
    registerStaffPassword2: '',
    registerStaffInvite: '',
    registerSubmitting: false,
```

- [ ] **Step 2: 修改 refreshSpringUiState 判断是否显示登录表单**

在 `refreshSpringUiState()` 方法中，在 `springBound` 判断之后追加：

```javascript
    var showLogin = !springBound && !springPending;
    this.setData({
      // ... 现有 setData 保持不变 ...
      showLoginForm: showLogin,
    });
```

具体做法：在现有 `this.setData({` 块中，在现有字段后追加 `showLoginForm: !springBound && !springPending,`。

- [ ] **Step 3: 添加登录/注册事件处理函数**

在 `Page({ ... })` 的 methods 末尾（`Page` 闭合前）追加以下全部方法：

```javascript

  /* ---------- 账号密码登录 ---------- */
  onGoLogin: function () {
    this.setData({ showLoginForm: true });
  },

  onCloseLogin: function () {
    this.setData({ showLoginForm: false });
  },

  onLoginUsernameInput: function (e) {
    this.setData({ loginUsername: e.detail.value });
  },

  onLoginPasswordInput: function (e) {
    this.setData({ loginPassword: e.detail.value });
  },

  submitLogin: function () {
    var self = this;
    var u = (this.data.loginUsername || '').trim();
    var p = this.data.loginPassword || '';
    if (!u || !p) {
      wx.showToast({ title: '请填写账号和密码', icon: 'none' });
      return;
    }
    if (this.data.loginSubmitting) return;
    this.setData({ loginSubmitting: true });
    wx.showLoading({ title: '登录中…', mask: true });
    springAuth.springRequest({
      url: '/api/auth/login/web',
      method: 'POST',
      data: { username: u, password: p },
    }).then(function (res) {
      wx.hideLoading();
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.statusCode === 200 && body && body.success) {
        var d = body.data;
        wx.setStorageSync(springAuth.KEYS.TOKEN, d.token || '');
        wx.setStorageSync(springAuth.KEYS.ROLE, d.role || '');
        wx.setStorageSync(springAuth.KEYS.ROLE_LEVEL, String(d.roleLevel != null ? d.roleLevel : ''));
        wx.setStorageSync(springAuth.KEYS.USER_INFO, JSON.stringify(d.userInfo || {}));
        wx.removeStorageSync(springAuth.KEYS.PENDING_OPENID);
        self.setData({
          showLoginForm: false,
          loginUsername: '',
          loginPassword: '',
          loginSubmitting: false,
        });
        self.refreshSpringUiState();
        var tabBar = typeof self.getTabBar === 'function' && self.getTabBar();
        if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
        wx.showToast({ title: '登录成功', icon: 'success' });
      } else {
        self.setData({ loginSubmitting: false });
        var msg = (body && body.message) || '登录失败';
        wx.showToast({ title: msg.length > 18 ? msg.slice(0, 18) + '…' : msg, icon: 'none', duration: 3000 });
      }
    }).catch(function () {
      wx.hideLoading();
      self.setData({ loginSubmitting: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  /* ---------- 注册 ---------- */
  onGoRegister: function () {
    this.setData({
      showLoginForm: false,
      showRegisterForm: true,
      registerType: 'student',
    });
  },

  onCloseRegister: function () {
    this.setData({ showRegisterForm: false });
  },

  onBackToLogin: function () {
    this.setData({
      showRegisterForm: false,
      showLoginForm: true,
    });
  },

  onRegisterTypeTap: function (e) {
    this.setData({ registerType: e.currentTarget.dataset.type || 'student' });
  },

  onRegStudentIdInput: function (e) { this.setData({ registerStudentId: e.detail.value }); },
  onRegStudentNameInput: function (e) { this.setData({ registerStudentName: e.detail.value }); },
  onRegStudentPwdInput: function (e) { this.setData({ registerStudentPassword: e.detail.value }); },
  onRegStudentPwd2Input: function (e) { this.setData({ registerStudentPassword2: e.detail.value }); },
  onRegStaffUserInput: function (e) { this.setData({ registerStaffUser: e.detail.value }); },
  onRegStaffPwdInput: function (e) { this.setData({ registerStaffPassword: e.detail.value }); },
  onRegStaffPwd2Input: function (e) { this.setData({ registerStaffPassword2: e.detail.value }); },
  onRegStaffInviteInput: function (e) { this.setData({ registerStaffInvite: e.detail.value }); },

  submitRegister: function () {
    var self = this;
    if (this.data.registerSubmitting) return;
    var isStudent = this.data.registerType === 'student';

    if (isStudent) {
      var sid = (this.data.registerStudentId || '').trim();
      var sname = (this.data.registerStudentName || '').trim();
      var spwd = this.data.registerStudentPassword || '';
      var spwd2 = this.data.registerStudentPassword2 || '';
      if (!sid || !sname || !spwd) {
        wx.showToast({ title: '请填写完整信息', icon: 'none' });
        return;
      }
      if (sid.length !== 19) {
        wx.showToast({ title: '学号须为19位', icon: 'none' });
        return;
      }
      if (spwd.length < 6) {
        wx.showToast({ title: '密码至少6位', icon: 'none' });
        return;
      }
      if (spwd !== spwd2) {
        wx.showToast({ title: '两次密码不一致', icon: 'none' });
        return;
      }
    } else {
      var suser = (this.data.registerStaffUser || '').trim();
      var spwd = this.data.registerStaffPassword || '';
      var spwd2 = this.data.registerStaffPassword2 || '';
      var sinv = (this.data.registerStaffInvite || '').trim();
      if (!suser || !spwd || !sinv) {
        wx.showToast({ title: '请填写完整信息', icon: 'none' });
        return;
      }
      if (spwd.length < 6) {
        wx.showToast({ title: '密码至少6位', icon: 'none' });
        return;
      }
      if (spwd !== spwd2) {
        wx.showToast({ title: '两次密码不一致', icon: 'none' });
        return;
      }
    }

    this.setData({ registerSubmitting: true });
    wx.showLoading({ title: '注册中…', mask: true });

    var url = isStudent ? '/api/auth/register/student' : '/api/auth/register/staff';
    var body = isStudent ? {
      userId: sid,
      name: sname,
      password: spwd,
    } : {
      username: suser,
      password: spwd,
      inviteCode: sinv,
    };

    springAuth.springRequest({
      url: url,
      method: 'POST',
      data: body,
    }).then(function (res) {
      wx.hideLoading();
      var respBody = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.statusCode === 200 && respBody && respBody.success) {
        self.setData({
          showRegisterForm: false,
          showLoginForm: true,
          registerSubmitting: false,
          registerStudentId: '',
          registerStudentName: '',
          registerStudentPassword: '',
          registerStudentPassword2: '',
          registerStaffUser: '',
          registerStaffPassword: '',
          registerStaffPassword2: '',
          registerStaffInvite: '',
        });
        wx.showToast({ title: '注册成功，请登录', icon: 'success' });
      } else {
        self.setData({ registerSubmitting: false });
        var msg = (respBody && respBody.message) || '注册失败';
        wx.showToast({ title: msg.length > 18 ? msg.slice(0, 18) + '…' : msg, icon: 'none', duration: 3000 });
      }
    }).catch(function () {
      wx.hideLoading();
      self.setData({ registerSubmitting: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },
```

- [ ] **Step 4: 编译验证**

在开发者工具中编译，确保语法无错误。

- [ ] **Step 5: Commit**

```bash
git add aroapp/miniprogram/pages/mine/index.js
git commit -m "feat: add login/register form logic to mine page"
```

---

### Task 8: pages/mine/index.wxml — 新增登录/注册表单模板

**Files:**
- Modify: `aroapp/miniprogram/pages/mine/index.wxml`

- [ ] **Step 1: 在"未就绪"状态下显示登录入口**

找到 `<view class="mine-cell-footer">` 中的绑定/注销按钮区域（约第 218-236 行）。修改未绑定状态的显示，添加登录入口。

将现有 `<view class="mine-cell-footer">` 块替换为：

```xml
    <view class="mine-cell-footer">
      <block wx:if="{{ !springBound }}">
        <van-button
          size="normal"
          type="default"
          round
          custom-class="mine-foot-btn mine-foot-btn--login"
          bindtap="onGoLogin"
        >账号登录</van-button>
      </block>
      <block wx:else>
        <van-button
          size="normal"
          type="default"
          round
          custom-class="mine-foot-btn mine-foot-btn--logout"
          bindtap="clearSpringBind"
        >注销</van-button>
      </block>
    </view>
```

- [ ] **Step 2: 在文件末尾（`</view>` 闭合后、canvas 之前）添加登录/注册弹窗**

在 `</view>` (mine-page 闭合) 之后、`<canvas>` 之前插入：

```xml

<!-- ====== 账号密码登录弹窗 ====== -->
<van-popup
  show="{{ showLoginForm }}"
  position="center"
  round
  closeable
  custom-class="mine-bind-popup"
  bind:close="onCloseLogin"
>
  <view class="bind-panel bind-panel--center">
    <view class="bind-title">账号登录</view>
    <text class="bind-tip">使用校内账号密码登录，与 Web 端完全一致。</text>
    <input
      class="bind-input bind-input-block"
      value="{{ loginUsername }}"
      bindinput="onLoginUsernameInput"
      placeholder="账号 / 学号 / 工号"
      maxlength="64"
    />
    <input
      class="bind-input bind-input-block"
      value="{{ loginPassword }}"
      bindinput="onLoginPasswordInput"
      placeholder="密码"
      password="true"
      maxlength="64"
    />
    <van-button block type="primary" round custom-class="bind-submit" bindtap="submitLogin" loading="{{ loginSubmitting }}" disabled="{{ loginSubmitting }}">登录</van-button>
    <view class="login-register-link" bindtap="onGoRegister">
      <text class="login-register-text">没有账号？去注册 →</text>
    </view>
  </view>
</van-popup>

<!-- ====== 注册弹窗 ====== -->
<van-popup
  show="{{ showRegisterForm }}"
  position="center"
  round
  closeable
  custom-class="mine-bind-popup"
  bind:close="onCloseRegister"
>
  <view class="bind-panel bind-panel--center">
    <view class="bind-title">注册账号</view>

    <!-- 类型切换 -->
    <view class="register-type-row">
      <view
        class="register-type-tab {{ registerType === 'student' ? 'register-type-tab--on' : '' }}"
        data-type="student"
        bindtap="onRegisterTypeTap"
      >学生</view>
      <view
        class="register-type-tab {{ registerType === 'staff' ? 'register-type-tab--on' : '' }}"
        data-type="staff"
        bindtap="onRegisterTypeTap"
      >教职工</view>
    </view>

    <!-- 学生注册表单 -->
    <block wx:if="{{ registerType === 'student' }}">
      <input class="bind-input bind-input-block" value="{{ registerStudentId }}" bindinput="onRegStudentIdInput" placeholder="19位学号" type="number" maxlength="19" />
      <input class="bind-input bind-input-block" value="{{ registerStudentName }}" bindinput="onRegStudentNameInput" placeholder="姓名" maxlength="32" />
      <input class="bind-input bind-input-block" value="{{ registerStudentPassword }}" bindinput="onRegStudentPwdInput" placeholder="密码（至少6位）" password="true" maxlength="64" />
      <input class="bind-input bind-input-block" value="{{ registerStudentPassword2 }}" bindinput="onRegStudentPwd2Input" placeholder="确认密码" password="true" maxlength="64" />
    </block>

    <!-- 教职工注册表单 -->
    <block wx:else>
      <input class="bind-input bind-input-block" value="{{ registerStaffInvite }}" bindinput="onRegStaffInviteInput" placeholder="邀请码" maxlength="64" />
      <input class="bind-input bind-input-block" value="{{ registerStaffUser }}" bindinput="onRegStaffUserInput" placeholder="账号 / 工号" maxlength="64" />
      <input class="bind-input bind-input-block" value="{{ registerStaffPassword }}" bindinput="onRegStaffPwdInput" placeholder="密码（至少6位）" password="true" maxlength="64" />
      <input class="bind-input bind-input-block" value="{{ registerStaffPassword2 }}" bindinput="onRegStaffPwd2Input" placeholder="确认密码" password="true" maxlength="64" />
    </block>

    <van-button block type="primary" round custom-class="bind-submit" bindtap="submitRegister" loading="{{ registerSubmitting }}" disabled="{{ registerSubmitting }}">注册</van-button>
    <view class="login-register-link" bindtap="onBackToLogin">
      <text class="login-register-text">已有账号？去登录 →</text>
    </view>
  </view>
</van-popup>
```

- [ ] **Step 3: 编译验证**

在开发者工具中分别测试未登录态的登录/注册弹窗。

- [ ] **Step 4: Commit**

```bash
git add aroapp/miniprogram/pages/mine/index.wxml
git commit -m "feat: add login/register popup forms to mine wxml"
```

---

### Task 9: pages/mine/index.wxss — 新增登录/注册样式

**Files:**
- Modify: `aroapp/miniprogram/pages/mine/index.wxss`

- [ ] **Step 1: 在 wxss 文件末尾追加**

```css
/* ====== 登录/注册表单 ====== */
.login-register-link {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 24rpx;
  padding: 12rpx 0;
}

.login-register-text {
  font-size: 26rpx;
  color: #6366f1;
  font-weight: 500;
}

.register-type-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 28rpx;
}

.register-type-tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 16rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  border: 2rpx solid transparent;
  transition: all 0.08s ease;
}

.register-type-tab--on {
  color: rgb(172, 23, 54);
  background: rgba(172, 23, 54, 0.06);
  border-color: rgba(172, 23, 54, 0.35);
}

/* 登录按钮样式 */
.mine-foot-btn--login {
  background: linear-gradient(135deg, rgba(172, 23, 54, 0.92), rgba(120, 18, 38, 0.94)) !important;
  color: #fff !important;
  box-shadow: 0 10rpx 28rpx rgba(172, 23, 54, 0.28) !important;
}
```

- [ ] **Step 2: 编译验证样式**

在开发者工具中确认登录按钮和注册表单样式。

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/pages/mine/index.wxss
git commit -m "feat: add login/register form styles to mine wxss"
```

---

### Task 10: 新增图标资源文件

**Files:**
- Create: `aroapp/miniprogram/pages/assets/images/icon-cage.png`
- Create: `aroapp/miniprogram/pages/assets/images/icon-records.png`
- Create: `aroapp/miniprogram/pages/assets/images/icon-group.png`
- Create: `aroapp/miniprogram/pages/assets/images/icon-violation.png`

需要创建 4 个图标 PNG 文件，尺寸 112×112rpx (~56×56px @2x)，风格与现有 `icon-room.png`、`icon-supplies.png` 一致。

- [ ] **Step 1: 生成 icon-cage.png（笼架图标）**

使用 Grid/LayoutGrid 风格图标，与 H5 的 `LayoutGrid` (lucide-react) 对应。暖桃色 #ac1736 着色，透明背景，56×56px PNG。

- [ ] **Step 2: 生成 icon-records.png（出入记录图标）**

使用 ClipboardList 风格图标，与 H5 的 `ClipboardList` (lucide-react) 对应。暖桃色 #ac1736 着色，透明背景，56×56px PNG。

- [ ] **Step 3: 生成 icon-group.png（课题组图标）**

使用 Users 风格图标，与 H5 的 `Users` (lucide-react) 对应。暖桃色 #ac1736 着色，透明背景，56×56px PNG。

- [ ] **Step 4: 生成 icon-violation.png（违规记录图标）**

使用 AlertTriangle 风格图标，与 H5 的 `AlertTriangle` (lucide-react) 对应。暖桃色 #ac1736 着色，透明背景，56×56px PNG。

- [ ] **Step 5: 验证图标加载**

在开发者工具中确认首页七入口图标全部正常显示。

- [ ] **Step 6: Commit**

```bash
git add aroapp/miniprogram/pages/assets/images/icon-cage.png \
        aroapp/miniprogram/pages/assets/images/icon-records.png \
        aroapp/miniprogram/pages/assets/images/icon-group.png \
        aroapp/miniprogram/pages/assets/images/icon-violation.png
git commit -m "feat: add 4 student entrance icons (cage/records/group/violation)"
```

---

### Task 11: 后端 — presence 端点确认与兜底

**Files:**
- 检查: `src/main/java/com/example/demo/modules/student/controller/StudentMobileController.java`（如有）

- [ ] **Step 1: 确认 `/api/student/mobile/presence` 端点是否存在**

```bash
grep -rn "presence" src/main/java/com/example/demo/modules/student/
```

若存在 → 无需操作。
若不存在 → 使用 H5 已有的 presence 数据源（`/api/public/mobile-center/{token}/...` 对应的逻辑）作为 JWT 版本提供。如确认当前不需要后端改动，跳至 Task 12。

- [ ] **Step 2: 若需新端点，在 StudentMobileController 中添加转发方法**

```java
@GetMapping("/presence")
public Result<MobilePresenceSnapshot> getPresence() {
    User user = authContextService.getCurrentUser();
    return Result.success(studentDashboardService.getPresenceSnapshot(user.getId()));
}
```

- [ ] **Step 3: Commit（如有后端改动）**

```bash
git add src/main/java/com/example/demo/modules/student/controller/StudentMobileController.java
git commit -m "feat: add JWT /api/student/mobile/presence endpoint"
```

---

### Task 12: 端到端验证

- [ ] **Step 1: 学生账号登录流程**

1. 打开小程序 → 首页显示为未登录态（仅 Hero + 登录条）
2. 进入「我的」→ 点击「账号登录」→ 输入学生账号密码 → 登录成功
3. 返回首页 → 看到学生布局（状态指示条 + 七入口）
4. 底部 Tab 显示：首页/房间/申领/笼架/我的
5. 点击「申领」→ 进入 studentMaterial 页面
6. 点击「笼架」→ toast "即将上线"

- [ ] **Step 2: 教职工账号流程（不变）**

1. 退出登录 → 用教职工账号登录
2. 首页保持现有布局（3+4 宫格：房间/学生审核/预留 + 报修/采购/信息/物资）
3. 底部 Tab 保持现有：首页/房间/概览/温湿度/我的

- [ ] **Step 3: 未登录注销后恢复**

1. 退出登录 → 回到「我的」→ 显示「账号登录」按钮而非「绑定」
2. 首页显示原始布局（无状态条，无七入口，但 Hero + 新闻可见）

- [ ] **Step 4: 修复问题并 Commit**

```bash
git add -A
git commit -m "fix: final adjustments from end-to-end verification"
```
