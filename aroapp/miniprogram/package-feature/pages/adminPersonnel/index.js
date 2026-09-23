const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { shouldRefreshOnShow } = require('../../../utils/pageShowRefresh.js');

const ROLE_CODES = ['MEMBER', 'STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER'];
const ROLE_LABELS = ['学生', '普通员工', '高级员工', '管理员', '超级管理员', '平台所有者'];
/** 新建员工账号可选角色（后端禁止直接创建 MEMBER） */
const STAFF_ROLE_CODES = ['STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN'];
const STAFF_ROLE_LABELS = ['普通员工', '高级员工', '管理员', '超级管理员'];
const BUILTIN_SUPER_ID = 'SYS_SUPER_ROOT';
const PAGE_SIZE = 20;
/** 通知绑定三渠道：本地字段名 / 弹窗标题 / 提交体键 / 接口路径  一一对应 */
const BIND_KINDS = {
  email: { field: 'contactEmail', bodyKey: 'email', path: 'contact-email', title: '联系邮箱', placeholder: '请输入邮箱地址', empty: '未绑定' },
  sendkey: { field: 'sendKey', bodyKey: 'sendKey', path: 'send-key', title: '微信通知（Server酱）SendKey', placeholder: '请输入 SendKey', empty: '未绑定' },
  wxpusher: { field: 'wxPusherUid', bodyKey: 'wxPusherUid', path: 'wx-pusher-uid', title: 'WxPusher UID', placeholder: '请输入 WxPusher UID', empty: '未绑定' },
};

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
    // 详情要用、列表不显示的字段：软删标记决定危险操作是「移入回收站」还是「恢复/彻底删除」，
    // 校内标记决定「组织与资料」那一格。pickRow 是白名单，漏了这两个 _patchDetail 回填后会丢。
    deletedAt: r.deletedAt != null ? r.deletedAt : (r.deleted_at != null ? r.deleted_at : null),
    isSchool: r.isSchool != null ? r.isSchool : (r.is_school != null ? r.is_school : null),
    head: r.head != null ? String(r.head) : '',
  };
}

/** 编辑字段名 → 行对象上的驼峰键（job_number -> jobNumber） */
function camelField(key) {
  return String(key || '').replace(/_([a-z])/g, (m, c) => c.toUpperCase());
}

/**
 * 头像地址 → 小程序能加载的绝对地址。
 * 不走 ARO 代理：同步时应把 ARO 头像落成本地文件、head 直接存本地地址，
 * 这里只负责把相对地址拼成绝对地址。
 */
function resolveHeadUrl(raw) {
  const u = String(raw == null ? '' : raw).trim();
  if (!u) return '';
  if (u.startsWith('data:')) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('cloud://')) return '';
  return absUrl(u) || u;
}

