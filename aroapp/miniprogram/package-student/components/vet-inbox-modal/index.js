/**
 * 兽医收件箱弹窗（笼架页内嵌）：与 Web 弹窗、H5 是同一套接口与口径。
 *
 * 三条口径（用户 2026-09-18 定）：
 * ① 每次「通知兽医」触发一条消息（不按笼位合并）；
 * ② 未读用紫色标，**只有点「已查看」才清**（点开看一眼不算）；
 * ③ 指导意见（文字 + 图片）写回笼位表单字段 —— 归档随表单、详情表单里只读。
 *
 * 分组与派生字段都在 utils/vetInboxSections.js（纯函数，有单测）；这里只管取数和事件。
 * 写请求一律解包查 success（HTTP 200 + success:false 也要当失败，见 unwrap）。
 */
var springAuth = require('../../../utils/springAuth.js');
var { refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');
var S = require('../../utils/vetInboxSections.js');

function parseBody(data) {
  if (data == null) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return data;
}

function unwrap(res) {
  var statusCode = Number(res && res.statusCode);
  var body = parseBody(res ? res.data : null);
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || '请求失败(' + (statusCode || 0) + ')' };
  }
  return { ok: true, data: body.data };
}

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer: function (v) {
        if (v) this.load();
        else this.setData({ detailOpen: false, sel: null });
      },
    },
  },

  data: {
    loading: false,
    canEnter: true,
    total: 0,
    unreadCount: 0,
    sections: [],
    /** 筛选轴：全部 / 待回意见 / 已回意见。与「段」的已读未读是两条独立轴 */
    filterKey: 'all',
    keyword: '',
    filterChips: [],
    // 详情弹层
    detailOpen: false,
    sel: null,
    photos: [],
    adviceText: '',
    adviceImages: [],
    saving: false,
  },

  lifetimes: {
    created: function () {
      /** 折叠状态：路径 → bool。放内存不放 data —— setData 的动态键路径容不下带 | 和中文的键。
          放 created 不放 attached：属性 observer 在两者之间就会跑，show 初值为真时会先进 load()。 */
      this._open = {};
      this._msgs = [];
    },
  },

  methods: {
    /** 按行键取当前那条（标记已查看 / 存意见后会原地换成新对象） */
    _find: function (rid) {
      for (var i = 0; i < this._msgs.length; i += 1) {
        if (this._msgs[i]._rid === rid) return this._msgs[i];
      }
      return null;
    },

    /** 折叠状态可能被清（重新 created），这里兜一下，保证纯函数拿到的回调永远可用 */
    _openState: function () {
      if (!this._open) this._open = {};
      var open = this._open;
      return function (path, def) {
        var v = open[path];
        return v === undefined ? def : v;
      };
    },

    /** 唯一的写入口：筛选/搜索/折叠都从这儿过，避免多处 setData 各写一半 */
    _applyState: function (filterKey, keyword, extra) {
      var msgs = this._msgs || [];
      var unread = msgs.filter(function (m) { return !m.read; }).length;
      var counts = S.filterCounts(msgs, keyword);
      this.setData(Object.assign({
        filterKey: filterKey,
        keyword: keyword,
        total: msgs.length,
        unreadCount: unread,
        filterChips: S.INBOX_FILTERS.map(function (f) {
          return { key: f.key, label: f.label, count: counts[f.key] || 0 };
        }),
        sections: S.buildSections(msgs, this._openState(), filterKey, keyword),
      }, extra || {}));
      this.triggerEvent('unreadchange', { count: unread });
    },

    _apply: function (extra) {
      this._applyState(this.data.filterKey, this.data.keyword, extra);
    },

    onFilterTap: function (e) {
      var key = e.currentTarget.dataset.key;
      if (key === this.data.filterKey) return;
      this._applyState(key, this.data.keyword);
    },

    onKeywordInput: function (e) {
      this._applyState(this.data.filterKey, e.detail.value);
    },

    onClearFilter: function () {
      this._applyState('all', '');
    },

    load: function () {
      var self = this;
      this.setData({ loading: true });
      return springAuth
        .springRequest({ url: '/api/cage-vet/inbox', method: 'GET', data: {} })
        .then(function (res) {
          var up = unwrap(res);
          if (!up.ok) {
            self._msgs = [];
            self.setData({ loading: false, canEnter: false });
            self._apply();
            return;
          }
          var d = up.data || {};
          self._msgs = (d.messages || []).map(S.normalizeMessage);
          self.setData({ loading: false, canEnter: d.canEnter === true });
          self._apply();
        })
        .catch(function () {
          self.setData({ loading: false });
          wx.showToast({ title: '网络异常', icon: 'none' });
        });
    },

    onToggleSection: function (e) {
      var key = e.currentTarget.dataset.key;
      this._open['sec:' + key] = !this._openState()('sec:' + key, key === 'unread');
      this._apply();
    },

    onToggleGroup: function (e) {
      var ds = e.currentTarget.dataset;
      var path = 'grp:' + ds.sec + ':' + ds.key;
      this._open[path] = !this._openState()(path, true);
      this._apply();
    },

    onClose: function () {
      this.triggerEvent('close');
    },

    /** 未读数归位后立刻刷三处入口角标（首页主入口 / 底栏 / 笼架页顶栏），别等下次轮询 */
    _afterUnread: function () {
      refreshPendingBadges({ force: true });
    },

    onMarkAll: function () {
      var self = this;
      if (this.data.unreadCount <= 0) return;
      springAuth
        .springRequest({ url: '/api/cage-vet/messages/read-all', method: 'POST', data: {} })
        .then(function (res) {
          var up = unwrap(res);
          if (!up.ok) {
            wx.showToast({ title: up.message || '操作失败', icon: 'none' });
            return;
          }
          self._msgs = self._msgs.map(function (m) { return Object.assign({}, m, { read: true }); });
          self._apply(self.data.sel ? { sel: self._find(self.data.sel._rid) } : null);
          self._afterUnread();
          wx.showToast({ title: '已全部标为已查看', icon: 'none' });
        })
        .catch(function () {
          wx.showToast({ title: '网络异常', icon: 'none' });
        });
    },

    onPick: function (e) {
      var m = this._find(e.currentTarget.dataset.rid);
      if (!m) return;
      this.setData({
        sel: m,
        detailOpen: true,
        adviceText: m.adviceText || '',
        adviceImages: (m.adviceImages || []).slice(),
        photos: [],
      });
      this._loadCagePhotos(m.animalCageId);
    },

    onCloseDetail: function () {
      this.setData({ detailOpen: false });
    },

    /** 状态照片：该笼位各状态归档的照片（与 Web 弹窗发给兽医的是同一份）。
        基本信息 / 当前状态已经随消息行下发，不用再拉表单值。 */
    _loadCagePhotos: function (animalCageId) {
      var self = this;
      if (!animalCageId) return;
      springAuth
        .springRequest({ url: '/api/local/annotate/' + animalCageId, method: 'GET', data: {} })
        .then(function (res) {
          var up = unwrap(res);
          self.setData({ photos: up.ok ? S.flattenStatusPhotos(up.data && up.data.statusPhotos) : [] });
        })
        .catch(function () {});
    },

    /** 口径②：只有点这一下才清未读；点开后条目会从「待查看」挪到「已查看」 */
    onMarkRead: function () {
      var self = this;
      var m = this.data.sel;
      if (!m || m.read) return;
      springAuth
        .springRequest({ url: '/api/cage-vet/messages/' + m.id + '/read', method: 'POST', data: {} })
        .then(function (res) {
          var up = unwrap(res);
          if (!up.ok) {
            wx.showToast({ title: up.message || '标记失败', icon: 'none' });
            return;
          }
          self._msgs = self._msgs.map(function (x) {
            return x._rid === m._rid ? Object.assign({}, x, { read: true }) : x;
          });
          self._apply({ sel: self._find(m._rid) });
          self._afterUnread();
        })
        .catch(function () {
          wx.showToast({ title: '网络异常', icon: 'none' });
        });
    },

    onAdviceInput: function (e) {
      this.setData({ adviceText: e.detail.value });
    },

    onAddAdviceImages: function () {
      var self = this;
      wx.chooseImage({
        count: 3,
        success: function (res) {
          var paths = res.tempFilePaths || [];
          if (!paths.length) return;
          wx.showLoading({ title: '上传中' });
          Promise.all(
            paths.map(function (p) {
              return springAuth
                .uploadFileDirect(p, {})
                .then(function (url) {
                  return typeof url === 'string' ? url : '';
                })
                .catch(function () {
                  return '';
                });
            }),
          ).then(function (urls) {
            wx.hideLoading();
            var ok = urls.filter(function (u) { return !!u; });
            if (!ok.length) {
              wx.showToast({ title: '上传失败', icon: 'none' });
              return;
            }
            self.setData({ adviceImages: self.data.adviceImages.concat(ok) });
          });
        },
      });
    },

    onRemoveAdviceImage: function (e) {
      var i = Number(e.currentTarget.dataset.index);
      var arr = this.data.adviceImages.slice();
      arr.splice(i, 1);
      this.setData({ adviceImages: arr });
    },

    onPreviewImage: function (e) {
      var url = e.currentTarget.dataset.src;
      if (!url) return;
      wx.previewImage({ current: url, urls: [url] });
    },

    onSaveAdvice: function () {
      var self = this;
      var m = this.data.sel;
      if (!m || this.data.saving) return;
      this.setData({ saving: true });
      var text = this.data.adviceText;
      var images = this.data.adviceImages.slice();
      springAuth
        .springRequest({
          url: '/api/cage-vet/advice',
          method: 'POST',
          data: { animalCageId: m.animalCageId, text: text, images: images },
        })
        .then(function (res) {
          self.setData({ saving: false });
          var up = unwrap(res);
          if (!up.ok) {
            wx.showToast({ title: up.message || '保存失败', icon: 'none' });
            return;
          }
          var hasAdvice = !!String(text || '').trim() || images.length > 0;
          self._msgs = self._msgs.map(function (x) {
            return x._rid === m._rid
              ? Object.assign({}, x, { adviceText: text, adviceImages: images, hasAdvice: hasAdvice })
              : x;
          });
          self._apply({ sel: self._find(m._rid) });
          wx.showToast({ title: '指导意见已保存', icon: 'none' });
        })
        .catch(function () {
          self.setData({ saving: false });
          wx.showToast({ title: '网络异常', icon: 'none' });
        });
    },
  },
});
