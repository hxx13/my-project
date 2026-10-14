
/**
 * 视频上墙（小程序端，ADMIN+ 与后台同一套接口）。
 *
 * 排布：顶部工具栏（选墙 / 选预设 / 切分 / 立即上墙 / 实时 / 参观 / 更多）
 *      → 画布区（**按这面墙的电视数量**画：一块就一块，两块就上下两行等大）
 *      → 底部通道列表（文件夹式：面包屑 + 子文件夹 + 通道）。
 *
 * 交互：
 *   - 点列表里的通道 → 选中；再点画布上的格子 → 放进去（反过来点格子再点通道也一样）。
 *   - 这是「拖拽」在小程序里的兜底：列表到画布的原生拖拽没有可靠实现，这里用两步点选代替。
 *   - 点画布上已有通道的格子＝选中该格；「×」清空该窗口。
 *
 * 不做 IP 跳转（手机上没有意义），其余与网页端一致。
 */
const api = require('../../utils/videoWallApi.js');
const pagePermission = require('../../../utils/pagePermission.js');
const springAuth = require('../../../utils/springAuth.js');

const PAGE_PATH = '/package-feature/pages/videoWall/index';
/** 整机操控展厅大屏（含向现场推流），只放给超管；网页端同档（SuperAdminGuard） */
const FALLBACK_ROLE = 'SUPER_ADMIN';

