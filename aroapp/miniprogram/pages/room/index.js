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

function withRoomPreviewMeta(room, scanRoomMap) {
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
  if (scanRoomMap && scanRoomMap.size > 0) {
    const rid = String(room.roomId != null ? room.roomId : '');
    const info = scanRoomMap.get(rid) || scanRoomMap.get(String(room.roomName || '').trim());
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
    }
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
      showStudentReviewEntry:
        hasMinRole(role, 'STAFF') &&
        pagePermission.canShowMiniEntry('mine', '/package-feature/pages/studentReviewHub/index', role, 'STAFF'),
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

  onPullDownRefresh() {
    this.refreshRoomPage({ silent: false, preserveSelection: true }).finally(() => wx.stopPullDownRefresh());
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
      const myRaw = twinScan.mergeMyRooms(parsed.rows, dtoForMerge);
      const myMeta = myRaw.map((r) => withRoomPreviewMeta(r, scanRoomMap));

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
      const campusRooms = pickRoomsByCampusFloor(parsed.rows, selCampus, selFloor).map((r) => withRoomPreviewMeta(r, scanRoomMap));
      const listForView = selView === 'mine' ? myMeta : campusRooms;

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
      };

      if (this.data.showDetail && this.data.detailRoom && this.data.detailRoom.roomId != null) {
        const rid = this.data.detailRoom.roomId;
        const updated = listForView.find((r) => String(r.roomId) === String(rid));
        if (updated) {
          patch.detailRoom = buildDetailRoom(updated);
          patch.delayOptions = this.computeDelayOptionsForRoom(updated.roomId, parsed.rows, scanAnalyze);
        }
      }

      this._scanRoomMap = scanRoomMap;
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
    const scanRoomMap = this._scanRoomMap || null;
    const myRooms = (this.data.myRoomsMeta || []).map((r) => withRoomPreviewMeta(r, scanRoomMap));
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
    const rooms = pickRoomsByCampusFloor(this.data.allRooms, campus, floor).map(withRoomPreviewMeta);
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

  onRoomTap(e) {
    const id = e.currentTarget.dataset.id;
    const room = this.data.currentRooms.find((r) => String(r.roomId) === String(id));
    if (!room) return;
    const delayOptions = this.computeDelayOptionsForRoom(room.roomId);
    this.setData({
      showDetail: true,
      detailRoom: buildDetailRoom(room),
      showDelayPanel: false,
      activeDelayOptionId: null,
      delaySubmitting: false,
      delayOptions,
      delayStatus: 'none',
      delayApprovedLabel: '',
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
        });
      } else if (data.hasPending) {
        this.setData({ delayStatus: 'pending', delayApprovedLabel: '' });
      } else {
        this.setData({ delayStatus: 'none', delayApprovedLabel: '' });
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
    };
    if (this.data.selectedView === 'mine') {
      patch.currentRooms = this.data.myRoomsMeta || [];
    }
    this.setData(patch);
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
