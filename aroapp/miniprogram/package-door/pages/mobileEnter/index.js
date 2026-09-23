/**
 * 移动端「房间自助进入」灰度配置（Web 端 /#/console/admin/dahua-issue 右上角
 * 「更多操作 → 移动端房间自助进入」的同构页）。
 *
 * 生效优先级：黑名单 > 白名单 > 一键开关。两个名单都是一键开关的例外。
 * 名单入参 id 两种形态（学生 = aro_personnel.user_id，教职工 = STAFF_xxx）直接透传，
 * 归一化在服务端做 —— 同一个人无论从哪个 id 加进去，禁用的都是他本人。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { shouldRefreshOnShow } = require('../../../utils/pageShowRefresh.js');

const MIN_ROLE = 'ADMIN';
const PAGE_PATH = '/package-door/pages/mobileEnter/index';
const API_BASE = '/api/v1/twin/scan/mobile-enter';

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

/** 人员行 → 名单候选：优先教职工账号 id，其次人员库学号 */
function rowAccountId(r) {
  return r && (r.staffId || r.aroUserId) ? String(r.staffId || r.aroUserId) : '';
}

Page({
  data: {
    masterEnabled: false,
    masterSaving: false,
    listKey: 'WHITE',
    kwDraft: '',
    keyword: '',
    rows: [],
    loading: false,
    selectedCount: 0,
    removing: false,
    // 选人弹窗
    pickerOpen: false,
    pickerKeyword: '',
    pickerRows: [],
    pickerLoading: false,
    pickerCount: 0,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, MIN_ROLE)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, PAGE_PATH, role, MIN_ROLE)) return;
    const sceneKey = [role || '', this.data.listKey, this.data.keyword].join('|');
    if (!shouldRefreshOnShow(this, { sceneKey, ttlMs: 15000 })) return;
    this.loadSettings();
    this.loadRows();
  },

  // ── 一键开关 ──

  loadSettings() {
    return springAuth
      .springRequest({ url: `${API_BASE}/settings`, method: 'GET', data: {} })
      .then((res) => {
        const parsed = parseResponse(res);
        if (parsed.ok && parsed.body.data) {
          this.setData({ masterEnabled: parsed.body.data.masterEnabled === true });
        }
      })
      .catch(() => {});
  },

  async onToggleMaster(e) {
    const checked = !!(e.detail && e.detail.value);
    if (this.data.masterSaving) return;
    this.setData({ masterSaving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `${API_BASE}/settings`,
        method: 'POST',
        data: { enabled: checked },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      this.setData({ masterEnabled: checked });
      wx.showToast({
        title: checked ? '已一键开启' : '已一键关闭',
        icon: 'none',
      });
    } catch (err) {
      // 失败回滚开关位置，否则界面会停在一个没落库的状态
      this.setData({ masterEnabled: !checked });
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ masterSaving: false });
    }
  },

  // ── 名单 ──

  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== 'WHITE' && key !== 'BLACK') return;
    this._picked = {};
    this.setData({ listKey: key, keyword: '', kwDraft: '', selectedCount: 0 });
    this.loadRows();
  },

  onKeywordInput(e) {
    this.setData({ kwDraft: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  onSearch() {
    this.setData({ keyword: (this.data.kwDraft || '').trim() });
    this.loadRows();
  },

  async loadRows() {
    if (this.data.loading) return;
    this._picked = {};
    this.setData({ loading: true, selectedCount: 0 });
    try {
      const data = {};
      data.enabled = this.data.listKey === 'WHITE';
      if (this.data.keyword) data.keyword = this.data.keyword;
      const res = await springAuth.springRequest({ url: `${API_BASE}/grants`, method: 'GET', data });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const list = Array.isArray(parsed.body.data) ? parsed.body.data : [];
      this.setData({ rows: list.map((r) => ({ ...r, selected: false })) });
    } catch (err) {
      this.setData({ rows: [] });
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 20) : '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onToggleRow(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const row = (this.data.rows || [])[idx];
    if (!row) return;
    const on = !row.selected;
    if (on) this._picked[row.userId] = true;
    else delete this._picked[row.userId];
    this.setData({
      [`rows[${idx}].selected`]: on,
      selectedCount: Object.keys(this._picked || {}).length,
    });
  },

  onToggleAll() {
    const rows = this.data.rows || [];
    if (rows.length === 0) return;
    const allOn = rows.every((r) => r.selected);
    const picked = {};
    if (!allOn) rows.forEach((r) => { picked[r.userId] = true; });
    this._picked = picked;
    this.setData({
      rows: rows.map((r) => ({ ...r, selected: !allOn })),
      selectedCount: allOn ? 0 : rows.length,
    });
  },

  onRemoveSelected() {
    const ids = Object.keys(this._picked || {});
    if (!ids.length || this.data.removing) return;
    const listLabel = this.data.listKey === 'WHITE' ? '白名单' : '黑名单';
    wx.showModal({
      title: '移出名单',
      content: `把选中的 ${ids.length} 人移出${listLabel}？他们会回到「跟随一键开关」。`,
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ removing: true });
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `${API_BASE}/grants/remove`,
            method: 'POST',
            data: { userIds: ids },
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: `已移出 ${parsed.body.data || 0} 人`, icon: 'success' });
          await this.loadRows();
          this.loadSettings();
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '移除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ removing: false });
        }
      },
    });
  },

  // ── 选人（搜索式多选） ──

  onOpenPicker() {
    this._picked = {};
    this.setData({ pickerOpen: true, pickerKeyword: '', pickerRows: [], pickerCount: 0 });
    this.paintPicker();
  },

  onClosePicker() {
    if (this._pickerTimer) clearTimeout(this._pickerTimer);
    this.setData({ pickerOpen: false, pickerRows: [], pickerKeyword: '' });
  },

  onPickerKeywordInput(e) {
    this.setData({ pickerKeyword: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
    this.paintPicker();
  },

  clearPickerKeyword() {
    this.setData({ pickerKeyword: '' });
    this.paintPicker();
  },

  /** 远程搜索：空关键字立即出第一屏，有输入才防抖，避免每敲一个字打一次接口 */
  paintPicker() {
    const kw = (this.data.pickerKeyword || '').trim();
    if (this._pickerTimer) clearTimeout(this._pickerTimer);
    const seq = (this._pickerSeq = (this._pickerSeq || 0) + 1);
    this.setData({ pickerLoading: true });
    this._pickerTimer = setTimeout(() => {
      springAuth
        .springRequest({ url: '/api/personnel', method: 'GET', data: { page: 1, pageSize: 30, keyword: kw } })
        .then((res) => {
          if (seq !== this._pickerSeq || !this.data.pickerOpen) return;
          const parsed = parseResponse(res);
          const list = parsed.ok && parsed.body.data && Array.isArray(parsed.body.data.list) ? parsed.body.data.list : [];
          const rows = list
            .filter((r) => rowAccountId(r))
            .map((r) => {
              const id = rowAccountId(r);
              return {
                id,
                label: r.name || r.staffUsername || id,
                sub: [r.departmentName, r.projectGroupName].filter(Boolean).join(' · '),
                selected: !!this._picked[id],
              };
            });
          this.setData({ pickerRows: rows, pickerLoading: false });
        })
        .catch(() => {
          if (seq === this._pickerSeq) this.setData({ pickerRows: [], pickerLoading: false });
        });
    }, kw ? 220 : 0);
  },

  onTogglePickerRow(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const row = (this.data.pickerRows || [])[idx];
    if (!row) return;
    const on = !row.selected;
    if (on) this._picked[row.id] = true;
    else delete this._picked[row.id];
    this.setData({
      [`pickerRows[${idx}].selected`]: on,
      pickerCount: Object.keys(this._picked || {}).length,
    });
  },

  onConfirmPicker() {
    const ids = Object.keys(this._picked || {});
    if (!ids.length) {
      this.onClosePicker();
      return;
    }
    const isWhite = this.data.listKey === 'WHITE';
    this.onClosePicker();
    wx.showLoading({ title: '处理中…', mask: true });
    springAuth
      .springRequest({ url: `${API_BASE}/grants`, method: 'POST', data: { userIds: ids, enabled: isWhite } })
      .then((res) => {
        const parsed = parseResponse(res);
        if (!parsed.ok) throw new Error(parsed.message);
        wx.showToast({ title: `已加入${isWhite ? '白名单' : '黑名单'} ${parsed.body.data || 0} 人`, icon: 'success' });
        return this.loadRows();
      })
      .catch((err) => {
        wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
      })
      .then(() => {
        wx.hideLoading();
      });
  },
});