Page({
  data: {
    loading: true,
    /** 工具栏 */
    wallOptions: [],
    wallId: '',
    wallName: '',
    presetOptions: [],
    presetId: '',
    presetName: '',
    layoutLabel: '',
    layoutKey: '',
    live: false,
    tour: false,
    /** 画布：每块电视一条，cells 已经算好位置与内容 */
    canvasScreens: [],
    /** 当前选中的格子 `${sid}:${index}`；没有再点通道就是放置目标 */
    selectedKey: '',
    /** 当前拿在手上的通道（点过列表里的通道） */
    pickedKey: '',
    pickedName: '',
    /** 底部通道列表：文件夹式 */
    currentFolderName: '',
    /** 扁平化的树行：[{kind:'folder'|'channel', depth, ...}]，直接 wx:for 渲染 */
    treeRows: [],
    expandedCats: {},
    drawerOpen: false,
    /** 底部列表要滚到哪一行（scroll-into-view 的 id） */
    scrollIntoView: '',

    /** 移动通道弹窗 */
    moveOpen: false,
    moveCode: '',
    moveName: '',
    moveOptions: [],
    moveTarget: '',
    /** 未保存提示 */
    dirty: false,
    moreOpen: false,
    folderSheet: false,
    folderForm: { mode: 'create', id: 0, name: '' },
    presetSheet: false,
    presetForm: '',
    splitSheet: false,
    splitForm: { rows: '2', cols: '2' },
    splitLayouts: [],
    presetOpen: false,
    wallOpen: false,
    keyword: '',
    /** 页内提示条：原生 toast 在开发者工具/部分机型上不显示，这个一定看得见 */
    flash: '',
    /** 提示条是不是「出错」：出错画红底的 ✕，成功才画绿底 ✓ */
    flashErr: false,
    /** 拖拽态：长按列表里的通道后跟随手指，松手落到格子上 */
    dragOn: false,
    dragCode: '',
    dragName: '',
    dragX: 0,
    dragY: 0,

    // ---- 参观模式：遥控盘 + 预设队列 ----
    /** 参观顺序 [{taskId, name}]，顺序即播放顺序 */
    tourQueue: [],
    /** 当前预设在这条队列里的位次，-1 = 当前预设不在队列里 */
    tourIndex: -1,
    /** 打开「配置参观队列」抽屉 */
    queueOpen: false,
    queueWallId: '',
    /** 抽屉里该墙的全部预设 [{taskId, name}] */
    queueAllRows: [],
    queueOrderRows: [],
    queueRestRows: [],
    /** 抽屉里正在编辑的顺序（taskId 数组） */
    queuePicked: [],

    // ---- 单画面放大：'' = 宫格；`${sid}:${index}` = 该格全屏 ----
    zoomKey: '',
    zoomName: '',
  },

  // 内部状态，不参与渲染
  _walls: [],
  _screens: [],
  _rects: {}, // sid -> [{left,top,width,height}]
  _slots: {}, // `${sid}:${i}` -> channel
  _channels: [],
  _cats: [],
  _baseline: '',

  onLoad() {
    this.loadAll();
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, PAGE_PATH, role, FALLBACK_ROLE)) return;
  },

  onPullDownRefresh() {
    this.loadAll().then(() => wx.stopPullDownRefresh());
  },

  // ------------------------------------------------------------ 载入

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [walls, channels, cats] = await Promise.all([
        api.listWalls(),
        api.listChannels(),
        api.listCategories(),
      ]);
      this._walls = walls;
      this._channels = channels;
      this._cats = cats;
      const wallId = this.data.wallId || (walls[0] ? String(walls[0].tvWallId) : '');
      this.setData({
        wallOptions: walls.map((w) => ({ value: String(w.tvWallId), label: w.tvWallName })),
        splitLayouts: api.LAYOUTS.map(function (l) { return { key: l.key, label: l.label }; }),
        loading: false,
      });
      if (wallId) await this.selectWall(wallId);
      this.renderFolder();
    } catch (e) {
      this.setData({ loading: false });
      this.toastError(e.message || '载入失败');
    }
  },

  async selectWall(wallId) {
    this.setData({ wallId: wallId, presetId: '', presetName: '', zoomKey: '', zoomName: '' });
    this._rects = {};
    this._slots = {};
    this._baseline = '';
    try {
      const [detail, tasks] = await Promise.all([api.getWall(wallId), api.listTasks(wallId)]);
      const screens = (detail && detail.screens) || [];
      this._screens = screens;
      screens.forEach((s) => {
        this._rects[s.screenId] = api.DEFAULT_LAYOUT.rects.slice();
      });
      this.setData({
        wallName: (detail && detail.tvWallName) || this.wallLabel(wallId),
        presetOptions: tasks.map((t) => ({ value: String(t.taskId), label: t.taskName })),
        dirty: false,
      });
      this.refreshCanvas();
      this.refreshLayoutLabel();
      // 参观队列是「一面墙一条」，换墙就得换一条
      if (this.data.tour) this.loadTour();
    } catch (e) {
      this.toastError(e.message || '读取电视墙失败');
    }
  },

  wallLabel(wallId) {
    const hit = this._walls.find((w) => String(w.tvWallId) === String(wallId));
    return hit ? hit.tvWallName : '';
  },

  // ------------------------------------------------------------ 画布

  /** 把 _screens + _rects + _slots 算成 wxml 直接能渲染的结构 */
  refreshCanvas() {
    const self = this;
    const zoomKey = this.data.zoomKey || '';
    const canvasScreens = (this._screens || []).map(function (s, si) {
      const sid = String(s.screenId);
      // 放大：这一块屏只画一个铺满的格子；另一块屏照旧画它的宫格
      const zoomed = zoomKey.indexOf(sid + ':') === 0;
      const rects = zoomed
        ? [{ left: 0, top: 0, width: 100, height: 100 }]
        : self._rects[sid] || api.DEFAULT_LAYOUT.rects;
      const many = !zoomed && rects.length > 9;
      const cells = rects.map(function (r, i) {
        const key = zoomed ? zoomKey : sid + ':' + i;
        const ch = self._slots[key];
        return {
          key: key,
          index: i,
          style: 'left:' + r.left + '%;top:' + r.top + '%;width:' + r.width + '%;height:' + r.height + '%;',
          channel: ch || null,
          name: ch ? ch.channelName : '',
          online: ch ? Number(ch.isOnline) === 1 : false,
          selected: zoomed || self.data.selectedKey === key,
          small: many,
          zoomed: zoomed,
        };
      });
      return {
        sid: sid,
        // 一块电视一块画布：两块就是上下两块**独立**的画布，不是把一块切成两半。
        // 高度按数量给 —— 两块时各自矮一点，保证一屏能同时容下画布与下方列表（列表要自己滚，才不抢拖拽）
        label: self._screens.length > 1 ? '屏 ' + (si + 1) : '',
        style: 'height:' + (zoomed ? '46vh' : self._screens.length > 1 ? '26vh' : '40vh') + ';',
        selected: self.data.selectedKey.indexOf(sid + ':') === 0,
        cells: cells,
      };
    });
    this.setData({ canvasScreens: canvasScreens });
  },

  // ------------------------------------------------------------ 单画面放大
  //
  // 就是「临时拼一套只有一个窗口的上墙方案」推给平台，不改本地宫格 —— 还原时把原来的
  // 宫格重新推一次即可，所以不需要平台侧的「放大窗口」专用接口，也不会丢掉原有布局。

  /** 只改渲染态（不推墙）；key 传空 = 回到宫格 */
  setZoom(key) {
    const ch = key ? this._slots[key] : null;
    this.setData({ zoomKey: key || '', zoomName: ch ? ch.channelName : '' });
    this.refreshCanvas();
  },

  toggleZoom(sid, index) {
    const key = sid + ':' + index;
    if (this.data.zoomKey === key) {
      this.setZoom('');
      this.setData({ selectedKey: '' });
      if (this.data.live || this.data.tour) this.push(true);
      return;
    }
    if (!this._slots[key]) {
      this.toastError('这个格子还没有画面');
      return;
    }
    this.setZoom(key);
    this.setData({ selectedKey: key });
    // 实时/参观两种模式下放大是真的推给现场大屏；只是预览时不动大屏
    if (this.data.live || this.data.tour) this.push(true);
  },

  /** 换墙 / 换预设 / 改切分 / 清空时把放大收掉（这些动作本身会重画宫格） */
  resetZoom() {
    if (!this.data.zoomKey) return;
    this.setData({ zoomKey: '', zoomName: '' });
  },

  refreshLayoutLabel() {
    const sid = this._screens[0] ? String(this._screens[0].screenId) : '';
    const rects = this._rects[sid] || [];
    this.setData({
      layoutLabel: api.layoutLabel(rects),
      layoutKey: api.layoutKeyOf(rects),
    });
  },

  /** 画布与「载入预设那一刻」比，判断有没有改过 */
  signature() {
    return JSON.stringify({ r: this._rects, s: this._slots });
  },

  markDirty() {
    const dirty = !!this.data.presetId && this._baseline !== '' && this._baseline !== this.signature();
    this.setData({ dirty: dirty });
  },

  onTapCell(e) {
    const key = e.currentTarget.dataset.key;
    const sid = key.split(':')[0];
    const idx = Number(key.split(':')[1]);
    // 手上拿着通道：立刻放进去（这条路最常用，不能等）
    if (this.data.pickedKey) {
      this.place(sid, idx, this.data.pickedKey);
      return;
    }
    const now = Date.now();
    const last = this._lastTap;
    clearTimeout(this._tapTimer);
    if (last && last.key === key && now - last.ts < 320) {
      // 双击：放大 / 还原
      this._lastTap = null;
      this.toggleZoom(sid, idx);
      return;
    }
    this._lastTap = { key: key, ts: now };
    // 单击**延后**再执行：不然双击的第一下会先跑掉，把选中态顶掉又弹回来，看着像闪一下
    this._tapTimer = setTimeout(() => {
      this._lastTap = null;
      this.onSingleTapCell(key);
    }, 260);
  },

  /** 单击格子：选中/取消选中 + 在下方列表里定位到该通道 */
  onSingleTapCell(key) {
    this.setData({ selectedKey: this.data.selectedKey === key ? '' : key });
    const ch = this._slots[key];
    // 参观模式下方不是通道列表而是遥控盘，定位无处可去
    if (!this.data.tour && ch && ch.videoCategoryId != null) {
      this.locateFolderOf(ch.videoCategoryId, ch.id, ch.channelCode, ch.channelName);
    }
    this.refreshCanvas();
  },

  onClearCell(e) {
    const key = e.currentTarget.dataset.key;
    delete this._slots[key];
    // 把正在放大的那一格清空了，就退回宫格（否则会推一个空窗口上去）
    if (this.data.zoomKey === key) this.setZoom('');
    this.refreshCanvas();
    this.markDirty();
  },

  /** 把一个通道放进某个窗口 */
  place(sid, index, channelCode) {
    const key = sid + ':' + index;
    const ch = this._channels.find((c) => c.channelCode === channelCode);
    if (!ch) return;
    this._slots[key] = ch;
    this.setData({ selectedKey: key, pickedKey: '', pickedName: '' });
    this.refreshCanvas();
    this.markDirty();
    if (this.data.live) this.push(true);
  },

  // ------------------------------------------------------------ 底部通道列表（文件夹式）

  /**
   * 把分类树**扁平化**成可直接 wx:for 的列表（带缩进层级），不做面包屑分步。
   * 文件夹可展开/收起；搜索时跨文件夹平铺命中项，并标出它属于哪个文件夹。
   */
  renderFolder() {
    const self = this;
    const catalogs = this._cats || [];
    const kw = String(this.data.keyword || '').trim().toLowerCase();
    const expanded = this.data.expandedCats || {};
    const rows = [];

    const chRow = function (c, depth, desc) {
      return {
        kind: 'channel',
        depth: depth,
        rowId: 'vwr' + c.id,
        code: c.channelCode,
        name: c.channelName,
        desc: desc || '',
        online: Number(c.isOnline) === 1,
        picked: self.data.pickedKey === c.channelCode,
        style: 'padding-left:' + (16 + depth * 26) + 'rpx;',
      };
    };

    if (kw) {
      const nameOf = {};
      catalogs.forEach(function (n) { nameOf[n.id] = n.name; });
      this._channels.forEach(function (c) {
        if (String(c.channelName || '').toLowerCase().indexOf(kw) < 0) return;
        rows.push(chRow(c, 0, c.videoCategoryId ? nameOf[c.videoCategoryId] || '' : '未分类'));
      });
      this.setData({ treeRows: rows, currentFolderName: '搜索结果' });
      return;
    }

    const tree = api.buildTree(catalogs);
    // 每个节点的（在线/总数），含子树累加
    const direct = {};
    this._channels.forEach(function (c) {
      const gid = c.videoCategoryId;
      if (!gid) return;
      if (!direct[gid]) direct[gid] = { total: 0, online: 0 };
      direct[gid].total += 1;
      if (Number(c.isOnline) === 1) direct[gid].online += 1;
    });
    const statOf = function (node) {
      let total = 0;
      let online = 0;
      const walk = function (n) {
        const d = direct[n.id] || { total: 0, online: 0 };
        total += d.total;
        online += d.online;
        (n.children || []).forEach(walk);
      };
      walk(node);
      return { total: total, online: online };
    };
    const folderRow = function (node, depth) {
      const st = statOf(node);
      const offline = st.total - st.online;
      return {
        kind: 'folder',
        depth: depth,
        id: node.id,
        name: node.name,
        desc: st.total ? st.online + '/' + st.total + (offline > 0 ? ' · ' + offline + ' 离线' : '') : '',
        warn: offline > 0,
        open: !!expanded[node.id],
        style: 'padding-left:' + (8 + depth * 26) + 'rpx;',
      };
    };
    const walk = function (list, depth) {
      list.forEach(function (node) {
        rows.push(folderRow(node, depth));
        if (!expanded[node.id]) return;
        walk(node.children || [], depth + 1);
        self._channels.forEach(function (c) {
          if (String(c.videoCategoryId) === String(node.id)) rows.push(chRow(c, depth + 1, ''));
        });
      });
    };
    walk(tree, 0);

    // 没归类的通道挂在一个「未分类」根下，免得散在外面
    const loose = this._channels.filter(function (c) { return !c.videoCategoryId; });
    if (loose.length) {
      rows.push({
        kind: 'folder',
        depth: 0,
        id: 0,
        name: '未分类',
        desc: String(loose.length),
        warn: false,
        open: !!expanded[0],
        style: 'padding-left:8rpx;',
      });
      if (expanded[0]) loose.forEach(function (c) { rows.push(chRow(c, 1, '')); });
    }

    this.setData({ treeRows: rows, currentFolderName: '全部分类' });
  },

  /** 点文件夹行：展开/收起 */
  onTapFolder(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = Object.assign({}, this.data.expandedCats);
    expanded[id] = !expanded[id];
    this.setData({ expandedCats: expanded });
    this.renderFolder();
  },

  /** 通道行右侧的 ⋯：移动 / 移出 */
  onChannelMore(e) {
    const ds = e.currentTarget.dataset || {};
    const code = ds.code;
    const name = ds.name || '';
    const self = this;
    if (!code) return;
    wx.showActionSheet({
      itemList: ['移动到文件夹…', '移出到未分类'],
      success(res) {
        if (res.tapIndex === 0) self.openMove(code, name);
        else if (res.tapIndex === 1) self.moveChannel(code, null);
      },
    });
  },

  openMove(code, name) {
    const rows = [{ value: '', label: '未分类（移出所有文件夹）' }];
    (this._cats || []).forEach(function (n) {
      rows.push({ value: String(n.id), label: n.name });
    });
    this.setData({
      moveOpen: true,
      moveCode: code,
      moveName: name,
      moveOptions: rows,
      moveTarget: '',
    });
  },

  onCloseMove() {
    this.setData({ moveOpen: false });
  },

  onMovePick(e) {
    this.setData({ moveTarget: e.detail.value });
  },

  onMoveSubmit() {
    const target = this.data.moveTarget;
    this.moveChannel(this.data.moveCode, target ? Number(target) : null);
  },

  /** 把通道挪到某个分类节点（null = 移出到未分类） */
  moveChannel(channelCode, categoryId) {
    const self = this;
    const ch = (this._channels || []).find(function (c) { return c.channelCode === channelCode; });
    if (!ch) return;
    api
      .assignChannelCategory(ch.id, categoryId)
      .then(function () {
        self.setData({ moveOpen: false });
        return api.listChannels();
      })
      .then(function (list) {
        self._channels = list;
        self.renderFolder();
        self.refreshCanvas();
        self.toast('已移动');
      })
      .catch(function (err) { self.toastError((err && err.message) || '移动失败'); });
  },

  /** 悬浮条上的 ✕：取消已选通道 */
  onCancelPick() {
    this.setData({ pickedKey: '', pickedName: '' });
    this.renderFolder();
  },

  onOpenDrawer() {
    this.setData({ drawerOpen: true });
  },

  onCloseDrawer() {
    this.setData({ drawerOpen: false });
  },

  /**
   * 点画布里已有通道的格子时：**在底部列表里把它选中**（持续选中态，不是闪一下），
   * 祖先文件夹逐级展开 + 滚动到该行居中。不拉抽屉。
   */
  locateFolderOf(categoryId, channelId, channelCode, channelName) {
    const byId = {};
    (this._cats || []).forEach(function (n) {
      byId[n.id] = n;
    });
    const expanded = Object.assign({}, this.data.expandedCats);
    let cur = categoryId;
    while (cur && byId[cur]) {
      expanded[cur] = true;
      cur = byId[cur].parentId;
    }
    if (!categoryId) expanded[0] = true; // 未归类
    this.setData({
      expandedCats: expanded,
      keyword: '',
      // 选中它（同时浮出提示条：可以直接点别的格子放过去）
      pickedKey: channelCode || this.data.pickedKey,
      pickedName: channelName || this.data.pickedName,
    });
    this.renderFolder();
    if (!channelId) return;
    const self = this;
    // scroll-into-view 只在值变化时生效，所以先清空再设
    this.setData({ scrollIntoView: '' });
    setTimeout(function () {
      self.setData({ scrollIntoView: 'vwr' + channelId });
    }, 120);
  },

  // ---- 拖拽：长按通道 → 跟随手指 → 松手落到格子 ----
  //
  // 为什么不用 movable-view：小程序里没法把「正在进行的那一次触摸」转交给刚渲染出来的
  // movable-view，长按后它会不动。所以直接在通道行的 touch 事件里跟踪坐标，用 fixed 的
  // 影子元素跟着手指画。
  /**
   * 长按通道 → 拿起（拖拽）。
   *
   * 手感上踩过三个坑，逐条修：
   *  1) 起始判定太脆：移动 8px 就取消长按，手指稍一晃就「按不出来」→ 阈值放到 24px；
   *  2) 没有反馈：拿起那一刻不知道成没成 → 短震动，影子立刻出现；
   *  3) 影子压在手指底下看不见 → 影子画在触点**上方**一点。
   */
  onChTouchStart(e) {
    const ds = e.currentTarget.dataset || {};
    const t = (e.touches && e.touches[0]) || null;
    if (!t || !ds.code) return;
    this._start = { code: ds.code, name: ds.name || '', x: t.clientX, y: t.clientY };
    clearTimeout(this._pressTimer);
    this._pressTimer = setTimeout(() => {
      this.beginDrag(this._start);
    }, 240);
  },

  onChTouchMove(e) {
    const t = (e.touches && e.touches[0]) || null;
    if (!t) return;
    if (!this.data.dragOn) {
      // 还没拿起：手指移动说明在滚列表，取消长按。阈值放宽，别一动就废
      if (this._start && (Math.abs(t.clientX - this._start.x) > 24 || Math.abs(t.clientY - this._start.y) > 24)) {
        clearTimeout(this._pressTimer);
      }
      return;
    }
    this.setData({ dragX: t.clientX, dragY: t.clientY });
  },

  onChTouchEnd() {
    clearTimeout(this._pressTimer);
    if (!this.data.dragOn) return;
    const code = this.data.dragCode;
    const name = this.data.dragName;
    const hit = this.hitCell(this.data.dragX, this.data.dragY);
    this.setData({ dragOn: false, dragCode: '', dragName: '' });
    if (hit) {
      this.place(hit.sid, hit.index, code);
    } else {
      // 没落到格子上：退化成「拿在手上」，再点格子即可放下
      this.setData({ pickedKey: code, pickedName: name });
      this.renderFolder();
    }
  },

  /** 进拖拽态前先把所有窗口的屏幕坐标量出来，落点判定用 */
  beginDrag(start) {
    const self = this;
    const q = wx.createSelectorQuery();
    q.selectAll('.vw-cell').boundingClientRect();
    q.exec(function (res) {
      const rects = (res && res[0]) || [];
      const cells = [];
      (self.data.canvasScreens || []).forEach(function (s) {
        (s.cells || []).forEach(function (c) { cells.push(c); });
      });
      self._cellRects = [];
      rects.forEach(function (r, i) {
        const c = cells[i];
        if (c) self._cellRects.push({ key: c.key, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      });
      // 触觉反馈：拿起的那一刻有一下轻震，手感才「抓住了」
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      self.setData({
        dragOn: true,
        dragCode: start.code,
        dragName: start.name,
        dragX: start.x,
        dragY: start.y,
      });
    });
  },

  hitCell(x, y) {
    const list = this._cellRects || [];
    for (let i = 0; i < list.length; i += 1) {
      const r = list[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const parts = String(r.key).split(':');
        return { sid: parts[0], index: Number(parts[1]) };
      }
    }
    return null;
  },

  onTapChannel(e) {
    const code = e.currentTarget.dataset.code;
    // 已经选中某个格子：直接放进去
    if (this.data.selectedKey) {
      const parts = this.data.selectedKey.split(':');
      this.place(parts[0], Number(parts[1]), code);
      return;
    }
    const same = this.data.pickedKey === code;
    this.setData({
      pickedKey: same ? '' : code,
      pickedName: same ? '' : e.currentTarget.dataset.name,
    });
    this.renderFolder();
  },

  // ------------------------------------------------------------ 工具栏

  onWallChange(e) {
    this.selectWall(e.detail.value);
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
    this.renderFolder();
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    this.renderFolder();
  },

  /** 实色按钮切换（不再用组件开关） */
  onToggleLive() {
    const v = !this.data.live;
    this.setData({ live: v, tour: v ? false : this.data.tour });
  },

  onToggleTour() {
    const v = !this.data.tour;
    this.setData({ tour: v, live: v ? false : this.data.live });
    if (v) this.enterTour();
  },

  onToggleWallOpen() {
    this.setData({ wallOpen: !this.data.wallOpen, presetOpen: false });
  },

  onPickWall(e) {
    const id = e.currentTarget.dataset.id || '';
    this.setData({ wallOpen: false });
    if (id) this.selectWall(id);
  },

  onTogglePresetOpen() {
    this.setData({ presetOpen: !this.data.presetOpen, wallOpen: false });
  },

  /** 预设项右侧的 ⋯：重命名 / 删除 */
  onPresetMore(e) {
    const ds = e.currentTarget.dataset || {};
    const taskId = ds.id;
    const name = ds.name || '';
    const self = this;
    if (!taskId) return;
    wx.showActionSheet({
      itemList: ['重命名（方案内容不变）', '删除'],
      success(res) {
        if (res.tapIndex === 0) self.renamePreset(taskId, name);
        else if (res.tapIndex === 1) self.deletePreset(taskId, name);
      },
    });
  },

  renamePreset(taskId, oldName) {
    const self = this;
    wx.showModal({
      title: '重命名预设',
      editable: true,
      placeholderText: '新名称',
      content: oldName || '',
      success(res) {
        if (!res.confirm) return;
        const name = String(res.content || '').trim();
        if (!name || name === oldName) return;
        api
          .renamePreset(self.data.wallId, taskId, name)
          .then(function () {
            self.toast('已重命名');
            self._baseline = self.signature();
            return api.listTasks(self.data.wallId);
          })
          .then(function (tasks) {
            const hit = tasks.find(function (t) { return String(t.taskId) === String(taskId); });
            self.setData({
              presetOptions: tasks.map(function (t) { return { value: String(t.taskId), label: t.taskName }; }),
              presetName: hit ? hit.taskName : name,
            });
          })
          .catch(function (err) { self.toastError((err && err.message) || '重命名失败'); });
      },
    });
  },

  deletePreset(taskId, name) {
    const self = this;
    wx.showModal({
      title: '删除预设',
      content: '删除「' + name + '」？',
      success(res) {
        if (!res.confirm) return;
        api
          .deletePreset(self.data.wallId, taskId)
          .then(function () {
            self.toast('已删除');
            if (String(self.data.presetId) === String(taskId)) {
              self.setData({ presetId: '', presetName: '', dirty: false });
              self._baseline = '';
            }
            return api.listTasks(self.data.wallId);
          })
          .then(function (tasks) {
            self.setData({
              presetOptions: tasks.map(function (t) { return { value: String(t.taskId), label: t.taskName }; }),
              presetOpen: false,
            });
          })
          .catch(function (err) { self.toastError((err && err.message) || '删除失败'); });
      },
    });
  },

  /** 下拉里点一项：收起面板再走原来的预览逻辑 */
  onPickPreset(e) {
    const taskId = e.currentTarget.dataset.id || '';
    this.setData({ presetOpen: false });
    this.onPresetChange({ detail: { value: taskId } });
  },

  async onPresetChange(e) {
    const taskId = e.detail.value;
    if (!taskId) {
      this.setData({ presetId: '', presetName: '' });
      return;
    }
    try {
      const t = await api.getTask(this.data.wallId, taskId);
      const rects = {};
      const slots = {};
      (t.screens || []).forEach((sc) => {
        const sid = String(sc.screenId);
        const wins = sc.windows || [];
        const std = api.layoutByKey(String(sc.splitNum || ''));
        if (!wins.length) {
          rects[sid] = std ? std.rects.slice() : api.DEFAULT_LAYOUT.rects.slice();
          return;
        }
        // 先把每个窗口算成「矩形 + 通道」
        const cells = wins.map(function (w, i) {
          if (Number(w.width) > 0 && Number(w.height) > 0) {
            return {
              rect: { left: Number(w.left), top: Number(w.top), width: Number(w.width), height: Number(w.height) },
              code: w.channelCode || '',
              name: w.channelName || '',
            };
          }
          const fb = (std && std.rects[i]) || api.DEFAULT_LAYOUT.rects[i] || { left: 0, top: 0, width: 100, height: 100 };
          return {
            rect: { left: fb.left, top: fb.top, width: fb.width, height: fb.height },
            code: w.channelCode || '',
            name: w.channelName || '',
          };
        });
        // 平台上的预设会留一个和别格**完全重合**的空窗口（自闭合的 SubTv）。
        // 它画在上层、又没有画面，只会把点击/双击吃掉（实测：双击大格报「还没有画面」）——
        // 重合的空窗口直接不渲染，剩下的重新连号。
        const kept = cells.filter(function (c, i) {
          if (c.code) return true;
          return !cells.some(function (o, j) {
            return j !== i && o.code && api.sameRect(o.rect, c.rect);
          });
        });
        rects[sid] = kept.map(function (c) {
          return c.rect;
        });
        kept.forEach((c, i) => {
          if (!c.code) return;
          const known = this._channels.find((ch) => ch.channelCode === c.code);
          slots[sid + ':' + i] = known || {
            channelCode: c.code,
            channelName: c.name || c.code,
            isOnline: 0,
          };
        });
      });
      this._rects = rects;
      this._slots = slots;
      this._baseline = this.signature();
      this.setData({
        presetId: String(taskId),
        presetName: (t && t.taskName) || '',
        selectedKey: '',
        dirty: false,
        live: false,
        // 换预设＝换一整套宫格，放大态必须收掉
        zoomKey: '',
        zoomName: '',
      });
      this.refreshCanvas();
      this.refreshLayoutLabel();
      if (this.data.tour) api.applyTask(this.data.wallId, taskId);
      this.syncTourIndex();
    } catch (err) {
      this.toastError(err.message || '预设读取失败');
    }
  },

  onOpenSplitSheet() {
    const f = this.data.splitForm;
    // 打开时按当前布局预填行列（自定义切分就保留上次的）
    const sid = this._screens[0] ? String(this._screens[0].screenId) : '';
    const rects = this._rects[sid] || [];
    const key = api.layoutKeyOf(rects);
    if (key === '4') this.setData({ splitForm: { rows: '2', cols: '2' } });
    else if (key === '9') this.setData({ splitForm: { rows: '3', cols: '3' } });
    else if (key === '16') this.setData({ splitForm: { rows: '4', cols: '4' } });
    else if (key === '1') this.setData({ splitForm: { rows: '1', cols: '1' } });
    this.setData({ splitSheet: true });
  },

  onCloseSplitSheet() {
    this.setData({ splitSheet: false });
  },

  onSplitInput(e) {
    const f = this.data.splitForm;
    f[e.currentTarget.dataset.field] = e.detail.value;
    this.setData({ splitForm: f });
  },

  /** 套用预设切分（与网页端同一套），作用范围同下面的行×列 */
  onSplitPickLayout(e) {
    const key = e.currentTarget.dataset.key;
    const L = api.layoutByKey(key);
    if (!L) return;
    this.applyRects(L.rects);
    this.setData({ splitSheet: false });
  },

  /** 把一组矩形套到目标屏上（选中某块就只切它） */
  applyRects(rects) {
    const selSid = this.data.selectedKey ? this.data.selectedKey.split(':')[0] : '';
    const targets = selSid ? [selSid] : this._screens.map((s) => String(s.screenId));
    targets.forEach((sid) => {
      this._rects[sid] = rects.map((x) => Object.assign({}, x));
      // 窗口数变少时，越界的通道一并清掉
      Object.keys(this._slots).forEach((k) => {
        if (k.indexOf(sid + ':') !== 0) return;
        if (Number(k.split(':')[1]) >= rects.length) delete this._slots[k];
      });
    });
    this.resetZoom();
    this.refreshCanvas();
    this.refreshLayoutLabel();
    this.markDirty();
    if (this.data.live) this.push(true);
  },

  /** 行 × 列平均切分：选中了哪块画布就切哪块，没选就切所有 */
  onSplitSubmit() {
    const rows = Math.max(1, Math.min(10, parseInt(this.data.splitForm.rows, 10) || 1));
    const cols = Math.max(1, Math.min(10, parseInt(this.data.splitForm.cols, 10) || 1));
    const rects = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        rects.push({
          left: (c * 100) / cols,
          top: (r * 100) / rows,
          width: 100 / cols,
          height: 100 / rows,
        });
      }
    }
    this.setData({ splitSheet: false });
    this.applyRects(rects);
  },

  onLiveChange(e) {
    const v = e.detail.value;
    this.setData({ live: v, tour: v ? false : this.data.tour });
  },

  onTourChange(e) {
    const v = e.detail.value;
    this.setData({ tour: v, live: v ? false : this.data.live });
  },

  /** 拼出按屏下发的 payload */
  buildScreens() {
    const self = this;
    const zoomKey = this.data.zoomKey || '';
    return (this._screens || []).map(function (s) {
      const sid = String(s.screenId);
      // 放大态：这块屏只下发一个铺满的窗口（其它屏照常整屏下发）
      if (zoomKey.indexOf(sid + ':') === 0) {
        const ch = self._slots[zoomKey];
        return {
          screenId: sid,
          splitNum: 1,
          windows: ch
            ? [{
                index: 0,
                channelCode: ch.channelCode,
                channelName: ch.channelName,
                left: 0,
                top: 0,
                width: 100,
                height: 100,
              }]
            : [],
        };
      }
      const rects = self._rects[sid] || api.DEFAULT_LAYOUT.rects;
      const windows = [];
      rects.forEach(function (r, i) {
        const ch = self._slots[sid + ':' + i];
        if (!ch) return;
        windows.push({
          index: i,
          channelCode: ch.channelCode,
          channelName: ch.channelName,
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        });
      });
      return { screenId: sid, splitNum: rects.length, windows: windows };
    });
  },

  async push(silent) {
    if (!this.data.wallId) return;
    try {
      await api.pushLayout(this.data.wallId, this.buildScreens());
      if (!silent) this.toast('已上墙');
    } catch (e) {
      this.toastError(e.message || '上墙失败');
    }
  },

  onPush() {
    this.push(false);
  },

  async onClear() {
    const self = this;
    const ok = await this.confirm('清空这面墙上的所有窗口？');
    if (!ok) return;
    this._slots = {};
    this._rects = (this._screens || []).reduce(function (acc, s) {
      acc[String(s.screenId)] = api.DEFAULT_LAYOUT.rects.slice();
      return acc;
    }, {});
    this.resetZoom();
    this.refreshCanvas();
    this.refreshLayoutLabel();
    this.markDirty();
    this.push(false);
  },

  // ------------------------------------------------------------ 更多 / 预设管理

  onOpenMore() {
    this.setData({ moreOpen: true });
  },

  onCloseMore() {
    this.setData({ moreOpen: false });
  },

  onOpenPresetSheet() {
    this.setData({ moreOpen: false, presetSheet: true, presetForm: this.data.presetName || '' });
  },

  onPresetFormInput(e) {
    this.setData({ presetForm: e.detail.value });
  },

  async onSavePreset() {
    const name = (this.data.presetForm || '').trim();
    if (!name) {
      this.toastError('请填预设名称');
      return;
    }
    try {
      await api.savePreset(this.data.wallId, null, name, this.buildScreens());
      this._baseline = this.signature();
      this.setData({ presetSheet: false, dirty: false, presetName: name });
      this.toast('预设已保存');
      const tasks = await api.listTasks(this.data.wallId);
      const hit = tasks.find((t) => t.taskName === name);
      this.setData({
        presetOptions: tasks.map((t) => ({ value: String(t.taskId), label: t.taskName })),
        presetId: hit ? String(hit.taskId) : this.data.presetId,
      });
    } catch (e) {
      this.toastError(e.message || '保存失败');
    }
  },

  /** 画布改过：覆盖保存回当前预设 */
  async onOverwritePreset() {
    if (!this.data.presetId) return;
    try {
      await api.savePreset(this.data.wallId, this.data.presetId, this.data.presetName, this.buildScreens());
      this._baseline = this.signature();
      this.setData({ dirty: false });
      this.toast('已保存到该预设');
    } catch (e) {
      this.toastError(e.message || '保存失败');
    }
  },

  async onDeletePreset() {
    if (!this.data.presetId) {
      this.toastError('先选一个预设');
      return;
    }
    const ok = await this.confirm('删除预设「' + this.data.presetName + '」？');
    if (!ok) return;
    try {
      await api.deletePreset(this.data.wallId, this.data.presetId);
      this.setData({ moreOpen: false, presetId: '', presetName: '', dirty: false });
      const tasks = await api.listTasks(this.data.wallId);
      this.setData({ presetOptions: tasks.map((t) => ({ value: String(t.taskId), label: t.taskName })) });
      this.toast('已删除');
    } catch (e) {
      this.toast(e.message || '删除失败');
    }
  },

  // ------------------------------------------------------------ 文件夹维护

  onCloseFolderSheet() {
    this.setData({ folderSheet: false });
  },

  onClosePresetSheet() {
    this.setData({ presetSheet: false });
  },

  /** 刷新：重新拉通道与分类（新装的相机/槽位不用等下次进来） */
  async onReload() {
    this.setData({ moreOpen: false });
    try {
      const [channels, cats] = await Promise.all([api.listChannels(), api.listCategories()]);
      this._channels = channels;
      this._cats = cats;
      this.renderFolder();
      this.refreshCanvas();
      this.toast('已刷新');
    } catch (e) {
      this.toast(e.message || '刷新失败');
    }
  },

  onOpenCreateFolder() {
    this.setData({ folderSheet: true, folderForm: { mode: 'create', id: 0, name: '' } });
  },

  onFolderMore(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    const self = this;
    wx.showActionSheet({
      itemList: ['新建子文件夹', '重命名', '删除'],
      success(res) {
        if (res.tapIndex === 0) {
          self.setData({ folderSheet: true, folderForm: { mode: 'create', id: id, name: '' } });
        } else if (res.tapIndex === 1) {
          self.setData({ folderSheet: true, folderForm: { mode: 'rename', id: id, name: name } });
        } else if (res.tapIndex === 2) {
          self.doDeleteFolder(id, name);
        }
      },
    });
  },

  onFolderFormInput(e) {
    const f = this.data.folderForm;
    f.name = e.detail.value;
    this.setData({ folderForm: f });
  },

  async onFolderFormSubmit() {
    const f = this.data.folderForm;
    const name = (f.name || '').trim();
    if (!name) {
      this.toastError('请填名称');
      return;
    }
    try {
      if (f.mode === 'rename') {
        await api.renameCategory(f.id, name);
      } else {
        // 根下新建时 f.id 传 0（或没传）
        await api.createCategory(f.id || 0, name);
      }
      this._cats = await api.listCategories();
      this.setData({ folderSheet: false });
      this.renderFolder();
      this.toast('已保存');
    } catch (e) {
      this.toastError(e.message || '保存失败');
    }
  },

  async doDeleteFolder(id, name) {
    const ok = await this.confirm('删除文件夹「' + name + '」？里面的通道会回到未分类。');
    if (!ok) return;
    try {
      await api.deleteCategory(id);
      const [cats, channels] = await Promise.all([api.listCategories(), api.listChannels()]);
      this._cats = cats;
      this._channels = channels;
      this.renderFolder();
      this.refreshCanvas();
      this.toast('已删除');
    } catch (e) {
      this.toast(e.message || '删除失败');
    }
  },

  // ------------------------------------------------------------ 参观模式（遥控盘 + 参观队列）
  //
  // 讲解时不想再翻列表：下方改成「当前/下一个 + 方向键操纵杆 + 队列」。操纵杆挪选中框，
  // 中间的 OK 等于双击那个格子（放大成单画面 / 还原）；边缘那对上下按钮按人排好的顺序切预设。

  /** 进参观模式：选中框从左上角起，并拉这面墙的参观顺序 */
  enterTour() {
    const first = this._screens[0] ? String(this._screens[0].screenId) + ':0' : '';
    this.setData({ selectedKey: first, zoomKey: '', zoomName: '' });
    this.refreshCanvas();
    this.loadTour();
  },

  async loadTour() {
    try {
      const ids = await api.listTour(this.data.wallId);
      this.applyTourIds(ids);
    } catch (e) {
      this.toastError(e.message || '读取参观队列失败');
    }
  },

  /** 队列 id → [{taskId,name}]。平台上已经删掉的预设在读取时就滤掉（表里可能留孤儿行）。 */
  applyTourIds(ids) {
    const opts = this.data.presetOptions || [];
    const queue = [];
    (ids || []).forEach(function (id) {
      const hit = opts.find(function (o) { return String(o.value) === String(id); });
      if (hit) queue.push({ taskId: String(id), name: hit.label });
    });
    this.setData({ tourQueue: queue });
    this.syncTourIndex();
  },

  /** 当前预设在这条队列里的位次（-1 = 不在队列里）；队列里靠它高亮当前那一项 */
  syncTourIndex() {
    const q = this.data.tourQueue || [];
    const cur = String(this.data.presetId || '');
    let idx = -1;
    for (let i = 0; i < q.length; i += 1) {
      if (q[i].taskId === cur) {
        idx = i;
        break;
      }
    }
    this.setData({ tourIndex: idx });
  },

  /** 边缘的上下：按人排的顺序切预设 */
  onTourStep(e) {
    const dir = e.currentTarget.dataset.dir;
    const q = this.data.tourQueue || [];
    if (!q.length) {
      this.toast('先点「配置预设」排一条参观队列');
      return;
    }
    const cur = this.data.tourIndex;
    const i = cur < 0
      ? (dir === 'prev' ? q.length - 1 : 0)
      : (cur + (dir === 'prev' ? -1 : 1) + q.length) % q.length;
    this.gotoTourIndex(i);
  },

  /** 队列里直接点某一项：当锚点切过去 */
  onPickTourItem(e) {
    this.gotoTourIndex(Number(e.currentTarget.dataset.index));
  },

  gotoTourIndex(i) {
    const q = this.data.tourQueue || [];
    if (!q[i]) return;
    this.setData({ tourIndex: i });
    this.onPresetChange({ detail: { value: q[i].taskId } });
  },

  // ---- 中心操纵杆：挪选中框 / 确认放大 ----

  onPadMove(e) {
    const dir = e.currentTarget.dataset.dir;
    const screens = this._screens || [];
    if (!screens.length) return;
    let sel = this.data.selectedKey;
    // 放大态下按方向键＝先还原再挪一格：不然选择框画在放大那一格里，根本看不见
    if (this.data.zoomKey) {
      sel = this.data.zoomKey;
      const z = sel.split(':');
      this.toggleZoom(z[0], Number(z[1]));
      this.setData({ selectedKey: sel });
    }
    if (!sel) {
      this.selectPadCell(String(screens[0].screenId), 0);
      return;
    }
    const sid = sel.split(':')[0];
    const index = Number(sel.split(':')[1]);
    const target = this.padTarget(sid, index, dir);
    if (target >= 0) {
      this.selectPadCell(sid, target);
      return;
    }
    // 这块屏在这个方向到此为止：双屏墙就顺着翻到相邻那块屏
    let si = -1;
    screens.forEach(function (s, i) {
      if (String(s.screenId) === sid) si = i;
    });
    if (si < 0) return;
    const forward = dir === 'down' || dir === 'right';
    const ns = forward ? si + 1 : si - 1;
    if (ns < 0 || ns >= screens.length) return;
    const nsid = String(screens[ns].screenId);
    const nrects = this._rects[nsid] || api.DEFAULT_LAYOUT.rects;
    this.selectPadCell(nsid, forward ? 0 : nrects.length - 1);
  },

  /**
   * 该方向上的下一个格子。
   * 宫格不一定等分（左大右小这种），所以按格子中心点算：先要求方向一致，
   * 再用「主轴距离 + 2×横向偏移」挑最近的 —— 同列/同行的优先，隔着不对称布局也能走到。
   */
  padTarget(sid, index, dir) {
    const rects = this._rects[sid] || api.DEFAULT_LAYOUT.rects;
    const cur = rects[index];
    if (!cur) return -1;
    const cx = cur.left + cur.width / 2;
    const cy = cur.top + cur.height / 2;
    let best = -1;
    let bestScore = Infinity;
    rects.forEach(function (r, i) {
      if (i === index) return;
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      let main;
      let cross;
      if (dir === 'left') {
        if (dx >= -0.5) return;
        main = -dx;
        cross = Math.abs(dy);
      } else if (dir === 'right') {
        if (dx <= 0.5) return;
        main = dx;
        cross = Math.abs(dy);
      } else if (dir === 'up') {
        if (dy >= -0.5) return;
        main = -dy;
        cross = Math.abs(dx);
      } else {
        if (dy <= 0.5) return;
        main = dy;
        cross = Math.abs(dx);
      }
      const score = main + cross * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  },

  selectPadCell(sid, index) {
    this.setData({ selectedKey: sid + ':' + index });
    this.refreshCanvas();
  },

  /** 中间那颗圆 OK：等于双击选中的格子 */
  onPadOk() {
    let sel = this.data.selectedKey;
    if (!sel) {
      // 还没选就按 OK：直接取第一格有画面的，别只弹一句提示让人干等
      const s0 = this._screens[0];
      if (!s0) return;
      const sid = String(s0.screenId);
      const rects = this._rects[sid] || api.DEFAULT_LAYOUT.rects;
      for (let i = 0; i < rects.length; i += 1) {
        if (this._slots[sid + ':' + i]) {
          sel = sid + ':' + i;
          break;
        }
      }
      if (!sel) {
        this.toast('这面屏还没有画面');
        return;
      }
      this.setData({ selectedKey: sel });
    }
    this.toggleZoom(sel.split(':')[0], Number(sel.split(':')[1]));
  },

  // ---- 配置参观队列（抽屉） ----

  onOpenQueueSheet() {
    this.setData({ queueOpen: true, queueWallId: this.data.wallId });
    this.loadQueueSheet(this.data.wallId);
  },

  onCloseQueueSheet() {
    this.setData({ queueOpen: false });
  },

  async loadQueueSheet(wallId) {
    // 两份数据各拉各的：队列读不到别把预设列表也一起清空（那就连加都加不了了）
    let all = [];
    try {
      const tasks = await api.listTasks(wallId);
      all = (tasks || []).map(function (t) {
        return { taskId: String(t.taskId), name: t.taskName };
      });
    } catch (e) {
      this.toastError(e.message || '读取预设失败');
    }
    let ids = [];
    try {
      ids = await api.listTour(wallId);
    } catch (e) {
      this.toastError(e.message || '读取参观队列失败');
    }
    const picked = [];
    (ids || []).forEach(function (id) {
      if (all.some(function (a) { return a.taskId === String(id); })) picked.push(String(id));
    });
    this.setData({ queueAllRows: all, queuePicked: picked });
    this.renderQueueSheet();
  },

  renderQueueSheet() {
    const all = this.data.queueAllRows || [];
    const picked = this.data.queuePicked || [];
    const byId = {};
    all.forEach(function (a) {
      byId[a.taskId] = a;
    });
    const order = [];
    picked.forEach(function (id) {
      if (byId[id]) order.push(byId[id]);
    });
    this.setData({
      queueOrderRows: order,
      queueRestRows: all.filter(function (a) {
        return picked.indexOf(a.taskId) < 0;
      }),
    });
  },

  onQueueWallPick(e) {
    const id = e.currentTarget.dataset.id || '';
    if (!id) return;
    this.setData({ queueWallId: id });
    this.loadQueueSheet(id);
  },

  /** 点全部预设里的某一项：入队（先排在末尾，再用上下钮挪） */
  onQueueAdd(e) {
    const id = String(e.currentTarget.dataset.id);
    const picked = this.data.queuePicked.slice();
    if (picked.indexOf(id) >= 0) return;
    picked.push(id);
    this.setData({ queuePicked: picked });
    this.renderQueueSheet();
    this.persistQueue();
  },

  onQueueRemove(e) {
    const id = String(e.currentTarget.dataset.id);
    const picked = this.data.queuePicked.filter(function (x) {
      return x !== id;
    });
    this.setData({ queuePicked: picked });
    this.renderQueueSheet();
    this.persistQueue();
  },

  /** 队列内上移/下移（dir = -1 / +1）：这就是「手动排序」 */
  onQueueMove(e) {
    const id = String(e.currentTarget.dataset.id);
    const dir = Number(e.currentTarget.dataset.dir);
    const picked = this.data.queuePicked.slice();
    const i = picked.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= picked.length) return;
    picked[i] = picked[j];
    picked[j] = id;
    this.setData({ queuePicked: picked });
    this.renderQueueSheet();
    this.persistQueue();
  },

  /** 每次改动立刻整队提交：队列只十几条，省掉一个「保存」按钮的来回 */
  async persistQueue() {
    const wallId = this.data.queueWallId;
    const picked = this.data.queuePicked.slice();
    try {
      await api.saveTour(wallId, picked);
      // 改的是当前这面墙才刷新遥控盘
      if (String(wallId) === String(this.data.wallId)) this.applyTourIds(picked);
    } catch (e) {
      this.toastError(e.message || '保存参观队列失败');
    }
  },

  // ------------------------------------------------------------ 小工具

  /**
   * 统一提示：**只用页内提示条**。
   * 原生 wx.showToast 是半透明深色、在开发者工具和部分机型上几乎看不见（实测截图里就是那块灰底），
   * 所以不再调它，改成本页自绘的实色大提示。
   */
  toast(title) {
    this.flash(title, false);
  },

  /** 失败提示：红底 ✕ —— 之前失败也画绿勾，看着像成功了 */
  toastError(title) {
    this.flash(title, true);
  },

  /** 页内提示条：2.2 秒后自己消失；isErr 决定是绿勾还是红叉 */
  flash(msg, isErr) {
    const text = String(msg || '');
    if (!text) return;
    clearTimeout(this._flashTimer);
    this.setData({ flash: text, flashErr: !!isErr });
    this._flashTimer = setTimeout(() => {
      this.setData({ flash: '' });
    }, 2200);
  },

  confirm(content) {
    return new Promise(function (resolve) {
      wx.showModal({
        title: '确认',
        content: content,
        success(res) {
          resolve(!!res.confirm);
        },
        fail() {
          resolve(false);
        },
      });
    });
  },

  noop() {},
});
