/**
 * 电子签名手写页（整屏，只有 返回 / 重试 / 提交）。
 *
 * **不动设备朝向**：不声明 pageOrientation、也不判断横竖屏。操作条整层转 90°，
 * 写区顺着手机长边铺 —— 用户把手机横过来，写区天然就是一块 8:3 的横条。
 *
 * 为什么不把写区也一起转：**canvas 不跟随祖先的 CSS transform**（实测：在白板转了 90° 的层里，
 * 画到本地左上角的点出现在屏幕左上而不是右上）。所以转的是人、不是画布 —— 画布留在没被转的那一层。
 *
 * 口径照抄网页端 `SignatureFullscreenPad`：
 * - 写区恒为 **8:3**（{@link CANVAS} 800×300，横过来看），导出按同一比例，不会变形；
 * - 白底、PNG dataUrl —— 后端 personnel_signature.image_data 就是这个契约，直接照传，不用改接口。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

/** 签名画布规范：固定 800×300、白底、PNG（与前端 signatureData.ts 同一份口径） */
const CANVAS = { width: 800, height: 300 };
const RATIO = CANVAS.width / CANVAS.height;
const LINE_WIDTH = 3;
const PEN_COLOR = '#1f2937';
/** 本页路由（看门狗要用它判断自己有没有走掉） */
const PAGE_ROUTE = 'package-feature/pages/signaturePad/index';

/** 操作条在屏幕上的厚度 */
const CHROME = 64;
/** 写区四周留白 */
const GUTTER = 8;
/** 空白态提示（画在画布里，字要转 90°） */
const HINT_TEXT = '在这里签名';
const HINT_COLOR = '#c8c9cc';
const HINT_FONT = '13px sans-serif';

