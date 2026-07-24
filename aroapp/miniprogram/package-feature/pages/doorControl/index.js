const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/doorControlApi.js');

const MODE_LABEL = {
  STAY_OPEN: '常开',
  STAY_CLOSE: '常闭',
  NORMAL: '普通',
};

const MODE_OPTIONS = [
  { name: '常开', key: 'STAY_OPEN' },
  { name: '常闭', key: 'STAY_CLOSE' },
  { name: '普通', key: 'NORMAL' },
];

const STATUS_FILTERS = [
  { key: '', label: '全部' },
  { key: 'STAY_OPEN', label: '常开' },
  { key: 'STAY_CLOSE', label: '常闭' },
  { key: 'NORMAL', label: '普通' },
  { key: 'OFFLINE', label: '离线' },
];

const SEARCH_DEBOUNCE_MS = 500;
const PAGE_SIZE = 200;
const MAX_PAGES = 25;
const STATUS_CHUNK_SIZE = 50;

Page({
  data: {
    keyword: '',
    categories: [],
    activeCategoryId: null,
    statusFilters: STATUS_FILTERS,
    activeStatusFilter: '',

    loading: false,
    loadingMore: false,
    list: [],
    groupedList: [],
    totalOnline: 0,
    totalOffline: 0,
    statusCounts: { all: 0, STAY_OPEN: 0, STAY_CLOSE: 0, NORMAL: 0, OFFLINE: 0 },

    statusByCode: {},
    activeModeByCode: {},
    statusRefreshing: false,
    statusProgressText: '',

    executingCode: '',
    executingMode: '',
    resultByCode: {},

    showModeSheet: false,
    modeSheetChannelCode: '',
    modeSheetActions: MODE_OPTIONS,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/doorControl/index', role, 'SUPER_ADMIN')) return;
    this.loadCategories().then(() => this.loadList());
  },

  async loadCategories() {
    try {
      const list = await api.fetchRemarkCategories();
      const sorted = (list || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      this.setData({ categories: sorted });
    } catch (e) {
      this.setData({ categories: [] });
    }
  },

  /** @param {number|string|null|undefined} categoryOverride */
  async loadList(categoryOverride) {
    const seq = (this._loadSeq = (this._loadSeq || 0) + 1);
    const activeCategoryId = categoryOverride !== undefined ? categoryOverride : this.data.activeCategoryId;
    this._renderCategoryId = activeCategoryId;
    this.setData({
      loading: true,
      loadingMore: false,
      list: [],
      groupedList: [],
      statusByCode: {},
      activeModeByCode: {},
      statusProgressText: '',
    });

    const kw = (this.data.keyword || '').trim() || undefined;
    let all = [];
    let page = 1;

    try {
      while (page <= MAX_PAGES) {
        const query = { page, pageSize: PAGE_SIZE };
        if (kw) query.keyword = kw;
        if (activeCategoryId != null && activeCategoryId !== '') {
          query.remarkCategoryId = activeCategoryId;
        }
        const data = await api.fetchChannels(query);
        if (seq !== this._loadSeq) return;
        const rows = data.list || [];
        all = all.concat(rows);

        this.setData({
          list: all,
          loading: false,
          loadingMore: rows.length >= PAGE_SIZE,
        });
        this.buildGroupedList(activeCategoryId);
        await this.refreshBatchStatusForRows(rows, seq, activeCategoryId, page === 1);

        if (rows.length < PAGE_SIZE) break;
        page += 1;
      }
    } catch (e) {
      if (seq !== this._loadSeq) return;
      wx.showToast({ title: (e.message || '加载失败').slice(0, 18), icon: 'none' });
    } finally {
      if (seq === this._loadSeq) {
        this.setData({ loading: false, loadingMore: false, statusProgressText: '' });
      }
    }
  },

  resolveActiveMode(status, workMode) {
    const s = Number(status);
    const w = Number(workMode);
    if (w === 2) return 'STAY_OPEN';
    if (w === 1) return 'STAY_CLOSE';
    if (w === 0) return 'NORMAL';
    if (s === 1) return 'OPEN';
    if (s === 2) return 'CLOSE';
    return '';
  },

  /** 增量拉取状态，每批完成后立即刷新列表 */
  async refreshBatchStatusForRows(rows, loadSeq, categoryId, replaceAll) {
    const renderCategoryId = categoryId !== undefined ? categoryId : this._renderCategoryId;
    const incomingCodes = (rows || []).map((x) => String(x.channelCode || '').trim()).filter(Boolean);
    if (incomingCodes.length === 0) {
      if (loadSeq != null && loadSeq !== this._loadSeq) return;
      if (replaceAll) {
        this.setData({ statusByCode: {}, activeModeByCode: {}, statusRefreshing: false, statusProgressText: '' });
      }
      this.buildGroupedList(renderCategoryId);
      return;
    }

    const prevStatus = replaceAll ? {} : Object.assign({}, this.data.statusByCode || {});
    const prevActive = replaceAll ? {} : Object.assign({}, this.data.activeModeByCode || {});
    const toFetch = incomingCodes.filter((code) => !prevStatus[code]);
    if (toFetch.length === 0) {
      this.buildGroupedList(renderCategoryId);
      return;
    }

    const statusMap = Object.assign({}, prevStatus);
    const activeMap = Object.assign({}, prevActive);
    let done = 0;
    this.setData({ statusRefreshing: true, statusProgressText: `同步状态 0/${toFetch.length}` });

    for (let i = 0; i < toFetch.length; i += STATUS_CHUNK_SIZE) {
      if (loadSeq != null && loadSeq !== this._loadSeq) return;
      const chunk = toFetch.slice(i, i + STATUS_CHUNK_SIZE);
      try {
        const resp = await api.queryStatus({ channelCodes: chunk });
        (resp.rows || []).forEach((r) => {
          const code = String(r.channelCode || '').trim();
          if (!code) return;
          const status = Number(r.status);
          const workMode = Number(r.workMode);
          statusMap[code] = { status, workMode, onlineStatus: String(r.onlineStatus || '').toUpperCase() };
          activeMap[code] = this.resolveActiveMode(status, workMode);
        });
      } catch (e) {
        // 忽略单批失败
      }
      done = Math.min(i + STATUS_CHUNK_SIZE, toFetch.length);
      if (loadSeq != null && loadSeq !== this._loadSeq) return;
      this.setData({
        statusByCode: Object.assign({}, statusMap),
        activeModeByCode: Object.assign({}, activeMap),
        statusProgressText: done < toFetch.length ? `同步状态 ${done}/${toFetch.length}` : '',
      });
      this.buildGroupedList(renderCategoryId);
      if (done < toFetch.length) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    if (loadSeq != null && loadSeq !== this._loadSeq) return;
    this.setData({ statusRefreshing: false, statusProgressText: '' });
    this.buildGroupedList(renderCategoryId);
  },

  async refreshSingleStatus(channelCode) {
    const code = String(channelCode || '').trim();
    if (!code) return;
    try {
      const resp = await api.queryStatus({ channelCode: code });
      const first = (resp.rows || [])[0] || null;
      if (!first) return;
      const map = Object.assign({}, this.data.statusByCode || {});
      const active = Object.assign({}, this.data.activeModeByCode || {});
      const status = Number(first.status);
      const workMode = Number(first.workMode);
      map[code] = { status, workMode, onlineStatus: String(first.onlineStatus || '').toUpperCase() };
      active[code] = this.resolveActiveMode(status, workMode);
      this.setData({ statusByCode: map, activeModeByCode: active });
      this.buildGroupedList();
    } catch (e) {
      // ignore
    }
  },

  matchesStatusFilter(item, filterKey) {
    if (!filterKey) return true;
    if (filterKey === 'OFFLINE') return item.isOffline;
    if (item.isOffline) return false;
    return item.activeMode === filterKey;
  },

  buildGroupedList(categoryOverride) {
    const list = this.data.list || [];
    const statusMap = this.data.statusByCode || {};
    const activeMap = this.data.activeModeByCode || {};
    const categories = this.data.categories || [];
    const activeStatusFilter = this.data.activeStatusFilter || '';
    const activeCategoryId = categoryOverride !== undefined
      ? categoryOverride
      : (this._renderCategoryId !== undefined ? this._renderCategoryId : this.data.activeCategoryId);

    const allItems = list.map((ch) => {
      const code = String(ch.channelCode || '').trim();
      const st = statusMap[code];
      return this.buildChannelItem(ch, st, activeMap[code]);
    });

    const statusCounts = {
      all: allItems.length,
      STAY_OPEN: 0,
      STAY_CLOSE: 0,
      NORMAL: 0,
      OFFLINE: 0,
    };
    allItems.forEach((item) => {
      if (item.isOffline) {
        statusCounts.OFFLINE += 1;
        return;
      }
      if (item.activeMode === 'STAY_OPEN') statusCounts.STAY_OPEN += 1;
      else if (item.activeMode === 'STAY_CLOSE') statusCounts.STAY_CLOSE += 1;
      else if (item.activeMode === 'NORMAL') statusCounts.NORMAL += 1;
    });

    const filtered = allItems.filter((item) => this.matchesStatusFilter(item, activeStatusFilter));
    const online = [];
    const offline = [];
    filtered.forEach((item) => {
      if (item.isOffline) offline.push(item);
      else online.push(item);
    });

    let categoryName = '全部通道';
    let categoryId = '__all__';
    if (activeCategoryId != null && activeCategoryId !== '') {
      const cat = categories.find((c) => String(c.id) === String(activeCategoryId));
      categoryName = cat ? cat.name : '当前分类';
      categoryId = activeCategoryId;
    }

    const grouped = [{
      categoryId,
      categoryName,
      onlineChannels: online,
      offlineChannels: offline,
    }];

    this.setData({
      groupedList: grouped,
      totalOnline: online.length,
      totalOffline: offline.length,
      statusCounts,
    });
  },

  buildChannelItem(ch, statusInfo, activeMode) {
    const code = String(ch.channelCode || '').trim();
    const hasStatus = !!statusInfo;
    const isOffline = hasStatus && statusInfo.onlineStatus === 'OFF';
    const statusPending = !hasStatus;
    const cardBgClass = isOffline ? 'card-offline'
      : activeMode === 'STAY_OPEN' ? 'card-stayopen'
      : activeMode === 'STAY_CLOSE' ? 'card-stayclose'
      : 'card-normal';
    let activeModeLabel = MODE_LABEL[activeMode] || '';
    if (isOffline) activeModeLabel = '离线';
    else if (statusPending) activeModeLabel = '同步中';
    else if (!activeModeLabel) activeModeLabel = '普通';

    return {
      channelCode: code,
      channelName: ch.channelName || '未命名通道',
      channelType: ch.channelType || '',
      remarkCategoryId: ch.remarkCategoryId,
      isOffline,
      statusPending,
      activeMode: activeMode || '',
      activeModeLabel,
      cardBgClass,
    };
  },

  onKeywordInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ keyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.doSearch(), SEARCH_DEBOUNCE_MS);
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.doSearch();
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    this.doSearch();
  },

  doSearch() {
    this._renderCategoryId = null;
    this.setData({ activeCategoryId: null, activeStatusFilter: '' });
    this.loadList(null);
  },

  onTapCategory(e) {
    const rawId = e.currentTarget.dataset.id;
    const nextId = rawId === '__all__' ? null : rawId;
    this._renderCategoryId = nextId;
    this.setData({ activeCategoryId: nextId });
    this.loadList(nextId);
  },

  onTapStatusFilter(e) {
    const key = e.currentTarget.dataset.key != null ? String(e.currentTarget.dataset.key) : '';
    if (key === this.data.activeStatusFilter) return;
    this.setData({ activeStatusFilter: key });
    this.buildGroupedList();
  },

  async onInstantAction(e) {
    const mode = String(e.currentTarget.dataset.mode || '');
    const code = String(e.currentTarget.dataset.code || '');
    if (!mode || !code) return;
    this.setData({ executingCode: code, executingMode: mode });
    try {
      const result = await api.executeMode(mode, code);
      const ok = result && (result.success === true || result.success === 'true');
      const upstream = result && result.upstream ? result.upstream : {};
      const msg = String((upstream && (upstream.errMsg || upstream.message)) || (ok ? '操作成功' : '操作失败'));
      this.showInlineResult(code, ok, mode, msg);
      await this.refreshSingleStatus(code);
    } catch (err) {
      const emsg = String(err && err.message ? err.message : '执行失败');
      this.showInlineResult(code, false, mode, emsg);
      await this.refreshSingleStatus(code);
    } finally {
      this.setData({ executingCode: '', executingMode: '' });
    }
  },

  async onTapModeTag(e) {
    const code = String(e.currentTarget.dataset.code || '');
    if (!code) return;
    let item = this.findChannelInGrouped(code);
    if (!item) return;
    if (item.isOffline) {
      wx.showToast({ title: '设备离线，无法切换', icon: 'none' });
      return;
    }
    if (item.statusPending) {
      wx.showLoading({ title: '获取状态…', mask: true });
      await this.refreshSingleStatus(code);
      wx.hideLoading();
      item = this.findChannelInGrouped(code);
      if (!item || item.isOffline) {
        wx.showToast({ title: '设备离线，无法切换', icon: 'none' });
        return;
      }
    }
    this.setData({ showModeSheet: true, modeSheetChannelCode: code });
  },

  onCloseModeSheet() {
    this.setData({ showModeSheet: false });
  },

  async onSelectMode(e) {
    const item = e.detail || {};
    const mode = item.key || '';
    const code = this.data.modeSheetChannelCode;
    this.setData({ showModeSheet: false });
    if (!mode || !code) return;

    this.setData({ executingCode: code, executingMode: mode });
    try {
      const result = await api.executeMode(mode, code);
      const ok = result && (result.success === true || result.success === 'true');
      const upstream = result && result.upstream ? result.upstream : {};
      const label = MODE_LABEL[mode] || mode;
      const msg = String((upstream && (upstream.errMsg || upstream.message)) || (ok ? `已切换至${label}` : '切换失败'));
      this.showInlineResult(code, ok, mode, msg);
      await this.refreshSingleStatus(code);
    } catch (err) {
      const emsg = String(err && err.message ? err.message : '切换失败');
      this.showInlineResult(code, false, mode, emsg);
      await this.refreshSingleStatus(code);
    } finally {
      this.setData({ executingCode: '', executingMode: '' });
    }
  },

  findChannelInGrouped(code) {
    const groups = this.data.groupedList || [];
    for (const g of groups) {
      for (const ch of g.onlineChannels || []) {
        if (ch.channelCode === code) return ch;
      }
      for (const ch of g.offlineChannels || []) {
        if (ch.channelCode === code) return ch;
      }
    }
    return null;
  },

  showInlineResult(code, ok, mode, message) {
    const map = Object.assign({}, this.data.resultByCode || {});
    map[code] = { ok, mode, message, at: new Date().toLocaleTimeString(), show: true };
    this.setData({ resultByCode: map });
    if (ok) {
      setTimeout(() => {
        const m = Object.assign({}, this.data.resultByCode || {});
        if (m[code] && m[code].ok) {
          m[code] = Object.assign({}, m[code], { show: false });
          this.setData({ resultByCode: m });
        }
      }, 3000);
    }
  },

  onDismissResult(e) {
    const code = String(e.currentTarget.dataset.code || '');
    const map = Object.assign({}, this.data.resultByCode || {});
    if (map[code]) {
      map[code] = Object.assign({}, map[code], { show: false });
      this.setData({ resultByCode: map });
    }
  },

  onRefreshStatus() {
    const list = this.data.list || [];
    const seq = this._loadSeq || 0;
    this.refreshBatchStatusForRows(list, seq, this._renderCategoryId, true);
  },
});
