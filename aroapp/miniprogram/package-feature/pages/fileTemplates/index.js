const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const fileTemplatesApi = require('../../utils/fileTemplatesApi.js');
const fileFoldersApi = require('../../utils/fileFoldersApi.js');
const folderTree = require('../../utils/folderTree.js');
const printFormat = require('../../utils/printFormat.js');
const printApi = require('../../utils/printApi.js');
const printCart = require('../../utils/printCart.js');
const roleAccess = require('../../../utils/roleAccess.js');

const STATION_STORAGE_KEY = 'tpl_print_station_id';

// 待打清单只建一次：cart 是普通对象（非响应式），localFiles 又在内存里，
// 每次 onShow/渲染重建都会立刻丢本地文件，所以挂在模块顶层、整个页面生命周期复用同一个实例。
const cart = printCart.createCart({
  getItem: (k) => { const v = wx.getStorageSync(k); return v === '' ? null : v; },
  setItem: (k, v) => wx.setStorageSync(k, v),
});

function formatSize(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 19);
}

function mapApiRowToListRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id || ''),
    originalName: String(row.originalName || row.original_name || '未命名'),
    sizeText: formatSize(row.sizeBytes != null ? row.sizeBytes : row.size_bytes),
    timeText: formatTime(row.createTime || row.create_time),
  };
}

