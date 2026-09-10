const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const assetApi = require('../../utils/assetApi.js');

function toTextTime(v) {
  if (!v) return '';
  return String(v).replace('T', ' ').slice(0, 19);
}

function normalizeColumnLabel(label) {
  const text = (label || '').trim();
  return text; // 不再把"存放地点N"映射为"当前存放地点"
}

function pickCurrentLocationColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (/^存放地点\d+$/i.test(label)) return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label.includes('存放地点')) return col;
  }
  return null;
}

function pickSpecModelColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label.includes('规格型号')) return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label.includes('型号')) return col;
  }
  return null;
}

function pickUserColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label === '使用人') return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label.includes('使用人') && !label.includes('工号')) return col;
  }
  return null;
}

const FIELD_GROUPS = [
  { name: '规格信息', keys: ['规格型号', '型号', '规格', '数量', '单价', '价值', '金额', '单位', '计量单位'] },
  { name: '管理归属', keys: ['使用人', '管理部门', '使用部门', '保管人', '领用人', '负责人', '所属部门', '存放地点'] },
  { name: '日期信息', keys: ['日期', '时间', '购入日期', '登记日期', '记账日期', '购置日期'] },
];

function classifyColumn(col, val) {
  const label = (col.displayLabel || col.columnLabel || '').trim();
  for (let g = 0; g < FIELD_GROUPS.length; g += 1) {
    for (let k = 0; k < FIELD_GROUPS[g].keys.length; k += 1) {
      if (label.includes(FIELD_GROUPS[g].keys[k])) return FIELD_GROUPS[g].name;
    }
  }
  return '其他信息';
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 从存放地点文本推断校区（无「浦东/浦西」则返回空，禁止默认浦西） */
function detectCampus(locationText) {
  const s = (locationText || '').trim();
  if (!s) return '';
  if (s.includes('浦东')) return '浦东';
  if (s.includes('浦西')) return '浦西';
  return '';
}

function pickCampusColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label === '校区' || label.includes('所属校区')) return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const key = String((list[i] || {}).columnKey || '');
    if (key === 'col_校区' || key === 'col_所属校区') return list[i];
  }
  return null;
}

function primaryLocationText(row, locationCol) {
  if (!row) return '';
  const dynLoc = locationCol && row.dynamicValues
    ? String(row.dynamicValues[locationCol.columnKey] || '').trim()
    : '';
  const baseLoc = String(row.location || '').trim();
  return dynLoc || baseLoc;
}

function normalizeCampusLabel(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  if (s.includes('浦东')) return '浦东';
  if (s.includes('浦西')) return '浦西';
  return '';
}

function resolveRowCampus(row, locationCol, campusCol) {
  const loc = primaryLocationText(row, locationCol);
  const detected = detectCampus(loc);
  const manualRaw = campusCol && row.dynamicValues
    ? String(row.dynamicValues[campusCol.columnKey] || '').trim()
    : '';
  const manual = normalizeCampusLabel(manualRaw);
  if (manual) {
    return { rowCampus: manual, campusManual: true };
  }
  return { rowCampus: detected, campusManual: false };
}

function decorateAssetRow(row, locationCol, campusCol) {
  const currentLocation = primaryLocationText(row, locationCol);
  const campusInfo = resolveRowCampus(row, locationCol, campusCol);
  return {
    ...row,
    currentLocation,
    ...campusInfo,
  };
}

function parsePhotoUrlField(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    try {
      const j = JSON.parse(s);
      return Array.isArray(j) ? j.map((x) => String(x || '').trim()).filter(Boolean) : [];
    } catch (e) {
      return [s];
    }
  }
  return [];
}

function transferStatusText(s) {
  if (s === 'IN_PROGRESS') return '进行中';
  if (s === 'COMPLETED') return '转移完毕';
  if (s === 'SUBMITTED') return '转移完毕';
  return s ? String(s) : '-';
}

function pickTransferImages(count) {
  const maxCount = Math.max(1, Number(count) || 1);
  if (wx.chooseMedia) {
    return wx.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    }).then((res) => {
      const files = (res && res.tempFiles) || [];
      return files.map((f) => f.tempFilePath || f.path).filter(Boolean);
    });
  }
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        resolve((res && res.tempFilePaths) || []);
      },
      fail(err) {
        reject(err || new Error('选择图片失败'));
      },
    });
  });
}

