/**
 * export-config-sheet —— 导出设置弹层（小计层级 / 板块开关），网页版 ExportConfigDialog 的小程序版。
 *
 * 自包含：给 URL 和参数即可，组件自己拉摘要、自己导出、自己保存并打开文件；父页面只负责传参和收事件。
 * 参数契约与后端一致（排除法）：
 *   levels        要保留的小计层级，逗号子集；省略 = 全保留；哨兵 none = 都不保留
 *   excludeBlocks 不要小计的板块 key，逗号分隔
 *
 * 用法：
 *   <export-config-sheet
 *     show="{{ cfgShow }}"
 *     summary-url="/api/xxx/export/summary"
 *     export-url="/api/xxx/export"
 *     params="{{ cfgParams }}"
 *     fallback-name="申领审计.xlsx"
 *     bind:close="onCfgClose" bind:done="onCfgDone" />
 */
const springAuth = require('../../utils/springAuth.js');

function buildQuery(params) {
  const src = params || {};
  const keys = Object.keys(src).filter((k) => {
    const v = src[k];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
  if (!keys.length) return '';
  return `?${keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(src[k]).trim())}`).join('&')}`;
}

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body: body.data };
}

Component({
  properties: {
    show: { type: Boolean, value: false },
    /** 摘要端点（含 /api 前缀） */
    summaryUrl: { type: String, value: '' },
    /** 导出端点（含 /api 前缀） */
    exportUrl: { type: String, value: '' },
    /** 与列表筛选同源的参数 */
    params: { type: Object, value: {} },
    /** 服务端没给文件名时用的兜底名 */
    fallbackName: { type: String, value: '导出.xlsx' },
    title: { type: String, value: '导出设置' },
    /**
     * **额外筛选开关**（网页版 ExportConfigDialog 的 extraFilter 同款），形如
     * `[{key:'currentCycleOnly', label:'只导本周期订单（不含预约单）', defaultOn:true}]`。
     * 勾上的会作为 `key=true` 并进导出查询 —— 它**只作用于导出**，不动列表筛选。
     */
    extraOptions: { type: Array, value: [] },
  },

  data: {
    loading: false,
    exporting: false,
    levels: [],
    blocks: [],
    meta: '',
    /** 额外开关的当前值：key → 是否勾上 */
    extraOn: {},
  },

  observers: {
    show(v) {
      if (!v) return;
      // 每次打开都回到默认值 —— 关掉弹层再打开时不该还留着上一次的临时改动
      const on = {};
      (this.properties.extraOptions || []).forEach((o) => {
        if (o && o.key) on[o.key] = !!o.defaultOn;
      });
      this.setData({ extraOn: on });
      this.loadSummary();
    },
  },

  methods: {
    async loadSummary() {
      const url = this.data.summaryUrl;
      if (!url) return;
      this.setData({ loading: true, levels: [], blocks: [], meta: '' });
      try {
        const res = await springAuth.springRequest({ url: url + buildQuery(this.data.params), method: 'GET' });
        const p = parseResponse(res);
        if (!p.ok) {
          wx.showToast({ title: p.message, icon: 'none' });
          this.triggerEvent('close');
          return;
        }
        const body = p.body || {};
        const labels = body.levelLabels || {};
        const totals = body.totals || {};
        const st = totals.subtotals || {};
        this.setData({
          levels: (body.levels || []).map((lv) => ({ key: lv, label: labels[lv] || lv, on: true })),
          blocks: (body.blocks || []).map((b) => ({
            key: b.key,
            label: b.label,
            on: true,
            sub: `明细 ${b.detailCount || 0} 行 · 小计 ${(b.subtotalCounts && (b.subtotalCounts.lv1 + b.subtotalCounts.lv2 + b.subtotalCounts.lv3)) || 0} 条`,
          })),
          meta: `${totals.blocks || 0} 个板块 · ${totals.detailRows || 0} 行明细 · 小计 ${(st.lv1 || 0) + (st.lv2 || 0) + (st.lv3 || 0)} 条`,
          loading: false,
        });
      } catch (e) {
        this.setData({ loading: false });
        wx.showToast({ title: (e && e.message) || '加载导出配置失败', icon: 'none' });
        this.triggerEvent('close');
      }
    },

    onLevelToggle(e) {
      const key = String(e.currentTarget.dataset.key || '');
      this.setData({ levels: this.data.levels.map((x) => (x.key === key ? { ...x, on: !!(e.detail && e.detail.value) } : x)) });
    },

    onBlockToggle(e) {
      const key = String(e.currentTarget.dataset.key || '');
      this.setData({ blocks: this.data.blocks.map((x) => (x.key === key ? { ...x, on: !!(e.detail && e.detail.value) } : x)) });
    },

    /** 勾选 → 后端参数（排除法） */
    buildConfig() {
      const levels = this.data.levels || [];
      const blocks = this.data.blocks || [];
      const keep = levels.filter((x) => x.on).map((x) => x.key);
      const offAll = levels.length > 0 && keep.length === 0;
      return {
        levels: offAll ? 'none' : keep.length === levels.length ? '' : keep.join(','),
        excludeBlocks: blocks.filter((x) => !x.on).map((x) => x.key).join(','),
      };
    },

    onClose() {
      if (this.data.exporting) return;
      this.triggerEvent('close');
    },

    /** 额外开关（如「只导本周期订单（不含预约单）」） */
    onExtraToggle(e) {
      const key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key;
      if (!key) return;
      const on = { ...(this.data.extraOn || {}) };
      on[key] = !!(e && e.detail);
      this.setData({ extraOn: on });
    },

    onNoop() {},

    async onConfirm() {
      if (this.data.exporting) return;
      this.setData({ exporting: true });
      wx.showLoading({ title: '导出中…', mask: true });
      try {
        const cfg = this.buildConfig();
        const q = { ...(this.data.params || {}) };
        if (cfg.levels) q.levels = cfg.levels;
        if (cfg.excludeBlocks) q.excludeBlocks = cfg.excludeBlocks;
        // 勾上的额外开关作为 key=true 并进查询（只作用导出）
        Object.keys(this.data.extraOn || {}).forEach((k) => {
          if (this.data.extraOn[k]) q[k] = 'true';
        });
        const res = await springAuth.springRequestBinary(this.data.exportUrl + buildQuery(q), {
          errorMessage: '导出失败',
          forbiddenMessage: '无权限导出',
        });
        const name = springAuth.parseContentDispositionFilename(res.contentDisposition) || this.data.fallbackName;
        await springAuth.saveAndOpenDocument(res.data, name, 'xlsx');
        this.setData({ exporting: false });
        this.triggerEvent('done');
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '导出失败', icon: 'none' });
        this.setData({ exporting: false });
      } finally {
        wx.hideLoading();
      }
    },
  },
});
