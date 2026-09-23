var springAuth = require('../../../utils/springAuth.js');

var DAY_OF_WEEK_MAP = ['日', '一', '二', '三', '四', '五', '六'];

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { _raw: raw };
    }
  }
  return { _raw: String(raw) };
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

function formatTime(timeStr) {
  if (!timeStr) return '';
  var parts = timeStr.split('T');
  if (parts.length < 2) return '';
  var timePart = parts[1];
  return timePart.substring(0, 5);
}

function getDatePrefix(timeStr) {
  if (!timeStr) return '';
  var idx = timeStr.indexOf('T');
  if (idx === -1) return timeStr.substring(0, 10);
  return timeStr.substring(0, idx);
}

function getDayOfWeek(timeStr) {
  if (!timeStr) return '';
  try {
    var d = new Date(timeStr.replace('T', ' ').replace('Z', ''));
    if (isNaN(d.getTime())) {
      var datePart = getDatePrefix(timeStr);
      d = new Date(datePart + 'T00:00:00');
    }
    if (isNaN(d.getTime())) return '';
    return DAY_OF_WEEK_MAP[d.getDay()];
  } catch (e) {
    return '';
  }
}

function groupByDate(records) {
  if (!records || records.length === 0) return [];
  var map = {};
  var keys = [];
  records.forEach(function(item) {
    var dateKey = getDatePrefix(item.time);
    if (!map[dateKey]) {
      var dayOfWeek = getDayOfWeek(item.time);
      map[dateKey] = { date: dateKey, dayOfWeek: dayOfWeek, records: [] };
      keys.push(dateKey);
    }
    map[dateKey].records.push(item);
  });
  return keys.map(function(k) { return map[k]; });
}

Page({
  data: {
    loading: true,
    error: '',
    violations: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
    dateGroups: []
  },

  onLoad: function() {
    var self = this;
    self.loadViolations();
  },

  loadViolations: function() {
    var self = this;
    self.setData({ loading: true, error: '' });

    var page = self.data.page;

    springAuth.springRequest({
      url: '/api/student/mobile/violations?page=' + page + '&size=' + self.data.pageSize,
      method: 'GET',
      data: {}
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ loading: false, error: p.message });
        return;
      }
      var list = (p.data && p.data.data) || [];
      var total = Number(p.data && p.data.total) || 0;
      var totalPages = Math.ceil(total / self.data.pageSize);

      // Add displayTime / statusLabel for WXML rendering
      list.forEach(function(item) {
        item.displayTime = formatTime(item.time);
        item.statusLabel = item.status === 'processed' ? '已处理' : '待处理';
      });

      var dateGroups = groupByDate(list);

      self.setData({
        loading: false,
        error: '',
        violations: list,
        total: total,
        totalPages: totalPages,
        dateGroups: dateGroups
      });
    }).catch(function(e) {
      self.setData({ loading: false, error: (e && e.message) || '加载失败' });
    });
  },

  onPrevPage: function() {
    var self = this;
    if (self.data.page <= 1) return;
    self.setData({ page: self.data.page - 1 }, function() {
      self.loadViolations();
    });
  },

  onNextPage: function() {
    var self = this;
    if (self.data.page >= self.data.totalPages) return;
    self.setData({ page: self.data.page + 1 }, function() {
      self.loadViolations();
    });
  },

  onRetry: function() {
    var self = this;
    self.loadViolations();
  }
});
