/**
 * 饮水流量监测 · 平面图（小程序端，只读）
 *
 * 画布只在**进页面、换通道、切横竖屏**时画一次：房间、点位、文字、图例、管道纹路
 * 全部烘进一张底图，之后拖动和缩放只是把这张图换个位置贴上去，没有任何逐帧循环。
 * 管道只保留花纹（示意走向），不跑流动。
 *
 * 画布尺寸 = **可视区**大小；平面图怎么摆由手势的 scale/tx/ty 决定。
 * 不用 scroll-view：滚动与重绘抢渲染，拖起来卡。
 *
 * 数据来自后端 `/api/admin/avidity/*`（ADMIN 门禁，本页入口也只对 ADMIN 显示）。
 */
const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

/**
 * 调后端 /api/admin/**。springRequest 回的是 {statusCode, data}，data 默认是**文本**，
 * 要自己 JSON.parse 再剥掉 {code, success, message, data} 那层壳。
 * 这个模块的接口全部有 ADMIN 门禁 —— 非管理员在这里会拿到 403。
 */
function apiGet(path) {
  return springAuth.springRequest({ url: path }).then((res) => {
    const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.statusCode === 403) throw new Error('需要管理员权限');
    if (res.statusCode !== 200) throw new Error(`请求失败（${res.statusCode}）`);
    if (body && body.success === false) throw new Error(body.message || '请求失败');
    return body && body.data !== undefined ? body.data : body;
  });
}

/** "2026-10-15 17:12:03" → "10-15 17:12"（抽屉里横向空间有限） */
function shortStamp(s) {
  return s && s.length >= 16 ? s.slice(5, 16) : (s || '');
}

/** 秒数 → 「1 小时 23 分」 */
function durationText(sec) {
  if (sec == null || sec < 0) return '—';
  if (sec < 60) return sec + ' 秒';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + ' 分钟';
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
}

/** 报警光环的一趟时长（毫秒）：慢一点才看得清，太快像在闪 */
const PULSE_CYCLE_MS = 1200;

/** 画布留白：底部给一点点，免得贴边 */
const PLAN_BOTTOM_PAD = 8;
/** 离屏 canvas 的 dpr 上限：画幅本来就宽，再乘满 dpr 会撞小程序 canvas 尺寸上限 */
const MAX_DPR = 2;

