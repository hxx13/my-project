/**
 * 门禁成功刷卡规则（Web 端 /#/console/admin/door-swipe-rules 的同构页，四个 tab 全覆盖）。
 *
 * records  门禁记录：受控通道内成功刷卡（openType=51）的明细
 * rules    规则配置：连刷 N 次常开 M 秒的规则增删改 + 启停
 * channels 通道受控：总闸。只有本列表里且已启用的通道才会入库并参与触发
 * logs     操作记录：规则触发与配置变更的审计
 *
 * 后端整页要求 PLATFORM_OWNER（见 DoorSwipeRuleController.requireAdmin），
 * 与本页入口门控同一档，别按 ADMIN 放进来。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { shouldRefreshOnShow } = require('../../../utils/pageShowRefresh.js');
const doorControlApi = require('../../utils/doorControlApi.js');

const MIN_ROLE = 'PLATFORM_OWNER';
const PAGE_PATH = '/package-door/pages/doorSwipeRules/index';
const API = '/api/admin/door-swipe-rule';
const PAGE_SIZE = 20;

const OPEN_TYPES = [
  { value: '', label: '全部' },
  { value: 48, label: '远程开门' },
  { value: 49, label: '按钮开门' },
  { value: 51, label: '合法刷卡' },
  { value: 52, label: '非法刷卡' },
];

const SCOPE_TYPES = [
  { value: 'ALL', label: '全部人员', hint: '不限制人员范围，命中受控通道即计数。' },
  { value: 'PERSON', label: '指定人员', hint: '按大华人员编码精确匹配，命中其一即算，不依赖本地人员绑定。' },
  { value: 'DEPARTMENT', label: '指定部门', hint: '按大华部门 ID 精确匹配，命中其一即算，不依赖本地部门映射。' },
  { value: 'CARD', label: '指定卡片', hint: '按卡号精确匹配，多张卡片命中其一即算。' },
];

function parseResponse(res) {
  const { statusCode, data } = res || {};
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || '请求失败' };
  }
  return { ok: true, body };
}

/** 后端 scopeValues / channelCodes 都是 JSON 字符串数组 */
function parseArr(value) {
  if (!value) return [];
  try {
    const a = JSON.parse(value);
    return Array.isArray(a) ? a.map((x) => String(x)) : [];
  } catch (e) {
    return [];
  }
}

