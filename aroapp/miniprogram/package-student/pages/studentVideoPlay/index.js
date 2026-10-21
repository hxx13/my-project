const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/studentTrainingApi.js');

const PAGE_PATH = '/package-student/pages/studentVideoPlay/index';
const HEARTBEAT_MS = 5000;

Page({
  data: {
    pageGateOk: false,
    loading: true,
    title: '',
    src: '',
    controls: true,
    allowSeek: true,
    percent: 0,
    completed: false,
  },

  onLoad(options) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.videoId = Number(options.id);
    this.currentTime = 0;
    this.lastPos = 0;
    this.maxReached = 0;
    this.lastFlushAt = 0;
    this.setData({ pageGateOk: true });
    this.load();
  },

  onReady() {
    this.ctx = wx.createVideoContext('learnVideo', this);
  },

  onUnload() {
    this._unloaded = true;
    this.flush(false);
  },

  load() {
    this.setData({ loading: true });
    return api
      .fetchMyLearningVideos()
      .then((list) => {
        const v = (list || []).filter((x) => String(x.id) === String(this.videoId))[0];
        if (!v) throw new Error('视频不存在或已下架');
        this.allowSeek = !!v.allowSeek;
        this.resumeSeconds = Number(v.resumeSeconds) || 0;
        this.lastPos = this.resumeSeconds;
        this.maxReached = this.resumeSeconds;
        this.currentTime = this.resumeSeconds;
        this.setData({
          loading: false,
          title: v.title || '视频学习',
          src: springAuth.toAbsoluteApiUrl(v.fileUrl),
          controls: this.allowSeek,
          allowSeek: this.allowSeek,
          percent: Number(v.percent) || 0,
          completed: !!v.completed,
        });
        wx.setNavigationBarTitle({ title: v.title || '视频学习' });
        if (this.resumeSeconds > 0) {
          const resume = this.resumeSeconds;
          setTimeout(() => {
            if (this.ctx) this.ctx.seek(resume);
          }, 400);
        }
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onPlay() {
    this.playing = true;
  },

  onPause() {
    this.playing = false;
    this.flush(false);
  },

  onTimeUpdate(e) {
    const detail = e.detail || {};
    const ct = Number(detail.currentTime) || 0;
    const dur = Number(detail.duration) || 0;
    this.currentTime = ct;
    if (dur > 0) this.durationSeconds = dur;
    if (ct > this.maxReached) this.maxReached = ct;
    const now = Date.now();
    if (!this.lastFlushAt) this.lastFlushAt = now;
    if (now - this.lastFlushAt >= HEARTBEAT_MS) {
      this.lastFlushAt = now;
      this.flush(false);
    }
  },

  /** 不允许拖动的视频：把进度拉回已经看到的位置，跳转不计入观看 */
  onSeeked(e) {
    const ct = Number((e.detail || {}).currentTime) || 0;
    if (!this.allowSeek) {
      const back = this.maxReached || 0;
      if (this.ctx) this.ctx.seek(back);
      this.currentTime = back;
      wx.showToast({ title: '该视频不允许拖动进度', icon: 'none' });
      return;
    }
    // 允许快进也要把基准点跟过去，避免一次大跳被算成观看时长
    this.lastPos = ct;
    if (ct > this.maxReached) this.maxReached = ct;
  },

  onEnded() {
    this.flush(true);
  },

  /** 心跳上报：跨度超过 5 秒视为拖动，服务端也会再挡一次 */
  flush(ended) {
    if (!this.videoId) return;
    const pos = Math.floor(this.currentTime || 0);
    const rawDelta = pos - this.lastPos;
    const watchedDelta = rawDelta > 0 && rawDelta <= 5 ? rawDelta : 0;
    this.lastPos = pos;
    api
      .reportLearningVideoProgress(this.videoId, {
        position: pos,
        watchedDelta: watchedDelta,
        duration: Math.floor(this.durationSeconds || 0),
        ended: !!ended,
      })
      .then((p) => {
        if (this._unloaded || !p) return;
        this.setData({ percent: p.percent, completed: !!p.completed });
      })
      .catch(() => {
        // 断网时静默，下一次心跳继续
      });
  },
});
