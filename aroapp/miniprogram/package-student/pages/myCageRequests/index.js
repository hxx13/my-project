/**
 * 我的申请（整页）
 *
 * 原来是笼架页里一个 90vw 的居中弹窗，改成独立整页：申请记录会越攒越多，
 * 弹窗里翻不下，也没法从「我的」直达。
 *
 * 四个分类与 Web 端 MyCageRequestsDialog 完全同口径、同接口：
 *   认领申请  GET /api/student/cage-claims/my
 *   分笼申请  GET /api/cage-op/my  → opType==='divide'
 *   转移申请  GET /api/cage-op/my  → opType==='transfer'
 *   审核申请  GET /api/cage-op/pending + GET /api/cage-op/reviewed?limit=50
 *
 * 三个来源各自成败各自回填：任何一个挂了，不该把别的 tab 拖成空列表。
 */
var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');
var cageOpSignatures = require('../../utils/cageOpSignatures.js');
var cagePosition = require('../../utils/cagePosition.js');

var PAGE_PATH = '/package-student/pages/myCageRequests/index';
var TAB_KEYS = ['claims', 'divide', 'transfer', 'review'];

function unwrap(res) {
  var statusCode = Number(res && res.statusCode);
  var body = res ? res.data : null;
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
  return { ok: true, data: body.data };
}

/** 认领状态中文标签 */
function claimStatusLabel(status) {
  var map = {
    pending_approval: '待审批',
    locked: '未到位',
    confirmed: '已到位',
    pending_release_approval: '待释放',
    rejected: '已驳回',
    released: '已释放',
    cancelled: '已取消'
  };
  return map[status] || status || '—';
}

/** 分笼/转移请求状态中文标签 */
function transferOpStatusLabel(status) {
  var map = {
    pending: '审核中',
    approved: '已通过',
    rejected: '已驳回',
    cancelled: '已撤销'
  };
  return map[status] || status || '—';
}

/**
 * 给一条分笼/转移挂上展示字段：状态文案、三签进度、源位置、所在房间。
 * 与笼架页的同一份实现保持一致（标题在 JS 里拼好，模板里只留一处插值）。
 */
function decorateOp(it) {
  if (!it) return it;
  it._statusLabel = transferOpStatusLabel(it.status);
  it._sign = cageOpSignatures.signSlots(it.signatures);
  var pairs = it.pairs || [];
  var srcs = [];
  for (var pi = 0; pi < pairs.length; pi++) {
    var s = String((pairs[pi] && pairs[pi].source) || '');
    if (s && srcs.indexOf(s) === -1) srcs.push(s);
  }
  var first = cagePosition.cagePositionLabel(it);
  if (srcs.length > 1) {
    it._posLabel = (first ? first + ' 等 ' : '') + srcs.length + ' 处';
  } else {
    it._posLabel = first || '—';
  }
  var place = [];
  if (it.campusName) place.push(it.campusName);
  var room = it.roomName ? String(it.roomName) : '';
  var shelve = it.shelveName ? String(it.shelveName) : '';
  if (shelve) {
    if (!room || shelve.indexOf(room) !== 0) {
      if (room) place.push(room);
    }
    place.push(shelve);
  } else if (room) {
    place.push(room);
  }
  it._place = place.join(' ');
  it._title = (it._place && it._posLabel && it._posLabel !== '—')
    ? it._place + ' ' + it._posLabel
    : (it._place || it._posLabel);
  return it;
}

/** 我提交的全部分笼/转移（同一个接口，按 opType 拆两个 tab） */
function fetchMyCageOps() {
  return springAuth.springRequest({ url: '/api/cage-op/my', method: 'GET', data: {} }).then(function (res) {
    var p = unwrap(res);
    if (!p.ok) throw new Error(p.message || '加载申请列表失败');
    return (p.data || []).filter(Boolean).map(decorateOp);
  });
}

/** 需要我审的 = 待我签的 + 我已审过的 */
function fetchReviewCageOps() {
  var req = function (url, data) {
    return springAuth
      .springRequest({ url: url, method: 'GET', data: data || {} })
      .then(function (res) {
        var p = unwrap(res);
        return p.ok && Array.isArray(p.data) ? p.data : [];
      })
      .catch(function () {
        return [];
      });
  };
  return Promise.all([req('/api/cage-op/pending'), req('/api/cage-op/reviewed', { limit: 50 })]).then(function (arr) {
    return arr[0].concat(arr[1]).filter(Boolean).map(decorateOp);
  });
}

