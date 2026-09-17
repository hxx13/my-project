const springAuth = require('../../utils/springAuth.js');
const { hasMinRole, isStudentAccount } = require('../../utils/roleAccess.js');
const pagePermission = require('../../utils/pagePermission.js');
const { peekPendingBadges, refreshPendingBadges } = require('../../utils/badgeSnapshotStore.js');
const { studentReviewMenuBadgeText } = require('../../utils/pendingBadgeCounts.js');
const { buildCampusFloorTree, buildCampusDisplayList, pickRoomsByCampusFloor, roomPersonCount } = require('../../utils/roomDashboard.js');
const twinScan = require('../../utils/twinScanAnalyze.js');
const mobileScanAccess = require('../../utils/mobileScanRoomAccess.js');
const scanDelayApi = require('../../utils/scanDelayApi.js');
const exemptUtil = require('../../utils/exemptDurationPresets.js');

function parseResponse(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true || !Array.isArray(body.data)) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode || 0})` };
  }
  return { ok: true, rows: body.data };
}

/** 占用率五段色：1 最松 → 5 最紧 */
function occupancyLevel(used, total) {
  if (total <= 0 || used <= 0) return 1;
  const r = used / total;
  if (r <= 0.2) return 1;
  if (r <= 0.4) return 2;
  if (r <= 0.6) return 3;
  if (r <= 0.8) return 4;
  return 5;
}

/**
 * 权限上下文：map=officialRoomId→授权标记（buildScanRoomMap），rooms=授权房列表（按房号兜底匹配），
 * known=权限清单是否可信（analyze 成功才敢断言「无权限」，否则一律照旧不锁）。
 */
function buildPermissionContext(scanRoomMap, analyzeDto) {
  const dto = analyzeDto && analyzeDto.success === true ? analyzeDto : null;
  const rooms = [];
  if (dto) {
    (dto.allowedRooms || []).forEach((r) => rooms.push({ ...r, __flag: 'allowed' }));
    (dto.pendingRooms || []).forEach((r) => rooms.push({ ...r, __flag: 'pending' }));
  }
  return { map: scanRoomMap || new Map(), rooms, known: !!dto };
}

/** 房间卡的授权标记：先按 officialRoomId / 房名精确查，再按房号规则兜底匹配。 */
function findRoomPermission(room, ctx) {
  if (!ctx || !ctx.known) return null;
  const map = ctx.map;
  const rid = String(room.roomId != null ? room.roomId : '').trim();
  if (rid && map && map.size && map.get(rid)) return map.get(rid);
  const name = String(room.roomName || '').trim();
  if (name && map && map.size && map.get(name)) return map.get(name);
  for (let i = 0; i < ctx.rooms.length; i += 1) {
    if (twinScan.overviewMatchesScanRoom(room, ctx.rooms[i])) {
      return ctx.rooms[i].__flag === 'pending' ? { pending: true } : { allowed: true };
    }
  }
  return null;
}

function withRoomPreviewMeta(room, permCtx) {
  const total = Math.max(0, Number(room.totalCapacity || 0));
  const used = Math.max(0, Math.min(total, roomPersonCount(room)));
  const maxDots = 12;
  const shown = total > 0 ? Math.min(total, maxDots) : 0;
  const lit =
    total <= 0 || shown <= 0 ? 0 : Math.min(shown, Math.max(0, Math.round((used * shown) / total)));
  const lev = occupancyLevel(used, total);
  const dots = [];
  for (let i = 0; i < shown; i += 1) {
    dots.push({
      used: i < lit,
      colorClass: i < lit ? `dot-l${lev}` : 'dot-free',
    });
  }
  const roomName = String(room.roomName || '');
  const splitIdx = roomName.indexOf('-');
  const shortName = splitIdx >= 0 ? roomName.slice(splitIdx + 1) : roomName;
  const label = shortName || roomName || '未知房间';
  const len = label.length;
  let nameFontRpx = Math.max(14, Math.min(28, Math.floor(248 / Math.max(len * 0.9, 3))));
  const estNameWidth = len * nameFontRpx * 0.88;
  const nameBudgetRpx = 248;
  let nameScale = 1;
  if (estNameWidth > nameBudgetRpx) {
    nameScale = Math.max(0.55, nameBudgetRpx / estNameWidth);
    nameScale = Math.round(nameScale * 1000) / 1000;
  }
  const dotGapRpx = shown > 10 ? 5 : shown > 7 ? 6 : 8;

  // 单个房间卡的权限标记
  let permissionKey = '';
  let permissionBadge = '';
  const info = findRoomPermission(room, permCtx);
  if (info) {
    if (info.disabled) {
      permissionKey = 'banned';
      permissionBadge = '禁用';
    } else if (info.pending) {
      permissionKey = 'pending';
      permissionBadge = '待激活';
    } else if (info.allowed) {
      permissionKey = 'allowed';
      permissionBadge = '可进入';
    }
  } else if (permCtx && permCtx.known) {
    permissionKey = 'none';
    permissionBadge = '无权限';
  }

  return {
    ...room,
    shortName: label,
    dotList: dots,
    nameFontRpx,
    nameScale,
    dotGapRpx,
    usedCount: used,
    capacityTotal: total,
    permissionKey,
    permissionBadge,
    roomLocked: permissionKey === 'none' || permissionKey === 'banned',
  };
}

function entryTypeLabel(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'OWN_CARD') return '自带卡';
  return '公用卡';
}

function buildDetailRoom(room) {
  const total = Math.max(0, Number(room.totalCapacity || 0));
  const remaining = Math.max(0, Number(room.remainingCards || 0));
  const occ = Array.isArray(room.occupants) ? room.occupants : [];
  const fallback = total > 0 ? Math.max(0, Math.min(total, total - remaining)) : 0;
  const currentRoomCount = occ.length > 0 ? occ.length : fallback;
  const occupantRows = occ.map((o) => ({
    userName: o.userName || '未知',
    projectGroup: o.projectGroup || '',
    entryTime: o.entryTime || '—',
    entryTypeLabel: entryTypeLabel(o.entryType),
  }));
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    totalCapacity: total,
    currentRoomCount,
    occupantRows,
  };
}

function formatDelayOption(opt) {
  const parts = [];
  const timeRule = exemptUtil.formatExemptTimeRule(opt.extendUntilTime, opt.durationMinutes);
  if (timeRule !== '—') parts.push(timeRule);
  if (opt.exemptMode) parts.push(String(opt.exemptMode));
  return {
    id: opt.id,
    optionLabel: opt.optionLabel || '',
    requireApproval: !!opt.requireApproval,
    hint: parts.join(' · '),
    reviewerUserIds: Array.isArray(opt.reviewerUserIds) ? opt.reviewerUserIds : [],
  };
}

function buildScanRoomMap(dto) {
  const map = new Map();
  if (!dto || dto.success !== true) return map;
  const pushRoom = (list, flags) => {
    if (!Array.isArray(list)) return;
    list.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      const rid = String(r.officialRoomId != null ? r.officialRoomId : r.id != null ? r.id : '').trim();
      const name = String(r.displayName || r.officialRoomName || r.name || '').trim();
      if (!rid && !name) return;
      const key = rid || name;
      const existing = map.get(key) || {};
      map.set(key, { ...existing, ...flags });
    });
  };
  pushRoom(dto.allowedRooms, { allowed: true });
  pushRoom(dto.pendingRooms, { pending: true });
  const disabled = Array.isArray(dto.allowedRooms)
    ? dto.allowedRooms.filter((r) => r && r.isDisabled === true)
    : [];
  pushRoom(disabled, { disabled: true, allowed: false });
  return map;
}

Page({
  data: {
    loading: false,
    panelRefreshing: false,   // 右侧房间列表的下拉刷新指示（scroll-view 原生 refresher 用）
    allRooms: [],
    campusTree: [],
    campusDisplayList: [],
    expandedMap: {
      浦东: true,
      浦西: false,
    },
    selectedView: 'mine',
    selectedCampus: '',
    selectedFloor: '',
    currentRooms: [],
    myRoomsMeta: [],
    permissionKey: 'none',
    permissionBadgeText: '无权限',
    showDetail: false,
    detailRoom: null,
    scanDelayEnabled: false,
    scanDelayButtonLabel: '延迟',
    showDelayPanel: false,
    delayOptions: [],
    activeDelayOptionId: null,
    delaySubmitting: false,
    delayStatus: 'none',       // none | pending | approved
    delayApprovedLabel: '',
    subjectUserId: '',
    // 移动端自助进入（只做进入，离开仍走自动签退链路）
    mobileEnterEnabled: false,
    alreadyInside: false,
    showEnterConfirm: false,
    enterSubmitting: false,
    autoExitSeconds: 0,
    autoExitMinutes: '0',
    autoExitSecondsText: '00',
    exemptExpireAt: '',
    showAuditEntry: false,
    showStudentReviewEntry: false,
    badgeStudentReviewText: '',
    // 进出状态指示灯
    presencePhase: '',
    presenceLabel: '',
  },

  PRESENCE_COLORS: {
    inside:             { accent: '#16a34a', soft: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    pending_activation: { accent: '#d97706', soft: '#fffbeb', border: '#fde68a', text: '#92400e' },
    pending_leave:      { accent: '#dc2626', soft: '#fef2f2', border: '#fecaca', text: '#991b1b' },
    outside:            { accent: '#6b7280', soft: '#f9fafb', border: '#e5e7eb', text: '#4b5563' },
    unknown:            { accent: '#d97706', soft: '#fffbeb', border: '#fde68a', text: '#92400e' },
  },

  async onShow() {
    try {
      await pagePermission.refreshMiniPermissions();
    } catch (e) {
      /* 权限缓存不可用时按角色降级 */
    }
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    this.setData({
      showAuditEntry: hasMinRole(role, 'SENIOR'),
      showStudentReviewEntry: pagePermission.canShowMiniEntry(
        'mine',
        '/package-feature/pages/studentReviewHub/index',
        role,
        'ADMIN'
      ),
    });
    void this.refreshStudentReviewBadge();
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
    // 学生视角加载进出状态指示灯
    if (isStudentAccount()) {
      this.loadPresenceStatus();
    }
    if (!this._loadedOnce) {
      this.loadRooms();
    }
  },

  async refreshStudentReviewBadge() {
    if (!this.data.showStudentReviewEntry) {
      this.setData({ badgeStudentReviewText: '' });
      return;
    }
    const cached = peekPendingBadges();
    if (cached) {
      this.setData({ badgeStudentReviewText: studentReviewMenuBadgeText(cached) });
    }
    try {
      const c = await refreshPendingBadges();
      if (c) {
        this.setData({ badgeStudentReviewText: studentReviewMenuBadgeText(c) });
      }
    } catch (e) {
      /* ignore */
    }
  },

  /**
   * 房间列表下拉刷新：走 scroll-view 原生 refresher。
   *
   * 以前是页面级 onPullDownRefresh —— 它没有阈值可调，而本页自己也完全不滚
   * （滚动分别发生在左侧校区树和右侧房间列表两个 scroll-view 里），
   * 于是在页面任意位置稍微一拖就开始把整页往下拽，手感就是「太敏感」。
   * 原生 refresher 只在右侧列表拉到顶再多拉一段时才触发，且只让列表动。
   * silent: true —— 不弹全屏 mask（loading 字段只做重入守卫，不参与模板），列表不闪。
   */
  onPanelRefresher() {
    this.setData({ panelRefreshing: true });
    this.refreshRoomPage({ silent: true, preserveSelection: true })
      .finally(() => this.setData({ panelRefreshing: false }));
  },

  loadRooms(options) {
    return this.refreshRoomPage(options);
  },

  async refreshRoomPage(options) {
    const opts = options || {};
    const silent = !!opts.silent;
    const preserveSelection = !!opts.preserveSelection;
    if (this.data.loading) return;
    this.setData({ loading: true });
    if (!silent) wx.showLoading({ title: '加载中…', mask: true });

    const userId = twinScan.readSpringUserId();

    try {
      const overviewP = springAuth.springRequest({
        url: '/api/v1/twin/dashboard/wechat-overview',
        method: 'GET',
        data: {},
      });
      const analyzeP = userId
        ? springAuth
            .springRequest({
              url: '/api/v1/twin/scan/analyze',
              method: 'GET',
              data: { userId },
            })
            .catch(() => ({ statusCode: 0, data: null }))
        : Promise.resolve({ statusCode: 0, data: null });
      const [overviewRes, analyzeRes] = await Promise.all([overviewP, analyzeP]);

      const parsed = parseResponse(overviewRes);
      if (!parsed.ok) throw new Error(parsed.message);

      let parsedAnalyze = { ok: false, dto: null, httpOk: false, envelopeOk: false, message: '' };
      if (userId && analyzeRes) {
        parsedAnalyze = twinScan.parseAnalyzeResult(analyzeRes);
      }

      const badge = twinScan.computePermissionBadge({ userId, parsedAnalyze });
      const scanAnalyze = mobileScanAccess.normalizeMobileScanAnalyze(parsedAnalyze.dto);
      const dtoForMerge =
        parsedAnalyze.dto && parsedAnalyze.dto.success === true ? parsedAnalyze.dto : null;
      const scanRoomMap = buildScanRoomMap(dtoForMerge);
      const permCtx = buildPermissionContext(scanRoomMap, parsedAnalyze.dto);
      const myMeta = twinScan.buildMyRooms(parsed.rows, dtoForMerge).map((r) => withRoomPreviewMeta(r, permCtx));

      const campusTree = buildCampusFloorTree(parsed.rows);
      const expandedMap = { ...this.data.expandedMap };

      let selView = this.data.selectedView === 'campus' ? 'campus' : 'mine';
      if (!preserveSelection) {
        selView = 'mine';
      }

      let selCampus = this.data.selectedCampus;
      let selFloor = this.data.selectedFloor;

      if (selView === 'campus') {
        if (preserveSelection && selCampus && selFloor) {
          const node = campusTree.find((x) => x.campus === selCampus);
          const ok = node && node.floors.some((f) => f.floor === selFloor);
          if (!ok) {
            const d = this.resolveDefaultSelection(campusTree);
            selCampus = d.campus;
            selFloor = d.floor;
          }
        } else if (!preserveSelection) {
          const d = this.resolveDefaultSelection(campusTree);
          selCampus = d.campus;
          selFloor = d.floor;
        }
      }

      const campusDisplayList = buildCampusDisplayList(campusTree, expandedMap);
      const campusRooms = pickRoomsByCampusFloor(parsed.rows, selCampus, selFloor).map((r) => withRoomPreviewMeta(r, permCtx));
      const listForView = selView === 'mine' ? myMeta : campusRooms;
      const autoExitSec = Math.max(
        0,
        Number((parsedAnalyze.dto && parsedAnalyze.dto.autoSignoutSecondsRemaining) || 0) || 0
      );

      const patch = {
        allRooms: parsed.rows,
        campusTree,
        campusDisplayList,
        selectedView: selView,
        selectedCampus: selCampus,
        selectedFloor: selFloor,
        currentRooms: listForView,
        myRoomsMeta: myMeta,
        permissionKey: badge.key,
        permissionBadgeText: badge.text,
        scanDelayEnabled: scanAnalyze.scanDelayEnabled,
        scanDelayButtonLabel: scanAnalyze.scanDelayButtonLabel,
        subjectUserId: userId || '',
        mobileEnterEnabled: !!(scanAnalyze && scanAnalyze.mobileEnterEnabled),
        // 已在场内不再展示「进入」（与 H5 MobileRoomDetailDialog 的 alreadyInside 同判据）
        alreadyInside: scanAnalyze.currentState === 'INSIDE',
        autoExitSeconds: autoExitSec,
        autoExitMinutes: String(Math.floor(autoExitSec / 60)),
        autoExitSecondsText: String(autoExitSec % 60).padStart(2, '0'),
      };

      if (this.data.showDetail && this.data.detailRoom && this.data.detailRoom.roomId != null) {
        const rid = this.data.detailRoom.roomId;
        const updated = listForView.find((r) => String(r.roomId) === String(rid));
        if (updated) {
          patch.detailRoom = Object.assign(
            buildDetailRoom(updated),
            this.computeRoomAccess(updated.roomId, scanAnalyze, parsed.rows)
          );
          patch.delayOptions = this.computeDelayOptionsForRoom(updated.roomId, parsed.rows, scanAnalyze);
        }
      }

      this._permCtx = permCtx;
      this._scanAnalyze = scanAnalyze;
      this._overviewRows = parsed.rows;
      this._loadedOnce = true;
      this.setData(patch);
    } catch (err) {
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 18) : '加载失败',
        icon: 'none',
      });
    } finally {
      if (!silent) wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  resolveDefaultSelection(campusTree) {
    const preferCampus = ['浦东', '浦西'];
    for (let i = 0; i < preferCampus.length; i += 1) {
      const c = preferCampus[i];
      const node = campusTree.find((x) => x.campus === c);
      if (node && node.floors && node.floors.length) {
        return { campus: c, floor: node.floors[0].floor };
      }
    }
    if (campusTree.length && campusTree[0].floors.length) {
      return { campus: campusTree[0].campus, floor: campusTree[0].floors[0].floor };
    }
    return { campus: '浦东', floor: '' };
  },

  onMineTap() {
    const permCtx = this._permCtx || null;
    const myRooms = (this.data.myRoomsMeta || []).map((r) => withRoomPreviewMeta(r, permCtx));
    this.setData({
      selectedView: 'mine',
      selectedCampus: '',
      selectedFloor: '',
      currentRooms: myRooms,
    });
  },

  onCampusToggle(e) {
    const campus = e.currentTarget.dataset.campus;
    if (!campus) return;
    const expandedMap = { ...this.data.expandedMap, [campus]: !this.data.expandedMap[campus] };
    const campusDisplayList = buildCampusDisplayList(this.data.campusTree, expandedMap);
    this.setData({ expandedMap, campusDisplayList });
  },

  onFloorTap(e) {
    const campus = e.currentTarget.dataset.campus;
    const floor = e.currentTarget.dataset.floor;
    if (!campus || !floor) return;
    const rooms = pickRoomsByCampusFloor(this.data.allRooms, campus, floor).map((r) =>
      withRoomPreviewMeta(r, this._permCtx)
    );
    this.setData({
      selectedView: 'campus',
      selectedCampus: campus,
      selectedFloor: floor,
      currentRooms: rooms,
    });
  },

  computeDelayOptionsForRoom(roomId, overviewRows, scanAnalyze) {
    const analyze = scanAnalyze || this._scanAnalyze;
    const rows = overviewRows || this._overviewRows || this.data.allRooms || [];
    if (!analyze || !analyze.scanDelayEnabled || !roomId) return [];
    const overviewIndex = mobileScanAccess.buildOverviewIndex(rows);
    const scanId = mobileScanAccess.resolveScanOfficialRoomId(roomId, overviewIndex, analyze);
    if (!scanId) return [];
    return mobileScanAccess.getRoomDelayOptions(analyze, scanId).map(formatDelayOption);
  },

  /** 将 overview roomId（room_config PK）解析为扫码系统的 officialRoomId，用于延迟 API 调用 */
  resolveDelayRoomId(overviewRoomId) {
    const analyze = this._scanAnalyze;
    const rows = this._overviewRows || this.data.allRooms || [];
    if (!analyze || !overviewRoomId) return String(overviewRoomId);
    const overviewIndex = mobileScanAccess.buildOverviewIndex(rows);
    const scanId = mobileScanAccess.resolveScanOfficialRoomId(overviewRoomId, overviewIndex, analyze);
    return scanId || String(overviewRoomId);
  },

  /**
   * 房间可进入判定（与 H5 evaluateMobileRoomAccess.enterable 同判据）。
   * 复用 resolveDelayRoomId 同一条「overview → scanRoom」查找路径，不另造匹配规则。
   */
  computeRoomAccess(roomId, scanAnalyze, overviewRows) {
    const analyze = scanAnalyze || this._scanAnalyze;
    const rows = overviewRows || this._overviewRows || this.data.allRooms || [];
    if (!analyze || !roomId) return { enterable: false, enterBlockReason: '无权限' };
    const overviewIndex = mobileScanAccess.buildOverviewIndex(rows);
    const scanId = mobileScanAccess.resolveScanOfficialRoomId(roomId, overviewIndex, analyze);
    if (!scanId) return { enterable: false, enterBlockReason: '无权限' };
    const scanRoom = mobileScanAccess.findScanRoomByOfficialId(analyze, scanId);
    const overviewRow = rows.find((r) => String(r.roomId) === String(roomId)) || null;
    const enterable = mobileScanAccess.isRoomEnterable(scanRoom, analyze, overviewRow);
    return {
      enterable,
      enterBlockReason: enterable
        ? ''
        : mobileScanAccess.getRoomEnterBlockReason(scanRoom, analyze, overviewRow),
    };
  },

  onRoomTap(e) {
    const id = e.currentTarget.dataset.id;
    const room = this.data.currentRooms.find((r) => String(r.roomId) === String(id));
    if (!room) return;
    if (room.roomLocked) {
      wx.showToast({ title: '该房间无进入权限', icon: 'none' });
      return;
    }
    const delayOptions = this.computeDelayOptionsForRoom(room.roomId);
    this.setData({
      showDetail: true,
      detailRoom: Object.assign(buildDetailRoom(room), this.computeRoomAccess(room.roomId)),
      showDelayPanel: false,
      activeDelayOptionId: null,
      delaySubmitting: false,
      delayOptions,
      delayStatus: 'none',
      delayApprovedLabel: '',
      showEnterConfirm: false,
      enterSubmitting: false,
    });
    this.refreshDelayStatus(room.roomId);
  },

  /** 查询该房间的活跃延迟申请状态 */
  async refreshDelayStatus(roomId) {
    const subjectUserId = this.data.subjectUserId;
    if (!roomId || !subjectUserId) return;
    const scanId = this.resolveDelayRoomId(roomId);
    try {
      const data = await scanDelayApi.fetchMyActiveDelayRequests(scanId, subjectUserId);
      if (data.hasApproved) {
        const approved = (data.requests || []).find((r) => r.status === 'APPROVED');
        this.setData({
          delayStatus: 'approved',
          delayApprovedLabel: (approved && approved.optionLabel) || '',
          exemptExpireAt:
            approved && approved.expireAt ? String(approved.expireAt).slice(11, 16) : '',
        });
      } else if (data.hasPending) {
        this.setData({ delayStatus: 'pending', delayApprovedLabel: '', exemptExpireAt: '' });
      } else {
        this.setData({ delayStatus: 'none', delayApprovedLabel: '', exemptExpireAt: '' });
      }
    } catch (_) {
      // 查询失败不改变状态
    }
  },

  closeDetail() {
    const patch = {
      showDetail: false,
      detailRoom: null,
      showDelayPanel: false,
      activeDelayOptionId: null,
      delaySubmitting: false,
      delayOptions: [],
      showEnterConfirm: false,
      enterSubmitting: false,
      exemptExpireAt: '',
    };
    if (this.data.selectedView === 'mine') {
      patch.currentRooms = this.data.myRoomsMeta || [];
    }
    this.setData(patch);
  },

  /* ─────────── 移动端自助进入（只做进入；离开仍由自动签退链路负责） ─────────── */

  onEnterTap() {
    const d = this.data.detailRoom || {};
    if (!d.enterable) {
      wx.showToast({
        title: d.enterBlockReason ? '无法进入：' + d.enterBlockReason : '该房间当前不可进入',
        icon: 'none',
      });
      return;
    }
    this.setData({ showEnterConfirm: true });
  },

  onEnterCancel() {
    if (this.data.enterSubmitting) return;
    this.setData({ showEnterConfirm: false });
  },

  /** 仅用于确认卡片的 catchtap：拦住冒泡，避免点卡片正文误关确认框 */
  onEnterNoop() {},

  async onEnterConfirm() {
    const detail = this.data.detailRoom;
    const userId = this.data.subjectUserId;
    if (!detail || !userId || this.data.enterSubmitting) return;
    this.setData({ enterSubmitting: true });
    try {
      const scanId = this.resolveDelayRoomId(String(detail.roomId)) || String(detail.roomId);
      const res = await springAuth.springRequest({
        url: '/api/v1/twin/scan/execute',
        method: 'POST',
        data: {
          userId,
          roomId: scanId,
          action: 'ENTER',
          isSharedCard: false,
          isKeepCard: false,
          isBorrowedCard: false,
          clientKind: 'MOBILE_ROOM',
        },
      });
      let body = res && res.data;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          body = null;
        }
      }
      // 写请求必须查 success：HTTP 200 + success:false 是业务失败，不查会把「被拦」显示成「成功」
      const inner = body && body.data && typeof body.data === 'object' ? body.data : null;
      if (!body || body.success !== true || (inner && inner.success === false)) {
        throw new Error(
          (inner && (inner.message || inner.msg)) || (body && (body.message || body.msg)) || '进入失败'
        );
      }
      wx.showToast({ title: '已进入', icon: 'success' });
      this.setData({ showEnterConfirm: false });
      await this.refreshRoomPage({ silent: true, preserveSelection: true });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '进入失败', icon: 'none' });
    } finally {
      this.setData({ enterSubmitting: false });
    }
  },

  toggleDelayPanel() {
    this.setData({
      showDelayPanel: !this.data.showDelayPanel,
      activeDelayOptionId: null,
    });
  },

  onDelayOptionTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    const next = this.data.activeDelayOptionId === id ? null : id;
    this.setData({ activeDelayOptionId: next });
  },

  onDelayCancel() {
    this.setData({ activeDelayOptionId: null });
  },

  async onDelayConfirm(e) {
    const optionId = Number(e.currentTarget.dataset.id);
    const opt = (this.data.delayOptions || []).find((o) => Number(o.id) === optionId);
    const detail = this.data.detailRoom;
    const subjectUserId = this.data.subjectUserId;
    if (!opt || !detail || !subjectUserId || this.data.delaySubmitting) return;

    if (opt.requireApproval && (!opt.reviewerUserIds || !opt.reviewerUserIds.length)) {
      wx.showToast({ title: '该规则未配置审核教职工', icon: 'none' });
      return;
    }

    this.setData({ delaySubmitting: true });
    try {
      const scanId = this.resolveDelayRoomId(String(detail.roomId));
      const res = await scanDelayApi.submitScanDelayRequest({
        subjectUserId,
        roomId: scanId,
        optionId: opt.id,
      });
      const msg =
        res && res.status === 'PENDING'
          ? (res.message || '已提交申请，等待确认')
          : (res && res.message) || '已授权';
      wx.showToast({ title: msg, icon: 'success' });
      const nextStatus = res && res.status === 'PENDING' ? 'pending' : 'approved';
      this.setData({
        showDelayPanel: false,
        activeDelayOptionId: null,
        delayStatus: nextStatus,
        delayApprovedLabel: nextStatus === 'approved' ? (res.optionLabel || opt.optionLabel) : '',
      });
      // 保存后仅合并当前房间数据，禁止整表 load — post-save-no-full-refresh.mdc
      await this.refreshRoomPage({ silent: true, preserveSelection: true });
    } catch (err) {
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 18) : '操作失败',
        icon: 'none',
      });
    } finally {
      this.setData({ delaySubmitting: false });
    }
  },

  onDahuaIssueTap() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'SENIOR')) {
      wx.showToast({ title: '需要高级员工及以上', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/dahuaIssue/index' });
  },

  onAuditTap() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'SENIOR')) {
      wx.showToast({ title: '需要高级员工及以上', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/roomAudit/index' });
  },

  onStudentReviewTap() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (!pagePermission.canShowMiniEntry('mine', '/package-feature/pages/studentReviewHub/index', role, 'ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/studentReviewHub/index' });
  },

  /** 学生视角：加载进出状态指示灯（与首页 presence 逻辑一致） */
  loadPresenceStatus() {
    const self = this;
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    if (!token) return;

    springAuth.springRequest({
      url: '/api/student/mobile/room-dashboard',
      method: 'GET',
      data: {},
    }).then((res) => {
      const body = res && res.statusCode === 200
        ? (typeof res.data === 'string' ? JSON.parse(res.data) : res.data)
        : null;
      if (!body || !body.success || !body.data) return;
      const dash = body.data;
      const analyze = dash.analyze || {};
      const overview = dash.overview || [];

      const rawState = (analyze.currentState || 'UNKNOWN').toUpperCase();
      const currentState = (rawState === 'INSIDE' || rawState === 'OUTSIDE') ? rawState : 'UNKNOWN';

      let phase = 'unknown';
      if (currentState === 'INSIDE') {
        const autoState = analyze.autoSignoutState || null;
        if (autoState === 'PENDING_ACTIVATION') phase = 'pending_activation';
        else if (autoState === 'AUTO_EXIT_SCHEDULED') phase = 'pending_leave';
        else phase = 'inside';
      } else if (currentState === 'OUTSIDE') {
        phase = 'outside';
      }

      const labelMap = {
        inside: '已进入',
        pending_activation: '待激活',
        pending_leave: '待离开',
        outside: '已离开',
        unknown: '',
      };

      self.setData({
        presencePhase: phase,
        presenceLabel: labelMap[phase] || '',
      });
    }).catch(() => {});
  },
});