/** 多行文本 → 数组：换行 / 逗号 / 空白都算分隔 */
function splitMulti(text) {
  return String(text || '')
    .split(/[\n,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 日期选择器给的是 YYYY-MM-DD，补成 MySQL 能直接比的时间串 */
function dayStart(d) {
  return d ? `${d} 00:00:00` : '';
}
function dayEnd(d) {
  return d ? `${d} 23:59:59` : '';
}

function scopeLabel(v) {
  const hit = SCOPE_TYPES.find((s) => s.value === v);
  return hit ? hit.label : v || '全部';
}

function openTypeLabel(v) {
  const hit = OPEN_TYPES.find((o) => String(o.value) === String(v));
  return hit ? hit.label : String(v);
}

Page({
  data: {
    tab: 'records',
    tabs: [
      { key: 'records', label: '门禁记录' },
      { key: 'rules', label: '规则配置' },
      { key: 'channels', label: '通道受控' },
      { key: 'logs', label: '操作记录' },
    ],

    // ── Tab1 门禁记录 ──
    openTypeOptions: OPEN_TYPES.map((o) => o.label),
    recChannelCode: '',
    recPersonName: '',
    recOpenTypeIdx: 0,
    recStartDate: '',
    recEndDate: '',
    recRows: [],
    recTotal: 0,
    recPage: 1,
    recHasMore: true,
    recLoading: false,
    recMore: false,

    // ── Tab2 规则配置 ──
    rules: [],
    rulesLoading: false,
    showRuleForm: false,
    ruleEditingId: 0,
    ruleFormTitle: '',
    scopeTypeOptions: SCOPE_TYPES.map((s) => s.label),
    scopeTypeIdx: 0,
    scopeHint: SCOPE_TYPES[0].hint,
    ruleName: '',
    ruleScopeText: '',
    ruleChannelCodes: [],   // 表单已选通道 code
    ruleChannelText: '',
    ruleThresholdCount: '5',
    ruleThresholdWindowSec: '60',
    ruleStayOpenDurationSec: '120',
    ruleCooldownSec: '300',
    ruleSaving: false,

    // ── Tab3 通道受控 ──
    channelRows: [],
    channelsLoading: false,
    channelsSaving: false,
    channelPickedCodes: [],
    channelPickedText: '',

    // ── Tab4 操作记录 ──
    logRows: [],
    logTotal: 0,
    logPage: 1,
    logHasMore: true,
    logLoading: false,
    logMore: false,

    // ── 通道多选弹窗（规则表单 / 通道受控 共用） ──
    chPickOpen: false,
    chPickMode: '',          // 'rule' | 'replace'
    chPickKeyword: '',
    chPickRows: [],
    chPickLoading: false,
    chPickCount: 0,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, MIN_ROLE)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, PAGE_PATH, role, MIN_ROLE)) return;
    // 通道字典是规则表单与通道受控共用的底料，进页面就备好，供保存时补通道名
    if (!this._channelIndex) this._channelIndex = {};
    if (!shouldRefreshOnShow(this, { sceneKey: role || '', ttlMs: 15000 })) return;
    this.loadTab({ reset: true });
  },

  onPullDownRefresh() {
    Promise.resolve(this.loadTab({ reset: true })).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    const tab = this.data.tab;
    if (tab === 'records') this.loadRecords({ append: true });
    else if (tab === 'logs') this.loadLogs({ append: true });
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.tab) return;
    this.setData({ tab: key });
    this.loadTab({ reset: true });
  },

  loadTab(opts) {
    const tab = this.data.tab;
    if (tab === 'records') return this.loadRecords(opts);
    if (tab === 'rules') return this.loadRules();
    if (tab === 'channels') return this.loadChannels();
    return this.loadLogs(opts);
  },

  // ══════════════ Tab1 门禁记录 ══════════════

  onRecInput(e) {
    const field = e.currentTarget.dataset.field;
    const v = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this.setData({ [field]: v });
  },

  onRecOpenTypeChange(e) {
    this.setData({ recOpenTypeIdx: Number(e.detail.value) || 0 });
  },

  onRecDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value || '' });
  },

  onRecSearch() {
    this.loadRecords({ reset: true });
  },

  onRecReset() {
    this.setData({
      recChannelCode: '',
      recPersonName: '',
      recOpenTypeIdx: 0,
      recStartDate: '',
      recEndDate: '',
    });
    this.loadRecords({ reset: true });
  },

  async loadRecords(opts) {
    const o = opts || {};
    const reset = !!o.reset;
    const append = !!o.append;
    if (this.data.recLoading || this.data.recMore) return;
    if (append && !this.data.recHasMore) return;
    const page = reset ? 1 : append ? this.data.recPage + 1 : this.data.recPage;
    if (reset) this.setData({ recLoading: true });
    else if (append) this.setData({ recMore: true });
    try {
      // 后端契约是 pageSize；人员筛选参数名是 person（Web 端发的 personName/size 会被静默忽略）
      const data = { page, pageSize: PAGE_SIZE };
      if (this.data.recChannelCode.trim()) data.channelCode = this.data.recChannelCode.trim();
      if (this.data.recPersonName.trim()) data.person = this.data.recPersonName.trim();
      const ot = OPEN_TYPES[this.data.recOpenTypeIdx];
      if (ot && ot.value !== '') data.openType = ot.value;
      if (this.data.recStartDate) data.startTime = dayStart(this.data.recStartDate);
      if (this.data.recEndDate) data.endTime = dayEnd(this.data.recEndDate);
      const res = await springAuth.springRequest({ url: `${API}/records`, method: 'GET', data });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const payload = parsed.body.data || {};
      const list = (payload.list || []).map((r) => ({
        ...r,
        _openTypeLabel: openTypeLabel(r.openType),
        _dirLabel: r.enterOrExit === 1 ? '进门' : r.enterOrExit === 2 ? '出门' : '-',
        _time: r.swingTime || r.createTime || '-',
        _channel: r.channelName || r.channelCode || '-',
        _person: r.personName || r.personCode || '-',
      }));
      const rows = reset ? list : this.data.recRows.concat(list);
      const total = Number(payload.total || 0);
      this.setData({ recRows: rows, recTotal: total, recPage: page, recHasMore: rows.length < total });
    } catch (err) {
      if (reset) this.setData({ recRows: [], recTotal: 0 });
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 20) : '加载失败', icon: 'none' });
    } finally {
      this.setData({ recLoading: false, recMore: false });
    }
  },

  // ══════════════ Tab2 规则配置 ══════════════

  async loadRules() {
    if (this.data.rulesLoading) return;
    this.setData({ rulesLoading: true });
    try {
      const res = await springAuth.springRequest({ url: `${API}/rules`, method: 'GET', data: {} });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const list = (parsed.body.data || []).map((r) => ({
        ...r,
        _channelCount: parseArr(r.channelCodes).length,
        _scopeLabel: scopeLabel(r.scopeType),
        _scopeCount: parseArr(r.scopeValues).length,
      }));
      this.setData({ rules: list });
    } catch (err) {
      this.setData({ rules: [] });
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 20) : '加载失败', icon: 'none' });
    } finally {
      this.setData({ rulesLoading: false });
    }
  },

  onOpenRuleForm(e) {
    const id = Number(e.currentTarget.dataset.id || 0);
    const r = id ? (this.data.rules || []).find((x) => x.id === id) : null;
    const scopeIdx = r ? Math.max(0, SCOPE_TYPES.findIndex((s) => s.value === (r.scopeType || 'ALL'))) : 0;
    const codes = r ? parseArr(r.channelCodes) : [];
    this.setData({
      showRuleForm: true,
      ruleEditingId: r ? r.id : 0,
      ruleFormTitle: r ? `编辑：${r.name}` : '新增成功刷卡规则',
      ruleName: r ? r.name : '',
      scopeTypeIdx: scopeIdx,
      scopeHint: SCOPE_TYPES[scopeIdx].hint,
      ruleScopeText: r ? parseArr(r.scopeValues).join('\n') : '',
      ruleChannelCodes: codes,
      ruleChannelText: codes.length ? `已选 ${codes.length} 个通道` : '未选择通道',
      ruleThresholdCount: String(r ? r.thresholdCount : 5),
      ruleThresholdWindowSec: String(r ? r.thresholdWindowSec : 60),
      ruleStayOpenDurationSec: String(r ? r.stayOpenDurationSec : 120),
      ruleCooldownSec: String(r ? r.cooldownSec : 300),
      ruleSaving: false,
    });
  },

  onCloseRuleForm() {
    if (this.data.ruleSaving) return;
    this.setData({ showRuleForm: false, ruleEditingId: 0 });
  },

  onRuleInput(e) {
    const field = e.currentTarget.dataset.field;
    const v = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this.setData({ [field]: v });
  },

  onRuleScopeChange(e) {
    const idx = Number(e.detail.value) || 0;
    this.setData({ scopeTypeIdx: idx, scopeHint: SCOPE_TYPES[idx].hint });
  },

  onRulePickChannels() {
    this.openChannelPicker('rule', this.data.ruleChannelCodes);
  },

  async onSaveRule() {
    if (this.data.ruleSaving) return;
    const name = (this.data.ruleName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入规则名称', icon: 'none' });
      return;
    }
    const codes = this.data.ruleChannelCodes || [];
    if (codes.length === 0) {
      wx.showToast({ title: '请选择至少一个通道', icon: 'none' });
      return;
    }
    const scopeType = SCOPE_TYPES[this.data.scopeTypeIdx].value;
    const scopeValues = scopeType === 'ALL' ? '[]' : JSON.stringify(splitMulti(this.data.ruleScopeText));
    const num = (v, min, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min ? n : fallback;
    };
    const editing = (this.data.rules || []).find((x) => x.id === this.data.ruleEditingId);
    const body = {
      name,
      enabled: editing ? !!editing.enabled : true,
      channelCodes: JSON.stringify(codes),
      scopeType,
      scopeValues,
      thresholdCount: num(this.data.ruleThresholdCount, 1, 1),
      thresholdWindowSec: num(this.data.ruleThresholdWindowSec, 1, 1),
      stayOpenDurationSec: num(this.data.ruleStayOpenDurationSec, 1, 1),
      cooldownSec: num(this.data.ruleCooldownSec, 0, 0),
    };
    this.setData({ ruleSaving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const url = this.data.ruleEditingId ? `${API}/rules/${this.data.ruleEditingId}` : `${API}/rules`;
      const res = await springAuth.springRequest({
        url,
        method: this.data.ruleEditingId ? 'PUT' : 'POST',
        data: body,
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: this.data.ruleEditingId ? '规则已更新' : '规则已创建', icon: 'success' });
      this.setData({ showRuleForm: false, ruleEditingId: 0, ruleSaving: false });
      this.loadRules();
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
      this.setData({ ruleSaving: false });
    } finally {
      wx.hideLoading();
    }
  },

  onToggleRule(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || this._busy) return;
    this._busy = true;
    springAuth
      .springRequest({ url: `${API}/rules/${id}/toggle`, method: 'PATCH', data: {} })
      .then((res) => {
        const parsed = parseResponse(res);
        if (!parsed.ok) throw new Error(parsed.message);
        const updated = parsed.body.data || {};
        const rules = this.data.rules.map((x) => (x.id === id ? { ...x, enabled: !!updated.enabled } : x));
        this.setData({ rules });
      })
      .catch((err) => {
        wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '切换失败', icon: 'none' });
      })
      .then(() => {
        this._busy = false;
      });
  },

  onDeleteRule(e) {
    const id = Number(e.currentTarget.dataset.id);
    const r = (this.data.rules || []).find((x) => x.id === id);
    if (!id || this._busy) return;
    wx.showModal({
      title: '删除规则',
      content: `确定删除规则「${r ? r.name : id}」？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#b91c1c',
      success: async (res) => {
        if (!res.confirm) return;
        this._busy = true;
        wx.showLoading({ title: '删除中…', mask: true });
        try {
          const resp = await springAuth.springRequest({ url: `${API}/rules/${id}`, method: 'DELETE', data: {} });
          const parsed = parseResponse(resp);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ rules: this.data.rules.filter((x) => x.id !== id) });
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this._busy = false;
        }
      },
    });
  },

  // ══════════════ Tab3 通道受控 ══════════════

  async loadChannels() {
    if (this.data.channelsLoading) return;
    this.setData({ channelsLoading: true });
    try {
      const res = await springAuth.springRequest({ url: `${API}/channels`, method: 'GET', data: {} });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const list = parsed.body.data || [];
      // 已有受控通道回填进索引，后面「批量替换」补名字时不用再翻页扫全量
      list.forEach((c) => {
        const code = String(c.channelCode || '').trim();
        if (code) this._channelIndex[code] = (c.channelName || '').trim() || code;
      });
      const codes = list.map((c) => String(c.channelCode || '').trim()).filter(Boolean);
      this.setData({
        channelRows: list,
        channelPickedCodes: codes,
        channelPickedText: codes.length ? `已选 ${codes.length} 个通道` : '未选择通道',
      });
    } catch (err) {
      this.setData({ channelRows: [] });
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 20) : '加载失败', icon: 'none' });
    } finally {
      this.setData({ channelsLoading: false });
    }
  },

  onOpenChannelScopePicker() {
    this.openChannelPicker('replace', this.data.channelPickedCodes);
  },

  onToggleChannel(e) {
    const code = e.currentTarget.dataset.code;
    if (!code || this._busy) return;
    this._busy = true;
    springAuth
      .springRequest({ url: `${API}/channels/${encodeURIComponent(code)}/toggle`, method: 'PATCH', data: {} })
      .then((res) => {
        const parsed = parseResponse(res);
        if (!parsed.ok) throw new Error(parsed.message);
        const updated = parsed.body.data || {};
        const channelRows = this.data.channelRows.map((c) =>
          String(c.channelCode) === String(code) ? { ...c, enabled: !!updated.enabled } : c
        );
        this.setData({ channelRows });
      })
      .catch((err) => {
        wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '切换失败', icon: 'none' });
      })
      .then(() => {
        this._busy = false;
      });
  },

  onReplaceChannels() {
    const codes = this.data.channelPickedCodes || [];
    if (this.data.channelsSaving) return;
    wx.showModal({
      title: '批量替换受控通道',
      content: codes.length
        ? `把受控通道整表替换为这 ${codes.length} 个？不在列表里的通道将不再写入成功刷卡记录。`
        : '改成空列表？之后将没有任何通道受控，规则不再触发。',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ channelsSaving: true });
        wx.showLoading({ title: '保存中…', mask: true });
        try {
          const body = codes.map((code) => ({ channelCode: code, channelName: this._channelIndex[code] || code }));
          const resp = await springAuth.springRequest({
            url: `${API}/channels/replace`,
            method: 'PUT',
            data: body,
          });
          const parsed = parseResponse(resp);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '受控通道已更新', icon: 'success' });
          this.loadChannels();
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ channelsSaving: false });
        }
      },
    });
  },

  // ══════════════ 通道多选弹窗（两处共用） ══════════════

  openChannelPicker(mode, preselected) {
    if (!this._channelIndex) this._channelIndex = {};
    const picked = {};
    (preselected || []).forEach((code) => {
      const c = String(code || '').trim();
      if (c) picked[c] = true;
    });
    this._chPicked = picked;
    this.setData({
      chPickOpen: true,
      chPickMode: mode,
      chPickKeyword: '',
      chPickRows: [],
      chPickCount: Object.keys(picked).length,
    });
    this.paintChPicker();
  },

  onCloseChPicker() {
    if (this._chTimer) clearTimeout(this._chTimer);
    this._chSeq = (this._chSeq || 0) + 1;
    this.setData({ chPickOpen: false, chPickRows: [], chPickKeyword: '' });
  },

  onChPickInput(e) {
    this.setData({ chPickKeyword: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
    this.paintChPicker();
  },

  clearChPickKeyword() {
    this.setData({ chPickKeyword: '' });
    this.paintChPicker();
  },

  /** 远程搜索门禁通道；空关键字先出一屏。索引随手累积，保存时用来补通道名 */
  paintChPicker() {
    const kw = (this.data.chPickKeyword || '').trim();
    if (this._chTimer) clearTimeout(this._chTimer);
    const seq = (this._chSeq = (this._chSeq || 0) + 1);
    this.setData({ chPickLoading: true });
    this._chTimer = setTimeout(() => {
      doorControlApi
        .fetchChannels({ page: 1, pageSize: 50, keyword: kw })
        .then((payload) => {
          if (seq !== this._chSeq || !this.data.chPickOpen) return;
          const list = (payload && payload.list) || [];
          const rows = list
            .map((r) => {
              const code = String(r.channelCode || '').trim();
              const name = String(r.channelName || '').trim();
              if (code) this._channelIndex[code] = name || code;
              return { code, label: name || `未命名 / ${code}`, selected: !!this._chPicked[code] };
            })
            .filter((r) => r.code);
          this.setData({ chPickRows: rows, chPickLoading: false });
        })
        .catch(() => {
          if (seq === this._chSeq) this.setData({ chPickRows: [], chPickLoading: false });
        });
    }, kw ? 300 : 0);
  },

  onChPickToggle(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const row = (this.data.chPickRows || [])[idx];
    if (!row) return;
    const on = !row.selected;
    if (on) this._chPicked[row.code] = true;
    else delete this._chPicked[row.code];
    this.setData({
      [`chPickRows[${idx}].selected`]: on,
      chPickCount: Object.keys(this._chPicked || {}).length,
    });
  },

  onConfirmChPicker() {
    const codes = Object.keys(this._chPicked || {});
    const mode = this.data.chPickMode;
    this.onCloseChPicker();
    if (mode === 'rule') {
      this.setData({
        ruleChannelCodes: codes,
        ruleChannelText: codes.length ? `已选 ${codes.length} 个通道` : '未选择通道',
      });
    } else {
      this.setData({
        channelPickedCodes: codes,
        channelPickedText: codes.length ? `已选 ${codes.length} 个通道` : '未选择通道',
      });
    }
  },

  // ══════════════ Tab4 操作记录 ══════════════

  async loadLogs(opts) {
    const o = opts || {};
    const reset = !!o.reset;
    const append = !!o.append;
    if (this.data.logLoading || this.data.logMore) return;
    if (append && !this.data.logHasMore) return;
    const page = reset ? 1 : append ? this.data.logPage + 1 : this.data.logPage;
    if (reset) this.setData({ logLoading: true });
    else if (append) this.setData({ logMore: true });
    try {
      const res = await springAuth.springRequest({
        url: `${API}/operation-logs`,
        method: 'GET',
        data: { page, pageSize: PAGE_SIZE },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const payload = parsed.body.data || {};
      const list = (payload.list || []).map((r) => ({
        ...r,
        _time: r.eventTime || r.createdAt || '-',
        _event: r.eventKey || r.automationType || '-',
        _trigger: r.triggerType || r.triggerReason || '-',
        _ok: Number(r.success) === 1,
        _detail: r.detail || '-',
      }));
      const rows = reset ? list : this.data.logRows.concat(list);
      const total = Number(payload.total || 0);
      this.setData({ logRows: rows, logTotal: total, logPage: page, logHasMore: rows.length < total });
    } catch (err) {
      if (reset) this.setData({ logRows: [], logTotal: 0 });
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 20) : '加载失败', icon: 'none' });
    } finally {
      this.setData({ logLoading: false, logMore: false });
    }
  },
});
