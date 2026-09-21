const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const fmApi = require('../../utils/facilityMaintenanceApi.js');
const {
  wallTextToTimestampForPicker,
  toLocalDateTimeNoTz,
} = require('../../utils/datetimeBeijing.js');

function todayStr() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function tsToDateStr(ts) {
  if (!ts || Number.isNaN(ts)) return todayStr();
  const d = new Date(ts);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function formatBackendDateOnly(dt) {
  if (!dt) return '';
  const s = String(dt);
  return s.slice(0, 10);
}

/** 自定义日期选择弹层：今天起向前 120 天 */
function buildDateSheetRows() {
  const out = [];
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  for (let i = 0; i < 120; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    const value = `${x.getFullYear()}-${z(x.getMonth() + 1)}-${z(x.getDate())}`;
    out.push({ value, label: i === 0 ? `${value}（今天）` : value });
  }
  return out;
}

function optionLabelsFromTemplateItem(it) {
  const raw = it.optionItems || it.option_items;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (!o || typeof o !== 'object') return '';
      const lab = o.label != null ? String(o.label).trim() : '';
      const id = o.id != null ? String(o.id).trim() : '';
      return lab || id;
    })
    .filter(Boolean);
}

/** 预设多选列表（每项带 selected，供 WXML 直接绑定；WXML 不支持 indexOf/join） */
function buildPresetPickList(presetList, selectedLabels) {
  const selected = {};
  (selectedLabels || []).forEach((l) => {
    if (l) selected[l] = true;
  });
  return (presetList || []).map((p) => {
    const label = p.label || p.id || '';
    return {
      id: String(p.id || label),
      label,
      selected: !!selected[label],
    };
  });
}

function selectedLabelsFromPickList(list) {
  return (list || []).filter((i) => i.selected).map((i) => i.label);
}

function selectedLabelsText(labels) {
  return (labels || []).join('、');
}

function groupByKey(rows, keyFn, prevOpen) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const k = keyFn(r) || '（未分类）';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  const groups = [];
  map.forEach((list, name) => {
    list.sort((a, b) => {
      const ta = new Date(a.occurredAt || a.replacedAt || 0).getTime();
      const tb = new Date(b.occurredAt || b.replacedAt || 0).getTime();
      return tb - ta;
    });
    const day = (x) => ((x && (x.occurredAtText || x.replacedAtText)) || '').slice(0, 10);
    const latestDate = day(list[0]);
    const oldestDate = day(list[list.length - 1]);
    groups.push({
      name,
      count: list.length,
      latestDate,
      oldestDate,
      /* 标题显示**日期区间**而不是只有「最近 X」：只有一个日期时（同一天）就不写区间，
         免得出现 "2026-07-21 ~ 2026-07-21"。区间能让人一眼看出这组跨了多久。 */
      rangeText: oldestDate && oldestDate !== latestDate ? oldestDate + ' ~ ' + latestDate : latestDate,
      rows: list,
      /* 默认**折叠**（用户 2026-09-21 定）：历史不再靠「展开看明细」来发现 ——
         分组标题上的「× N · 起 ~ 止」已经把这一组跨了多久说清楚了，点开才铺明细。
         prevOpen 用来在重建（换机房 / 拉数）后保留用户自己展开的状态。 */
      open: prevOpen && name in prevOpen ? prevOpen[name] : false,
    });
  });
  return groups;
}

/** 把当前分组数组收成 { 名称: 是否展开 }，供重建时保留 */
function openStateOf(groups) {
  const m = {};
  (groups || []).forEach((g) => { m[g.name] = g.open === true; });
  return m;
}

/** 台账取数：后端 size 上限就是 200；页数上限纯粹是防失控的兜底（200 × 50 = 1 万条） */
const LEDGER_PAGE_SIZE = 200;
const LEDGER_MAX_PAGES = 50;

function rebuildMatrixFromSheet(sheet) {
  if (!sheet) {
    return { sheetItems: [], sheetMatrix: [] };
  }
  let tpl = sheet.template;
  if (tpl == null) {
    tpl = {};
  } else if (typeof tpl === 'string') {
    try {
      tpl = JSON.parse(tpl);
    } catch (e) {
      tpl = {};
    }
  }
  if (typeof tpl !== 'object' || tpl === null) {
    tpl = {};
  }
  const rawItems = Array.isArray(tpl.items) ? tpl.items : Array.isArray(tpl.Items) ? tpl.Items : [];
  const items = rawItems.map((it) => {
    const optionLabels = optionLabelsFromTemplateItem(it);
    return {
      id: String(it.id || ''),
      label: it.label || '',
      fieldType: String(it.fieldType || it.fieldtype || 'TEXT').toUpperCase(),
      optionLabels,
    };
  });
  const sites = Array.isArray(sheet.sites) ? sheet.sites : [];
  const cells = sheet.cells && typeof sheet.cells === 'object' && !Array.isArray(sheet.cells) ? sheet.cells : {};
  const sheetItems = items.map((it, idx) => ({ ...it, rowKey: String(it.id || `i${idx}`) }));
  const sheetMatrix = sites.map((site) => ({
    siteId: site.id,
    siteName: site.name || site.id,
    cells: items.map((it) => {
      const iid = String(it.id || '');
      const key = `${site.id}|${iid}`;
      const currentVal = cells[key] != null ? String(cells[key]) : '';
      const labels = it.optionLabels || [];
      const selectMode = it.fieldType === 'SELECT' && labels.length > 0;
      let selectIndex = labels.indexOf(currentVal);
      if (selectIndex < 0) selectIndex = 0;
      return {
        key,
        label: it.label,
        value: currentVal,
        selectMode,
        optionLabels: labels,
        selectIndex,
      };
    }),
  }));
  return { sheetItems, sheetMatrix };
}

