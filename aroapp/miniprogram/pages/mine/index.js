/*
 * @Date: 2026-04-03 12:17:17
 * @LastEditTime: 2026-04-18
 * @FilePath: \aroapp\miniprogram\pages\mine\index.js
 *
 * OpenID：若后端仍为 jsCode→MD5 的 Mock 换 openId，清除本机缓存后再次绑定会看到
 * springPendingOpenId 变化；接微信 code2session 后与调试现象不同，见 springAuth.js 头注释。
 */

const springAuth = require('../../utils/springAuth.js');
const { hasMinRole, isStudentAccount } = require('../../utils/roleAccess.js');
const pagePermission = require('../../utils/pagePermission.js');
const twinScan = require('../../utils/twinScanAnalyze.js');
const { shouldRefreshOnShow } = require('../../utils/pageShowRefresh.js');
const {
  peekPendingBadges,
  refreshPendingBadges: pullPendingBadgeSnapshot,
  clearPendingBadgeCache,
} = require('../../utils/badgeSnapshotStore.js');
const {
  menuBadgePreferProcessThenApplicant,
  homeMessagesQuickBadgeText,
  studentReviewMenuBadgeText,
} = require('../../utils/pendingBadgeCounts.js');
const studentAlerts = require('../../utils/studentAlertHelpers.js');

function readSpringUserInfoObject() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

function displayNameFromSpringSession() {
  const u = readSpringUserInfoObject();
  const s = u && u.displayName != null ? String(u.displayName).trim() : '';
  return s || '';
}

/** Spring 角色码 → 中文（与后台角色枚举对应） */
function roleCodeToZh(role) {
  const raw = String(role || '').trim();
  if (!raw || raw === '—') return '';
  const up = raw.toUpperCase().replace(/\s+/g, '_');
  const map = {
    STUDENT: '学生',
    STAFF: '教职工',
    SENIOR: '高级职工',
    ADMIN: '管理员',
    SUPER_ADMIN: '超级管理员',
    PLATFORM_OWNER: '平台所有者',
  };
  if (map[up]) return map[up];
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  return raw;
}

function canonKey(k) {
  return String(k || '')
    .replace(/_/g, '')
    .toLowerCase();
}

/** 档案展示中隐藏的字段（canonical key，忽略下划线） */
const DROP_CANON = new Set([
  'collegeid',
  'departmentid',
  'head',
  'healthurl',
  'invalidoperateid',
  'invalidoperateld',
  'ismessage',
  'organizationid',
  'projectgroup',
  'projectgroups',
  'projectgroupname',
  'signurl',
  'signuri',
  'userclassid',
]);

const JOIN_FIELD_CANON = new Set(['joinroom', 'joinroomname', 'joinroomnames']);

/**
 * 人员 state：与 twin 前端约定一致（参见 twinApi UserStatusResponse 注释：2 正常、3 已禁用）。
 * 流水表中进出为 accessType，与此处账号 state 不同。
 */
function mapPersonnelStateLabel(v) {
  const x = Number(v);
  if (x === 3) return '已禁用';
  if (x === 2) return '正常';
  if (x === 1) return '有效';
  if (Number.isFinite(x)) return `状态(${x})`;
  return v == null ? '' : String(v);
}

function formatGenderSymbol(v) {
  const x = Number(v);
  if (x === 1) return '♂';
  if (x === 2) return '♀';
  return String(v);
}

function formatIsSchool(v) {
  return Number(v) === 1 ? '在校' : '非在校';
}

function labelForCanon(canon) {
  const map = {
    name: '姓名',
    username: '用户名',
    departmentname: '部门',
    mobilephone: '手机',
    jobnumber: '工号/学号',
    idnumber: '证件号',
    gender: '性别',
    usertypenames: '人员类型',
    isschool: '是否在校',
    state: '状态',
    stateauto: '自动状态',
    createtime: '注册时间',
    email: '邮箱',
    allowedrooms: '允许房间',
    userdisciplinaryrecords: '惩戒记录',
    totalexp: '累计经验',
    userid: '用户ID',
  };
  return map[canon] || canon;
}

function stringifyValue(v, maxLen) {
  const m = maxLen || 4000;
  const s = JSON.stringify(v);
  return s.length > m ? `${s.slice(0, m)}…` : s;
}

/**
 * @returns {{ summaryName, summaryPhone, summaryDept, summaryTypes, headRows, bodyRows, hasDisplay }}
 */
function buildProfileDisplayParts(data, springUserId) {
  const empty = {
    summaryName: '',
    summaryPhone: '',
    summaryDept: '',
    summaryTypes: '',
    profileHeadRaw: '',
    headRows: [],
    bodyRows: [],
    hasDisplay: false,
  };
  if (!data || typeof data !== 'object') return empty;

  const name = pickFirstStr(data, ['name', 'userName', 'user_name']);
  const profileHeadRaw = pickFirstStr(data, ['head', 'Head', 'avatar', 'avatarUrl', 'avatar_url']);
  const phone = pickFirstStr(data, ['mobile_phone', 'mobilePhone']);
  const dept = pickFirstStr(data, ['department_name', 'departmentName']);
  const types = pickFirstStr(data, ['user_type_names', 'userTypeNames']);

  const headRows = [];
  if (phone) headRows.push({ label: '手机', value: phone });

  const joinVal = pickFirstStr(data, [
    'join_room_name',
    'joinRoomName',
    'join_room',
    'joinRoom',
    'joinroom',
  ]);

  const rows = [];
  const keyList = Object.keys(data);
  for (let i = 0; i < keyList.length; i += 1) {
    const originalKey = keyList[i];
    const canon = canonKey(originalKey);
    const v = data[originalKey];
    if (v == null || v === '') continue;
    if (DROP_CANON.has(canon)) continue;
    if (JOIN_FIELD_CANON.has(canon)) continue;
    if (
      canon === 'name' ||
      canon === 'username' ||
      canon === 'mobilephone' ||
      canon === 'realname' ||
      canon === 'nickname' ||
      canon === 'chinesename'
    ) {
      continue;
    }
    if (canon === 'id' && String(v).trim() === String(springUserId || '').trim()) continue;

    if (originalKey === 'userDisciplinaryRecords' || canon === 'userdisciplinaryrecords') {
      const text = formatDisciplinary(v);
      if (text) rows.push({ canon: 'userdisciplinaryrecords', label: '惩戒记录', value: text });
      continue;
    }

    let label;
    if (canon === 'createtime') label = '注册时间';
    else if (canon === 'jobnumber') label = '工号/学号';
    else if (canon === 'stateauto') label = '自动状态';
    else if (canon === 'state') label = '状态';
    else if (canon === 'isschool') label = '是否在校';
    else if (canon === 'gender') label = '性别';
    else label = labelForCanon(canon);

    let valueOut;
    if (canon === 'gender') valueOut = formatGenderSymbol(v);
    else if (canon === 'isschool') valueOut = formatIsSchool(v);
    else if (canon === 'state' || canon === 'stateauto') valueOut = mapPersonnelStateLabel(v);
    else if (Array.isArray(v)) valueOut = stringifyValue(v);
    else if (typeof v === 'object') valueOut = stringifyValue(v);
    else valueOut = String(v);

    rows.push({ canon, label, value: valueOut });
  }

  if (joinVal) {
    rows.push({ canon: 'joinroommerged', label: '房间权限', value: joinVal });
  }

  const priority = [
    'jobnumber',
    'departmentname',
    'usertypenames',
    'gender',
    'state',
    'stateauto',
    'isschool',
    'joinroommerged',
    'createtime',
    'email',
    'idnumber',
    'totalexp',
    'allowedrooms',
    'userdisciplinaryrecords',
  ];

  rows.sort((a, b) => {
    const ia = priority.indexOf(a.canon);
    const ib = priority.indexOf(b.canon);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return String(a.label).localeCompare(String(b.label), 'zh');
  });

  const bodyRows = rows.map((r) => ({ label: r.label, value: r.value }));
  const hasDisplay = !!(headRows.length || bodyRows.length || dept || types);

  return {
    summaryName: name,
    summaryPhone: phone,
    summaryDept: dept,
    summaryTypes: types,
    profileHeadRaw,
    headRows,
    bodyRows,
    hasDisplay,
  };
}

