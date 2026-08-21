const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { shouldRefreshOnShow } = require('../../../utils/pageShowRefresh.js');

const ROLE_CODES = ['STUDENT', 'STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER'];
const ROLE_LABELS = ['学生', '普通员工', '高级员工', '管理员', '超级管理员', '平台所有者'];
/** 新建员工账号可选角色（后端禁止直接创建 STUDENT） */
const STAFF_ROLE_CODES = ['STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN'];
const STAFF_ROLE_LABELS = ['普通员工', '高级员工', '管理员', '超级管理员'];
/** 员工视窗内修改角色：含学生，权限与视窗分类解耦 */
const STAFF_EDIT_ROLE_CODES = ['STUDENT', ...STAFF_ROLE_CODES];
const STAFF_EDIT_ROLE_LABELS = ['学生', ...STAFF_ROLE_LABELS];
const BUILTIN_SUPER_ID = 'SYS_SUPER_ROOT';
const PAGE_SIZE = 20;

function pickRow(r) {
  if (!r || typeof r !== 'object') return {};
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    password: r.password,
    role: r.role,
    openId: r.openId != null ? r.openId : r.open_id,
    status: r.status != null ? Number(r.status) : 1,
    jobNumber: r.jobNumber != null ? r.jobNumber : r.job_number,
    createTime: r.createTime != null ? r.createTime : r.create_time,
    departmentName: r.departmentName != null ? r.departmentName : r.department_name,
    projectGroupName: r.projectGroupName != null ? r.projectGroupName : r.project_group_name,
    displayNickname:
      r.displayNickname != null ? r.displayNickname : r.display_nickname != null ? r.display_nickname : '',
  };
}

function shortenDisplay(raw, maxLen) {
  const t = raw == null ? '' : String(raw);
  if (!t) return { text: '—', truncated: false };
  if (t.length <= maxLen) return { text: t, truncated: false };
  return { text: `${t.slice(0, maxLen)}…`, truncated: true };
}

function parseResponse(res) {
  const { statusCode, data } = res;
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

function readMyUserId() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    if (!raw) return '';
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return o && o.id ? String(o.id) : '';
  } catch (e) {
    return '';
  }
}

function fieldDetailValue(detail) {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail.value != null) return String(detail.value);
  return String(detail);
}