Page({
  data: {
    rotorW: 0,
    rotorH: 0,
    shift: 0,
    chrome: CHROME,
    boxW: 0,
    boxH: 0,
    padLeft: 0,
    padTop: 0,
    outW: CANVAS.width,
    outH: CANVAS.height,
    dirty: false,
    submitting: false,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'MEMBER')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._denied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this._drawing = false;
    this._canvas = null;
    this._ctx = null;
    this._out = null;
    this._rect = null;

    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    // app.json 全局锁 portrait，所以「高 = 长边」恒成立，不做任何朝向判断
    const rotorW = win.windowHeight;
    const rotorH = win.windowWidth;

    // 写区横过来看要是 8:3，并且在**整屏**居中：两侧各让出「操作条厚度 + 留白」，
    // 条那侧是实占、另一侧是等宽空边，这样写区才是屏幕正中的一张卡，不是偏在右半边。
    let boxW = Math.max(120, rotorH - (CHROME + GUTTER) * 2);
    let boxH = Math.round(boxW * RATIO);
    const maxH = rotorW - GUTTER * 2;
    if (boxH > maxH) {
      boxH = maxH;
      boxW = Math.round(boxH / RATIO);
    }
    const padLeft = Math.max(CHROME + GUTTER, Math.round((rotorH - boxW) / 2));
    const padTop = Math.max(GUTTER, Math.round((rotorW - boxH) / 2));

    this.setData({
      rotorW: rotorW,
      rotorH: rotorH,
      shift: rotorH,
      boxW: boxW,
      boxH: boxH,
      padLeft: padLeft,
      padTop: padTop,
    });
  },

  onReady() {
    if (this._denied) return;
    this.initCanvas();
  },

  onUnload() {
    this._canvas = null;
    this._ctx = null;
    this._out = null;
  },

  initCanvas() {
    const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2) || 2;
    wx.createSelectorQuery()
      .select('#sigPad')
      // 只取 node：fields({size:true}) 在变换层里给的是变换后的尺寸，尺寸一律用上面算好的
      .fields({ node: true })
      .select('#sigOut')
      .fields({ node: true })
      .exec((res) => {
        const pad = res && res[0];
        const out = res && res[1];
        if (!pad || !pad.node || !out || !out.node) return;

        const canvas = pad.node;
        canvas.width = Math.round(this.data.boxW * dpr);
        canvas.height = Math.round(this.data.boxH * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = PEN_COLOR;
        this._canvas = canvas;
        this._ctx = ctx;
        this.paintIdle();

        // 出件画布：1:1 的 800×300，不受 dpr 影响（要的就是这个像素尺寸）
        const off = out.node;
        off.width = CANVAS.width;
        off.height = CANVAS.height;
        this._out = off;

        this.cacheRect();
      });
  },

  /** 只铺白底：签名要贴进文档，透明底会变成黑块 */
  fillWhite() {
    const ctx = this._ctx;
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.data.boxW, this.data.boxH);
  },

  /**
   * 空白态：白底 + 「在这里签名」。
   * 提示画进画布而不是放个浮层 —— 浮层会被 canvas 盖住，实测一个像素都画不出来。
   * 字要转 90°：写区在手机上是竖着的，不转就跟按钮条不是一个方向。
   */
  paintIdle() {
    const ctx = this._ctx;
    if (!ctx) return;
    this.fillWhite();
    ctx.save();
    ctx.translate(this.data.boxW / 2, this.data.boxH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = HINT_COLOR;
    ctx.font = HINT_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(HINT_TEXT, 0, 0);
    ctx.restore();
    ctx.fillStyle = PEN_COLOR;
  },

  /** 缓存写区在屏幕上的位置。写区没被转过，所以就是普通的左上角坐标 */
  cacheRect() {
    wx.createSelectorQuery()
      .select('#sigPad')
      .boundingClientRect((r) => {
        this._rect = r || null;
      })
      .exec();
  },

  /** 触点 → 写区本地坐标（写区没转，直接减左上角即可） */
  pointOf(e) {
    const t = e.touches && e.touches[0];
    if (!t) return null;
    if (!this._rect) {
      this.cacheRect();
      return null;
    }
    return { x: t.clientX - this._rect.left, y: t.clientY - this._rect.top };
  },

  onTouchStart(e) {
    const ctx = this._ctx;
    const p = this.pointOf(e);
    if (!ctx || !p) return;
    // 第一笔之前先把「在这里签名」擦掉，别让它跟笔迹混在一起
    if (!this.data.dirty) {
      this.fillWhite();
      this.setData({ dirty: true });
    }
    this._drawing = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y); // 点一下也留个圆点
    ctx.stroke();
  },

  onTouchMove(e) {
    const ctx = this._ctx;
    if (!this._drawing || !ctx) return;
    const p = this.pointOf(e);
    if (!p) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  },

  onTouchEnd() {
    this._drawing = false;
  },

  onRetry() {
    if (this.data.submitting || !this._ctx) return;
    this.paintIdle();
    this.setData({ dirty: false });
  },

  /**
   * 导出 800×300 PNG dataUrl。
   * 写区在手机上是竖着的（横过来看才正），所以要转 90° 再放进 800×300。
   *
   * 分两步：先把写区出成临时 PNG，再以 Image 贴进出件画布。
   * 不直接把写区的 canvas 节点当 drawImage 的图源 —— 实测那样贴出来是空白。
   */
  exportPng() {
    return new Promise((resolve, reject) => {
      const off = this._out;
      const main = this._canvas;
      if (!off || !main) {
        reject(new Error('导出签名失败'));
        return;
      }
      const done = () => {
        wx.canvasToTempFilePath({
          canvas: off,
          fileType: 'png',
          destWidth: CANVAS.width,
          destHeight: CANVAS.height,
          success: (res) => {
            try {
              const b64 = wx.getFileSystemManager().readFileSync(res.tempFilePath, 'base64');
              resolve('data:image/png;base64,' + b64);
            } catch (err) {
              reject(new Error('导出签名失败'));
            }
          },
          fail: () => reject(new Error('导出签名失败')),
        });
      };
      const paint = (img) => {
        const octx = off.getContext('2d');
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, CANVAS.width, CANVAS.height);
        // 转 -90°：本地点 (x,y) → 出件点 (y, CANVAS.height - x)，正好铺满 800×300。
        // 方向跟「用户把手机哪边转下去」绑死：现在这版对应**手机逆时针转**
        // （手机顶边转到人左边）。若换成顺时针转着写，签名会上下颠倒，
        // 那时把 translate/rotate 换成 `translate(CANVAS.width, 0); rotate(Math.PI / 2)` 即可。
        octx.save();
        octx.translate(0, CANVAS.height);
        octx.rotate(-Math.PI / 2);
        octx.drawImage(img, 0, 0, img.width, img.height, 0, 0, CANVAS.height, CANVAS.width);
        octx.restore();
        done();
      };
      wx.canvasToTempFilePath({
        canvas: main,
        fileType: 'png',
        success: (res) => {
          const img = off.createImage();
          img.onload = () => paint(img);
          img.onerror = () => reject(new Error('导出签名失败'));
          img.src = res.tempFilePath;
        },
        fail: () => reject(new Error('导出签名失败')),
      });
    });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.dirty) {
      wx.showToast({ title: '请先签名', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });
    try {
      const imageData = await this.exportPng();
      const r = await springAuth.springRequest({
        url: '/api/student/signature',
        method: 'POST',
        data: { imageData: imageData, source: 'MINI' },
      });
      const body = (r && r.data) || {};
      // 写请求必须看 success：HTTP 200 + success:false 也是失败
      if (!body.success) throw new Error(body.message || '提交失败');
      wx.hideLoading();
      wx.showToast({ title: '签名已提交', icon: 'success' });
      this.leave(900);
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
      // 签名**不可更改**，服务端已有签名就是终局态：再重试也没用，
      // 与其把人晾在这一页白写一场，不如退回「我的」——那边会给他看已签的那份
      this.leaveIfAlreadySigned();
    }
  },

  /**
   * 离开本页。
   *
   * 页面栈里没有上一页时（比如被别处 reLaunch 顶过）navigateBack 会失败，
   * 而且是**静默**失败 —— 那时按钮会永远停在「提交中…」，人就被锁死在页面上。
   * 所以兜底两路：navigateBack → reLaunch 回「我的」；再补一个看门狗，
   * 万一还没走掉就把 submitting 松开并强制重开，总之不能把人留在这页。
   */
  leave(delay) {
    setTimeout(() => {
      wx.navigateBack({
        delta: 1,
        fail: () => wx.reLaunch({ url: '/pages/mine/index' }),
      });
      setTimeout(() => {
        const pages = getCurrentPages();
        const top = pages[pages.length - 1];
        if (top && top.route === PAGE_ROUTE) {
          if (this.data.submitting) this.setData({ submitting: false });
          wx.reLaunch({ url: '/pages/mine/index' });
        }
      }, 600);
    }, delay || 0);
  },

  /** 只在服务端确实已有签名时才退：查不到就留在本页，让用户能重试 */
  leaveIfAlreadySigned() {
    springAuth
      .springRequest({ url: '/api/student/signature', method: 'GET', data: {} })
      .then((r) => {
        const body = (r && r.data) || {};
        const sig = body.success ? body.data : null;
        if (sig && sig.hasSignature) this.leave(1600);
      })
      .catch(() => {});
  },

  onBack() {
    if (this.data.submitting) return;
    // 已经落笔了就先问一句，别让人白写一场
    if (this.data.dirty) {
      wx.showModal({
        title: '放弃签名',
        content: '返回将丢弃这笔签名，确定吗？',
        confirmText: '放弃',
        confirmColor: '#ee0a24',
        success: (res) => {
          if (res.confirm) wx.navigateBack({ delta: 1 });
        },
      });
      return;
    }
    wx.navigateBack({ delta: 1 });
  },
});
