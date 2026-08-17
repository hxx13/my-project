const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { shouldRefreshOnShow } = require('../../../utils/pageShowRefresh.js');

const ROLE_CODES = ['MEMBER', 'STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER'];
const ROLE_LABELS = ['学生', '普通员工', '高级员工', '管理员', '超级管理员', '平台所有者'];
/** 新建员工账号可选角色（后端禁止直接创建 MEMBER） */
const STAFF_ROLE_CODES = ['STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN'];
const STAFF_ROLE_LABELS = ['普通员工', '高级员工', '管理员', '超级管理员'];
/** 员工视窗内修改角色：含学生，权限与视窗分类解耦 */
const STAFF_EDIT_ROLE_CODES = ['MEMBER', ...STAFF_ROLE_CODES];
const STAFF_EDIT_ROLE_LABELS = ['学生', ...STAFF_ROLE_LABELS];
const BUILTIN_SUPER_ID = 'SYS_SUPER_ROOT';
const PAGE_SIZE = 20;

function pickRow(r) {
  if (!r || typeof r !== 'object') return {};
  return {
    id: r.id,
    name: r.name,
    staffId: r.staffId != null ? r.staffId : r.staff_id,
    aroUserId: r.aroUserId != null ? r.aroUserId : r.aro_user_id,
    jobNumber: r.jobNumber != null ? r.jobNumber : r.job_number,
    departmentName: r.departmentName != null ? r.departmentName : r.department_name,
    projectGroupName: r.projectGroupName != null ? r.projectGroupName : r.project_group_name,
    userTypeNames: r.userTypeNames != null ? r.userTypeNames : r.user_type_names,
    role: r.role,
    status: r.status != null ? Number(r.status) : null,
    staffUsername: r.staffUsername != null ? r.staffUsername : r.staff_username,
    studentUsername: r.studentUsername != null ? r.studentUsername : r.student_username,
    mobilePhone: r.mobilePhone != null ? r.mobilePhone : r.mobile_phone,
    allowedRoomsDisplayZh: r.allowedRoomsDisplayZh != null ? r.allowedRoomsDisplayZh : r.allowed_rooms_display_zh,
    contactEmail: r.contactEmail != null ? String(r.contactEmail) : (r.contact_email != null ? String(r.contact_email) : ''),
    sendKey: r.sendKey != null ? String(r.sendKey) : (r.send_key != null ? String(r.send_key) : ''),
    wxPusherUid: r.wxPusherUid != null ? String(r.wxPusherUid) : (r.wx_pusher_uid != null ? String(r.wx_pusher_uid) : ''),
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
    activeTab: 'all',
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
    // ARO 绑定映射（SUPER_ADMIN 可见，key = userId, value = binding object）
    aroBindings: {},
    // 详情弹窗密码明文加载
    detailPwdLoading: false,
    detailPwdPlaintext: null,
    detailRowId: '',
    // 弹窗状态
    showEmailPopup: false,
    emailEditId: '',
    emailEditValue: '',
    emailSubmitting: false,
    // 筛选面板
    showFilterSheet: false,
    groupOptions: [],
    groupNames: ['全部'],
    identityTagOptions: [],
    identityTagNames: ['全部'],
    roomOptions: [],
    roomNames: ['全部'],
    roleOptions: ['MEMBER', 'STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER'],
    roleLabels: ['学生', '普通员工', '高级员工', '管理员', '超级管理员', '平台所有者'],
    roleNames: ['全部', '学生', '普通员工', '高级员工', '管理员', '超级管理员', '平台所有者'],
    filterGroupId: 0,
    filterGroupIdx: 0,
    filterIdentityTagId: 0,
    filterIdentityIdx: 0,
    filterRoomName: '',
    filterRoomIdx: 0,
    filterRole: '',
    filterRoleIdx: 0,
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
    // 加载 ARO 绑定映射
    if (hasMinRole(role, 'SUPER_ADMIN')) this.loadAroBindings();
    const sceneKey = [role || '', this.data.activeTab || '', (this.data.keyword || '').trim()].join('|');
    if (!shouldRefreshOnShow(this, { sceneKey, ttlMs: 15000 })) return;
    this.loadData({ reset: true, showLoading: true });
  },

  async loadAroBindings() {
    try {
      const res = await springAuth.springRequest({ url: '/api/admin/aro-bindings', method: 'GET', data: {} });
      const parsed = parseResponse(res);
      if (parsed.ok && parsed.body && Array.isArray(parsed.body.data)) {
        const map = {};
        for (const b of parsed.body.data) {
          if (b.userId) map[b.userId] = b;
        }
        this.setData({ aroBindings: map });
      }
    } catch (e) { /* ignore */ }
  },

  onReachBottom() {
    this.loadData({ append: true });
  },

  onPullDownRefresh() {
    this.loadData({ reset: true }).finally(() => wx.stopPullDownRefresh());
  },

  decorateRow(r) {
    const base = pickRow(r);
    const hasAccount = !!base.staffId;
    const code = String(base.role || 'MEMBER').toUpperCase();
    const idx = ROLE_CODES.indexOf(code);
    const roleLabel = idx >= 0 ? ROLE_LABELS[idx] : code;
    const displayName = base.name || base.staffUsername || base.aroUserId || '-';
    const letter = String(displayName || '?').trim().charAt(0) || '?';
    const rooms = (base.allowedRoomsDisplayZh || '').split(/[、，,;；]/).map((s) => s.trim()).filter(Boolean);
    return {
      ...base,
      hasAccount,
      roleLabel,
      displayName,
      _avatarLetter: letter,
      _pwdVisible: false,
      roomsText: rooms.join(' / '),
      emailText: base.contactEmail || '',
      sendKeyText: base.sendKey ? '已绑定' : '未绑定',
    };
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row) return;
    const lines = [];
    lines.push({ k: '姓名', v: row.displayName || '—' });
    lines.push({ k: '账号情况', v: row.hasAccount ? '有系统账号' : '无系统账号' });
    if (row.hasAccount) {
      lines.push({ k: '教职工ID', v: row.staffId || '—' });
      lines.push({ k: '账号名', v: row.staffUsername || row.staffId || '—' });
      lines.push({ k: '状态', v: row.status === 0 ? '禁用' : '启用' });
    }
    if (row.aroUserId) {
      lines.push({ k: '认证ID', v: row.aroUserId || '—' });
    }
    lines.push({ k: '部门', v: row.departmentName || '—' });
    lines.push({ k: '课题组', v: row.projectGroupName || '—' });
    lines.push({ k: '工号', v: row.jobNumber || '—' });
    lines.push({ k: '手机', v: row.mobilePhone || '—' });
    lines.push({ k: '房间授权', v: row.roomsText || '—' });
    lines.push({ k: '角色', v: row.roleLabel || '—' });
    lines.push({ k: '邮箱', v: row.contactEmail || '未绑定' });
    lines.push({ k: '微信通知', v: row.sendKeyText || '未绑定' });
    if (row.hasAccount && row.staffId !== BUILTIN_SUPER_ID) {
      lines.push({ k: '密码', v: '加载中…' });
    }
    this.setData({
      showDetailPopup: true,
      detailTitle: row.displayName || '人员详情',
      detailLines: lines,
      detailRowId: row.staffId || row.aroUserId || '',
      detailPwdLoading: row.hasAccount && row.staffId !== BUILTIN_SUPER_ID,
      detailPwdPlaintext: null,
    });
    if (row.hasAccount && row.staffId !== BUILTIN_SUPER_ID) {
      this.loadDetailPassword(row.staffId);
    }
  },

  async loadDetailPassword(id) {
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/users/${encodeURIComponent(id)}/view-password`,
        method: 'GET',
        data: {},
      });
      const parsed = parseResponse(res);
      const plaintext = parsed.ok && parsed.body && parsed.body.data ? (parsed.body.data.password || '（暂不可查看）') : '（暂不可查看）';
      const lines = (this.data.detailLines || []).map((l) =>
        l.k === '密码' ? { ...l, v: plaintext } : l
      );
      this.setData({ detailLines: lines, detailPwdLoading: false, detailPwdPlaintext: plaintext });
    } catch (e) {
      const lines = (this.data.detailLines || []).map((l) =>
        l.k === '密码' ? { ...l, v: '******' } : l
      );
      this.setData({ detailLines: lines, detailPwdLoading: false, detailPwdPlaintext: '******' });
    }
  },

  onCloseDetailPopup() {
    this.setData({ showDetailPopup: false, detailTitle: '', detailLines: [] });
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    // 兼容旧 WXML 的 personnel/system（Task 10 改 WXML 为 all/sys/nosys 后此映射仍兼容）
    const legacyMap = { personnel: 'nosys', system: 'sys' };
    const activeTab = legacyMap[tab] || (['all', 'sys', 'nosys'].indexOf(tab) >= 0 ? tab : 'all');
    this.setData({ activeTab, page: 1, hasMore: true });
    this.loadData({ reset: true, showLoading: true });
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
  onCreateRolePicker(e) {
    const idx = Number(e.detail.value);
    this.setData({ createRoleIdx: Number.isFinite(idx) ? idx : 0 });
  },

  async onSubmitCreateStaff() {
    if (this._adminMutating || this.data.createSubmitting) return;
    const username = (this.data.createUsername || '').trim();
    const password = this.data.createPassword || '';
    const displayNickname = (this.data.createNickname || '').trim();
    const role = STAFF_ROLE_CODES[this.data.createRoleIdx] || 'STAFF';
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
      const reqData = { page: nextPage, pageSize: PAGE_SIZE }; // 后端契约是 pageSize（原代码发 size 会被忽略）
      const kw = (this.data.keyword || '').trim();
      if (kw) reqData.keyword = kw;
      if (this.data.activeTab !== 'all') reqData.accountType = this.data.activeTab;
      if (this.data.filterGroupId) reqData.groupId = this.data.filterGroupId;
      if (this.data.filterIdentityTagId) reqData.identityTagId = this.data.filterIdentityTagId;
      if (this.data.filterRoomName) reqData.roomName = this.data.filterRoomName;
      if (this.data.filterRole) reqData.role = this.data.filterRole;
      const res = await springAuth.springRequest({
        url: '/api/personnel',
        method: 'GET',
        data: reqData,
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) {
        throw new Error(parsed.message);
      }
      const payload = parsed.body ? parsed.body.data : (res && res.data ? res.data : {});
      const list = (payload && Array.isArray(payload.list) ? payload.list : []).map((row) =>
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

  async onTogglePwd(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((r) => r.id === id);
    if (!row || row.id === BUILTIN_SUPER_ID) return;
    // 已显示则隐藏
    if (row._pwdVisible) {
      const rows = this.data.rows.map((r) => (r.id === id ? { ...r, _pwdVisible: false } : r));
      this.setData({ rows });
      return;
    }
    // 已有缓存的明文则直接显示
    if (row._pwdPlaintext !== undefined) {
      const rows = this.data.rows.map((r) => (r.id === id ? { ...r, _pwdVisible: true } : r));
      this.setData({ rows });
      return;
    }
    // 调 API 获取明文
    wx.showLoading({ title: '加载中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/users/${encodeURIComponent(id)}/view-password`,
        method: 'GET',
        data: {},
      });
      const parsed = parseResponse(res);
      const plaintext = parsed.ok && parsed.body && parsed.body.data ? (parsed.body.data.password || '（暂不可查看）') : '（暂不可查看）';
      const rows = this.data.rows.map((r) =>
        r.id === id ? { ...r, _pwdVisible: true, _pwdPlaintext: plaintext, password: plaintext } : r
      );
      this.setData({ rows });
    } catch (e) {
      wx.showToast({ title: '获取失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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

  // ═══ 人员库操作：重置登录账号 ═══
  onResetPersonnelAccount(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((r) => r.id === id);
    if (!row) return;
    const currentUsername = row.username || '';
    wx.showModal({
      title: '重置登录账号',
      content: `将修改「${row.displayName || id}」的登录账号。人员库学号不变。`,
      editable: true,
      placeholderText: currentUsername || '新登录账号',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        const newUsername = (r.content || '').trim();
        if (!newUsername) { wx.showToast({ title: '账号不能为空', icon: 'none' }); return; }
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/admin/personnel/${encodeURIComponent(id)}/reset-account`,
            method: 'POST',
            data: { newUsername },
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '账号已重置', icon: 'success' });
          const rows = this.data.rows.map((it) => (it.id === id ? { ...it, username: newUsername } : it));
          this.setData({ rows });
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  // ═══ 人员库操作：重置登录密码（学生） ═══
  onResetPersonnelPassword(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((r) => r.id === id);
    if (!row) return;
    wx.showModal({
      title: '重置登录密码',
      content: '确认重置该学生的登录密码吗？将生成随机密码。',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/admin/personnel/${encodeURIComponent(id)}/reset-password`,
            method: 'POST',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          const defPwd = parsed.body.data && parsed.body.data.defaultPassword;
          wx.showModal({
            title: '重置成功',
            content: defPwd ? `新密码：${defPwd}` : '密码已重置',
            showCancel: false,
          });
          const rows = this.data.rows.map((it) =>
            it.id === id ? { ...it, password: defPwd || it.password, _pwdVisible: !!defPwd, _pwdPlaintext: defPwd } : it
          );
          this.setData({ rows });
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  // ═══ 人员库 PIN 操作 ═══
  onResetPin(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((r) => r.id === id);
    const label = row ? (row.displayName || id) : id;
    wx.showModal({
      title: '重置个人密码（PIN）',
      content: `确认重置「${label}」的扫码个人密码吗？\n\nPIN 按人员库学号存储，重置后该人员需重新设置。`,
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const pinRes = await springAuth.springRequest({
            url: `/api/admin/personnel/${encodeURIComponent(id)}/reset-pin`,
            method: 'POST',
            data: {},
          });
          const parsed = parseResponse(pinRes);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: 'PIN 已重置', icon: 'success' });
          const rows = this.data.rows.map((it) =>
            it.id === id ? { ...it, personalPin: null, pinText: '未设置' } : it
          );
          this.setData({ rows });
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  // ═══ 从系统用户跳转到人员库 PIN 重置 ═══
  onJumpToPersonnelPinReset(e) {
    const personnelId = e.currentTarget.dataset.pid;
    const name = e.currentTarget.dataset.pname || '';
    if (!personnelId) return;
    this.setData({ activeTab: 'personnel', keyword: personnelId, page: 1 }, () => {
      wx.showToast({ title: `已切换至人员库\n筛选 ${name || personnelId}`, icon: 'none', duration: 2000 });
      this.loadData({ reset: true, showLoading: true });
    });
  },

  // ═══ ARO 绑定操作 ═══
  onUnbindAro(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '解除 ARO 绑定',
      content: '确认解除该用户的 ARO 绑定吗？',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/admin/personnel/${encodeURIComponent(id)}/aro-binding`,
            method: 'DELETE',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已解除绑定', icon: 'success' });
          this.loadAroBindings();
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  // ═══ 邮箱编辑 ═══
  onOpenEmailPopup(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((r) => r.id === id);
    this.setData({
      showEmailPopup: true,
      emailEditId: id,
      emailEditValue: row ? (row.contactEmail || '') : '',
      emailSubmitting: false,
    });
  },

  onCloseEmailPopup() {
    this.setData({ showEmailPopup: false, emailEditId: '', emailEditValue: '', emailSubmitting: false });
  },

  onEmailInput(e) {
    this.setData({ emailEditValue: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  async onSubmitEmail() {
    const id = this.data.emailEditId;
    const email = (this.data.emailEditValue || '').trim();
    if (!id || this._adminMutating || this.data.emailSubmitting) return;
    this.setData({ emailSubmitting: true });
    this._adminMutating = true;
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/personnel/${encodeURIComponent(id)}/contact-email`,
        method: 'PUT',
        data: { email },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '邮箱已更新', icon: 'success' });
      const rows = this.data.rows.map((r) => (r.id === id ? { ...r, contactEmail: email, emailText: email } : r));
      this.setData({ rows, showEmailPopup: false, emailEditId: '', emailEditValue: '', emailSubmitting: false });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
      this.setData({ emailSubmitting: false });
    } finally {
      wx.hideLoading();
      this._adminMutating = false;
    }
  },

  // ═══ 筛选面板 ═══
  loadFilterOptions() {
    const that = this;
    if (this._filterOptionsLoaded) return;
    this._filterOptionsLoaded = true;
    springAuth.springRequest({ url: '/api/personnel-dict/project-groups', method: 'GET', data: {} })
      .then((res) => { const p = parseResponse(res); if (p.ok) { const gs = (p.body.data || []).filter((g) => g.active !== 0); that.setData({ groupOptions: gs, groupNames: ['全部'].concat(gs.map((g) => g.name)) }); } })
      .catch(() => {});
    springAuth.springRequest({ url: '/api/person-identity/tags', method: 'GET', data: {} })
      .then((res) => { const p = parseResponse(res); if (p.ok) { const ts = p.body.data || []; that.setData({ identityTagOptions: ts, identityTagNames: ['全部'].concat(ts.map((t) => t.label)) }); } })
      .catch(() => {});
    springAuth.springRequest({ url: '/api/personnel/rooms', method: 'GET', data: {} })
      .then((res) => { const p = parseResponse(res); if (p.ok) { const rs = p.body.data || []; that.setData({ roomOptions: rs, roomNames: ['全部'].concat(rs) }); } })
      .catch(() => {});
  },
  onOpenFilterSheet() { this.loadFilterOptions(); this.setData({ showFilterSheet: true }); },
  onCloseFilterSheet() { this.setData({ showFilterSheet: false }); },
  onGroupFilterChange(e) {
    const idx = Number(e.detail.value);
    const g = idx > 0 ? this.data.groupOptions[idx - 1] : undefined;
    this.setData({ filterGroupIdx: idx, filterGroupId: g ? g.id : 0 });
  },
  onIdentityFilterChange(e) {
    const idx = Number(e.detail.value);
    const t = idx > 0 ? this.data.identityTagOptions[idx - 1] : undefined;
    this.setData({ filterIdentityIdx: idx, filterIdentityTagId: t ? t.id : 0 });
  },
  onRoomFilterChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ filterRoomIdx: idx, filterRoomName: idx === 0 ? '' : (this.data.roomOptions[idx - 1] || '') });
  },
  onRoleFilterChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ filterRoleIdx: idx, filterRole: idx === 0 ? '' : this.data.roleOptions[idx - 1] });
  },
  onApplyFilter() {
    this.setData({ showFilterSheet: false, page: 1, hasMore: true });
    this.loadData({ reset: true, showLoading: true });
  },
  onClearFilter() {
    this.setData({
      filterGroupIdx: 0, filterGroupId: 0,
      filterIdentityIdx: 0, filterIdentityTagId: 0,
      filterRoomIdx: 0, filterRoomName: '',
      filterRoleIdx: 0, filterRole: '',
      page: 1, hasMore: true,
    });
    this.loadData({ reset: true, showLoading: true });
  },
});
