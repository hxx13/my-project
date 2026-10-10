const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const { readCustomNavMetrics } = require('../../../utils/customNavMetrics.js');

/**
 * 数据监测（长期归档）小程序页 —— 与网页版同一份后端，只做**表格**这一种形式。
 *
 * 网页版那边是「行=变量、列=时间槽、一天一张表」，这里照同一口径渲染：
 * 变量列固定在左，12 个时间槽横着排，放不下就横向滚（用 CSS overflow-x，
 * **不能嵌 scroll-view** —— 外层竖滚区里再套一个，追加数据时微信会把外层 scrollTop 重置成 0）。
 *
 * 后端只认 ADMIN 起（与网页版同档）。本页的入口挂在温湿度页导航栏上，那页本身也是 ADMIN 起。
 */
const API = '/api/admin/telemetry/longterm';
/** 日历表头。与网页版同口径：**周日打头**（下面那个 getDay() 返回 0 就是周日） */
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    navBarHeight: 0,
    tableH: 0,
    tableAnchor: '',
    err: '',
    loading: false,
    days: [],
    day: '',
    slotCount: 0,
    columns: [],
    rows: [],
    weekLabels: WEEK_LABELS,
    // 查看用的单日日历
    calOpen: false,
    calYear: 0,
    calMonth: 0,
    calCells: [],
    // 导出用的多选日历
    expOpen: false,
    expBusy: false,
    expYear: 0,
    expMonth: 0,
    expCells: [],
    expPicked: [],
  },

  /**
   * 表格区的高度。
   *
   * <p>**它必须自己滚，而不是跟着页面滚** —— 表格容器为了横向滚动带了 overflow，
   * 而「一个方向不是 visible 时另一个方向也会被当成滚动容器」，竖向 sticky 就没了参照、
   * 表头吸不住（真机反馈「往上滚表头没吸顶」）。做成独立滚动区，表头的 sticky 才相对它生效。
   */
  computeLayout() {
    const nav = readCustomNavMetrics();
    let win;
    try {
      win = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {
      win = { windowHeight: 667, windowWidth: 375 };
    }
    const rpx2px = (win.windowWidth || 375) / 750;
    const toolbar = 96 * rpx2px; // 顶部工具条（日期 + 导出）连同上下间距
    const tableH = Math.max(240, Math.round((win.windowHeight || 667) - nav.navBarHeight - toolbar));
    this.setData({ navBarHeight: nav.navBarHeight, tableH });
  },

  onLoad() {
    this.computeLayout();
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      this.setData({ err: '需要管理员及以上权限' });
      return;
    }
    void this.loadDays();
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    // 分包页面在权限配置里仍按主包形式登记（与既有页面同一条约定）
    pagePermission.guardPageOnShow(this, '/pages/telemetryLongterm/index', role, 'ADMIN');
  },

  /** 拉「有数据的日期」，默认落在最近一天。这份清单同时也是日历上「哪些天有数」的依据 */
  async loadDays() {
    this.setData({ loading: true, err: '' });
    try {
      const list = await this.getJson(`${API}/days`);
      const days = Array.isArray(list) ? list : [];
      if (!days.length) {
        this.setData({ loading: false, days: [], rows: [], columns: [], day: '' });
        return;
      }
      this.setData({ days });
      await this.loadMatrix(days[0]);
    } catch (e) {
      this.setData({ loading: false, err: (e && e.message) || '读取失败' });
    }
  },

  async loadMatrix(day) {
    this.setData({ loading: true, err: '' });
    try {
      const dto = await this.getJson(`${API}/matrix?day=${encodeURIComponent(day)}`);
      const table = dto && Array.isArray(dto.dayTables) && dto.dayTables.length ? dto.dayTables[0] : null;
      if (!table) {
        this.setData({ loading: false, day, columns: [], rows: [], slotCount: 0 });
        return;
      }
      this.setData({
        loading: false,
        day: table.day || day,
        slotCount: table.slotCount || 0,
        columns: (table.columns || []).map((c) => ({ slot: c.slot, time: c.time || '' })),
        rows: this.buildRows(table),
      });
      // 换了天就把表格滚回顶部 —— 不然用户会停在上一张表的中间位置，第一行得自己往上找。
      // 锚点要先清空、下一帧再设回：值没变的话 scroll-into-view 不会触发。
      this.setData({ tableAnchor: '' });
      wx.nextTick(() => this.setData({ tableAnchor: 'tl-head' }));
    } catch (e) {
      this.setData({ loading: false, err: (e && e.message) || '读取失败' });
    }
  },

  /**
   * 矩阵 → 行模型。
   *
   * 极值高亮与网页版同口径：**要有两个以上不同的数值才标** —— 一个变量当天只采到一个值时，
   * 标「最大」等于没标。数值统一取一位小数（原始值有 5 位小数，表格里读起来吵）。
   * 空值显示破折号：那是「当时没采到」，不是 0。
   */
  buildRows(table) {
    const cols = table.columns || [];
    return (table.rows || []).map((r, ri) => {
      const raw = Array.isArray(r.values) ? r.values : [];
      const nums = cols.map((_, i) => {
        const v = raw[i];
        if (v == null || String(v).trim() === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      });
      const valid = nums.filter((n) => n != null);
      const distinct = new Set(valid).size > 1;
      const min = valid.length ? Math.min.apply(null, valid) : null;
      const max = valid.length ? Math.max.apply(null, valid) : null;
      return {
        key: r.variableName || `row${ri}`,
        label: r.roomCanonical || r.displayLabel || r.variableName || '',
        unit: r.unit || '',
        cells: cols.map((_, i) => {
          const v = raw[i];
          const empty = v == null || String(v).trim() === '';
          const n = nums[i];
          const isNum = n != null;
          let cls = '';
          if (distinct && isNum) {
            if (n === max) cls = 'cell-max';
            else if (n === min) cls = 'cell-min';
          }
          return { i, text: isNum ? n.toFixed(1) : (empty ? '—' : String(v)), cls };
        }),
      };
    });
  },

  // ── 日历（查看单日 / 导出多选共用同一套铺法）──────────────────
  // 原版 picker 是底部滚轮：日期一多就得一格一格转，落到目标那天很费劲，所以自绘月历。

  /**
   * 铺一个月历格子。前面补空的格也照常渲染（只是不给文字），
   * **不写 wx:if/wx:else 分支** —— 小程序里 wx:else 和 wx:for 一起用会整块不渲染（踩过）。
   */
  buildCells(year, month, selectedSet) {
    const lead = new Date(year, month - 1, 1).getDay();
    const total = new Date(year, month, 0).getDate();
    const has = new Set(this.data.days || []);
    const cells = [];
    for (let i = 0; i < lead; i += 1) {
      cells.push({ key: `p${i}`, d: 0 });
    }
    for (let d = 1; d <= total; d += 1) {
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ key: ymd, d, ymd, has: has.has(ymd), selected: selectedSet.has(ymd) });
    }
    return cells;
  },

  /** 从某个 'yyyy-MM-dd' 拆年月；没有就退回今天 */
  yearMonthOf(ymd) {
    if (ymd && ymd.length >= 7) {
      return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  },

  shiftMonth(year, month, delta) {
    let y = year;
    let m = month + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    return { year: y, month: m };
  },

  // ── 查看：单日日历 ──────────────────────────────────────────

  openCal() {
    const base = this.data.day || (this.data.days || [])[0] || '';
    const ym = this.yearMonthOf(base);
    this.setData({ calOpen: true, calYear: ym.year, calMonth: ym.month });
    this.setData({ calCells: this.buildCells(ym.year, ym.month, new Set([base])) });
  },

  closeCal() {
    this.setData({ calOpen: false });
  },

  /** 弹层内部点击不该冒泡到遮罩上（否则点一下就关了） */
  noop() {},

  shiftCalMonth(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const ym = this.shiftMonth(this.data.calYear, this.data.calMonth, delta);
    this.setData({ calYear: ym.year, calMonth: ym.month });
    this.setData({ calCells: this.buildCells(ym.year, ym.month, new Set([this.data.day])) });
  },

  onPickDay(e) {
    const ymd = e.currentTarget.dataset.day;
    if (!ymd) return; // 补位的空格
    this.setData({ calOpen: false });
    if (ymd === this.data.day) return; // 点的就是当前这天，不必重拉
    void this.loadMatrix(ymd);
  },

  // ── 导出：多选日历 ──────────────────────────────────────────

  /**
   * 打开导出设置。**默认勾上正在看的这天** —— 大多数人就是想把眼前这张导出去；
   * 要多天再往上点。
   */
  openExport() {
    if (this.data.expOpen) return;
    const base = this.data.day || (this.data.days || [])[0] || '';
    const ym = this.yearMonthOf(base);
    const picked = base ? [base] : [];
    this.setData({ expOpen: true, expYear: ym.year, expMonth: ym.month, expPicked: picked, expBusy: false });
    this.setData({ expCells: this.buildCells(ym.year, ym.month, new Set(picked)) });
  },

  closeExport() {
    this.setData({ expOpen: false });
  },

  shiftExpMonth(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const ym = this.shiftMonth(this.data.expYear, this.data.expMonth, delta);
    this.setData({ expYear: ym.year, expMonth: ym.month });
    this.setData({ expCells: this.buildCells(ym.year, ym.month, new Set(this.data.expPicked || [])) });
  },

  toggleExpDay(e) {
    const ymd = e.currentTarget.dataset.day;
    if (!ymd) return;
    const cur = this.data.expPicked || [];
    const next = cur.indexOf(ymd) >= 0 ? cur.filter((x) => x !== ymd) : cur.concat(ymd);
    this.setData({ expPicked: next });
    this.setData({ expCells: this.buildCells(this.data.expYear, this.data.expMonth, new Set(next)) });
  },

  /** 「本月全选」：把日历上正在看那个月里**有采样的日子**一次勾上（与网页版同口径） */
  pickExpMonth() {
    const ym = `${this.data.expYear}-${String(this.data.expMonth).padStart(2, '0')}`;
    const picked = (this.data.days || []).filter((d) => d.indexOf(ym) === 0).sort();
    this.setData({ expPicked: picked });
    this.setData({ expCells: this.buildCells(this.data.expYear, this.data.expMonth, new Set(picked)) });
  },

  clearExpPick() {
    this.setData({ expPicked: [] });
    this.setData({ expCells: this.buildCells(this.data.expYear, this.data.expMonth, new Set()) });
  },

  /** 单天给日期、多天给区间 —— 与网页版导出同一个命名口径 */
  defaultExportName(picked) {
    const stem = picked.length === 1 ? picked[0] : `${picked[0]}~${picked[picked.length - 1]}`;
    return `${stem}监测数据表格.xlsx`;
  },

  async doExport() {
    const picked = (this.data.expPicked || []).slice().sort();
    if (!picked.length) {
      wx.showToast({ title: '先选几天再导', icon: 'none' });
      return;
    }
    if (this.data.expBusy) return;
    this.setData({ expBusy: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      // 宽表：行=变量、列=时间槽，跟屏幕上看到的一致；多天时后端按天分段接在同一张表里
      const path = `${API}/export/download?days=${encodeURIComponent(picked.join(','))}&layout=WIDE`;
      const res = await springAuth.springRequestBinary(path, {
        errorMessage: '导出失败',
        forbiddenMessage: '无权限导出',
      });
      const name = springAuth.parseContentDispositionFilename(res.contentDisposition)
        || this.defaultExportName(picked);
      await springAuth.saveAndOpenDocument(res.data, name, 'xlsx');
      this.setData({ expOpen: false });
      wx.showToast({ title: '已开始下载', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ expBusy: false });
    }
  },

  /**
   * 统一取 JSON。两个坑都在这儿兜住：
   * ① 这条链路回来的 `data` 可能是字符串，得先 parse；
   * ② **必须查 success** —— 后端业务失败也是 HTTP 200，不看这个字段会把「被拦下」显示成「拿到了」。
   */
  async getJson(path) {
    const res = await springAuth.springRequest({ url: path, method: 'GET' });
    let body = res && res.data;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = null;
      }
    }
    if (!body || body.success !== true) {
      throw new Error((body && body.message) || `读取失败（HTTP ${res && res.statusCode}）`);
    }
    return body.data;
  },
});
