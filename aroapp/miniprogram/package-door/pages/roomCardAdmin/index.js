/**
 * 房卡管理（小程序版 /#/console/debug-cards 的「房间监控」）
 * 卡面沿用房间系统 pages/room 的铭牌卡（房名 + 容量圆点），数据面合并房卡大盘。
 * 可配置项只保留「限载/可进入人数」（用户口径：其他配置项过于繁琐，不放这里）。
 *
 * 接口：
 *   GET  /api/v1/twin/config/rooms                                  房间坐标配置（含 capacity）
 *   GET  /api/v1/twin/cards/status                                  实时大盘（自有卡/领卡/在场人）
 *   PUT  /api/v1/twin/config/rooms/{id}/capacity?capacity=N         改限载
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

const CAMPUS_TABS = ['浦东', '浦西'];
const MAX_DOTS = 12;

function body(res) {
  const raw = res ? res.data : null;
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/** 大盘接口在 web 侧直接用 res.data（裸数组），配置接口走 Result 信封 —— 两种都吃 */
function unwrapList(res) {
  const b = body(res);
  if (Array.isArray(b)) return b;
  if (b && b.success === true && Array.isArray(b.data)) return b.data;
  return null;
}

function splitBindIds(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .replace(/，/g, ',')
    .split(/[,;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 配置 ↔ 大盘 匹配：流水 ID 精确优先，房名/别名兜底（同 web configMatchesTwinStatus） */
function configMatchesStatus(config, status) {
  const rawName = String(status.roomName || '').trim();
  const sid = status.roomId != null && status.roomId !== '' ? String(status.roomId).trim() : '';
  const binds = splitBindIds(config.capacityBindRoomId);
  if (binds.length > 0 && sid && binds.indexOf(sid) >= 0) return true;
  if (rawName && rawName === String(config.roomName || '').trim()) return true;
  if (config.mappingAliases) {
    const aliases = splitBindIds(config.mappingAliases);
    if (aliases.indexOf(rawName) >= 0) return true;
  }
  return false;
}

/** 同名多行（后室共限载）合并为一张卡（同 web mergeTwinInventoryRows） */
function mergeRows(rows) {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const first = rows[0];
  let campus = 0;
  let borrowed = 0;
  let occ = [];
  rows.forEach((r) => {
    campus += Number(r.campusUserCount) || 0;
    borrowed += Number(r.borrowedCardCount) || 0;
    if (Array.isArray(r.occupants)) occ = occ.concat(r.occupants);
  });
  return {
    areaName: first.areaName,
    roomName: first.roomName,
    roomId: first.roomId,
    totalCapacity: first.totalCapacity,
    campusUserCount: campus,
    borrowedCardCount: borrowed,
    occupants: occ,
  };
}

/** 占用率五段色：1 最松 → 5 最紧（与 pages/room 同口径） */
function occupancyLevel(used, total) {
  if (total <= 0 || used <= 0) return 1;
  const r = used / total;
  if (r <= 0.2) return 1;
  if (r <= 0.4) return 2;
  if (r <= 0.6) return 3;
  if (r <= 0.8) return 4;
  return 5;
}

function naturalCompare(a, b) {
  try {
    return String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
  } catch (e) {
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
}

function entryTypeLabel(type) {
  return String(type || '').toUpperCase() === 'OWN_CARD' ? '自带校卡' : '公卡领借';
}

/** 卡片渲染数据：房间系统铭牌卡的几何 + 房卡大盘的数字 */
function buildCard(config, status) {
  const capacity = Math.max(0, Number(config.capacity) || 0);
  const campusUserCount = status ? Number(status.campusUserCount) || 0 : 0;
  const borrowedCardCount = status ? Number(status.borrowedCardCount) || 0 : 0;
  const total = campusUserCount + borrowedCardCount;
  const remaining = Math.max(0, capacity - total);

  const shown = capacity > 0 ? Math.min(capacity, MAX_DOTS) : 0;
  const lit = capacity <= 0 || shown <= 0 ? 0 : Math.min(shown, Math.max(0, Math.round((total * shown) / capacity)));
  const lev = occupancyLevel(total, capacity);
  const dotList = [];
  for (let i = 0; i < shown; i += 1) {
    dotList.push({ colorClass: i < lit ? 'rc-dot-l' + lev : 'rc-dot-free' });
  }

  const roomName = String(config.roomName || '');
  const splitIdx = roomName.indexOf('-');
  const label = (splitIdx >= 0 ? roomName.slice(splitIdx + 1) : roomName) || '未知房间';
  const len = label.length;
  const nameFontRpx = Math.max(14, Math.min(28, Math.floor(248 / Math.max(len * 0.9, 3))));
  const estNameWidth = len * nameFontRpx * 0.88;
  const nameBudgetRpx = 248;
  let nameScale = 1;
  if (estNameWidth > nameBudgetRpx) {
    nameScale = Math.max(0.55, nameBudgetRpx / estNameWidth);
    nameScale = Math.round(nameScale * 1000) / 1000;
  }

  return {
    configId: config.id,
    roomName,
    shortName: label,
    nameFontRpx,
    nameScale,
    dotList,
    dotGapRpx: shown > 10 ? 5 : shown > 7 ? 6 : 8,
    capacity,
    campusUserCount,
    borrowedCardCount,
    totalCount: total,
    remaining,
    aliasText: config.mappingAliases || '',
    occupantRows: (status && Array.isArray(status.occupants) ? status.occupants : []).map((o) => ({
      userName: o.userName || '未知',
      projectGroup: o.projectGroup || '',
      entryTime: o.entryTime || '—',
      entryTypeLabel: entryTypeLabel(o.entryType),
    })),
  };
}

Page({
  data: {
    loading: true,
    error: '',
    campi: CAMPUS_TABS,
    activeTab: CAMPUS_TABS[0],
    cards: [],
    // 详情
    showDetail: false,
    detailCard: null,
    // 限载编辑
    showCapEdit: false,
    capTargetId: '',
    capTargetName: '',
    capDraft: '',
    capSaving: false,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '需要教职工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return;
    }
    this.load();
  },

  load() {
    const self = this;
    this.setData({ loading: true, error: '' });
    Promise.all([
      springAuth.springRequest({ url: '/api/v1/twin/config/rooms', method: 'GET', data: {} }),
      springAuth
        .springRequest({ url: '/api/v1/twin/cards/status', method: 'GET', data: {} })
        .catch(() => ({ statusCode: 0, data: null })),
    ])
      .then((results) => {
        const configs = unwrapList(results[0]);
        if (configs == null) {
          const b = body(results[0]);
          self.setData({
            loading: false,
            error: (b && b.message) || '房间配置加载失败',
            cards: [],
          });
          return;
        }
        const inventory = unwrapList(results[1]) || [];
        self._configs = configs;
        self._inventory = inventory;
        self.setData({ loading: false, error: '' });
        self.applyTab(self.data.activeTab);
      })
      .catch((err) => {
        self.setData({ loading: false, error: (err && err.message) || '网络请求失败', cards: [] });
      });
  },

  applyTab(campus) {
    const configs = (this._configs || []).filter((c) => String(c.campus || '') === campus);
    const inventory = this._inventory || [];
    const cards = configs
      .slice()
      .sort((a, b) => naturalCompare(a.roomName, b.roomName))
      .map((config) =>
        buildCard(
          config,
          mergeRows(inventory.filter((s) => configMatchesStatus(config, s)))
        )
      );
    this.setData({ activeTab: campus, cards });
  },

  onTabTap(e) {
    const campus = String(e.currentTarget.dataset.campus || '');
    if (!campus || campus === this.data.activeTab) return;
    this.applyTab(campus);
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    const card = this.data.cards.find((c) => String(c.configId) === String(id));
    if (!card) return;
    this.setData({ showDetail: true, detailCard: card });
  },

  closeDetail() {
    this.setData({ showDetail: false, detailCard: null });
  },

  /* ─────────── 限载（可进入人数）编辑 ─────────── */

  onPencilTap(e) {
    const id = e.currentTarget.dataset.id;
    const card = this.data.cards.find((c) => String(c.configId) === String(id));
    if (!card) return;
    this.setData({
      showCapEdit: true,
      capTargetId: card.configId,
      capTargetName: card.roomName,
      capDraft: String(card.capacity),
    });
  },

  onCapInput(e) {
    this.setData({ capDraft: e.detail.value });
  },

  /** 仅用于弹窗卡片的 catchtap：拦住冒泡，避免点卡片正文误关弹窗 */
  onCapNoop() {},

  closeCapEdit() {
    if (this.data.capSaving) return;
    this.setData({ showCapEdit: false, capTargetId: '', capTargetName: '', capDraft: '' });
  },

  onCapSave() {
    const self = this;
    const id = this.data.capTargetId;
    const cap = parseInt(this.data.capDraft, 10);
    if (!id || this.data.capSaving) return;
    if (!(cap > 0)) {
      wx.showToast({ title: '请输入大于 0 的人数', icon: 'none' });
      return;
    }
    this.setData({ capSaving: true });
    // capacity 走 query 参数（后端 @RequestParam），不能塞 body
    springAuth
      .springRequest({
        url: '/api/v1/twin/config/rooms/' + id + '/capacity?capacity=' + cap,
        method: 'PUT',
        data: {},
      })
      .then((res) => {
        const b = body(res);
        if (!b || b.success !== true) {
          throw new Error((b && (b.message || b.msg)) || '保存失败');
        }
        wx.showToast({ title: '限载已更新', icon: 'success' });
        // 本地就地更新，避免整表重拉
        const idx = (self._configs || []).findIndex((c) => String(c.id) === String(id));
        if (idx >= 0) self._configs[idx].capacity = cap;
        self.setData({ showCapEdit: false, capTargetId: '', capTargetName: '', capDraft: '', capSaving: false });
        self.applyTab(self.data.activeTab);
      })
      .catch((err) => {
        self.setData({ capSaving: false });
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  },

  onRetry() {
    this.load();
  },
});