Page({
  data: {
    loading: true,
    rows: [],
    uploadLoading: false,
    isAdmin: false,
    /** van-swipe-cell right-width 为 px：移动 66，删除（仅管理员显示）再 +66 */
    fileSwipeRightWidth: 66,
    keyword: '',
    visibleRows: [],
    selectedIds: {},
    selectedCount: 0,
    allSelected: false,
    cartCount: 0,
    cartRows: [],
    cartOpen: false,
    queueSummary: { sent: 0, pending: 0, hasActive: false },
    queueRows: [],
    queueFailedCount: 0,
    queueExpanded: false,
    dispatch: null,
    dispatchLoading: false,
    stations: [],
    // ── 文件夹导航与管理 ──
    currentFolderId: null,
    breadcrumb: [],
    childFolders: [],
    showFolderSheet: false,      // 新建/改名输入弹窗
    folderSheetMode: '',         // 'create' | 'rename'
    folderFormName: '',
    folderSheetParentId: null,
    folderSheetEditId: null,
    showMoveSheet: false,        // 文件移动弹窗
    moveTargetFile: null,
    movePickFolderId: null,
    moveFolderOptions: [],
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/fileTemplates/index', role, 'STAFF')) return;
    const isAdmin = roleAccess.hasMinRole(role, 'ADMIN');
    this.setData({ isAdmin, fileSwipeRightWidth: isAdmin ? 132 : 66 });
    void this.ensureFolderTree();
    void this.loadList();
    void this.refreshQueue();
    this.syncCart();
  },

  onHide() {
    this.stopQueuePolling();
  },

  onUnload() {
    this.stopQueuePolling();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      // 有关键词 → 跨文件夹拉全部再本地过滤；无关键词 → 按当前文件夹取本层（根层=未归类）
      const kw = String(this.data.keyword || '').trim();
      const folderId = kw ? null : (this.data.currentFolderId == null ? 0 : this.data.currentFolderId);
      const r = await fileTemplatesApi.fetchFileTemplates(folderId);
      if (!r.ok) throw new Error(r.message || '加载失败');
      const rows = (r.rows || []).map((row) => mapApiRowToListRow(row)).filter(Boolean);
      this.setData({
        rows,
        visibleRows: printFormat.filterTemplates(rows, this.data.keyword),
        selectedIds: {},
        selectedCount: 0,
        allSelected: false,
        loading: false,
      });
    } catch (e) {
      this.setData({ rows: [], visibleRows: [], selectedIds: {}, selectedCount: 0, allSelected: false, loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  // ── 文件夹导航 ──

  /** 文件夹树只拉一次；已拉过只重算面包屑与子文件夹 */
  async ensureFolderTree() {
    if (this._folderTree) {
      this.rebuildFolderNav();
      return;
    }
    try {
      const r = await fileFoldersApi.fetchFileFolderTree();
      this._folderTree = r.ok ? (r.rows || []) : [];
    } catch (e) {
      this._folderTree = [];
    }
    this.rebuildFolderNav();
  },

  /** 按 currentFolderId 重算面包屑与子文件夹入口（件数用 totalCount，含子孙） */
  rebuildFolderNav() {
    const id = this.data.currentFolderId;
    const tree = this._folderTree || [];
    const node = id == null ? null : folderTree.findNodeById(tree, id);
    const children = node ? (node.children || []) : tree;
    this.setData({
      breadcrumb: id == null ? [] : folderTree.findNodePath(tree, id),
      childFolders: (children || []).map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon || '',
        totalCount: Number(c.totalCount || 0),
      })),
    });
  },

  /** 进/退文件夹的统一入口（id 传 null = 回根层） */
  navigateToFolder(id) {
    this.setData({ currentFolderId: id == null ? null : Number(id), rows: [], visibleRows: [] }, () => {
      this.rebuildFolderNav();
      this.loadList();
    });
  },

  onEnterFolder(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    this.navigateToFolder(id);
  },

  onBackToParent() {
    const crumb = this.data.breadcrumb || [];
    this.navigateToFolder(crumb.length >= 2 ? crumb[crumb.length - 2].id : null);
  },

  onBreadcrumbTap(e) {
    const raw = e.currentTarget.dataset.id;
    this.navigateToFolder(raw === '' || raw == null ? null : Number(raw));
  },

  // ── 文件夹管理 ──

  openCreateFolder() {
    this.setData({
      showFolderSheet: true,
      folderSheetMode: 'create',
      folderFormName: '',
      folderSheetParentId: this.data.currentFolderId,
      folderSheetEditId: null,
    });
  },

  openRenameFolder(id, name) {
    this.setData({
      showFolderSheet: true,
      folderSheetMode: 'rename',
      folderFormName: name || '',
      folderSheetParentId: null,
      folderSheetEditId: id,
    });
  },

  onFolderNameInput(e) {
    this.setData({ folderFormName: e.detail.value || '' });
  },

  closeFolderSheet() {
    this.setData({
      showFolderSheet: false,
      folderSheetMode: '',
      folderFormName: '',
      folderSheetParentId: null,
      folderSheetEditId: null,
    });
  },

  async confirmFolderSheet() {
    const name = String(this.data.folderFormName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入文件夹名称', icon: 'none' });
      return;
    }
    let r;
    if (this.data.folderSheetMode === 'rename') {
      r = await fileFoldersApi.updateFileFolder(this.data.folderSheetEditId, { name });
    } else {
      r = await fileFoldersApi.createFileFolder({ parentId: this.data.folderSheetParentId, name });
    }
    if (r.ok) {
      wx.showToast({ title: this.data.folderSheetMode === 'rename' ? '已改名' : '已新建', icon: 'success' });
      this.closeFolderSheet();
      this._folderTree = null;
      void this.ensureFolderTree();
    } else {
      wx.showToast({ title: r.message || '操作失败', icon: 'none' });
    }
  },

  onFolderMore(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '';
    if (!id) return;
    wx.showActionSheet({
      itemList: ['改名', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) this.openRenameFolder(id, name);
        else if (res.tapIndex === 1) this.confirmDeleteFolder(id);
      },
    });
  },

  confirmDeleteFolder(id) {
    wx.showModal({
      title: '删除文件夹',
      content: '其中有文件或子文件夹时无法删除。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#ee0a24',
      success: (res) => {
        if (!res.confirm) return;
        void this.runDeleteFolder(id);
      },
    });
  },

  async runDeleteFolder(id) {
    wx.showLoading({ title: '删除中…' });
    const r = await fileFoldersApi.deleteFileFolder(id);
    wx.hideLoading();
    if (r.ok) {
      wx.showToast({ title: '已删除', icon: 'success' });
      this._folderTree = null;
      void this.ensureFolderTree();
    } else {
      // 非空被后端拒绝时，把后端 message 原样透出（如「请先移走其中的文件或子文件夹」）
      wx.showToast({ title: r.message || '删除失败', icon: 'none' });
    }
  },

  // ── 文件移动 ──

  flattenFolderTree(nodes, depth, acc) {
    const list = acc || [];
    (nodes || []).forEach((n) => {
      list.push({ key: `f-${n.id}`, id: String(n.id), name: n.name, depth, indent: depth * 28 });
      if (n.children && n.children.length) this.flattenFolderTree(n.children, depth + 1, list);
    });
    return list;
  },

  openMoveSheet(id) {
    const row = (this.data.rows || []).find((x) => x.id === id) || null;
    if (!row) return;
    const options = [{ key: 'unassigned', id: '', name: '未归类', depth: 0, indent: 0 }]
      .concat(this.flattenFolderTree(this._folderTree || [], 0, []));
    const curId = this.data.currentFolderId;
    this.setData({
      showMoveSheet: true,
      moveTargetFile: { id: row.id, originalName: row.originalName },
      movePickFolderId: curId == null ? '' : String(curId),
      moveFolderOptions: options,
    });
  },

  onPickMoveFolder(e) {
    this.setData({ movePickFolderId: e.currentTarget.dataset.id });
  },

  closeMoveSheet() {
    this.setData({ showMoveSheet: false, moveTargetFile: null, movePickFolderId: null, moveFolderOptions: [] });
  },

  async confirmMove() {
    const target = this.data.moveTargetFile;
    if (!target || !target.id) return;
    const picked = this.data.movePickFolderId;
    const targetFolderId = (picked === '' || picked == null) ? null : Number(picked);
    const r = await fileTemplatesApi.moveFileTemplate(target.id, targetFolderId);
    if (r.ok) {
      wx.showToast({ title: '已移动', icon: 'success' });
      this.closeMoveSheet();
      this._folderTree = null;
      void this.ensureFolderTree();
      void this.loadList();
    } else {
      wx.showToast({ title: r.message || '移动失败', icon: 'none' });
    }
  },

  onRefresh() {
    this._folderTree = null;
    void this.ensureFolderTree();
    void this.loadList();
    void this.refreshQueue();
  },

  onKeywordChange(e) {
    const keyword = e.detail.value;
    const prevKw = String(this.data.keyword || '').trim();
    const nextKw = String(keyword || '').trim();
    this.setData({ keyword });
    // 空↔非空切换时，数据源在「当前文件夹」与「全部文件」间切换，重拉一次；
    // 其余仅本地过滤，保持现有手感。
    if (!!prevKw !== !!nextKw) {
      void this.loadList();
      return;
    }
    this.setData({
      visibleRows: printFormat.filterTemplates(this.data.rows, keyword),
    });
    this._setSelected(this.data.selectedIds);
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    // 清空关键词回到当前文件夹范围，需重拉一次列表
    void this.loadList();
  },

  onToggleSelect(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const selectedIds = { ...this.data.selectedIds };
    if (selectedIds[id]) delete selectedIds[id];
    else selectedIds[id] = true;
    this._setSelected(selectedIds);
  },

  onSelectAll() {
    const visible = this.data.visibleRows;
    if (!visible.length) return;
    const all = visible.every((r) => !!this.data.selectedIds[r.id]);
    const selectedIds = all ? {} : { ...this.data.selectedIds };
    if (!all) visible.forEach((r) => { selectedIds[r.id] = true; });
    this._setSelected(selectedIds);
  },

  _setSelected(selectedIds) {
    const visibleRows = this.data.visibleRows.map((r) => ({ ...r, checked: !!selectedIds[r.id] }));
    this.setData({
      selectedIds,
      visibleRows,
      selectedCount: Object.keys(selectedIds).length,
      allSelected: visibleRows.length > 0 && visibleRows.every((r) => !!selectedIds[r.id]),
    });
  },

  onAddSelectedToCart() {
    const ids = Object.keys(this.data.selectedIds);
    if (!ids.length) return;
    const byId = {};
    this.data.rows.forEach((r) => { byId[r.id] = r; });
    const items = ids
      .map((id) => byId[id])
      .filter(Boolean)
      .map((r) => ({ sourceType: 'ADMIN_FILE', sourceId: r.id, fileName: r.originalName }));
    const before = cart.count();
    cart.addTemplateItems(items);
    const added = cart.count() - before;
    this._setSelected({});
    this.syncCart();
    wx.showToast({ title: added > 0 ? `已加入 ${added} 项` : '所选文件已在清单中', icon: 'none' });
  },

  onOpenCart() {
    if (!this.data.cartCount) return;
    this.syncCart();
    this.setData({ cartOpen: true });
  },

  onCloseCart() {
    this.setData({ cartOpen: false });
  },

  onClearCart() {
    cart.clear();
    this._cartErrors = {};
    this.syncCart();
  },

  onCartRemove(e) {
    const key = e.currentTarget.dataset.key;
    cart.remove(key);
    if (this._cartErrors) delete this._cartErrors[key];
    this.syncCart();
  },

  onCartCopiesDec(e) { this._cartCopies(e, -1); },
  onCartCopiesInc(e) { this._cartCopies(e, 1); },

  _cartCopies(e, delta) {
    const key = e.currentTarget.dataset.key;
    const ov = cart.getState().overrides[key] || {};
    const cur = ov.copies != null ? ov.copies : 1;
    const next = Math.min(99, Math.max(1, cur + delta));
    cart.setOverride(key, { copies: next });
    this.syncCart();
  },

  onCartCopiesInput(e) {
    const key = e.currentTarget.dataset.key;
    const n = parseInt(e.detail.value, 10);
    const v = Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 1;
    cart.setOverride(key, { copies: v });
    this.syncCart();
  },

  onCartToggleUrgent(e) {
    const key = e.currentTarget.dataset.key;
    const ov = cart.getState().overrides[key] || {};
    cart.setOverride(key, { urgent: !ov.urgent });
    this.syncCart();
  },

  onDispatchCart() {
    if (!this.data.cartCount) return;
    const state = cart.getState();
    const items = [];
    state.templateItems.forEach((it) => {
      items.push({ key: printCart.templateKeyOf(it), sourceType: it.sourceType, sourceId: it.sourceId, fileName: it.fileName, isLocal: false, path: '' });
    });
    state.localFiles.forEach((f) => {
      items.push({ key: f.key, sourceType: 'ADMIN_FILE', sourceId: '', fileName: f.name, isLocal: true, path: f.file ? f.file.path : '' });
    });
    this.setData({ cartOpen: false });
    this.openDispatch({ items });
  },

  syncCart() {
    const state = cart.getState();
    const errMap = this._cartErrors || {};
    const rows = [];
    state.templateItems.forEach((it) => {
      const key = printCart.templateKeyOf(it);
      const ov = state.overrides[key] || {};
      rows.push({
        key,
        fileName: it.fileName,
        sourceLabel: '模板库',
        isLocal: false,
        copies: ov.copies != null ? ov.copies : 1,
        urgent: !!ov.urgent,
        error: errMap[key] || '',
      });
    });
    state.localFiles.forEach((f) => {
      const key = f.key;
      const ov = state.overrides[key] || {};
      rows.push({
        key,
        fileName: f.name,
        sourceLabel: '本地',
        isLocal: true,
        copies: ov.copies != null ? ov.copies : 1,
        urgent: !!ov.urgent,
        error: errMap[key] || '',
      });
    });
    this.setData({ cartRows: rows, cartCount: rows.length });
  },

  onChooseUpload() {
    if (this.data.uploadLoading) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0];
        if (!f || !f.path) return;
        void this.runUpload(f.path, {
          fileName: f.name || `file_${Date.now()}`,
          mimeType: f.type || 'application/octet-stream',
          folderId: this.data.currentFolderId,
        });
      },
    });
  },

  async runUpload(tempFilePath, meta) {
    this.setData({ uploadLoading: true });
    wx.showLoading({ title: '上传中…' });
    try {
      const data = await fileTemplatesApi.uploadFileTemplate(tempFilePath, meta);
      const newRow = mapApiRowToListRow(data);
      if (!newRow || !newRow.id) throw new Error('上传返回数据无效');
      /** 上传成功仅插入新行到列表顶部，禁止整表 load — post-save-no-full-refresh.mdc */
      const rows = [newRow, ...(this.data.rows || []).filter((r) => r.id !== newRow.id)];
      this.setData({
        rows,
        visibleRows: printFormat.filterTemplates(rows, this.data.keyword),
        uploadLoading: false,
      });
      wx.hideLoading();
      wx.showToast({ title: '已上传', icon: 'success' });
      // 上传会改变文件夹件数，重拉树
      this._folderTree = null;
      void this.ensureFolderTree();
    } catch (err) {
      wx.hideLoading();
      this.setData({ uploadLoading: false });
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' });
    }
  },

  onDownloadRow(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || 'template';
    if (!id) return;
    const label = String(name || '该文件').trim() || '该文件';
    wx.showModal({
      title: '下载文件',
      content: `确定下载「${label}」吗？`,
      confirmText: '下载',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        void this.runDownloadAfterConfirm(id, name);
      },
    });
  },

  async runDownloadAfterConfirm(id, name) {
    wx.showLoading({ title: '下载中…' });
    try {
      const path = await fileTemplatesApi.downloadTemplateToTempFile(id, name);
      wx.hideLoading();
      if (/\.(png|jpe?g)$/i.test(String(name || ''))) {
        wx.previewImage({ urls: [path] });
        return;
      }
      wx.openDocument({
        filePath: path,
        showMenu: true,
        fail(err) {
          wx.showToast({ title: (err && err.errMsg) || '无法打开', icon: 'none' });
        },
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '下载失败', icon: 'none' });
    }
  },

  closeFileSwipeById(fileId) {
    const id = String(fileId || '').trim();
    if (!id) return;
    try {
      const comp = this.selectComponent(`#file-swipe-${id}`);
      if (comp && typeof comp.close === 'function') comp.close();
    } catch (e) {
      /* ignore */
    }
  },

  onFileSwipeMove(e) {
    const id = e.currentTarget.dataset.id;
    this.closeFileSwipeById(id);
    if (!id) return;
    this.openMoveSheet(id);
  },

  onFileSwipeDelete(e) {
    const id = e.currentTarget.dataset.id;
    this.closeFileSwipeById(id);
    if (!id) return;
    this.confirmDelete(id);
  },

  confirmDelete(id) {
    wx.showModal({
      title: '删除文件',
      content: '删除后所有人将无法再下载或打印该模板，确定删除吗？',
      confirmText: '删除',
      confirmColor: '#ee0a24',
      success: (res) => {
        if (!res.confirm) return;
        void this.runDelete(id);
      },
    });
  },

  async runDelete(id) {
    wx.showLoading({ title: '删除中…' });
    const r = await fileTemplatesApi.deleteFileTemplate(id);
    wx.hideLoading();
    if (r.ok) {
      const rows = this.data.rows.filter((x) => x.id !== id);
      this.setData({
        rows,
        visibleRows: printFormat.filterTemplates(rows, this.data.keyword),
      });
      wx.showToast({ title: '已删除', icon: 'success' });
      // 删除会改变文件夹件数，重拉树
      this._folderTree = null;
      void this.ensureFolderTree();
    } else {
      wx.showToast({ title: r.message || '删除失败', icon: 'none' });
    }
  },

  async refreshQueue() {
    // 队列接口已含 PENDING/SENT/FAILED（PrintJobMapper.listQueue 三态都返回），
    // 计数与展开列表都从它取即可；fetchHistory 会带出 PRINTED/CANCELLED，混进来反而把
    // 已打完/已撤回的堆进「队列」列表，还让进行中的任务被重复计数。
    const q = await printApi.fetchQueue();
    const jobs = q.ok ? q.jobs : [];
    const queueRows = jobs.map((job) => printFormat.mapJobRow(job)).filter(Boolean);
    this.setData({
      queueSummary: printFormat.summarizeQueue(jobs),
      queueRows,
      queueFailedCount: queueRows.filter((row) => row.tone === 'bad').length,
    });
    this.syncQueuePolling();
  },

  syncQueuePolling() {
    if (this.data.queueSummary.hasActive) {
      if (this._queueTimer) return;
      this._queueTimer = setInterval(() => {
        void this.refreshQueue();
      }, 10000);
    } else {
      this.stopQueuePolling();
    }
  },

  stopQueuePolling() {
    if (this._queueTimer) {
      clearInterval(this._queueTimer);
      this._queueTimer = null;
    }
  },

  onToggleQueue() {
    const next = !this.data.queueExpanded;
    this.setData({ queueExpanded: next });
    if (next) void this.refreshQueue();
  },

  async onCancelJob(e) {
    const id = e.currentTarget.dataset.id;
    const r = await printApi.cancelJob(id);
    if (r.ok) {
      wx.showToast({ title: '已撤回', icon: 'success' });
      void this.refreshQueue();
    } else {
      wx.showToast({ title: r.message || '撤回失败', icon: 'none' });
    }
  },

  async onRetryJob(e) {
    const id = e.currentTarget.dataset.id;
    const r = await printApi.retryJob(id);
    if (r.ok) {
      wx.showToast({ title: '已重新排队', icon: 'success' });
      void this.refreshQueue();
    } else {
      wx.showToast({ title: r.message || '重推失败', icon: 'none' });
    }
  },

  onPrintRow(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || 'template';
    if (!id) return;
    this.openDispatch({ sourceType: 'ADMIN_FILE', sourceId: String(id), fileName: name });
  },

  onTempPrint() {
    wx.chooseMessageFile({
      count: 9,
      type: 'file',
      success: (res) => {
        const files = (res.tempFiles || []).filter((f) => f && f.path);
        if (!files.length) return;
        cart.addLocalFiles(files);
        this.syncCart();
        wx.showToast({ title: `已加入 ${files.length} 项`, icon: 'none' });
      },
    });
  },

  openDispatch(cfg) {
    const items = Array.isArray(cfg.items) && cfg.items.length ? cfg.items : null;
    this.setData({
      dispatch: {
        items,
        sourceType: cfg.sourceType || '',
        sourceId: cfg.sourceId || '',
        fileName: cfg.fileName || '',
        stationId: '',
        copies: 1,
        urgent: false,
        note: '',
        results: null,
      },
      dispatchLoading: false,
      stations: [],
    });
    void this.loadStations();
  },

  async loadStations() {
    const r = await printApi.fetchStations();
    if (!this.data.dispatch) return; // 请求回来前用户已关面板，丢弃
    const stations = (r.ok ? r.stations : []).map((s) => {
      const status = printFormat.stationStatusMeta(s);
      return {
        id: String(s == null ? '' : s.id),
        name: s == null ? '' : s.name,
        capText: printFormat.stationCapabilityText(s),
        tone: status.tone,
        reason: status.reason,
      };
    });
    const lastId = String(wx.getStorageSync(STATION_STORAGE_KEY) || '');
    let stationId = '';
    if (lastId && stations.some((s) => s.id === lastId)) stationId = lastId;
    else if (stations.length) stationId = stations[0].id;
    this.setData({ stations, 'dispatch.stationId': stationId });
    if (!r.ok) wx.showToast({ title: r.message || '加载打印机失败', icon: 'none' });
  },

  onSelectStation(e) {
    this.setData({ 'dispatch.stationId': String(e.currentTarget.dataset.id) });
  },

  onCopiesDec() {
    const v = (this.data.dispatch && this.data.dispatch.copies) || 1;
    if (v <= 1) return;
    this.setData({ 'dispatch.copies': v - 1 });
  },

  onCopiesInc() {
    const v = (this.data.dispatch && this.data.dispatch.copies) || 1;
    if (v >= 99) return;
    this.setData({ 'dispatch.copies': v + 1 });
  },

  onCopiesInput(e) {
    const n = parseInt(e.detail.value, 10);
    const v = Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 1;
    this.setData({ 'dispatch.copies': v });
  },

  onToggleUrgent() {
    this.setData({ 'dispatch.urgent': !this.data.dispatch.urgent });
  },

  onNoteInput(e) {
    this.setData({ 'dispatch.note': e.detail.value });
  },

  onCloseDispatch() {
    this.setData({ dispatch: null, stations: [] });
  },

  noop() {},

  async runBatchDispatch() {
    const d = this.data.dispatch;
    const stationId = d.stationId;
    const note = d.note;
    const unifiedCopies = d.copies;
    const unifiedUrgent = d.urgent;
    const overrides = cart.getState().overrides || {};

    this.setData({ dispatchLoading: true });

    const succeeded = [];
    const failures = [];

    for (const it of d.items) {
      const key = it.key;
      const ov = overrides[key] || {};
      const copies = ov.copies != null ? ov.copies : unifiedCopies;
      const urgent = ov.urgent != null ? ov.urgent : unifiedUrgent;
      try {
        let sourceId = it.sourceId;
        if (it.isLocal) {
          const row = await fileTemplatesApi.uploadFileTemplate(it.path, { purpose: 'TEMPLATE', ephemeral: 'true' });
          sourceId = row && row.id ? String(row.id) : '';
          if (!sourceId) throw new Error('上传返回数据无效');
        }
        const r = await printApi.createJob({
          stationId,
          sourceType: it.sourceType,
          sourceId: String(sourceId),
          fileName: it.fileName,
          copies,
          note,
          urgent,
        });
        if (r.ok) succeeded.push(key);
        else failures.push({ key, fileName: it.fileName, reason: r.message || '派发失败' });
      } catch (err) {
        failures.push({ key, fileName: it.fileName, reason: (err && err.message) || '派发失败' });
      }
    }

    this.setData({ dispatchLoading: false });

    if (failures.length === 0) {
      wx.setStorageSync(STATION_STORAGE_KEY, String(stationId));
      succeeded.forEach((k) => cart.remove(k));
      this._cartErrors = {};
      this.syncCart();
      this.setData({ dispatch: null, stations: [] });
      wx.showToast({ title: `已派发 ${succeeded.length} 项`, icon: 'success' });
      void this.refreshQueue();
      return;
    }

    succeeded.forEach((k) => cart.remove(k));
    const errMap = {};
    failures.forEach((f) => { errMap[f.key] = f.reason; });
    this._cartErrors = errMap;
    this.syncCart();
    const failedKeys = failures.map((f) => f.key);
    const remainingItems = d.items.filter((it) => failedKeys.indexOf(it.key) >= 0);
    this.setData({
      'dispatch.items': remainingItems,
      'dispatch.results': { ok: succeeded.length, fail: failures.length, failures },
    });
    wx.showToast({ title: `成功 ${succeeded.length} 条，失败 ${failures.length} 条`, icon: 'none' });
  },

  async onConfirmDispatch() {
    const d = this.data.dispatch;
    if (!d) return;
    if (!d.stationId) {
      wx.showToast({ title: '请选择打印工位', icon: 'none' });
      return;
    }
    if (this.data.dispatchLoading) return;
    if (Array.isArray(d.items) && d.items.length > 0) {
      await this.runBatchDispatch();
      return;
    }

    let sourceId = d.sourceId;

    this.setData({ dispatchLoading: true });
    const r = await printApi.createJob({
      stationId: d.stationId,
      sourceType: d.sourceType,
      sourceId: String(sourceId),
      fileName: d.fileName,
      copies: d.copies,
      note: d.note,
      urgent: d.urgent,
    });
    this.setData({ dispatchLoading: false });

    if (r.ok) {
      wx.setStorageSync(STATION_STORAGE_KEY, String(d.stationId));
      this.setData({ dispatch: null, stations: [] });
      wx.showToast({ title: '已派发', icon: 'success' });
      void this.refreshQueue();
    } else {
      wx.showToast({ title: r.message || '派发失败', icon: 'none' });
    }
  },
});
