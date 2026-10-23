const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/doorControlApi.js');
const { displayFloorAndName } = require('../../utils/channelName.js');

const MODE_TEXT = {
  STAY_OPEN: '常开',
  STAY_CLOSE: '常闭',
  NORMAL: '普通',
  OPEN: '已开门',
  CLOSE: '已关门',
  UNKNOWN: '未知',
};

const MODE_TONE = {
  STAY_OPEN: 'stayopen',
  STAY_CLOSE: 'stayclose',
  NORMAL: 'normal',
  OPEN: 'stayopen',
  CLOSE: 'stayclose',
  UNKNOWN: 'unknown',
};

const ACTION_LABEL = {
  OPEN: '已开门',
  CLOSE: '已关门',
  STAY_OPEN: '已设常开',
  STAY_CLOSE: '已设常闭',
  NORMAL: '已设普通',
};

const CONFIRM_LABEL = {
  OPEN: '远程开门',
  CLOSE: '远程关门',
  STAY_OPEN: '设为常开',
  STAY_CLOSE: '设为常闭',
  NORMAL: '恢复普通',
};

const STATUS_FILTERS = [
  { key: '', label: '全部', countKey: 'all' },
  { key: 'STAY_OPEN', label: '常开', countKey: 'STAY_OPEN' },
  { key: 'STAY_CLOSE', label: '常闭', countKey: 'STAY_CLOSE' },
  { key: 'NORMAL', label: '普通', countKey: 'NORMAL' },
  { key: 'OFFLINE', label: '离线', countKey: 'OFFLINE' },
];

const MODE_OPTIONS = [
  { key: 'STAY_OPEN', label: '常开' },
  { key: 'STAY_CLOSE', label: '常闭' },
  { key: 'NORMAL', label: '普通' },
];

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const STATUS_CHUNK_SIZE = 50;
const STATUS_CONCURRENCY = 4;
const STATUS_CACHE_TTL = 30000;
const AUTO_REFRESH_MS = 30000;
const FLASH_MS = 4000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UNCLASSIFIED = '未分类';

/** 文件夹排序：楼层在前（B1F 最前），公共门组次之，未分类最后 */
function folderRank(folder) {
  if (folder === UNCLASSIFIED) return 1e9;
  if (folder === '公共门组') return 9e8;
  const m = /^(B?)(\d+)F$/.exec(folder);
  if (!m) return 1e7;
  const level = Number(m[2]);
  return m[1] ? -level : level;
}

function resolveMode(status, workMode) {
  if (workMode === 2) return 'STAY_OPEN';
  if (workMode === 1) return 'STAY_CLOSE';
  if (workMode === 0) return 'NORMAL';
  if (status === 1) return 'OPEN';
  if (status === 2) return 'CLOSE';
  return 'UNKNOWN';
}

function matchesFilter(item, filter) {
  if (!filter) return true;
  if (filter === 'OFFLINE') return item.offline;
  if (item.offline) return false;
  return item.mode === filter;
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = [];
  const size = Math.min(limit, items.length);
  for (let i = 0; i < size; i += 1) {
    runners.push((async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index], index);
      }
    })());
  }
  await Promise.all(runners);
}