Page({
  data: {
    tab: 'claims',
    tabs: [],
    claims: [],
    claimsLoading: false,
    divides: [],
    transfers: [],
    /** 当前 tab 要渲染的那一份（WXML 不支持 (三元).length 这种写法，先在 JS 里选好） */
    opList: [],
    opsLoading: false,
    reviewOps: [],
    reviewLoading: false,
  },

  onShow() {
    var role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.guardPageOnShow(this, PAGE_PATH, role, 'STUDENT')) return;
    if (this._loadedOnce) return;
    this._loadedOnce = true;
    this.loadAll();
  },

  onPullDownRefresh() {
    Promise.resolve(this.loadAll()).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadAll() {
    var self = this;
    self.setData({
      claimsLoading: true,
      claims: [],
      opsLoading: true,
      divides: [],
      transfers: [],
      reviewLoading: true,
      reviewOps: [],
    });
    var recompute = function () {
      var d = self.data;
      self.setData({
        tabs: [
          { key: 'claims', label: '认领申请', count: (d.claims || []).length },
          { key: 'divide', label: '分笼申请', count: (d.divides || []).length },
          { key: 'transfer', label: '转移申请', count: (d.transfers || []).length },
          { key: 'review', label: '审核申请', count: (d.reviewOps || []).length },
        ],
        opList: d.tab === 'divide' ? d.divides : (d.tab === 'transfer' ? d.transfers : []),
      });
    };
    var claimsReq = springAuth
      .springRequest({ url: '/api/student/cage-claims/my', method: 'GET', data: {} })
      .then(function (res) {
        var p = unwrap(res);
        var list = (p.ok && p.data) || [];
        list.forEach(function (it) {
          it._statusLabel = claimStatusLabel(it.claimStatus);
        });
        self.setData({ claimsLoading: false, claims: list }, recompute);
      })
      .catch(function () {
        self.setData({ claimsLoading: false }, recompute);
        wx.showToast({ title: '加载认领申请失败', icon: 'none' });
      });
    var opsReq = fetchMyCageOps()
      .then(function (list) {
        self.setData(
          {
            opsLoading: false,
            divides: list.filter(function (it) {
              return it.opType === 'divide';
            }),
            transfers: list.filter(function (it) {
              return it.opType === 'transfer';
            }),
          },
          recompute
        );
      })
      .catch(function () {
        self.setData({ opsLoading: false }, recompute);
      });
    var reviewReq = fetchReviewCageOps()
      .then(function (list) {
        self.setData({ reviewLoading: false, reviewOps: list }, recompute);
      })
      .catch(function () {
        self.setData({ reviewLoading: false }, recompute);
      });
    return Promise.all([claimsReq, opsReq, reviewReq]);
  },

  onTabChange(e) {
    var key = e.currentTarget.dataset.key;
    if (TAB_KEYS.indexOf(key) < 0) return;
    this.setData({
      tab: key,
      opList: key === 'divide' ? this.data.divides : (key === 'transfer' ? this.data.transfers : []),
    });
  },

  /** 查看转移单 PDF（与笼架页同一个下载入口） */
  onViewTransferForm(e) {
    var rid = String(e.currentTarget.dataset.id || '').trim();
    if (!rid) return;
    wx.showLoading({ title: '加载中…' });
    springAuth
      .springRequestBinary('/api/cage-op/transfer-form/' + encodeURIComponent(rid), {
        errorMessage: '转移单加载失败',
        forbiddenMessage: '无权查看该转移单',
      })
      .then(function (res) {
        wx.hideLoading();
        return springAuth.saveAndOpenDocument(res.data, '转移单-' + rid + '.pdf', 'pdf');
      })
      .catch(function (err) {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '转移单加载失败', icon: 'none' });
      });
  },

  /** 取消认领申请：仅「待审批」的能撤 */
  onCancelClaim(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '取消申请',
      content: '确定取消该申请？',
      success: function (r) {
        if (!r.confirm) return;
        springAuth
          .springRequest({ url: '/api/student/cage-claims/' + id + '/cancel', method: 'POST', data: {} })
          .then(function (res) {
            var p = unwrap(res);
            if (!p.ok) {
              wx.showToast({ title: p.message || '取消失败', icon: 'none' });
              return;
            }
            wx.showToast({ title: '已取消申请', icon: 'success' });
            self.loadAll();
          })
          .catch(function () {
            wx.showToast({ title: '取消失败', icon: 'none' });
          });
      },
    });
  },
});
