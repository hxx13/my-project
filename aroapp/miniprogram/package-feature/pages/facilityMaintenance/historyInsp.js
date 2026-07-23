const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const fmApi = require('../../utils/facilityMaintenanceApi.js');
const {
  nowLocalWallTextPretty,
  timestampToWallText,
  wallInputToApiLocalDateTime,
  wallTextToTimestampForPicker,
  toLocalDateTimeNoTz,
} = require('../../utils/datetimeBeijing.js');

function normalizeValuesMap(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  Object.keys(obj).forEach((k) => {
    const val = obj[k];
    out[k] = val == null ? '' : String(val);
  });
  return out;
}

function buildItemLabelMap(templates) {
  const m = {};
  (Array.isArray(templates) ? templates : []).forEach((t) => {
    const items = Array.isArray(t.items) ? t.items : [];
    items.forEach((it) => {
      const id = String(it.id || '');
      if (id) m[id] = (it.label || '').trim() || id;
    });
  });
  return m;
}

function buildFieldRowsFromTemplate(template, valuesMap) {
  const raw = template && template.items;
  const items = Array.isArray(raw) ? raw : [];
  return items.map((it) => ({
    itemId: String(it.id || ''),
    label: it.label || '',
    fieldType: String(it.fieldType || 'TEXT').toUpperCase(),
    value: valuesMap && valuesMap[it.id] != null ? String(valuesMap[it.id]) : '',
  }));
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

/** 与 index.js 一致：从协作表 DTO 生成矩阵（含 SELECT 下拉选项） */
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
    loadingMore: false,
    sites: [],
    sitePickerIndex: 0,
    siteFilterSheetShow: false,
    page: 1,
    size: 20,
    total: 0,
    /** 一级目录：按日的协作表摘要（无单元格内容） */
    sheetSummaryRows: [],
    allTemplates: [],
    itemLabelById: {},
    addPopup: false,
    editingId: '',
    formTemplateId: '',
    formTemplateName: '',
    addTplSheetShow: false,
    addTplNames: [],
    addTplIds: [],
    inspFieldRows: [],
    formInspectedAt: '',
    timePickerShow: false,
    timePickerValue: Date.now(),
    pickerMinTs: Date.now() - 86400000 * 365 * 10,
    pickerMaxTs: Date.now() + 86400000 * 365 * 2,
    /** 当日矩阵全屏 */
    sheetView: false,
    sheetViewDate: '',
    sheet: null,
    sheetStatusText: '',
    sheetItems: [],
    sheetMatrix: [],
    exportBusy: false,
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
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/facilityMaintenance/historyInsp', role, 'STAFF')) return;
    this.setData({ pageGateOk: true }, () => this.bootstrap());
  },

  onHide() {
    this.clearSheetTimers();
  },

  onUnload() {
    this.clearSheetTimers();
  },

  clearSheetTimers() {
    if (this._sheetPollTimer) {
      clearInterval(this._sheetPollTimer);
      this._sheetPollTimer = null;
    }
    if (this._sheetSaveTimer) {
      clearTimeout(this._sheetSaveTimer);
      this._sheetSaveTimer = null;
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1 }, () =>
      this.loadList(true).finally(() => wx.stopPullDownRefresh()),
    );
  },

  onReachBottom() {
    if (this.data.sheetView) return;
    const pages = Math.max(1, Math.ceil((this.data.total || 0) / this.data.size));
    if (this.data.page >= pages || this.data.loadingMore || this.data.loading) return;
    const next = this.data.page + 1;
    this.setData({ loadingMore: true });
    this.loadList(false, next).finally(() => this.setData({ loadingMore: false }));
  },

  async bootstrap() {
    try {
      const [raw, tpls] = await Promise.all([fmApi.listSites(false), fmApi.listTemplates(undefined)]);
      const sites = Array.isArray(raw) ? raw : [];
      const allTemplates = Array.isArray(tpls) ? tpls : [];
      const itemLabelById = buildItemLabelMap(allTemplates);
      this.setData(
        {
          sites,
          sitePickerIndex: 0,
          allTemplates,
          itemLabelById,
          page: 1,
        },
        () => this.loadList(true),
      );
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  selectedSiteIdForWrite() {
    const list = this.data.sites || [];
    if (list.length === 1) return list[0].id;
    const s = list[this.data.sitePickerIndex];
    return s ? s.id : '';
  },

  filterTemplatesForSite(siteId) {
    const all = this.data.allTemplates || [];
    if (!siteId) return all;
    return all.filter((t) => !t.siteId || String(t.siteId) === String(siteId));
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
    this.setData({ sitePickerIndex: idx, siteFilterSheetShow: false });
  },

  openAddTplSheet() {
    const siteId = this.selectedSiteIdForWrite();
    if (!siteId) {
      wx.showToast({ title: '请先在顶部选定具体机房', icon: 'none' });
      return;
    }
    const list = this.filterTemplatesForSite(siteId);
    if (!list.length) {
      wx.showToast({ title: '该机房暂无巡查模板，请先在设置中配置', icon: 'none' });
      return;
    }
    const addTplNames = list.map((t) => t.name || t.id);
    const addTplIds = list.map((t) => t.id);
    this.setData({ addTplSheetShow: true, addTplNames, addTplIds });
  },
  closeAddTplSheet() {
    this.setData({ addTplSheetShow: false });
  },
  async pickAddTemplate(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx)) return;
    const id = this.data.addTplIds[idx];
    if (!id) return;
    wx.showLoading({ title: '加载模板', mask: true });
    try {
      const t = await fmApi.getTemplate(id);
      const rows = buildFieldRowsFromTemplate(t, {});
      this.setData({
        formTemplateId: id,
        formTemplateName: (t && t.name) || id,
        inspFieldRows: rows,
        addTplSheetShow: false,
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载模板失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadList(reset, pageOverride) {
    if (this.data.sheetView) return;
    const page = pageOverride != null ? pageOverride : reset ? 1 : this.data.page;
    if (reset || pageOverride === 1) this.setData({ loading: true });
    try {
      const data = await fmApi.listDailySheetSummaries(page, this.data.size);
      const rows = (data && data.rows) || [];
      const total = (data && data.total) || 0;
      const decorated = rows.map((r) => ({
        ...r,
        statusText: String(r.status || '') === 'SUBMITTED' ? '已登记' : '填写中',
      }));
      const append = page > 1;
      this.setData({
        total,
        page,
        sheetSummaryRows: append ? (this.data.sheetSummaryRows || []).concat(decorated) : decorated,
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 点击某日目录行：打开当日协作矩阵表 */
  async openSheetFromList(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.clearSheetTimers();
    this._pendingCells = {};
    wx.setNavigationBarTitle({ title: `${date} 巡查表` });
    this.setData({
      sheetView: true,
      sheetViewDate: date,
      sheet: null,
      sheetItems: [],
      sheetMatrix: [],
      sheetStatusText: '',
      exportBusy: false,
    });
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const data = await fmApi.getOrCreateDailySheet(date, undefined);
      this.applySheet(data);
      this.startSheetPollIfNeeded();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.closeSheetView();
    } finally {
      wx.hideLoading();
    }
  },

  closeSheetView() {
    this.clearSheetTimers();
    this._pendingCells = {};
    wx.setNavigationBarTitle({ title: '历史巡查记录' });
    this.setData({
      sheetView: false,
      sheetViewDate: '',
      sheet: null,
      sheetItems: [],
      sheetMatrix: [],
      sheetStatusText: '',
    });
  },

  /** 与 Web「删除当日巡查表」同接口与确认语义 */
  deleteDailySheetInView() {
    const sid = this.data.sheet && this.data.sheet.id;
    if (!sid) {
      wx.showToast({ title: '暂无表', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除当日巡查表',
      content:
        '确定删除「当日巡查表」？删除后该业务日可重新选模板打开；若格子中已有内容将一并清除。（多人协作时请谨慎）',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await fmApi.deleteDailySheet(String(sid));
          wx.showToast({ title: '已删除，可重新打开该日', icon: 'success' });
          this.clearSheetTimers();
          this._pendingCells = {};
          wx.setNavigationBarTitle({ title: '历史巡查记录' });
          this.setData(
            {
              sheetView: false,
              sheetViewDate: '',
              sheet: null,
              sheetItems: [],
              sheetMatrix: [],
              sheetStatusText: '',
              exportBusy: false,
            },
            () => {
              void this.loadList(true);
            },
          );
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
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
  },

  startSheetPollIfNeeded() {
    if (!this.data.sheetView || !this.data.sheet || !this.data.sheet.id) return;
    if (this._sheetPollTimer) clearInterval(this._sheetPollTimer);
    const date = this.data.sheetViewDate;
    this._sheetPollTimer = setInterval(() => {
      if (!this.data.sheetView || !this.data.sheet || !this.data.sheet.id) return;
      fmApi
        .getOrCreateDailySheet(date, undefined)
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
        const data = await fmApi.getOrCreateDailySheet(this.data.sheetViewDate, undefined);
        this.applySheet(data);
      } catch (e2) {
        /* ignore */
      }
    }
  },

  async refreshSheetInView() {
    if (!this.data.sheetView || !this.data.sheetViewDate) return;
    try {
      const data = await fmApi.getOrCreateDailySheet(this.data.sheetViewDate, undefined);
      this.applySheet(data);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '刷新失败', icon: 'none' });
    }
  },

  async submitDailySheetInView() {
    const s = this.data.sheet;
    if (!s || !s.id) return;
    wx.showLoading({ title: '提交中', mask: true });
    try {
      await fmApi.submitDailySheet(String(s.id));
      wx.showToast({ title: '已登记', icon: 'success' });
      const data = await fmApi.getOrCreateDailySheet(this.data.sheetViewDate, undefined);
      this.applySheet(data);
      this.mergeSummaryAfterSheetChange(data);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  mergeSummaryAfterSheetChange(data) {
    const date = (data && data.sheetDate) || this.data.sheetViewDate;
    if (!date) return;
    const st = String((data && data.status) || '');
    const statusText = st === 'SUBMITTED' ? '已登记' : '填写中';
    const ver = (data && data.version) != null ? data.version : 0;
    const rows = (this.data.sheetSummaryRows || []).map((r) =>
      r.sheetDate === date ? { ...r, status: st, statusText, version: ver } : r,
    );
    this.setData({ sheetSummaryRows: rows });
  },

  async exportDailyExcelInView() {
    const s = this.data.sheet;
    if (!s || !s.id || this.data.exportBusy) return;
    this.setData({ exportBusy: true });
    wx.showLoading({ title: '导出中', mask: true });
    try {
      const { base64 } = await fmApi.exportDailySheetExcel(String(s.id));
      const fs = wx.getFileSystemManager();
      const path = `${wx.env.USER_DATA_PATH}/daily-inspection-${this.data.sheetViewDate}.xlsx`;
      fs.writeFile({
        filePath: path,
        data: base64,
        encoding: 'base64',
        success: () => {
          wx.openDocument({
            filePath: path,
            showMenu: true,
            fail: (e) => wx.showToast({ title: (e && e.errMsg) || '无法打开文件', icon: 'none' }),
          });
        },
        fail: (e) => wx.showToast({ title: (e && e.errMsg) || '写入失败', icon: 'none' }),
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportBusy: false });
    }
  },

  openAddPopup() {
    const siteId = this.selectedSiteIdForWrite();
    if (!siteId) {
      wx.showToast({ title: '请先在顶部筛选中选定具体机房', icon: 'none' });
      return;
    }
    const list = this.filterTemplatesForSite(siteId);
    if (!list.length) {
      wx.showToast({ title: '该机房暂无巡查模板，请先在「设置」中配置', icon: 'none' });
      return;
    }
    const addTplNames = list.map((t) => t.name || t.id);
    const addTplIds = list.map((t) => t.id);
    this.setData({
      addPopup: true,
      editingId: '',
      formTemplateId: '',
      formTemplateName: addTplNames.length ? '' : '（无模板）',
      inspFieldRows: [],
      formInspectedAt: nowLocalWallTextPretty(),
      addTplNames,
      addTplIds,
    });
  },

  closeAddPopup() {
    this.setData({ addPopup: false, editingId: '', timePickerShow: false });
  },

  _tsFromDatetimePickerDetail(detail) {
    if (detail == null) return Date.now();
    if (typeof detail === 'number') return detail;
    if (typeof detail === 'object' && typeof detail.getTime === 'function') return detail.getTime();
    const t = new Date(detail).getTime();
    return Number.isNaN(t) ? Date.now() : t;
  },

  openInspTimePicker() {
    this.setData({
      timePickerShow: true,
      timePickerValue: wallTextToTimestampForPicker(this.data.formInspectedAt),
    });
  },

  closeTimePicker() {
    this.setData({ timePickerShow: false });
  },

  onTimePickerInput(e) {
    const ts = this._tsFromDatetimePickerDetail(e.detail);
    this.setData({ timePickerValue: ts });
  },

  confirmInspTimePicker(e) {
    const ts = this._tsFromDatetimePickerDetail(e.detail != null ? e.detail : this.data.timePickerValue);
    this.setData({ formInspectedAt: timestampToWallText(ts), timePickerShow: false });
  },

  onInspFieldChange(e) {
    const itemId = e.currentTarget.dataset.itemId;
    const v = e.detail != null ? String(e.detail) : '';
    const rows = (this.data.inspFieldRows || []).map((r) => (r.itemId === itemId ? { ...r, value: v } : r));
    this.setData({ inspFieldRows: rows });
  },

  valuesFromFieldRows() {
    const out = {};
    (this.data.inspFieldRows || []).forEach((r) => {
      if (r.itemId) out[r.itemId] = r.value != null ? String(r.value) : '';
    });
    return normalizeValuesMap(out);
  },

  parseInspectedAt() {
    const s = (this.data.formInspectedAt || '').trim();
    const api = wallInputToApiLocalDateTime(s);
    if (api) return api;
    if (!s) return toLocalDateTimeNoTz(new Date());
    throw new Error('巡查时间格式无效，示例 2026-05-10 14:30:00');
  },

  async submitAdd() {
    const siteId = this.selectedSiteIdForWrite();
    if (!siteId) {
      wx.showToast({ title: '请先在顶部选定机房', icon: 'none' });
      return;
    }
    const editingId = this.data.editingId;
    const rows = this.data.inspFieldRows || [];
    if (!editingId && !this.data.formTemplateId) {
      wx.showToast({ title: '请选择巡查模板', icon: 'none' });
      return;
    }
    if (!rows.length) {
      wx.showToast({ title: '无巡查项可保存', icon: 'none' });
      return;
    }
    let inspectedAtIso;
    try {
      inspectedAtIso = this.parseInspectedAt();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '时间无效', icon: 'none' });
      return;
    }
    const values = this.valuesFromFieldRows();
    wx.showLoading({ title: '提交中', mask: true });
    try {
      if (editingId) {
        const patchBody = { siteId, inspectedAt: inspectedAtIso, values };
        if (this.data.formTemplateId) patchBody.templateId = this.data.formTemplateId;
        await fmApi.patchInspection(editingId, patchBody);
      } else {
        await fmApi.createInspection({
          siteId,
          templateId: this.data.formTemplateId,
          inspectedAt: inspectedAtIso,
          values,
        });
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeAddPopup();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