Page({
  data: {
    keyword: '',
    searchFocused: false,
    categories: [],
    loading: false,
    statusRefreshing: false,
    lastRefreshText: '',
    statusFilters: STATUS_FILTERS,
    activeStatusFilter: '',
    statusCounts: { all: 0, online: 0, OFFLINE: 0, unknown: 0, STAY_OPEN: 0, STAY_CLOSE: 0, NORMAL: 0 },
    sidebarFolders: [],
    sidebarAllCount: 0,
    selectedFolder: '',
    currentItems: [],
    panelRefreshing: false,

    modeOptions: MODE_OPTIONS,
    modeMenuCode: '',
    actionBusy: false,
    actionCode: '',
    actionMode: '',
    flashCode: '',
    flashMode: '',
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-door/pages/doorControl/index', role, 'SUPER_ADMIN')) return;
    this._visible = true;
    this.loadCategories().then(() => {
      if (!this._rows || this._rows.length === 0) {
        this.loadList();
      } else {
        this.buildItems();
        this.refreshStatuses({ force: true });
      }
    });
    this.scheduleAutoRefresh();
  },

  /** 文件夹树：后台在「通道编码」页维护，门禁页按一级文件夹分组 */
  async loadCategories() {
    try {
      const list = await api.fetchRemarkCategories();
      const sorted = (list || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const map = {};
      sorted.forEach((c) => { map[Number(c.id)] = c; });
      this._catById = map;
      this.setData({ categories: sorted });
    } catch (e) {
      this._catById = {};
      this.setData({ categories: [] });
    }
  },

  onHide() {
    this._visible = false;
    this.clearAutoRefresh();
  },

  onUnload() {
    this._visible = false;
    this.clearAutoRefresh();
    if (this._searchTimer) clearTimeout(this._searchTimer);
    if (this._flashTimer) clearTimeout(this._flashTimer);
    if (this._actionFlashTimer) clearTimeout(this._actionFlashTimer);
  },

  onPanelRefresher() {
    this.setData({ panelRefreshing: true });
    this.loadList();
  },

  // ── 列表 ────────────────────────────────────────────────────────────

  async loadList() {
    const seq = (this._listSeq = (this._listSeq || 0) + 1);
    this._statusSeq = (this._statusSeq || 0) + 1;
    this.setData({ loading: true });
    const kw = (this.data.keyword || '').trim() || undefined;
    const rows = [];

    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const query = { page, pageSize: PAGE_SIZE };
        if (kw) query.keyword = kw;
        const data = await api.fetchChannels(query);
        if (seq !== this._listSeq) return;
        const batch = (data && data.list) || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      if (seq !== this._listSeq) return;
      this._rows = rows;
      this._statusByCode = this._statusByCode || {};
      this.buildItems();
      this.setData({ loading: false });
      await this.refreshStatuses({ force: false });
    } catch (e) {
      if (seq !== this._listSeq) return;
      this.setData({ loading: false });
      wx.showToast({ title: String((e && e.message) || '加载失败').slice(0, 18), icon: 'none' });
    } finally {
      if (this.data.panelRefreshing) this.setData({ panelRefreshing: false });
    }
  },

  // ── 状态 ────────────────────────────────────────────────────────────

  async refreshStatuses(opts) {
    const options = opts || {};
    const rows = this._rows || [];
    const codes = rows.map((r) => String(r.channelCode || '').trim()).filter(Boolean);
    if (codes.length === 0) {
      this.setData({ statusRefreshing: false });
      return;
    }

    const now = Date.now();
    const toFetch = codes.filter((code) => {
      if (options.force) return true;
      const st = this._statusByCode[code];
      return !st || !st.at || now - st.at > STATUS_CACHE_TTL;
    });
    if (toFetch.length === 0) {
      this.setData({ lastRefreshText: fmtTime(now) });
      return;
    }

    const seq = (this._statusSeq = (this._statusSeq || 0) + 1);
    if (!options.silent) this.setData({ statusRefreshing: true });

    const chunks = [];
    for (let i = 0; i < toFetch.length; i += STATUS_CHUNK_SIZE) {
      chunks.push(toFetch.slice(i, i + STATUS_CHUNK_SIZE));
    }

    await mapLimit(chunks, STATUS_CONCURRENCY, async (chunk) => {
      if (seq !== this._statusSeq) return;
      let got = null;
      try {
        const resp = await api.queryStatus({ channelCodes: chunk });
        if (seq !== this._statusSeq) return;
        got = new Set();
        (resp.rows || []).forEach((r) => {
          const code = String(r.channelCode || '').trim();
          if (!code) return;
          this._statusByCode[code] = {
            status: num(r.status),
            workMode: num(r.workMode),
            onlineStatus: String(r.onlineStatus || '').toUpperCase(),
            at: Date.now(),
          };
          got.add(code);
        });
      } catch (e) {
        got = null;
      }
      if (seq !== this._statusSeq) return;

      chunk.forEach((code) => {
        if (got && got.has(code)) return;
        const prev = this._statusByCode[code];
        // 已有旧值时保留旧值（下一轮再补），只有从没拿到过才显示「状态未知」
        if (!prev || prev.unknown) this._statusByCode[code] = { unknown: true, at: 0 };
      });
      this.buildItems();
    });

    if (seq !== this._statusSeq) return;
    this.setData({ statusRefreshing: false, lastRefreshText: fmtTime(Date.now()) });
  },

  async fetchOneStatus(code) {
    try {
      const resp = await api.queryStatus({ channelCode: code });
      const rows = resp.rows || [];
      const row = rows.find((r) => String(r.channelCode || '').trim() === code) || rows[0];
      if (!row) return null;
      return {
        status: num(row.status),
        workMode: num(row.workMode),
        onlineStatus: String(row.onlineStatus || '').toUpperCase(),
        at: Date.now(),
      };
    } catch (e) {
      return null;
    }
  },

  /** 操作后立刻把状态钉到预期值，再按 0/0.5/1.2/2.4s 回查直到设备确认 */
  async refreshOneWithRetry(code, mode) {
    const expected = { STAY_OPEN: 2, STAY_CLOSE: 1, NORMAL: 0 }[mode];
    const delays = expected === undefined ? [600] : [0, 500, 1200, 2400];
    for (let i = 0; i < delays.length; i += 1) {
      if (delays[i]) await sleep(delays[i]);
      const st = await this.fetchOneStatus(code);
      if (!st) continue;
      this._statusByCode[code] = st;
      this.buildItems();
      if (expected === undefined) break;
      if (st.workMode === expected) break;
    }
    this.setData({ lastRefreshText: fmtTime(Date.now()) });
  },

  scheduleAutoRefresh() {
    this.clearAutoRefresh();
    this._autoTimer = setTimeout(async () => {
      if (!this._visible) return;
      await this.refreshStatuses({ force: true, silent: true });
      this.scheduleAutoRefresh();
    }, AUTO_REFRESH_MS);
  },

  clearAutoRefresh() {
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
  },

  onRefreshTap() {
    if (this.data.statusRefreshing) return;
    this.refreshStatuses({ force: true });
  },

  // ── 渲染 ────────────────────────────────────────────────────────────

  /** 通道所属的一级文件夹；没有分类或分类被删时归「未分类」 */
  rootFolderOf(row) {
    const id = row && row.remarkCategoryId;
    if (id == null) return UNCLASSIFIED;
    const map = this._catById || {};
    let cur = map[Number(id)];
    let guard = 0;
    while (cur && cur.parentId != null && map[Number(cur.parentId)] && guard < 20) {
      cur = map[Number(cur.parentId)];
      guard += 1;
    }
    return cur ? cur.name : UNCLASSIFIED;
  },

  buildItems() {
    const rows = this._rows || [];
    const now = Date.now();
    this._items = rows.map((row) => {
      const code = String(row.channelCode || '').trim();
      const name = displayFloorAndName(row.channelName) || '未命名通道';
      const st = this._statusByCode[code];
      const flash = this._flash && this._flash[code];
      let mode = '';
      let statusText = '同步中';
      let tone = 'pending';
      let offline = false;
      let unknown = true;

      if (flash && flash.until > now) {
        statusText = flash.text;
        tone = flash.tone;
        unknown = false;
      } else if (st && st.unknown) {
        statusText = '状态未知';
        tone = 'unknown';
        unknown = true;
      } else if (st) {
        if (st.onlineStatus === 'OFF') {
          offline = true;
          statusText = '离线';
          tone = 'offline';
        } else {
          mode = resolveMode(st.status, st.workMode);
          statusText = MODE_TEXT[mode] || '未知';
          tone = MODE_TONE[mode] || 'unknown';
          unknown = false;
        }
      }

      return {
        code,
        name,
        floor: this.rootFolderOf(row),
        mode,
        statusText,
        tone,
        modeLabel: MODE_TEXT[mode] || '模式',
        offline,
        unknown,
        busy: this._busyCode === code,
        pendingMode: this.data.actionBusy && this.data.actionCode === code ? this.data.actionMode : '',
      };
    });
    this.applyFilter();
  },

  applyFilter() {
    const items = this._items || [];
    const counts = { all: items.length, online: 0, OFFLINE: 0, unknown: 0, STAY_OPEN: 0, STAY_CLOSE: 0, NORMAL: 0 };
    items.forEach((it) => {
      if (it.offline) {
        counts.OFFLINE += 1;
        return;
      }
      if (it.unknown) {
        counts.unknown += 1;
        return;
      }
      counts.online += 1;
      if (it.mode === 'STAY_OPEN') counts.STAY_OPEN += 1;
      else if (it.mode === 'STAY_CLOSE') counts.STAY_CLOSE += 1;
      else if (it.mode === 'NORMAL') counts.NORMAL += 1;
    });

    const filter = this.data.activeStatusFilter;
    const filtered = items.filter((it) => matchesFilter(it, filter));

    const byFloor = {};
    const allFloorSet = {};
    items.forEach((it) => {
      allFloorSet[it.floor] = true;
      if (matchesFilter(it, filter)) {
        if (!byFloor[it.floor]) byFloor[it.floor] = [];
        byFloor[it.floor].push(it);
      }
    });

    const floorSort = (a, b) => folderRank(a) - folderRank(b) || a.localeCompare(b, 'zh');
    const floors = Object.keys(byFloor).sort(floorSort);
    const compareName = (a, b) => a.name.localeCompare(b.name, 'zh');
    floors.forEach((f) => byFloor[f].sort(compareName));

    const sidebarFolders = Object.keys(allFloorSet)
      .sort(floorSort)
      .map((name) => ({ name, count: (byFloor[name] || []).length }));

    const selectedFolder = allFloorSet[this.data.selectedFolder] ? this.data.selectedFolder : '';
    const currentItems = selectedFolder
      ? (byFloor[selectedFolder] || [])
      : floors.reduce((acc, f) => acc.concat(byFloor[f]), []);

    this.setData({
      sidebarFolders,
      sidebarAllCount: filtered.length,
      selectedFolder,
      currentItems,
      statusCounts: counts,
    });
  },

  // ── 交互 ────────────────────────────────────────────────────────────

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.doSearch(), SEARCH_DEBOUNCE_MS);
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.doSearch();
  },

  onSearchFocus() {
    this.setData({ searchFocused: true });
  },

  onSearchBlur() {
    this.setData({ searchFocused: false });
  },

  onClearKeyword() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.setData({ keyword: '' });
    this.doSearch();
  },

  doSearch() {
    this.setData({ activeStatusFilter: '', selectedFolder: '' });
    this.loadList();
  },

  onTapStatusFilter(e) {
    const key = e.currentTarget.dataset.key != null ? String(e.currentTarget.dataset.key) : '';
    if (key === this.data.activeStatusFilter) return;
    this.setData({ activeStatusFilter: key });
    this.applyFilter();
  },

  onTapFolder(e) {
    const folder = e.currentTarget.dataset.folder != null ? String(e.currentTarget.dataset.folder) : '';
    if (folder === this.data.selectedFolder) return;
    this.setData({ selectedFolder: folder });
    this.applyFilter();
  },

  onDoorAction(e) {
    const mode = String(e.currentTarget.dataset.mode || '');
    const code = String(e.currentTarget.dataset.code || '');
    this.runDoorAction(mode, code);
  },

  /** 三态模式：点按钮在卡片内展开菜单，选中再走统一的二次确认 */
  onTapModePicker(e) {
    if (this.data.actionBusy) return;
    const code = String(e.currentTarget.dataset.code || '');
    if (!code) return;
    this.setData({ modeMenuCode: this.data.modeMenuCode === code ? '' : code });
  },

  noop() {},

  async runDoorAction(mode, code) {
    if (this.data.actionBusy) return;
    if (!mode || !code) return;
    this.setData({ modeMenuCode: '' });

    const item = (this._items || []).find((it) => it.code === code);
    const name = (item && item.name) || code;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认操作',
        content: `确认对「${name}」执行「${CONFIRM_LABEL[mode] || mode}」？`,
        confirmText: '确认',
        confirmColor: '#2563eb',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ actionBusy: true, actionCode: code, actionMode: mode, flashCode: '', flashMode: '' });
    this._busyCode = code;
    this.buildItems();

    try {
      const result = await api.executeMode(mode, code);
      const ok = !!(result && (result.success === true || result.success === 'true'));
      const upstream = (result && result.upstream) || {};
      if (ok) {
        this.applyOptimistic(code, mode);
        if (mode === 'OPEN' || mode === 'CLOSE') this.flashDoorAction(code, mode);
        wx.showToast({ title: ACTION_LABEL[mode] || '操作成功', icon: 'success', duration: 1200 });
      } else {
        const msg = String(upstream.errMsg || upstream.message || '操作失败');
        wx.showToast({ title: msg.slice(0, 18), icon: 'none' });
      }
      await this.refreshOneWithRetry(code, mode);
    } catch (err) {
      wx.showToast({ title: String((err && err.message) || '执行失败').slice(0, 18), icon: 'none' });
      await this.refreshOneWithRetry(code, mode);
    } finally {
      this._busyCode = '';
      this.setData({ actionBusy: false, actionCode: '', actionMode: '' });
      this.buildItems();
    }
  },

  /** 开门/关门是一次性动作：按钮只短暂变成「已开门/已关门」再复原 */
  flashDoorAction(code, mode) {
    this.setData({ flashCode: code, flashMode: mode });
    if (this._actionFlashTimer) clearTimeout(this._actionFlashTimer);
    this._actionFlashTimer = setTimeout(() => this.setData({ flashCode: '', flashMode: '' }), 1500);
  },

  applyOptimistic(code, mode) {
    const base = this._statusByCode[code] || { status: 0, onlineStatus: 'ON', at: Date.now() };
    if (mode === 'STAY_OPEN' || mode === 'STAY_CLOSE' || mode === 'NORMAL') {
      const workMode = mode === 'STAY_OPEN' ? 2 : mode === 'STAY_CLOSE' ? 1 : 0;
      this._statusByCode[code] = Object.assign({}, base, { workMode, unknown: false, at: Date.now() });
    } else {
      this._flash = this._flash || {};
      this._flash[code] = {
        text: mode === 'OPEN' ? '已开门' : '已关门',
        tone: mode === 'OPEN' ? 'stayopen' : 'stayclose',
        until: Date.now() + FLASH_MS,
      };
      if (this._flashTimer) clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => this.buildItems(), FLASH_MS + 100);
    }
    this.buildItems();
  },
});
