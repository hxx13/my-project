const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const fmApi = require('../../utils/facilityMaintenanceApi.js');

const FIELD_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'DATETIME'];
const FIELD_TYPE_LABELS = ['文本', '数字', '是/否', '下拉', '日期时间'];

function decorateOptionSet(o) {
  const items = o.items || [];
  const preview = items
    .map((x) => x.label)
    .filter(Boolean)
    .slice(0, 5)
    .join('、');
  return { ...o, _itemPreview: preview || '（无选项）' };
}

function siteIdsLabel(sites, tpl) {
  const raw =
    tpl.siteIds && tpl.siteIds.length
      ? tpl.siteIds
      : tpl.siteId
        ? [tpl.siteId]
        : [];
  if (!raw.length) return '全局';
  return raw
    .map((id) => {
      const s = (sites || []).find((x) => x.id === id);
      return s ? s.name || id : id;
    })
    .join('、');
}

Page({
  data: {
    pageGateOk: false,
    subTab: 'sites',
    sites: [],
    optionSets: [],
    templates: [],
    consumableCatalog: [],
    replacementPresets: [],
    sitePopup: false,
    siteEditId: '',
    siteName: '',
    siteCode: '',
    siteOrder: '0',
    optPopup: false,
    optEditId: '',
    optName: '',
    optLines: '',
    tplPopup: false,
    tplEditId: '',
    tplName: '',
    tplCheckboxSites: [],
    tplSelectedValues: [],
    tplItemRows: [],
    fieldTypeLabels: FIELD_TYPE_LABELS,
    optSetNamesForPicker: ['（无）'],
    catPopup: false,
    catEditId: '',
    catName: '',
    catUnit: '件',
    presetPopup: false,
    presetEditId: '',
    presetLabel: '',
    genPick: { show: false, title: '', rows: [], action: '', payload: '', highlightIdx: -1 },
  },

  _allSites: [],

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/facilityMaintenance/settings', role, 'STAFF')) return;
    this.setData({ pageGateOk: true }, () => this.reloadAll());
  },

  onSubTabChange(e) {
    const name = (e.detail && e.detail.name) || 'sites';
    this.setData({ subTab: name });
  },

  async reloadAll() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const [sitesRaw, opts, tpls, cats, presets] = await Promise.all([
        fmApi.listSites(true),
        fmApi.listOptionSets(),
        fmApi.listTemplates(undefined),
        fmApi.listConsumableCatalog(true),
        fmApi.listReplacementPresets(true),
      ]);
      this._allSites = Array.isArray(sitesRaw) ? sitesRaw : [];
      const sites = this._allSites.map((s) => ({
        ...s,
        sortOrder: s.sortOrder != null ? s.sortOrder : s.sort_order,
        disabled: Number(s.disabled) === 1 ? 1 : 0,
      }));
      const optArr = Array.isArray(opts) ? opts : [];
      const tplArr = Array.isArray(tpls) ? tpls : [];
      const optionSets = optArr.map(decorateOptionSet);
      const templates = tplArr.map((t) => ({
        ...t,
        _siteLabel: siteIdsLabel(sites, t),
      }));
      this.setData({
        sites,
        optionSets,
        templates,
        consumableCatalog: Array.isArray(cats) ? cats : [],
        replacementPresets: Array.isArray(presets) ? presets : [],
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  refreshTemplatesOnly() {
    return fmApi.listTemplates(undefined).then((tpls) => {
      const sites = this.data.sites || [];
      const tplArr = Array.isArray(tpls) ? tpls : [];
      const templates = tplArr.map((t) => ({
        ...t,
        _siteLabel: siteIdsLabel(sites, t),
      }));
      this.setData({ templates });
    });
  },

  /* --- Sites --- */
  openNewSite() {
    this.setData({
      sitePopup: true,
      siteEditId: '',
      siteName: '',
      siteCode: '',
      siteOrder: '0',
    });
  },
  editSite(e) {
    const id = e.currentTarget.dataset.id;
    const s = (this.data.sites || []).find((x) => x.id === id);
    if (!s) return;
    this.setData({
      sitePopup: true,
      siteEditId: id,
      siteName: s.name || '',
      siteCode: s.code || '',
      siteOrder: String(s.sortOrder != null ? s.sortOrder : s.sort_order ?? 0),
    });
  },
  closeSitePopup() {
    this.setData({ sitePopup: false, siteEditId: '' });
  },
  onSiteName(e) {
    this.setData({ siteName: e.detail || '' });
  },
  onSiteCode(e) {
    this.setData({ siteCode: e.detail || '' });
  },
  onSiteOrder(e) {
    this.setData({ siteOrder: e.detail || '0' });
  },
  async saveSite() {
    const name = (this.data.siteName || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    try {
      if (this.data.siteEditId) {
        await fmApi.patchSite(this.data.siteEditId, {
          name,
          code: (this.data.siteCode || '').trim() || null,
          sortOrder: parseInt(this.data.siteOrder, 10) || 0,
        });
      } else {
        await fmApi.createSite({
          name,
          code: (this.data.siteCode || '').trim() || undefined,
          sortOrder: parseInt(this.data.siteOrder, 10) || 0,
        });
      }
      // 保存后仅同步机房列表，禁止整表 reload — post-save-no-full-refresh.mdc
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeSitePopup();
      const sitesRaw = await fmApi.listSites(true);
      this._allSites = Array.isArray(sitesRaw) ? sitesRaw : [];
      const sites = this._allSites.map((s) => ({
        ...s,
        sortOrder: s.sortOrder != null ? s.sortOrder : s.sort_order,
        disabled: Number(s.disabled) === 1 ? 1 : 0,
      }));
      this.setData({ sites });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  disableSite(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '停用机房',
      content: '确定停用？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await fmApi.deleteSite(id);
          wx.showToast({ title: '已停用', icon: 'success' });
          const sitesRaw = await fmApi.listSites(true);
          this._allSites = Array.isArray(sitesRaw) ? sitesRaw : [];
          const sites = this._allSites.map((s) => ({
            ...s,
            sortOrder: s.sortOrder != null ? s.sortOrder : s.sort_order,
            disabled: Number(s.disabled) === 1 ? 1 : 0,
          }));
          this.setData({ sites });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
        }
      },
    });
  },
  permanentDeleteSite(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '永久删除',
      content: '不可恢复，确认？',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await fmApi.deleteSitePermanent(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ sites: (this.data.sites || []).filter((s) => s.id !== id) });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
        }
      },
    });
  },

  /* --- Option sets --- */
  openNewOpt() {
    this.setData({ optPopup: true, optEditId: '', optName: '', optLines: '' });
  },
  editOpt(e) {
    const id = e.currentTarget.dataset.id;
    const o = (this.data.optionSets || []).find((x) => x.id === id);
    if (!o) return;
    const lines = (o.items || []).map((it) => it.label).join('\n');
    this.setData({ optPopup: true, optEditId: id, optName: o.name || '', optLines: lines });
  },
  closeOptPopup() {
    this.setData({ optPopup: false, optEditId: '' });
  },
  onOptName(e) {
    this.setData({ optName: e.detail || '' });
  },
  onOptLines(e) {
    this.setData({ optLines: e.detail || '' });
  },
  async saveOpt() {
    const name = (this.data.optName || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }
    const items = (this.data.optLines || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((label, i) => ({ label, sortOrder: i }));
    wx.showLoading({ title: '保存中', mask: true });
    try {
      if (this.data.optEditId) {
        await fmApi.patchOptionSet(this.data.optEditId, { name, items });
      } else {
        await fmApi.createOptionSet({ name, items });
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeOptPopup();
      const opts = await fmApi.listOptionSets();
      this.setData({ optionSets: (opts || []).map(decorateOptionSet) });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  deleteOpt(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除选项集',
      content: '确认删除？',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await fmApi.deleteOptionSet(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ optionSets: (this.data.optionSets || []).filter((x) => x.id !== id) });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
        }
      },
    });
  },

  /* --- Templates --- */
  buildOptPickerNames() {
    const opts = this.data.optionSets || [];
    return ['（无）'].concat(opts.map((o) => o.name || o.id));
  },
  buildOptPickerIds() {
    const opts = this.data.optionSets || [];
    return [''].concat(opts.map((o) => o.id));
  },
  tplCheckboxSitesFromData() {
    const sites = this.data.sites || [];
    return sites.filter((s) => !Number(s.disabled));
  },
  emptyTplItemRow() {
    return {
      label: '',
      fieldType: 'TEXT',
      fieldTypeIndex: 0,
      optionSetId: '',
      optionSetPickerIndex: 0,
      required: false,
    };
  },
  openNewTpl() {
    const names = this.buildOptPickerNames();
    this.setData({
      tplPopup: true,
      tplEditId: '',
      tplName: '',
      tplCheckboxSites: this.tplCheckboxSitesFromData(),
      tplSelectedValues: [],
      tplItemRows: [this.emptyTplItemRow()],
      optSetNamesForPicker: names,
    });
  },
  async editTpl(e) {
    const id = e.currentTarget.dataset.id;
    let t;
    try {
      t = await fmApi.getTemplate(id);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      return;
    }
    const enabled = this.tplCheckboxSitesFromData();
    const rawIds =
      t.siteIds && t.siteIds.length ? t.siteIds : t.siteId ? [t.siteId] : [];
    const tplSelectedValues = rawIds.filter((id) => enabled.some((s) => s.id === id));
    const opts = this.data.optionSets || [];
    const optSetNamesForPicker = ['（无）'].concat(opts.map((o) => o.name || o.id));
    const optSetIdsForPicker = [''].concat(opts.map((o) => o.id));
    const rows = (t.items || []).length
      ? t.items.map((it) => {
          const ft = String(it.fieldType || 'TEXT').toUpperCase();
          const fti = Math.max(0, FIELD_TYPES.indexOf(ft));
          const oid = it.optionSetId || '';
          const opi = Math.max(0, optSetIdsForPicker.indexOf(oid));
          return {
            label: it.label || '',
            fieldType: FIELD_TYPES[fti],
            fieldTypeIndex: fti,
            optionSetId: oid,
            optionSetPickerIndex: opi,
            required: !!(it.required ?? it.requiredFlag === 1),
          };
        })
      : [this.emptyTplItemRow()];
    this.setData({
      tplPopup: true,
      tplEditId: id,
      tplName: t.name || '',
      tplCheckboxSites: enabled,
      tplSelectedValues,
      tplItemRows: rows,
      optSetNamesForPicker,
    });
  },
  closeTplPopup() {
    this.setData({ tplPopup: false, tplEditId: '' });
  },
  onTplName(e) {
    this.setData({ tplName: e.detail || '' });
  },
  closeGenPick() {
    this.setData({ genPick: { show: false, title: '', rows: [], action: '', payload: '', highlightIdx: -1 } });
  },
  onTplSitesChange(e) {
    const v = (e.detail && e.detail.value) || [];
    this.setData({ tplSelectedValues: Array.isArray(v) ? v : [] });
  },
  openFieldTypeSheet(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (Number.isNaN(i)) return;
    const rows = FIELD_TYPE_LABELS.map((label, idx) => ({ label, idx }));
    const cur = (this.data.tplItemRows || [])[i];
    this.setData({
      genPick: {
        show: true,
        title: '字段类型',
        rows,
        action: 'fieldType',
        payload: String(i),
        highlightIdx: cur ? cur.fieldTypeIndex : 0,
      },
    });
  },
  openOptSetSheet(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (Number.isNaN(i)) return;
    const names = this.data.optSetNamesForPicker || [];
    const rows = names.map((label, idx) => ({ label, idx }));
    const cur = (this.data.tplItemRows || [])[i];
    this.setData({
      genPick: {
        show: true,
        title: '选项集',
        rows,
        action: 'optSet',
        payload: String(i),
        highlightIdx: cur ? cur.optionSetPickerIndex : 0,
      },
    });
  },
  onGenPickRow(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx)) return;
    const { action, payload } = this.data.genPick;
    if (action === 'fieldType') {
      const i = Number(payload);
      const rows = (this.data.tplItemRows || []).map((r, j) => {
        if (j !== i) return r;
        const ft = FIELD_TYPES[idx] || 'TEXT';
        return { ...r, fieldTypeIndex: idx, fieldType: ft };
      });
      this.setData({ tplItemRows: rows });
      this.closeGenPick();
      return;
    }
    if (action === 'optSet') {
      const i = Number(payload);
      const opts = this.data.optionSets || [];
      const ids = [''].concat(opts.map((o) => o.id));
      const oid = ids[idx] || '';
      const rows = (this.data.tplItemRows || []).map((r, j) =>
        j === i ? { ...r, optionSetPickerIndex: idx, optionSetId: oid } : r,
      );
      this.setData({ tplItemRows: rows });
      this.closeGenPick();
    }
  },
  addTplItemRow() {
    const rows = (this.data.tplItemRows || []).concat([this.emptyTplItemRow()]);
    this.setData({ tplItemRows: rows });
  },
  removeTplItemRow(e) {
    const i = Number(e.currentTarget.dataset.i);
    const rows = (this.data.tplItemRows || []).filter((_, j) => j !== i);
    this.setData({ tplItemRows: rows.length ? rows : [this.emptyTplItemRow()] });
  },
  onTplItemLabel(e) {
    const i = Number(e.currentTarget.dataset.i);
    const v = e.detail || '';
    const rows = (this.data.tplItemRows || []).map((r, j) => (j === i ? { ...r, label: v } : r));
    this.setData({ tplItemRows: rows });
  },
  onTplItemTypePick(e) {
    const i = Number(e.currentTarget.dataset.i);
    const idx = Number(e.detail.value) || 0;
    const rows = (this.data.tplItemRows || []).map((r, j) => {
      if (j !== i) return r;
      const ft = FIELD_TYPES[idx] || 'TEXT';
      return { ...r, fieldTypeIndex: idx, fieldType: ft };
    });
    this.setData({ tplItemRows: rows });
  },
  onTplItemOptPick(e) {
    const i = Number(e.currentTarget.dataset.i);
    const idx = Number(e.detail.value) || 0;
    const opts = this.data.optionSets || [];
    const ids = [''].concat(opts.map((o) => o.id));
    const oid = ids[idx] || '';
    const rows = (this.data.tplItemRows || []).map((r, j) =>
      j === i ? { ...r, optionSetPickerIndex: idx, optionSetId: oid } : r,
    );
    this.setData({ tplItemRows: rows });
  },
  onTplItemRequired(e) {
    const i = Number(e.currentTarget.dataset.i);
    const d = e.detail;
    const checked = d === true || d === 1 || d === 'true';
    const rows = (this.data.tplItemRows || []).map((r, j) => (j === i ? { ...r, required: checked } : r));
    this.setData({ tplItemRows: rows });
  },
  async saveTpl() {
    const name = (this.data.tplName || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写模板名称', icon: 'none' });
      return;
    }
    const siteIds = Array.isArray(this.data.tplSelectedValues) ? this.data.tplSelectedValues : [];
    const items = (this.data.tplItemRows || [])
      .map((row, i) => ({
        label: (row.label || '').trim(),
        fieldType: row.fieldType || 'TEXT',
        optionSetId: row.fieldType === 'SELECT' ? row.optionSetId || null : null,
        required: !!row.required,
        sortOrder: i,
      }))
      .filter((x) => x.label.length > 0);
    if (!items.length) {
      wx.showToast({ title: '请至少添加一项字段', icon: 'none' });
      return;
    }
    if (items.some((x) => x.fieldType === 'SELECT' && !x.optionSetId)) {
      wx.showToast({ title: '下拉项需选选项集', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    try {
      if (this.data.tplEditId) {
        await fmApi.patchTemplate(this.data.tplEditId, { siteIds, name, items });
      } else {
        await fmApi.createTemplate({ siteIds, name, items });
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeTplPopup();
      await this.refreshTemplatesOnly();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  deleteTpl(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除模板',
      content: '确认删除？',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await fmApi.deleteTemplate(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ templates: (this.data.templates || []).filter((t) => t.id !== id) });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
        }
      },
    });
  },

  /* --- Catalog --- */
  openNewCat() {
    this.setData({ catPopup: true, catEditId: '', catName: '', catUnit: '件' });
  },
  editCat(e) {
    const id = e.currentTarget.dataset.id;
    const c = (this.data.consumableCatalog || []).find((x) => x.id === id);
    if (!c) return;
    this.setData({
      catPopup: true,
      catEditId: id,
      catName: c.name || '',
      catUnit: c.unit || '件',
    });
  },
  closeCatPopup() {
    this.setData({ catPopup: false, catEditId: '' });
  },
  onCatName(e) {
    this.setData({ catName: e.detail || '' });
  },
  onCatUnit(e) {
    this.setData({ catUnit: e.detail || '' });
  },
  async saveCat() {
    const name = (this.data.catName || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    try {
      if (this.data.catEditId) {
        await fmApi.patchConsumableCatalog(this.data.catEditId, {
          name,
          unit: (this.data.catUnit || '').trim() || null,
        });
      } else {
        await fmApi.createConsumableCatalog({ name, unit: (this.data.catUnit || '').trim() || undefined });
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeCatPopup();
      const cats = await fmApi.listConsumableCatalog(true);
      this.setData({ consumableCatalog: cats || [] });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  deleteCat(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除目录项',
      content: '确认删除？',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await fmApi.deleteConsumableCatalog(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ consumableCatalog: (this.data.consumableCatalog || []).filter((c) => c.id !== id) });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
        }
      },
    });
  },

  /* --- Presets --- */
  openNewPreset() {
    this.setData({ presetPopup: true, presetEditId: '', presetLabel: '' });
  },
  editPreset(e) {
    const id = e.currentTarget.dataset.id;
    const p = (this.data.replacementPresets || []).find((x) => x.id === id);
    if (!p) return;
    this.setData({ presetPopup: true, presetEditId: id, presetLabel: p.label || '' });
  },
  closePresetPopup() {
    this.setData({ presetPopup: false, presetEditId: '' });
  },
  onPresetLabel(e) {
    this.setData({ presetLabel: e.detail || '' });
  },
  async savePreset() {
    const label = (this.data.presetLabel || '').trim();
    if (!label) {
      wx.showToast({ title: '请填写标签', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    try {
      if (this.data.presetEditId) {
        await fmApi.patchReplacementPreset(this.data.presetEditId, { label });
      } else {
        await fmApi.createReplacementPreset({ label, sortOrder: (this.data.replacementPresets || []).length });
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closePresetPopup();
      const presets = await fmApi.listReplacementPresets(true);
      this.setData({ replacementPresets: presets || [] });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  deletePreset(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除预设',
      content: '确认删除？',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await fmApi.deleteReplacementPreset(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ replacementPresets: (this.data.replacementPresets || []).filter((p) => p.id !== id) });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
        }
      },
    });
  },
});