Page({
  data: {
    loading: false,
    loadingMore: false,
    rows: [],
    columns: [],
    page: 1,
    size: 20,
    total: 0,
    keyword: '',
    appliedKeyword: '',
    campus: '',
    campusOptions: [
      { label: '全部', value: '' },
      { label: '浦东校区', value: '浦东' },
      { label: '浦西校区', value: '浦西' },
    ],
    assetNameOptions: ['全部'],
    userOptions: ['全部'],
    modelOptions: ['全部'],
    allModelOptions: ['全部'],
    assetNameDropdownOptions: [{ text: '全部', value: 0 }],
    userDropdownOptions: [{ text: '全部', value: 0 }],
    modelDropdownOptions: [{ text: '全部', value: 0 }],
    filterAssetNameIndex: 0,
    filterUserIndex: 0,
    filterModelIndex: 0,
    appliedAssetName: '',
    appliedUser: '',
    appliedModel: '',
    showDetailPanel: false,
    detailAsset: null,
    detailAssetName: '',
    detailColumns: [],
    detailGroups: [],
    detailEmptyColumns: [],
    detailShowMore: false,
    detailEditing: false,
    detailEditValues: {},
    detailLocation: '',
    detailPhotoUrls: [],
    detailAfterPhotos: [],
    detailTransferStatusText: '',
    currentLocationColumnKey: '',
    campusColumnKey: '',
    showFillPanel: false,
    fillSourceAsset: null,
    fillFields: [],
    fillChecked: {},
    showApplyPanel: false,
    applyStep: 'search',
    applyAsset: null,
    applyCurrentLocation: '',
    searchKeyword: '',
    searchRows: [],
    transferDate: '',
    transferLocation: '',
    transferUserName: '',
    transferUserEmployeeId: '',
    transferRemark: '',
    transferPhotosBefore: [],
    transferPhotosAfter: [],
    uploadingPhotoSlot: '',
    showAddPanel: false,
    addAssetCode: '',
    addAssetName: '',
    addLocation: '',
    addNote: '',
    addPhotoUrls: [],
    addUploadingPhoto: false,
    addExistingAsset: null,
    showFilters: false,            // 筛选条件默认收起
    // ── 批量记录 ──
    batchAssets: [],               // 已加入批量的资产列表 [{ id, assetCode, assetName, location, dynamicValues, ... }]
    batchAssetIdMap: {},           // { id: true } 快速查找，供 WXML 用
    showBatchPanel: false,         // 批量面板
    showBatchFillPanel: false,     // 批量扫码填充子面板
    batchFillSourceAsset: null,    // 扫码源资产
    batchFillFields: [],           // [{ key, label, sourceValue, previews: [{ value, assetNames:[] }] }]
    batchFillChecked: {},          // { key: true/false }
    showBatchEditPanel: false,     // 批量编辑子面板
    batchEditFields: [],           // [{ key, label, editValue: '', previews: [{ value, assetNames:[] }] }]
    batchEditChecked: {},          // { key: true/false }
    batchEditValues: {},           // { key: 'user input' }
    batchChecked: {},              // { assetId: true/false } 批量面板内复选框
    batchCheckedCount: 0,          // 已勾选数量
    // ── 导出列选择 ──
    showExportPicker: false,
    showExportConfirm: false,
    exportSavedCount: 0,
    exportColumns: [],             // [{ label, key, checked }]
    exportAllChecked: true,
  },

  onLoad(options) {
    // 扫码跳转：缓存 searchCode 供 onShow 使用
    if (options && options.searchCode) {
      this._pendingSearchCode = String(options.searchCode || '').trim();
    }
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/assetRecord/index', role, 'STAFF')) return;

    // 扫码跳转：自动搜索资产编号
    const searchCode = this._pendingSearchCode;
    if (searchCode) {
      this._pendingSearchCode = null;
      this.setData({ page: 1, rows: [], searchKeyword: searchCode }, () => this.loadData(1));
      this.loadFacets();
      return;
    }

    this.setData({ page: 1, rows: [] }, () => this.loadData(1));
    this.loadFacets();
  },

  onPullDownRefresh() {
    this.setData({ page: 1 }, () => this.loadData(1).finally(() => wx.stopPullDownRefresh()));
  },

  onReachBottom() {
    // 保留兼容页面级下拉，实际滚动由 scroll-view 驱动
    this.onListReachBottom();
  },

  onListReachBottom() {
    const pages = Math.max(1, Math.ceil((this.data.total || 0) / this.data.size));
    if (this.data.page >= pages || this.data.loadingMore) return;
    const nextPage = this.data.page + 1;
    this.setData({ loadingMore: true });
    this.loadData(nextPage).finally(() => this.setData({ loadingMore: false }));
  },

  onKeywordInput(e) {
    const value = e.detail.value || '';
    this.setData({ keyword: value });
    // Debounced auto-search
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.applySearch();
    }, 400);
  },

  mergeAssetRowCampus(assetId, patchDynamicValues) {
    const locationCol = pickCurrentLocationColumn(this.data.columns);
    const campusCol = pickCampusColumn(this.data.columns) || { columnKey: this.data.campusColumnKey || 'col_校区' };
    const rows = (this.data.rows || []).map((r) => {
      if (r.id !== assetId) return r;
      const dynamicValues = { ...(r.dynamicValues || {}) };
      Object.keys(patchDynamicValues || {}).forEach((k) => {
        const v = patchDynamicValues[k];
        if (v == null || v === '') delete dynamicValues[k];
        else dynamicValues[k] = v;
      });
      const merged = decorateAssetRow({ ...r, dynamicValues }, locationCol, campusCol);
      return {
        ...merged,
        specModel: r.specModel,
        assetUser: r.assetUser,
      };
    });
    this.setData({ rows });
  },

  onRowCampusTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row) return;
    const cur = row.rowCampus || '';
    wx.showActionSheet({
      itemList: [
        `标记为浦东${cur === '浦东' ? ' ✓' : ''}`,
        `标记为浦西${cur === '浦西' ? ' ✓' : ''}`,
        '改为自动识别（按存放地点）',
      ],
      success: (res) => {
        if (res.tapIndex === 0) this.setRowCampus(id, '浦东');
        else if (res.tapIndex === 1) this.setRowCampus(id, '浦西');
        else if (res.tapIndex === 2) this.setRowCampus(id, '');
      },
    });
  },

  async setRowCampus(assetId, campus) {
    const campusKey = this.data.campusColumnKey || 'col_校区';
    const dynamicValues = {};
    if (campus) {
      dynamicValues[campusKey] = campus;
    } else {
      dynamicValues[campusKey] = '';
    }
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await assetApi.patchAssetRecord(assetId, { dynamicValues });
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      this.mergeAssetRowCampus(assetId, dynamicValues);
      wx.showToast({ title: campus ? `已标记${campus}` : '已改为自动识别', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onCampusTap() {
    const labels = this.data.campusOptions.map((o) => o.label);
    wx.showActionSheet({
      itemList: labels,
      success: (res) => {
        const opt = this.data.campusOptions[res.tapIndex];
        const campus = opt ? opt.value : '';
        this.setData({ campus, page: 1 }, () => {
          this.loadData(1);
          this.loadFacets();
        });
      },
    });
  },

  refreshList() {
    this.setData({ page: 1 }, async () => {
      await this.loadData(1);
      wx.showToast({ title: '已刷新', icon: 'success' });
    });
  },

  async loadFacets() {
    try {
      const currentAssetName = this.data.assetNameOptions[this.data.filterAssetNameIndex] || '全部';
      const currentUser = this.data.userOptions[this.data.filterUserIndex] || '全部';
      const currentModel = this.data.modelOptions[this.data.filterModelIndex] || '全部';
      const data = await assetApi.fetchAssetFacets({
        keyword: (this.data.appliedKeyword || '').trim() || undefined,
        campus: this.data.campus || undefined,
        assetName: currentAssetName === '全部' ? undefined : currentAssetName,
        user: currentUser === '全部' ? undefined : currentUser,
        model: currentModel === '全部' ? undefined : currentModel,
      });
      const assetNameOptions = ['全部'].concat(data.assetNames || []);
      const userOptions = ['全部'].concat(data.users || data.campuses || []);
      const modelOptions = ['全部'].concat(data.models || []);
      // 生成 van-dropdown-item 格式的选项列表
      const toDropdown = (arr) => arr.map((text, idx) => ({ text, value: idx }));
      this.setData({
        assetNameOptions,
        userOptions,
        modelOptions,
        allModelOptions: modelOptions,
        assetNameDropdownOptions: toDropdown(assetNameOptions),
        userDropdownOptions: toDropdown(userOptions),
        modelDropdownOptions: toDropdown(modelOptions),
        filterAssetNameIndex: Math.max(0, assetNameOptions.indexOf(currentAssetName)),
        filterUserIndex: Math.max(0, userOptions.indexOf(currentUser)),
        filterModelIndex: Math.max(0, modelOptions.indexOf(currentModel)),
      });
    } catch (e) {
      // ignore
    }
  },

  onAssetNameDropdownChange(e) {
    const idx = Number(e.detail || 0);
    this.setData({ filterAssetNameIndex: idx }, () => this.loadFacets());
  },

  onUserDropdownChange(e) {
    const idx = Number(e.detail || 0);
    this.setData({ filterUserIndex: idx }, () => this.loadFacets());
  },

  onModelDropdownChange(e) {
    const idx = Number(e.detail || 0);
    this.setData({ filterModelIndex: idx }, () => this.loadFacets());
  },

  onToggleFilters() {
    this.setData({ showFilters: !this.data.showFilters });
  },

  applySearch() {
    const assetName = this.data.assetNameOptions[this.data.filterAssetNameIndex] || '全部';
    const user = this.data.userOptions[this.data.filterUserIndex] || '全部';
    const model = this.data.modelOptions[this.data.filterModelIndex] || '全部';
    this.setData({
      appliedKeyword: (this.data.keyword || '').trim(),
      appliedAssetName: assetName === '全部' ? '' : assetName,
      appliedUser: user === '全部' ? '' : user,
      appliedModel: model === '全部' ? '' : model,
      page: 1,
    }, () => {
      this.loadData(1);
      this.loadFacets();
    });
  },

  onScanKeyword() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const text = (res && (res.result || res.rawData)) ? String(res.result || res.rawData) : '';
        this.setData({ keyword: text }, () => {
          this.applySearch();
        });
      },
      fail: () => {
        wx.showToast({ title: '扫描已取消', icon: 'none' });
      },
    });
  },

  onClearKeyword() {
    this.setData({ keyword: '' }, () => {
      this.applySearch();
    });
  },

  async loadData(targetPage) {
    const page = Number(targetPage || this.data.page || 1);
    if (page === 1) this.setData({ loading: true });
    try {
      const data = await assetApi.fetchAssetRecords({
        page,
        size: this.data.size,
        keyword: this.data.appliedKeyword || undefined,
        campus: this.data.campus || undefined,
        assetName: this.data.appliedAssetName || undefined,
        user: this.data.appliedUser || undefined,
        model: this.data.appliedModel || undefined,
      });
      const columns = (data.columns || []).map((c) => ({
        ...c,
        displayLabel: normalizeColumnLabel(c.columnLabel || ''),
      }));
      const locationCol = pickCurrentLocationColumn(columns);
      const campusCol = pickCampusColumn(columns);
      const specModelCol = pickSpecModelColumn(columns);
      const userCol = pickUserColumn(columns);
      const rows = (data.rows || []).map((r) => {
        const base = decorateAssetRow(
          {
            ...r,
            latestTransferTimeText: toTextTime(r.latestTransferTime),
          },
          locationCol,
          campusCol,
        );
        return {
          ...base,
          specModel: specModelCol && r.dynamicValues ? (r.dynamicValues[specModelCol.columnKey] || '') : '',
          assetUser: userCol && r.dynamicValues ? (r.dynamicValues[userCol.columnKey] || '') : '',
        };
      });
      const mergedRows = page > 1 ? (this.data.rows || []).concat(rows) : rows;
      const mergedMap = new Map();
      for (let i = 0; i < mergedRows.length; i += 1) {
        const row = mergedRows[i];
        if (row && row.id) mergedMap.set(row.id, row);
      }
      const dedupRows = Array.from(mergedMap.values());

      this.setData({
        rows: dedupRows,
        columns,
        currentLocationColumnKey: locationCol ? locationCol.columnKey : '',
        campusColumnKey: campusCol ? campusCol.columnKey : 'col_校区',
        total: Number(data.total || 0),
        page,
      });
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '加载失败', icon: 'none' });
    } finally {
      if (page === 1) this.setData({ loading: false });
    }
  },

  openDetailPanel(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id) || null;
    if (!row) return;
    const locationKey = this.data.currentLocationColumnKey || '';
    const allCols = (this.data.columns || []).filter((col) => col && col.columnKey !== locationKey);
    // 排除转移相关列和空值列
    const transferLabels = ['申请转移时间', '申请转移地点', '申请人', '申请备注', '转移时间', '转移地点', '是否锁定'];
    const filledCols = [];
    const emptyCols = [];
    for (let i = 0; i < allCols.length; i += 1) {
      const col = allCols[i];
      const label = col.displayLabel || col.columnLabel || '';
      const val = (row.dynamicValues && row.dynamicValues[col.columnKey]) || '';
      if (transferLabels.some((t) => label.includes(t))) continue;
      if (val && val.trim()) {
        filledCols.push(col);
      } else {
        emptyCols.push(col);
      }
    }
    // 将有值字段按分组归类
    const groupMap = {};
    for (let i = 0; i < filledCols.length; i += 1) {
      const col = filledCols[i];
      const gName = classifyColumn(col, (row.dynamicValues && row.dynamicValues[col.columnKey]) || '');
      if (!groupMap[gName]) groupMap[gName] = [];
      groupMap[gName].push(col);
    }
    const detailGroups = Object.keys(groupMap).map((name) => ({ name, columns: groupMap[name], open: false }));

    const afterPhotos = parsePhotoUrlField(row.latestTransferPhotoUrlsAfter)
      .map((u) => springAuth.toAbsoluteMediaUrl(u))
      .filter(Boolean);
    const photoUrls = parsePhotoUrlField(row.photoUrls)
      .map((u) => springAuth.toAbsoluteMediaUrl(u))
      .filter(Boolean);
    this.setData({
      showDetailPanel: true,
      detailAsset: row,
      detailAssetName: row.assetName || '',
      detailColumns: filledCols,
      detailGroups,
      detailEmptyColumns: emptyCols,
      detailShowMore: false,
      detailEditing: false,
      detailEditValues: {},
      detailLocation: primaryLocationText(row, pickCurrentLocationColumn(this.data.columns)) || '',
      detailPhotoUrls: photoUrls,
      detailAfterPhotos: afterPhotos,
      detailTransferStatusText: transferStatusText(row.latestTransferStatus),
    });
  },

  toggleMoreFields() {
    this.setData({ detailShowMore: !this.data.detailShowMore });
  },

  toggleGroup(e) {
    const name = e.currentTarget.dataset.name;
    const groups = (this.data.detailGroups || []).map((g) => {
      if (g.name === name) return { ...g, open: !g.open };
      return g;
    });
    this.setData({ detailGroups: groups });
  },

  closeDetailPanel() {
    this.setData({
      showDetailPanel: false,
      detailAsset: null,
      detailAssetName: '',
      detailEditing: false,
      detailEditValues: {},
      detailLocation: '',
      detailPhotoUrls: [],
      detailAfterPhotos: [],
      detailTransferStatusText: '',
      detailColumns: [],
      detailGroups: [],
      detailEmptyColumns: [],
      detailShowMore: false,
    });
  },

  previewDetailPhotoUrls(e) {
    const idx = Number(e.currentTarget.dataset.index || 0);
    const urls = this.data.detailPhotoUrls || [];
    if (!urls.length) return;
    wx.previewImage({
      urls,
      current: urls[idx] || urls[0],
    });
  },

  previewDetailAfterPhotos(e) {
    const idx = Number(e.currentTarget.dataset.index || 0);
    const urls = this.data.detailAfterPhotos || [];
    if (!urls.length) return;
    wx.previewImage({
      urls,
      current: urls[idx] || urls[0],
    });
  },

  startDetailEdit() {
    const detailAsset = this.data.detailAsset;
    if (!detailAsset) return;
    // 编辑模式下展示所有列（含空值列），方便填入
    const allEditCols = [...(this.data.detailColumns || []), ...(this.data.detailEmptyColumns || [])];
    const values = {};
    for (let i = 0; i < allEditCols.length; i += 1) {
      const col = allEditCols[i];
      values[col.columnKey] = (detailAsset.dynamicValues && detailAsset.dynamicValues[col.columnKey]) || '';
    }
    this.setData({
      detailEditing: true,
      detailAssetName: detailAsset.assetName || this.data.detailAssetName || '',
      detailEditValues: values,
      detailLocation: primaryLocationText(detailAsset, pickCurrentLocationColumn(this.data.columns)) || this.data.detailLocation || '',
    });
  },

  onDetailAssetNameInput(e) {
    this.setData({ detailAssetName: e.detail.value || '' });
  },


  onDetailEditInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    if (!key) return;
    this.setData({
      detailEditValues: {
        ...(this.data.detailEditValues || {}),
        [key]: value,
      },
    });
  },

  async saveDetailEdit() {
    const detailAsset = this.data.detailAsset;
    if (!detailAsset || !detailAsset.id) return;
    try {
      // 同步写入动态位置列（与 primaryLocationText 读取一致，后端也会二次 sync）
      const locKey = this.data.currentLocationColumnKey || '';
      const dynamicValues = { ...(this.data.detailEditValues || {}) };
      if (locKey) dynamicValues[locKey] = this.data.detailLocation || '';
      await assetApi.patchAssetRecord(detailAsset.id, {
        assetName: this.data.detailAssetName || '',
        location: this.data.detailLocation || '',
        dynamicValues,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ detailEditing: false });
      await this.loadData(this.data.page || 1);
      const refreshed = (this.data.rows || []).find((x) => x.id === detailAsset.id) || null;
      if (refreshed) {
        const locationKey = this.data.currentLocationColumnKey || '';
        const allCols = (this.data.columns || []).filter((col) => col && col.columnKey !== locationKey);
        const transferLabels = ['申请转移时间', '申请转移地点', '申请人', '申请备注', '转移时间', '转移地点', '是否锁定'];
        const filledCols = [];
        const emptyCols = [];
        for (let i = 0; i < allCols.length; i += 1) {
          const col = allCols[i];
          const label = col.displayLabel || col.columnLabel || '';
          const val = (refreshed.dynamicValues && refreshed.dynamicValues[col.columnKey]) || '';
          if (transferLabels.some((t) => label.includes(t))) continue;
          if (val && val.trim()) { filledCols.push(col); } else { emptyCols.push(col); }
        }
        const groupMap2 = {};
        for (let i = 0; i < filledCols.length; i += 1) {
          const col = filledCols[i];
          const gName = classifyColumn(col, (refreshed.dynamicValues && refreshed.dynamicValues[col.columnKey]) || '');
          if (!groupMap2[gName]) groupMap2[gName] = [];
          groupMap2[gName].push(col);
        }
        const detailGroups2 = Object.keys(groupMap2).map((name) => ({ name, columns: groupMap2[name], open: false }));
        const afterPhotos = parsePhotoUrlField(refreshed.latestTransferPhotoUrlsAfter);
        const photoUrls = parsePhotoUrlField(refreshed.photoUrls)
          .map((u) => springAuth.toAbsoluteMediaUrl(u)).filter(Boolean);
        this.setData({
          detailAsset: refreshed,
          detailAssetName: refreshed.assetName || '',
          detailColumns: filledCols,
          detailGroups: detailGroups2,
          detailEmptyColumns: emptyCols,
          detailShowMore: false,
          detailLocation: primaryLocationText(refreshed, pickCurrentLocationColumn(this.data.columns)) || '',
          detailPhotoUrls: photoUrls,
          detailAfterPhotos: afterPhotos,
          detailTransferStatusText: transferStatusText(refreshed.latestTransferStatus),
        });
      }
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '保存失败', icon: 'none' });
    }
  },

  noop() {},

  // ── 添加资产面板 ──

  openAddPanel() {
    this.setData({
      showAddPanel: true,
      addAssetCode: '',
      addAssetName: '',
      addLocation: '',
      addNote: '',
      addPhotoUrls: [],
      addUploadingPhoto: false,
      addExistingAsset: null,
    });
  },

  closeAddPanel() {
    this.setData({
      showAddPanel: false,
      addAssetCode: '',
      addAssetName: '',
      addLocation: '',
      addNote: '',
      addPhotoUrls: [],
      addExistingAsset: null,
    });
  },


  async onScanAddAssetCode() {
    wx.scanCode({
      onlyFromCamera: false,
      success: async (res) => {
        const code = (res && (res.result || res.rawData)) ? String(res.result || res.rawData).trim() : '';
        if (!code) return;
        wx.showLoading({ title: '检索中…', mask: true });
        try {
          const existing = await assetApi.fetchAssetByCode(code);
          wx.hideLoading();
          if (existing && existing.id) {
            // 资产已存在 → 弹出详情
            this.setData({
              addExistingAsset: existing,
              addAssetCode: code,
            });
          } else {
            // 不存在 → 填入编号继续填写
            this.setData({ addAssetCode: code, addExistingAsset: null });
          }
        } catch (e) {
          wx.hideLoading();
          // 查不到也正常填入
          this.setData({ addAssetCode: code, addExistingAsset: null });
        }
      },
      fail: () => {
        wx.showToast({ title: '扫描已取消', icon: 'none' });
      },
    });
  },

  /**
   * 地点树选择器统一回调（详情编辑 / 新增面板 / 转移申请共用）。
   * e.detail = { path, nodeId }；这里只取全路径文本写回对应字段，
   * 后端在 patchAsset / createAsset / completeTransfer 时会据此回填地点节点。
   */
  onLocationPicked(e) {
    const path = (e.detail && e.detail.path) || '';
    const target = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.target) || '';
    if (target === 'detail') this.setData({ detailLocation: path });
    else if (target === 'add') this.setData({ addLocation: path });
    else if (target === 'transfer') this.setData({ transferLocation: path });
  },

  onAddAssetNameInput(e) {
    this.setData({ addAssetName: e.detail.value || '' });
  },




  onAddNoteInput(e) {
    this.setData({ addNote: e.detail.value || '' });
  },

  viewExistingAssetDetail() {
    const existing = this.data.addExistingAsset;
    if (!existing) return;
    this.closeAddPanel();
    const locationKey = this.data.currentLocationColumnKey || '';
    const allCols = (this.data.columns || []).filter((col) => col && col.columnKey !== locationKey);
    const transferLabels = ['申请转移时间', '申请转移地点', '申请人', '申请备注', '转移时间', '转移地点', '是否锁定'];
    const filledCols = [];
    const emptyCols = [];
    for (let i = 0; i < allCols.length; i += 1) {
      const col = allCols[i];
      const label = col.displayLabel || col.columnLabel || '';
      const val = (existing.dynamicValues && existing.dynamicValues[col.columnKey]) || '';
      if (transferLabels.some((t) => label.includes(t))) continue;
      if (val && val.trim()) { filledCols.push(col); } else { emptyCols.push(col); }
    }
    const groupMapV = {};
    for (let i = 0; i < filledCols.length; i += 1) {
      const col = filledCols[i];
      const gName = classifyColumn(col, (existing.dynamicValues && existing.dynamicValues[col.columnKey]) || '');
      if (!groupMapV[gName]) groupMapV[gName] = [];
      groupMapV[gName].push(col);
    }
    const detailGroupsV = Object.keys(groupMapV).map((name) => ({ name, columns: groupMapV[name], open: false }));
    const photoUrls = parsePhotoUrlField(existing.photoUrls)
      .map((u) => springAuth.toAbsoluteMediaUrl(u)).filter(Boolean);
    const afterPhotos = parsePhotoUrlField(existing.latestTransferPhotoUrlsAfter)
      .map((u) => springAuth.toAbsoluteMediaUrl(u)).filter(Boolean);
    this.setData({
      showDetailPanel: true,
      detailAsset: existing,
      detailAssetName: existing.assetName || '',
      detailColumns: filledCols,
      detailGroups: detailGroupsV,
      detailEmptyColumns: emptyCols,
      detailShowMore: false,
      detailEditing: false,
      detailEditValues: {},
      detailLocation: existing.location || '',
      detailPhotoUrls: photoUrls,
      detailAfterPhotos: afterPhotos,
      detailTransferStatusText: transferStatusText(existing.latestTransferStatus),
    });
  },

  async chooseAddPhotos() {
    if (this.data.addUploadingPhoto) return;
    const arr = [...(this.data.addPhotoUrls || [])];
    const max = 9;
    if (arr.length >= max) {
      wx.showToast({ title: '最多9张', icon: 'none' });
      return;
    }
    this.setData({ addUploadingPhoto: true });
    try {
      const files = await pickTransferImages(Math.min(max - arr.length, 9));
      if (!files || !files.length) return;
      let failCount = 0;
      for (let i = 0; i < files.length; i += 1) {
        const path = files[i];
        if (!path) continue;
        wx.showLoading({ title: `上传中 ${i + 1}/${files.length}`, mask: true });
        arr.push({ tempPath: path, url: '' });
        this.setData({ addPhotoUrls: arr });
        try {
          const url = await springAuth.uploadFileDirect(path, {});
          arr[arr.length - 1] = { tempPath: '', url };
        } catch (singleErr) {
          arr.pop();
          failCount += 1;
        }
        this.setData({ addPhotoUrls: [...arr] });
      }
      wx.hideLoading();
      if (failCount > 0) {
        wx.showToast({ title: `有${failCount}张上传失败`, icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      const em = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : '';
      if (em.includes('cancel')) return;
    } finally {
      this.setData({ addUploadingPhoto: false });
    }
  },

  removeAddPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index) || index < 0) return;
    const arr = [...(this.data.addPhotoUrls || [])];
    arr.splice(index, 1);
    this.setData({ addPhotoUrls: arr });
  },

  previewAddPhotos(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const arr = this.data.addPhotoUrls || [];
    const urls = arr
      .map((x) => (x && (x.url || x.tempPath) ? springAuth.toAbsoluteMediaUrl(String(x.url || x.tempPath).trim()) : ''))
      .filter(Boolean);
    if (!urls.length) return;
    wx.previewImage({ urls, current: urls[index] || urls[0] });
  },

  async submitAddAsset() {
    const code = (this.data.addAssetCode || '').trim();
    const name = (this.data.addAssetName || '').trim();
    if (!code || !name) {
      wx.showToast({ title: '请填写资产编号和名称', icon: 'none' });
      return;
    }
    const photoUrls = (this.data.addPhotoUrls || [])
      .map((x) => (x && x.url ? String(x.url).trim() : ''))
      .filter(Boolean);
    wx.showLoading({ title: '创建中…', mask: true });
    try {
      // 同步写入动态位置列
      const addLocCol = pickCurrentLocationColumn(this.data.columns || []);
      const addDynamicValues = {};
      const addLocVal = (this.data.addLocation || '').trim();
      if (addLocCol && addLocVal) addDynamicValues[addLocCol.columnKey] = addLocVal;
      await assetApi.createAsset({
        assetCode: code,
        assetName: name,
        location: addLocVal || undefined,
        status: 'NORMAL',
        note: (this.data.addNote || '').trim() || undefined,
        dynamicValues: Object.keys(addDynamicValues).length ? addDynamicValues : undefined,
        photoUrls: photoUrls.length ? JSON.stringify(photoUrls) : undefined,
      });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.closeAddPanel();
      await this.loadData(1);
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '创建失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ── 扫码填充 ──

  async openScanFill() {
    wx.scanCode({
      onlyFromCamera: false,
      success: async (res) => {
        const code = (res && (res.result || res.rawData)) ? String(res.result || res.rawData).trim() : '';
        if (!code) return;
        wx.showLoading({ title: '检索中…', mask: true });
        try {
          const source = await assetApi.fetchAssetByCode(code);
          wx.hideLoading();
          if (!source || !source.id) {
            wx.showToast({ title: '未找到该资产', icon: 'none' });
            return;
          }
          const fillFields = [];
          const fillChecked = {};
          let isFirstSingle = true;
          const srcLocation = source.location || '';
          const srcValues = source.dynamicValues || {};
          const columns = this.data.columns || [];
          // 查找动态位置列（优先使用，与列表显示一致）
          const locCol = pickCurrentLocationColumn(columns);
          const locKey = locCol ? locCol.columnKey : '';
          const dynLocVal = locKey ? (srcValues[locKey] || '').trim() : '';
          if (dynLocVal) {
            fillFields.push({ key: locKey, label: '存放地点', value: dynLocVal });
            fillChecked[locKey] = isFirstSingle;
            isFirstSingle = false;
          } else if (srcLocation && srcLocation.trim()) {
            fillFields.push({ key: '_location', label: '存放地点', value: srcLocation.trim() });
            fillChecked['_location'] = isFirstSingle;
            isFirstSingle = false;
          }
          // 动态字段（跳过空表头和存放地点类）
          const skipLabels = ['存放地点', '当前存放地点'];
          for (let i = 0; i < columns.length; i += 1) {
            const col = columns[i];
            const label = col.displayLabel || col.columnLabel || '';
            if (!label.trim()) continue;
            if (skipLabels.some((s) => label.includes(s))) continue;
            const key = col.columnKey;
            const val = srcValues[key] || '';
            if (val && val.trim()) {
              fillFields.push({ key, label, value: val.trim() });
              fillChecked[key] = isFirstSingle;
              isFirstSingle = false;
            }
          }
          this.setData({
            showFillPanel: true,
            fillSourceAsset: source,
            fillFields,
            fillChecked,
          });
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '检索失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '扫描已取消', icon: 'none' });
      },
    });
  },

  closeFillPanel() {
    this.setData({ showFillPanel: false, fillSourceAsset: null, fillFields: [], fillChecked: {} });
  },

  toggleFillField(e) {
    const key = e.currentTarget.dataset.key;
    const fillChecked = { ...(this.data.fillChecked || {}) };
    fillChecked[key] = !fillChecked[key];
    this.setData({ fillChecked });
  },

  applyFillFields(e) {
    const mode = e.currentTarget.dataset.mode || 'all';
    const fillFields = this.data.fillFields || [];
    const fillChecked = this.data.fillChecked || {};
    const detailEditValues = { ...(this.data.detailEditValues || {}) };
    let detailLocation = this.data.detailLocation || '';

    for (let i = 0; i < fillFields.length; i += 1) {
      const field = fillFields[i];
      if (mode === 'checked' && !fillChecked[field.key]) continue;
      if (field.key === '_location') {
        if (mode === 'empty' && detailLocation && detailLocation.trim()) continue;
        detailLocation = field.value;
      } else {
        const curVal = detailEditValues[field.key] || '';
        if (mode === 'empty' && curVal && curVal.trim()) continue;
        detailEditValues[field.key] = field.value;
      }
    }
    this.setData({
      showFillPanel: false,
      fillSourceAsset: null,
      fillFields: [],
      fillChecked: {},
      detailEditValues,
      detailLocation,
    });
    wx.showToast({ title: '已填充', icon: 'success' });
  },

  // ── 详情照片管理 ──

  async chooseDetailPhotos() {
    const max = 9;
    const arr = [...(this.data.detailPhotoUrls || [])];
    if (arr.length >= max) {
      wx.showToast({ title: '最多9张', icon: 'none' });
      return;
    }
    try {
      const files = await pickTransferImages(Math.min(max - arr.length, 9));
      if (!files || !files.length) return;
      let failCount = 0;
      for (let i = 0; i < files.length; i += 1) {
        const path = files[i];
        if (!path) continue;
        wx.showLoading({ title: `上传中 ${i + 1}/${files.length}`, mask: true });
        arr.push({ tempPath: path, url: '' });
        this.setData({ detailPhotoUrls: arr });
        try {
          const url = await springAuth.uploadFileDirect(path, {});
          arr[arr.length - 1] = { tempPath: '', url };
        } catch (singleErr) {
          arr.pop();
          failCount += 1;
        }
        this.setData({ detailPhotoUrls: [...arr] });
      }
      wx.hideLoading();
      // 自动保存 photoUrls
      const detailAsset = this.data.detailAsset;
      if (detailAsset && detailAsset.id) {
        const allUrls = arr.map((x) => (x && x.url ? String(x.url).trim() : '')).filter(Boolean);
        try {
          await assetApi.patchAssetRecord(detailAsset.id, {
            photoUrls: allUrls.length ? JSON.stringify(allUrls) : '',
          });
        } catch (e) { /* silent */ }
      }
      if (failCount > 0) {
        wx.showToast({ title: `有${failCount}张上传失败`, icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
    }
  },

  async removeDetailPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index) || index < 0) return;
    const arr = [...(this.data.detailPhotoUrls || [])];
    arr.splice(index, 1);
    this.setData({ detailPhotoUrls: arr });
    // 自动保存
    const detailAsset = this.data.detailAsset;
    if (detailAsset && detailAsset.id) {
      const allUrls = arr.map((x) => (typeof x === 'string' ? x : (x && x.url ? String(x.url).trim() : ''))).filter(Boolean);
      try {
        await assetApi.patchAssetRecord(detailAsset.id, {
          photoUrls: allUrls.length ? JSON.stringify(allUrls) : '',
        });
      } catch (e) { /* silent */ }
    }
  },

  openApplyPanel() {
    this.setData({
      showApplyPanel: true,
      applyStep: 'search',
      applyAsset: null,
      applyCurrentLocation: '',
      searchRows: [],
      searchKeyword: '',
      transferDate: todayStr(),
      transferLocation: '',
          transferUserName: '',
      transferUserEmployeeId: '',
      transferRemark: '',
      transferPhotosBefore: [],
      transferPhotosAfter: [],
      uploadingPhotoSlot: '',
    });
  },

  closeApplyPanel() {
    this.setData({
      showApplyPanel: false,
      applyStep: 'search',
      applyAsset: null,
      transferPhotosBefore: [],
      transferPhotosAfter: [],
      uploadingPhotoSlot: '',
    });
  },

  openApplyForAsset(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id) || null;
    this.setData({
      showApplyPanel: true,
      applyStep: 'form',
      applyAsset: row,
      applyCurrentLocation: row && (row.currentLocation || row.location) ? (row.currentLocation || row.location) : '',
      searchRows: [],
      searchKeyword: '',
      transferDate: todayStr(),
      transferLocation: '',
          transferUserName: '',
      transferUserEmployeeId: '',
      transferRemark: '',
      transferPhotosBefore: [],
      transferPhotosAfter: [],
      uploadingPhotoSlot: '',
    });
  },

  backToSearch() {
    this.setData({
      applyStep: 'search',
      applyAsset: null,
      applyCurrentLocation: '',
      searchRows: [],
      searchKeyword: '',
    });
  },

  onApplySearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
  },

  onScanApplyAsset() {
    wx.scanCode({
      onlyFromCamera: false,
      success: async (res) => {
        const code = (res && (res.result || res.rawData)) ? String(res.result || res.rawData).trim() : '';
        if (!code) return;
        wx.showLoading({ title: '查找资产…', mask: true });
        try {
          const asset = await assetApi.fetchAssetByCode(code);
          wx.hideLoading();
          if (asset && asset.id) {
            const locationKey = this.data.currentLocationColumnKey || '';
            const currentLocation = locationKey && asset.dynamicValues ? (asset.dynamicValues[locationKey] || '') : '';
            this.setData({
              applyStep: 'form',
              applyAsset: asset,
              applyCurrentLocation: currentLocation || asset.location || '',
              transferLocation: '',
            });
          } else {
            wx.showToast({ title: '未找到该资产', icon: 'none' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '查找失败', icon: 'none' });
        }
      },
      fail: () => { wx.showToast({ title: '扫描已取消', icon: 'none' }); },
    });
  },

  async doApplySearch() {
    const keyword = (this.data.searchKeyword || '').trim();
    if (!keyword) {
      this.setData({ searchRows: [] });
      return;
    }
    wx.showLoading({ title: '检索中…', mask: true });
    try {
      const rows = await assetApi.searchAssets(keyword, 15);
      this.setData({ searchRows: rows || [] });
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '检索失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  pickApplyAsset(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.searchRows || []).find((x) => x.id === id) || null;
    if (!row) return;
    this.setData({
      applyStep: 'form',
      applyAsset: row,
      applyCurrentLocation: row.currentLocation || row.location || '',
      transferLocation: this.data.transferLocation || '',
    });
  },

  onTransferDateChange(e) {
    this.setData({ transferDate: (e.detail && e.detail.value) || '' });
  },




  onTransferUserNameInput(e) {
    this.setData({ transferUserName: e.detail.value || '' });
  },

  onTransferUserEmployeeIdInput(e) {
    this.setData({ transferUserEmployeeId: e.detail.value || '' });
  },

  onTransferRemarkInput(e) {
    this.setData({ transferRemark: e.detail.value || '' });
  },

  async chooseTransferSlotPhotos(e) {
    const slot = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.slot) || 'before';
    if (this.data.uploadingPhotoSlot) return;
    const key = slot === 'after' ? 'transferPhotosAfter' : 'transferPhotosBefore';
    const arr = [...(this.data[key] || [])];
    const max = 9;
    if (arr.length >= max) {
      wx.showToast({ title: '最多9张', icon: 'none' });
      return;
    }
    this.setData({ uploadingPhotoSlot: slot });
    try {
      const files = await pickTransferImages(Math.min(max - arr.length, 9));
      if (!files || !files.length) return;
      let failCount = 0;
      let failMsg = '';
      for (let i = 0; i < files.length; i += 1) {
        const path = files[i];
        if (!path) continue;
        wx.showLoading({
          title: `上传中 ${i + 1}/${files.length}`,
          mask: true,
        });
        const idx = arr.length;
        arr.push({ tempPath: path, url: '' });
        this.setData({ [key]: arr });
        try {
          const url = await springAuth.uploadFileDirect(path, {});
          arr[idx] = { tempPath: '', url };
        } catch (singleErr) {
          arr.splice(idx, 1);
          failCount += 1;
          failMsg = (singleErr && singleErr.message) ? String(singleErr.message) : '';
        }
        this.setData({ [key]: [...arr] });
      }
      wx.hideLoading();
      if (failCount > 0) {
        wx.showToast({
          title: failMsg ? failMsg.slice(0, 18) : `有${failCount}张上传失败`,
          icon: 'none',
        });
      }
    } catch (err) {
      wx.hideLoading();
      const em = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : '';
      if (em.includes('cancel')) return;
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploadingPhotoSlot: '' });
    }
  },

  removeTransferSlotPhoto(e) {
    const slot = (e.currentTarget.dataset && e.currentTarget.dataset.slot) || 'before';
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index) || index < 0) return;
    const key = slot === 'after' ? 'transferPhotosAfter' : 'transferPhotosBefore';
    const arr = [...(this.data[key] || [])];
    arr.splice(index, 1);
    this.setData({ [key]: arr });
  },

  previewTransferSlotPhotos(e) {
    const slot = (e.currentTarget.dataset && e.currentTarget.dataset.slot) || 'before';
    const index = Number(e.currentTarget.dataset.index || 0);
    const key = slot === 'after' ? 'transferPhotosAfter' : 'transferPhotosBefore';
    const arr = this.data[key] || [];
    const urls = arr
      .map((x) => (x && (x.url || x.tempPath) ? springAuth.toAbsoluteMediaUrl(String(x.url || x.tempPath).trim()) : ''))
      .filter(Boolean);
    if (!urls.length) return;
    wx.previewImage({
      urls,
      current: urls[index] || urls[0],
    });
  },

  async submitTransfer() {
    const asset = this.data.applyAsset;
    if (!asset || !asset.id) {
      wx.showToast({ title: '请选择资产', icon: 'none' });
      return;
    }
    const transferDate = (this.data.transferDate || '').trim();
    const transferLocation = (this.data.transferLocation || '').trim();
    if (!transferDate || !transferLocation) {
      wx.showToast({ title: '请填写日期和地点', icon: 'none' });
      return;
    }
    const transferTime = transferDate + ' 00:00:00';
    const beforeUrls = (this.data.transferPhotosBefore || [])
      .map((x) => (x && x.url ? String(x.url).trim() : ''))
      .filter(Boolean);
    // 优先使用输入的使用人，否则用当前登录用户的昵称（与 Web 端一致：displayName > displayNickname > username）
    let userName = (this.data.transferUserName || '').trim();
    if (!userName) {
      try {
        const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO) || '{}';
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        userName = (info && (info.displayName || info.displayNickname || info.username)) || '';
      } catch (e) { /* ignore */ }
    }
    const userEmployeeId = (this.data.transferUserEmployeeId || '').trim();
    wx.showLoading({ title: '提交中…', mask: true });
    try {
      await assetApi.lockAsset(asset.id);
      await assetApi.submitTransferRequest({
        assetId: asset.id,
        transferTime,
        transferLocation,
        remark: (this.data.transferRemark || '').trim() || undefined,
        photoUrlsBefore: beforeUrls.length ? beforeUrls : undefined,
        userName: userName || undefined,
        userEmployeeId: userEmployeeId || undefined,
      });
      wx.showToast({ title: '申请成功', icon: 'success' });
      this.closeApplyPanel();
      await this.loadData();
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '提交失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ══════════════════════════════════════════════
  // 批量记录
  // ══════════════════════════════════════════════

  _syncBatchIdMap(batchAssets) {
    const map = {};
    (batchAssets || []).forEach((a) => { map[a.id] = true; });
    return map;
  },

  onToggleBatchAsset(e) {
    const id = e.currentTarget.dataset.id;
    // 优先用已有批量数据，否则从行数据构建
    let row = null;
    const existingInBatch = (this.data.batchAssets || []).find((a) => a.id === id);
    if (existingInBatch) {
      row = existingInBatch;
    } else {
      row = (this.data.rows || []).find((x) => x.id === id) || null;
    }
    if (!row) return;
    const batchAssets = [...(this.data.batchAssets || [])];
    const idx = batchAssets.findIndex((a) => a.id === id);
    if (idx >= 0) {
      batchAssets.splice(idx, 1);
      wx.showToast({ title: '已移出批量', icon: 'success' });
    } else {
      batchAssets.push({
        id: row.id,
        assetCode: row.assetCode || '',
        assetName: row.assetName || '',
        location: row.currentLocation || row.location || '',
        dynamicValues: { ...(row.dynamicValues || {}) },
      });
      wx.showToast({ title: '已加入批量', icon: 'success' });
    }
    // 最后一个资产移除时，若面板打开则自动关闭
    if (batchAssets.length === 0 && this.data.showBatchPanel) {
      this.closeBatchPanel();
      this.setData({ batchAssets: [], batchAssetIdMap: {}, batchChecked: {}, batchCheckedCount: 0 });
      return;
    }
    const batchChecked = { ...(this.data.batchChecked || {}) };
    Object.keys(batchChecked).forEach((bid) => {
      if (!batchAssets.some((a) => a.id === bid)) delete batchChecked[bid];
    });
    this.setData({
      batchAssets,
      batchAssetIdMap: this._syncBatchIdMap(batchAssets),
      batchChecked,
      batchCheckedCount: Object.values(batchChecked).filter(Boolean).length,
    });
  },

  openBatchPanel() {
    if (!(this.data.batchAssets || []).length) {
      wx.showToast({ title: '批量列表为空', icon: 'none' });
      return;
    }
    // 默认全选
    const batchChecked = {};
    (this.data.batchAssets || []).forEach((a) => { batchChecked[a.id] = true; });
    this.setData({ showBatchPanel: true, batchChecked, batchCheckedCount: (this.data.batchAssets || []).length });
  },

  closeBatchPanel() {
    this.setData({
      showBatchPanel: false,
      showBatchFillPanel: false,
      showBatchEditPanel: false,
      batchFillSourceAsset: null,
      batchFillFields: [],
      batchFillChecked: {},
      batchEditFields: [],
      batchEditChecked: {},
      batchEditValues: {},
    });
  },

  onBatchCheckToggle(e) {
    const id = e.currentTarget.dataset.id;
    const batchChecked = { ...(this.data.batchChecked || {}) };
    batchChecked[id] = !batchChecked[id];
    this.setData({ batchChecked, batchCheckedCount: Object.values(batchChecked).filter(Boolean).length });
  },

  onBatchCheckAll() {
    const batchChecked = {};
    (this.data.batchAssets || []).forEach((a) => { batchChecked[a.id] = true; });
    this.setData({ batchChecked, batchCheckedCount: (this.data.batchAssets || []).length });
  },

  onBatchUncheckAll() {
    this.setData({ batchChecked: {}, batchCheckedCount: 0 });
  },

  onClearAllBatch() {
    if (!(this.data.batchAssets || []).length) return;
    wx.showModal({
      title: '清空批量列表',
      content: `确定要清空全部 ${this.data.batchAssets.length} 条资产吗？`,
      success: (res) => {
        if (!res.confirm) return;
        this.setData({
          batchAssets: [],
          batchAssetIdMap: {},
          batchChecked: {},
          batchCheckedCount: 0,
          showBatchPanel: false,
        });
        wx.showToast({ title: '已清空', icon: 'success' });
      },
    });
  },

  // ── 构建字段预览：每个字段下列出批量资产中的现有值（去重） ──
  buildBatchFieldPreviews(fieldKey) {
    const batchAssets = this.data.batchAssets || [];
    const previewMap = {}; // value → [assetCode1, assetCode2]
    for (let i = 0; i < batchAssets.length; i += 1) {
      const a = batchAssets[i];
      let val = '';
      if (fieldKey === '_location') {
        val = (a.location || '').trim();
      } else {
        val = ((a.dynamicValues || {})[fieldKey] || '').trim();
      }
      const displayVal = val || '（空）';
      if (!previewMap[displayVal]) previewMap[displayVal] = [];
      previewMap[displayVal].push(a.assetCode || a.assetName || a.id);
    }
    return Object.entries(previewMap).map(([value, assetNames]) => ({
      value,
      assetNamesStr: assetNames.join('、'),
    }));
  },

  // ── 批量扫码填充 ──
  openBatchScanFill() {
    const checkedIds = Object.keys(this.data.batchChecked || {}).filter((k) => this.data.batchChecked[k]);
    if (!checkedIds.length) {
      wx.showToast({ title: '请先勾选资产', icon: 'none' });
      return;
    }
    wx.scanCode({
      onlyFromCamera: false,
      success: async (res) => {
        const code = (res && (res.result || res.rawData)) ? String(res.result || res.rawData).trim() : '';
        if (!code) return;
        wx.showLoading({ title: '检索中…', mask: true });
        try {
          const source = await assetApi.fetchAssetByCode(code);
          wx.hideLoading();
          if (!source || !source.id) {
            wx.showToast({ title: '未找到该资产', icon: 'none' });
            return;
          }
          const srcLocation = source.location || '';
          const srcValues = source.dynamicValues || {};
          const columns = this.data.columns || [];
          const batchFillFields = [];
          const batchFillChecked = {};
          let isFirst = true;
          // 查找动态位置列（显示优先使用它，而非固定字段 asset.location）
          const locationCol = pickCurrentLocationColumn(columns);
          const locKey = locationCol ? locationCol.columnKey : '';
          const dynLocVal = locKey ? (srcValues[locKey] || '').trim() : '';
          // 优先用动态列位置，兜底用固定字段位置
          if (dynLocVal) {
            batchFillFields.push({
              key: locKey,
              label: '存放地点',
              sourceValue: dynLocVal,
              previews: this.buildBatchFieldPreviews(locKey),
            });
            batchFillChecked[locKey] = isFirst;
            isFirst = false;
          } else if (srcLocation && srcLocation.trim()) {
            batchFillFields.push({
              key: '_location',
              label: '存放地点',
              sourceValue: srcLocation.trim(),
              previews: this.buildBatchFieldPreviews('_location'),
            });
            batchFillChecked['_location'] = isFirst;
            isFirst = false;
          }
          // 动态字段（跳过空表头和已处理的位置列）
          const skipLabels = ['存放地点', '当前存放地点'];
          for (let i = 0; i < columns.length; i += 1) {
            const col = columns[i];
            const key = col.columnKey;
            const label = col.displayLabel || col.columnLabel || '';
            if (!label.trim()) continue;
            if (skipLabels.some((s) => label.includes(s))) continue;
            const val = srcValues[key] || '';
            if (val && val.trim()) {
              batchFillFields.push({
                key,
                label,
                sourceValue: val.trim(),
                previews: this.buildBatchFieldPreviews(key),
              });
              batchFillChecked[key] = isFirst;
              isFirst = false;
            }
          }
          if (!batchFillFields.length) {
            wx.showToast({ title: '该资产没有可填充的字段', icon: 'none' });
            return;
          }
          this.setData({
            showBatchFillPanel: true,
            batchFillSourceAsset: source,
            batchFillFields,
            batchFillChecked,
          });
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '检索失败', icon: 'none' });
        }
      },
      fail: () => { wx.showToast({ title: '扫描已取消', icon: 'none' }); },
    });
  },

  closeBatchFillPanel() {
    this.setData({ showBatchFillPanel: false, batchFillSourceAsset: null, batchFillFields: [], batchFillChecked: {} });
  },

  onBatchFillFieldToggle(e) {
    const key = e.currentTarget.dataset.key;
    const batchFillChecked = { ...(this.data.batchFillChecked || {}) };
    batchFillChecked[key] = !batchFillChecked[key];
    this.setData({ batchFillChecked });
  },

  async applyBatchFill() {
    const batchFillFields = this.data.batchFillFields || [];
    const batchFillChecked = this.data.batchFillChecked || {};
    const selectedFields = batchFillFields.filter((f) => batchFillChecked[f.key]);
    if (!selectedFields.length) {
      wx.showToast({ title: '请至少勾选一个字段', icon: 'none' });
      return;
    }
    const checkedIds = Object.keys(this.data.batchChecked || {}).filter((k) => this.data.batchChecked[k]);
    if (!checkedIds.length) {
      wx.showToast({ title: '请先勾选资产', icon: 'none' });
      return;
    }
    // 存放地点走「按节点批量移动」（后端同步文本与节点指针），不再当普通字段做文本覆盖
    const locField = selectedFields.find((f) => f.key === '_location');
    const fixedFields = {};
    const dynamicValues = {};
    for (let i = 0; i < selectedFields.length; i += 1) {
      const f = selectedFields[i];
      if (f.key === '_location') continue;
      dynamicValues[f.key] = f.sourceValue;
    }
    wx.showModal({
      title: '确认批量填充',
      content: `将对 ${checkedIds.length} 条资产的 ${selectedFields.length} 个字段执行批量覆盖，确定继续？`,
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        wx.showLoading({ title: '批量更新中…', mask: true });
        try {
          let movedFail = 0;
          if (locField) {
            const nodeId = (this.data.fillSourceAsset || {}).locationNodeId;
            if (nodeId) {
              const r = await assetApi.batchMoveAssetLocation(checkedIds, nodeId);
              movedFail = (r.failed || []).length;
            }
          }
          if (Object.keys(fixedFields).length || Object.keys(dynamicValues).length) {
            await assetApi.batchUpdateAssets({
              ids: checkedIds,
              fixedFields: Object.keys(fixedFields).length ? fixedFields : undefined,
              dynamicValues: Object.keys(dynamicValues).length ? dynamicValues : undefined,
            });
          }
          if (movedFail > 0) {
            wx.showToast({ title: `已更新${checkedIds.length}条，${movedFail}条地点未改`, icon: 'none' });
          } else {
            wx.showToast({ title: `已更新${checkedIds.length}条`, icon: 'success' });
          }
          // 清除批量快照 + 关闭面板 + 回第一页刷新列表
          this.setData({
            batchAssets: [], batchAssetIdMap: {}, batchChecked: {}, batchCheckedCount: 0,
            showBatchPanel: false, showBatchFillPanel: false, showBatchEditPanel: false,
            batchFillSourceAsset: null, batchFillFields: [], batchFillChecked: {},
            batchEditFields: [], batchEditChecked: {}, batchEditValues: {},
            page: 1, rows: [],
          });
          await this.loadData(1);
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  // ── 批量编辑 ──
  openBatchEdit() {
    const checkedIds = Object.keys(this.data.batchChecked || {}).filter((k) => this.data.batchChecked[k]);
    if (!checkedIds.length) {
      wx.showToast({ title: '请先勾选资产', icon: 'none' });
      return;
    }
    const transferSkipLabels = ['申请转移时间', '申请转移地点', '申请人', '申请备注', '转移时间', '转移地点', '是否锁定'];
    const columns = (this.data.columns || []).filter((col) => {
      const label = col.displayLabel || col.columnLabel || '';
      return !transferSkipLabels.some((t) => label.includes(t));
    });
    const batchEditFields = [];
    const batchEditChecked = {};
    const batchEditValues = {};
    // 存放地点：优先用动态列 key（与列表显示一致），兜底用固定字段
    const locCol = pickCurrentLocationColumn(this.data.columns);
    const editLocKey = locCol ? locCol.columnKey : '_location';
    batchEditFields.push({
      key: editLocKey,
      label: '存放地点',
      editValue: '',
      isLocation: true,
      previews: this.buildBatchFieldPreviews(editLocKey),
    });
    // 默认不勾选，用户自行选择（跳过空表头和存放地点类）
    const skipLabels = ['存放地点', '当前存放地点'];
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      const key = col.columnKey;
      const label = col.displayLabel || col.columnLabel || '';
      if (!label.trim()) continue;
      if (skipLabels.some((s) => label.includes(s))) continue;
      const previews = this.buildBatchFieldPreviews(key);
      batchEditFields.push({ key, label, editValue: '', previews });
    }
    this.setData({
      showBatchEditPanel: true,
      batchEditFields,
      batchEditChecked,
      batchEditValues,
      batchEditLocationKey: editLocKey,
      batchEditLocationNodeId: null,
    });
  },

  closeBatchEditPanel() {
    this.setData({
      showBatchEditPanel: false,
      batchEditFields: [],
      batchEditChecked: {},
      batchEditValues: {},
      batchEditLocationKey: '',
      batchEditLocationNodeId: null,
    });
  },

  /** 批量编辑里的「存放地点」用树选择器：回填路径文本 + 记录节点 id */
  onBatchEditLocationPicked(e) {
    const path = (e.detail && e.detail.path) || '';
    const nodeId = (e.detail && e.detail.nodeId) || null;
    const key = this.data.batchEditLocationKey;
    if (!key) return;
    const values = Object.assign({}, this.data.batchEditValues || {});
    values[key] = path;
    this.setData({ batchEditValues: values, batchEditLocationNodeId: nodeId });
  },

  onBatchEditFieldToggle(e) {
    const key = e.currentTarget.dataset.key;
    const batchEditChecked = { ...(this.data.batchEditChecked || {}) };
    batchEditChecked[key] = !batchEditChecked[key];
    this.setData({ batchEditChecked });
  },

  onBatchEditValueInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    this.setData({
      batchEditValues: { ...(this.data.batchEditValues || {}), [key]: value },
    });
  },

  async applyBatchEdit() {
    const batchEditChecked = this.data.batchEditChecked || {};
    const batchEditValues = this.data.batchEditValues || {};
    const selectedKeys = Object.keys(batchEditChecked).filter((k) => batchEditChecked[k]);
    if (!selectedKeys.length) {
      wx.showToast({ title: '请至少勾选一个字段', icon: 'none' });
      return;
    }
    // 检查勾选的字段是否都有值
    for (let i = 0; i < selectedKeys.length; i += 1) {
      if (!(batchEditValues[selectedKeys[i]] || '').trim()) {
        wx.showToast({ title: '勾选的字段必须填写值', icon: 'none' });
        return;
      }
    }
    const checkedIds = Object.keys(this.data.batchChecked || {}).filter((k) => this.data.batchChecked[k]);
    if (!checkedIds.length) {
      wx.showToast({ title: '请先勾选资产', icon: 'none' });
      return;
    }
    // 存放地点走「按节点批量移动」（后端同步文本与节点指针），其余字段走批量更新
    const locFieldKey = this.data.batchEditLocationKey || '';
    const locNodeId = this.data.batchEditLocationNodeId || null;
    let locSelected = false;
    const fixedFields = {};
    const dynamicValues = {};
    for (let i = 0; i < selectedKeys.length; i += 1) {
      const key = selectedKeys[i];
      const val = (batchEditValues[key] || '').trim();
      if (locFieldKey && key === locFieldKey) {
        locSelected = true;
        continue;
      }
      if (key === '_location') {
        fixedFields.location = val;
      } else {
        dynamicValues[key] = val;
      }
    }
    wx.showModal({
      title: '确认批量编辑',
      content: `将对 ${checkedIds.length} 条资产的 ${selectedKeys.length} 个字段执行批量覆盖，确定继续？`,
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        wx.showLoading({ title: '批量更新中…', mask: true });
        try {
          let movedFail = 0;
          if (locSelected && locNodeId) {
            const r = await assetApi.batchMoveAssetLocation(checkedIds, locNodeId);
            movedFail = (r.failed || []).length;
          }
          if (Object.keys(fixedFields).length || Object.keys(dynamicValues).length) {
            await assetApi.batchUpdateAssets({
              ids: checkedIds,
              fixedFields: Object.keys(fixedFields).length ? fixedFields : undefined,
              dynamicValues: Object.keys(dynamicValues).length ? dynamicValues : undefined,
            });
          }
          if (movedFail > 0) {
            wx.showToast({ title: `已更新${checkedIds.length}条，${movedFail}条地点未改`, icon: 'none' });
          } else {
            wx.showToast({ title: `已更新${checkedIds.length}条`, icon: 'success' });
          }
          this.setData({
            batchAssets: [], batchAssetIdMap: {}, batchChecked: {}, batchCheckedCount: 0,
            showBatchPanel: false, showBatchFillPanel: false, showBatchEditPanel: false,
            batchFillSourceAsset: null, batchFillFields: [], batchFillChecked: {},
            batchEditFields: [], batchEditChecked: {}, batchEditValues: {},
            page: 1, rows: [],
          });
          await this.loadData(1);
        } catch (e) {
          wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '更新失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  _buildExportColumns() {
    const fixedLabels = ['资产编码', '资产名称', '状态', '存放地点', '标注', '是否锁定', '申请转移时间', '申请转移地点', '申请人', '申请备注'];
    const columns = this.data.columns || [];
    const exportColumns = fixedLabels.map((l) => ({ label: l, key: l, checked: true }));
    for (let i = 0; i < columns.length; i++) {
      const label = columns[i].displayLabel || columns[i].columnLabel || '';
      if (!label.trim() || fixedLabels.includes(label)) continue;
      exportColumns.push({ label, key: label, checked: true });
    }
    return exportColumns;
  },

  _getSavedExportColumns() {
    try { const s = wx.getStorageSync('assetExportCols'); return s && Array.isArray(s) ? s : null; } catch (_) { return null; }
  },

  _saveExportColumns(cols) {
    try { wx.setStorageSync('assetExportCols', cols); } catch (_) { /* ignore */ }
  },

  openExportPicker() {
    const saved = this._getSavedExportColumns();
    const all = this._buildExportColumns();
    this.setData({
      showExportConfirm: true,
      exportSavedCount: saved ? saved.length : all.length,
    });
  },

  onExportNow() {
    this.setData({ showExportConfirm: false });
    const saved = this._getSavedExportColumns();
    if (saved) {
      this._doExportWithColumns(saved);
    } else {
      this._doExportWithColumns(this._buildExportColumns().map((c) => c.label));
    }
  },

  onExportConfig() {
    this.setData({ showExportConfirm: false });
    this._showExportPicker(this._getSavedExportColumns());
  },

  closeExportConfirm() {
    this.setData({ showExportConfirm: false });
  },

  _showExportPicker(savedCols) {
    if (savedCols) {
      const set = new Set(savedCols);
      const exportColumns = this._buildExportColumns().map((c) => ({ ...c, checked: set.has(c.label) }));
      this.setData({ showExportPicker: true, exportColumns, exportAllChecked: exportColumns.every((c) => c.checked) });
    } else {
      const exportColumns = this._buildExportColumns();
      this.setData({ showExportPicker: true, exportColumns, exportAllChecked: true });
    }
  },

  closeExportPicker() { this.setData({ showExportPicker: false }); },

  onExportToggleAll() {
    const all = !this.data.exportAllChecked;
    this.setData({ exportColumns: (this.data.exportColumns || []).map((c) => ({ ...c, checked: all })), exportAllChecked: all });
  },

  onExportColumnToggle(e) {
    const key = e.currentTarget.dataset.key;
    const cols = (this.data.exportColumns || []).map((c) => (c.key === key ? { ...c, checked: !c.checked } : c));
    this.setData({ exportColumns: cols, exportAllChecked: cols.every((c) => c.checked) });
  },

  onSaveExportConfig() {
    const selected = (this.data.exportColumns || []).filter((c) => c.checked).map((c) => c.label);
    if (!selected.length) { wx.showToast({ title: '请至少选择一列', icon: 'none' }); return; }
    this._saveExportColumns(selected);
    this.setData({ showExportPicker: false });
    wx.showToast({ title: '配置已保存', icon: 'success' });
  },

  async _doExportWithColumns(selectedCols) {
    const total = this.data.total || 0;
    wx.showLoading({ title: `导出中（共${total}条）…`, mask: true });
    try {
      const fileBuf = await assetApi.exportAssetExcel({
        keyword: this.data.appliedKeyword || undefined,
        campus: this.data.campus || undefined,
        assetName: this.data.appliedAssetName || undefined,
        user: this.data.appliedUser || undefined,
        model: this.data.appliedModel || undefined,
        columns: selectedCols.join(','),
      });
      wx.showLoading({ title: '写入文件…', mask: true });
      const filePath = `${wx.env.USER_DATA_PATH}/asset_records_${Date.now()}.xlsx`;
      await new Promise((resolve, reject) => {
        // 直连模式拿到的是 ArrayBuffer，直接写，不需要 base64 编码
        wx.getFileSystemManager().writeFile({ filePath, data: fileBuf, success: resolve, fail: reject });
      });
      wx.hideLoading();
      wx.showToast({ title: `导出成功（${total}条）`, icon: 'success' });
      setTimeout(() => { wx.openDocument({ filePath, fileType: 'xlsx', showMenu: true }); }, 600);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 30) : '导出失败', icon: 'none' });
    }
  },
});

