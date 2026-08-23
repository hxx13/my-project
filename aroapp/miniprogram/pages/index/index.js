/*
 * @Date: 2026-04-03 10:09:00
 * @LastEditTime: 2026-04-16 16:37:41
 * @FilePath: \aroapp\miniprogram\pages\index\index.js
 */
/** 轮播大图仅网络；水印与推荐位缩略图保留本地 logohs.png（见 pages/assets/images/） */
const LOGO_THUMB = '/pages/assets/images/logohs.png';
const ICON_ROOM = '/pages/assets/images/icon-room.png';
const ICON_STUDENT_REVIEW = '/pages/assets/images/icon-student-review.png';
const ICON_REPAIR = '/pages/assets/images/icon-repair.png';
const ICON_PURCHASE = '/pages/assets/images/icon-purchase.png';
const ICON_NOTIFY = '/pages/assets/images/icon-notify.png';
const ICON_SUPPLIES = '/pages/assets/images/icon-supplies.png';
const springAuth = require('../../utils/springAuth.js');
const aroNewsApi = require('../../utils/aroNewsApi.js');
const mpBulletinApi = require('../../utils/mpBulletinApi.js');
const pagePermission = require('../../utils/pagePermission.js');
const { hasMinRole } = require('../../utils/roleAccess.js');
const { peekPendingBadges, refreshPendingBadges } = require('../../utils/badgeSnapshotStore.js');
const {
  menuBadgePreferProcessThenApplicant,
  homeMessagesQuickBadgeText,
  studentReviewMenuBadgeText,
} = require('../../utils/pendingBadgeCounts.js');
const { readCustomNavMetrics } = require('../../utils/customNavMetrics.js');
const loginBrandingHero = require('../../utils/loginBrandingHero.js');
const { isStudentAccount } = require('../../utils/roleAccess.js');
const {
  buildPresenceFromDashboard,
  buildPresenceViewModel,
  decorateExemptStatus,
} = require('../../utils/studentPresenceHelpers.js');
const { createStudentPresenceSocket } = require('../../utils/studentPresenceSocket.js');
const studentAlerts = require('../../utils/studentAlertHelpers.js');

const ICON_CAGE = '/pages/assets/images/icon-cage.png';
const ICON_RECORDS = '/pages/assets/images/icon-records.png';
const ICON_GROUP = '/pages/assets/images/icon-group.png';
const ICON_VIOLATION = '/pages/assets/images/icon-violation.png';

const RECOMMENDED_ROOMS = [
  { id: 'r1', name: '1F01室', desc: '设备齐全', thumb: LOGO_THUMB, status: '可预约', tagType: 'success' },
  { id: 'r2', name: '1F02室', desc: '环境舒适', thumb: LOGO_THUMB, status: '可预约', tagType: 'success' },
  { id: 'r3', name: '1F03室', desc: '预约中', thumb: LOGO_THUMB, status: '占用中', tagType: 'warning' },
  { id: 'r4', name: '2F01室', desc: '通风良好', thumb: LOGO_THUMB, status: '可预约', tagType: 'success' },
  { id: 'r5', name: '2F02室', desc: '温度稳定', thumb: LOGO_THUMB, status: '维护', tagType: 'danger' },
  { id: 'r6', name: '3F01室', desc: '空间宽敞', thumb: LOGO_THUMB, status: '可预约', tagType: 'success' },
  { id: 'r7', name: '3F02室', desc: '光照充足', thumb: LOGO_THUMB, status: '可预约', tagType: 'success' },
  { id: 'r8', name: '4F01室', desc: '维护良好', thumb: LOGO_THUMB, status: '可预约', tagType: 'success' },
  { id: 'r9', name: '5F01室', desc: '近期开放', thumb: LOGO_THUMB, status: '即将', tagType: 'primary' },
  { id: 'r10', name: '5F02室', desc: '预约可用', thumb: LOGO_THUMB, status: '可预约', tagType: 'success' },
];

