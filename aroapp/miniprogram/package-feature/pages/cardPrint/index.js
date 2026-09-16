var springAuth = require('../../../utils/springAuth.js');
var cageTreeGrouping = require('../../utils/cageTreeGrouping.js');
var cageCellVisual = require('../../utils/cageCellVisual.js');
var cardPrintSelection = require('../../utils/cardPrintSelection.js');
var printApi = require('../../utils/printApi.js');
var printFormat = require('../../utils/printFormat.js');

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return { _raw: raw }; }
  }
  return { _raw: String(raw) };
}

function unwrap(res) {
  var statusCode = Number(res && res.statusCode);
  var body = parseBody(res ? res.data : null);
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || '请求失败(' + (statusCode || 0) + ')' };
  }
  return { ok: true, data: body.data };
}

/** 可选格判定：非空位且带 id。页面与本页计数共用同一口径。 */
function isSelectable(cell) {
  if (!cell || cell.empty === true) return false;
  return cell.id !== undefined && cell.id !== null && cell.id !== '';
}

/** 本架可选格数（区头分母）。 */
function countSelectable(grid) {
  var n = 0;
  for (var i = 0; i < (grid || []).length; i++) {
    if (isSelectable(grid[i])) n++;
  }
  return n;
}

/**
 * 给模板列表打上「当前选中」标记。
 * 为什么在 JS 里算：WXML 表达式不支持 String() 这类函数调用，
 * 写在模板里既判不准、也看不出错——选中态会整个失效（全灰、无区分度）。
 */
function markActiveTemplates(list, templateId) {
  var want = String(templateId == null ? '' : templateId);
  return (list || []).map(function (t) {
    return { id: t.id, name: t.name, _active: String(t.id) === want };
  });
}

/* ── 预览 PDF 的落地 ────────────────────────────────────────────────────
   微信本地文件配额（USER_DATA_PATH）只有 10MB，本页每预览一次就落一个新归档文件。
   所以：预览文件名统一带本页前缀（`card-print-<archiveId>.pdf`），写之前按前缀清一遍历史。
   用前缀而不是「记住上一次路径」，是因为后者只活在内存里——小程序一重启就失忆，
   旧文件还占着盘、新的照写，几次就把配额写满。前缀是磁盘上的事实，重启也认得出。
   真写满时 springAuth.saveAndOpenDocument 还有一道扫盘重试兜底（所有导出页共用）。 */
var PREVIEW_PREFIX = 'card-print-';

function unlinkQuiet(filePath) {
  if (!filePath) return;
  try {
    wx.getFileSystemManager().unlink({ filePath: filePath, fail: function () {} });
  } catch (e) { /* 文件系统不可用就当没这回事 */ }
}

/** 预览/生成的失败提示：配额错给一句人话，其余原样带出后端或微信的说明 */
function toastPdfError(err, fallback) {
  var raw = String((err && (err.errMsg || err.message)) || '');
  var quota = raw.indexOf('maximum size') >= 0 || raw.indexOf('storage limit') >= 0;
  wx.showToast({ title: quota ? '本地预览缓存已满，清理后仍失败，请稍后再试' : (raw || fallback), icon: 'none' });
}

/** 清掉本页历史预览文件（含重启前留下的），保证同时只剩一份 */
function sweepOwnPreviewFiles() {
  return new Promise(function (resolve) {
    try {
      wx.getFileSystemManager().readdir({
        dirPath: wx.env.USER_DATA_PATH,
        success: function (files) {
          (files || []).forEach(function (f) {
            var s = String(f);
            if (s.indexOf(PREVIEW_PREFIX) !== 0 || !/\.pdf$/i.test(s)) return;
            unlinkQuiet(wx.env.USER_DATA_PATH + '/' + s);
          });
        },
        fail: function () {},
        complete: function () { resolve(); }
      });
    } catch (e) {
      resolve();
    }
  });
}