/** 优先按 /api 拼，再退回按 upload 静态目录拼；拼不出绝对地址就返回空串 */
function absUrl(path) {
  try {
    if (typeof springAuth.toAbsoluteApiUrl === 'function') {
      const a = springAuth.toAbsoluteApiUrl(path);
      if (a && /^https?:\/\//i.test(a)) return a;
    }
  } catch (e) { /* 继续尝试 */ }
  try {
    if (typeof springAuth.toAbsoluteMediaUrl === 'function') {
      const b = springAuth.toAbsoluteMediaUrl(path);
      if (b && /^https?:\/\//i.test(b)) return b;
    }
  } catch (e) { /* 放弃 */ }
  return '';
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
    /** 回收站视图：列表只出已软删记录，「恢复 / 彻底删除」才有点得到的入口 */
    trashOnly: false,
    roleLabels: ROLE_LABELS,
    roleIdxMap: { MEMBER: 0, STAFF: 1, SENIOR: 2, ADMIN: 3, SUPER_ADMIN: 4, PLATFORM_OWNER: 5 },
    staffRolePickerLabels: STAFF_ROLE_LABELS,
    builtinSuperId: BUILTIN_SUPER_ID,
    myUserId: '',

    // ── 详情 sheet ──
    showDetail: false,
    detail: null,
    staffPwd: { visible: false, value: '', loading: false },
    studentPwd: { visible: false, value: '', loading: false },
    sig: { loading: false, hasSignature: false, imageData: '', createdAt: '' },
    identityTags: [],
    identityPicked: [],
    /** 身份标签的渲染态 [{id,label,on}]：WXML 里调不了 indexOf，选中与否必须预先算好 */
    identityRows: [],
    detailTags: [],
    showIdentitySheet: false,
    identityPickCount: 0,
    aroSyncing: false,

    // ── 单字段编辑（姓名 / 工号 / 类型） ──
    showFieldPopup: false,
    fieldKey: '',
    fieldLabel: '',
    fieldValue: '',
    fieldSubmitting: false,

    // ── 通知绑定（邮箱 / Server酱 / WxPusher 共用一个输入弹窗） ──
    showBindPopup: false,
    bindKind: '',
    bindTitle: '',
    bindPlaceholder: '',
    bindValue: '',
    bindSubmitting: false,

    // ── 房间授权 sheet ──
    showRoomSheet: false,
    roomRows: [],
    roomLoading: false,
    roomSaving: false,

    // ── 通用搜索式选择器（筛选四项 / 部门 / 课题组 / 并入档案共用） ──
    pickOpen: false,
    pickTitle: '',
    pickKeyword: '',
    pickRows: [],
    pickPickedKey: '',
    pickEmptyHint: '没有匹配的项',

    // ── 删除账号 ──
    showDeleteSheet: false,
    deleteTargetId: '',
    deleteTargetUsername: '',
    deleteConfirmInput: '',
    deleteSubmitting: false,

    // ── 新建账号 ──
    showCreateSheet: false,
    createUsername: '',
    createPassword: '',
    createNickname: '',
    createRoleIdx: 0,
    createSubmitting: false,

    // ── 修改展示昵称 ──
    showNickPopup: false,
    nickEditId: '',
    nickEditValue: '',
    nickSubmitting: false,

    // ── 筛选（选中即生效，没有草稿态） ──
    showFilterSheet: false,
    deptDict: [],
    groupDict: [],
    identityDict: [],
    roomDict: [],
    filterGroupId: 0,
    filterGroupName: '',
    filterIdentityTagId: 0,
    filterIdentityTagName: '',
    filterRoomName: '',
    filterRole: '',
    filterRoleName: '',
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
    // 身份标识映射：卡面要展示它，列表渲染前先备好
    if (!this._identityMapLoaded) this.loadIdentityMap();
    const sceneKey = [role || '', this.data.activeTab || '', (this.data.keyword || '').trim()].join('|');
    if (!shouldRefreshOnShow(this, { sceneKey, ttlMs: 15000 })) return;
    this.loadData({ reset: true, showLoading: true });
  },

  /**
   * 全量身份归属（GET /api/person-identity 不带 userIds = 有身份的全部人）。
   * key 是 personnel.id —— person_identity.user_id 的口径就是它。
   */
  loadIdentityMap() {
    this._identityMapLoaded = true;
    springAuth
      .springRequest({ url: '/api/person-identity', method: 'GET', data: {} })
      .then((res) => {
        const parsed = parseResponse(res);
        if (!parsed.ok) return;
        const map = {};
        (parsed.body.data || []).forEach((p) => {
          if (!p || !p.userId) return;
          const labels = (p.tags || []).map((t) => t.label).filter(Boolean);
          if (labels.length) map[String(p.userId)] = labels;
        });
        this._identityMap = map;
        // 映射到得比列表晚时，重铺一遍卡面标签
        const rows = (this.data.rows || []).map((r) => this.decorateRow(pickRow(r)));
        if (rows.length) this.setData({ rows });
      })
      .catch(() => {});
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
      // 身份标识（person_identity_tag）：卡面展示的就是它，不再是角色名
      tags: (this._identityMap || {})[String(base.id)] || [],
      headUrl: resolveHeadUrl(base.head),
      roomsText: rooms.join(' / '),
      emailText: base.contactEmail || '',
      sendKeyText: base.sendKey ? '已绑定' : '未绑定',
    };
  },

  // ══════════════════════ 详情 ══════════════════════

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row) return;
    this.setData({
      showDetail: true,
      detail: row,
      staffPwd: { visible: false, value: '', loading: false },
      studentPwd: { visible: false, value: '', loading: false },
      sig: { loading: true, hasSignature: false, imageData: '', createdAt: '' },
      identityPicked: [],
      detailTags: [],
      aroSyncing: false,
    });
    if (!this._dictLoaded) this.loadDicts();
    this._paintIdentityRows();
    this.loadIdentity(row);
    this.loadSignature(row);
  },

  onCloseDetail() {
    this.setData({ showDetail: false, detail: null });
  },

  /**
   * 档案改完只回填当前行，不整表重载（post-save-no-full-refresh）。
   * 统一过 pickRow→decorateRow，保证 roleLabel / displayName / roomsText 这些派生字段跟着重算。
   */
  _patchDetail(patch) {
    const cur = this.data.detail;
    if (!cur) return;
    const merged = this.decorateRow(Object.assign(pickRow(cur), patch));
    const rows = (this.data.rows || []).map((r) => (r.id === cur.id ? merged : r));
    this.setData({ rows, detail: merged });
  },

  loadIdentity(row) {
    springAuth
      .springRequest({ url: `/api/person-identity/${encodeURIComponent(row.id)}`, method: 'GET', data: {} })
      .then((res) => {
        const parsed = parseResponse(res);
        const d = parsed.ok && parsed.body ? parsed.body.data : null;
        const tags = d && Array.isArray(d.tags) ? d.tags : [];
        this.setData({
          identityPicked: tags.map((t) => Number(t.id)).filter((n) => n > 0),
          detailTags: tags.map((t) => t.label).filter(Boolean),
        });
        this._paintIdentityRows();
      })
      .catch(() => {});
  },

  /** 弹窗里的勾选态走草稿（this._idPicked），确定才落库 */
  _paintIdentityRows() {
    const picked = this._idPicked || {};
    this.setData({
      identityRows: (this.data.identityDict || []).map((t) => ({
        id: t.id,
        label: t.label,
        selected: !!picked[Number(t.id)],
      })),
    });
  },

  loadSignature(row) {
    springAuth
      .springRequest({ url: `/api/personnel/${row.id}/signature`, method: 'GET', data: {} })
      .then((res) => {
        const parsed = parseResponse(res);
        const d = (parsed.ok && parsed.body && parsed.body.data) || {};
        this.setData({
          sig: {
            loading: false,
            hasSignature: !!d.hasSignature,
            imageData: d.imageData || '',
            createdAt: d.createdAt || '',
          },
        });
      })
      .catch(() => this.setData({ sig: { loading: false, hasSignature: false, imageData: '', createdAt: '' } }));
  },

  /** 从 ARO 重新拉这一个人（记录级动作，不是整表同步） */
  async onDetailSync() {
    const row = this.data.detail;
    if (!row || this.data.aroSyncing) return;
    this.setData({ aroSyncing: true });
    wx.showLoading({ title: '同步中…', mask: true });
    try {
      const res = await springAuth.springRequest({ url: `/api/personnel/${row.id}/sync`, method: 'POST', data: {} });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const d = parsed.body.data || {};
      wx.showToast({ title: `学生 ${d.aroMatched || 0} / 教职工 ${d.staffMatched || 0}`, icon: 'none', duration: 2200 });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '同步失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ aroSyncing: false });
    }
  },

  // ── 账号密码明文 ──

  async _togglePwd(accountId, key) {
    if (!accountId) return;
    const cur = this.data[key];
    if (cur.visible) {
      this.setData({ [key]: { visible: false, value: cur.value, loading: false } });
      return;
    }
    if (cur.value) {
      this.setData({ [key]: { visible: true, value: cur.value, loading: false } });
      return;
    }
    this.setData({ [key]: { visible: false, value: '', loading: true } });
    try {
      const res = await springAuth.springRequest({
        url: `/api/admin/users/${encodeURIComponent(accountId)}/view-password`,
        method: 'GET',
        data: {},
      });
      const parsed = parseResponse(res);
      const plain = parsed.ok && parsed.body && parsed.body.data ? parsed.body.data.password || '（暂不可查看）' : '（暂不可查看）';
      this.setData({ [key]: { visible: true, value: plain, loading: false } });
    } catch (e) {
      this.setData({ [key]: { visible: true, value: '（暂不可查看）', loading: false } });
    }
  },

  onToggleStaffPwd(e) {
    this._togglePwd(e.currentTarget.dataset.id, 'staffPwd');
  },

  onToggleStudentPwd(e) {
    this._togglePwd(e.currentTarget.dataset.id, 'studentPwd');
  },

  // ── 账号层动作 ──

  onDetailResetAccount(e) {
    const id = e.currentTarget.dataset.id;
    const detail = this.data.detail;
    if (!id || !detail) return;
    wx.showModal({
      title: '重置登录账号',
      content: `将修改「${detail.displayName || id}」的登录账号。人员库学号不变。`,
      editable: true,
      placeholderText: detail.staffUsername || '新登录账号',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        const newUsername = (r.content || '').trim();
        if (!newUsername) {
          wx.showToast({ title: '账号不能为空', icon: 'none' });
          return;
        }
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
          this._patchDetail({ staffUsername: newUsername, studentUsername: newUsername });
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  onDetailResetPin(e) {
    this.onResetPin(e);
  },

  onDetailResetOpenId(e) {
    this.onResetOpenId(e);
  },

  onDetailToggleStatus(e) {
    this.onStatusChipTap(e);
  },

  onDetailDeleteAccount(e) {
    this.onDeleteStaffStep1(e);
  },

  // ── 单字段编辑（姓名 / 工号 / 类型） ──

  onOpenFieldPopup(e) {
    const detail = this.data.detail;
    if (!detail) return;
    const key = e.currentTarget.dataset.field;
    const labels = { name: '姓名', job_number: '工号', user_type_names: '类型' };
    const values = { name: detail.name || '', job_number: detail.jobNumber || '', user_type_names: detail.userTypeNames || '' };
    this.setData({
      showFieldPopup: true,
      fieldKey: key,
      fieldLabel: labels[key] || '字段',
      fieldValue: values[key] || '',
      fieldSubmitting: false,
    });
  },

  onCloseFieldPopup() {
    if (this.data.fieldSubmitting) return;
    this.setData({ showFieldPopup: false, fieldKey: '', fieldLabel: '', fieldValue: '' });
  },

  onFieldInput(e) {
    this.setData({ fieldValue: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  async onSubmitField() {
    const detail = this.data.detail;
    const key = this.data.fieldKey;
    const value = (this.data.fieldValue || '').trim();
    if (!detail || !key || this.data.fieldSubmitting) return;
    if (!value) {
      wx.showToast({ title: '不能为空', icon: 'none' });
      return;
    }
    this.setData({ fieldSubmitting: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const isName = key === 'name';
      const res = await springAuth.springRequest({
        url: isName ? `/api/personnel/${detail.id}/name` : `/api/personnel/${detail.id}/field`,
        method: 'PUT',
        data: isName ? { name: value } : { field: key, value },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '已保存', icon: 'success' });
      this._patchDetail(isName ? { name: value } : { [camelField(key)]: value });
      this.setData({ showFieldPopup: false, fieldKey: '', fieldLabel: '', fieldValue: '', fieldSubmitting: false });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
      this.setData({ fieldSubmitting: false });
    } finally {
      wx.hideLoading();
    }
  },

  // ── 组织信息：部门 / 课题组（搜索式选择） ──

  onPickOrg(e) {
    const kind = e.currentTarget.dataset.kind;
    const detail = this.data.detail;
    if (!detail || !kind) return;
    if (kind === 'department') {
      const options = [{ key: '', label: '未归属' }].concat(
        (this.data.deptDict || []).map((d) => ({ key: String(d.id), label: d.name }))
      );
      this.openPicker({
        title: '选择部门',
        options,
        picked: this._orgRefId(detail, 'department'),
        onPick: (it) => this._saveOrg('department', it),
      });
    } else {
      const options = [{ key: '', label: '未归属' }].concat(
        (this.data.groupDict || []).map((g) => ({ key: String(g.id), label: g.name, sub: g.departmentName || '' }))
      );
      this.openPicker({
        title: '选择课题组',
        options,
        picked: this._orgRefId(detail, 'group'),
        onPick: (it) => this._saveOrg('group', it),
      });
    }
  },

  /** 当前组织在字典里的 id；字典还没加载出来时回退空串，不阻塞打开选择器 */
  _orgRefId(detail, kind) {
    const dict = kind === 'department' ? this.data.deptDict : this.data.groupDict;
    const name = kind === 'department' ? detail.departmentName : detail.projectGroupName;
    const hit = (dict || []).find((d) => d.name === name);
    return hit ? String(hit.id) : '';
  },

  async _saveOrg(kind, option) {
    const detail = this.data.detail;
    if (!detail) return;
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/personnel/${detail.id}/org`,
        method: 'PUT',
        data: { kind, refId: option.key ? Number(option.key) : null, name: option.key ? option.label : null },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '已保存', icon: 'success' });
      this._patchDetail(kind === 'department' ? { departmentName: option.key ? option.label : '' } : { projectGroupName: option.key ? option.label : '' });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ── 通知绑定（邮箱 / Server酱 / WxPusher） ──

  onOpenBind(e) {
    const kind = e.currentTarget.dataset.kind;
    const cfg = BIND_KINDS[kind];
    const detail = this.data.detail;
    if (!cfg || !detail) return;
    this.setData({
      showBindPopup: true,
      bindKind: kind,
      bindTitle: cfg.title,
      bindPlaceholder: cfg.placeholder,
      bindValue: detail[cfg.field] || '',
      bindSubmitting: false,
    });
  },

  onCloseBindPopup() {
    if (this.data.bindSubmitting) return;
    this.setData({ showBindPopup: false, bindKind: '', bindValue: '' });
  },

  onBindInput(e) {
    this.setData({ bindValue: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
  },

  /** 清空 = 解绑（后端把空串当解绑） */
  async onSubmitBind() {
    const cfg = BIND_KINDS[this.data.bindKind];
    const detail = this.data.detail;
    const accountId = detail ? detail.staffId || detail.aroUserId : '';
    if (!cfg || !detail || !accountId || this.data.bindSubmitting) return;
    const value = (this.data.bindValue || '').trim();
    this.setData({ bindSubmitting: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const body = {};
      body[cfg.bodyKey] = value;
      const res = await springAuth.springRequest({
        url: `/api/admin/personnel/${encodeURIComponent(accountId)}/${cfg.path}`,
        method: 'PUT',
        data: body,
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: value ? '已绑定' : '已解绑', icon: 'success' });
      this._patchDetail({ [cfg.field]: value });
      this.setData({ showBindPopup: false, bindKind: '', bindValue: '', bindSubmitting: false });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
      this.setData({ bindSubmitting: false });
    } finally {
      wx.hideLoading();
    }
  },

  // ── 身份标识：勾选弹窗，确定才落库 ──

  onOpenIdentitySheet() {
    const detail = this.data.detail;
    if (!detail) return;
    const picked = {};
    (this.data.identityPicked || []).forEach((id) => {
      picked[Number(id)] = true;
    });
    this._idPicked = picked;
    if (!this._dictLoaded) this.loadDicts();
    this.setData({ showIdentitySheet: true, identityPickCount: Object.keys(picked).length });
    this._paintIdentityRows();
  },

  onCloseIdentitySheet() {
    if (this._identitySaving) return;
    this.setData({ showIdentitySheet: false });
  },

  onToggleIdentityPick(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const row = (this.data.identityRows || [])[idx];
    if (!row) return;
    const on = !row.selected;
    if (on) this._idPicked[row.id] = true;
    else delete this._idPicked[row.id];
    this.setData({
      [`identityRows[${idx}].selected`]: on,
      identityPickCount: Object.keys(this._idPicked || {}).length,
    });
  },

  async onConfirmIdentity() {
    const detail = this.data.detail;
    if (!detail || this._identitySaving) return;
    const tagIds = Object.keys(this._idPicked || {})
      .map(Number)
      .filter((n) => n > 0);
    this._identitySaving = true;
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/person-identity/${encodeURIComponent(detail.id)}`,
        method: 'PUT',
        data: { tagIds },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const labels = (this.data.identityRows || [])
        .filter((r) => this._idPicked[r.id])
        .map((r) => r.label);
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ identityPicked: tagIds, detailTags: labels, showIdentitySheet: false });
      // 卡面标签也跟着刷新
      this._identityMapLoaded = false;
      this.loadIdentityMap();
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this._identitySaving = false;
    }
  },

  // ── 电子签名 ──

  onResetSignature() {
    const detail = this.data.detail;
    if (!detail) return;
    wx.showModal({
      title: '重置电子签名',
      content: '重置后该签名会被清空，本人可以重新签。确定重置？',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/personnel/${detail.id}/signature`,
            method: 'DELETE',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已重置签名', icon: 'success' });
          this.setData({ sig: { loading: false, hasSignature: false, imageData: '', createdAt: '' } });
        } catch (err) {
          wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '重置失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this._adminMutating = false;
        }
      },
    });
  },

  // ── 房间授权 ──

  async onOpenRoomSheet() {
    const detail = this.data.detail;
    if (!detail) return;
    this.setData({ showRoomSheet: true, roomSaving: false });
    if (!this._roomCatalog) {
      this.setData({ roomLoading: true });
      try {
        const res = await springAuth.springRequest({
          url: '/api/v1/room-mapping/rooms',
          method: 'GET',
          data: { page: 1, pageSize: 10000, includeChannels: false },
        });
        const parsed = parseResponse(res);
        const list = parsed.ok && parsed.body && parsed.body.data && Array.isArray(parsed.body.data.list) ? parsed.body.data.list : [];
        this._roomCatalog = list.slice().sort((a, b) => {
          const k = (x) => `${x.regionName || ''}|${x.floorName || ''}|${x.roomName || ''}`;
          return k(a).localeCompare(k(b), 'zh-Hans-CN');
        });
      } catch (e) {
        this._roomCatalog = [];
      }
      this.setData({ roomLoading: false });
    }
    this._roomPicked = {};
    try {
      const res = await springAuth.springRequest({
        url: `/api/personnel/${detail.id}/room-authorization`,
        method: 'GET',
        data: {},
      });
      const parsed = parseResponse(res);
      const ids = parsed.ok && parsed.body && parsed.body.data ? parsed.body.data.roomIds || [] : [];
      ids.forEach((rid) => {
        this._roomPicked[String(rid)] = true;
      });
    } catch (e) {
      /* 读不到就按「无授权」起步 */
    }
    this._paintRoomRows();
  },

  /** 铺平成一行一房间 + 区域/楼层小标题标记，勾选走路径 setData，不重铺整棵树 */
  _paintRoomRows() {
    const rows = [];
    let lastRegion = null;
    let lastFloor = null;
    (this._roomCatalog || []).forEach((r) => {
      const region = r.regionName || '其他';
      const floor = r.floorName || '其他';
      const showRegion = region !== lastRegion;
      const showFloor = showRegion || floor !== lastFloor;
      lastRegion = region;
      lastFloor = floor;
      rows.push({
        region,
        floor,
        showRegion,
        showFloor,
        roomId: r.roomId,
        roomName: r.roomName || r.roomId,
        on: !!this._roomPicked[String(r.roomId)],
      });
    });
    this.setData({ roomRows: rows });
  },

  onCloseRoomSheet() {
    if (this.data.roomSaving) return;
    this.setData({ showRoomSheet: false, roomRows: [] });
  },

  onToggleRoom(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const row = (this.data.roomRows || [])[idx];
    if (!row) return;
    const on = !row.on;
    if (on) this._roomPicked[row.roomId] = true;
    else delete this._roomPicked[row.roomId];
    this.setData({ [`roomRows[${idx}].on`]: on });
  },

  async onSaveRooms() {
    const detail = this.data.detail;
    if (!detail || this.data.roomSaving) return;
    this.setData({ roomSaving: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/personnel/${detail.id}/room-authorization`,
        method: 'PUT',
        data: { roomIds: Object.keys(this._roomPicked || {}) },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const names = (this._roomCatalog || [])
        .filter((r) => this._roomPicked[String(r.roomId)])
        .map((r) => r.roomName || r.roomId);
      wx.showToast({ title: '房间授权已更新', icon: 'success' });
      this._patchDetail({ allowedRoomsDisplayZh: names.join('、') });
      this.setData({ showRoomSheet: false, roomRows: [] });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ roomSaving: false });
    }
  },

  // ── 危险操作 ──

  /** 列表在「回收站」视图时同一张卡片的动作完全不同，切换后必须重拉 */
  onToggleTrash() {
    this.setData({ trashOnly: !this.data.trashOnly, page: 1, hasMore: true });
    this.loadData({ reset: true, showLoading: true });
  },

  onMoveToTrash() {
    const detail = this.data.detail;
    if (!detail) return;
    wx.showModal({
      title: '移入回收站',
      content: '移入回收站？之后可以在回收站里恢复。',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        const ok = await this._runPersonnelAction(
          () => springAuth.springRequest({ url: `/api/personnel/${detail.id}`, method: 'DELETE', data: {} }),
          '已移入回收站'
        );
        // 人已经不在当前列表里了，详情留着会指向一行不存在的记录
        if (ok) this.onCloseDetail();
      },
    });
  },

  onRestorePersonnel() {
    const detail = this.data.detail;
    if (!detail) return;
    void this._runPersonnelAction(
      () => springAuth.springRequest({ url: `/api/personnel/${detail.id}/restore`, method: 'POST', data: {} }),
      '已恢复到人员列表'
    );
  },

  onPurgePersonnel() {
    const detail = this.data.detail;
    if (!detail) return;
    wx.showModal({
      title: '彻底删除',
      content:
        '彻底删除不可恢复：会同时删掉他在 ARO 侧的人员记录与登录账号。\n' +
        '注意：若这个人来自 ARO 同步，下次同步可能还会把他加回来（ARO 才是权威源）。确定继续？',
      confirmText: '彻底删除',
      confirmColor: '#b91c1c',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        const ok = await this._runPersonnelAction(
          () => springAuth.springRequest({ url: `/api/personnel/${detail.id}/purge`, method: 'DELETE', data: {} }),
          '已彻底删除'
        );
        if (ok) this.onCloseDetail();
      },
    });
  },

  /** 把另一个人员并入本档案：本档案存活、对方被删除，不可逆 */
  onMergePerson() {
    const detail = this.data.detail;
    if (!detail) return;
    this.openPicker({
      title: '并入此档案 · 搜索人员',
      mode: 'remote',
      emptyHint: '输入姓名 / 工号搜索',
      search: (kw) => this.searchPersonForMerge(kw),
      onPick: (it) => this._confirmMerge(it),
    });
  },

  searchPersonForMerge(keyword) {
    const detail = this.data.detail;
    return springAuth
      .springRequest({ url: '/api/personnel', method: 'GET', data: { page: 1, pageSize: 20, keyword: keyword || '' } })
      .then((res) => {
        const parsed = parseResponse(res);
        const list = parsed.ok && parsed.body && parsed.body.data && Array.isArray(parsed.body.data.list) ? parsed.body.data.list : [];
        return list
          .filter((r) => !detail || r.id !== detail.id)
          .map((r) => ({
            key: String(r.id),
            label: r.name || r.staffUsername || r.aroUserId || '—',
            sub: [r.departmentName, r.projectGroupName].filter(Boolean).join(' · '),
          }));
      })
      .catch(() => []);
  },

  _confirmMerge(picked) {
    const detail = this.data.detail;
    const targetId = Number(picked && picked.key);
    if (!detail || !Number.isFinite(targetId) || targetId === detail.id) return;
    wx.showModal({
      title: '确认并入',
      content: `把「${picked.label}」并入本档案「${detail.displayName}」，「${picked.label}」的档案将被删除，此操作不可逆。确定继续？`,
      confirmText: '确定并入',
      confirmColor: '#b91c1c',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        const ok = await this._runPersonnelAction(
          () =>
            springAuth.springRequest({
              url: '/api/personnel/merge',
              method: 'POST',
              data: { survivorId: detail.id, mergedId: targetId },
            }),
          '已合并'
        );
        if (ok) this.onCloseDetail();
      },
    });
  },

  /** 档案层动作统一收口：加锁 → 调用 → 提示 → 从列表移除当前行（分页数据以服务端为准） */
  async _runPersonnelAction(request, successTitle) {
    if (this._adminMutating) return false;
    this._adminMutating = true;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      const res = await request();
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: successTitle, icon: 'success' });
      const detail = this.data.detail;
      if (detail) {
        this.setData({
          rows: (this.data.rows || []).filter((r) => r.id !== detail.id),
          total: Math.max(0, (this.data.total || 0) - 1),
        });
      }
      return true;
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '操作失败', icon: 'none' });
      return false;
    } finally {
      wx.hideLoading();
      this._adminMutating = false;
    }
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
    if (!id) return;
    const row = (this.data.rows || []).find((x) => x.staffId === id || x.aroUserId === id);
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
        (r.staffId === id || r.aroUserId === id) ? { ...r, displayNickname: v, nickDraft: v } : r
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
    const row = (this.data.rows || []).find((x) => x.staffId === id || x.aroUserId === id);
    if (!row || row.staffId === BUILTIN_SUPER_ID) return;
    // 登录名是账号名（staffUsername），不是 personnel 行 id —— 原先取 row.username 恒空，
    // 导致下面「输登录名确认」那一步永远过不去
    const accountName = row.staffUsername || row.staffId || '';
    wx.showModal({
      title: '删除账号',
      content: `将永久删除「${accountName}」，不可恢复。是否继续？`,
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
              deleteTargetUsername: accountName,
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
      const rows = this.data.rows.filter((r) => r.staffId !== id && r.aroUserId !== id);
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
      if (this.data.trashOnly) reqData.trashOnly = true;
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

  async onRoleChange(e) {
    if (this._adminMutating) return;
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.detail.value);
    const role = ROLE_CODES[idx];
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
      const row = (this.data.rows || []).find((x) => x.staffId === id || x.aroUserId === id);
      const merged = row ? { ...pickRow(row), role } : { role };
      const rows = this.data.rows.map((r) => {
        if (r.staffId !== id && r.aroUserId !== id) return r;
        return this.decorateRow({ ...pickRow(r), ...merged });
      });
      this.setData({ rows });
      // 详情 sheet 里的角色单元格是另一份引用，不跟着回填就会停在旧值
      const d = this.data.detail;
      if (d && (d.staffId === id || d.aroUserId === id)) this._patchDetail({ role });
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
            (it.staffId === id || it.aroUserId === id) ? { ...it, status: enabled ? 1 : 0 } : it
          );
          this.setData({ rows });
          const d = this.data.detail;
          if (d && (d.staffId === id || d.aroUserId === id)) this._patchDetail({ status: enabled ? 1 : 0 });
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
          const rows = this.data.rows.map((it) => ((it.staffId === id || it.aroUserId === id) ? { ...it, openId: null } : it));
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

  /**
   * 重置登录密码。账号 id 前缀决定打哪条通道：
   * STAFF_* / SYS_SUPER_ROOT 是 sys_user 账号 → /api/admin/users/{id}/reset-password；
   * 其余（ARO 人员库学号）→ /api/admin/personnel/{id}/reset-password。
   * 原先走死一条 users 通道，学生账号点「改密」必失败。
   */
  onResetPassword(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const isStaffAccount = String(id).startsWith('STAFF_') || String(id).toUpperCase().startsWith('USR_') || String(id) === BUILTIN_SUPER_ID;
    wx.showModal({
      title: '确认重置密码',
      content: '将重置为默认密码，用户需到个人中心完成改密。',
      success: async (r) => {
        if (!r.confirm || this._adminMutating) return;
        this._adminMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: isStaffAccount
              ? `/api/admin/users/${encodeURIComponent(id)}/reset-password`
              : `/api/admin/personnel/${encodeURIComponent(id)}/reset-password`,
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
          // 详情里已展开的明文作废，下次点「查看」重新拉
          this.setData({
            staffPwd: { visible: false, value: '', loading: false },
            studentPwd: { visible: false, value: '', loading: false },
          });
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

  // ═══ 人员库 PIN 操作 ═══
  onResetPin(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((r) => r.staffId === id || r.aroUserId === id);
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
            (it.staffId === id || it.aroUserId === id) ? { ...it, personalPin: null, pinText: '未设置' } : it
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
    const row = (this.data.rows || []).find((r) => r.staffId === id || r.aroUserId === id);
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
      const rows = this.data.rows.map((r) => ((r.staffId === id || r.aroUserId === id) ? { ...r, contactEmail: email, emailText: email } : r));
      this.setData({ rows, showEmailPopup: false, emailEditId: '', emailEditValue: '', emailSubmitting: false });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
      this.setData({ emailSubmitting: false });
    } finally {
      wx.hideLoading();
      this._adminMutating = false;
    }
  },

  // ══════════════════════ 通用搜索式选择器 ══════════════════════

  /**
   * options 为 [{key,label,sub}]，默认本地按关键字过滤（先匹配主标题再匹配副标题）；
   * mode:'remote' 时改用 search(keyword) -> Promise<items>，输入防抖后打接口。
   * 选中回调挂实例上（data 放不了函数），选完即关。
   */
  openPicker(options) {
    const opts = options || {};
    this._pickerOnPick = typeof opts.onPick === 'function' ? opts.onPick : null;
    this._pickerRemote = opts.mode === 'remote' && typeof opts.search === 'function' ? opts.search : null;
    this._pickerLocal = opts.options || [];
    this._pickerSeq = (this._pickerSeq || 0) + 1;
    this.setData({
      pickOpen: true,
      pickTitle: opts.title || '选择',
      pickKeyword: '',
      pickPickedKey: opts.picked != null ? String(opts.picked) : '',
      pickEmptyHint: opts.emptyHint || '没有匹配的项',
      pickRows: [],
    });
    this._paintPicker();
  },

  _paintPicker() {
    const kw = String(this.data.pickKeyword || '').trim();
    if (this._pickerRemote) {
      const seq = ++this._pickerSeq;
      if (this._pickerTimer) clearTimeout(this._pickerTimer);
      // 空关键字立即出第一屏；有输入才防抖，避免每敲一个字打一次接口
      this._pickerTimer = setTimeout(() => {
        Promise.resolve(this._pickerRemote(kw))
          .then((items) => {
            if (seq !== this._pickerSeq || !this.data.pickOpen) return;
            this.setData({ pickRows: items || [] });
          })
          .catch(() => {
            if (seq === this._pickerSeq) this.setData({ pickRows: [] });
          });
      }, kw ? 220 : 0);
      return;
    }
    const q = kw.toLowerCase();
    const rows = (this._pickerLocal || []).filter(
      (it) =>
        !q ||
        String(it.label || '').toLowerCase().indexOf(q) >= 0 ||
        String(it.sub || '').toLowerCase().indexOf(q) >= 0
    );
    this.setData({ pickRows: rows });
  },

  onPickerInput(e) {
    this.setData({ pickKeyword: e.detail && e.detail.value != null ? String(e.detail.value) : '' });
    this._paintPicker();
  },

  clearPickerKeyword() {
    this.setData({ pickKeyword: '' });
    this._paintPicker();
  },

  closePicker() {
    if (this._pickerTimer) clearTimeout(this._pickerTimer);
    this._pickerSeq = (this._pickerSeq || 0) + 1;
    this.setData({ pickOpen: false, pickKeyword: '', pickRows: [] });
  },

  onPickerPick(e) {
    const key = e.currentTarget.dataset.key;
    const picked = (this.data.pickRows || []).find((r) => String(r.key) === String(key));
    const cb = this._pickerOnPick;
    this.closePicker();
    if (picked && cb) cb(picked);
  },

  // ══════════════════════ 筛选（选中即生效） ══════════════════════

  /** 部门 / 课题组 / 身份标签 / 房间 四份字典：详情与筛选共用，一个会话拉一次 */
  loadDicts() {
    if (this._dictLoaded) return;
    this._dictLoaded = true;
    springAuth
      .springRequest({ url: '/api/personnel-dict/project-groups', method: 'GET', data: {} })
      .then((res) => {
        const p = parseResponse(res);
        if (p.ok) this.setData({ groupDict: (p.body.data || []).filter((g) => g.active !== 0) });
      })
      .catch(() => {});
    springAuth
      .springRequest({ url: '/api/personnel-dict/departments', method: 'GET', data: {} })
      .then((res) => {
        const p = parseResponse(res);
        if (p.ok) this.setData({ deptDict: (p.body.data || []).filter((d) => d.active !== 0) });
      })
      .catch(() => {});
    springAuth
      .springRequest({ url: '/api/person-identity/tags', method: 'GET', data: {} })
      .then((res) => {
        const p = parseResponse(res);
        if (!p.ok) return;
        this.setData({ identityDict: p.body.data || [] });
        this._paintIdentityRows();
      })
      .catch(() => {});
    springAuth
      .springRequest({ url: '/api/personnel/rooms', method: 'GET', data: {} })
      .then((res) => {
        const p = parseResponse(res);
        if (p.ok) this.setData({ roomDict: p.body.data || [] });
      })
      .catch(() => {});
  },

  onOpenFilterSheet() {
    this.loadDicts();
    this.setData({ showFilterSheet: true });
  },

  onCloseFilterSheet() {
    this.setData({ showFilterSheet: false });
  },

  onPickFilter(e) {
    const field = e.currentTarget.dataset.field;
    const all = { key: '', label: '全部' };
    if (field === 'group') {
      this.openPicker({
        title: '课题组',
        options: [all].concat(
          (this.data.groupDict || []).map((g) => ({ key: String(g.id), label: g.name, sub: g.departmentName || '' }))
        ),
        picked: this.data.filterGroupId || '',
        onPick: (it) => {
          this.setData({ filterGroupId: it.key ? Number(it.key) : 0, filterGroupName: it.key ? it.label : '' });
          this._reloadList();
        },
      });
    } else if (field === 'identity') {
      this.openPicker({
        title: '身份标识',
        options: [all].concat((this.data.identityDict || []).map((t) => ({ key: String(t.id), label: t.label }))),
        picked: this.data.filterIdentityTagId || '',
        onPick: (it) => {
          this.setData({ filterIdentityTagId: it.key ? Number(it.key) : 0, filterIdentityTagName: it.key ? it.label : '' });
          this._reloadList();
        },
      });
    } else if (field === 'room') {
      const rooms = this.data.roomDict || [];
      this.openPicker({
        title: `房间 · 共 ${rooms.length} 项`,
        options: [all].concat(rooms.map((r) => ({ key: r, label: r }))),
        picked: this.data.filterRoomName || '',
        onPick: (it) => {
          this.setData({ filterRoomName: it.key || '' });
          this._reloadList();
        },
      });
    } else if (field === 'role') {
      this.openPicker({
        title: '角色',
        options: [all].concat(ROLE_CODES.map((c, i) => ({ key: c, label: ROLE_LABELS[i] }))),
        picked: this.data.filterRole || '',
        onPick: (it) => {
          this.setData({ filterRole: it.key || '', filterRoleName: it.key ? it.label : '' });
          this._reloadList();
        },
      });
    }
  },

  _reloadList() {
    this.setData({ page: 1, hasMore: true });
    this.loadData({ reset: true, showLoading: true });
  },

  onClearFilter() {
    this.setData({
      filterGroupId: 0,
      filterGroupName: '',
      filterIdentityTagId: 0,
      filterIdentityTagName: '',
      filterRoomName: '',
      filterRole: '',
      filterRoleName: '',
    });
    this._reloadList();
  },
});