Page({
  data: {
    activeTab: 'personnel',
    keyword: '',
    page: 1,
    size: PAGE_SIZE,
    rows: [],
    total: 0,
    loading: false,
    loadingMore: false,
    hasMore: true,
    rolePickerLabels: ROLE_LABELS,
    staffRolePickerLabels: STAFF_ROLE_LABELS,
    staffEditRolePickerLabels: STAFF_EDIT_ROLE_LABELS,
    builtinSuperId: BUILTIN_SUPER_ID,
    myUserId: '',
    showDetailPopup: false,
    detailTitle: '',
    detailLines: [],
    showCreateSheet: false,
    createUsername: '',
    createPassword: '',
    createNickname: '',
    createRealName: '',
    createRoleIdx: 0,
    createSubmitting: false,
    showDeleteSheet: false,
    deleteTargetId: '',
    deleteTargetUsername: '',
    deleteConfirmInput: '',
    deleteSubmitting: false,
    showNickPopup: false,
    nickEditId: '',
    nickEditValue: '',
    nickSubmitting: false,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/adminPersonnel/index', role, 'SUPER_ADMIN')) return;
    const myUserId = readMyUserId();
    if (myUserId !== this.data.myUserId) this.setData({ myUserId });
    const sceneKey = [role || '', this.data.activeTab || '', (this.data.keyword || '').trim()].join('|');
    if (!shouldRefreshOnShow(this, { sceneKey, ttlMs: 15000 })) return;
    this.loadData({ reset: true, showLoading: true });
  },

  onReachBottom() {
    this.loadData({ append: true });
  },

  onPullDownRefresh() {
    this.loadData({ reset: true }).finally(() => wx.stopPullDownRefresh());
  },

  decorateRow(r) {
    const tab = this.data.activeTab;
    const base = pickRow(r);
    const code = String(base.role || (tab === 'personnel' ? 'STUDENT' : 'STAFF')).toUpperCase();
    let idx = ROLE_CODES.indexOf(code);
    if (idx < 0) idx = 0;
    let staffIdx = STAFF_EDIT_ROLE_CODES.indexOf(code);
    if (staffIdx < 0) staffIdx = 0;
    let roleLabel = ROLE_LABELS[idx];
    if (tab === 'system') {
      if (STAFF_EDIT_ROLE_CODES.indexOf(code) >= 0) roleLabel = STAFF_EDIT_ROLE_LABELS[staffIdx];
      else if (code === 'PLATFORM_OWNER') roleLabel = '平台所有者';
    }
    const displayName = tab === 'personnel' ? base.name || base.username || '-' : base.username || '-';
    const idDisp = shortenDisplay(base.id, 22);
    const openDisp = shortenDisplay(base.openId || '', 20);
    const userDisp = tab === 'personnel' ? shortenDisplay(base.username || '', 18) : { text: '', truncated: false };
    const nickSrc =
      base.displayNickname != null && String(base.displayNickname) !== '' ? String(base.displayNickname) : '';
    const letter = String(displayName || '?').trim().charAt(0) || '?';
    return {
      ...base,
      _roleIdx: idx,
      _staffRoleIdx: staffIdx,
      roleLabel,
      displayName,
      nickDraft: tab === 'system' ? nickSrc : '',
      _pwdVisible: false,
      _avatarLetter: letter,
      idListText: idDisp.text,
      openIdListText: base.openId ? openDisp.text : '—',
      usernameListText: tab === 'personnel' ? userDisp.text : '',
    };
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row) return;
    const tab = this.data.activeTab;
    const lines = [];
    lines.push({ k: '用户 ID', v: row.id || '—' });
    lines.push({ k: tab === 'personnel' ? '姓名' : '账号', v: row.displayName || '—' });
    if (tab === 'personnel') {
      lines.push({ k: '登录账号', v: row.username || '—' });
      lines.push({ k: '工号', v: row.jobNumber || '—' });
      lines.push({ k: '部门', v: row.departmentName || '—' });
      lines.push({ k: '项目组', v: row.projectGroupName || '—' });
    } else {
      lines.push({ k: '展示昵称', v: row.displayNickname ? String(row.displayNickname) : '—' });
      lines.push({ k: '创建时间', v: row.createTime ? String(row.createTime) : '—' });
    }
    lines.push({ k: '角色代码', v: row.role || '—' });
    lines.push({ k: '角色', v: row.roleLabel || '—' });
    lines.push({ k: '状态', v: row.status === 0 ? '禁用' : '启用' });
    const pwd =
      row.id === BUILTIN_SUPER_ID ? '******（受保护）' : row.password != null ? String(row.password) : '—';
    lines.push({ k: '密码', v: pwd });
    this.setData({
      showDetailPopup: true,
      detailTitle: row.displayName || row.id || '人员详情',
      detailLines: lines,
    });
  },

  onCloseDetailPopup() {
    this.setData({ showDetailPopup: false, detailTitle: '', detailLines: [] });
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.loadData({ reset: true, showLoading: true }));
  },

  onKeywordInput(e) {
    const v = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this.setData({ keyword: v });
  },

  onSearch() {
    this.loadData({ reset: true, showLoading: true });
  },

  onManualRefresh() {
    this.loadData({ reset: true, showLoading: true });
  },

  onOpenNickPopup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.activeTab !== 'system') return;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row) return;
    const v =
      row.displayNickname != null && String(row.displayNickname) !== ''
        ? String(row.displayNickname)
        : row.nickDraft || '';
    this.setData({
      showNickPopup: true,
      nickEditId: id,
      nickEditValue: v,
      nickSubmitting: false,
    });
  },

  onNickPopupInput(e) {
    this.setData({ nickEditValue: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  onCloseNickPopup() {
    this.setData({
      showNickPopup: false,
      nickEditId: '',
      nickEditValue: '',
      nickSubmitting: false,
    });
  },

  onNickPopupCloseIfIdle() {
    if (this.data.nickSubmitting) return;
    this.onCloseNickPopup();
  },

  onNickCancelTap() {
    if (this.data.nickSubmitting) return;
    this.onCloseNickPopup();
  },

  onNickConfirmTap() {
    if (this.data.nickSubmitting) return;
    void this.onConfirmNickPopup();
  },

  async onConfirmNickPopup() {
    const id = this.data.nickEditId;
    const v = (this.data.nickEditValue || '').trim();
    if (!id || this._adminMutating || this.data.nickSubmitting) return;
    this.setData({ nickSubmitting: true });
    this._adminMutating = true;
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/users/${encodeURIComponent(id)}/display-nickname`,
        method: 'PATCH',
        data: { displayNickname: v },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '已保存', icon: 'success' });
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      const rows = this.data.rows.map((r) =>
        r.id === id ? { ...r, displayNickname: v, nickDraft: v } : r
      );
      this.setData({
        rows,
        showNickPopup: false,
        nickEditId: '',
        nickEditValue: '',
        nickSubmitting: false,
      });
    } catch (err) {
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
      this.setData({ nickSubmitting: false });
    } finally {
      wx.hideLoading();
      this._adminMutating = false;
    }
  },

  onOpenCreateSheet() {
    if (this.data.activeTab !== 'system') return;
    this.setData({
      showCreateSheet: true,
      createUsername: '',
      createPassword: '',
      createNickname: '',
      createRealName: '',
      createRoleIdx: 0,
      createSubmitting: false,
    });
  },

  onCloseCreateSheet() {
    this.setData({ showCreateSheet: false, createSubmitting: false });
  },

  onCreatePopupCloseIfIdle() {
    if (this.data.createSubmitting) return;
    this.onCloseCreateSheet();
  },

  onCreateCancelTap() {
    if (this.data.createSubmitting) return;
    this.onCloseCreateSheet();
  },

  onCreateSubmitTap() {
    if (this.data.createSubmitting) return;
    void this.onSubmitCreateStaff();
  },

  onCreateUsernameInput(e) {
    this.setData({ createUsername: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },
  onCreatePasswordInput(e) {
    this.setData({ createPassword: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },
  onCreateNicknameInput(e) {
    this.setData({ createNickname: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },
  onCreateRealNameInput(e) {
    this.setData({ createRealName: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },
  onCreateRolePicker(e) {
    const idx = Number(e.detail.value);
    this.setData({ createRoleIdx: Number.isFinite(idx) ? idx : 0 });
  },

  async onSubmitCreateStaff() {
    if (this._adminMutating || this.data.createSubmitting) return;
    const username = (this.data.createUsername || '').trim();
    const password = this.data.createPassword || '';
    const displayNickname = (this.data.createNickname || '').trim();
    const name = (this.data.createRealName || '').trim();
    const role = STAFF_ROLE_CODES[this.data.createRoleIdx] || 'STAFF';
    if (!name) {
      wx.showToast({ title: '请填写真实姓名', icon: 'none' });
      return;
    }
    if (username.length < 2) {
      wx.showToast({ title: '登录名至少2字符', icon: 'none' });
      return;
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' });
      return;
    }
    this.setData({ createSubmitting: true });
    this._adminMutating = true;
    wx.showLoading({ title: '创建中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/admin/system-users',
        method: 'POST',
        data: {
          username,
          password,
          role,
          name,
          displayNickname: displayNickname || undefined,
        },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const d = parsed.body.data || {};
      wx.showToast({ title: '已创建', icon: 'success' });
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      const stub = {
        id: d.id,
        username: d.username,
        name: d.name || name,
        displayNickname: d.displayNickname,
        role: d.role,
        status: 1,
        openId: null,
        password: '******',
      };
      const created = this.decorateRow(stub);
      const rows = [created, ...this.data.rows];
      this.setData({
        rows,
        total: (this.data.total || 0) + 1,
        showCreateSheet: false,
        createUsername: '',
        createPassword: '',
        createNickname: '',
        createRealName: '',
        createRoleIdx: 0,
        createSubmitting: false,
      });
    } catch (err) {
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 20) : '失败',
        icon: 'none',
      });
      this.setData({ createSubmitting: false });
    } finally {
      wx.hideLoading();
      this._adminMutating = false;
    }
  },

  onDeleteStaffStep1(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row || row.id === BUILTIN_SUPER_ID) return;
    const name = row.username || row.id;
    wx.showModal({
      title: '删除账号',
      content: `将永久删除「${name}」，不可恢复。是否继续？`,
      confirmText: '继续',
      confirmColor: '#b91c1c',
      success: (r) => {
        if (!r.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '删除后无法恢复，请再次确认是否删除该账号。',
          confirmText: '确定删除',
          confirmColor: '#b91c1c',
          success: (r2) => {
            if (!r2.confirm) return;
            this.setData({
              showDeleteSheet: true,
              deleteTargetId: id,
              deleteTargetUsername: row.username ? String(row.username) : '',
              deleteConfirmInput: '',
              deleteSubmitting: false,
            });
          },
        });
      },
    });
  },

  onCloseDeleteSheet() {
    this.setData({
      showDeleteSheet: false,
      deleteTargetId: '',
      deleteTargetUsername: '',
      deleteConfirmInput: '',
      deleteSubmitting: false,
    });
  },

  onDeleteConfirmInputChange(e) {
    this.setData({ deleteConfirmInput: fieldDetailValue(e.detail) });
  },

  async onSubmitDeleteStaff() {
    const id = this.data.deleteTargetId;
    const expect = (this.data.deleteTargetUsername || '').trim();
    const typed = (this.data.deleteConfirmInput || '').trim();
    if (!id || this._adminMutating || this.data.deleteSubmitting) return;
    if (!expect) {
      wx.showToast({ title: '无登录名不可删', icon: 'none' });
      return;
    }
    if (typed !== expect) {
      wx.showToast({ title: '登录名不一致', icon: 'none' });
      return;
    }
    this.setData({ deleteSubmitting: true });
    this._adminMutating = true;
    wx.showLoading({ title: '删除中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/users/${encodeURIComponent(id)}`,
        method: 'DELETE',
        data: {},
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '已删除', icon: 'success' });
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      const rows = this.data.rows.filter((r) => r.id !== id);
      this.setData({
        rows,
        total: Math.max(0, (this.data.total || 0) - 1),
        showDeleteSheet: false,
        deleteTargetId: '',
        deleteTargetUsername: '',
        deleteConfirmInput: '',
        deleteSubmitting: false,
      });
    } catch (err) {
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 20) : '失败',
        icon: 'none',
      });
      this.setData({ deleteSubmitting: false });
    } finally {
      wx.hideLoading();
      this._adminMutating = false;
    }
  },

  async loadData(options) {
    const opts = options || {};
    const reset = !!opts.reset;
    const append = !!opts.append;
    const showLoading = !!opts.showLoading;
    if (this.data.loading || this.data.loadingMore) return;
    if (append && !this.data.hasMore) return;
    const nextPage = reset ? 1 : append ? this.data.page + 1 : this.data.page;
    if (!hasMinRole(wx.getStorageSync(springAuth.KEYS.ROLE), 'SUPER_ADMIN')) return;
    if (showLoading) this.setData({ loading: true });
    if (append) this.setData({ loadingMore: true });
    try {
      const path =
        this.data.activeTab === 'personnel' ? '/api/admin/personnel' : '/api/admin/system-users';
      const res = await springAuth.springRequest({
        url: path,
        method: 'GET',
        data: {
          page: nextPage,
          size: PAGE_SIZE,
          keyword: (this.data.keyword || '').trim() || undefined,
        },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) {
        throw new Error(parsed.message);
      }
      const payload = parsed.body.data;
      const list = (payload && Array.isArray(payload.data) ? payload.data : []).map((row) =>
        this.decorateRow(row)
      );
      const total = payload && typeof payload.total === 'number' ? payload.total : 0;
      const rows = reset ? list : this.data.rows.concat(list);
      this.setData({
        rows,
        total,
        page: nextPage,
        hasMore: rows.length < total,
      });
    } catch (err) {
      if (reset) this.setData({ rows: [] });
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 20) : '加载失败',
        icon: 'none',
      });
    } finally {
      const done = {};
      if (showLoading) done.loading = false;
      if (append) done.loadingMore = false;
      if (Object.keys(done).length) this.setData(done);
    }
  },

  onTogglePwd(e) {
    const id = e.currentTarget.dataset.id;
    const rows = this.data.rows.map((r) => (r.id === id ? { ...r, _pwdVisible: !r._pwdVisible } : r));
    this.setData({ rows });
  },

  async onRoleChange(e) {
    if (this._adminMutating) return;
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.detail.value);
    const tab = this.data.activeTab;
    const role = tab === 'system' ? STAFF_EDIT_ROLE_CODES[idx] : ROLE_CODES[idx];
    if (!id || !role) return;
    this._adminMutating = true;
    wx.showLoading({ title: '更新中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/users/${encodeURIComponent(id)}/role`,
        method: 'PATCH',
        data: { role },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '角色已更新', icon: 'success' });
      const row = (this.data.rows || []).find((x) => x.id === id);
      const merged = row ? { ...pickRow(row), role } : { role };
      const rows = this.data.rows.map((r) => {
        if (r.id !== id) return r;
        return this.decorateRow({ ...pickRow(r), ...merged });
      });
      this.setData({ rows });
    } catch (err) {
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 18) : '更新失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
      this._adminMutating = false;
    }
  },

  onStatusChipTap(e) {
    const id = e.currentTarget.dataset.id;
    const st = e.currentTarget.dataset.status;
    const curOn = !(st === 0 || st === '0');
    const enabled = !curOn;
    const title = curOn ? '确认禁用' : '确认启用';
    const content = curOn ? '禁用后该账号将无法登录，是否继续？' : '是否启用该账号？';
    wx.showModal({
      title,
      content,
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/admin/users/${encodeURIComponent(id)}/status`,
            method: 'PATCH',
            data: { enabled },
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: enabled ? '已启用' : '已禁用', icon: 'success' });
          const rows = this.data.rows.map((it) =>
            it.id === id ? { ...it, status: enabled ? 1 : 0 } : it
          );
          this.setData({ rows });
        } catch (err) {
          wx.showToast({
            title: err && err.message ? String(err.message).slice(0, 18) : '失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  onResetOpenId(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认重置',
      content: '将清空该账号的 openId 绑定。',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/admin/users/${encodeURIComponent(id)}/reset-openid`,
            method: 'POST',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已重置', icon: 'success' });
          const rows = this.data.rows.map((it) => (it.id === id ? { ...it, openId: null } : it));
          this.setData({ rows });
        } catch (err) {
          wx.showToast({
            title: err && err.message ? String(err.message).slice(0, 18) : '失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  onResetPassword(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认重置密码',
      content: '将重置为默认密码，用户需到个人中心完成改密。',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
            method: 'POST',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          const defPwd = parsed.body.data && parsed.body.data.defaultPassword;
          wx.showModal({
            title: '重置成功',
            content: defPwd ? `默认密码：${defPwd}` : '密码已重置',
            showCancel: false,
          });
          const rows = this.data.rows.map((it) =>
            it.id === id ? { ...it, password: defPwd || it.password, _pwdVisible: !!defPwd } : it
          );
          this.setData({ rows });
        } catch (err) {
          wx.showToast({
            title: err && err.message ? String(err.message).slice(0, 18) : '失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },
});
