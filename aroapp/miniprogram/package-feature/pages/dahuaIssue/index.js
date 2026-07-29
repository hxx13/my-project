const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const api = require('../../utils/dahuaIssueApi.js');
const exemptUtil = require('../../utils/exemptDurationPresets.js');

function normalizeFreezeFlag(v) {
  if (v === 1 || v === '1' || v === true || v === 'true') return 1;
  return 0;
}

function normalizeCardStatus(v) {
  return String(v || '').toUpperCase() === 'FROZEN' ? 'FROZEN' : 'NORMAL';
}

function decorateMappingRow(row) {
  const cardStatus = normalizeCardStatus(row && row.cardStatus);
  const activeExempt = exemptUtil.isExemptActive(row);
  const freezeExemptFlag = activeExempt ? 1 : 0;
  const exemptStatusText = activeExempt ? exemptUtil.formatExemptStatus(row) : '';
  const exemptRoomNames = activeExempt ? exemptUtil.parseExemptRoomNames(row.freezeExemptRoomIds) : [];
  // 卡片色彩：冻结=红色，豁免=金色，正常=无色
  var cardTintClass = '';
  if (cardStatus === 'FROZEN') cardTintClass = 'card-tint-frozen';
  if (freezeExemptFlag === 1) cardTintClass = 'card-tint-exempt';
  return {
    ...(row || {}),
    cardStatus,
    freezeExemptFlag,
    exemptStatusText,
    exemptRoomNames: exemptRoomNames.length > 0 ? exemptRoomNames.join(', ') : '',
    cardTintClass: cardTintClass,
    cardStatusLabel: cardStatus === 'FROZEN' ? '冻结' : '正常',
    cardStatusClass: cardStatus === 'FROZEN' ? 'status-frozen' : 'status-normal',
    controlLabel: freezeExemptFlag === 1 ? '豁免' : '受控',
    controlClass: freezeExemptFlag === 1 ? 'status-exempt' : 'status-controlled',
  };
}

