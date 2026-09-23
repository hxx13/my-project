const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/trainingAdminApi.js');

const PAGE_PATH = '/package-feature/pages/trainingAdmin/review';

function showTime(s) {
  const raw = String(s || '').trim().replace('T', ' ');
  return raw.length >= 16 ? `${raw.slice(5, 10)} ${raw.slice(11, 16)}` : raw || '—';
}

function auditText(yn) {
  if (yn === 1) return '已通过';
  if (yn === 2) return '已拒绝';
  return '待审核';
}
function scoreText(f) {
  if (f === 1) return '合格';
  if (f === 2) return '不合格';
  return '待评分';
}
/** 未通过（含只过一道）→ 学生端可重新报名，管理员这里也能看到 */
function isPendingRow(e) {
  return (e.testYn || 0) === 0 || (e.testFraction || 0) === 0;
}

Page({
  data: {
    pageGateOk: false,
    loading: false,
    trainingName: '',
    campusText: '',
    onlyPending: true,
    total: 0,
    pending: 0,
    groups: [],
    // 房间下放
    roomShow: false,
    roomTargetName: '',
    roomPicked: [],
    roomRegions: [],
    activeRegion: '',
    activeFloor: '',
    floors: [],
    rooms: [],
  },

  onLoad(options) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.trainingId = Number((options && options.id) || 0);
    this.setData({ pageGateOk: true });
    this.load();
  },

  onShow() {
    if (this._accessDenied || !this.data.pageGateOk || !this.trainingId) return;
    if (this._loaded) return;
  },

  load() {
    if (!this.trainingId) {
      wx.showToast({ title: '缺少培训', icon: 'none' });
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.setData({ loading: true });
    api
      .fetchTraining(this.trainingId)
      .then((d) => {
        if (!d) throw new Error('培训不存在');
        this._detail = d;
        this._loaded = true;
        this.apply(d);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  apply(d) {
    let total = 0;
    let pending = 0;
    const groups = (d.occurrences || []).map((o) => {
      const rows = (o.enrollments || []).map((e) => {
        total += 1;
        if (isPendingRow(e)) pending += 1;
        return {
          id: e.id,
          name: e.name || '—',
          jobNumber: e.jobNumber || '—',
          projectGroup: e.projectGroup || '',
          testYn: e.testYn || 0,
          testFraction: e.testFraction || 0,
          auditText: auditText(e.testYn || 0),
          scoreText: scoreText(e.testFraction || 0),
          pendingRow: isPendingRow(e),
          roomIds: e.roomIds || [],
          roomText: (e.roomIds || []).length ? (e.roomIds || []).length + ' 间' : '无',
        };
      });
      return {
        id: o.id,
        timeText: showTime(o.startTime) + ' ~ ' + showTime(o.endTime),
        address: o.address || '—',
        rows: rows,
      };
    });
    this._groups = groups;
    this.setData({
      loading: false,
      trainingName: d.name || '',
      campusText: (d.campus || '').trim() || '未分组',
      total: total,
      pending: pending,
      groups: this.filterGroups(),
    });
  },

  filterGroups() {
    const only = this.data.onlyPending;
    return (this._groups || []).map((g) => ({
      id: g.id,
      timeText: g.timeText,
      address: g.address,
      rows: only ? g.rows.filter((r) => r.pendingRow) : g.rows,
    })).filter((g) => g.rows.length > 0);
  },

  onToggleOnly() {
    this.setData({ onlyPending: !this.data.onlyPending }, () => {
      this.setData({ groups: this.filterGroups() });
    });
  },

  onAudit(e) {
    const id = e.currentTarget.dataset.id;
    const state = Number(e.currentTarget.dataset.state);
    wx.showModal({
      title: state === 1 ? '审批通过' : '审批拒绝',
      content: state === 1 ? '通过后该学员进入培训名单。' : '拒绝后学员可重新报名。',
      confirmColor: state === 1 ? '#2563eb' : '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        api
          .auditEnrollment(id, state)
          .then(() => {
            wx.showToast({ title: state === 1 ? '已通过' : '已拒绝', icon: 'success' });
            this.load();
          })
          .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }));
      },
    });
  },

  onScore(e) {
    const id = e.currentTarget.dataset.id;
    const state = Number(e.currentTarget.dataset.state);
    wx.showModal({
      title: state === 1 ? '评分合格' : '评分不合格',
      content: '审批 + 评分双双通过才算该学员培训通过。',
      success: (res) => {
        if (!res.confirm) return;
        api
          .scoreEnrollment(id, state)
          .then(() => {
            wx.showToast({ title: state === 1 ? '已记合格' : '已记不合格', icon: 'success' });
            this.load();
          })
          .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }));
      },
    });
  },

  // ── 下放房间权限 ──
  onOpenRooms(e) {
    const id = Number(e.currentTarget.dataset.id);
    const name = e.currentTarget.dataset.name || '';
    const row = this._findRow(id);
    this.roomEnrollmentId = id;
    this.setData({ roomShow: true, roomTargetName: name, roomPicked: row ? row.roomIds.slice() : [] });
    if (!this._rooms) {
      api
        .fetchRooms()
        .then((list) => {
          this._rooms = list || [];
          this.buildRegions();
        })
        .catch((err) => wx.showToast({ title: err.message || '房间加载失败', icon: 'none' }));
    } else {
      this.buildRegions();
    }
  },

  _findRow(id) {
    const groups = this._groups || [];
    for (let i = 0; i < groups.length; i++) {
      const hit = groups[i].rows.filter((r) => r.id === id)[0];
      if (hit) return hit;
    }
    return null;
  },

  buildRegions() {
    const map = {};
    (this._rooms || []).forEach((r) => {
      if (!map[r.region]) map[r.region] = {};
      if (!map[r.region][r.floor]) map[r.region][r.floor] = [];
      map[r.region][r.floor].push(r);
    });
    this._roomMap = map;
    const regions = Object.keys(map);
    const activeRegion = regions.indexOf(this.data.activeRegion) >= 0 ? this.data.activeRegion : regions[0] || '';
    this.applyFloor(activeRegion, this.data.activeFloor);
  },

  applyFloor(region, floor) {
    const floors = region && this._roomMap[region] ? Object.keys(this._roomMap[region]) : [];
    const activeFloor = floors.indexOf(floor) >= 0 ? floor : floors[0] || '';
    const rooms = region && activeFloor ? this._roomMap[region][activeFloor] : [];
    this.setData({
      roomRegions: Object.keys(this._roomMap || {}),
      activeRegion: region,
      floors: floors,
      activeFloor: activeFloor,
      rooms: rooms.map((r) => ({ roomId: r.roomId, name: r.name, picked: this.data.roomPicked.indexOf(r.roomId) >= 0 })),
    });
  },

  onRoomRegion(e) {
    this.applyFloor(e.currentTarget.dataset.name, '');
  },

  onRoomFloor(e) {
    this.applyFloor(this.data.activeRegion, e.currentTarget.dataset.name);
  },

  onToggleRoom(e) {
    const roomId = String(e.currentTarget.dataset.id);
    const picked = this.data.roomPicked.slice();
    const at = picked.indexOf(roomId);
    if (at >= 0) picked.splice(at, 1);
    else picked.push(roomId);
    this.setData({
      roomPicked: picked,
      rooms: this.data.rooms.map((r) => ({ ...r, picked: picked.indexOf(r.roomId) >= 0 })),
    });
  },

  onRoomClose() {
    this.setData({ roomShow: false });
  },

  onRoomSave() {
    if (this._savingRooms) return;
    this._savingRooms = true;
    api
      .setEnrollmentRooms(this.roomEnrollmentId, this.data.roomPicked)
      .then(() => {
        this._savingRooms = false;
        this.setData({ roomShow: false });
        wx.showToast({ title: '已下放 ' + this.data.roomPicked.length + ' 间', icon: 'success' });
        this.load();
      })
      .catch((err) => {
        this._savingRooms = false;
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  },
});