Page({
  data: {
    pageGateOk: false,
    loading: false,
    sites: [],
    siteNames: ['全部'],
    sitePickerIndex: 0,
    // 当日巡查表排在最末（用户 2026-09-21 定），默认停第一个 tab —— 默认停在末尾那个会显得像坏了
    activeTab: 'cons',
    total: 0,
    consRows: [],
    repRows: [],
    consGroups: [],
    repGroups: [],
    addPopup: false,
    editingId: '',
    popupSiteSheetShow: false,
    popupSitePickerIndex: -1,
    popupSiteName: '',
    formConsName: '',
    formConsQty: '',
    formConsUnit: '',
    formConsNote: '',
    formConsOccurredAt: '',
    formRepType: '',
    formRepNote: '',
    formRepAt: '',
    consumableCatalog: [],
    catalogNames: [],
    catalogPickerIndex: 0,
    replacementPresets: [],
    presetPickList: [],
    repSelectedPresets: [],
    repSelectedText: '',
    sheetDate: todayStr(),
    tplNames: [''],
    tplIds: [''],
    tplPickerIndex: 0,
    sheet: null,
    sheetStatusText: '',
    sheetItems: [],
    sheetMatrix: [],
    exportBusy: false,
    deleteConfirmShow: false,
    deleteConfirmTitle: '',
    pendingDeleteConsId: '',
    pendingDeleteRepId: '',
    siteFilterSheetShow: false,
    dateSheetShow: false,
    tplSheetShow: false,
    catalogSheetShow: false,
    dateSheetRows: buildDateSheetRows(),
    timePickerShow: false,
    timePickerFor: '',
    timePickerValue: Date.now(),
    pickerMinTs: Date.now() - 86400000 * 365 * 10,
    pickerMaxTs: Date.now() + 86400000 * 365 * 2,
  },

  _pendingCells: {},
  _sheetSaveTimer: null,
  _sheetPollTimer: null,

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/facilityMaintenance/index', role, 'STAFF')) return;
    // 等 wx:if 主树挂载后再拉数，避免 van-tabs 内 rAF/getRect 时组件树未就绪（utils.js getRect → component undefined）
    this.setData({ pageGateOk: true }, () => this.bootstrap());
  },

  onUnload() {
    if (this._sheetSaveTimer) clearTimeout(this._sheetSaveTimer);
    if (this._sheetPollTimer) clearInterval(this._sheetPollTimer);
  },

  onHide() {
    if (this._sheetPollTimer) {
      clearInterval(this._sheetPollTimer);
      this._sheetPollTimer = null;
    }
  },

  onPullDownRefresh() {
    const tab = this.data.activeTab;
    if (tab === 'daily') {
      this.refreshDailySheet()
        .catch(() => {})
        .finally(() => wx.stopPullDownRefresh());
      return;
    }
    this.loadActive(true).finally(() => wx.stopPullDownRefresh());
  },

  goHistory() {
    wx.navigateTo({ url: '/package-feature/pages/facilityMaintenance/historyInsp' });
  },

  goSettings() {
    wx.navigateTo({ url: '/package-feature/pages/facilityMaintenance/settings' });
  },

  async bootstrap() {
    try {
      const raw = await fmApi.listSites(false);
      const sites = Array.isArray(raw) ? raw : [];
      const siteNames = ['全部'].concat(sites.map((s) => s.name || s.id));
      await this.loadTemplatesForDaily();
      const [catalog, presets] = await Promise.all([
        fmApi.listConsumableCatalog(false).catch(() => []),
        fmApi.listReplacementPresets(false).catch(() => []),
      ]);
      const catalogList = Array.isArray(catalog) ? catalog : [];
      const presetList = Array.isArray(presets) ? presets : [];
      this.setData(
        {
          sites,
          siteNames,
          consumableCatalog: catalogList,
          catalogNames: ['手动输入'].concat(catalogList.map((c) => c.name || c.id)),
          replacementPresets: presetList,
          presetPickList: buildPresetPickList(presetList, []),
          repSelectedPresets: [],
          repSelectedText: '',
        },
        () => this.loadActive(true),
      );
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  async loadTemplatesForDaily() {
    try {
      const raw = await fmApi.listTemplates(undefined);
      const list = Array.isArray(raw) ? raw : [];
      const tplNames = [''].concat(list.map((t) => t.name || t.id));
      const tplIds = [''].concat(list.map((t) => t.id));
      this.setData({ tplNames, tplIds });
    } catch (e) {
      this.setData({ tplNames: [''], tplIds: [''] });
    }
  },

  siteIdFilter() {
    const idx = this.data.sitePickerIndex;
    if (!idx) return '';
    const s = this.data.sites[idx - 1];
    return s ? s.id : '';
  },

  selectedSiteIdForWrite() {
    const id = this.siteIdFilter();
    if (id) return id;
    const list = this.data.sites || [];
    if (list.length === 1) return list[0].id;
    return '';
  },

  openSiteFilterSheet() {
    this.setData({ siteFilterSheetShow: true });
  },
  closeSiteFilterSheet() {
    this.setData({ siteFilterSheetShow: false });
  },
  pickSiteFilter(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx)) return;
    this.setData({ sitePickerIndex: idx, siteFilterSheetShow: false }, () => this.loadActive(true));
  },
  openDateSheet() {
    this.setData({ dateSheetShow: true });
  },
  closeDateSheet() {
    this.setData({ dateSheetShow: false });
  },
  pickSheetDate(e) {
    const v = e.currentTarget.dataset.value;
    if (!v) return;
    if (this._sheetPollTimer) {
      clearInterval(this._sheetPollTimer);
      this._sheetPollTimer = null;
    }
    this.setData({
      sheetDate: v,
      dateSheetShow: false,
      sheet: null,
      sheetMatrix: [],
      sheetItems: [],
    });
  },
  openTplSheet() {
    this.setData({ tplSheetShow: true });
  },
  closeTplSheet() {
    this.setData({ tplSheetShow: false });
  },
  pickTplIndex(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx)) return;
    this.setData({ tplPickerIndex: idx, tplSheetShow: false });
  },
  openCatalogSheet() {
    this.setData({ catalogSheetShow: true });
  },
  closeCatalogSheet() {
    this.setData({ catalogSheetShow: false });
  },
  pickCatalogIndex(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const list = this.data.consumableCatalog || [];
    if (idx <= 0) {
      this.setData({ catalogPickerIndex: 0, catalogSheetShow: false });
      return;
    }
    const row = list[idx - 1];
    this.setData({
      catalogPickerIndex: idx,
      catalogSheetShow: false,
      formConsName: (row && row.name) || '',
      formConsUnit: (row && row.unit) || this.data.formConsUnit || '件',
    });
  },

  onTabChange(e) {
    const name = (e.detail && e.detail.name) || 'cons';
    this.setData({ activeTab: name }, () => {
      if (name === 'daily') {
        this.startSheetPollIfNeeded();
      } else {
        if (this._sheetPollTimer) {
          clearInterval(this._sheetPollTimer);
          this._sheetPollTimer = null;
        }
        this.loadActive(true);
      }
    });
  },

  async openDailySheet() {
    const tid = this.data.tplIds[this.data.tplPickerIndex];
    if (!tid) {
      wx.showToast({ title: '请先选择巡查模板', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const data = await fmApi.getOrCreateDailySheet(this.data.sheetDate, tid);
      this.applySheet(data);
      wx.showToast({ title: '已打开', icon: 'success' });
      this.startSheetPollIfNeeded();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async refreshDailySheet() {
    if (!this.data.sheet || !this.data.sheet.id) {
      await this.openDailySheet();
      return;
    }
    try {
      const data = await fmApi.getOrCreateDailySheet(this.data.sheetDate, undefined);
      this.applySheet(data);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '刷新失败', icon: 'none' });
    }
  },

  deleteDailySheetTap() {
    const sid = this.data.sheet && this.data.sheet.id;
    if (!sid) {
      wx.showToast({ title: '暂无表', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除当日巡查表',
      content: '删除后该日期可重新选模板打开；格子内容会丢失。多人协作时请谨慎。',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await fmApi.deleteDailySheet(sid);
          wx.showToast({ title: '已删除', icon: 'success' });
          if (this._sheetPollTimer) {
            clearInterval(this._sheetPollTimer);
            this._sheetPollTimer = null;
          }
          this.setData({ sheet: null, sheetItems: [], sheetMatrix: [], sheetStatusText: '' });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  applySheet(data) {
    const { sheetItems, sheetMatrix } = rebuildMatrixFromSheet(data);
    const st = String((data && data.status) || '');
    this.setData({
      sheet: data,
      sheetStatusText: st === 'SUBMITTED' ? '已登记' : '填写中',
      sheetItems,
      sheetMatrix,
    });
    if (data && data.templateId) {
      const idx = this.data.tplIds.indexOf(String(data.templateId));
      if (idx > 0) this.setData({ tplPickerIndex: idx });
    }
  },

  startSheetPollIfNeeded() {
    if (this.data.activeTab !== 'daily' || !this.data.sheet || !this.data.sheet.id) return;
    if (this._sheetPollTimer) clearInterval(this._sheetPollTimer);
    this._sheetPollTimer = setInterval(() => {
      if (this.data.activeTab !== 'daily' || !this.data.sheet || !this.data.sheet.id) return;
      fmApi
        .getOrCreateDailySheet(this.data.sheetDate, undefined)
        .then((data) => this.applySheet(data))
        .catch(() => {});
    }, 5000);
  },

  onMatrixCellInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    const matrix = (this.data.sheetMatrix || []).map((row) => ({
      ...row,
      cells: (row.cells || []).map((c) => (c.key === key ? { ...c, value } : c)),
    }));
    this.setData({ sheetMatrix: matrix });
    this._pendingCells = this._pendingCells || {};
    this._pendingCells[key] = value;
    this.scheduleSheetSave();
  },

  onMatrixSelectPick(e) {
    const key = e.currentTarget.dataset.key;
    const idx = Number(e.detail.value);
    let labels = [];
    (this.data.sheetMatrix || []).some((row) =>
      (row.cells || []).some((c) => {
        if (c.key === key) {
          labels = c.optionLabels || [];
          return true;
        }
        return false;
      }),
    );
    const value = labels[idx] != null ? String(labels[idx]) : '';
    const matrix = (this.data.sheetMatrix || []).map((row) => ({
      ...row,
      cells: (row.cells || []).map((c) => {
        if (c.key !== key) return c;
        const nextIdx = labels.length ? Math.max(0, Math.min(idx, labels.length - 1)) : 0;
        return { ...c, value, selectIndex: nextIdx };
      }),
    }));
    this.setData({ sheetMatrix: matrix });
    this._pendingCells = this._pendingCells || {};
    this._pendingCells[key] = value;
    this.scheduleSheetSave();
  },

  scheduleSheetSave() {
    if (this._sheetSaveTimer) clearTimeout(this._sheetSaveTimer);
    this._sheetSaveTimer = setTimeout(() => this.flushSheetSave(), 600);
  },

  async flushSheetSave() {
    const pending = this._pendingCells || {};
    this._pendingCells = {};
    const keys = Object.keys(pending);
    if (keys.length === 0) return;
    const s = this.data.sheet;
    if (!s || !s.id) return;
    const cells = {};
    keys.forEach((k) => {
      cells[k] = pending[k];
    });
    try {
      const ver = Number(s.version ?? 0);
      const merged = await fmApi.patchDailySheet(String(s.id), { cells, version: ver });
      // 保存后仅合并当前 sheet（PATCH 返回体），禁止整表 reload — post-save-no-full-refresh.mdc
      this.applySheet(merged);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      try {
        const data = await fmApi.getOrCreateDailySheet(this.data.sheetDate, undefined);
        this.applySheet(data);
      } catch (e2) {
        /* ignore */
      }
    }
  },

  async submitDailySheet() {
    const s = this.data.sheet;
    if (!s || !s.id) return;
    wx.showLoading({ title: '提交中', mask: true });
    try {
      await fmApi.submitDailySheet(String(s.id));
      wx.showToast({ title: '已登记', icon: 'success' });
      const data = await fmApi.getOrCreateDailySheet(this.data.sheetDate, undefined);
      this.applySheet(data);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async exportDailyExcel() {
    const s = this.data.sheet;
    if (!s || !s.id || this.data.exportBusy) return;
    this.setData({ exportBusy: true });
    wx.showLoading({ title: '导出中', mask: true });
    try {
      const { data } = await fmApi.exportDailySheetExcel(String(s.id));
      await springAuth.saveAndOpenDocument(data, `daily-inspection-${this.data.sheetDate}.xlsx`, 'xlsx');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportBusy: false });
    }
  },

  async exportLedger(scope) {
    if (this.data.exportBusy) return;
    this.setData({ exportBusy: true });
    wx.showLoading({ title: '导出中', mask: true });
    try {
      const { data } = await fmApi.exportLedgerExcel(scope);
      const name = scope === 'replacements' ? 'facility-maintenance-replacements' : 'facility-maintenance-consumables';
      await springAuth.saveAndOpenDocument(data, `${name}-${Date.now()}.xlsx`, 'xlsx');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportBusy: false });
    }
  },

  exportConsExcel() {
    this.exportLedger('consumables');
  },

  exportRepExcel() {
    this.exportLedger('replacements');
  },

  /**
   * 台账**一次拉全**。
   *
   * 原来是 20 条一页 + 触底加载更多，但这两个 tab 的列表是**按名称/类型分组**的：
   * 分组的条数和日期区间只能从「已加载的那部分」算 —— 刚进 tab 时「阻垢剂 ×6」，
   * 滚到底才变成 ×72；完全没滚到底时，只存在于后续页的分组压根不出现。
   * 用户看到的就是「只有最近几条，历史不见了」。
   *
   * 这几张台账天然是低量数据（机房 × 耗材种类，实测真实数据只有 40 / 32 条），
   * 一次拉全最省事也最准，顺带省掉了每追加一页就重建整棵分组树的 O(n²)。
   * 后端 size 上限 200，超了自动翻页；MAX_PAGES 只是防失控的兜底。
   */
  async loadActive(reset) {
    const tab = this.data.activeTab;
    if (tab === 'daily') return;
    const siteId = this.siteIdFilter();
    if (reset) this.setData({ loading: true });
    try {
      let all = [];
      let total = 0;
      for (let page = 1; page <= LEDGER_MAX_PAGES; page += 1) {
        const data = tab === 'cons'
          ? await fmApi.listConsumables(siteId, page, LEDGER_PAGE_SIZE)
          : await fmApi.listReplacements(siteId, page, LEDGER_PAGE_SIZE);
        const rows = (data && data.rows) || [];
        total = (data && data.total) || 0;
        all = all.concat(rows);
        if (rows.length < LEDGER_PAGE_SIZE || all.length >= total) break;
      }
      const decorated = all.map((r) => {
        const copy = { ...r };
        if (copy.occurredAt) copy.occurredAtText = formatBackendDateOnly(copy.occurredAt);
        if (copy.replacedAt) copy.replacedAtText = formatBackendDateOnly(copy.replacedAt);
        return copy;
      });
      if (tab === 'cons') {
        this.setData({
          total,
          consRows: decorated,
          consGroups: groupByKey(decorated, (r) => r.consumableName || '未命名', openStateOf(this.data.consGroups)),
        });
      } else {
        this.setData({
          total,
          repRows: decorated,
          repGroups: groupByKey(decorated, (r) => r.filterType || '未分类', openStateOf(this.data.repGroups)),
        });
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openAddPopup(opts) {
    const keepType = opts && opts.keepType;
    // 弹窗内机房选择：继承顶部筛选，若为"全部"且只有一个机房则自动选中
    const sites = this.data.sites || [];
    let popupSitePickerIndex = -1;
    let popupSiteName = '';
    const topIdx = this.data.sitePickerIndex;
    if (topIdx > 0 && sites[topIdx - 1]) {
      // 顶部已选具体机房 → 继承
      popupSitePickerIndex = topIdx - 1;
      popupSiteName = sites[topIdx - 1].name || '';
    } else if (sites.length === 1) {
      // 只有一个机房 → 自动选中
      popupSitePickerIndex = 0;
      popupSiteName = sites[0].name || '';
    }
    const selectedForPopup = keepType ? this.data.repSelectedPresets || [] : [];
    const presetPickList = buildPresetPickList(this.data.replacementPresets, selectedForPopup);
    const repSelectedPresets = selectedLabelsFromPickList(presetPickList);
    this.setData({
      addPopup: true,
      editingId: '',
      popupSiteSheetShow: false,
      popupSitePickerIndex,
      popupSiteName,
      formConsName: '',
      formConsQty: '',
      formConsUnit: '',
      formConsNote: '',
      formConsOccurredAt: todayStr(),
      formRepType: keepType ? this.data.formRepType : '',
      formRepNote: '',
      formRepAt: todayStr(),
      catalogPickerIndex: 0,
      presetPickList,
      repSelectedPresets,
      repSelectedText: selectedLabelsText(repSelectedPresets),
    });
  },

  closeAddPopup() {
    const presetPickList = buildPresetPickList(this.data.replacementPresets, []);
    this.setData({
      addPopup: false,
      editingId: '',
      timePickerShow: false,
      timePickerFor: '',
      popupSiteSheetShow: false,
      presetPickList,
      repSelectedPresets: [],
      repSelectedText: '',
    });
  },

  /** 同步预设多选 UI（WXML 只读 item.selected，禁止在模板里 indexOf） */
  _applyPresetSelection(selectedLabels) {
    const presetPickList = buildPresetPickList(this.data.replacementPresets, selectedLabels);
    const repSelectedPresets = selectedLabelsFromPickList(presetPickList);
    this.setData({
      presetPickList,
      repSelectedPresets,
      repSelectedText: selectedLabelsText(repSelectedPresets),
    });
  },

  // 弹窗内机房选择
  openSiteSheetInPopup() {
    this.setData({ popupSiteSheetShow: true });
  },
  closeSiteSheetInPopup() {
    this.setData({ popupSiteSheetShow: false });
  },
  pickSiteInPopup(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx)) return;
    const sites = this.data.sites || [];
    const s = sites[idx];
    this.setData({
      popupSitePickerIndex: idx,
      popupSiteName: s ? (s.name || s.id) : '',
      popupSiteSheetShow: false,
    });
  },

  onConsName(e) {
    this.setData({ formConsName: e.detail || '' });
  },
  onConsQty(e) {
    this.setData({ formConsQty: e.detail || '' });
  },
  onConsUnit(e) {
    this.setData({ formConsUnit: e.detail || '' });
  },
  onConsNote(e) {
    this.setData({ formConsNote: e.detail || '' });
  },
  _tsFromDatetimePickerDetail(detail) {
    if (detail == null) return Date.now();
    if (typeof detail === 'number') return detail;
    if (typeof detail === 'object' && typeof detail.getTime === 'function') return detail.getTime();
    const t = new Date(detail).getTime();
    return Number.isNaN(t) ? Date.now() : t;
  },

  openConsAtPicker() {
    this.setData({
      timePickerShow: true,
      timePickerFor: 'cons',
      timePickerValue: wallTextToTimestampForPicker(this.data.formConsOccurredAt),
    });
  },

  openRepAtPicker() {
    this.setData({
      timePickerShow: true,
      timePickerFor: 'rep',
      timePickerValue: wallTextToTimestampForPicker(this.data.formRepAt),
    });
  },

  closeTimePicker() {
    this.setData({ timePickerShow: false, timePickerFor: '' });
  },

  onTimePickerInput(e) {
    const ts = this._tsFromDatetimePickerDetail(e.detail);
    this.setData({ timePickerValue: ts });
  },

  confirmTimePicker(e) {
    const ts = this._tsFromDatetimePickerDetail(e.detail != null ? e.detail : this.data.timePickerValue);
    const text = tsToDateStr(ts);
    const forKey = this.data.timePickerFor;
    if (forKey === 'cons') this.setData({ formConsOccurredAt: text, timePickerShow: false, timePickerFor: '' });
    else if (forKey === 'rep') this.setData({ formRepAt: text, timePickerShow: false, timePickerFor: '' });
    else this.setData({ timePickerShow: false, timePickerFor: '' });
  },
  onRepType(e) {
    this.setData({ formRepType: e.detail || '' });
  },
  onRepNote(e) {
    this.setData({ formRepNote: e.detail || '' });
  },
  tapPreset(e) {
    const label = e.currentTarget.dataset.label;
    if (!label) return;
    if (this.data.addPopup) {
      this._togglePresetLabel(label);
    } else {
      this._applyPresetSelection([label]);
      this.openAddPopup({ keepType: true });
    }
  },

  /** 弹窗内 toggle 一行预设（纯 view bindtap，无 checkbox 组件冲突） */
  onTogglePresetInPopup(e) {
    const label = e.currentTarget.dataset.label;
    if (!label) return;
    this._togglePresetLabel(label);
  },

  _togglePresetLabel(label) {
    if (this.data.editingId) {
      this._applyPresetSelection([label]);
      this.setData({ formRepType: label });
      return;
    }
    const cur = selectedLabelsFromPickList(this.data.presetPickList);
    const idx = cur.indexOf(label);
    if (idx >= 0) {
      cur.splice(idx, 1);
    } else {
      cur.push(label);
    }
    this._applyPresetSelection(cur);
  },

  editCons(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.consRows || []).find((x) => x.id === id);
    if (!row) return;
    const sites = this.data.sites || [];
    const si = sites.findIndex((s) => s.id === row.siteId);
    this.setData({
      addPopup: true,
      editingId: id,
      popupSiteSheetShow: false,
      popupSitePickerIndex: si >= 0 ? si : -1,
      popupSiteName: si >= 0 ? (sites[si].name || '') : (row.siteName || ''),
      formConsName: row.consumableName || '',
      formConsQty: row.qty != null ? String(row.qty) : '',
      formConsUnit: row.unit || '',
      formConsNote: row.note || '',
      formConsOccurredAt: row.occurredAt ? formatBackendDateOnly(row.occurredAt) : '',
      catalogPickerIndex: 0,
    });
  },

  editRep(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.repRows || []).find((x) => x.id === id);
    if (!row) return;
    const ra = row.replacedAt ? formatBackendDateOnly(row.replacedAt) : '';
    const ft = row.filterType || '';
    const sites = this.data.sites || [];
    const si = sites.findIndex((s) => s.id === row.siteId);
    const presetPickList = buildPresetPickList(this.data.replacementPresets, ft ? [ft] : []);
    const repSelectedPresets = selectedLabelsFromPickList(presetPickList);
    this.setData({
      addPopup: true,
      editingId: id,
      popupSiteSheetShow: false,
      popupSitePickerIndex: si >= 0 ? si : -1,
      popupSiteName: si >= 0 ? (sites[si].name || '') : (row.siteName || ''),
      formRepType: ft,
      formRepNote: row.note || '',
      formRepAt: ra,
      presetPickList,
      repSelectedPresets,
      repSelectedText: selectedLabelsText(repSelectedPresets),
    });
  },

  mergeConsRow(id, patch) {
    const rows = (this.data.consRows || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
    const decorated = rows.map((r) => {
      const copy = { ...r };
      if (copy.occurredAt) copy.occurredAtText = formatBackendDateOnly(copy.occurredAt);
      return copy;
    });
    this.setData({ consRows: decorated });
    this.rebuildConsGroups();
  },

  mergeRepRow(id, patch) {
    const rows = (this.data.repRows || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
    const decorated = rows.map((r) => {
      const copy = { ...r };
      if (copy.replacedAt) copy.replacedAtText = formatBackendDateOnly(copy.replacedAt);
      return copy;
    });
    this.setData({ repRows: decorated });
    this.rebuildRepGroups();
  },

  rebuildConsGroups() {
    const groups = groupByKey(this.data.consRows || [], (r) => r.consumableName || '未命名');
    this.setData({ consGroups: groups });
  },
  rebuildRepGroups() {
    const groups = groupByKey(this.data.repRows || [], (r) => r.filterType || '未分类');
    this.setData({ repGroups: groups });
  },
  toggleConsGroup(e) {
    const name = e.currentTarget.dataset.name;
    const groups = (this.data.consGroups || []).map((g) =>
      g.name === name ? { ...g, open: !g.open } : g,
    );
    this.setData({ consGroups: groups });
  },
  toggleRepGroup(e) {
    const name = e.currentTarget.dataset.name;
    const groups = (this.data.repGroups || []).map((g) =>
      g.name === name ? { ...g, open: !g.open } : g,
    );
    this.setData({ repGroups: groups });
  },

  async submitAdd() {
    // 优先使用弹窗内选择的机房，否则fallback到顶部筛选
    const sites = this.data.sites || [];
    let siteId = '';
    if (this.data.popupSitePickerIndex >= 0 && sites[this.data.popupSitePickerIndex]) {
      siteId = sites[this.data.popupSitePickerIndex].id;
    }
    if (!siteId) {
      siteId = this.selectedSiteIdForWrite();
    }
    if (!siteId) {
      wx.showToast({ title: '请选择机房', icon: 'none' });
      return;
    }
    const tab = this.data.activeTab;
    const editingId = this.data.editingId;
    wx.showLoading({ title: '提交中', mask: true });
    try {
      if (tab === 'cons') {
        const qty = Number(this.data.formConsQty);
        if (!this.data.formConsName.trim() || Number.isNaN(qty)) {
          wx.hideLoading();
          wx.showToast({ title: '请填写耗材名称与数量', icon: 'none' });
          return;
        }
        const dateStr = this.data.formConsOccurredAt;
        let occurredAtApi = dateStr ? dateStr + 'T00:00:00' : toLocalDateTimeNoTz(new Date());
        if (editingId) {
          await fmApi.patchConsumable(editingId, {
            siteId,
            consumableName: this.data.formConsName.trim(),
            qty,
            unit: (this.data.formConsUnit || '').trim() || undefined,
            occurredAt: occurredAtApi,
            note: (this.data.formConsNote || '').trim() || undefined,
          });
          // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
          const siteName = (sites[this.data.popupSitePickerIndex] || {}).name || '';
          this.mergeConsRow(editingId, {
            siteId,
            siteName,
            consumableName: this.data.formConsName.trim(),
            qty,
            unit: (this.data.formConsUnit || '').trim(),
            occurredAt: occurredAtApi,
            note: (this.data.formConsNote || '').trim(),
          });
        } else {
          const created = await fmApi.createConsumable({
            siteId,
            consumableName: this.data.formConsName.trim(),
            qty,
            unit: (this.data.formConsUnit || '').trim() || undefined,
            occurredAt: occurredAtApi,
            note: (this.data.formConsNote || '').trim() || undefined,
          });
          const sid = this.data.sites.find((s) => s.id === siteId);
          const newRow = {
            id: created && created.id,
            siteId,
            siteName: sid ? sid.name : '',
            consumableName: this.data.formConsName.trim(),
            qty,
            unit: (this.data.formConsUnit || '').trim(),
            occurredAt: occurredAtApi,
            note: (this.data.formConsNote || '').trim(),
            occurredAtText: formatBackendDateOnly(occurredAtApi),
          };
          this.setData({ consRows: [newRow].concat(this.data.consRows || []) }, () => this.rebuildConsGroups());
        }
      } else {
        const selectedPresets = this.data.repSelectedPresets || [];
        // 兼容：如果 checkbox 没选但表单有旧类型字段值，则作为单条创建
        const types = selectedPresets.length > 0
          ? selectedPresets
          : (this.data.formRepType || '').trim() ? [this.data.formRepType.trim()] : [];
        if (types.length === 0) {
          wx.hideLoading();
          wx.showToast({ title: '请选择至少一个过滤器类型', icon: 'none' });
          return;
        }
        const dateStrRep = this.data.formRepAt;
        let replacedAtApi = dateStrRep ? dateStrRep + 'T00:00:00' : toLocalDateTimeNoTz(new Date());
        const note = (this.data.formRepNote || '').trim() || undefined;
        if (editingId) {
          // 编辑模式：仅更新单条
          await fmApi.patchReplacement(editingId, {
            siteId,
            filterType: types[0],
            replacedAt: replacedAtApi,
            note,
          });
          const siteNameRep = (sites[this.data.popupSitePickerIndex] || {}).name || '';
          this.mergeRepRow(editingId, {
            siteId,
            siteName: siteNameRep,
            filterType: types[0],
            replacedAt: replacedAtApi,
            note,
          });
        } else {
          // 新增模式：批量创建（多选优先走 batch 接口，失败则逐条兜底）
          const newRows = [];
          if (types.length > 1) {
            let batchOk = false;
            try {
              const results = await fmApi.createReplacementBatch({
                siteId,
                filterTypes: types,
                replacedAt: replacedAtApi,
                note,
              });
              const sid = this.data.sites.find((s) => s.id === siteId);
              (results || []).forEach((r) => {
                newRows.push({
                  id: r && r.id,
                  siteId,
                  siteName: sid ? sid.name : '',
                  filterType: r.filterType || '',
                  replacedAt: replacedAtApi,
                  note,
                  replacedAtText: formatBackendDateOnly(replacedAtApi),
                  daysSincePrevious: null,
                });
              });
              batchOk = true;
            } catch (_) {
              // batch 接口不可用（后端未重启等）→ 自动降级逐条创建
            }
            if (!batchOk) {
              for (const ft of types) {
                const created = await fmApi.createReplacement({
                  siteId,
                  filterType: ft,
                  replacedAt: replacedAtApi,
                  note,
                });
                const sid = this.data.sites.find((s) => s.id === siteId);
                newRows.push({
                  id: created && created.id,
                  siteId,
                  siteName: sid ? sid.name : '',
                  filterType: ft,
                  replacedAt: replacedAtApi,
                  note,
                  replacedAtText: formatBackendDateOnly(replacedAtApi),
                  daysSincePrevious: null,
                });
              }
            }
          } else {
            // 单选 → 保持原单条接口
            for (const ft of types) {
              const created = await fmApi.createReplacement({
                siteId,
                filterType: ft,
                replacedAt: replacedAtApi,
                note,
              });
              const sid = this.data.sites.find((s) => s.id === siteId);
              newRows.push({
                id: created && created.id,
                siteId,
                siteName: sid ? sid.name : '',
                filterType: ft,
                replacedAt: replacedAtApi,
                note,
                replacedAtText: formatBackendDateOnly(replacedAtApi),
                daysSincePrevious: null,
              });
            }
          }
          this.setData({ repRows: newRows.concat(this.data.repRows || []) }, () => {
            this.rebuildRepGroups();
          });
        }
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeAddPopup();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  noop() {},

  onDeleteCons(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({
      deleteConfirmShow: true,
      deleteConfirmTitle: '删除耗材记录',
      pendingDeleteConsId: id,
      pendingDeleteRepId: '',
    });
  },

  onDeleteRep(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({
      deleteConfirmShow: true,
      deleteConfirmTitle: '删除更换记录',
      pendingDeleteConsId: '',
      pendingDeleteRepId: id,
    });
  },

  cancelDeleteConfirm() {
    this.setData({
      deleteConfirmShow: false,
      deleteConfirmTitle: '',
      pendingDeleteConsId: '',
      pendingDeleteRepId: '',
    });
  },

  async runDeleteConfirm() {
    const cid = this.data.pendingDeleteConsId;
    const rid = this.data.pendingDeleteRepId;
    this.cancelDeleteConfirm();
    try {
      if (cid) {
        await fmApi.deleteConsumable(cid);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.setData({ consRows: (this.data.consRows || []).filter((r) => r.id !== cid) }, () => this.rebuildConsGroups());
      } else if (rid) {
        await fmApi.deleteReplacement(rid);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.setData({ repRows: (this.data.repRows || []).filter((r) => r.id !== rid) }, () => this.rebuildRepGroups());
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  },
});
