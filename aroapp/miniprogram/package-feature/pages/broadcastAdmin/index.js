/**
 * 网络广播管理（小程序端，ADMIN+）。
 *
 * 与后台页同源：走 /api/admin/broadcast/**，权限也是 ADMIN。
 * 定时方案存本系统，到点由本系统下发播放，广播主机只负责出声。
 *
 * 排布：连接状态常驻顶部 + 分段切「定时方案 / 分区与播放 / 播放记录」。
 * 手机端**不做**曲库上传（用户明确要求）。
 */
const broadcastApi = require('../../utils/broadcastApi.js');
const pagePermission = require('../../../utils/pagePermission.js');
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

const PAGE_PATH = '/package-feature/pages/broadcastAdmin/index';
const FALLBACK_ROLE = 'ADMIN';
const LOG_STEP = 40;
const LOG_MAX = 400;
/** 左滑露出两个按钮的宽度（rpx）—— 与 wxss 里 .bc-song-act 的 72rpx × 2 对应 */
const SONG_ACTION_W = 144;

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 秒 → m:ss；取不到返回空串 */
function fmtDur(sec) {
  const s = Number(sec);
  if (!s || s <= 0) return '';
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

function emptyForm() {
  return {
    planName: '',
    enabled: true,
    timeMode: '0',
    days: [1, 2, 3, 4, 5, 6, 7],
    startDate: '',
    endDate: '',
    startTime: '09:00',
    endTime: '10:00',
    volume: '',
    zoneSel: [],
    songSel: [],
    songListId: '',
    loopPlay: false,
  };
}

function weekItems(days) {
  return WEEK_LABELS.map(function (label, i) {
    return { day: i + 1, label: label, on: days.indexOf(i + 1) >= 0 };
  });
}

function shortTime(v) {
  if (!v) return '—';
  const s = String(v);
  const idx = s.indexOf('T');
  const time = idx >= 0 ? s.slice(idx + 1, idx + 6) : s.slice(11, 16);
  return time || '—';
}

function todayStr() {
  const d = new Date();
  const p = function (n) {
    return n < 10 ? '0' + n : '' + n;
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

Page({
  data: {
    // 主区就是「分区与播放」；定时方案与播放记录收成状态行上的两个按钮，点开抽屉
    plansOpen: false,
    logsOpen: false,
    planCount: 0,
    busy: false,

    statusText: '未连接',
    statusIcon: 'close',
    statusColor: '#dc2626',
    lastError: '',

    plans: [],
    zones: [],
    zonesHint: '加载中…',
    songs: [],
    songOptions: [],
    songLists: [],
    songPath: '',
    songName: '',
    songDurText: '--:--',
    playingCount: 0,
    /** 底栏音量滑条的值，松手才作用到已选分区 */
    volume: 50,
    selCount: 0,
    selAll: false,
    playLabel: '播放',
    stopLabel: '停止',
    canPlay: false,

    logs: [],
    logLoading: false,
    logHasMore: true,
    logLimit: LOG_STEP,

    editorOpen: false,
    editorId: null,
    saving: false,
    timeModeOptions: [
      { value: '0', label: '按周循环' },
      { value: '1', label: '按日期区间' },
    ],
    weekItems: weekItems([1, 2, 3, 4, 5, 6, 7]),
    allZonesPicked: false,
    allSongsPicked: false,
    f: emptyForm(),
  },

  onShow() {
    // 触摸位移是 px、滑条偏移用 rpx，换算比只跟屏幕宽有关，进页面算一次
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._rpxPerPx = 750 / (win.windowWidth || 375);

    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, FALLBACK_ROLE)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(function () {
        wx.navigateBack({ delta: 1 });
      }, 300);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, PAGE_PATH, role, FALLBACK_ROLE)) {
      return;
    }
    this.refreshAll();
  },

  refreshAll() {
    this.loadStatus();
    this.loadZones();
    this.loadSongs();
    this.loadPlans();
    this.loadLogs(true);
  },

  // ------------------------------------------------------------ 连接

  async loadStatus() {
    try {
      const s = await broadcastApi.getStatus();
      const loggedIn = !!(s && s.loggedIn);
      const connected = !!(s && s.connected);
      this.setData({
        statusText: loggedIn ? '已连接' : connected ? '未登录' : '未连接',
        statusIcon: loggedIn ? 'checked' : connected ? 'warning-o' : 'close',
        statusColor: loggedIn ? '#16a34a' : connected ? '#f59e0b' : '#dc2626',
        lastError: (s && s.lastError) || '',
      });
    } catch (e) {
      this.setData({ statusText: '读取失败', statusIcon: 'close', statusColor: '#dc2626', lastError: e.message || '' });
    }
  },

  async onReconnect() {
    // 重连 + 重登合成一个入口：relogin 在断线时会先重连、连着则只重登
    this.runStatusAction('重新连接', broadcastApi.relogin);
  },

  async runStatusAction(label, fn) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await fn();
      wx.showToast({ title: label + '已发起', icon: 'none' });
      await new Promise(function (r) {
        setTimeout(r, 3000);
      });
      await this.loadStatus();
      await this.loadZones();
    } catch (e) {
      wx.showToast({ title: e.message || label + '失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  onOpenPlans() {
    this.loadPlans();
    this.setData({ plansOpen: true });
  },

  onClosePlans() {
    this.setData({ plansOpen: false });
  },

  onOpenLogs() {
    this.setData({ logsOpen: true });
    this.loadLogs(true);
  },

  onCloseLogs() {
    this.setData({ logsOpen: false });
  },

  /** 右上角「更多」：方案 / 记录 / 重连都收在这里，顶部只留状态一行 */
  onMore() {
    const self = this;
    wx.showActionSheet({
      itemList: [
        '定时方案' + (this.data.planCount ? ' (' + this.data.planCount + ')' : ''),
        '播放记录',
        '重新连接',
      ],
      success: function (r) {
        if (r.tapIndex === 0) self.onOpenPlans();
        else if (r.tapIndex === 1) self.onOpenLogs();
        else if (r.tapIndex === 2) self.onReconnect();
      },
    });
  },

  // ------------------------------------------------------------ 方案

  async loadPlans() {
    try {
      const plans = await broadcastApi.listPlans();
      const today = todayStr();
      plans.forEach(function (p) {
        p.lastFiredText = p.lastFiredAt
          ? (p.lastFiredDate === today ? '今日 ' : '') + shortTime(p.lastFiredAt)
          : '—';
      });
      this.setData({ plans: plans, planCount: plans.length });
    } catch (e) {
      wx.showToast({ title: e.message || '方案加载失败', icon: 'none' });
    }
  },

  async onTogglePlan(e) {
    const id = e.currentTarget.dataset.id;
    const enabled = !!(e.detail && e.detail.value);
    try {
      await broadcastApi.togglePlan(id, enabled);
      wx.showToast({ title: enabled ? '已启用' : '已停用', icon: 'none' });
      this.loadPlans();
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      this.loadPlans();
    }
  },

  onRunPlan(e) {
    const id = e.currentTarget.dataset.id;
    const self = this;
    wx.showModal({
      title: '立刻试跑',
      content: '会立即向该方案的分区下发播放，确定吗？',
      success: async function (r) {
        if (!r.confirm) return;
        try {
          await broadcastApi.runPlan(id);
          wx.showToast({ title: '已下发播放', icon: 'none' });
          self.loadPlans();
          self.loadLogs(true);
        } catch (err) {
          wx.showToast({ title: err.message || '试跑失败', icon: 'none' });
        }
      },
    });
  },

  onDeletePlan(e) {
    const id = e.currentTarget.dataset.id;
    const self = this;
    wx.showModal({
      title: '删除方案',
      content: '确定删除这个定时方案？',
      confirmColor: '#dc2626',
      success: async function (r) {
        if (!r.confirm) return;
        try {
          await broadcastApi.removePlan(id);
          wx.showToast({ title: '已删除', icon: 'none' });
          self.loadPlans();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ------------------------------------------------------------ 方案编辑器

  onOpenCreate() {
    this.setData({
      editorOpen: true,
      editorId: null,
      f: emptyForm(),
      weekItems: weekItems([1, 2, 3, 4, 5, 6, 7]),
      allZonesPicked: false,
      allSongsPicked: false,
      zones: this.data.zones.map(function (z) {
        return Object.assign({}, z, { picked: false });
      }),
      songOptions: this.data.songOptions.map(function (s) {
        return Object.assign({}, s, { picked: false });
      }),
    });
  },

  onEditPlan(e) {
    const id = e.currentTarget.dataset.id;
    const plan = (this.data.plans || []).find(function (p) {
      return String(p.id) === String(id);
    });
    if (!plan) return;
    const zoneSel = plan.zoneList || [];
    const songSel = plan.songList || [];
    const days = String(plan.weekDays || '')
      .split('')
      .filter(Boolean)
      .map(Number);
    const f = {
      planName: plan.planName || '',
      enabled: !!plan.enabled,
      timeMode: String(plan.timeMode == null ? 0 : plan.timeMode),
      days: days.length ? days : [1, 2, 3, 4, 5, 6, 7],
      startDate: plan.startDate || '',
      endDate: plan.endDate || '',
      startTime: String(plan.startTime || '09:00').slice(0, 5),
      endTime: String(plan.endTime || '10:00').slice(0, 5),
      volume: plan.volume == null ? '' : String(plan.volume),
      zoneSel: zoneSel.slice(),
      songSel: songSel.slice(),
      songListId: plan.songListId || '',
      loopPlay: !!plan.loopPlay,
    };
    this.setData({
      editorOpen: true,
      editorId: plan.id,
      f: f,
      weekItems: weekItems(f.days),
      allZonesPicked: this.data.zones.length > 0 && f.zoneSel.length === this.data.zones.length,
      allSongsPicked: this.data.songOptions.length > 0 && f.songSel.length === this.data.songOptions.length,
      zones: this.data.zones.map(function (z) {
        return Object.assign({}, z, { picked: f.zoneSel.indexOf(z.mac) >= 0 });
      }),
      songOptions: this.data.songOptions.map(function (s) {
        return Object.assign({}, s, { picked: f.songSel.indexOf(s.value) >= 0 });
      }),
    });
  },

  onEditorClose() {
    this.setData({ editorOpen: false, saving: false });
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    const patch = {};
    patch['f.' + field] = e.detail.value;
    this.setData(patch);
  },

  onEnabledChange(e) {
    this.setData({ 'f.enabled': !!(e.detail && e.detail.value) });
  },

  onLoopPlayChange(e) {
    this.setData({ 'f.loopPlay': !!(e.detail && e.detail.value) });
  },

  onTimeModeChange(e) {
    this.setData({ 'f.timeMode': String((e.detail && e.detail.value) || '0') });
  },

  onToggleWeek(e) {
    const day = Number(e.currentTarget.dataset.day);
    const days = this.data.f.days.slice();
    const i = days.indexOf(day);
    if (i >= 0) days.splice(i, 1);
    else days.push(day);
    days.sort(function (a, b) {
      return a - b;
    });
    this.setData({ 'f.days': days, weekItems: weekItems(days) });
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    const patch = {};
    patch['f.' + field] = e.detail.value;
    this.setData(patch);
  },

  onTimeChange(e) {
    const field = e.currentTarget.dataset.field;
    const patch = {};
    patch['f.' + field] = e.detail.value;
    this.setData(patch);
  },

  onToggleEditorZone(e) {
    const mac = e.currentTarget.dataset.mac;
    const sel = this.data.f.zoneSel.slice();
    const i = sel.indexOf(mac);
    if (i >= 0) sel.splice(i, 1);
    else sel.push(mac);
    this.setData({
      'f.zoneSel': sel,
      zones: this.data.zones.map(function (z) {
        return Object.assign({}, z, { picked: sel.indexOf(z.mac) >= 0 });
      }),
      allZonesPicked: this.data.zones.length > 0 && sel.length === this.data.zones.length,
    });
  },

  onToggleEditorSong(e) {
    const path = e.currentTarget.dataset.path;
    const sel = this.data.f.songSel.slice();
    const i = sel.indexOf(path);
    if (i >= 0) sel.splice(i, 1);
    else sel.push(path);
    const picked = this.data.songOptions.find(function (s) {
      return s.value === path;
    });
    const patch = { 'f.songSel': sel };
    if (picked && picked.listId) patch['f.songListId'] = picked.listId;
    patch.songOptions = this.data.songOptions.map(function (s) {
      return Object.assign({}, s, { picked: sel.indexOf(s.value) >= 0 });
    });
    patch.allSongsPicked = this.data.songOptions.length > 0 && sel.length === this.data.songOptions.length;
    this.setData(patch);
  },

  onToggleAllEditorZones() {
    const all = !this.data.allZonesPicked;
    const sel = all
      ? this.data.zones.map(function (z) {
          return z.mac;
        })
      : [];
    this.setData({
      'f.zoneSel': sel,
      allZonesPicked: all,
      zones: this.data.zones.map(function (z) {
        return Object.assign({}, z, { picked: all });
      }),
    });
  },

  onToggleAllEditorSongs() {
    const all = !this.data.allSongsPicked;
    const sel = all
      ? this.data.songOptions.map(function (s) {
          return s.value;
        })
      : [];
    const first = this.data.songOptions[0];
    const patch = {
      'f.songSel': sel,
      allSongsPicked: all,
      songOptions: this.data.songOptions.map(function (s) {
        return Object.assign({}, s, { picked: all });
      }),
    };
    if (all && first && first.listId) patch['f.songListId'] = first.listId;
    this.setData(patch);
  },

  async onSavePlan() {
    if (this.data.saving) return;
    const f = this.data.f;
    const name = String(f.planName || '').trim();
    if (!name) return wx.showToast({ title: '请填方案名称', icon: 'none' });
    if (f.startTime >= f.endTime) return wx.showToast({ title: '结束时刻要晚于开始时刻', icon: 'none' });
    if (f.timeMode === '0' && !f.days.length) return wx.showToast({ title: '请至少选一个星期', icon: 'none' });
    if (f.timeMode === '1' && (!f.startDate || !f.endDate)) return wx.showToast({ title: '请填起止日期', icon: 'none' });
    if (!f.zoneSel.length) return wx.showToast({ title: '请至少选一个分区', icon: 'none' });
    if (!f.songSel.length) return wx.showToast({ title: '请至少选一首曲目', icon: 'none' });

    const body = {
      planName: name,
      enabled: !!f.enabled,
      timeMode: Number(f.timeMode),
      weekDays: f.timeMode === '0' ? f.days.join('') : null,
      startDate: f.timeMode === '1' ? f.startDate : null,
      endDate: f.timeMode === '1' ? f.endDate : null,
      startTime: f.startTime.length === 5 ? f.startTime + ':00' : f.startTime,
      endTime: f.endTime.length === 5 ? f.endTime + ':00' : f.endTime,
      volume: f.volume === '' ? null : Number(f.volume),
      zoneMacs: f.zoneSel,
      songPaths: f.songSel,
      songListId: f.songListId || null,
      loopPlay: !!f.loopPlay,
    };

    this.setData({ saving: true });
    try {
      if (this.data.editorId) {
        await broadcastApi.updatePlan(this.data.editorId, body);
      } else {
        await broadcastApi.createPlan(body);
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ editorOpen: false });
      this.loadPlans();
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // ------------------------------------------------------------ 分区与播放

  async loadZones() {
    try {
      const d = await broadcastApi.listZones();
      const sel = this.data.zones
        .filter(function (z) {
          return z.selected;
        })
        .map(function (z) {
          return z.mac;
        });
      const zones = (d.zones || []).map(function (z) {
        // 状态类型由平台状态码直接映射（1 播放中 / 2 已暂停 / 其余空闲），
        // 不在模板里比字符串——那样改文案就会静默失效
        const status = Number(z.playStatus);
        return {
          id: z.id,
          name: z.name,
          ip: z.ip,
          mac: z.mac,
          volume: z.volume,
          playing: !!z.playing,
          stateKind: status === 1 ? 'playing' : status === 2 ? 'paused' : 'idle',
          stateText: z.playStatusText || '',
          currentSong: z.currentSong || '',
          selected: sel.indexOf(z.mac) >= 0,
        };
      });
      this.setData({
        zones: zones,
        zonesHint: d.loggedIn ? '未读取到分区' : '平台未登录，点上方「重新登录」',
      });
      this.syncPlayState();
    } catch (e) {
      this.setData({ zonesHint: e.message || '分区读取失败' });
    }
  },

  syncPlayState() {
    const sel = this.data.zones.filter(function (z) {
      return z.selected;
    });
    const n = sel.length;
    const songPath = this.data.songPath;
    const song = this.data.songs.find(function (s) {
      return s.pathName === songPath;
    });
    this.setData({
      selCount: n,
      selAll: this.data.zones.length > 0 && n === this.data.zones.length,
      // 按钮上带数量：点下去之前就知道会影响几路
      playLabel: '播放' + (n > 0 ? '(' + n + ')' : ''),
      stopLabel: '停止' + (n > 0 ? '(' + n + ')' : ''),
      canPlay: n > 0 && !!songPath,
      playingCount: sel.filter(function (z) {
        return z.playing;
      }).length,
      songDurText: (song && song.durText) || '--:--',
    });
  },

  onToggleZone(e) {
    const mac = e.currentTarget.dataset.mac;
    const zones = this.data.zones.map(function (z) {
      return z.mac === mac ? Object.assign({}, z, { selected: !z.selected }) : z;
    });
    this.setData({ zones: zones });
    this.syncPlayState();
  },

  /** 滑条外层用 catchtap 吞冒泡，需要一个空处理器接住 */
  noop() {},

  /** 拖动过程中只改本地显示，不发请求（否则一路狂发） */
  onZoneVolumeChanging(e) {
    const mac = e.currentTarget.dataset.mac;
    const v = Number(e.detail.value);
    this.setData({
      zones: this.data.zones.map(function (z) {
        return z.mac === mac ? Object.assign({}, z, { volume: v }) : z;
      }),
    });
  },

  /** 松手才提交这一路的音量 */
  async onZoneVolumeChange(e) {
    const mac = e.currentTarget.dataset.mac;
    const v = Number(e.detail.value);
    try {
      await broadcastApi.setVolume([mac], v);
      wx.showToast({ title: '音量 ' + v, icon: 'none' });
    } catch (err) {
      wx.showToast({ title: err.message || '设置音量失败', icon: 'none' });
      this.loadZones();
    }
  },

  onSelectAll() {
    const all = !this.data.selAll;
    const zones = this.data.zones.map(function (z) {
      return Object.assign({}, z, { selected: all });
    });
    this.setData({ zones: zones });
    this.syncPlayState();
  },

  async loadSongs() {
    try {
      const lists = await broadcastApi.listSongLists();
      const self = this;
      // 两条消费路径：列表（songs，支持左滑管理）与方案编辑器（songOptions，多选）。
      // 同一次请求铺两份，省得两处各拉一遍。
      const songs = [];
      const songOptions = [];
      lists.forEach(function (l) {
        (l.songs || []).forEach(function (s) {
          songs.push({
            pathName: s.pathName,
            fileName: s.fileName,
            listId: l.id,
            listName: l.name,
            listCount: l.songCount,
            durText: fmtDur(s.durationSeconds),
            offsetX: 0,
            selected: s.pathName === self.data.songPath,
          });
          songOptions.push({
            value: s.pathName,
            label: s.fileName,
            desc: l.name,
            listId: l.id,
            picked: false,
          });
        });
      });
      const patch = { songs: songs, songOptions: songOptions, songLists: lists };
      if (!this.data.songPath && songs.length > 0) {
        patch.songPath = songs[0].pathName;
        patch.songName = songs[0].fileName;
        songs[0].selected = true;
      }
      this.setData(patch);
      this.syncPlayState();
    } catch (e) {
      wx.showToast({ title: e.message || '曲库加载失败', icon: 'none' });
    }
  },

  /** 点一下选中该曲目（播放从它开始，平台会接着放完整个列表） */
  onTapSong(e) {
    // 刚才是滑动，不是点击 —— 别把"划开"当成"选中"
    if (this._suppressTap) {
      this._suppressTap = false;
      return;
    }
    const key = e.currentTarget.dataset.key;
    const song = this.data.songs.find(function (s) {
      return s.pathName === key;
    });
    if (!song) return;
    this.setData({
      songPath: song.pathName,
      songName: song.fileName,
      songs: this.data.songs.map(function (s) {
        return Object.assign({}, s, { selected: s.pathName === key, offsetX: 0 });
      }),
    });
    this.syncPlayState();
  },

  // ------------------------------------------------------------ 左滑（露出移动/移出）

  onSongTouchStart(e) {
    const key = e.currentTarget.dataset.key;
    const song = this.data.songs.find(function (s) {
      return s.pathName === key;
    });
    this._touch = {
      key: key,
      startX: e.touches[0].clientX,
      base: song && song.offsetX ? song.offsetX : 0,
      off: song && song.offsetX ? song.offsetX : 0,
      moved: false,
    };
  },

  onSongTouchMove(e) {
    const t = this._touch;
    if (!t) return;
    // 触摸位移是 px，offsetX 用 rpx —— 换算一下，否则小屏划不动、大屏一划到底
    const dx = (e.touches[0].clientX - t.startX) * this._rpxPerPx;
    if (Math.abs(dx) > 8) t.moved = true;
    let off = t.base + dx;
    if (off > 0) off = 0;
    if (off < -SONG_ACTION_W) off = -SONG_ACTION_W;
    t.off = off;
    this.setSongOffset(t.key, Math.round(off));
  },

  onSongTouchEnd() {
    const t = this._touch;
    this._touch = null;
    if (!t) return;
    this._suppressTap = t.moved;
    const open = t.off <= -SONG_ACTION_W / 2;
    // 一次只留一行打开
    this.setData({
      songs: this.data.songs.map(function (s) {
        if (s.pathName === t.key) return Object.assign({}, s, { offsetX: open ? -SONG_ACTION_W : 0 });
        return s.offsetX ? Object.assign({}, s, { offsetX: 0 }) : s;
      }),
    });
  },

  setSongOffset(key, off) {
    this.setData({
      songs: this.data.songs.map(function (s) {
        return s.pathName === key ? Object.assign({}, s, { offsetX: off }) : s;
      }),
    });
  },

  /** 移动到别的列表 */
  onMoveSong(e) {
    const key = e.currentTarget.dataset.key;
    const song = this.data.songs.find(function (s) {
      return s.pathName === key;
    });
    if (!song) return;
    const targets = (this.data.songLists || []).filter(function (l) {
      return l.id !== song.listId;
    });
    if (!targets.length) {
      wx.showToast({ title: '只有这一个列表，先新建一个', icon: 'none' });
      return;
    }
    const self = this;
    wx.showActionSheet({
      itemList: targets.map(function (l) {
        return '移到「' + l.name + '」';
      }),
      success: async function (r) {
        const to = targets[r.tapIndex];
        if (!to) return;
        try {
          await broadcastApi.moveSongToList(song.listId, to.id, song.pathName);
          wx.showToast({ title: '已移动', icon: 'none' });
          self.loadSongs();
        } catch (err) {
          wx.showToast({ title: err.message || '移动失败', icon: 'none' });
          self.setSongOffset(key, 0);
        }
      },
      fail: function () {
        self.setSongOffset(key, 0);
      },
    });
  },

  /** 从当前列表移出（**不删音频文件**） */
  onRemoveSong(e) {
    const key = e.currentTarget.dataset.key;
    const song = this.data.songs.find(function (s) {
      return s.pathName === key;
    });
    if (!song) return;
    const self = this;
    wx.showModal({
      title: '移出列表',
      content: '把「' + song.fileName + '」从列表移出？音频文件会保留。',
      confirmColor: '#dc2626',
      success: async function (r) {
        if (!r.confirm) {
          self.setSongOffset(key, 0);
          return;
        }
        try {
          await broadcastApi.removeSongFromList(song.listId, song.pathName);
          wx.showToast({ title: '已移出', icon: 'none' });
          self.loadSongs();
        } catch (err) {
          wx.showToast({ title: err.message || '移出失败', icon: 'none' });
          self.setSongOffset(key, 0);
        }
      },
    });
  },

  // ------------------------------------------------------------ 列表（文件夹）本身

  onCreateSongList() {
    const self = this;
    wx.showModal({
      title: '新建列表',
      editable: true,
      placeholderText: '列表名称，如：钢琴曲2',
      success: async function (r) {
        const name = (r.content || '').trim();
        if (!r.confirm || !name) return;
        try {
          await broadcastApi.createSongList(name);
          wx.showToast({ title: '已新建', icon: 'none' });
          self.loadSongs();
        } catch (err) {
          wx.showToast({ title: err.message || '新建失败', icon: 'none' });
        }
      },
    });
  },

  onRenameSongList(e) {
    const listId = e.currentTarget.dataset.list;
    const oldName = e.currentTarget.dataset.name;
    const self = this;
    wx.showModal({
      title: '列表改名',
      editable: true,
      content: oldName,
      placeholderText: '新名称',
      success: async function (r) {
        const name = (r.content || '').trim();
        if (!r.confirm || !name || name === oldName) return;
        try {
          await broadcastApi.renameSongList(listId, name);
          wx.showToast({ title: '已改名', icon: 'none' });
          self.loadSongs();
        } catch (err) {
          wx.showToast({ title: err.message || '改名失败', icon: 'none' });
        }
      },
    });
  },

  onRemoveSongList(e) {
    const listId = e.currentTarget.dataset.list;
    const name = e.currentTarget.dataset.name;
    const count = Number(e.currentTarget.dataset.count || 0);
    const extra = count > 0 ? '，里面的 ' + count + ' 首不会被删' : '';
    const self = this;
    wx.showModal({
      title: '删除列表',
      content: '删除「' + name + '」' + extra + '？',
      confirmColor: '#dc2626',
      success: async function (r) {
        if (!r.confirm) return;
        try {
          await broadcastApi.removeSongList(listId);
          wx.showToast({ title: '已删除', icon: 'none' });
          self.loadSongs();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      },
    });
  },

  /** 音量滑条：拖动中只改本地值 */
  onVolumeChanging(e) {
    this.setData({ volume: Number(e.detail.value) });
  },

  /** 松手才提交，作用到已选分区 */
  async onVolumeCommit(e) {
    const v = Number(e.detail.value);
    this.setData({ volume: v });
    const macs = this.selectedMacs();
    if (!macs.length) {
      wx.showToast({ title: '先勾选分区', icon: 'none' });
      return;
    }
    try {
      await broadcastApi.setVolume(macs, v);
      wx.showToast({ title: '音量 ' + v, icon: 'none' });
      this.loadZones();
    } catch (err) {
      wx.showToast({ title: err.message || '设置音量失败', icon: 'none' });
    }
  },

  selectedMacs() {
    return this.data.zones
      .filter(function (z) {
        return z.selected;
      })
      .map(function (z) {
        return z.mac;
      });
  },

  async onPlay() {
    const macs = this.selectedMacs();
    if (!macs.length) return;
    if (!this.data.songPath) return wx.showToast({ title: '请先选曲目', icon: 'none' });
    wx.showLoading({ title: '下发中', mask: true });
    try {
      // 不带音量：音量滑条是独立的一步（松手即对已选分区生效），
      // 别在播放时顺手改掉各分区自己的音量
      await broadcastApi.play(macs, this.data.songPath, null);
      wx.hideLoading();
      wx.showToast({ title: '已下发播放', icon: 'none' });
      setTimeout(this.loadZones.bind(this), 2000);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '播放失败', icon: 'none' });
    }
  },

  async onStop() {
    const macs = this.selectedMacs();
    if (!macs.length) return;
    try {
      await broadcastApi.stop(macs);
      wx.showToast({ title: '已下发停止', icon: 'none' });
      setTimeout(this.loadZones.bind(this), 2000);
    } catch (e) {
      wx.showToast({ title: e.message || '停止失败', icon: 'none' });
    }
  },

  // ------------------------------------------------------------ 播放记录

  async loadLogs(reset) {
    if (this.data.logLoading) return;
    const limit = reset ? LOG_STEP : this.data.logLimit + LOG_STEP;
    this.setData({ logLoading: true, logLimit: limit });
    try {
      const rows = await broadcastApi.listPlayLogs(null, limit);
      const logs = (rows || []).map(function (l) {
        return {
          id: l.id,
          planName: l.planName || '（手动）',
          actionText: l.action === 'STOP' ? '停止' : '播放',
          sourceText: l.source === 'SCHEDULE' ? '定时' : l.source === 'CATCHUP' ? '补播' : '手动',
          success: !!l.success,
          firedText: String(l.firedAt || '').replace('T', ' ').slice(5, 16),
          message: l.message || '',
        };
      });
      this.setData({ logs: logs, logHasMore: logs.length >= limit && limit < LOG_MAX });
    } catch (e) {
      wx.showToast({ title: e.message || '记录加载失败', icon: 'none' });
    } finally {
      this.setData({ logLoading: false });
    }
  },

  onRefreshLogs() {
    this.loadLogs(true);
  },

  onScrollToLower() {
    // 只有播放记录抽屉那个滚动区会调到这里；关着的时候别白拉数据
    if (!this.data.logsOpen) return;
    if (!this.data.logHasMore) return;
    this.loadLogs(false);
  },
});
