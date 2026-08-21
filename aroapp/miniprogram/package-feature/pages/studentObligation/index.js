var springAuth = require('../../../utils/springAuth.js');

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function unwrap(res) {
  var statusCode = Number(res && res.statusCode);
  var body = parseBody(res ? res.data : null);
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || '请求失败' };
  }
  return { ok: true, data: body.data };
}

/** Fisher-Yates */
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/** 对齐 H5 InteractiveChallenge：按字拆分、打乱、顺序点击 */
function buildPuzzle(phrase) {
  var list = Array.from(phrase || '');
  var chars = [];
  for (var i = 0; i < list.length; i++) {
    chars.push({ char: list[i], index: i });
  }
  var tiles = shuffle(chars).map(function (item, pos) {
    return { char: item.char, index: item.index, pos: pos, clicked: false };
  });
  return {
    phrase: phrase,
    tiles: tiles,
    nextIdx: 0,
    progress: 0,
    total: list.length,
    errorFlash: false,
    done: false,
  };
}

Page({
  data: {
    loading: true,
    error: '',
    list: [],
    active: null,
    quiz: null,
    answers: {},
    signature: '',
    submitting: false,
    puzzle: null,
  },

  onLoad: function (query) {
    this._focusId = query && query.id ? Number(query.id) : 0;
    this._puzzleFired = false;
    this.reload();
  },

  onPullDownRefresh: function () {
    this.reload().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  reload: function () {
    var that = this;
    that.setData({ loading: true, error: '' });
    return springAuth
      .springRequest({
        url: '/api/student/obligations/mine',
        method: 'GET',
        data: { channel: 'MP', status: 'PENDING_DISPOSITION', limit: 50 },
      })
      .then(function (res) {
        var u = unwrap(res);
        if (!u.ok) {
          that.setData({ loading: false, error: u.message });
          return;
        }
        var list = Array.isArray(u.data) ? u.data : [];
        var active = null;
        if (that._focusId) {
          active = list.find(function (r) {
            return r.id === that._focusId;
          }) || null;
        }
        if (!active && list.length) active = list[0];
        that.setData({ loading: false, list: list, active: active, quiz: null, answers: {}, puzzle: null });
        if (active && active.id) {
          that.markDelivered(active.id);
          that.setupDisposition(active);
        }
      })
      .catch(function (e) {
        that.setData({ loading: false, error: (e && e.message) || '加载失败' });
      });
  },

  markDelivered: function (id) {
    springAuth
      .springRequest({ url: '/api/student/obligations/' + id + '/delivered', method: 'POST', data: {} })
      .catch(function () {});
  },

  setupDisposition: function (active) {
    if (!active || active.deliveryMode === 'GUIDE_ONLY') return;
    var type = (active.dispositionType || '').toUpperCase();
    if (type === 'QUIZ') {
      this.loadQuiz(active.id);
      return;
    }
    if (type === 'ACK_PUZZLE') {
      this.initPuzzle(active);
    }
  },

  initPuzzle: function (active) {
    this._puzzleFired = false;
    var phrase = '';
    try {
      var raw = active && active.dispositionConfigJson;
      var cfg = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      phrase = String(cfg.phrase || '').trim();
    } catch (err) {}
    if (!phrase) {
      this.setData({ puzzle: null });
      wx.showToast({ title: '缺少短语配置', icon: 'none' });
      return;
    }
    this.setData({ puzzle: buildPuzzle(phrase) });
  },

  selectItem: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var active = (this.data.list || []).find(function (r) {
      return r.id === id;
    });
    this._puzzleFired = false;
    this.setData({ active: active || null, quiz: null, answers: {}, signature: '', puzzle: null });
    if (active) {
      this.markDelivered(active.id);
      this.setupDisposition(active);
    }
  },

  loadQuiz: function (id) {
    var that = this;
    springAuth
      .springRequest({ url: '/api/student/obligations/' + id + '/quiz-draw', method: 'GET', data: {} })
      .then(function (res) {
        var u = unwrap(res);
        if (u.ok) that.setData({ quiz: u.data });
      });
  },

  onPickAnswer: function (e) {
    var qid = e.currentTarget.dataset.qid;
    var idx = Number(e.currentTarget.dataset.idx);
    var answers = Object.assign({}, this.data.answers);
    answers[qid] = idx;
    this.setData({ answers: answers });
  },

  onSignatureInput: function (e) {
    this.setData({ signature: (e.detail && e.detail.value) || '' });
  },

  complete: function (answer) {
    var that = this;
    var active = that.data.active;
    if (!active || that.data.submitting) return;
    that.setData({ submitting: true });
    springAuth
      .springRequest({
        url: '/api/student/obligations/' + active.id + '/complete',
        method: 'POST',
        data: { answer: answer, channel: 'MP' },
      })
      .then(function (res) {
        var u = unwrap(res);
        that.setData({ submitting: false });
        if (!u.ok) {
          that._puzzleFired = false;
          wx.showToast({ title: u.message || '校验未通过', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已完成', icon: 'success' });
        that.reload();
      })
      .catch(function (e) {
        that._puzzleFired = false;
        that.setData({ submitting: false });
        wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' });
      });
  },

  onAck: function () {
    this.complete('{}');
  },

  onSubmitQuiz: function () {
    this.complete(JSON.stringify({ answers: this.data.answers || {} }));
  },

  onSubmitSignature: function () {
    var sig = (this.data.signature || '').trim();
    if (sig.length < 2) {
      wx.showToast({ title: '请输入签名', icon: 'none' });
      return;
    }
    this.complete(JSON.stringify({ signature: sig }));
  },

  onPuzzleTileTap: function (e) {
    var puzzle = this.data.puzzle;
    if (!puzzle || puzzle.done || this.data.submitting) return;
    var pos = Number(e.currentTarget.dataset.pos);
    var tile = (puzzle.tiles || [])[pos];
    if (!tile || tile.clicked) return;

    if (tile.index === puzzle.nextIdx) {
      var tiles = puzzle.tiles.map(function (t, i) {
        return i === pos ? Object.assign({}, t, { clicked: true }) : t;
      });
      var next = puzzle.nextIdx + 1;
      var done = next >= puzzle.total;
      this.setData({
        puzzle: Object.assign({}, puzzle, {
          tiles: tiles,
          nextIdx: next,
          progress: next,
          done: done,
          errorFlash: false,
        }),
      });
      if (done) {
        if (this._puzzleFired) return;
        this._puzzleFired = true;
        var answer = puzzle.phrase;
        var that = this;
        setTimeout(function () {
          that.complete(answer);
        }, 400);
      }
    } else {
      var resetTiles = puzzle.tiles.map(function (t) {
        return Object.assign({}, t, { clicked: false });
      });
      this.setData({
        puzzle: Object.assign({}, puzzle, {
          tiles: resetTiles,
          nextIdx: 0,
          progress: 0,
          errorFlash: true,
        }),
      });
      var that2 = this;
      setTimeout(function () {
        var p = that2.data.puzzle;
        if (p) that2.setData({ puzzle: Object.assign({}, p, { errorFlash: false }) });
      }, 600);
    }
  },
});
