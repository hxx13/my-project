const springAuth = require('../../../utils/springAuth.js');
const exemptUtil = require('../../../utils/exemptDurationPresets.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const { buildAuditCampusDisplayList } = require('../../../utils/roomDashboard.js');

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { _raw: raw };
    }
  }
  return { _raw: String(raw) };
}

function unwrap(res) {
  const statusCode = Number(res && res.statusCode);
  const body = parseBody(res ? res.data : null);
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode || 0})` };
  }
  return { ok: true, data: body.data };
}

function entryTypeLabel(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'OWN_CARD') return '自带卡';
  if (t === 'FOLLOWING') return '结伴';
  if (t === 'BORROWED_CARD') return '公卡';
  return t || '—';
}

function decoratePerson(p) {
  const exemptStatusText = exemptUtil.formatExemptStatus(p);
  const exemptRoomNames = exemptUtil.parseExemptRoomNames(p.freezeExemptRoomIds);
  return {
    ...p,
    entryTypeLabel: entryTypeLabel(p.entryType),
    exemptStatusText,
    exemptRoomNames: exemptRoomNames.length > 0 ? exemptRoomNames.join(', ') : '',
  };
}

function apiCampusesToTree(campuses) {
  return (campuses || []).map((c) => ({
    campus: c.campus,
    floors: (c.floors || []).map((f) => {
      const rawPersons = Array.isArray(f.persons) ? f.persons : [];
      return {
        floor: f.floor,
        floorPersonCount: rawPersons.length,
        persons: rawPersons.map(decoratePerson),
        rooms: Array.isArray(f.rooms)
          ? f.rooms.map((r) => ({
              roomId: r.roomId,
              roomName: r.roomName,
              roomKey: `${r.roomId != null ? r.roomId : ''}_${r.roomName || ''}`,
              persons: (Array.isArray(r.persons) ? r.persons : []).map(decoratePerson),
            }))
          : [],
      };
    }),
  }));
}

function pickRoomGroups(tree, campus, floor) {
  const c = (tree || []).find((x) => x.campus === campus);
  if (!c) return [];
  const fl = (c.floors || []).find((x) => x.floor === floor);
  if (!fl) return [];
  if (Array.isArray(fl.rooms) && fl.rooms.length) {
    const nonempty = fl.rooms.filter((r) => r.persons && r.persons.length > 0);
    if (nonempty.length) return nonempty;
  }
  if (Array.isArray(fl.persons) && fl.persons.length) {
    return [
      {
        roomId: '',
        roomName: '本楼层',
        roomKey: '_legacy_floor',
        persons: fl.persons,
      },
    ];
  }
  return [];
}

function countFloorPersons(roomGroups) {
  if (!roomGroups || !roomGroups.length) return 0;
  return roomGroups.reduce((n, g) => n + (g.persons && g.persons.length ? g.persons.length : 0), 0);
}

function resolveDefaultSelection(campuses) {
  const preferCampus = ['浦东', '浦西'];
  for (let i = 0; i < preferCampus.length; i += 1) {
    const c = preferCampus[i];
    const node = (campuses || []).find((x) => x.campus === c);
    if (node && node.floors && node.floors.length) {
      return { campus: c, floor: node.floors[0].floor };
    }
  }
  if (campuses && campuses.length && campuses[0].floors && campuses[0].floors.length) {
    return { campus: campuses[0].campus, floor: campuses[0].floors[0].floor };
  }
  return { campus: '', floor: '' };
}

function defaultExpandedMap() {
  return { 浦东: true, 浦西: false };
}

function filterPersonsByExempt(persons, exemptFilter) {
  if (!exemptFilter || exemptFilter === 'all') return persons;
  return persons.filter(function (p) {
    const isExempt = Number(p.freezeExemptFlag) === 1;
    return exemptFilter === 'exempt' ? isExempt : !isExempt;
  });
}

function applyExemptFilterToRoomGroups(roomGroups, exemptFilter) {
  return (roomGroups || []).map(function (room) {
    return Object.assign({}, room, {
      persons: filterPersonsByExempt(room.persons || [], exemptFilter),
    });
  });
}

Page({
  data: {
    loading: false,
    listRefreshing: false,
    auditCampusTree: [],
    campusDisplayList: [],
    expandedMap: {},
    selectedCampus: '',
    selectedFloor: '',
    currentRoomGroups: [],
    roomPersonTotal: 0,
    showBindPopup: false,
    bindUserId: '',
    bindUserName: '',
    bindCardNo: '',
    bindDahuaSeq: '',
    canGrantExempt: false,
    exemptPanelShow: false,
    exemptPanelCardNo: '',
    exemptPanelUserName: '',
    exemptPanelAroUserId: '',
    exemptSubmitting: false,
    exemptFilter: 'all',
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    this.setData({ canGrantExempt: hasMinRole(role, 'ADMIN') });
    if (!hasMinRole(role, 'SENIOR')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    this._allowed = true;
    this._auditFirstLoad = true;
    this.refreshAll({ silent: false });
  },

  onShow() {
    if (!this._allowed) return;
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'SENIOR')) {
      wx.navigateBack();
      return;
    }
    const tabBar = this.selectComponent('#room-audit-tabbar');
    if (tabBar && typeof tabBar.refreshTabs === 'function') {
      tabBar.refreshTabs();
    }
  },

  onUnload() {
    if (this._manualExitRefreshTimer) {
      clearTimeout(this._manualExitRefreshTimer);
      this._manualExitRefreshTimer = null;
    }
  },

  async refreshAll(options) {
    const silent = !!(options && options.silent);
    if (!this._allowed) return;
    this.setData({ loading: true });
    if (!silent) wx.showLoading({ title: '加载中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/v1/twin/audit/pending-by-floor',
        method: 'GET',
        data: {},
      });
      const parsed = unwrap(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const rawCampuses = Array.isArray(parsed.data.campuses) ? parsed.data.campuses : [];
      const campusTree = apiCampusesToTree(rawCampuses);

      const firstEver = !!this._auditFirstLoad;
      this._auditFirstLoad = false;

      let expandedMap = { ...this.data.expandedMap };
      if (firstEver || Object.keys(expandedMap).length === 0) {
        expandedMap = defaultExpandedMap();
      } else {
        if (expandedMap['浦东'] === undefined) expandedMap['浦东'] = true;
        if (expandedMap['浦西'] === undefined) expandedMap['浦西'] = false;
      }

      const campusDisplayList = buildAuditCampusDisplayList(campusTree, expandedMap);

      let selCampus = this.data.selectedCampus;
      let selFloor = this.data.selectedFloor;

      if (firstEver) {
        const d = resolveDefaultSelection(rawCampuses);
        selCampus = d.campus;
        selFloor = d.floor;
      } else if (selCampus && selFloor) {
        const node = campusTree.find((x) => x.campus === selCampus);
        const floorOk = node && (node.floors || []).some((f) => f.floor === selFloor);
        if (!node || !floorOk) {
          const d = resolveDefaultSelection(rawCampuses);
          selCampus = d.campus;
          selFloor = d.floor;
        }
      } else {
        const d = resolveDefaultSelection(rawCampuses);
        selCampus = d.campus;
        selFloor = d.floor;
      }

      let currentRoomGroups =
        selCampus && selFloor ? pickRoomGroups(campusTree, selCampus, selFloor) : [];
      currentRoomGroups = applyExemptFilterToRoomGroups(currentRoomGroups, this.data.exemptFilter);
      const roomPersonTotal = countFloorPersons(currentRoomGroups);

      this.setData({
        auditCampusTree: campusTree,
        campusDisplayList,
        expandedMap,
        selectedCampus: selCampus,
        selectedFloor: selFloor,
        currentRoomGroups,
        roomPersonTotal,
      });
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '加载失败', icon: 'none' });
    } finally {
      if (!silent) wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  onCampusToggle(e) {
    const campus = e.currentTarget.dataset.campus;
    if (!campus) return;
    const expandedMap = { ...this.data.expandedMap, [campus]: !this.data.expandedMap[campus] };
    const campusDisplayList = buildAuditCampusDisplayList(this.data.auditCampusTree, expandedMap);
    this.setData({ expandedMap, campusDisplayList });
  },

  onFloorTap(e) {
    const campus = e.currentTarget.dataset.campus;
    const floor = e.currentTarget.dataset.floor;
    if (!campus || !floor) return;
    let currentRoomGroups = pickRoomGroups(this.data.auditCampusTree, campus, floor);
    currentRoomGroups = applyExemptFilterToRoomGroups(currentRoomGroups, this.data.exemptFilter);
    const roomPersonTotal = countFloorPersons(currentRoomGroups);
    this.setData({
      selectedCampus: campus,
      selectedFloor: floor,
      currentRoomGroups,
      roomPersonTotal,
    });
  },

  onListRefresh() {
    this.setData({ listRefreshing: true });
    this.refreshAll({ silent: true })
      .finally(() => {
        this.setData({ listRefreshing: false });
      });
  },

  onExemptFilterTap(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!filter || filter === this.data.exemptFilter) return;
    const { auditCampusTree, selectedCampus, selectedFloor } = this.data;
    let currentRoomGroups =
      selectedCampus && selectedFloor
        ? pickRoomGroups(auditCampusTree, selectedCampus, selectedFloor)
        : [];
    currentRoomGroups = applyExemptFilterToRoomGroups(currentRoomGroups, filter);
    this.setData({
      exemptFilter: filter,
      currentRoomGroups,
      roomPersonTotal: countFloorPersons(currentRoomGroups),
    });
  },

  fieldDetail(e) {
    const d = e.detail;
    if (typeof d === 'string') return d;
    if (d && d.value != null) return String(d.value);
    return '';
  },

  onToggleFreeze(e) {
    const ds = e.currentTarget.dataset || {};
    const cardNo = ds.cardno;
    const status = ds.status;
    if (!cardNo || !status) return;
    const title = status === 'FROZEN' ? '确认冻结卡片' : '确认解冻卡片';
    wx.showModal({
      title,
      content: `卡号 ${cardNo}`,
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: '/api/v1/twin/mappings/status',
            method: 'POST',
            data: { cardNo, status },
          });
          const parsed = unwrap(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已更新', icon: 'success' });
          await this.refreshAll({ silent: true });
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  async onToggleExempt(e) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '需要管理员权限', icon: 'none' });
      return;
    }
    const ds = e.currentTarget.dataset || {};
    const cardNo = ds.cardno;
    const flag = Number(ds.flag);
    const aroUserId = ds.arouserid || ds.aroUserId;
    const userName = ds.username || '';
    if (!cardNo || Number.isNaN(flag)) return;
    if (flag === 0) {
      wx.showModal({
        title: '取消免冻结',
        content: `卡号 ${cardNo}`,
        success: async (r) => {
          if (!r.confirm) return;
          await this._submitExempt(cardNo, 0);
        },
      });
      return;
    }
    this.setData({
      exemptPanelShow: true,
      exemptPanelCardNo: cardNo,
      exemptPanelUserName: userName,
      exemptPanelAroUserId: aroUserId || '',
    });
  },

  onExemptPanelClose() {
    this.setData({ exemptPanelShow: false });
  },

  async onExemptPanelConfirm(e) {
    const detail = (e && e.detail) || {};
    const { exemptPanelCardNo: cardNo } = this.data;
    if (!cardNo) return;
    this.setData({ exemptSubmitting: true });
    try {
      await this._submitExempt(
        cardNo,
        1,
        detail.durationMinutes,
        detail.mode,
        detail.maxCount,
        detail.roomIds,
        detail.extendUntilTime,
      );
      this.setData({ exemptPanelShow: false });
    } finally {
      this.setData({ exemptSubmitting: false });
    }
  },

  async _submitExempt(cardNo, flag, durationMinutes, mode, maxCount, roomIds, extendUntilTime) {
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      const data = { cardNo, flag, client: 'room-audit-miniapp' };
      if (flag === 1) {
        if (mode) data.mode = mode;
        if (extendUntilTime) data.extendUntilTime = extendUntilTime;
        else if (durationMinutes != null) data.durationMinutes = durationMinutes;
        if (maxCount != null) data.maxCount = maxCount;
        if (roomIds) data.roomIds = roomIds;
      }
      const res = await springAuth.springRequest({
        url: '/api/v1/twin/mappings/exempt',
        method: 'POST',
        data,
      });
      const parsed = unwrap(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: flag === 1 ? '已设豁免' : '已取消', icon: 'success' });
      await this.refreshAll({ silent: true });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onManualExit(e) {
    const ds = e.currentTarget.dataset || {};
    const userId = ds.userid ? String(ds.userid).trim() : '';
    const userName = ds.username ? String(ds.username).trim() : '';
    const roomId = ds.roomid ? String(ds.roomid).trim() : '';
    const roomName = ds.roomname ? String(ds.roomname).trim() : '';
    if (!userId) {
      wx.showToast({ title: '缺少人员信息，无法确认离开', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认离开',
      content: `${userName || userId} 将被登记为离开，是否继续？`,
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '提交中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: '/api/v1/twin/audit/manual-exit',
            method: 'POST',
            data: { userId, userName, roomId, roomName },
          });
          const parsed = unwrap(res);
          if (!parsed.ok) throw new Error(parsed.message);
          const dto = parsed.data || {};
          if (dto && dto.success === false) {
            throw new Error(dto.message || '确认离开失败');
          }
          const msg = dto && dto.message ? String(dto.message) : '已确认其离开';
          wx.showToast({ title: msg.slice(0, 18), icon: 'success' });
          await this.refreshAll({ silent: true });
          // 官方离开流水有短暂落库延迟，再补一次刷新，避免“已离开但列表未更新”
          if (this._manualExitRefreshTimer) {
            clearTimeout(this._manualExitRefreshTimer);
          }
          this._manualExitRefreshTimer = setTimeout(() => {
            this.refreshAll({ silent: true });
            this._manualExitRefreshTimer = null;
          }, 1200);
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '确认离开失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  onOpenBind(e) {
    const ds = e.currentTarget.dataset || {};
    this.setData({
      showBindPopup: true,
      bindUserId: ds.userid || '',
      bindUserName: ds.username || '',
      bindCardNo: '',
      bindDahuaSeq: '',
    });
  },

  onCloseBindPopup() {
    this.setData({ showBindPopup: false });
  },

  onBindCardNoInput(e) {
    this.setData({ bindCardNo: this.fieldDetail(e).trim() });
  },

  onBindDahuaInput(e) {
    this.setData({ bindDahuaSeq: this.fieldDetail(e).trim() });
  },

  async onSubmitBind() {
    const aroUserId = String(this.data.bindUserId || '').trim();
    const cardNo = String(this.data.bindCardNo || '').trim();
    const dahuaSeq = String(this.data.bindDahuaSeq || '').trim();
    if (!aroUserId || !cardNo || !dahuaSeq) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/v1/twin/mappings/add',
        method: 'POST',
        data: {
          cardNo,
          dahuaSeq,
          aroUserId,
          cardStatus: 'NORMAL',
          freezeExemptFlag: 0,
        },
      });
      const parsed = unwrap(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ showBindPopup: false });
      await this.refreshAll({ silent: true });
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
