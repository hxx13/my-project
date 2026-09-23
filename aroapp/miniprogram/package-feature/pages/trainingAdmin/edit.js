const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { hasMinRole, isStudentAccount } = require('../../../utils/roleAccess.js');
const personIdentity = require('../../../utils/personIdentity.js');
const api = require('../../utils/trainingAdminApi.js');

const PAGE_PATH = '/package-feature/pages/trainingAdmin/edit';
const CAMPUS_OPTIONS = ['未分组', '浦东', '浦西'];
const campusValue = (label) => (label === '未分组' ? '' : label);
const campusLabel = (v) => ((v || '').trim() === '' ? '未分组' : String(v));

/** "yyyy-MM-dd HH:mm:ss" / "yyyy-MM-ddTHH:mm" → ms；解析失败返回 null */
function toMs(s) {
  const raw = String(s || '').trim();
  if (!raw) return null;
  const iso = raw.replace(' ', 'T');
  const full = iso.length === 16 ? iso + ':00' : iso.slice(0, 19);
  const t = new Date(full).getTime();
  return isNaN(t) ? null : t;
}

/** ms → "yyyy-MM-ddTHH:mm"（与 web 端 datetime-local 同格式，后端认） */
function toLocalInput(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 展示用 "MM-dd HH:mm" */
function showTime(s) {
  const raw = String(s || '').trim().replace('T', ' ');
  return raw.length >= 16 ? `${raw.slice(5, 10)} ${raw.slice(11, 16)}` : raw || '—';
}

/** ms → "yyyy-MM-dd HH:mm"（弹窗里回显用） */
function pickText(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    pageGateOk: false,
    loading: false,
    saving: false,
    editingId: 0,
    title: '发布培训',
    name: '',
    typeNames: [],
    typeIndex: -1,
    campusIndex: 0,
    campusOptions: CAMPUS_OPTIONS,
    owners: [],
    occurrences: [],
    // 所属人
    ownerPickerShow: false,
    staffKeyword: '',
    staffRows: [],
    pickedIds: [],
    // 场次表单
    occShow: false,
    occIndex: -1,
    occStartMs: 0,
    occEndMs: 0,
    occStartText: '',
    occEndText: '',
    occAddress: '',
    occTimeLimit: '',
    locNames: [],
    locAddresses: [],
    locIndex: -1,
    pickerShow: false,
  },

  onLoad(options) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token) {
      this._denyAccess();
      return;
    }
    // 与「我的」入口同口径：① 教职工视角（学生账号的角色档可能到 STAFF，只判角色会放学生进来）
    // ② 「饲养组长」身份，**最高权限（SUPER_ADMIN 及以上）免身份**。身份码走接口，失败按空集 = 拒绝
    personIdentity.fetchMyIdentityCodes().then((codes) => {
      if (isStudentAccount()) {
        this._denyAccess();
        return;
      }
      if (!hasMinRole(role, 'SUPER_ADMIN') && !codes[personIdentity.CODE_BREEDING_GROUP_LEADER]) {
        this._denyAccess();
        return;
      }
      if (!pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STAFF')) {
        this._denyAccess();
        return;
      }
      const id = Number((options && options.id) || 0);
      this.setData({ pageGateOk: true, editingId: id, title: id ? '编辑培训' : '发布培训' });
      this.loadDicts();
      if (id) this.loadDetail(id);
    });
  },

  _denyAccess() {
    wx.showToast({ title: '无权限', icon: 'none' });
    this._accessDenied = true;
    wx.navigateBack({ delta: 1 });
  },

  loadDicts() {
    api
      .fetchTypePresets()
      .then((list) => {
        this.setData({ typeNames: (list || []).map((t) => t.name) });
      })
      .catch(() => {});
    api
      .fetchLocations()
      .then((list) => {
        this._locations = list || [];
        this.setData({
          locNames: (list || []).map((l) => l.name),
          locAddresses: (list || []).map((l) => l.address),
        });
      })
      .catch(() => {});
  },

  loadDetail(id) {
    this.setData({ loading: true });
    api
      .fetchTraining(id)
      .then((d) => {
        if (!d) throw new Error('培训不存在');
        const typeNames = this.data.typeNames;
        const idx = typeNames.indexOf(d.typeName || '');
        this.setData({
          loading: false,
          name: d.name || '',
          typeIndex: idx,
          campusIndex: Math.max(0, CAMPUS_OPTIONS.indexOf(campusLabel(d.campus))),
          owners: (d.ownerIds || []).map((oid, i) => ({
            id: String(oid),
            name: (d.ownerNames || [])[i] || String(oid),
          })),
          occurrences: (d.occurrences || []).map((o) => ({
            id: o.id,
            startTime: o.startTime || '',
            endTime: o.endTime || '',
            startText: showTime(o.startTime),
            endText: showTime(o.endTime),
            address: o.address || '',
            timeLimit: o.timeLimit != null ? String(o.timeLimit) : '',
          })),
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
  },

  onCampusChange(e) {
    this.setData({ campusIndex: Number(e.detail.value) });
  },

  // ── 所属人 ──
  openOwnerPicker() {
    this.setData({ ownerPickerShow: true, pickedIds: this.data.owners.map((o) => o.id) });
    this.loadStaff('');
  },

  onStaffKeyword(e) {
    this.setData({ staffKeyword: e.detail.value });
    if (this._staffTimer) clearTimeout(this._staffTimer);
    this._staffTimer = setTimeout(() => this.loadStaff(this.data.staffKeyword), 300);
  },

  loadStaff(kw) {
    api
      .fetchSystemUsers(kw)
      .then((rows) => {
        const picked = this.data.pickedIds;
        this.setData({
          staffRows: (rows || []).map((r) => ({
            id: r.id,
            name: r.name,
            jobNumber: r.jobNumber,
            picked: picked.indexOf(r.id) >= 0,
          })),
        });
      })
      .catch(() => this.setData({ staffRows: [] }));
  },

  onToggleStaff(e) {
    const id = String(e.currentTarget.dataset.id);
    const name = e.currentTarget.dataset.name || id;
    const picked = this.data.pickedIds.slice();
    const at = picked.indexOf(id);
    if (at >= 0) picked.splice(at, 1);
    else picked.push(id);
    this._staffNames = this._staffNames || {};
    this._staffNames[id] = name;
    this.setData({
      pickedIds: picked,
      staffRows: this.data.staffRows.map((r) => ({ ...r, picked: picked.indexOf(r.id) >= 0 })),
    });
  },

  onOwnerConfirm() {
    const ids = this.data.pickedIds;
    const names = this._staffNames || {};
    const existed = {};
    this.data.owners.forEach((o) => {
      existed[o.id] = o.name;
    });
    this.setData({
      ownerPickerShow: false,
      owners: ids.map((id) => ({ id: id, name: names[id] || existed[id] || id })),
    });
  },

  onOwnerClose() {
    this.setData({ ownerPickerShow: false });
  },

  // ── 场次 ──
  openOcc(e) {
    const idx = e.currentTarget.dataset.idx;
    if (idx === undefined || idx === null || idx === '') {
      this.setData({
        occShow: true,
        occIndex: -1,
        occStartMs: 0,
        occEndMs: 0,
        occStartText: '',
        occEndText: '',
        occAddress: '',
        occTimeLimit: '',
        locIndex: -1,
      });
      return;
    }
    const o = this.data.occurrences[Number(idx)];
    if (!o) return;
    const sm = toMs(o.startTime) || 0;
    const em = toMs(o.endTime) || 0;
    this.setData({
      occShow: true,
      occIndex: Number(idx),
      occStartMs: sm,
      occEndMs: em,
      occStartText: pickText(sm),
      occEndText: pickText(em),
      occAddress: o.address || '',
      occTimeLimit: o.timeLimit || '',
      locIndex: Math.max(-1, this.data.locAddresses.indexOf(o.address || '')),
    });
  },

  onOccClose() {
    this.setData({ occShow: false });
  },

  openPicker() {
    this.setData({ pickerShow: true });
  },
  closePicker() {
    this.setData({ pickerShow: false });
  },

  onPickerInput(e) {
    const v = e.detail;
    if (this._pickerField === 'start') this.setData({ occStartMs: v, occStartText: pickText(v) });
    else this.setData({ occEndMs: v, occEndText: pickText(v) });
  },

  onPickerConfirm(e) {
    const v = e.detail;
    if (this._pickerField === 'start') this.setData({ occStartMs: v, occStartText: pickText(v), pickerShow: false });
    else this.setData({ occEndMs: v, occEndText: pickText(v), pickerShow: false });
  },

  pickStart() {
    this._pickerField = 'start';
    if (!this.data.occStartMs) this.setData({ occStartMs: Date.now() });
    this.setData({ pickerShow: true });
  },
  pickEnd() {
    this._pickerField = 'end';
    if (!this.data.occEndMs) this.setData({ occEndMs: Date.now() });
    this.setData({ pickerShow: true });
  },

  onLocChange(e) {
    const i = Number(e.detail.value);
    this.setData({ locIndex: i, occAddress: this.data.locAddresses[i] || '' });
  },

  onOccField(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onOccConfirm() {
    const rows = this.data.occurrences.slice();
    const start = this.data.occStartMs ? toLocalInput(this.data.occStartMs) : '';
    const end = this.data.occEndMs ? toLocalInput(this.data.occEndMs) : '';
    const row = {
      id: this.data.occIndex >= 0 ? rows[this.data.occIndex].id : undefined,
      startTime: start,
      endTime: end,
      startText: showTime(start),
      endText: showTime(end),
      address: this.data.occAddress,
      timeLimit: this.data.occTimeLimit,
    };
    if (this.data.occIndex >= 0) rows[this.data.occIndex] = row;
    else rows.push(row);
    this.setData({ occurrences: rows, occShow: false });
  },

  onOccDelete(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    wx.showModal({
      title: '删除场次',
      content: '确定删除该场次吗？',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        const rows = this.data.occurrences.slice();
        rows.splice(idx, 1);
        this.setData({ occurrences: rows });
      },
    });
  },

  occShowText(o) {
    return showTime(o.startTime);
  },

  // ── 保存 ──
  onSave() {
    if (this.data.saving) return;
    const name = (this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写培训名称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const typeName = this.data.typeIndex >= 0 ? this.data.typeNames[this.data.typeIndex] : '';
    const base = {
      name: name,
      typeName: typeName || undefined,
      campus: campusValue(this.data.campusOptions[this.data.campusIndex]) || null,
      ownerIds: this.data.owners.map((o) => o.id),
    };
    const rows = this.data.occurrences;
    const occBody = (o) => ({
      startTime: o.startTime || undefined,
      endTime: o.endTime || undefined,
      address: o.address || undefined,
      timeLimit: o.timeLimit ? Number(o.timeLimit) : undefined,
    });

    const id = this.data.editingId;
    const step = id
      ? api.fetchTraining(id).then((old) => {
          const existIds = (old && old.occurrences ? old.occurrences : []).map((o) => o.id);
          return api.updateTraining(id, base).then(() => {
            const jobs = [];
            existIds.forEach((oid) => {
              if (!rows.some((r) => r.id === oid)) jobs.push(api.deleteOccurrence(oid));
            });
            rows.forEach((o) => {
              jobs.push(o.id ? api.updateOccurrence(o.id, occBody(o)) : api.addOccurrence(id, occBody(o)));
            });
            return Promise.all(jobs);
          });
        })
      : api
          .createTraining(Object.assign({ code: 'training-' + Date.now() }, base))
          .then((created) => Promise.all(rows.map((o) => api.addOccurrence(created.id, occBody(o)))));

    step
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: id ? '已保存' : '已创建', icon: 'success' });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 900);
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  },
});