Page({
  data: {
    /** 登录条问候语 */
    loginGreeting: 'Hey，欢迎使用实验动物科学部服务平台',
    springBound: false,
    /** 三宫格：预留位1 房间 / 预留位2 学生审核 / 预留位3 笼架 */
    primarySlots: [
      { id: 'slot1', title: '预留位', placeholder: true },
      { id: 'slot2', title: '预留位', placeholder: true },
      { id: 'slot3', title: '预留位', placeholder: true },
    ],
    canPrimaryRoom: false,
    canPrimaryStudentReview: false,
    canPrimaryCageShelf: false,
    badgeStudentReviewText: '',
    /** 登录页轮播同源：亮/暗图按 08:00—16:30 自动切换 */
    banners: [],
    bannerInterval: 8000,
    heroCarouselEnabled: false,
    heroColorMode: 'light',
    recommendedRooms: RECOMMENDED_ROOMS,
    newsList: [],
    activeHomeTab: 'news',
    newsLoading: false,
    newsLoaded: false,
    bulletinList: [],
    bulletinLoading: false,
    bulletinLoaded: false,
    showPreview: false,
    currentPreviewUrl: "",
    canQuickRepairRequest: false,
    canQuickPurchaseRequest: false,
    canQuickSupplies: false,
    canQuickNotifications: true,
    iconRepair: ICON_REPAIR,
    iconPurchase: ICON_PURCHASE,
    iconNotify: ICON_NOTIFY,
    iconSupplies: ICON_SUPPLIES,
    canCreateAnnouncement: false,
    badgeRepairText: '',
    badgePurchaseText: '',
    badgeSuppliesText: '',
    badgeNotifyText: '',
    /** 自定义透明顶栏（与胶囊对齐） */
    statusBarHeight: 20,
    navBarHeight: 64,
    navContentHeight: 32,

    isStudentView: false,

    presenceLoading: true,
    presenceWsConnected: false,
    presenceLabel: '',
    presenceRoomName: '',
    presenceShowRoomName: false,
    presenceDwellText: '',
    presenceCountdownText: '',
    presenceCountdownLabel: '',
    presenceCountdownUrgent: false,
    presenceShowDwell: false,
    presenceShowCountdown: false,
    presencePhaseOutside: false,
    presencePhaseUnknown: false,
    presenceAccent: '',
    presenceAccentSoft: '',
    presenceBorder: '',
    presenceBadgeBg: '',
    presenceBadgeText: '',
    presenceIconBg: '',
    presenceRoomNameColor: '',
    presenceCardBg: '',
    presenceIconName: 'passed',
    presenceDwellSoft: '',
    presenceDwellBorder: '',
    presenceDwellTextColor: '',
    presenceCountdownSoft: '',
    presenceCountdownBorder: '',
    presenceCountdownTextColor: '',

    hasExemptRow: false,
    exemptBadge: '',
    exemptRoomNames: '',
    exemptDetailLine1: '',
    exemptDetailLine2: '',
    exemptAccent: '',
    exemptSoft: '',
    exemptBorder: '',
    exemptText: '',
    exemptIconName: 'gem-o',

    iconCage: ICON_CAGE,
    iconRecords: ICON_RECORDS,
    iconGroup: ICON_GROUP,
    iconViolation: ICON_VIOLATION,

    studentUpperRow: [
      { id: 'room', title: '房间', iconSrc: ICON_ROOM },
      { id: 'material', title: '申领', iconSrc: ICON_SUPPLIES },
      { id: 'cage', title: '笼架', iconSrc: ICON_CAGE },
    ],
    studentLowerRow: [
      { id: 'records', title: '出入记录', iconSrc: ICON_RECORDS },
      { id: 'notices', title: '通知', iconSrc: ICON_NOTIFY, badge: '' },
      { id: 'group', title: '活跃度', iconSrc: ICON_GROUP },
      { id: 'violations', title: '违规记录', iconSrc: ICON_VIOLATION },
    ],

    /** H5 同款公告通知列表 */
    studentAnnouncements: [],
    studentAnnouncementsLoading: false,

  },
    // 打开图片预览
    previewImage(e) {
      const current = e.currentTarget.dataset.src;
      this.setData({
        currentPreviewUrl: current,
        showPreview: true
      });
    },
  
    // 关闭预览
    closePreview() {
      this.setData({
        showPreview: false
      });
    },
  onLoad() {
    this.applyCustomNavMetrics();
    this.getNewsList();
    void this.loadHeroBranding();
  },

  onHide() {
    this._indexAlive = false;
    // 切 Tab 仅暂停 tick，保留 WS 与 presence UI，避免「实时」指示闪烁
    this.stopPresenceTick();
    if (this._heroScheduleTimer) {
      clearTimeout(this._heroScheduleTimer);
      this._heroScheduleTimer = null;
    }
    if (this._heroCloudRetryTimer) {
      clearTimeout(this._heroCloudRetryTimer);
      this._heroCloudRetryTimer = null;
    }
    this._heroCloudRetryScheduled = false;
  },

  onUnload() {
    this._indexAlive = false;
    this.stopPresenceRealtime();
    if (this._heroScheduleTimer) {
      clearTimeout(this._heroScheduleTimer);
      this._heroScheduleTimer = null;
    }
    if (this._heroCloudRetryTimer) {
      clearTimeout(this._heroCloudRetryTimer);
      this._heroCloudRetryTimer = null;
    }
    this._heroCloudRetryScheduled = false;
  },

  scheduleHeroModeRefresh() {
    if (this._heroScheduleTimer) clearTimeout(this._heroScheduleTimer);
    const ms = loginBrandingHero.msUntilNextScheduleBoundary();
    this._heroScheduleTimer = setTimeout(() => {
      void this.applyHeroBannersFromBranding(this._loginBranding);
      this.scheduleHeroModeRefresh();
    }, ms);
  },

  async applyHeroBannersFromBranding(branding) {
    const mode = loginBrandingHero.getScheduledHeroMode();
    const seq = (this._heroBannerSeq = (this._heroBannerSeq || 0) + 1);
    const urls = await loginBrandingHero.resolveHeroBannerUrlsForDisplay(branding, mode);
    if (seq !== this._heroBannerSeq) return;
    if (!this._indexAlive) return;
    const intervalSec = Math.max(3, (branding && branding.intervalSec) || 8);
    const carouselOn = !branding || branding.heroCarouselEnabled !== false;
    this.setData({
      banners: urls,
      bannerInterval: intervalSec * 1000,
      heroCarouselEnabled: carouselOn && urls.length > 1,
      heroColorMode: mode,
    });
    // Phase 2C: cloud:// 映射已移除，无需延迟重解析
    if (
      branding
      && urls.length
      && !this._heroCloudRetryScheduled
    ) {
      this._heroCloudRetryScheduled = true;
      if (this._heroCloudRetryTimer) {
        clearTimeout(this._heroCloudRetryTimer);
      }
      this._heroCloudRetryTimer = setTimeout(() => {
        this._heroCloudRetryTimer = null;
        void this.applyHeroBannersFromBranding(branding);
      }, 6000);
    }
  },

  async loadHeroBranding() {
    try {
      await springAuth.refreshPublicRuntimeConfig();
      const branding = await loginBrandingHero.fetchLoginBranding();
      this._loginBranding = branding;
      await this.applyHeroBannersFromBranding(branding);
      this.scheduleHeroModeRefresh();
    } catch (e) {
      console.warn('[index] login branding hero', e);
      await this.applyHeroBannersFromBranding(this._loginBranding || null);
    }
  },

  applyCustomNavMetrics() {
    try {
      this.setData(readCustomNavMetrics());
    } catch (e) {
      console.warn('[index] custom nav metrics', e);
    }
  },

  /** 左上角扫码：调用微信扫码工具 → 统一查询 → 路由跳转 */
  onScanTap() {
    var self = this;
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode', 'barCode', 'datamatrix', 'pdf417'],
      success: function (res) {
        var code = (res && (res.result || res.rawData)) ? String(res.result || res.rawData).trim() : '';
        console.log('[index] scan result:', code);
        if (!code) return;

        wx.showLoading({ title: '识别中…', mask: true });
        springAuth.springRequest({
          url: '/api/v1/scan/lookup',
          method: 'GET',
          data: { code: code },
        }).then(function (lookupRes) {
          wx.hideLoading();
          var body = typeof lookupRes.data === 'string' ? JSON.parse(lookupRes.data) : lookupRes.data;
          var result = (body && body.success && body.data) ? body.data : {};
          console.log('[scan-lookup] result:', JSON.stringify(result));
          if (!result.type || result.type === 'NOT_FOUND') {
            wx.showToast({ title: result.message || '未识别到有效内容', icon: 'none' });
            return;
          }

          if (result.type === 'CAGE_BOX' && result.cageBox) {
            var cb = result.cageBox;
            var url = '/package-feature/pages/studentCageShelf/index' +
              '?highlightX=' + cb.positionX +
              '&highlightY=' + cb.positionY +
              '&campusName=' + (cb.campusName || '') +
              '&roomName=' + (cb.roomName || '') +
              (cb.shelveId ? '&shelveId=' + cb.shelveId : '');
            wx.navigateTo({ url: url });
          } else if (result.type === 'ASSET' && result.asset) {
            var assetCode = result.asset.assetCode || code;
            wx.navigateTo({
              url: '/package-feature/pages/assetRecord/index?searchCode=' + encodeURIComponent(assetCode)
            });
          } else {
            wx.showToast({ title: result.message || '未识别到有效内容', icon: 'none' });
          }
        }).catch(function (e) {
          wx.hideLoading();
          wx.showToast({ title: (e && e.message) || '查询失败', icon: 'none' });
        });
      },
      fail: function (err) {
        // 用户取消不提示
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  async getNewsList() {
    if (this.data.newsLoading) return;
    this.setData({ newsLoading: true, newsLoaded: false });
    try {
      const list = await aroNewsApi.fetchNewsList();
      const visible = (Array.isArray(list) ? list : []).filter(
        (item) => item && (String(item.newsName || '').trim() || String(item.id || '').trim())
      );
      this.setData({
        newsList: visible.slice(0, 5),
        newsLoaded: true,
      });
    } catch (err) {
      console.warn('[index] 新闻加载失败', err);
      this.setData({ newsLoaded: true });
    } finally {
      this.setData({ newsLoading: false });
    }
  },

  refreshLoginBar() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    const springBound = !!token;
    let displayName = '';
    try {
      const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
      if (raw) {
        const ui = typeof raw === 'string' ? JSON.parse(raw) : raw;
        displayName = ui && ui.displayName != null ? String(ui.displayName).trim() : '';
      }
    } catch (e) {
      displayName = '';
    }
    const loginGreeting = springBound
      ? (displayName ? `你好，${displayName}` : '你好，欢迎回来')
      : 'Hey，欢迎使用实验动物科学部服务平台';
    this.setData({ springBound, loginGreeting });
  },

  goLoginRegister() {
    wx.switchTab({ url: '/pages/mine/index' });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/index' });
  },

  async onShow() {
    this._indexAlive = true;
    this.refreshLoginBar();
    var studentView = isStudentAccount();
    this.setData({ isStudentView: studentView });
    if (studentView) {
      this.startPresenceRealtime();
      if (!this._announcementsLoaded) {
        this._announcementsLoaded = true;
        this.loadStudentAnnouncements(true);
      } else {
        // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
        this.loadStudentAnnouncements(false);
      }
    } else {
      this.stopPresenceRealtime();
      // 教职工：每次回到首页刷新新闻列表
      this.getNewsList();
    }
    if (this._loginBranding) {
      this.applyHeroBannersFromBranding(this._loginBranding);
      this.scheduleHeroModeRefresh();
    } else {
      void this.loadHeroBranding();
    }
    try {
      await pagePermission.refreshMiniPermissions();
    } catch (e) {
      // 权限缓存不可用时不阻断首页；入口仍按角色降级判断
    }
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const canQuickSuppliesMall =
      hasMinRole(role, 'ADMIN') &&
      pagePermission.canShowMiniEntry('home', '/package-feature/pages/supplies/index', role, 'ADMIN');
    const canQuickSuppliesMine =
      hasMinRole(role, 'STAFF') &&
      pagePermission.canAccessMiniPage('/package-feature/pages/suppliesMine/index', role, 'STAFF');
    this.setData({
      canQuickRepairRequest: pagePermission.canShowMiniEntry('home', '/package-feature/pages/repairRequest/index', role, 'STAFF'),
      canQuickPurchaseRequest: pagePermission.canShowMiniEntry('home', '/package-feature/pages/purchaseRequest/index', role, 'STAFF'),
      /** 管理端进物资页；非处理教职工进「我的领用记录」，角标均为 pending-badges（处理者优先队列，否则本人待出库） */
      canQuickSupplies: canQuickSuppliesMall || canQuickSuppliesMine,
      canQuickNotifications: pagePermission.canShowMiniEntry('home', '/package-feature/pages/notifications/index', role, 'STUDENT'),
      canCreateAnnouncement: hasMinRole(role, 'PLATFORM_OWNER'),
      canPrimaryRoom: pagePermission.canShowMiniEntry('tabbar', '/pages/room/index', role, 'STUDENT'),
      canPrimaryStudentReview:
        hasMinRole(role, 'STAFF') &&
        pagePermission.canShowMiniEntry('mine', '/package-feature/pages/studentReviewHub/index', role, 'STAFF'),
      canPrimaryCageShelf:
        hasMinRole(role, 'STAFF') &&
        pagePermission.canShowMiniEntry('home', '/package-feature/pages/studentCageShelf/index', role, 'STAFF'),
    }, () => {
      this.applyPrimarySlots();
    });
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') {
      tabBar.refreshTabs();
    }
    void this.refreshQuickBadges();

    let ui = null;
    try {
      const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
      if (raw) {
        ui = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      ui = null;
    }
    if (!this._userPickedHomeTab) {
      this.setData({ activeHomeTab: 'news' });
    }
  },

  async loadBulletinList() {
    if (this.data.bulletinLoaded) return;
    this.setData({ bulletinLoading: true });
    try {
      const list = await mpBulletinApi.fetchBulletinList();
      // 预计算展示文本，避免 WXML 模板中拼接特殊字符
      const decorated = list.map((item) => ({
        ...item,
        labelText: [
          item.summary || '',
          item.publishedAtText || '',
          item.kindLabel || '',
        ].filter(Boolean).join(' | '),
      }));
      this.setData({ bulletinList: decorated, bulletinLoaded: true });
    } catch (e) {
      console.warn('[index] bulletin list', e);
      this.setData({ bulletinList: [], bulletinLoaded: true });
    } finally {
      this.setData({ bulletinLoading: false });
    }
  },

  onHomeTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab) return;
    this._userPickedHomeTab = true;
    this.setData({ activeHomeTab: tab });
    if (tab === 'bulletin') {
      void this.loadBulletinList();
    }
  },

  onBulletinTap(e) {
    const id = e.currentTarget.dataset.id;
    const kind = e.currentTarget.dataset.kind;
    if (!id || !kind) return;
    wx.navigateTo({
      url: `/package-feature/pages/homeBulletinDetail/index?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}`,
    });
  },

  goCreateAnnouncement() {
    wx.navigateTo({ url: '/package-feature/pages/announcementEdit/index' });
  },

  applyQuickBadgeTexts(c) {
    if (!c) return;
    const badgeSuppliesText = menuBadgePreferProcessThenApplicant(
      c,
      'processSupplies',
      'processSuppliesText',
      'supplies',
      'suppliesText',
    );
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
      badgeRepairText,
      badgePurchaseText,
      badgeSuppliesText,
      /** 私聊 + 系统通知；工单待办在报修/采购/物资入口单独计数，避免与消息重复 */
      badgeNotifyText: homeMessagesQuickBadgeText(c),
      badgeStudentReviewText: studentReviewMenuBadgeText(c),
    }, () => {
      this.applyPrimarySlots();
    });
  },

  applyPrimarySlots() {
    const { canPrimaryRoom, canPrimaryStudentReview, canPrimaryCageShelf, badgeStudentReviewText } = this.data;
    const slots = [];
    if (canPrimaryRoom) {
      slots.push({
        id: 'room',
        title: '房间',
        iconSrc: ICON_ROOM,
      });
    } else {
      slots.push({ id: 'slot1', title: '预留位', placeholder: true });
    }
    if (canPrimaryStudentReview) {
      slots.push({
        id: 'studentReview',
        title: '学生审核',
        iconSrc: ICON_STUDENT_REVIEW,
        badge: badgeStudentReviewText,
      });
    } else {
      slots.push({ id: 'slot2', title: '预留位', placeholder: true });
    }
    if (canPrimaryCageShelf) {
      slots.push({
        id: 'cage',
        title: '笼架',
        iconSrc: ICON_CAGE,
      });
    } else {
      slots.push({ id: 'slot3', title: '预留位', placeholder: true });
    }
    this.setData({ primarySlots: slots });
  },

  onPrimarySlotTap(e) {
    const id = e.currentTarget.dataset.id;
    if (id === 'room') {
      this.goRoom();
      return;
    }
    if (id === 'studentReview') {
      this.goStudentReview();
      return;
    }
    if (id === 'cage') {
      this.goCageShelf();
    }
  },

  goRoom() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.canShowMiniEntry('tabbar', '/pages/room/index', role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.switchTab({ url: '/pages/room/index' });
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

  goCageShelf() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (!pagePermission.canShowMiniEntry('home', '/package-feature/pages/studentCageShelf/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/studentCageShelf/index' });
  },

  async refreshQuickBadges() {
    if (!wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      this.setData({
        badgeRepairText: '',
        badgePurchaseText: '',
        badgeSuppliesText: '',
        badgeNotifyText: '',
        badgeStudentReviewText: '',
      }, () => {
        this.applyPrimarySlots();
      });
      return;
    }
    const cached = peekPendingBadges();
    if (cached) this.applyQuickBadgeTexts(cached);
    try {
      const c = await refreshPendingBadges();
      this.applyQuickBadgeTexts(c);
    } catch (e) {
      console.warn('[index] badges', e);
    }
  },

  onNewsTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/package-feature/pages/newsDetail/newsDetail?id=${encodeURIComponent(String(id || ''))}`
    });
  },
  onRoomTap(e) {
    const id = e.currentTarget.dataset.id;
    const room = this.data.recommendedRooms.find((r) => r.id === id);
    wx.showToast({
      title: room ? room.name : '房间',
      icon: 'none',
    });
  },

  /**
   * 快捷入口（首页）：报修 / 采购 / 物资 / 消息。
   * 领用审计仅从「我的」进入，不在首页展示。
   */
  goRepairRequest() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('home', '/package-feature/pages/repairRequest/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/repairRequest/index' });
  },

  goPurchaseRequest() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('home', '/package-feature/pages/purchaseRequest/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/purchaseRequest/index' });
  },

  goSupplies() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const canMall =
      hasMinRole(role, 'ADMIN') &&
      pagePermission.canShowMiniEntry('home', '/package-feature/pages/supplies/index', role, 'ADMIN');
    const canMine =
      hasMinRole(role, 'STAFF') &&
      pagePermission.canAccessMiniPage('/package-feature/pages/suppliesMine/index', role, 'STAFF');
    if (canMall) {
      wx.navigateTo({ url: '/package-feature/pages/supplies/index' });
      return;
    }
    if (canMine) {
      wx.navigateTo({ url: '/package-feature/pages/suppliesMine/index' });
      return;
    }
    wx.showToast({ title: '无权限', icon: 'none' });
  },

  goNotifications() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canShowMiniEntry('home', '/package-feature/pages/notifications/index', role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (!this.data.isStudentView && hasMinRole(role || '', 'STAFF')) {
      wx.navigateTo({ url: '/package-feature/pages/staffChatHub/index' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/notifications/index' });
  },

  onHelpTap() {
    wx.navigateTo({
      url: `/package-feature/pages/allnews/allnews`
    });
  },

  startPresenceRealtime: function () {
    var self = this;
    if (!wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      self._presenceInitialized = false;
      self.setData({ presenceLoading: false });
      return;
    }
    // 首次进入展示 loading；回到首页静默拉取 — post-save-no-full-refresh.mdc
    self.loadPresenceStatus(!self._presenceInitialized);
    self.startPresenceTick();
    if (!self._presenceSocket) {
      self._presenceSocket = createStudentPresenceSocket({
        onPresenceRefresh: function () {
          if (!self._indexAlive) return;
          self.loadPresenceStatus(false);
        },
        onStatusChange: function (status) {
          if (!self._indexAlive) return;
          self.setData({ presenceWsConnected: !!(status && status.connected) });
        },
      });
      self._presenceSocket.connect();
    } else if (
      typeof self._presenceSocket.isConnected === 'function'
      && !self._presenceSocket.isConnected()
    ) {
      self._presenceSocket.connect();
    }
  },

  stopPresenceRealtime: function () {
    this.stopPresenceTick();
    if (this._presenceSocket) {
      this._presenceSocket.disconnect();
      this._presenceSocket = null;
    }
    this._presenceInitialized = false;
    this._announcementsLoaded = false;
    this.setData({ presenceWsConnected: false });
  },

  startPresenceTick: function () {
    var self = this;
    self.stopPresenceTick();
    self._presenceTickTimer = setInterval(function () {
      if (!self._indexAlive) return;
      if (!self._presenceRaw) return;
      var now = Date.now();
      var snap = buildPresenceFromDashboard(
        self._presenceDash,
        decorateExemptStatus(self._presenceExempt, now),
        now,
      );
      self._presenceRaw = snap;
      self.applyPresenceSnapshot(snap);
    }, 1000);
  },

  stopPresenceTick: function () {
    if (this._presenceTickTimer) {
      clearInterval(this._presenceTickTimer);
      this._presenceTickTimer = null;
    }
  },

  /**
   * 加载进出状态 — 与 H5 useMobilePresenceStatus 同接口
   */
  loadPresenceStatus: function (showLoading) {
    var self = this;
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    if (!token) {
      self.setData({ presenceLoading: false });
      return;
    }
    if (showLoading) {
      self.setData({ presenceLoading: true });
    }
    var hadLoading = !!showLoading;

    Promise.all([
      springAuth.springRequest({
        url: '/api/student/mobile/room-dashboard',
        method: 'GET',
        data: {},
      }),
      springAuth.springRequest({
        url: '/api/student/mobile/exempt-status',
        method: 'GET',
        data: {},
      }),
    ]).then(function (results) {
      if (!self._indexAlive) return;
      var dashRes = results[0];
      var exemptRes = results[1];

      var dashBody = dashRes && dashRes.statusCode === 200
        ? (typeof dashRes.data === 'string' ? JSON.parse(dashRes.data) : dashRes.data)
        : null;
      var exemptBody = exemptRes && exemptRes.statusCode === 200
        ? (typeof exemptRes.data === 'string' ? JSON.parse(exemptRes.data) : exemptRes.data)
        : null;

      if (!dashBody || !dashBody.success || !dashBody.data) return;

      var dash = dashBody.data;
      var exempt = exemptBody && exemptBody.success ? exemptBody.data : null;
      self._presenceDash = dash;
      self._presenceExempt = exempt;
      var snap = buildPresenceFromDashboard(dash, exempt);
      self._presenceRaw = snap;
      self.applyPresenceSnapshot(snap);
    }).catch(function (err) {
      console.warn('[index] presence status', err);
    }).finally(function () {
      self._presenceInitialized = true;
      if (!self._indexAlive) return;
      if (hadLoading) {
        self.setData({ presenceLoading: false });
      }
    });
  },

  applyPresenceSnapshot: function (snap) {
    if (!this._indexAlive) return;
    var vm = buildPresenceViewModel(snap);
    if (vm.loading) return;
    this.setData(vm);
  },

  /** 首页公告通知 — 扫码弹窗公告（与 admin student-violations 同源），最多 4 条 */
  loadStudentAnnouncements: function (showLoading) {
    var self = this;
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    if (!token) return;
    if (showLoading) {
      self.setData({ studentAnnouncementsLoading: true });
    }
    studentAlerts.fetchStudentAlerts().then(function (data) {
      if (!self._indexAlive) return;
      var list = studentAlerts.buildHomeBulletinPreviewList(data, 4);
      var patch = { studentAnnouncements: list };
      if (showLoading) {
        patch.studentAnnouncementsLoading = false;
      }
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      self.setData(patch);
      self.applyStudentNotifyBadge(data);
    }).catch(function (err) {
      console.warn('[index] bulletins', err);
      if (showLoading && self._indexAlive) {
        self.setData({ studentAnnouncementsLoading: false });
      }
    });
  },

  applyStudentNotifyBadge: function (data) {
    if (!this.data.isStudentView) return;
    var self = this;
    var apply = function (payload) {
      var badge = payload ? studentAlerts.unreadBadgeText(payload) : '';
      var row = (self.data.studentLowerRow || []).map(function (item) {
        if (item.id !== 'notices') return item;
        return Object.assign({}, item, { badge: badge });
      });
      self.setData({ studentLowerRow: row });
    };
    if (data) {
      apply(data);
      return;
    }
    studentAlerts.fetchStudentAlerts().then(apply).catch(function () {
      apply(null);
    });
  },

  onStudentAnnouncementTap: function (e) {
    var id = e.currentTarget.dataset.id;
    var kind = e.currentTarget.dataset.kind;
    if (!id || !kind) return;
    wx.navigateTo({
      url: '/package-feature/pages/homeBulletinDetail/index?id=' + encodeURIComponent(id) + '&kind=' + encodeURIComponent(kind),
    });
  },

  onStudentOpenAllAnnouncements: function () {
    wx.navigateTo({ url: '/package-feature/pages/notifications/index?view=bulletins' });
  },

  /** 访客拦截：未登录时弹提示，返回 true 表示已拦截 */
  _guardLogin: function () {
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    if (!token) {
      wx.showToast({ title: '请登录后使用', icon: 'none' });
      return true;
    }
    return false;
  },

  onStudentUpperTap: function (e) {
    if (this._guardLogin()) return;
    var id = e.currentTarget.dataset.id;
    if (id === 'room') {
      wx.switchTab({ url: '/pages/room/index' });
    } else if (id === 'material') {
      wx.navigateTo({ url: '/package-feature/pages/studentMaterial/index' });
    } else if (id === 'cage') {
      wx.navigateTo({ url: '/package-feature/pages/studentCageShelf/index' });
    }
  },

  onStudentLowerTap: function (e) {
    if (this._guardLogin()) return;
    var id = e.currentTarget.dataset.id;
    if (id === 'records') {
      wx.navigateTo({ url: '/package-feature/pages/studentAccessRecords/index' });
    } else if (id === 'notices') {
      if (isStudentAccount()) {
        wx.navigateTo({ url: '/package-feature/pages/notifications/index' });
      } else {
        wx.navigateTo({ url: '/package-feature/pages/staffChatHub/index' });
      }
    } else if (id === 'group') {
      wx.navigateTo({ url: '/package-feature/pages/studentGroupActivity/index' });
    } else if (id === 'violations') {
      wx.navigateTo({ url: '/package-feature/pages/studentViolations/index' });
    }
  },
});