Page({
  data: {
    screen: 'list',        // 'list' | 'grid'
    templateName: '',
    templatesLoaded: false, // 是否已加载完（区分「加载中」与「无模板」）
    templates: [],
    templateId: '',
    templatePickerShow: false,
    totalSelected: 0,
    pickedShow: false,      // 已选清单弹窗
    pickedRooms: [],        // 打开时现算一次，不常驻：房间 tab（只带计数）
    pickedTab: 0,           // 当前房间 tab
    pickedGrids: [],        // 当前 tab 那些架的 80 格网格（抽屉里按网格渲染）
    pickedGridLoading: false,
    // 视图① 笼架树
    listItems: [],          // 搜索结果（跨层级找笼架时用；树态不用它）
    keyword: '',            // 搜索词
    searching: false,       // 搜索中（仅用于空态文案与面包屑隐藏）
    cageTree: [],           // groupShelvesByCampus 原始结果，供重算
    treeLoading: false,
    treeError: '',
    listScrollTop: 0,       // 受控滚动位置：换层级时清零，否则 scroll-view 会保留上一层 scrollTop
    // 视图② 网格
    currentShelveId: '',
    currentShelveName: '',
    grid: [],               // [{ x, y, position, empty, id, _sel }]
    gridMeta: null,
    gridLoading: false,
    gridError: '',
    shelfSelected: 0,       // 本架已选（区头口径，勿与 totalSelected 混）
    shelfSelectable: 0,     // 本架可选格数（非空且带 id）
    // 生成 PDF：generating 驱动遮罩与按钮 busy；后三个是归档快照，供后续打印任务判「选择没变可复用」
    generating: false,
    archiveId: '',          // String(archiveId)，拼 URL 用
    archiveFileName: '',
    archiveSignature: '',   // 生成时的 selection.signature()
    // 打印弹窗：工位单选 + 份数；printing 是建单这一段自己的防重入（生成那段归 generating）
    printShow: false,
    stations: [],           // [{ id, name, online, statusText }]，视图层只用这四个字段
    printStationId: '',
    printCopies: 1,
    printNote: '',          // 备注：对齐 web「工位旁的人看得到」
    printUrgent: false,     // 加急：对齐 web
    printing: false,
    // 打印队列（顶部队列条）：字段名与「文件模板库」页保持一致
    queueSummary: { sent: 0, pending: 0, hasActive: false },
    queueTabs: [],          // 每台工位一个队列（照 web）：[{ id, name, count, rows }]
    queueTabId: '',         // 当前工位 tab
    queueFailedCount: 0,
    queueOpen: false      // 打印队列弹窗
  },
  onLoad: function () {
    // 选格集合挂页面实例：内部是带闭包的 Map，进 data 会被序列化丢掉。
    this.selection = cardPrintSelection.createSelection();
    this.loadTemplates();
    this.loadCageTree();
    this.loadPrintQueue();
    this.loadReserveMarks();
  },

  /**
   * 已被订购/预定/在别人购物车的格子：与订购抽屉、H5 同一份三档标记（`_opMark`）。
   * 只画「订」标记，不参与这里的可选/已选判定 —— 能不能打是另一回事。
   */
  loadReserveMarks: function () {
    var self = this;
    return springAuth.springRequest({
      url: '/api/animal-order/cage-reservations/active',
      method: 'GET',
      data: {}
    }).then(function (res) {
      var p = unwrap(res);
      if (!p.ok) return;
      self._reserveMarks = cageCellVisual.buildReserveMarks(p.data || []);
      self.applyReserveMarks();
    }).catch(function () { /* 标记拉取失败不阻塞网格 */ });
  },

  /** 标记晚到（或订单被撤）时补一次：只 patch 有变化的格子，未命中的格子不进 patch */
  applyReserveMarks: function () {
    var marks = this._reserveMarks || {};
    var patch = {};
    (this.data.grid || []).forEach(function (c, i) {
      var cid = c && c.id != null ? String(c.id) : '';
      var want = (cid && marks[cid]) || null;
      if (want) patch['grid[' + i + ']._opMark'] = want;
      else if (c && c._opMark) patch['grid[' + i + ']._opMark'] = null;
    });
    (this.data.pickedGrids || []).forEach(function (row, gi) {
      ((row && row.grid) || []).forEach(function (c, ci) {
        var cid = c && c.id != null ? String(c.id) : '';
        var want = (cid && marks[cid]) || null;
        if (want) patch['pickedGrids[' + gi + '].grid[' + ci + ']._opMark'] = want;
        else if (c && c._opMark) patch['pickedGrids[' + gi + '].grid[' + ci + ']._opMark'] = null;
      });
    });
    if (Object.keys(patch).length) this.setData(patch);
  },

  /* ------------------------------------------------------------------ */
  /*  打印队列（照「文件模板库」页：计数、明细、撤回/重推同源）             */
  /* ------------------------------------------------------------------ */

  /**
   * 队列数据用 history（全部状态）而不是 queue —— 与 web 的 PrintQueueDialog 同源。
   * queue 只回 PENDING/SENT/FAILED，别的工位「已打完」的记录压根不在里面，
   * 这正是「看不到其他工位的记录」的原因。
   */
  loadPrintQueue: function () {
    var self = this;
    return Promise.all([printApi.fetchHistory(300), printApi.fetchStations()]).then(function (r) {
      var h = r[0] || {};
      var stations = (r[1] && r[1].stations) || [];
      var jobs = h.ok ? (h.jobs || []) : [];
      var tabs = printFormat.buildStationTabs(jobs, stations);
      var keep = self.data.queueTabId;
      var hasKeep = tabs.some(function (t) { return t.id === keep; });
      self.setData({
        queueSummary: printFormat.summarizeQueue(jobs),
        queueFailedCount: jobs.filter(function (j) { return j && j.status === 'FAILED'; }).length,
        queueTabs: tabs,
        queueTabId: hasKeep ? keep : (tabs[0] ? tabs[0].id : '')
      });
    });
  },

  onPickQueueTab: function (e) {
    this.setData({ queueTabId: String((e.currentTarget.dataset || {}).id || '') });
  },

  onOpenQueue: function () {
    this.setData({ queueOpen: true });
    this.loadPrintQueue();
  },

  onCloseQueue: function () {
    this.setData({ queueOpen: false });
  },

  onRefreshQueue: function () {
    this.loadPrintQueue();
  },

  /** 撤回：与「文件模板库」页同一套做法——不二次确认，成功 toast 后刷新队列。 */
  onCancelJob: function (e) {
    var self = this;
    return printApi.cancelJob(e.currentTarget.dataset.id).then(function (r) {
      if (r && r.ok) {
        wx.showToast({ title: '已撤回', icon: 'success' });
        self.loadPrintQueue();
      } else {
        wx.showToast({ title: (r && r.message) || '撤回失败', icon: 'none' });
      }
    });
  },

  onRetryJob: function (e) {
    var self = this;
    return printApi.retryJob(e.currentTarget.dataset.id).then(function (r) {
      if (r && r.ok) {
        wx.showToast({ title: '已重新排队', icon: 'success' });
        self.loadPrintQueue();
      } else {
        wx.showToast({ title: (r && r.message) || '重推失败', icon: 'none' });
      }
    });
  },
  loadTemplates: function () {
    var self = this;
    springAuth.springRequest({ url: '/api/admin/card-print/templates', method: 'GET', data: {} })
      .then(function (res) {
        var up = unwrap(res);
        if (!up.ok) {
          // 权限不足/参数错等是 HTTP200 + success:false，不看 success 会把「被拒」当「成功」
          self.setData({ templates: [], templatesLoaded: true, templateId: '', templateName: '' });
          wx.showToast({ title: up.message || '模板加载失败', icon: 'none' });
          return;
        }
        var list = Array.isArray(up.data) ? up.data : [];
        var enabled = [];
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].enabled !== false) enabled.push(list[i]);
        }
        var chosen = null;
        for (var j = 0; j < enabled.length; j++) {
          if (enabled[j].isDefault === true) { chosen = enabled[j]; break; }
        }
        if (!chosen && enabled.length) chosen = enabled[0];

        // 视图层只用 id/name/_active；模板里的大 JSON 字段不能进 setData
        var light = enabled.map(function (t) {
          return { id: String(t.id), name: t.name };
        });
        var chosenId = chosen ? String(chosen.id) : '';

        self.setData({
          templates: markActiveTemplates(light, chosenId),
          templatesLoaded: true,
          templateId: chosenId,
          templateName: chosen ? (chosen.name || '') : ''
        });
      })
      .catch(function (err) {
        self.setData({ templates: [], templatesLoaded: true, templateId: '', templateName: '' });
        wx.showToast({ title: (err && (err.message || err.errMsg)) || '模板加载失败', icon: 'none' });
      });
  },
  onBarLeftTap: function () {
    if (!this.data.templatesLoaded) return;
    if (!this.data.templates || !this.data.templates.length) return;
    this.setData({ templatePickerShow: true });
  },
  onPickTemplate: function (e) {
    var ds = e.currentTarget.dataset;
    var id = String(ds.id);
    this.setData({
      templateId: id,
      templateName: ds.name || '',
      templates: markActiveTemplates(this.data.templates, id),
      templatePickerShow: false
    });
  },
  onTemplatePickerClose: function () {
    this.setData({ templatePickerShow: false });
  },

  /* ------------------------------------------------------------------ */
  /*  视图① 四级下钻笼架树                                               */
  /* ------------------------------------------------------------------ */

  loadCageTree: function () {
    var self = this;
    self.setData({ treeLoading: true, treeError: '' });
    springAuth.springRequest({
      url: '/api/student/mobile/cage-shelves/all',
      method: 'GET',
      data: {}
    }).then(function (res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ treeLoading: false, treeError: p.message });
        return;
      }
      var shelves = (p.data && p.data.shelves) || [];
      var tree = cageTreeGrouping.groupShelvesByCampus(shelves);
      // 房间架数树本身不带，补一个（照笼架页口径：Σ 各组架数）
      (tree || []).forEach(function (campus) {
        (campus.rooms || []).forEach(function (room) {
          var n = 0;
          (room.shelfGroups || []).forEach(function (g) { n += (g.shelves || []).length; });
          room.shelfCount = n;
        });
      });
      self.setData({ treeLoading: false, treeError: '', cageTree: tree });
    }).catch(function (err) {
      self.setData({ treeLoading: false, treeError: (err && (err.message || err.errMsg)) || '加载失败' });
    });
  },

  onRetryTree: function () {
    this.loadCageTree();
  },

  /* 树形列表按笼架页的排布：校区是带边框的卡片容器、房间是容器里的头部行、
     笼架组用左侧竖线表示层级、笼架是两列卡片。展开态用 _open 记在树节点上，就地展开/收起。 */

  onToggleCampus: function (e) {
    var i = parseInt(e.currentTarget.dataset.ci, 10);
    var campus = (this.data.cageTree || [])[i];
    if (!campus) return;
    var patch = {};
    patch['cageTree[' + i + ']._open'] = !campus._open;
    this.setData(patch);
  },

  onToggleRoom: function (e) {
    var ds = e.currentTarget.dataset;
    var i = parseInt(ds.ci, 10);
    var j = parseInt(ds.ri, 10);
    var campus = (this.data.cageTree || [])[i];
    var room = campus && (campus.rooms || [])[j];
    if (!room) return;
    var patch = {};
    patch['cageTree[' + i + '].rooms[' + j + ']._open'] = !room._open;
    this.setData(patch);
  },

  onToggleGroup: function (e) {
    var ds = e.currentTarget.dataset;
    var i = parseInt(ds.ci, 10);
    var j = parseInt(ds.ri, 10);
    var k = parseInt(ds.gi, 10);
    var campus = (this.data.cageTree || [])[i];
    var room = campus && (campus.rooms || [])[j];
    var grp = room && (room.shelfGroups || [])[k];
    if (!grp) return;
    var patch = {};
    patch['cageTree[' + i + '].rooms[' + j + '].shelfGroups[' + k + ']._open'] = !grp._open;
    this.setData(patch);
  },

  /** 笼架卡片（或搜索结果行）点击 → 进那架的网格 */
  onShelfCardTap: function (e) {
    var ds = e.currentTarget.dataset;
    if (!ds.shelf) return;
    this.openShelf(String(ds.shelf), ds.label || '');
  },

  /** 记住列表滚到哪了：返回列表时要还原（不进 data，滚动事件太密） */
  onListScrollRemember: function (e) {
    this._listTop = (e.detail && e.detail.scrollTop) || 0;
  },

  /**
   * 列表内容整体换掉时（换搜索词/清空搜索）滚回顶部，否则会停在半空。
   * 展开/收起不调用它——那是就地展开，滚动位置就该留着。
   */
  resetListScroll: function () {
    var self = this;
    self.setData({ listScrollTop: 1 });
    wx.nextTick(function () {
      self.setData({ listScrollTop: 0 });
    });
  },

  /**
   * 跨层级搜笼架：命中笼架名、所属笼架组名、房间名、校区名。
   * 结果项带 shelveId + isShelf，于是与树行共用同一套渲染与点击分支。
   */
  searchShelves: function (kw) {
    var key = String(kw || '').trim().toLowerCase();
    if (!key) return [];
    var tree = this.data.cageTree || [];
    var out = [];
    for (var ci = 0; ci < tree.length; ci++) {
      var campus = tree[ci];
      var rooms = campus.rooms || [];
      for (var ri = 0; ri < rooms.length; ri++) {
        var room = rooms[ri];
        var groups = room.shelfGroups || [];
        for (var gi = 0; gi < groups.length; gi++) {
          var grp = groups[gi];
          var shelves = grp.shelves || [];
          for (var si = 0; si < shelves.length; si++) {
            var s = shelves[si];
            var name = s.shelveName || String(s.shelveId);
            var sub = [campus.campusName, room.roomName, grp.name].join(' · ');
            if ((name + ' ' + sub).toLowerCase().indexOf(key) < 0) continue;
            out.push({
              key: 'hit:' + String(s.shelveId), depth: 0, label: name, sub: sub,
              shelveId: String(s.shelveId), isShelf: true
            });
            if (out.length >= 50) return out; // 结果上限：够用即可，避免一次塞几百行进视图
          }
        }
      }
    }
    return out;
  },

  onKeywordChange: function (e) {
    var kw = (e && e.detail && e.detail.value) || '';
    // 在网格视图里搜索，本意就是回列表找架子，顺手切回列表
    if (String(kw).trim()) {
      this.setData({ keyword: kw, searching: true, screen: 'list', listItems: this.searchShelves(kw) });
    } else {
      this.setData({ keyword: '', searching: false, listItems: [] });
    }
    this.resetListScroll();
  },

  onClearKeyword: function () {
    this.setData({ keyword: '', searching: false, listItems: [] });
    this.resetListScroll();
  },

  /** 搜索行右侧「刷新」：重拉一次笼架树 */
  onRefreshTree: function () {
    this.loadCageTree();
  },

  /* ------------------------------------------------------------------ */
  /*  视图② 80 格网格与选格                                              */
  /* ------------------------------------------------------------------ */

  openShelf: function (shelveId, shelveName) {
    var self = this;
    var sid = String(shelveId);
    self.setData({
      currentShelveId: sid,
      currentShelveName: shelveName || sid,
      screen: 'grid',
      gridLoading: true,
      gridError: ''
    });
    springAuth.springRequest({
      url: '/api/cage-cell-index/local-grid/by-shelve/' + sid,
      method: 'GET'
    }).then(function (res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ gridLoading: false, gridError: p.message });
        return;
      }
      var data = p.data || {};
      // 与笼架页同源：过一遍可视化 util，补出底色/类型灯/简称/角标/位号；空数组时自带 8×10 空位兜底
      var grid = cageCellVisual.buildGrid(data.grid || []);
      // 已被订购的格子在这里就打上标记，跟网格同一次 setData 出屏
      cageCellVisual.applyReserveMarks(grid, self._reserveMarks);
      // 本架可能之前选过（返回列表再进来），加载时把 _sel 一并算好，一次 setData 出屏
      for (var i = 0; i < grid.length; i++) {
        var c = grid[i];
        if (c) c._sel = isSelectable(c) && self.selection.isSelected(sid, c.id);
      }
      self.setData({
        gridLoading: false,
        gridError: '',
        grid: grid,
        gridMeta: data.shelfMeta || {},
        shelfSelectable: countSelectable(grid),
        shelfSelected: self.selection.countOnShelf(sid),
        totalSelected: self.selection.count()
      });
    }).catch(function (err) {
      self.setData({ gridLoading: false, gridError: (err && (err.message || err.errMsg)) || '加载失败' });
    });
  },

  onRetryGrid: function () {
    this.openShelf(this.data.currentShelveId, this.data.currentShelveName);
    this.loadReserveMarks();
  },

  /**
   * 选格变化后回写视图。
   * 只 patch 变化格子的 _sel（grid[i]._sel），不整包 setData(grid)：80 格全量重发在真机上会卡。
   * 两个计数分开：区头是本架（countOnShelf），吸顶工具栏是跨架合计（count）。
   */
  syncSelection: function () {
    var grid = this.data.grid || [];
    var shelveId = this.data.currentShelveId;
    var patch = {};
    for (var i = 0; i < grid.length; i++) {
      var c = grid[i];
      var sel = !!isSelectable(c) && this.selection.isSelected(shelveId, c.id);
      // !!：刚拉下来的格子还没有 _sel，undefined !== false 会把 80 格全打进 patch 白发一次
      if (!!c._sel !== sel) patch['grid[' + i + ']._sel'] = sel;
    }
    patch.shelfSelected = this.selection.countOnShelf(shelveId);
    patch.totalSelected = this.selection.count();
    this.setData(patch);
  },

  onCellTap: function (e) {
    // 索引来自 <cage-grid> 的 celltap detail
    var index = Number(e && e.detail && e.detail.index);
    var cell = (this.data.grid || [])[index];
    if (!isSelectable(cell)) return; // 空位格点了无反应（util 内部也会拒无 id 的 cell）
    this.selection.toggle(this.data.currentShelveId, { id: cell.id, x: cell.x, y: cell.y });
    this.syncSelection();
  },

  onSelectAllOnShelf: function () {
    var grid = this.data.grid || [];
    var sid = this.data.currentShelveId;
    this.selection.selectAllOnShelf(sid, grid);
    this.syncSelection();
  },

  onClearShelf: function () {
    this.selection.clearShelf(this.data.currentShelveId);
    this.syncSelection();
  },

  onBackToList: function () {
    // 只切屏，不清 selection：已选格跨视图保留。
    // 列表 scroll-view 是 wx:if 重建的，位置得自己还回去，否则每次回来都跳回顶部。
    var self = this;
    var top = self._listTop || 0;
    self.setData({ screen: 'list' });
    wx.nextTick(function () {
      self.setData({ listScrollTop: top });
    });
  },

  /* ------------------------------------------------------------------ */
  /*  已选清单弹窗（跨架全貌 / 删单格 / 清空全部）                          */
  /* ------------------------------------------------------------------ */

  /** 按需从 cageTree 查笼架显示名；查不到退回 shelveId。树只留一份，不另存映射。 */
  /** 按 shelveId 找它在树里的位置（笼架名 / 房间 / 校区），供清单分组用 */
  shelveInfoOf: function (shelveId) {
    var sid = String(shelveId);
    var tree = this.data.cageTree || [];
    for (var i = 0; i < tree.length; i++) {
      var rooms = tree[i].rooms || [];
      for (var j = 0; j < rooms.length; j++) {
        var groups = rooms[j].shelfGroups || [];
        for (var k = 0; k < groups.length; k++) {
          var shelves = groups[k].shelves || [];
          for (var l = 0; l < shelves.length; l++) {
            if (String(shelves[l].shelveId) === sid) {
              return {
                shelveName: shelves[l].shelveName || sid,
                roomName: rooms[j].roomName || '其他',
                campusName: tree[i].campusName || '其他',
              };
            }
          }
        }
      }
    }
    return { shelveName: sid, roomName: '其他', campusName: '其他' };
  },

  /**
   * 依 selection.list() 现算抽屉的 tab 结构：**按房间分组**，每组只带计数。
   * 格子内容不塞进 data —— 抽屉里是按 80 格网格渲染的（见 loadPickedGrids）。
   */
  buildPickedRooms: function () {
    var list = this.selection.list();
    var rooms = [];
    var roomIndex = {};
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      var meta = this.shelveInfoOf(g.shelveId);
      var roomKey = meta.campusName + '/' + meta.roomName;
      if (!roomIndex[roomKey]) {
        roomIndex[roomKey] = {
          key: roomKey, roomName: meta.roomName, campusName: meta.campusName,
          count: 0, shelves: [], shelfIndex: {},
        };
        rooms.push(roomIndex[roomKey]);
      }
      var room = roomIndex[roomKey];
      if (!room.shelfIndex[g.shelveId]) {
        room.shelfIndex[g.shelveId] = { shelveId: g.shelveId, shelveName: meta.shelveName, count: 0 };
        room.shelves.push(room.shelfIndex[g.shelveId]);
      }
      room.shelfIndex[g.shelveId].count += g.cells.length;
      room.count += g.cells.length;
    }
    // 索引只在构造期用，别跟着进 data（视图层会白传一遍）
    rooms.forEach(function (r) { delete r.shelfIndex; });
    return rooms;
  },

  /**
   * 拉当前 tab 那些架的本地网格，抽屉里按 80 格渲染——和主网格共用 buildGrid 与格子样式，
   * 观感与主网格一致。只拉「有选中格子」的架，一般 1-3 个。
   */
  loadPickedGrids: function (room) {
    var self = this;
    var shelves = (room && room.shelves) || [];
    if (!shelves.length) {
      this.setData({ pickedGrids: [], pickedGridLoading: false });
      return;
    }
    this.setData({ pickedGridLoading: true, pickedGrids: [] });
    Promise.all(shelves.map(function (s) {
      return springAuth
        .springRequest({ url: '/api/cage-cell-index/local-grid/by-shelve/' + s.shelveId, method: 'GET', data: {} })
        .then(function (res) {
          var p = unwrap(res);
          if (!p.ok) return null;
          var grid = cageCellVisual.buildGrid((p.data && p.data.grid) || []);
          cageCellVisual.applyReserveMarks(grid, self._reserveMarks);
          return {
            shelveId: s.shelveId,
            shelveName: s.shelveName,
            count: s.count,          // 本架已选格数（区头用，省得在 WXML 里按下标回查）
            grid: grid,
          };
        })
        .catch(function () { return null; });
    })).then(function (rows) {
      var out = [];
      for (var i = 0; i < rows.length; i++) if (rows[i]) out.push(rows[i]);
      self.setData({ pickedGrids: out, pickedGridLoading: false });
      self.markPickedGrids();
    });
  },

  /** 给抽屉里的格子打选中标记：与主网格共用同一个 selection，口径不会分叉 */
  markPickedGrids: function () {
    var self = this;
    var patch = {};
    (this.data.pickedGrids || []).forEach(function (row, gi) {
      (row.grid || []).forEach(function (c, ci) {
        var sel = !!isSelectable(c) && self.selection.isSelected(row.shelveId, c.id);
        if (!!c._sel !== sel) patch['pickedGrids[' + gi + '].grid[' + ci + ']._sel'] = sel;
      });
    });
    this.setData(patch);
  },

  /** 抽屉里点格子 = 选/取消，与主网格同义；改完统一收敛计数与两处网格标记 */
  onPickedCellTap: function (e) {
    var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    var row = (this.data.pickedGrids || [])[Number(ds.gi)];
    if (!row) return;
    var cell = (row.grid || [])[Number(e && e.detail && e.detail.index)];
    if (!isSelectable(cell)) return;
    this.selection.toggle(row.shelveId, { id: cell.id, x: cell.x, y: cell.y });
    this.refreshPicked();
  },

  /**
   * 删/清空后统一收口：重算 tab 与合计、重打两处网格的选中标记；
   * 主网格视图下再 syncSelection，否则网格格子还勾着、清单里却已没了。
   */
  refreshPicked: function () {
    var rooms = this.buildPickedRooms();
    var last = Math.max(0, rooms.length - 1);
    this.setData({
      pickedRooms: rooms,
      pickedTab: Math.min(this.data.pickedTab || 0, last),
      totalSelected: this.selection.count()
    });
    this.markPickedGrids();
    if (this.data.screen === 'grid') this.syncSelection();
  },

  onPickedTap: function () {
    // 空选择也开（弹窗内有空态）：清空全部后弹窗常驻，这条路径反正要复用同一分支
    var rooms = this.buildPickedRooms();
    this.setData({ pickedShow: true, pickedRooms: rooms, pickedTab: 0 });
    this.loadPickedGrids(rooms[0]);
    this.loadReserveMarks();   // 抽屉开着的时候订单可能被别人锁了，进来顺手刷一次
  },

  onPickedTab: function (e) {
    var i = parseInt(e.currentTarget.dataset.index, 10);
    var idx = isNaN(i) || i < 0 ? 0 : i;
    this.setData({ pickedTab: idx });
    this.loadPickedGrids((this.data.pickedRooms || [])[idx]);
  },

  onPickedClose: function () {
    this.setData({ pickedShow: false });
  },

  onClearAllPicked: function () {
    this.selection.clearAll();
    this.refreshPicked();
  },

  /* ------------------------------------------------------------------ */
  /*  打印弹窗：选工位 + 份数 → 建单直发                                 */
  /* ------------------------------------------------------------------ */

  /**
   * dock「打印…」：前置校验 → 拉工位 → 开弹窗。
   * 工位为空直接 toast 不建单（设计第七节）；不用 wx.showLoading 之外的遮罩，
   * 因为这一步只是短查询，弹窗打开后就没它事了。
   */
  onOpenPrint: function () {
    var self = this;
    if (this.data.totalSelected === 0) {
      wx.showToast({ title: '请先选择笼位', icon: 'none' });
      return;
    }
    if (!this.data.templateId) {
      wx.showToast({ title: '请先选择模板', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加载中…', mask: true });
    return printApi.fetchStations().then(function (r) {
      wx.hideLoading();
      if (!r.ok) {
        wx.showToast({ title: r.message || '加载打印工位失败', icon: 'none' });
        return;
      }
      var stations = (r.stations || []).map(function (s) {
        var meta = printFormat.stationStatusMeta(s);
        var online = meta.tone === 'ok';
        return {
          id: String(s && s.id),
          name: (s && s.name) || '',
          online: online,
          // 在线就一个绿字「在线」，其余把后端那句人话原样带出来（离线不拦截，只标注）
          statusText: online ? '在线' : (meta.reason || meta.label)
        };
      });
      if (!stations.length) {
        wx.showToast({ title: '未配置打印工位', icon: 'none' });
        return;
      }
      self.setData({
        stations: stations,
        // 只有一个工位时自动选中且不渲染单选列表（视图层按 stations.length 判）
        printStationId: stations.length === 1 ? stations[0].id : '',
        printCopies: 1,
        printNote: '',
        printUrgent: false,
        printShow: true
      });
    }).catch(function () {
      wx.hideLoading(); // fetchStations 内部已吞异常，这里只做兜底
    });
  },

  onPickStation: function (e) {
    if (this.data.printing) return;
    this.setData({ printStationId: String(e.currentTarget.dataset.id) });
  },

  /* 手写份数步进器：本目录的 vant 构建产物里没有 stepper，照「文件模板库」页的写法自绘，
     也免掉让使用者去开发者工具重新「构建 npm」。份数钳制 1–99。 */
  onPrintCopiesDec: function () {
    var v = this.data.printCopies || 1;
    if (v <= 1) return;
    this.setData({ printCopies: v - 1 });
  },

  onPrintCopiesInc: function () {
    var v = this.data.printCopies || 1;
    if (v >= 99) return;
    this.setData({ printCopies: v + 1 });
  },

  onPrintCopiesInput: function (e) {
    var n = parseInt(e && e.detail && e.detail.value, 10);
    var v = isFinite(n) ? Math.min(99, Math.max(1, n)) : 1;
    this.setData({ printCopies: v });
  },

  onClosePrint: function () {
    if (this.data.printing) return; // 提交中不给关：关掉再回结果会显得什么也没发生
    this.setData({ printShow: false });
  },

  /**
   * 确认打印：归档没变就复用 archiveId，变了先重生成，再建单。
   * 失败 toast 后端 message 且**不关弹窗**，用户可就地改工位重试。
   */
  onConfirmPrint: function () {
    var self = this;
    if (this.data.printing) return; // 连点：第二下直接被吞
    var stationId = this.data.printStationId;
    if (!stationId) {
      wx.showToast({ title: '请选择打印工位', icon: 'none' });
      return;
    }
    this.setData({ printing: true });

    // 与生成时快照比对：一致则沿用已有归档，不一致（含从未生成）才重跑后端渲染
    return this.ensureArchive()
      .then(function (arc) {
        return printApi.createJob({
          stationId: stationId,
          sourceType: 'CARD_ARCHIVE',
          sourceId: arc.archiveId,
          fileName: arc.fileName,
          copies: self.data.printCopies,
          note: self.data.printNote,     // 对齐 web：备注给工位旁的人看
          urgent: self.data.printUrgent  // 对齐 web：加急
        });
      })
      .then(function (r) {
        // 后端 403/参数错也是 HTTP200 + success:false，只看 r.ok
        if (!r || !r.ok) throw new Error((r && r.message) || '打印失败');
        self.setData({ printShow: false });
        wx.showToast({ title: '已提交打印任务', icon: 'success', duration: 1200 });
        self.loadPrintQueue(); // 队列条就在本页顶部，建完单立刻刷一次（进度看这里，不再指去文件模板库页）
      })
      .catch(function (err) {
        wx.showToast({ title: (err && (err.message || err.errMsg)) || '打印失败', icon: 'none' });
      })
      .then(function () { self.setData({ printing: false }); }, function () { self.setData({ printing: false }); });
  },

  /** 归档没变就复用，变了（或还没生成）先重生成。预览与打印共用同一判据 */
  ensureArchive: function () {
    if (this.data.archiveId && this.data.archiveSignature === this.selection.signature()) {
      return Promise.resolve({ archiveId: this.data.archiveId, fileName: this.data.archiveFileName });
    }
    return this.genArchive();
  },

  /** 下载当前归档并交给微信阅读器打开 */
  openArchivePdf: function (archiveId) {
    var self = this;
    return springAuth
      .springRequestBinary('/api/admin/card-print/archives/' + archiveId + '/download')
      .then(function (bin) { return self.openPdfFile(bin.data, archiveId); });
  },

  /**
   * 打印弹窗里的「预览」：与「预览 PDF」同一条链（复用归档、失败提示也同一套），
   * 区别只是不关弹窗——看完再决定确认还是改工位。
   */
  onPreviewInPrint: function () {
    var self = this;
    if (this.data.generating) return;
    this.setData({ generating: true });
    var finish = function () { self.setData({ generating: false }); };
    this.ensureArchive()
      .then(function (arc) { return self.openArchivePdf(arc.archiveId); })
      .catch(function (err) { toastPdfError(err, '预览失败'); })
      .then(finish, finish);
  },

  onPrintNoteInput: function (e) {
    this.setData({ printNote: (e && e.detail && e.detail.value) || '' });
  },

  onToggleUrgent: function () {
    this.setData({ printUrgent: !this.data.printUrgent });
  },

  /* ------------------------------------------------------------------ */
  /*  预览 PDF：生成归档 → 下载 → 微信 PDF 阅读器（T8）                    */
  /* ------------------------------------------------------------------ */

  /**
   * 生成归档并落快照：把当前选择发后端，成功写 archiveId / archiveFileName / archiveSignature。
   * 预览与「确认打印」共用；**不碰 generating、不 toast**，收口留给调用方（两处防重入与提示文案都不同）。
   * @returns {Promise<{archiveId: string, fileName: string}>} 失败 reject(Error)
   */
  genArchive: function () {
    var self = this;
    // 先快照再发请求：期间的选格改动不该影响本次请求与快照签名
    var signature = this.selection.signature();
    var body = {
      templateId: this.data.templateId,
      animalCageIds: this.selection.ids(),
      nameSuffix: ''
    };
    return springAuth
      .springRequest({ url: '/api/admin/card-print/generate', method: 'POST', data: body })
      .then(function (res) {
        var up = unwrap(res); // 业务失败是 HTTP200 + success:false
        if (!up.ok) throw new Error(up.message || '生成失败');
        var d = up.data || {};
        if (!d.archiveId) throw new Error('生成失败：未返回归档');
        var archiveId = String(d.archiveId); // 现为自增 BIGINT，仍按字符串拼 URL 以防口径变动
        self.setData({
          archiveId: archiveId,
          archiveFileName: d.fileName || '',
          archiveSignature: signature
        });
        return { archiveId: archiveId, fileName: d.fileName || '' };
      });
  },

  /**
   * 前置校验 + 生成 + 下载 + 打开。
   * 失败只 toast，绝不动列表与已选（后端 400/500 不该把整页换成错误态）。
   * archiveId/archiveSignature 只存不消费，留给打印任务判「选择没变可复用」。
   */
  onPreviewPdf: function () {
    var self = this;
    if (this.data.totalSelected === 0) {
      wx.showToast({ title: '请先选择笼位', icon: 'none' });
      return;
    }
    if (!this.data.templateId) {
      wx.showToast({ title: '请先选择模板', icon: 'none' });
      return;
    }
    if (this.data.generating) return; // 生成中：吞掉重复点击

    this.setData({ generating: true });
    // 成功/失败共用收尾；挂成 then 的两个分支，catch 自身抛错也照样复位
    var finish = function () { self.setData({ generating: false }); };

    this.ensureArchive()
      .then(function (arc) { return self.openArchivePdf(arc.archiveId); })
      .catch(function (err) { toastPdfError(err, '生成失败'); })
      .then(finish, finish);
  },

  /** 落地并打开 PDF：先按前缀清掉本页历史预览（重启也认得），再交给共享收尾 */
  openPdfFile: function (buf, archiveId) {
    return sweepOwnPreviewFiles().then(function () {
      return springAuth.saveAndOpenDocument(buf, PREVIEW_PREFIX + archiveId + '.pdf', 'pdf');
    });
  },

  /** 遮罩层 catchtouchmove 的占位处理：存在即拦，不做任何事。 */
  noop: function () {}
});