function pickAvatarLetter(name, roleLabel) {
  const n = name && String(name).trim();
  if (n) return n.slice(0, 1);
  const r = roleLabel && String(roleLabel).trim() && roleLabel !== '—';
  if (r) return String(roleLabel).trim().slice(0, 1);
  return '我';
}

function pickFirstStr(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (let i = 0; i < keys.length; i += 1) {
    const v = obj[keys[i]];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function formatDisciplinary(records) {
  if (!Array.isArray(records) || !records.length) return '';
  return records
    .slice(0, 30)
    .map((r, i) => {
      if (!r || typeof r !== 'object') return `${i + 1}.（无内容）`;
      const t = r.createTime || r.create_time || '';
      const op = r.operateName || r.operate_name || '';
      const rec = r.record || '';
      const line = [t, op].filter(Boolean).join(' ');
      return `${i + 1}. ${line}${rec ? `\n${rec}` : ''}`.trim();
    })
    .join('\n\n');
}

function parseSpringBody(res) {
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = null;
    }
  }
  return body && typeof body === 'object' ? body : null;
}

Page({
  data: {
    springRoleLabelZh: '',
    bindTypeActions: [{ name: 'ARO绑定' }, { name: '账号密码绑定' }],
    showBindTypeSheet: false,
    showStudentBind: false,
    showStaffBind: false,
    bindStudentId: '',
    bindStaffUser: '',
    bindStaffPassword: '',
    springBound: false,
    springPending: false,
    springRoleLabel: '',
    springRoleLevel: '',
    isStudentView: false,
    canManagePersonnel: false,
    canStaffOps: false,
    canSeniorOps: false,
    canGoNotifications: true,
    canGoRepairRequest: false,
    canGoPurchaseRequest: false,
    canGoFileTemplates: false,
    canGoAssetRecord: false,
    canGoFacilityMaintenance: false,
    canGoAssetTransferRecord: false,
    canGoAdminPersonnel: false,
    canGoDahuaIssue: false,
    canGoDoorControl: false,
    canGoSuppliesAudit: false,
    canGoStudentReview: false,
    badgeStudentReviewText: '',
    canGoAiPortrait: false,
    springUserId: '',
    archiveLoading: false,
    archiveEmpty: false,
    profileName: '',
    profileDept: '',
    profilePhone: '',
    profileTypes: '',
    profileDetailRows: [],
    profileDetailHeadRows: [],
    showProfileDetail: false,
    profileIdQrImageSrc: '',
    headerDisplayName: '',
    profileAvatarUrl: '',
    profileAvatarFailed: false,
    profileAvatarLetter: '我',
    badgeNotifyText: '',
    badgeRepairText: '',
    badgePurchaseText: '',
    canEditDisplayName: false,
    showNicknameEditor: false,
    nicknameDraft: '',

    showLoginForm: false,
    loginUsername: '',
    loginPassword: '',
    loginSubmitting: false,

    showRegisterForm: false,
    registerType: 'student',
    regStep: 'qr',
    regQrScanning: false,
    regQrVerified: false,
    regVerifiedData: null,
    regUsername: '',
    regPassword: '',
    regPassword2: '',
    registerStaffUser: '',
    registerStaffPassword: '',
    registerStaffPassword2: '',
    registerStaffInvite: '',
    registerSubmitting: false,
    regError: '',

    // Email
    showEmailEditor: false,
    emailDraft: '',
    emailSaving: false,
    currentEmail: '',
    currentSendKey: '',
    showSendKeyEditor: false,
    sendKeyDraft: '',
    sendKeySaving: false,

    // Password Change
    showPwdChange: false,
    pwdOld: '',
    pwdNew: '',
    pwdConfirm: '',
    pwdSubmitting: false,

    // Forgot Password
    showForgotPwd: false,
    forgotStep: 'method',
    forgotUserId: '',
    forgotPhone: '',
    forgotQrUploading: false,
    forgotQrResult: null,
    forgotEmail: '',
    forgotEmailCode: '',
    forgotEmailCooldown: 0,
    forgotEmailSending: false,
    forgotResetToken: '',
    forgotNewPwd: '',
    forgotNewPwd2: '',
    forgotSubmitting: false,
    forgotError: '',

    // Email Bind (upgraded)
    emailCode: '',
    emailCodeSending: false,
    emailCodeCooldown: 0,
  },

  onLoad() {},

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') {
      tabBar.refreshTabs();
    }
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    const pending = wx.getStorageSync(springAuth.KEYS.PENDING_OPENID) || '';
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const level = wx.getStorageSync(springAuth.KEYS.ROLE_LEVEL);
    const userId = token ? twinScan.readSpringUserId() : '';
    const sceneKey = [token, pending, role, level == null ? '' : String(level), userId].join('|');

    // 无论是否跳过完整刷新，始终同步 storage → UI 的轻量状态（无 API 调用）
    // 解决 app.onLaunch 中 runWechatSilentLoginOnLaunch 异步完成后 UI 不更新的时序竞态
    this.syncSpringAuthLightweight();

    if (!shouldRefreshOnShow(this, { sceneKey, ttlMs: 30000 })) {
      void this.refreshPendingBadges();
      if (token) { this.fetchCurrentEmail(); this.fetchCurrentSendKey(); }
      return;
    }
    pagePermission.refreshMiniPermissions().finally(() => this.refreshSpringUiState());
  },

  /**
   * 轻量同步 Spring 认证状态（仅读 storage + setData，不走任何 API）。
   * 供 onShow 每次调用，确保静默登录在后台完成后 UI 及时更新。
   */
  syncSpringAuthLightweight() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    const pending = wx.getStorageSync(springAuth.KEYS.PENDING_OPENID);
    const springBound = !!token;
    const springPending = !!pending && !token;
    const showLoginForm = !springBound && !springPending;

    // 仅当关键状态有变化时才 setData，避免无意义渲染
    if (
      this.data.springBound !== springBound ||
      this.data.springPending !== springPending ||
      this.data.showLoginForm !== showLoginForm
    ) {
      const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
      const roleLabel = role || '—';
      const authDisplay = springBound ? displayNameFromSpringSession() : '';
      const headerDisplayName = springBound
        ? authDisplay || (roleLabel !== '—' ? roleLabel : '校内用户')
        : '访客';
      this.setData({
        springBound,
        springPending,
        showLoginForm,
        headerDisplayName,
        springRoleLabel: roleLabel,
        springRoleLabelZh: springBound ? roleCodeToZh(role) : '',
        profileAvatarLetter: pickAvatarLetter(headerDisplayName, roleLabel),
      });
    }
  },

  applyMenuBadgeTexts(c) {
    if (!c) return;
    if (isStudentAccount()) {
      void this.refreshStudentNotifyBadge();
      this.setData({
        badgeRepairText: '',
        badgePurchaseText: '',
        badgeStudentReviewText: '',
      });
      return;
    }
    const badgeRepairText = menuBadgePreferProcessThenApplicant(
      c,
      'processRepair',
      'processRepairText',
      'repair',
      'repairText',
    );
    const badgePurchaseText = menuBadgePreferProcessThenApplicant(
      c,
      'processPurchase',
      'processPurchaseText',
      'purchase',
      'purchaseText',
    );
    this.setData({
      badgeNotifyText: homeMessagesQuickBadgeText(c),
      badgeRepairText,
      badgePurchaseText,
      badgeStudentReviewText: studentReviewMenuBadgeText(c),
    });
  },

  refreshStudentNotifyBadge: function () {
    var self = this;
    if (!isStudentAccount() || !wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      self.setData({ badgeNotifyText: '' });
      return Promise.resolve();
    }
    return studentAlerts.fetchStudentAlerts().then(function (data) {
      self.setData({ badgeNotifyText: studentAlerts.unreadBadgeText(data) });
    }).catch(function (e) {
      console.warn('[mine] student alerts badge', e);
    });
  },

  async refreshPendingBadges() {
    if (!wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      this.setData({
        badgeNotifyText: '',
        badgeRepairText: '',
        badgePurchaseText: '',
        badgeStudentReviewText: '',
      });
      return;
    }
    if (isStudentAccount()) {
      void this.refreshStudentNotifyBadge();
      return;
    }
    const cached = peekPendingBadges();
    if (cached) this.applyMenuBadgeTexts(cached);
    try {
      const c = await pullPendingBadgeSnapshot();
      this.applyMenuBadgeTexts(c);
    } catch (e) {
      console.warn('[mine] badges', e);
    }
  },

  async onRefreshSpringRole() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token) {
      wx.showToast({ title: '请先完成校内绑定', icon: 'none' });
      return;
    }
    if (this.__springRoleRefreshing) return;
    this.__springRoleRefreshing = true;
    wx.showLoading({ title: '同步角色…', mask: true });
    try {
      const r = await springAuth.refreshWechatSession();
      wx.hideLoading();
      if (!r.ok) {
        const raw = r.message || '同步失败';
        const title = raw.length > 18 ? `${raw.slice(0, 18)}…` : raw;
        wx.showToast({ title, icon: 'none', duration: 3000 });
        return;
      }
      this.refreshSpringUiState();
      const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
      if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
      wx.showToast({ title: '角色已更新', icon: 'success' });
    } finally {
      this.__springRoleRefreshing = false;
    }
  },

  refreshSpringUiState() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    const pending = wx.getStorageSync(springAuth.KEYS.PENDING_OPENID);
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const level = wx.getStorageSync(springAuth.KEYS.ROLE_LEVEL);
    const springBound = !!token;
    const springPending = !!pending && !token;
    const springUserId = springBound ? twinScan.readSpringUserId() : '';
    const roleLabel = role || '—';
    const authDisplay = springBound ? displayNameFromSpringSession() : '';
    const ui = readSpringUserInfoObject();
    const canEdit =
      springBound && ui && ui.canEditDisplayNickname === true;
    const headerDisplayName = springBound
      ? authDisplay || (roleLabel !== '—' ? roleLabel : '校内用户')
      : '访客';
    const springRoleLabelZh = springBound ? roleCodeToZh(role) : '';
    this.setData({
      springBound,
      springPending,
      showLoginForm: !springBound && !springPending,
      springRoleLabel: roleLabel,
      springRoleLevel: level != null && level !== '' ? String(level) : '',
      springRoleLabelZh,
      canEditDisplayName: canEdit,
      isStudentView: isStudentAccount(),
      canManagePersonnel: hasMinRole(role, 'SUPER_ADMIN'),
      canStaffOps: hasMinRole(role, 'STAFF'),
      canSeniorOps: hasMinRole(role, 'SENIOR'),
      canGoNotifications: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/notifications/index', role, 'STUDENT'),
      canGoRepairRequest: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/repairRequest/index', role, 'STAFF'),
      canGoPurchaseRequest: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/purchaseRequest/index', role, 'STAFF'),
      canGoFileTemplates:
        hasMinRole(role, 'STAFF') &&
        pagePermission.canAccessMiniPage('/package-feature/pages/fileTemplates/index', role, 'STAFF'),
      canGoAssetRecord: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/assetRecord/index', role, 'STAFF'),
      canGoFacilityMaintenance: pagePermission.canShowMiniEntry(
        'mine',
        '/package-feature/pages/facilityMaintenance/index',
        role,
        'STAFF',
      ),
      canGoAssetTransferRecord: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/assetTransferRecord/index', role, 'STAFF'),
      canGoAdminPersonnel: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/adminPersonnel/index', role, 'SUPER_ADMIN'),
      canGoDahuaIssue: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/dahuaIssue/index', role, 'ADMIN'),
      canGoDoorControl: pagePermission.canShowMiniEntry('mine', '/package-feature/pages/doorControl/index', role, 'SUPER_ADMIN'),
      canGoSuppliesAudit:
        hasMinRole(role, 'STAFF') &&
        pagePermission.canShowMiniEntry('mine', '/package-feature/pages/suppliesAudit/index', role, 'STAFF'),
      canGoStudentReview:
        hasMinRole(role, 'STAFF') &&
        pagePermission.canShowMiniEntry('mine', '/package-feature/pages/studentReviewHub/index', role, 'STAFF'),
      canGoAiPortrait: springBound && springUserId && pagePermission.canShowMiniEntry('mine', '/package-feature/pages/aiPortrait/index', role, 'STUDENT'),
      springUserId,
      headerDisplayName,
      profileAvatarLetter: pickAvatarLetter(headerDisplayName, roleLabel),
    });
    if (springBound && springUserId) {
      this._profileLoadedOnce = false;
    } else {
      this._profileLoadedOnce = false;
      this.setData({
        archiveLoading: false,
        archiveEmpty: true,
        profileName: '',
        profileDept: '',
        profilePhone: '',
        profileTypes: '',
        profileDetailRows: [],
        profileDetailHeadRows: [],
        showProfileDetail: false,
        profileAvatarUrl: '',
        profileAvatarFailed: false,
        springRoleLabelZh: '',
      });
    }
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
    void this.refreshPendingBadges();
    if (springBound) { this.fetchCurrentEmail(); this.fetchCurrentSendKey(); }
  },

  onProfileAvatarError() {
    this.setData({ profileAvatarFailed: true });
  },

  drawProfileIdQr() {
    const id = this.data.springUserId;
    if (!id) return;
    this.setData({ profileIdQrImageSrc: '' });
    try {
      const drawQrcode = require('../../libs/weapp-qrcode.js');
      const self = this;
      const dpr = Math.min(3, Math.max(1, (wx.getSystemInfoSync() && wx.getSystemInfoSync().pixelRatio) || 2));
      drawQrcode({
        width: 180,
        height: 180,
        canvasId: 'profileIdQrCanvasOffscreen',
        text: String(id),
        _this: this,
        callback() {
          wx.canvasToTempFilePath(
            {
              canvasId: 'profileIdQrCanvasOffscreen',
              width: 180,
              height: 180,
              destWidth: Math.floor(180 * dpr),
              destHeight: Math.floor(180 * dpr),
              success(res) {
                const p = res && res.tempFilePath;
                if (p) self.setData({ profileIdQrImageSrc: p });
              },
            },
            self
          );
        },
      });
    } catch (e) {
      console.warn('[mine] id qrcode', e);
    }
  },

  openProfileDetail() {
    this.setData({ showProfileDetail: true });
    if (!this._profileLoadedOnce) {
      void this.loadCampusProfile();
    } else {
      setTimeout(() => this.drawProfileIdQr(), 200);
    }
  },

  onCloseProfileDetail() {
    this.setData({ showProfileDetail: false, profileIdQrImageSrc: '' });
  },

  async loadCampusProfile() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    const springUserId = twinScan.readSpringUserId();
    if (!token || !springUserId) {
      this.setData({
        springUserId: '',
        archiveLoading: false,
        archiveEmpty: true,
        profileName: '',
        profileDept: '',
        profilePhone: '',
        profileTypes: '',
        profileDetailRows: [],
        profileDetailHeadRows: [],
        profileAvatarUrl: '',
        profileAvatarFailed: false,
      });
      return;
    }
    this.setData({ springUserId, archiveLoading: true, archiveEmpty: false });
    try {
      const res = await springAuth.springRequest({
        url: '/api/v1/twin/scan/user-status',
        method: 'GET',
        data: { userId: springUserId },
      });
      const body = parseSpringBody(res);
      const ok = res.statusCode === 200 && body && body.success === true;
      const raw = ok ? body.data : null;
      const data = raw && typeof raw === 'object' ? raw : null;
      const parts = buildProfileDisplayParts(data, springUserId);
      const archiveEmpty = !parts.hasDisplay;
      const headRaw = parts.profileHeadRaw ? String(parts.profileHeadRaw).trim() : '';
      const profileAvatarUrl = headRaw ? springAuth.toAbsoluteMediaUrl(headRaw) : '';
      const roleLabel = this.data.springRoleLabel || '—';
      const authDisplay = displayNameFromSpringSession();
      const headerDisplayName =
        authDisplay || parts.summaryName || (roleLabel !== '—' ? roleLabel : '校内用户');
      this.setData({
        archiveLoading: false,
        archiveEmpty,
        profileName: parts.summaryName,
        profileDept: parts.summaryDept,
        profilePhone: parts.summaryPhone,
        profileTypes: parts.summaryTypes,
        profileDetailHeadRows: parts.headRows,
        profileDetailRows: parts.bodyRows,
        profileAvatarUrl,
        profileAvatarFailed: false,
        headerDisplayName,
        profileAvatarLetter: pickAvatarLetter(headerDisplayName, roleLabel),
      });
      this._profileLoadedOnce = true;
      if (this.data.showProfileDetail) {
        setTimeout(() => this.drawProfileIdQr(), 120);
      }
    } catch (e) {
      const roleLabel = this.data.springRoleLabel || '—';
      const authDisplay = displayNameFromSpringSession();
      const headerDisplayName = authDisplay || (roleLabel !== '—' ? roleLabel : '校内用户');
      this.setData({
        archiveLoading: false,
        archiveEmpty: true,
        profileName: '',
        profileDept: '',
        profilePhone: '',
        profileTypes: '',
        profileDetailRows: [],
        profileDetailHeadRows: [],
        profileAvatarUrl: '',
        profileAvatarFailed: false,
        headerDisplayName,
        profileAvatarLetter: pickAvatarLetter(headerDisplayName, roleLabel),
      });
    }
  },

  onOpenNicknameEditor() {
    const u = readSpringUserInfoObject();
    const cur = u && u.displayNickname != null ? String(u.displayNickname) : '';
    this.setData({ showNicknameEditor: true, nicknameDraft: cur });
  },

  onCloseNicknameEditor() {
    this.setData({ showNicknameEditor: false });
  },

  onNicknameDraftInput(e) {
    this.setData({ nicknameDraft: e.detail.value });
  },

  async submitNicknameDraft() {
    const v = (this.data.nicknameDraft || '').trim();
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      await springAuth.updateDisplayNickname(v);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ showNicknameEditor: false });
      this.refreshSpringUiState();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 18) : '保存失败',
        icon: 'none',
        duration: 3000,
      });
    }
  },

  goAdminPersonnel() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/adminPersonnel/index', role, 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/adminPersonnel/index' });
  },

  goDahuaIssue() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/dahuaIssue/index', role, 'ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/dahuaIssue/index' });
  },

  goDoorControl() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/doorControl/index', role, 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/doorControl/index' });
  },

  goAiPortrait() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    const userId = twinScan.readSpringUserId();
    if (!token || !userId) {
      wx.showToast({ title: '请先完成校内绑定', icon: 'none' });
      return;
    }
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/aiPortrait/index', role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/aiPortrait/index' });
  },

  goNotifications() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/notifications/index', role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (!this.data.isStudentView && hasMinRole(role || '', 'STAFF')) {
      wx.navigateTo({ url: '/package-feature/pages/staffChatHub/index' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/notifications/index' });
  },

  goRepairRequest() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/repairRequest/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/repairRequest/index' });
  },

  goRepairProcess() {
    if (!hasMinRole(wx.getStorageSync(springAuth.KEYS.ROLE), 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/repairProcess/index' });
  },

  goPurchaseRequest() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/purchaseRequest/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/purchaseRequest/index' });
  },

  goFileTemplates() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (
      !hasMinRole(role, 'STAFF') ||
      !pagePermission.canAccessMiniPage('/package-feature/pages/fileTemplates/index', role, 'STAFF')
    ) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/fileTemplates/index' });
  },

  goAssetRecord() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/assetRecord/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/assetRecord/index' });
  },

  goFacilityMaintenance() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/facilityMaintenance/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/facilityMaintenance/index' });
  },

  goAssetTransferRecord() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/assetTransferRecord/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/assetTransferRecord/index' });
  },

  goStudentReview() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/studentReviewHub/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/studentReviewHub/index' });
  },

  goSuppliesAudit() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/suppliesAudit/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/suppliesAudit/index' });
  },

  goPurchaseProcess() {
    if (!hasMinRole(wx.getStorageSync(springAuth.KEYS.ROLE), 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/purchaseProcess/index' });
  },

  openBindFlow() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    if (token) {
      wx.showModal({
        title: '已绑定校内系统',
        content: '如需换绑请先使用底部「退出登录」清除本机校内登录后再操作。',
        showCancel: false,
      });
      return;
    }
    let pending = wx.getStorageSync(springAuth.KEYS.PENDING_OPENID);
    if (!pending) {
      wx.showLoading({ title: '获取微信身份…', mask: true });
      wx.login({
        timeout: 10000,
        success: (loginRes) => {
          if (!loginRes.code) {
            wx.hideLoading();
            wx.showToast({ title: 'wx.login 未返回 code', icon: 'none' });
            return;
          }
          springAuth.loginWechat(loginRes.code).then((r) => {
            wx.hideLoading();
            this.refreshSpringUiState();
            pending = wx.getStorageSync(springAuth.KEYS.PENDING_OPENID);
            if (r.ok && r.openId && pending) {
              this.setData({ showBindTypeSheet: true });
              return;
            }
            if (r.ok && r.bound) {
              wx.showToast({ title: '当前微信已绑定', icon: 'none' });
              return;
            }
            const msg =
              (r && r.message) ||
              '未拿到待绑定 openId，请检查云函数 springProxy、SPRING_BASE_URL 与 Spring /api/auth/login/wechat';
            wx.showModal({
              title: '无法继续绑定',
              content: msg.length > 200 ? `${msg.slice(0, 200)}…` : msg,
              showCancel: false,
            });
          });
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: (err && err.errMsg) ? err.errMsg.slice(0, 24) : 'wx.login 失败',
            icon: 'none',
          });
        },
      });
      return;
    }
    this.setData({ showBindTypeSheet: true });
  },

  onCloseBindTypeSheet() {
    this.setData({ showBindTypeSheet: false });
  },

  onSelectBindType(e) {
    const item = e.detail || {};
    const name = item.name || '';
    const idx = this.data.bindTypeActions.findIndex((a) => a.name === name);
    this.setData({ showBindTypeSheet: false });
    if (idx === 0 || name === '我是学生') {
      this.setData({
        showStudentBind: true,
        bindStudentId: '',
      });
    } else if (idx === 1 || name === '我是教职工') {
      this.setData({
        showStaffBind: true,
        bindStaffUser: '',
        bindStaffPassword: '',
      });
    }
  },

  onCloseStudentBind() {
    this.setData({ showStudentBind: false });
  },

  onCloseStaffBind() {
    this.setData({ showStaffBind: false });
  },

  onBindStudentIdInput(e) {
    this.setData({ bindStudentId: e.detail.value });
  },

  onBindStaffUserInput(e) {
    this.setData({ bindStaffUser: e.detail.value });
  },

  onBindStaffPasswordInput(e) {
    this.setData({ bindStaffPassword: e.detail.value });
  },

  scanStudentQr() {
    this.scanQRCode({ fillBindStudentId: true });
  },

  async submitStudentBind() {
    const id = (this.data.bindStudentId || '').trim();
    if (!id) {
      wx.showToast({ title: '请输入学号', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '绑定中…', mask: true });
    try {
      await springAuth.bindWechat({
        bindType: 'STUDENT',
        identifier: id,
      });
      wx.hideLoading();
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ showStudentBind: false, bindStudentId: '', showProfileDetail: false });
      this.refreshSpringUiState();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({
        title: (err && err.message) ? err.message.slice(0, 18) : '绑定失败',
        icon: 'none',
        duration: 3000,
      });
    }
  },

  async submitStaffBind() {
    const u = (this.data.bindStaffUser || '').trim();
    const p = this.data.bindStaffPassword || '';
    if (!u || !p) {
      wx.showToast({ title: '请填写账号与密码', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '绑定中…', mask: true });
    try {
      await springAuth.bindWechat({
        bindType: 'STAFF',
        identifier: u,
        password: p,
      });
      wx.hideLoading();
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ showStaffBind: false, bindStaffUser: '', bindStaffPassword: '', showProfileDetail: false });
      this.refreshSpringUiState();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({
        title: (err && err.message) ? err.message.slice(0, 18) : '绑定失败',
        icon: 'none',
        duration: 3000,
      });
    }
  },

  clearSpringBind() {
    wx.showModal({
      title: '确认退出登录',
      confirmText: '退出登录',
      success: (res) => {
        if (res.confirm) {
          springAuth.clearSpringSession();
          clearPendingBadgeCache();
          this.refreshSpringUiState();
          wx.showToast({ title: '已退出登录', icon: 'none' });
        }
      },
    });
  },

  goNewsCenter() {
    wx.navigateTo({
      url: '/package-feature/pages/allnews/allnews',
    });
  },

  onMenuSettings() {
    wx.navigateTo({ url: '/package-feature/pages/settings/index' });
  },

  onMenuAbout() {
    wx.navigateTo({ url: '/package-feature/pages/about/index' });
  },

  async onGenerateRegistrationInvite() {
    if (!this.data.canStaffOps || !this.data.springBound) {
      wx.showToast({ title: '请先绑定校内账号', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/auth/registration-invites/personal',
        method: 'POST',
        data: {},
      });
      wx.hideLoading();
      const body = parseSpringBody(res);
      const ok = res.statusCode === 200 && body && body.success === true;
      const d = ok && body.data && typeof body.data === 'object' ? body.data : null;
      const code = d && d.plainCode != null ? String(d.plainCode) : '';
      const exp = d && d.expiresAt != null ? String(d.expiresAt) : '';
      if (code) {
        wx.setClipboardData({
          data: code,
          fail: () => {},
        });
        wx.showModal({
          title: '推荐码（已复制到剪贴板）',
          content: `推荐码：${code}\n过期时间：${exp}`,
          showCancel: false,
        });
      } else {
        const msg = (body && body.message) || '生成失败';
        wx.showModal({ title: '无法生成推荐码', content: msg.length > 500 ? `${msg.slice(0, 500)}…` : msg, showCancel: false });
      }
    } catch (e) {
      wx.hideLoading();
      const msg = (e && e.message) || '生成失败';
      wx.showModal({ title: '请求失败', content: msg.length > 500 ? `${msg.slice(0, 500)}…` : msg, showCancel: false });
    }
  },

  scanQRCode(options) {
    const opts = options || {};
    const fillBind = !!opts.fillBindStudentId;
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const numbers = res.result.match(/\d+/g);
        const numberStr = numbers ? numbers.join('') : '';

        if (numberStr) {
          const patch = fillBind ? { bindStudentId: numberStr } : {};
          if (Object.keys(patch).length) this.setData(patch);
          wx.showToast({
            title: fillBind ? '已填入学号' : '识别成功',
            icon: 'success',
          });
        } else {
          const patch = fillBind ? { bindStudentId: res.result } : {};
          if (Object.keys(patch).length) this.setData(patch);
          wx.showModal({
            title: '扫码内容',
            content: `${res.result}\n\n未提取到连续数字，已尝试填入学号框`,
            showCancel: false,
          });
        }
      },
      fail: (err) => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      },
    });
  },

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
    // 不走 springRequest（responseType:'json' 在部分 wx.request 版本中卡死 Promise），
    // 直接用 callSpringDirect + responseType:'text'，与 loginWechat 保持一致
    springAuth.callSpringDirect({
      path: '/api/auth/login/web',
      method: 'POST',
      data: { username: u, password: p, turnstileLoadFailed: true },
    }).then(function (res) {
      wx.hideLoading();
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.statusCode === 200 && body && body.success && body.data && typeof body.data === 'object') {
        springAuth.persistSpringSession(body.data);
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
      regStep: 'qr',
      regQrScanning: false,
      regQrVerified: false,
      regVerifiedData: null,
      regUsername: '', regPassword: '', regPassword2: '',
      registerStaffUser: '', registerStaffPassword: '', registerStaffPassword2: '', registerStaffInvite: '',
      regError: '',
    });
  },

  onCloseRegister: function () {
    this.setData({ showRegisterForm: false });
  },

  onBackToLogin: function () {
    this.setData({ showRegisterForm: false, showLoginForm: true });
  },

  /** 小字切换学生/教职工 — 仅改类型+步骤，不刷其他字段 */
  onRegToggleType: function () {
    var next = this.data.registerType === 'student' ? 'staff' : 'student';
    this.setData({ registerType: next, regStep: next === 'student' ? 'qr' : 'credentials', regError: '' });
  },

  /* ---- QR 扫码/上传（wx.chooseImage 拍照+相册 → 直传 Spring verify-qr）---- */
  onScanRegQr: function () {
    var self = this;
    self.setData({ regQrScanning: true, regError: '' });
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: function (imgRes) {
        var tempPath = imgRes.tempFilePaths[0];
        if (!tempPath) { self.setData({ regQrScanning: false }); return; }
        var base = springAuth.getApiPublicBaseUrl().replace(/\/+$/, '') || 'http://localhost:8081';
        wx.uploadFile({
          url: `${base}/api/auth/register/student/verify-qr`,
          filePath: tempPath,
          name: 'file',
          header: { 'Content-Type': 'multipart/form-data' },
          success: function (uploadRes) {
            try {
              var body = JSON.parse(uploadRes.data);
              if (uploadRes.statusCode === 200 && body && body.success && body.data) {
                self.handleQrVerified(body.data);
              } else {
                self.setData({ regQrScanning: false, regError: (body && body.message) || 'QR码验证失败' });
              }
            } catch (e) {
              self.setData({ regQrScanning: false, regError: '解析响应失败' });
            }
          },
          fail: function () {
            self.setData({ regQrScanning: false, regError: '网络错误' });
          },
        });
      },
      fail: function () { self.setData({ regQrScanning: false }); },
    });
  },

  handleQrVerified: function (data) {
    this.setData({ regQrScanning: false, regQrVerified: true, regVerifiedData: data, regStep: 'confirm', regError: '' });
  },

  /* ---- 凭据输入 ---- */
  onRegUsernameInput: function (e) { this.setData({ regUsername: e.detail.value }); },
  onRegPasswordInput: function (e) { this.setData({ regPassword: e.detail.value }); },
  onRegPassword2Input: function (e) { this.setData({ regPassword2: e.detail.value }); },
  onRegStaffUserInput: function (e) { this.setData({ registerStaffUser: e.detail.value }); },
  onRegStaffPwdInput: function (e) { this.setData({ registerStaffPassword: e.detail.value }); },
  onRegStaffPwd2Input: function (e) { this.setData({ registerStaffPassword2: e.detail.value }); },
  onRegStaffInviteInput: function (e) { this.setData({ registerStaffInvite: e.detail.value }); },

  onRegGoCredentials: function () { this.setData({ regStep: 'credentials', regError: '' }); },
  onRegBackToQr: function () { this.setData({ regStep: 'qr', regQrVerified: false, regVerifiedData: null, regError: '' }); },

  submitRegister: function () {
    var self = this;
    if (self.data.registerSubmitting) return;
    var isStudent = self.data.registerType === 'student';

    if (isStudent) {
      var vd = self.data.regVerifiedData;
      if (!vd || !vd.userId) { wx.showToast({ title: '请先扫描QR码验证身份', icon: 'none' }); return; }
      var uname = (self.data.regUsername || '').trim();
      var spwd = self.data.regPassword || '';
      var spwd2 = self.data.regPassword2 || '';
      if (!uname || uname.length < 3) { wx.showToast({ title: '用户名至少3位', icon: 'none' }); return; }
      if (!spwd || spwd.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }
      if (spwd !== spwd2) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    } else {
      var suser = (self.data.registerStaffUser || '').trim();
      var spwd = self.data.registerStaffPassword || '';
      var spwd2 = self.data.registerStaffPassword2 || '';
      var sinv = (self.data.registerStaffInvite || '').trim();
      if (!suser || !spwd || !sinv) { wx.showToast({ title: '请填写完整信息', icon: 'none' }); return; }
      if (spwd.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }
      if (spwd !== spwd2) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    }

    self.setData({ registerSubmitting: true });
    wx.showLoading({ title: '注册中…', mask: true });

    var url = isStudent ? '/api/auth/register/student' : '/api/auth/register/staff';
    var body = isStudent
      ? { userId: self.data.regVerifiedData.userId, name: self.data.regVerifiedData.name || uname, password: spwd }
      : { username: suser, password: spwd, inviteCode: sinv };

    springAuth.springRequest({ url: url, method: 'POST', data: body }).then(function (res) {
      wx.hideLoading();
      var respBody = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.statusCode === 200 && respBody && respBody.success) {
        self.setData({
          showRegisterForm: false, showLoginForm: true, registerSubmitting: false,
          regUsername: '', regPassword: '', regPassword2: '',
          registerStaffUser: '', registerStaffPassword: '', registerStaffPassword2: '', registerStaffInvite: '',
          regQrVerified: false, regVerifiedData: null, regStep: 'qr', regError: '',
        });
        wx.showToast({ title: '注册成功，请登录', icon: 'success' });
      } else {
        self.setData({ registerSubmitting: false });
        var msg = (respBody && respBody.message) || '注册失败';
        wx.showToast({ title: msg.length > 18 ? msg.slice(0, 18) + '…' : msg, icon: 'none', duration: 3000 });
      }
    }).catch(function () {
      wx.hideLoading(); self.setData({ registerSubmitting: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // ═══ 邮箱绑定 ═══
  fetchCurrentEmail() {
    const id = this.data.springUserId;
    if (!id) return;
    springAuth.springRequest({
      url: `/api/admin/personnel/${encodeURIComponent(id)}/contact-email`,
      method: 'GET',
      data: {},
    }).then((res) => {
      const body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      const email = (body && body.data && body.data.email) || '';
      this.setData({ currentEmail: email });
    }).catch(() => {});
  },

  fetchCurrentSendKey() {
    const id = this.data.springUserId;
    if (!id) return;
    springAuth.springRequest({
      url: `/api/admin/personnel/${encodeURIComponent(id)}/send-key`,
      method: 'GET',
      data: {},
    }).then((res) => {
      const body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      const sk = (body && body.data && body.data.sendKey) || '';
      this.setData({ currentSendKey: sk });
    }).catch(() => {});
  },

  copySendKeyUrl() {
    wx.navigateTo({ url: '/pages/common/webview/index?url=' + encodeURIComponent('https://sct.ftqq.com/') });
  },

  onOpenSendKeyEditor() {
    const id = this.data.springUserId;
    if (!id) { wx.showToast({ title: '请先完成校内绑定', icon: 'none' }); return; }
    if (this.data.currentSendKey) {
      wx.showModal({
        title: '取消微信通知',
        content: '已绑定微信通知（Server酱），是否取消绑定？',
        confirmText: '取消绑定',
        cancelText: '暂不',
        success: (res) => {
          if (res.confirm) this.doUnbindSendKey();
        },
      });
      return;
    }
    this.setData({ showSendKeyEditor: true, sendKeyDraft: '', sendKeySaving: false });
  },

  onCloseSendKeyEditor() {
    this.setData({ showSendKeyEditor: false, sendKeyDraft: '', sendKeySaving: false });
  },

  onSendKeyInput(e) {
    this.setData({ sendKeyDraft: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  doUnbindSendKey() {
    const id = this.data.springUserId;
    if (!id) return;
    wx.showLoading({ title: '解绑中…', mask: true });
    springAuth.springRequest({
      url: `/api/admin/personnel/${encodeURIComponent(id)}/send-key`,
      method: 'PUT',
      data: { sendKey: '' },
    }).then((res) => {
      wx.hideLoading();
      const body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (res && res.statusCode === 200 && body && body.success === true) {
        wx.showToast({ title: '已取消绑定', icon: 'success' });
        this.setData({ currentSendKey: '' });
      } else {
        wx.showToast({ title: (body && body.message) || '操作失败', icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  async onSubmitSendKey() {
    const id = this.data.springUserId;
    const sk = (this.data.sendKeyDraft || '').trim();
    if (!id || !sk || this.data.sendKeySaving) return;
    this.setData({ sendKeySaving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/personnel/${encodeURIComponent(id)}/send-key`,
        method: 'PUT',
        data: { sendKey: sk },
      });
      const body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (!(res && res.statusCode === 200 && body && body.success === true)) {
        throw new Error((body && body.message) || '保存失败');
      }
      wx.showToast({ title: '微信通知已绑定', icon: 'success' });
      this.setData({ currentSendKey: sk, showSendKeyEditor: false, sendKeyDraft: '', sendKeySaving: false });
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 20) : '失败', icon: 'none' });
      this.setData({ sendKeySaving: false });
    } finally {
      wx.hideLoading();
    }
  },

  onOpenEmailEditor() {
    const id = this.data.springUserId;
    if (!id) { wx.showToast({ title: '请先完成校内绑定', icon: 'none' }); return; }
    // 已绑定：确认是否解绑
    if (this.data.currentEmail) {
      wx.showModal({
        title: '取消绑定',
        content: `当前已绑定 ${this.data.currentEmail}，是否取消绑定？`,
        confirmText: '取消绑定',
        cancelText: '暂不',
        success: (res) => {
          if (res.confirm) this.doUnbindEmail();
        },
      });
      return;
    }
    this.setData({ showEmailEditor: true, emailDraft: '', emailSaving: false });
  },

  doUnbindEmail() {
    const id = this.data.springUserId;
    if (!id) return;
    wx.showLoading({ title: '解绑中…', mask: true });
    springAuth.springRequest({
      url: `/api/admin/personnel/${encodeURIComponent(id)}/contact-email`,
      method: 'PUT',
      data: { email: '' },
    }).then((res) => {
      wx.hideLoading();
      const body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (res && res.statusCode === 200 && body && body.success === true) {
        wx.showToast({ title: '已取消绑定', icon: 'success' });
        this.setData({ currentEmail: '' });
      } else {
        wx.showToast({ title: (body && body.message) || '操作失败', icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  onCloseEmailEditor() {
    if (this._emailCooldownTimer) { clearInterval(this._emailCooldownTimer); this._emailCooldownTimer = null; }
    this.setData({ showEmailEditor: false, emailDraft: '', emailCode: '', emailCodeCooldown: 0, emailSaving: false });
  },

  onEmailInput(e) {
    this.setData({ emailDraft: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  async onSubmitEmail() {
    const email = (this.data.emailDraft || '').trim();
    const code = (this.data.emailCode || '').trim();
    if (!email || !code || this.data.emailSaving) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      wx.showToast({ title: '邮箱格式不正确', icon: 'none' });
      return;
    }
    this.setData({ emailSaving: true });
    wx.showLoading({ title: '绑定中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/auth/bind/email',
        method: 'POST',
        data: { email, code },
      });
      const body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (!(res && res.statusCode === 200 && body && body.success === true)) {
        throw new Error((body && body.message) || '绑定失败');
      }
      wx.showToast({ title: '邮箱已绑定', icon: 'success' });
      this.setData({ currentEmail: email, showEmailEditor: false, emailDraft: '', emailCode: '', emailSaving: false });
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 20) : '失败', icon: 'none' });
      this.setData({ emailSaving: false });
    } finally {
      wx.hideLoading();
    }
  },

  async onSendEmailBindCode() {
    const email = (this.data.emailDraft || '').trim();
    if (!email) { wx.showToast({ title: '请先输入邮箱', icon: 'none' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      wx.showToast({ title: '邮箱格式不正确', icon: 'none' });
      return;
    }
    if (this.data.emailCodeCooldown > 0 || this.data.emailCodeSending) return;
    this.setData({ emailCodeSending: true });
    try {
      await springAuth.springRequest({
        url: '/api/auth/send-verification-code',
        method: 'POST',
        data: { email, scene: 'BIND_EMAIL' },
      });
      wx.showToast({ title: '验证码已发送', icon: 'success' });
      this.setData({ emailCodeCooldown: 60 });
      if (this._emailCooldownTimer) clearInterval(this._emailCooldownTimer);
      this._emailCooldownTimer = setInterval(() => {
        var next = this.data.emailCodeCooldown - 1;
        if (next <= 0) {
          clearInterval(this._emailCooldownTimer);
          this._emailCooldownTimer = null;
        }
        this.setData({ emailCodeCooldown: next <= 0 ? 0 : next });
      }, 1000);
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 20) : '发送失败', icon: 'none' });
    } finally {
      this.setData({ emailCodeSending: false });
    }
  },

  onEmailCodeInput(e) {
    this.setData({ emailCode: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  // ═══ 修改密码 ═══
  onOpenPwdChange() {
    this.setData({ showPwdChange: true, pwdOld: '', pwdNew: '', pwdConfirm: '', pwdSubmitting: false });
  },

  onClosePwdChange() {
    this.setData({ showPwdChange: false });
  },

  onPwdOldInput(e) { this.setData({ pwdOld: e.detail.value }); },
  onPwdNewInput(e) { this.setData({ pwdNew: e.detail.value }); },
  onPwdConfirmInput(e) { this.setData({ pwdConfirm: e.detail.value }); },

  async submitPwdChange() {
    var self = this;
    var oldPwd = self.data.pwdOld || '';
    var newPwd = self.data.pwdNew || '';
    var confirm = self.data.pwdConfirm || '';
    if (!oldPwd || !newPwd || !confirm) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    if (newPwd.length < 6) {
      wx.showToast({ title: '新密码至少6位', icon: 'none' });
      return;
    }
    if (newPwd !== confirm) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    if (self.data.pwdSubmitting) return;
    self.setData({ pwdSubmitting: true });
    wx.showLoading({ title: '修改中…', mask: true });
    try {
      var res = await springAuth.springRequest({
        url: '/api/auth/password/change',
        method: 'POST',
        data: { oldPassword: oldPwd, newPassword: newPwd },
      });
      wx.hideLoading();
      var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (res && res.statusCode === 200 && body && body.success === true) {
        wx.showToast({ title: '密码已修改', icon: 'success' });
        self.setData({ showPwdChange: false, pwdOld: '', pwdNew: '', pwdConfirm: '', pwdSubmitting: false });
      } else {
        self.setData({ pwdSubmitting: false });
        var msg = (body && body.message) || '修改失败';
        wx.showToast({ title: msg.length > 18 ? msg.slice(0, 18) + '…' : msg, icon: 'none', duration: 3000 });
      }
    } catch (e) {
      wx.hideLoading();
      self.setData({ pwdSubmitting: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // ═══ 忘记密码 ═══
  onOpenForgotPwd() {
    this.setData({
      showLoginForm: false,
      showForgotPwd: true,
      forgotStep: 'method',
      forgotUserId: '',
      forgotPhone: '',
      forgotQrUploading: false,
      forgotQrResult: null,
      forgotEmail: '',
      forgotEmailCode: '',
      forgotEmailCooldown: 0,
      forgotEmailSending: false,
      forgotResetToken: '',
      forgotNewPwd: '',
      forgotNewPwd2: '',
      forgotSubmitting: false,
      forgotError: '',
    });
  },

  onCloseForgotPwd() {
    if (this._forgotCooldownTimer) { clearInterval(this._forgotCooldownTimer); this._forgotCooldownTimer = null; }
    this.setData({ showForgotPwd: false });
  },

  onForgotBackToLogin() {
    this.setData({ showForgotPwd: false, showLoginForm: true });
  },

  onForgotSelectQr() {
    this.setData({ forgotStep: 'qrInput', forgotError: '' });
  },

  onForgotSelectEmail() {
    this.setData({ forgotStep: 'emailInput', forgotError: '' });
  },

  onForgotBackToMethod() {
    if (this._forgotCooldownTimer) { clearInterval(this._forgotCooldownTimer); this._forgotCooldownTimer = null; }
    this.setData({ forgotStep: 'method', forgotError: '', forgotEmailCooldown: 0, forgotEmailSending: false });
  },

  onForgotUserIdInput(e) { this.setData({ forgotUserId: e.detail.value }); },
  onForgotPhoneInput(e) { this.setData({ forgotPhone: e.detail.value }); },

  onForgotUploadQr() {
    var self = this;
    self.setData({ forgotQrUploading: true, forgotError: '' });
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: function (imgRes) {
        var tempPath = imgRes.tempFilePaths[0];
        if (!tempPath) { self.setData({ forgotQrUploading: false }); return; }
        var base = springAuth.getApiPublicBaseUrl().replace(/\/+$/, '') || 'http://localhost:8081';
        wx.uploadFile({
          url: base + '/api/auth/forgot-password/decode-qr',
          filePath: tempPath,
          name: 'file',
          header: { 'Content-Type': 'multipart/form-data' },
          success: function (uploadRes) {
            try {
              var body = JSON.parse(uploadRes.data);
              if (uploadRes.statusCode === 200 && body && body.success && body.data) {
                var userId = (body.data.userId || body.data.id || '').toString();
                self.setData({ forgotQrUploading: false, forgotQrResult: body.data, forgotUserId: userId, forgotError: '' });
                wx.showToast({ title: 'QR码识别成功', icon: 'success' });
              } else {
                self.setData({ forgotQrUploading: false, forgotError: (body && body.message) || 'QR码识别失败' });
              }
            } catch (e) {
              self.setData({ forgotQrUploading: false, forgotError: '解析响应失败' });
            }
          },
          fail: function () {
            self.setData({ forgotQrUploading: false, forgotError: '网络错误' });
          },
        });
      },
      fail: function () { self.setData({ forgotQrUploading: false }); },
    });
  },

  async onForgotQrVerify() {
    var self = this;
    var userId = (self.data.forgotUserId || '').trim();
    var phone = (self.data.forgotPhone || '').trim();
    if (!userId) { wx.showToast({ title: '请输入用户ID', icon: 'none' }); return; }
    if (!phone) { wx.showToast({ title: '请输入手机号', icon: 'none' }); return; }
    if (self.data.forgotSubmitting) return;
    self.setData({ forgotSubmitting: true, forgotError: '' });
    wx.showLoading({ title: '验证中…', mask: true });
    springAuth.callSpringDirect({
      path: '/api/auth/forgot-password/verify',
      method: 'POST',
      data: { userId: userId, phoneNumber: phone },
    }).then(function (res) {
      wx.hideLoading();
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.statusCode === 200 && body && body.success) {
        self.setData({ forgotStep: 'qrReset', forgotSubmitting: false, forgotNewPwd: '', forgotNewPwd2: '' });
      } else {
        self.setData({ forgotSubmitting: false, forgotError: (body && body.message) || '验证失败' });
      }
    }).catch(function () {
      wx.hideLoading();
      self.setData({ forgotSubmitting: false, forgotError: '网络错误' });
    });
  },

  onForgotEmailInput(e) { this.setData({ forgotEmail: e.detail.value }); },

  async onForgotSendEmailCode() {
    var self = this;
    var email = (self.data.forgotEmail || '').trim();
    if (!email) { wx.showToast({ title: '请输入邮箱', icon: 'none' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      wx.showToast({ title: '邮箱格式不正确', icon: 'none' });
      return;
    }
    if (self.data.forgotEmailCooldown > 0 || self.data.forgotEmailSending) return;
    self.setData({ forgotEmailSending: true, forgotError: '' });
    springAuth.callSpringDirect({
      path: '/api/auth/send-verification-code',
      method: 'POST',
      data: { email: email, scene: 'FORGOT_PASSWORD' },
    }).then(function () {
      wx.showToast({ title: '验证码已发送', icon: 'success' });
      self.setData({ forgotEmailCooldown: 60, forgotEmailSending: false });
      if (self._forgotCooldownTimer) clearInterval(self._forgotCooldownTimer);
      self._forgotCooldownTimer = setInterval(function () {
        var next = self.data.forgotEmailCooldown - 1;
        if (next <= 0) {
          clearInterval(self._forgotCooldownTimer);
          self._forgotCooldownTimer = null;
        }
        self.setData({ forgotEmailCooldown: next <= 0 ? 0 : next });
      }, 1000);
    }).catch(function (e) {
      self.setData({ forgotEmailSending: false, forgotError: (e && e.message) || '发送失败' });
    });
  },

  onForgotEmailCodeInput(e) { this.setData({ forgotEmailCode: e.detail.value }); },

  async onForgotEmailVerify() {
    var self = this;
    var email = (self.data.forgotEmail || '').trim();
    var code = (self.data.forgotEmailCode || '').trim();
    if (!email || !code) { wx.showToast({ title: '请填写邮箱和验证码', icon: 'none' }); return; }
    if (self.data.forgotSubmitting) return;
    self.setData({ forgotSubmitting: true, forgotError: '' });
    wx.showLoading({ title: '验证中…', mask: true });
    springAuth.callSpringDirect({
      path: '/api/auth/forgot-password/by-email/verify',
      method: 'POST',
      data: { email: email, code: code },
    }).then(function (res) {
      wx.hideLoading();
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.statusCode === 200 && body && body.success && body.data) {
        var resetToken = (body.data.resetToken || body.data.token || '').toString();
        self.setData({ forgotStep: 'emailReset', forgotResetToken: resetToken, forgotSubmitting: false, forgotNewPwd: '', forgotNewPwd2: '' });
      } else {
        self.setData({ forgotSubmitting: false, forgotError: (body && body.message) || '验证失败' });
      }
    }).catch(function () {
      wx.hideLoading();
      self.setData({ forgotSubmitting: false, forgotError: '网络错误' });
    });
  },

  onForgotNewPwdInput(e) { this.setData({ forgotNewPwd: e.detail.value }); },
  onForgotNewPwd2Input(e) { this.setData({ forgotNewPwd2: e.detail.value }); },

  async submitForgotReset() {
    var self = this;
    var newPwd = self.data.forgotNewPwd || '';
    var newPwd2 = self.data.forgotNewPwd2 || '';
    if (!newPwd || newPwd.length < 6) { wx.showToast({ title: '新密码至少6位', icon: 'none' }); return; }
    if (newPwd !== newPwd2) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    if (self.data.forgotSubmitting) return;

    var url, data;
    if (self.data.forgotStep === 'qrReset') {
      url = '/api/auth/forgot-password/reset';
      data = { userId: self.data.forgotUserId, newPassword: newPwd };
    } else {
      url = '/api/auth/forgot-password/by-email/reset';
      data = { resetToken: self.data.forgotResetToken, newPassword: newPwd };
    }

    self.setData({ forgotSubmitting: true, forgotError: '' });
    wx.showLoading({ title: '重置中…', mask: true });
    springAuth.callSpringDirect({ path: url, method: 'POST', data: data }).then(function (res) {
      wx.hideLoading();
      var body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.statusCode === 200 && body && body.success) {
        wx.showToast({ title: '密码已重置，请登录', icon: 'success' });
        if (self._forgotCooldownTimer) { clearInterval(self._forgotCooldownTimer); self._forgotCooldownTimer = null; }
        self.setData({ showForgotPwd: false, showLoginForm: true, forgotSubmitting: false });
      } else {
        self.setData({ forgotSubmitting: false, forgotError: (body && body.message) || '重置失败' });
      }
    }).catch(function () {
      wx.hideLoading();
      self.setData({ forgotSubmitting: false, forgotError: '网络错误' });
    });
  },
});