Page({
  data: {
    loading: false,
    saving: false,
    list: [],
    keyword: '',
    page: 1,
    pageSize: 30,
    total: 0,
    detailOpen: false,
    detail: null,
    issueOpen: false,
    personnelKeyword: '',
    personnelResults: [],
    personnelSearching: false,
    showPersonnelDropdown: false,
    personnelNoResult: false,
    personnelDebugText: '',
    departments: [],
    departmentTreeRoots: [],
    departmentChildrenMap: {},
    departmentExpandedMap: {},
    channels: [],
    filteredChannels: [],
    channelKeyword: '',
    channelPanelOpen: false,
    doorGroups: [],
    issuing: false,
    issuingPhase: 0,
    issuingPhaseLabels: [
      '正在校验发卡参数',
      '正在下发人员信息',
      '正在下发通道/门组权限',
      '正在激活卡片并落库',
    ],
    issueForm: {
      cardNo: '',
      aroUserId: '',
      userName: '',
      departmentId: '',
      channelResourceCodes: [],
      doorGroupIds: [],
    },
    selectedDepartmentName: '',
    swipeOpenCardNo: '',
    issuePrefillLoading: false,
    issueRuleMatches: [],
    issueRuleSelectedKeys: [],
    issueOfficialRoomCount: 0,
    canGrantExempt: false,
    exemptPanelShow: false,
    exemptPanelCardNo: '',
    exemptPanelUserName: '',
    exemptPanelAroUserId: '',
    exemptSubmitting: false,
    exemptFilter: 'all',
    searching: false,
    // 追加卡片弹窗
    addCardOpen: false,
    addCardTarget: null,
    addCardNo: '',
    addCardSubmitting: false,
    groupedList: [],
    detailCards: [],
  },

  onUnload() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
  },

  noop() {},

  onExemptFilterTap(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!filter) return;
    this.setData({ exemptFilter: filter, page: 1 });
    this.loadList({ silent: true });
  },

  recomputeIssueChannelsFromMatches() {
    const matches = this.data.issueRuleMatches || [];
    const keys = new Set(this.data.issueRuleSelectedKeys || []);
    const chSet = new Set();
    const dgSet = new Set();
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i] || {};
      if (!keys.has(m.matchKey)) continue;
      const chs = m.channelResourceCodes || [];
      for (let j = 0; j < chs.length; j += 1) {
        const c = String(chs[j] || '').trim();
        if (c) chSet.add(c);
      }
      const dgs = m.doorGroupIds || [];
      for (let k = 0; k < dgs.length; k += 1) {
        const id = Number(dgs[k]);
        if (id) dgSet.add(id);
      }
    }
    this.setData({
      'issueForm.channelResourceCodes': Array.from(chSet),
      'issueForm.doorGroupIds': Array.from(dgSet),
    });
  },

  async loadIssueAccessPrefill(aroUserId) {
    const uid = String(aroUserId || '').trim();
    if (!uid) {
      this.setData({
        issuePrefillLoading: false,
        issueRuleMatches: [],
        issueRuleSelectedKeys: [],
        issueOfficialRoomCount: 0,
      });
      return;
    }
    this.setData({ issuePrefillLoading: true });
    try {
      const data = await api.fetchIssueAccessPrefill(uid);
      const matches = Array.isArray(data.ruleMatches) ? data.ruleMatches : [];
      const norm = data.officialRoomsNormalized;
      const roomCnt = Array.isArray(norm) ? norm.length : 0;
      const keys = matches.filter((m) => m && m.defaultSelected && m.matchKey).map((m) => m.matchKey);
      this.setData({
        issueRuleMatches: matches,
        issueRuleSelectedKeys: keys,
        issueOfficialRoomCount: roomCnt,
        issuePrefillLoading: false,
      });
      this.recomputeIssueChannelsFromMatches();
    } catch (e) {
      this.setData({
        issuePrefillLoading: false,
        issueRuleMatches: [],
        issueRuleSelectedKeys: [],
        issueOfficialRoomCount: 0,
      });
    }
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/dahuaIssue/index', role, 'ADMIN')) {
      return;
    }
    this.setData({ canGrantExempt: hasMinRole(role, 'ADMIN') });
    this.loadList();
  },

  async loadList(options = {}) {
    const silent = !!options.silent;
    const showSearchBtn = !!options.showSearchBtn;
    if (!silent) this.setData({ loading: true });
    if (showSearchBtn) this.setData({ searching: true });
    try {
      const { page, pageSize, keyword } = this.data;
      let listData;
      if (keyword.trim()) {
        const rows = await api.searchMappings(keyword.trim());
        listData = { list: rows, total: rows.length };
      } else {
        listData = await api.getMappings(page, pageSize);
      }
      const rawList = (listData.list || []).map(decorateMappingRow);
      const filter = this.data.exemptFilter || 'all';
      var filteredList;
      if (filter === 'all') {
        // 已豁免置顶
        filteredList = rawList.slice().sort(function (a, b) {
          if (a.freezeExemptFlag === 1 && b.freezeExemptFlag !== 1) return -1;
          if (a.freezeExemptFlag !== 1 && b.freezeExemptFlag === 1) return 1;
          return 0;
        });
      } else {
        filteredList = rawList.filter(function (item) {
          return filter === 'exempt' ? item.freezeExemptFlag === 1 : item.freezeExemptFlag !== 1;
        });
      }
      // 按人员聚合：同一人的多张卡合并
      const groupMap = new Map();
      for (var i = 0; i < filteredList.length; i++) {
        var row = filteredList[i];
        var key = row.aroUserId || row.dahuaSeq || row.cardNo;
        var existing = groupMap.get(key);
        if (existing) {
          existing.cards.push(row);
          if (row.lastModifiedTime && (!existing.info.lastModifiedTime || row.lastModifiedTime > existing.info.lastModifiedTime)) {
            existing.info.lastModifiedTime = row.lastModifiedTime;
          }
          if (row.freezeExemptFlag === 1) {
            existing.info.freezeExemptFlag = 1;
            existing.info.freezeExemptExpireAt = row.freezeExemptExpireAt;
          }
        } else {
          groupMap.set(key, { info: Object.assign({}, row), cards: [row] });
        }
      }
      var grouped = [];
      var gid = 0;
      groupMap.forEach(function (g) { gid++; g.gid = 'g' + gid; grouped.push(g); });

      this.setData({
        list: filteredList,
        groupedList: grouped,
        total: Number(listData.total || 0),
      });
    } catch (e) {
      if (!silent) {
        wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      }
    } finally {
      if (!silent) this.setData({ loading: false });
      if (showSearchBtn) this.setData({ searching: false });
    }
  },

  patchRowByCardNo(cardNo, patch) {
    if (!cardNo) return;
    const list = (this.data.list || []).map((row) => {
      if (String(row.cardNo || '') !== String(cardNo)) return row;
      return decorateMappingRow(Object.assign({}, row, patch || {}));
    });
    const dataPatch = { list };
    const detail = this.data.detail;
    if (detail && String(detail.cardNo || '') === String(cardNo)) {
      dataPatch.detail = decorateMappingRow(Object.assign({}, detail, patch || {}));
    }
    this.setData(dataPatch);
  },

  removeRowByCardNo(cardNo) {
    if (!cardNo) return;
    const list = (this.data.list || []).filter((row) => String(row.cardNo || '') !== String(cardNo));
    const dataPatch = {
      list,
      total: Math.max(0, Number(this.data.total || 0) - 1),
    };
    const detail = this.data.detail;
    if (detail && String(detail.cardNo || '') === String(cardNo)) {
      dataPatch.detail = null;
      dataPatch.detailOpen = false;
    }
    this.setData(dataPatch);
  },

  onKeywordInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ keyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this._searchTimer = null;
      this.setData({ page: 1 });
      this.loadList({ silent: true });
    }, 350);
  },

  onSearchNow() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    this.setData({ page: 1 });
    this.loadList({ showSearchBtn: true });
  },

  onCardTap(e) {
    const cardNo = String(e.currentTarget.dataset.cardno || '');
    const opened = String(this.data.swipeOpenCardNo || '');
    if (opened && opened !== cardNo) {
      this.setData({ swipeOpenCardNo: '' });
    }
  },

  onCardTouchStart(e) {
    const touch = (e.touches && e.touches[0]) || {};
    this.__touchStartX = Number(touch.clientX || 0);
    this.__touchStartY = Number(touch.clientY || 0);
    this.__touchCardNo = String(e.currentTarget.dataset.cardno || '');
  },

  onCardTouchMove(e) {
    // 占位：留给系统捕捉水平滑动，避免在某些机型 touchend 丢失方向
    const touch = (e.touches && e.touches[0]) || {};
    this.__touchLastX = Number(touch.clientX || 0);
    this.__touchLastY = Number(touch.clientY || 0);
  },

  onCardTouchEnd(e) {
    const changed = (e.changedTouches && e.changedTouches[0]) || {};
    const endX = Number(changed.clientX || this.__touchLastX || 0);
    const endY = Number(changed.clientY || this.__touchLastY || 0);
    const dx = endX - Number(this.__touchStartX || 0);
    const dy = endY - Number(this.__touchStartY || 0);
    const cardNo = String((e.currentTarget.dataset.cardno || this.__touchCardNo || ''));
    if (!cardNo) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    const opened = String(this.data.swipeOpenCardNo || '');
    if (dx < -30) {
      if (opened !== cardNo) {
        this.setData({ swipeOpenCardNo: cardNo });
      }
      return;
    }
    if (dx > 20 && opened === cardNo) {
      this.setData({ swipeOpenCardNo: '' });
      return;
    }
    if (opened && opened !== cardNo) {
      this.setData({ swipeOpenCardNo: '' });
    }
  },

  async onToggleStatus(e) {
    const row = e.currentTarget.dataset.row;
    if (!row || !row.cardNo) return;
    const next = row.cardStatus === 'FROZEN' ? 'NORMAL' : 'FROZEN';
    if (next === 'FROZEN') {
      const ok = await new Promise((resolve) => {
        wx.showModal({
          title: '确认冻结',
          content: `确定将 ${row.userName || row.cardNo} 的卡片设为冻结？`,
          confirmText: '确认冻结',
          confirmColor: '#dc2626',
          success: (res) => resolve(!!res.confirm),
          fail: () => resolve(false),
        });
      });
      if (!ok) return;
    }
    try {
      await api.updateCardStatus(row.cardNo, next);
      wx.showToast({ title: next === 'FROZEN' ? '已冻结' : '已解冻', icon: 'none' });
      this.patchRowByCardNo(row.cardNo, { cardStatus: next });
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
    }
  },

  async onToggleExempt(e) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '需要管理员权限', icon: 'none' });
      return;
    }
    const row = e.currentTarget.dataset.row;
    if (!row) return;
    // 从 groupedList 找到该人员，取豁免卡或第一张卡
    const grouped = this.data.groupedList || [];
    let cards = [row];
    for (var i = 0; i < grouped.length; i++) {
      var g = grouped[i];
      if ((g.info.aroUserId && g.info.aroUserId === row.aroUserId)
          || (g.info.dahuaSeq && g.info.dahuaSeq === row.dahuaSeq)) {
        cards = g.cards;
        break;
      }
    }
    const exemptCard = cards.find(function (c) { return c.freezeExemptFlag === 1; });
    const primaryCard = exemptCard || cards[0] || row;
    const isActive = exemptUtil.isExemptActive(primaryCard);
    if (isActive) {
      const ok = await new Promise((resolve) => {
        wx.showModal({
          title: '取消豁免',
          content: `卡号 ${primaryCard.cardNo}`,
          success: (res) => resolve(!!res.confirm),
          fail: () => resolve(false),
        });
      });
      if (!ok) return;
      try {
        const updated = await api.updateExempt(primaryCard.cardNo, 0);
        wx.showToast({ title: '已取消豁免', icon: 'none' });
        this.patchRowByCardNo(primaryCard.cardNo, {
          freezeExemptFlag: 0,
          freezeExemptExpireAt: null,
          freezeExemptMode: null,
          freezeExemptMaxCount: null,
          freezeExemptUsedCount: 0,
          freezeExemptRoomIds: null,
          ...(updated || {}),
        });
      } catch (err) {
        wx.showToast({ title: err.message || '更新失败', icon: 'none' });
      }
      return;
    }
    this.setData({
      exemptPanelShow: true,
      exemptPanelCardNo: primaryCard.cardNo,
      exemptPanelUserName: row.userName || '',
      exemptPanelAroUserId: row.aroUserId || '',
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
      const updated = await api.updateExempt(
        cardNo,
        1,
        detail.durationMinutes,
        detail.mode,
        detail.maxCount,
        detail.roomIds,
        detail.extendUntilTime,
      );
      wx.showToast({ title: '已设豁免', icon: 'none' });
      this.patchRowByCardNo(cardNo, {
        freezeExemptFlag: 1,
        freezeExemptExpireAt: updated && updated.freezeExemptExpireAt ? updated.freezeExemptExpireAt : null,
        freezeExemptMode: detail.mode,
        freezeExemptMaxCount: detail.maxCount,
        freezeExemptUsedCount: 0,
        freezeExemptRoomIds: detail.roomIds,
        ...(updated || {}),
      });
      this.setData({ exemptPanelShow: false });
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
    } finally {
      this.setData({ exemptSubmitting: false });
    }
  },

  async onDelete(e) {
    const row = e.currentTarget.dataset.row;
    if (!row || !row.cardNo) return;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除人员与卡片信息',
        content: `将删除大华卡片 [${row.cardNo}] 并清除 ${row.userName || '-'} 映射`,
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!ok) return;
    try {
      await api.deleteDahuaCard(row.cardNo);
      wx.showToast({ title: '已删除', icon: 'none' });
      this.removeRowByCardNo(row.cardNo);
      this.setData({ swipeOpenCardNo: '' });
    } catch (err) {
      wx.showToast({ title: err.message || '删除失败', icon: 'none' });
    }
  },

  /** 点击卡号 → 删除该卡片 */
  async onDeleteCard(e) {
    const cardNo = String(e.currentTarget.dataset.cardno || '');
    const userName = String(e.currentTarget.dataset.username || '');
    if (!cardNo) return;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除卡片',
        content: `将从大华删除卡号 [${cardNo}]，人员不受影响`,
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!ok) return;
    try {
      await api.deleteDahuaCard(cardNo);
      wx.showToast({ title: '卡片已删除', icon: 'none' });
      this.removeRowByCardNo(cardNo);
    } catch (err) {
      wx.showToast({ title: err.message || '删除失败', icon: 'none' });
    }
  },

  /** 打开追加卡片弹窗 */
  onOpenAddCard(e) {
    const info = e.currentTarget.dataset.info;
    if (!info || !info.dahuaSeq || !info.dahuaPersonCode) return;
    this.setData({
      addCardOpen: true,
      addCardTarget: info,
      addCardNo: '',
    });
  },

  onCloseAddCard() {
    this.setData({ addCardOpen: false, addCardTarget: null, addCardNo: '' });
  },

  onAddCardNoInput(e) {
    this.setData({ addCardNo: e.detail.value || '' });
  },

  async onAddCardSubmit() {
    var target = this.data.addCardTarget;
    var cardNo = String(this.data.addCardNo || '').trim();
    if (!target || !cardNo) {
      wx.showToast({ title: '请刷卡输入卡号', icon: 'none' });
      return;
    }
    this.setData({ addCardSubmitting: true });
    try {
      await api.addCardToExistingPerson(
        String(target.dahuaSeq),
        String(target.dahuaPersonCode),
        cardNo,
        String(target.aroUserId || '')
      );
      wx.showToast({ title: '卡片追加成功', icon: 'none' });
      this.setData({ addCardOpen: false });
      this.loadList({ silent: true });
    } catch (e) {
      wx.showToast({ title: e.message || '追加失败', icon: 'none' });
    } finally {
      this.setData({ addCardSubmitting: false });
    }
  },

  onOpenDetail(e) {
    const row = e.currentTarget.dataset.row;
    if (!row) return;
    // 从 groupedList 中找到该人员，获取其全部卡片
    const grouped = this.data.groupedList || [];
    let cards = [row];
    for (var i = 0; i < grouped.length; i++) {
      var g = grouped[i];
      if ((g.info.aroUserId && g.info.aroUserId === row.aroUserId)
          || (g.info.dahuaSeq && g.info.dahuaSeq === row.dahuaSeq)) {
        cards = g.cards.map(function (c) { return decorateMappingRow(c); });
        break;
      }
    }
    this.setData({
      detailOpen: true,
      detail: decorateMappingRow(row),
      detailCards: cards,
    });
  },

  onCloseDetail() {
    this.setData({ detailOpen: false, detail: null, detailCards: [] });
  },

  async onOpenIssue() {
    this.setData({
      issueOpen: true,
      personnelKeyword: '',
      personnelResults: [],
      issueForm: {
        cardNo: '',
        aroUserId: '',
        userName: '',
        departmentId: '',
        channelResourceCodes: [],
        doorGroupIds: [],
      },
      selectedDepartmentName: '',
      channelKeyword: '',
      channelPanelOpen: false,
      issuing: false,
      issuingPhase: 0,
      issuePrefillLoading: false,
      issueRuleMatches: [],
      issueRuleSelectedKeys: [],
      issueOfficialRoomCount: 0,
    });
    try {
      const [dept, ch, dg] = await Promise.all([
        api.fetchDepartments(''),
        api.fetchChannels(''),
        api.fetchDoorGroups(''),
      ]);
      this.setData({
        departments: dept.list || [],
        channels: ch.list || [],
        filteredChannels: ch.list || [],
        doorGroups: dg.list || [],
      });
      this.rebuildDepartmentTree(dept.list || []);
    } catch (e) {
      wx.showToast({ title: e.message || '初始化失败', icon: 'none' });
    }
  },

  onCloseIssue() {
    if (this.__personnelSearchTimer) {
      clearTimeout(this.__personnelSearchTimer);
      this.__personnelSearchTimer = null;
    }
    this.setData({ issueOpen: false, showPersonnelDropdown: false });
  },

  onIssueFieldInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    if (!key) return;
    this.setData({ [`issueForm.${key}`]: value });
  },

  async onSearchPersonnel() {
    const keyword = (this.data.personnelKeyword || '').trim();
    if (!keyword) return;
    this.setData({ personnelSearching: true });
    try {
      const result = await api.searchPersonnel(keyword);
      const rows = Array.isArray(result) ? result : (result.rows || []);
      const dbg = result && result.debug ? result.debug : null;
      const pickFirst = (obj, keys) => {
        for (let i = 0; i < keys.length; i += 1) {
          const v = obj && obj[keys[i]];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };
      const pickByRegex = (obj, regex) => {
        if (!obj || typeof obj !== 'object') return '';
        const ks = Object.keys(obj);
        for (let i = 0; i < ks.length; i += 1) {
          const k = ks[i];
          if (!regex.test(String(k))) continue;
          const v = obj[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };
      const normalized = (rows || []).map((p, idx) => {
        const pid = pickFirst(p, ['user_id', 'userId', 'userid', 'id', 'aro_user_id', 'USER_ID', 'USERID', 'ID'])
          || pickByRegex(p, /(user.?id|aro.?user.?id|id|工号|学号|编号)/i);
        const pname = pickFirst(p, ['name', 'userName', 'username', 'real_name', 'realName', 'NAME', 'USERNAME', 'REAL_NAME'])
          || pickByRegex(p, /(name|user.?name|real.?name|姓名|名称)/i);
        if (pid || pname) {
          return { pid, pname: pname || `未命名人员-${idx + 1}` };
        }
        // 最终兜底：后端有记录就展示可点击项，避免“有数据但空列表”
        const keys = p && typeof p === 'object' ? Object.keys(p) : [];
        const fallbackName = keys.length > 0 ? `${keys[0]}: ${String(p[keys[0]] || '-')}` : `人员-${idx + 1}`;
        return {
          pid: `row-${idx + 1}`,
          pname: fallbackName,
        };
      });
      const exactName = String(keyword).trim();
      const exactMatched = normalized.filter((x) => x.pid && !x.pid.startsWith('row-') && String(x.pname).trim() === exactName);
      if (exactMatched.length === 1) {
        const hit = exactMatched[0];
        this.setData({
          'issueForm.aroUserId': hit.pid,
          'issueForm.userName': hit.pname,
          personnelKeyword: hit.pname,
          personnelResults: [],
          showPersonnelDropdown: false,
          personnelNoResult: false,
          personnelDebugText: `已自动回填：${hit.pname} (${hit.pid})`,
        });
        wx.showToast({ title: '已回填人员', icon: 'none' });
        this.loadIssueAccessPrefill(hit.pid);
        return;
      }
      this.setData({
        personnelResults: normalized,
        showPersonnelDropdown: true,
        personnelNoResult: normalized.length === 0,
        personnelDebugText: dbg
          ? `直连[${dbg.directStatus ?? '-'}:${dbg.directCount}] 兜底[${dbg.fallbackStatus ?? '-'}:${dbg.fallbackCount}] 映射后 ${normalized.length}`
          : `接口返回 ${rows.length || 0} 条，映射后 ${normalized.length} 条`,
      });
    } catch (e) {
      const msg = e && e.message ? e.message : '人员检索失败';
      wx.showToast({ title: msg.slice(0, 18), icon: 'none' });
      this.setData({
        personnelResults: [],
        showPersonnelDropdown: true,
        personnelNoResult: true,
        personnelDebugText: `检索失败: ${msg}`,
      });
    } finally {
      this.setData({ personnelSearching: false });
    }
  },

  onPersonnelKeywordInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ personnelKeyword: keyword });
    if (this.__personnelSearchTimer) {
      clearTimeout(this.__personnelSearchTimer);
      this.__personnelSearchTimer = null;
    }
    if (!String(keyword).trim()) {
      this.setData({ personnelResults: [], showPersonnelDropdown: false, personnelSearching: false });
      return;
    }
    this.__personnelSearchTimer = setTimeout(() => {
      this.onSearchPersonnel();
    }, 250);
  },

  onPickPersonnel(e) {
    const pid = String(e.currentTarget.dataset.pid || '');
    const pname = String(e.currentTarget.dataset.pname || '');
    const finalPid = pid.startsWith('row-') ? '' : pid;
    this.setData({
      'issueForm.aroUserId': finalPid,
      'issueForm.userName': pname,
      personnelResults: [],
      personnelKeyword: pname,
      showPersonnelDropdown: false,
      personnelNoResult: false,
      personnelDebugText: '',
    });
    if (finalPid) {
      this.loadIssueAccessPrefill(finalPid);
    } else {
      this.loadIssueAccessPrefill('');
    }
  },

  onClosePersonnelDropdown() {
    this.setData({ showPersonnelDropdown: false, personnelNoResult: false, personnelDebugText: '' });
  },

  rebuildDepartmentTree(rows) {
    const list = rows || [];
    const childrenMap = {};
    const idSet = {};
    for (let i = 0; i < list.length; i += 1) {
      const id = Number(list[i].id || 0);
      if (id) idSet[id] = true;
    }
    for (let i = 0; i < list.length; i += 1) {
      const d = list[i] || {};
      const pid = Number(d.parentId || 0);
      if (!childrenMap[pid]) childrenMap[pid] = [];
      childrenMap[pid].push(d);
    }
    Object.keys(childrenMap).forEach((k) => {
      childrenMap[k].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    });
    const roots = list.filter((d) => {
      const pid = Number(d.parentId || 0);
      return pid === 0 || !idSet[pid];
    });
    roots.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    this.setData({
      departmentTreeRoots: roots,
      departmentChildrenMap: childrenMap,
    });
  },

  onToggleDepartmentExpand(e) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    const map = Object.assign({}, this.data.departmentExpandedMap || {});
    map[id] = !map[id];
    this.setData({ departmentExpandedMap: map });
  },

  onPickDepartmentNode(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const name = String(e.currentTarget.dataset.name || '');
    if (!id) return;
    this.setData({
      'issueForm.departmentId': id,
      selectedDepartmentName: name,
    });
  },

  onChannelKeywordInput(e) {
    const keyword = String(e.detail.value || '');
    const lower = keyword.trim().toLowerCase();
    const all = this.data.channels || [];
    const filtered = !lower
      ? all
      : all.filter((c) => {
          const name = String(c.channelName || '').toLowerCase();
          const code = String(c.channelCode || '').toLowerCase();
          return name.indexOf(lower) >= 0 || code.indexOf(lower) >= 0;
        });
    this.setData({
      channelKeyword: keyword,
      filteredChannels: filtered,
    });
  },

  onToggleChannelPanel() {
    this.setData({ channelPanelOpen: !this.data.channelPanelOpen });
  },

  onToggleChannel(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    const set = new Set(this.data.issueForm.channelResourceCodes || []);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    this.setData({ 'issueForm.channelResourceCodes': Array.from(set) });
  },

  onToggleDoorGroup(e) {
    const id = Number(e.currentTarget.dataset.id || 0);
    if (!id) return;
    const set = new Set(this.data.issueForm.doorGroupIds || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.setData({ 'issueForm.doorGroupIds': Array.from(set) });
  },

  onToggleIssueRuleMatch(e) {
    const key = String(e.currentTarget.dataset.key || '');
    if (!key) return;
    const cur = new Set(this.data.issueRuleSelectedKeys || []);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    this.setData({ issueRuleSelectedKeys: Array.from(cur) });
    this.recomputeIssueChannelsFromMatches();
  },

  async onIssueSubmit() {
    const f = Object.assign({}, this.data.issueForm);
    if (!f.cardNo || !f.userName || !f.departmentId) {
      wx.showToast({ title: '请补全必填项', icon: 'none' });
      return;
    }
    // 兼容“无预检框”流程：仅输入姓名时，提交前自动检索并回填 ARO ID
    if (!f.aroUserId && f.userName) {
      try {
        const result = await api.searchPersonnel(String(f.userName).trim());
        const rows = Array.isArray(result) ? result : (result.rows || []);
        const pickFirst = (obj, keys) => {
          for (let i = 0; i < keys.length; i += 1) {
            const v = obj && obj[keys[i]];
            if (v != null && String(v).trim() !== '') return String(v).trim();
          }
          return '';
        };
        const matched = (rows || []).map((p) => ({
          pid: pickFirst(p, ['user_id', 'userId', 'userid', 'id', 'aro_user_id', 'USER_ID', 'USERID', 'ID']),
          pname: pickFirst(p, ['name', 'userName', 'username', 'real_name', 'realName', 'NAME', 'USERNAME', 'REAL_NAME']),
        })).filter((x) => x.pid && x.pname && x.pname === String(f.userName).trim());

        if (matched.length === 1) {
          f.aroUserId = matched[0].pid;
          this.setData({ 'issueForm.aroUserId': f.aroUserId });
          this.loadIssueAccessPrefill(f.aroUserId);
        } else if (matched.length > 1) {
          wx.showToast({ title: '同名人员多条，请先检索选择', icon: 'none' });
          return;
        } else {
          wx.showToast({ title: '姓名未匹配到ARO ID', icon: 'none' });
          return;
        }
      } catch (e) {
        wx.showToast({ title: '姓名自动匹配失败', icon: 'none' });
        return;
      }
    }
    if (!f.aroUserId) {
      wx.showToast({ title: '缺少ARO ID，请先检索人员', icon: 'none' });
      return;
    }
    this.setData({ saving: true, issuing: true, issuingPhase: 0 });
    if (this.__issuingTimer) clearInterval(this.__issuingTimer);
    this.__issuingTimer = setInterval(() => {
      const next = Math.min(this.data.issuingPhase + 1, this.data.issuingPhaseLabels.length - 1);
      this.setData({ issuingPhase: next });
    }, 900);
    try {
      const result = await api.issueCard({
        cardNo: String(f.cardNo).trim(),
        aroUserId: String(f.aroUserId).trim(),
        userName: String(f.userName).trim(),
        departmentId: Number(f.departmentId),
        channelResourceCodes: f.channelResourceCodes || [],
        doorGroupIds: f.doorGroupIds || [],
      });
      if (result.success === false) {
        throw new Error(result.failStep || result.message || '发卡失败');
      }
      wx.showToast({ title: '发卡成功', icon: 'none' });
      this.setData({ issueOpen: false });
      this.loadList({ silent: true });
    } catch (e) {
      wx.showToast({ title: e.message || '发卡失败', icon: 'none' });
    } finally {
      if (this.__issuingTimer) {
        clearInterval(this.__issuingTimer);
        this.__issuingTimer = null;
      }
      this.setData({ saving: false, issuing: false, issuingPhase: 0 });
    }
  },
});