Page({
  data: {
    loading: true,
    err: '',
    channels: [],
    activeChannelId: null,
    rotated: false,
    /** 平面图显示尺寸（px）—— 高=可视高，宽=高×画幅比 */
    planW: 0,
    planH: 0,
    navBarHeight: 44,
    /** 通道块上的报警角标：channelId → 此刻在报的点位数 */
    chanBadges: {},
    /** 报警历史抽屉 */
    historyVisible: false,
    historyLoading: false,
    historyErr: '',
    historyCount: 0,
    historyRooms: [],
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({
      navBarHeight: (sys.statusBarHeight || 20) + 44,
      _sys: sys,
    });
    this._plan = null;
    this._vb = null;
    this._pulse = 0;
    // 入口本身只对 ADMIN 显示，页面再自守一道（仓库惯例）
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      this.setData({ loading: false, err: '需要管理员及以上权限' });
      return;
    }
    this.loadChannels();
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    pagePermission.guardPageOnShow(this, '/package-feature/pages/avidityFloorPlan/index', role, 'ADMIN');
  },

  onHide() {
    this.stopPolls();
    this.stopPulseLoop();
  },

  onUnload() {
    this.stopPolls();
    this.stopPulseLoop();
    this._plan = null;
  },

  /** 取通道列表（顶部 tab） */
  loadChannels() {
    apiGet('/api/admin/avidity/channels')
      .then((channels) => {
        const list = Array.isArray(channels) ? channels : [];
        if (!list.length) {
          this.setData({ loading: false, err: '没有可用通道' });
          return;
        }
        this.setData({ channels: list, activeChannelId: list[0].channelId });
        this.loadPlan(list[0].channelId);
      })
      .catch((e) => this.setData({ loading: false, err: (e && e.message) || '通道读取失败' }));
  },

  switchChannel(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || id === this.data.activeChannelId) return;
    // 底图是按「某个通道的布局」烘的，换通道必须作废，否则会拿上一个通道的底图去贴
    this._baseImg = null;
    this._scale = 0;
    this.setData({ activeChannelId: id, loading: true, err: '', historyVisible: false });
    this.loadPlan(id);
  },

  /** 取平面图布局并画出来 */
  loadPlan(channelId) {
    apiGet(`/api/admin/avidity/floorplan?channelId=${channelId}`)
      .then((plan) => {
        if (!plan || !plan.rooms) {
          this.setData({ loading: false, err: '该通道还没有平面图布局' });
          return;
        }
        this._plan = plan;
        this._vb = plan.viewBox && plan.viewBox.length === 4 ? plan.viewBox : [0, 0, 1280, 720];
        // 两路数据都要先拿到再画：实时灯态（哪几个点在报）+ 今日次数（报了几次）
        Promise.all([this.loadLiveStates(channelId), this.loadAlarms(channelId)]).then(() => {
          this._sig = this.paintSignature();
          this.startPolls(channelId);
          this.renderPlan();
        });
      })
      .catch((e) => this.setData({ loading: false, err: (e && e.message) || '平面图读取失败' }));
  },

  /**
   * 点位**实时状态**：平面图上的灯亮不亮就看它。
   * 后端挂了一条到厂平台的长连接（画面上的灯＝绑定变量的当前值），这里只是读它缓存的快照：
   * 值非 0 就是报警中。这跟「报警表」不是一套数据，别再拿当前报警列表来标红（对不上）。
   */
  loadLiveStates(channelId) {
    return apiGet(`/api/admin/avidity/live-states?channelId=${channelId}`)
      .then((res) => {
        this._live = (res && res.states) || {};
        this._liveConnected = !!(res && res.connected);
        this.applyChannelBadges((res && res.counts) || {});
      })
      .catch(() => {
        this._live = {};
        this._liveConnected = false;
        this.applyChannelBadges({});
      });
  },

  /**
   * 通道块上的角标＝这台设备**此刻**有几个点在报，跟画面上亮的灯一致。
   * 后端一次把每台设备都算了，所以只要不换通道，只请求本通道也能标出全部通道。
   */
  applyChannelBadges(counts) {
    const badges = {};
    (this.data.channels || []).forEach((c) => {
      const n = counts[String(c.virtualDeviceId)] || 0;
      if (n > 0) badges[c.channelId] = n;
    });
    const sig = JSON.stringify(badges);
    if (sig === this._badgeSig) return;   // 十秒一次，没变就别惊动渲染层
    this._badgeSig = sig;
    this.setData({ chanBadges: badges });
  },

  /** 今日各点位报了几次（同一口径的报警表计数），只负责「今日报过」那一档的深浅 */
  loadAlarms(channelId) {
    return apiGet(`/api/admin/avidity/alarm-stats?channelId=${channelId}`)
      .then((stats) => {
        const stat = {};
        (Array.isArray(stats) ? stats : []).forEach((x) => { stat[x.alarmName] = x.alarmCount || 0; });
        this._stat = stat;
      })
      .catch(() => { this._stat = {}; });
  },

  /** 实时灯态变得快，10 秒一看；今日次数是当天累计，1 分钟一看够了 */
  livePollMs: 10000,
  statPollMs: 60000,

  startPolls(channelId) {
    this.stopPolls();
    if (!channelId) return;
    this._livePollTimer = setInterval(() => {
      if (this.data.activeChannelId !== channelId) return;
      this.loadLiveStates(channelId).then(() => this.repaintIfChanged());
    }, this.livePollMs);
    this._statPollTimer = setInterval(() => {
      if (this.data.activeChannelId !== channelId) return;
      this.loadAlarms(channelId).then(() => this.repaintIfChanged());
    }, this.statPollMs);
  },

  stopPolls() {
    if (this._livePollTimer) {
      clearInterval(this._livePollTimer);
      this._livePollTimer = null;
    }
    if (this._statPollTimer) {
      clearInterval(this._statPollTimer);
      this._statPollTimer = null;
    }
  },

  /**
   * 点位颜色是**烘进底图**的，所以数据变了必须整幅重烘一遍，否则标签一直停在进页面那一刻。
   * 先比签名，没变就不折腾（十秒一次的重烘没必要）。
   */
  paintSignature() {
    const part = (o) => Object.keys(o || {}).sort().map((k) => `${k}=${o[k]}`).join(',');
    return `${part(this._live)}|${part(this._stat)}|${this._liveConnected ? 1 : 0}`;
  },

  repaintIfChanged() {
    const sig = this.paintSignature();
    if (sig === this._sig) return;
    this._sig = sig;
    this._baseImg = null;
    if (this._plan) this.renderPlan();
    // 报警的点可能从 0 个变成几个（或反过来），动效循环跟着起停
    this.syncPulseLoop();
  },

  /** 报警动效只在「有报警中」时跑；全绿就停，省电也省事 */
  hasAlarm() {
    const live = this._live || {};
    for (const k in live) {
      if (live[k]) return true;
    }
    return false;
  },

  syncPulseLoop() {
    if (this.hasAlarm()) this.startPulseLoop();
    else this.stopPulseLoop();
  },

  startPulseLoop() {
    if (this._pulseRaf || !this._canvas) return;
    const tick = () => {
      this._pulseRaf = null;
      if (!this._canvas || !this.hasAlarm()) return;   // 报警没了自己停
      // 相位按**时钟**走，跟帧率无关：一趟 1.2 秒
      this._pulse = (Date.now() % PULSE_CYCLE_MS) / PULSE_CYCLE_MS;
      this.paintThrottled();                            // 自带 32ms 限频，不必 60fps 重画整幅
      this._pulseRaf = this._canvas.requestAnimationFrame(tick);
    };
    this._pulseRaf = this._canvas.requestAnimationFrame(tick);
  },

  stopPulseLoop() {
    if (this._pulseRaf && this._canvas) {
      this._canvas.cancelAnimationFrame(this._pulseRaf);
    }
    this._pulseRaf = null;
  },

  openHistory() {
    this.setData({ historyVisible: true });
    this.loadHistory();
  },

  closeHistory() {
    const wasOpen = this.data.historyVisible;
    this.setData({ historyVisible: false }, () => {
      // 抽屉开着时画布是摘掉的（它是原生层，会盖穿抽屉），关掉得挂回来重画
      if (wasOpen && this._plan) this.renderPlan();
    });
  },

  /** 抽屉挡住页面时，别让手指把后面的平面图拖着滚 */
  noop() {},

  /**
   * 报警历史：**我们自己记的起止时间**（后端按实时状态记的），按平面图上的房间归好档。
   * 不用厂平台那份流水 —— 那份只有他们给的字段，也没有我们要的「这一轮几点开始、几点恢复」。
   */
  loadHistory() {
    const channelId = this.data.activeChannelId;
    this.setData({ historyLoading: true, historyErr: '' });
    apiGet(`/api/admin/avidity/alarm-events?days=7&channelId=${channelId}`)
      .then((res) => {
        const rooms = ((res && res.rooms) || []).map((room) => ({
          room: room.room,
          count: room.count,
          racks: (room.racks || []).map((rack) => ({
            rack: rack.rack,
            count: rack.count,
            items: (rack.items || []).map((it) => ({
              id: it.id,
              no: it.pointNo,
              startedAt: shortStamp(it.startedAt),
              endedAt: it.ongoing ? '' : shortStamp(it.endedAt),
              ongoing: !!it.ongoing,
              duration: durationText(it.durationSec),
            })),
          })),
        }));
        this.setData({
          historyRooms: rooms,
          historyCount: (res && res.count) || 0,
          historyLoading: false,
        });
      })
      .catch((e) => this.setData({
        historyLoading: false,
        historyErr: (e && e.message) || '历史读取失败',
      }));
  },

  /**
   * 画幅尺寸。
   *  未旋转：**高锁死为可视高度**、宽按画幅比例（不缩到适配宽度，左右拖着看）
   *  旋转后：把平面图的长边摆到手机的长边上 —— 缩放取「长边塞进手机高度」与
   *          「短边塞进手机宽度」的较小值，于是**整幅能一眼看全**，不需要拖。
   *          三套画面实测都塞得下（2F 520px / B1 626px / 隔离包 558px，可视长度约 706px）。
   */
  computeSize() {
    const phoneH = Math.max(200, this.viewportHeight() - (this.data.navBarHeight || 64) - 56);
    const phoneW = (this.data._sys && this.data._sys.windowWidth) || 375;
    // 画布 = **可视区**大小（不再是整幅平面图的尺寸）。
    // 平面图怎么摆由手势的 scale/tx/ty 决定 —— 画布只有一屏大，
    // 重绘代价与平面图大小无关；也彻底甩掉了 scroll-view 与逐帧重绘抢渲染的卡顿。
    return { w: Math.round(phoneW), h: Math.round(phoneH - PLAN_BOTTOM_PAD), s: this._scale || 1 };
  },

  /** 初始缩放：竖屏按高度铺满（与之前观感一致），横屏整幅塞下 */
  initialScale(w, h) {
    const vb = this._vb;
    return this.data.rotated ? Math.min(w / vb[3], h / vb[2]) : h / vb[3];
  },

  /** 平移夹在边界内：不让人把图拖出屏幕，也不留大片空白 */
  clampView() {
    const vb = this._vb;
    const { w, h } = this.computeSize();
    const rot = this.data.rotated;
    const planW = (rot ? vb[3] : vb[2]) * this._scale;
    const planH = (rot ? vb[2] : vb[3]) * this._scale;
    this._tx = planW <= w ? (w - planW) / 2 : Math.min(0, Math.max(w - planW, this._tx || 0));
    this._ty = planH <= h ? (h - planH) / 2 : Math.min(0, Math.max(h - planH, this._ty || 0));
  },

  /** 单指平移 + 双指捏合缩放。不用 scroll-view，手势全自己管。 */
  onTouchStart(e) {
    const ts = e.touches || [];
    this._lastPaint = 0;
    if (ts.length >= 2) {
      this._pinchDist = this.dist(ts);
      this._pinchScale = this._scale;
      this._pinchMid = this.mid(ts);
    } else if (ts.length === 1) {
      this._panFrom = { x: ts[0].clientX, y: ts[0].clientY, tx: this._tx, ty: this._ty };
    }
  },

  onTouchMove(e) {
    const ts = e.touches || [];
    if (ts.length >= 2 && this._pinchDist) {
      const d = this.dist(ts);
      const mid = this.mid(ts);
      let next = this._pinchScale * (d / this._pinchDist);
      next = Math.min(4, Math.max(0.4, next));
      // 以两指中点为锚点缩放，手指底下的那块内容不动
      const k = next / this._scale;
      this._tx = mid.x - (this._pinchMid.x - this._tx) * k;
      this._ty = mid.y - (this._pinchMid.y - this._ty) * k;
      this._scale = next;
    } else if (ts.length === 1 && this._panFrom) {
      this._tx = this._panFrom.tx + (ts[0].clientX - this._panFrom.x);
      this._ty = this._panFrom.ty + (ts[0].clientY - this._panFrom.y);
    } else {
      return;
    }
    this.clampView();
    this.paintThrottled();
  },

  onTouchEnd() {
    this._panFrom = null;
    this._pinchDist = 0;
    // 松手后按最终缩放重新夹一次，避免回弹位置越界
    this.clampView();
    this.paintThrottled(true);
  },

  dist(ts) {
    const dx = ts[0].clientX - ts[1].clientX;
    const dy = ts[0].clientY - ts[1].clientY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  },

  mid(ts) {
    return { x: (ts[0].clientX + ts[1].clientX) / 2, y: (ts[0].clientY + ts[1].clientY) / 2 };
  },

  /** 手势期间也限频重绘：手指一秒能发上百个 touchmove，逐个重画必卡 */
  paintThrottled(force) {
    const now = Date.now();
    if (!force && now - (this._lastPaint || 0) < 32) return;
    this._lastPaint = now;
    if (this._ctx) {
      const { w, h } = this.computeSize();
      this.paint(this._ctx, w, h, this._dpr, this._scale);
    }
  },

  toggleRotate() {
    this.setData({ rotated: !this.data.rotated }, () => {
      if (this._plan) {
        this._scale = 0;
        this.renderPlan();
      }
    });
  },

  viewportHeight() {
    const s = this.data._sys || wx.getSystemInfoSync();
    return (s.windowHeight || s.screenHeight || 667);
  },

  /** 摆好画布并画一次。没有循环 —— 缩放/拖动由手势那边直接重绘 */
  renderPlan() {
    const { w, h, s: scale } = this.computeSize();
    const dpr = Math.min(MAX_DPR, Math.max(1, (this.data._sys && this.data._sys.pixelRatio) || 2));
    // 画布在 wx:else 分支里，**得先把尺寸 setData 上去、等这次渲染完成**才查得到它。
    // 在 setData 之前直接查会拿到 null（实测报「画布初始化失败」）。
    this.setData({ planW: w, planH: h, loading: false, err: '' }, () => {
      wx.nextTick(() => this.queryCanvasAndRun(w, h, dpr, scale));
    });
  },

  queryCanvasAndRun(w, h, dpr, scale) {
    wx.createSelectorQuery()
      .select('#avidityPlanCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res && res[0] && res[0].node;
        if (!canvas) {
          this.setData({ loading: false, err: '画布初始化失败' });
          return;
        }
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        this._canvas = canvas;
        this._ctx = ctx;
        this._dpr = dpr;
        // 先把缩放定下来，再烘底图 —— 烘的分辨率要按初始缩放算，顺序颠倒会烘成兜底值
        if (!this._scale) {
          this._scale = this.initialScale(w, h);
          this._tx = 0;
          this._ty = 0;
          this.clampView();
        }
        if (this._baseImg) {
          this.paintThrottled(true);
          this.syncPulseLoop();
        } else {
          this.bakeBase(canvas);
        }
      });
  },

  /**
   * 烘底图：房间框、管道花纹、文字、点位、图例整幅画到离屏 canvas，导出成图片。
   * 之后拖动、缩放都只是把这张图挪个位置贴上去 —— 没有动画，也就没有逐帧重绘。
   * 分辨率按 **初始缩放的 2 倍** 烘（缩放进去看得清），并夹在长边 2000px 以内。
   */
  bakeBase(mainCanvas) {
    const vb = this._vb;
    const bake = Math.min(2 * (this._scale || 1), 2000 / Math.max(vb[2], vb[3]));
    wx.createSelectorQuery()
      .select('#avidityBaseCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const c = res && res[0] && res[0].node;
        if (!c) return;
        c.width = Math.round(vb[2] * bake);
        c.height = Math.round(vb[3] * bake);
        const cx = c.getContext('2d');
        cx.setTransform(1, 0, 0, 1, 0, 0);
        cx.clearRect(0, 0, c.width, c.height);
        cx.scale(bake, bake);
        cx.translate(-vb[0], -vb[1]);
        this.paintStatic(cx);
        wx.canvasToTempFilePath(
          { canvas: c, x: 0, y: 0, width: c.width, height: c.height, destWidth: c.width, destHeight: c.height },
          this
        ).then((r) => {
          const img = mainCanvas.createImage();
          img.onload = () => {
            this._baseImg = img;
            this.paintThrottled(true);
            this.syncPulseLoop();
          };
          img.src = r.tempFilePath;
        }).catch(() => {});
      });
  },

  paint(ctx, W, H, dpr, s) {
    const vb = this._vb;
    const sc = this._scale || s;
    ctx.clearRect(0, 0, W * dpr, H * dpr);
    ctx.save();
    // 变换链：平移 → 缩放 → （可选）转 90° → 回到平面图原点。
    // 旋转后平面点的映射是 (px,py) → (tx + s*(vb3-(py-vb1)), ty + s*(px-vb0)) ——
    // 长边(x)落在画布纵轴、短边(y)落在横轴。
    // **转完必须再沿旋转后的 x 轴平移一个「平面图高度」**，否则整幅被推到画布左侧外面，
    // 表现就是点旋转「直接空白一片」。
    ctx.translate((this._tx || 0) * dpr, (this._ty || 0) * dpr);
    ctx.scale(sc * dpr, sc * dpr);
    if (this.data.rotated) {
      // 顺序要紧：**先 translate 再 rotate**。
      // canvas 的变换是右乘，点在链上是「最内层先作用」，所以写在 rotate 前面
      // 的那步平移才作用在**旋转后**的坐标上 —— 正是把整幅从负坐标拉回画布内所需的。
      // 写成 rotate 在前的话平移会加到平面上，整幅被推到画布左侧外面，就是「点旋转一片空白」。
      ctx.translate(vb[3], 0);
      ctx.rotate(Math.PI / 2);
    }
    ctx.translate(-vb[0], -vb[1]);

    if (this._baseImg) {
      // 底图就按平面图矩形贴；坐标系此刻正好是平面图坐标，不用再换算
      ctx.drawImage(this._baseImg, vb[0], vb[1], vb[2], vb[3]);
      // 报警中那几个点叠一层会动的光环 —— 烘进底图的静态红格子太不显眼了
      this.paintAlarmPulse(ctx);
      ctx.restore();
      return;
    }
    this.paintStatic(ctx);
    ctx.restore();
  },

  /**
   * 报警中：呼吸 + 往外荡的光环。只画这几个点，全绿时循环根本不跑。
   * 画在底图之上，所以改数据不用重烘也能立刻看出变化。
   */
  paintAlarmPulse(ctx) {
    const live = this._live || {};
    if (!live) return;
    const phase = this._pulse || 0;
    ((this._plan && this._plan.rooms) || []).forEach((room) => {
      (room.racks || []).forEach((rack) => {
        (rack.points || []).forEach((p) => {
          if (!live[p.var]) return;
          const w = p.w || 14;
          const h = p.h || 14;
          const cx = p.x + w / 2;
          const cy = p.y + h / 2;
          const r0 = Math.max(w, h) / 2 + 1.5;
          // 两圈错开半个周期往外荡
          for (let k = 0; k < 2; k++) {
            const t = (phase + k * 0.5) % 1;
            ctx.beginPath();
            ctx.arc(cx, cy, r0 + t * 12, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(229,72,77,' + (0.6 * (1 - t)).toFixed(3) + ')';
            ctx.lineWidth = 2.6;
            ctx.stroke();
          }
          // 核心随呼吸一起一伏
          const breath = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
          ctx.beginPath();
          ctx.arc(cx, cy, r0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(229,72,77,' + (0.16 + 0.34 * breath).toFixed(3) + ')';
          ctx.fill();
        });
      });
    });
  },

  /**
   * 管道：外壳 + 花纹。花纹是**静态图形**（示意走向），不跑流动。
   * 画在房间框之后、文字与点位之前 —— 位置号的标签要压在水管上面。
   */
  paintPipes(ctx) {
    const plan = this._plan;
    (plan.pipes || []).forEach((p) => this.strokePath(ctx, p, p.main ? '#c9d4fb' : '#cdeef2', p.main ? 8.5 : 5.5));
    (plan.pipes || []).forEach((p) => {
      this.strokePath(ctx, p, p.main ? '#4338ca' : '#0d95a6', p.main ? 4 : 2.6,
        p.main ? [14, 48] : [10, 34], 0);
    });
  },

  /** 静态内容：房间框、管道、文字、点位、图例。烘底图与无底图时的兜底都走它。 */
  paintStatic(ctx) {
    const plan = this._plan;
    const vb = this._vb;

    // ① 前室底面
    (plan.rooms || []).forEach((room) => {
      if (!room.box) return;
      const [x, y, w, h] = room.box;
      ctx.strokeStyle = 'rgba(82,82,82,0.55)';
      ctx.lineWidth = 1.3;
      this.roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
    });
    // ①b 内间框
    (plan.rooms || []).forEach((room) => {
      (room.racks || []).forEach((rack) => {
        if (!rack.box) return;
        const [x, y, w, h] = rack.box;
        ctx.strokeStyle = 'rgba(82,82,82,0.35)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, x, y, w, h, 6);
        ctx.stroke();
      });
    });

    // ② 管道（标签压在水管上面，所以先画管道）
    this.paintPipes(ctx);

    // ③ 文字
    ctx.textBaseline = 'top';
    (plan.rooms || []).forEach((room) => {
      if (room.label) {
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 21px monospace';
        ctx.fillText(String(room.room), room.label[0], room.label[1] - 4);
      }
      (room.racks || []).forEach((rack) => {
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px monospace';
        ctx.fillText(String(rack.display || rack.rack), rack.label[0], rack.label[1] - 2);
      });
    });
    (plan.regulators || []).forEach((reg) => {
      ctx.fillStyle = 'rgba(107,114,128,0.6)';
      ctx.font = '12.5px monospace';
      ctx.fillText(String(reg.name), reg.x, reg.y - 2);
    });

    // ④ 点位格
    (plan.rooms || []).forEach((room) => {
      (room.racks || []).forEach((rack) => {
        (rack.points || []).forEach((p) => {
          const w = (p.w || 14) + 6;
          const h = (p.h || 14) + 6;
          const x = p.x - 3;
          const y = p.y - 3;
          // 报警态：报警中（红）/ 今日报过（琥珀，深浅按真实次数）/ 正常（白）
          // 「报警中」看实时灯态，不是报警表；「今日报过」的次数按平台的报警名查（少数点位两者不同名）
          const isAlarm = !!(this._live && this._live[p.var]);
          const cnt = (this._stat && this._stat[p.alarm || p.var]) || 0;
          const t = Math.min(1, cnt / 30);
          if (isAlarm) {
            ctx.fillStyle = 'rgba(229,72,77,0.22)';
            ctx.strokeStyle = '#e5484d';
            ctx.lineWidth = 1.6;
          } else if (cnt > 0) {
            ctx.fillStyle = 'rgba(224,140,26,' + (0.16 + 0.34 * t).toFixed(3) + ')';
            ctx.strokeStyle = 'rgba(214,124,10,' + (0.55 + 0.40 * t).toFixed(3) + ')';
            ctx.lineWidth = 1;
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(120,130,150,0.55)';
            ctx.lineWidth = 1;
          }
          this.roundRect(ctx, x, y, w, h, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isAlarm ? '#a3121b' : (cnt > 0 ? '#1f2937' : '#6b7280');
          ctx.font = '13px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(p.no), x + w / 2, y + h / 2 - 7);
          ctx.textAlign = 'left';
        });
      });
    });

    // ⑤ 图例：烘进底图，跟着平面图一起缩放/旋转
    this.paintLegend(ctx, vb);
  },

  /**
   * 图例：**画进画布**、钉在平面图的左上角。
   * 不做浮层 —— 用户要的是跟着图一起滚/一起转（浮层在横屏时会跟画布对不上）。
   */
  paintLegend(ctx, vb) {
    const X = vb[0] + 14;
    const Y = vb[1] + 14;
    const W = 172;
    const pad = 10;
    const rowH = 20;
    const rows = 6;
    const H = pad * 2 + (rows - 1) * rowH + 14;

    ctx.save();
    this.roundRect(ctx, X, Y, W, H, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '13px monospace';
    ctx.textBaseline = 'middle';
    let y = Y + pad + 7;
    const sx = X + pad;
    // 两条管道：长短一样、粗细不同，跟画布上的管型对齐
    ctx.strokeStyle = '#4338ca'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 30, y); ctx.stroke();
    ctx.fillStyle = '#6b7280'; ctx.fillText('房间外主管道', sx + 42, y);
    y += rowH;
    ctx.strokeStyle = '#0d95a6'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 30, y); ctx.stroke();
    ctx.fillStyle = '#6b7280'; ctx.fillText('进房间支管', sx + 42, y);
    y += rowH;
    // 三种点位状态
    const cell = (fill, stroke) => {
      this.roundRect(ctx, sx + 5, y - 7, 20, 14, 4);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    };
    cell('#ffffff', 'rgba(120,130,150,0.55)');
    ctx.fillStyle = '#6b7280'; ctx.fillText('正常', sx + 42, y);
    y += rowH;
    cell('rgba(224,140,26,0.34)', 'rgba(214,124,10,0.75)');
    ctx.fillStyle = '#6b7280'; ctx.fillText('今日报过', sx + 42, y);
    y += rowH;
    cell('rgba(229,72,77,0.22)', '#e5484d');
    ctx.fillStyle = '#6b7280'; ctx.fillText('报警中', sx + 42, y);
    y += rowH;
    // 实时数据通不通：灯是按厂平台的长连接推来的，断了这里只有「今日报过」，
    // 不说一声会被当成「没报警」—— 所以状态直接写在图例里
    ctx.beginPath();
    ctx.arc(sx + 15, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = this._liveConnected ? '#16a34a' : '#9ca3af';
    ctx.fill();
    ctx.fillStyle = '#6b7280';
    ctx.fillText(this._liveConnected ? '实时已连接' : '实时未连接', sx + 42, y);
    ctx.restore();
    ctx.textBaseline = 'top';
  },

  /** 圆角矩形路径（小程序 2d 上下文没有 roundRect，自己拼） */
  roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  },

  /** 按 path 的 d + 变换矩阵描一条线 */
  strokePath(ctx, shape, color, width, dash, dashOffset) {
    const m = shape.m || [1, 0, 0, 1, 0, 0];
    const nums = String(shape.d || '').match(/-?\d+\.?\d*(?:e-?\d+)?/g);
    if (!nums || nums.length < 4) return;
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dash) {
      ctx.setLineDash(dash);
      ctx.lineDashOffset = dashOffset || 0;
    }
    ctx.beginPath();
    // 布局里的 path 都是直线段（M…L…），两两取坐标即可
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  },

});
