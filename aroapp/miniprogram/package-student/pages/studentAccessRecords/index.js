var springAuth = require('../../../utils/springAuth.js');

var PAGE_SIZE = 20;

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  return null;
}

Page({
  data: {
    loading: true,
    error: '',
    allRecords: [],
    filteredRecords: [],
    pagedRecords: [],
    dateGroups: [],
    page: 1,
    totalPages: 1,
    startDate: '',
    endDate: ''
  },

  onLoad: function () {
    var now = new Date();
    var end = formatDate(now);
    var start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    var startStr = formatDate(start);
    this.setData({ startDate: startStr, endDate: end });
    this.loadRecords();
  },

  loadRecords: function () {
    var self = this;
    self.setData({ loading: true, error: '' });

    springAuth.springRequest({
      url: '/api/student/mobile/access-records',
      method: 'GET',
      data: { page: 1, size: 200 }
    }).then(function (res) {
      var body = parseBody(res.data);
      if (!body || body.success !== true) {
        self.setData({
          loading: false,
          error: (body && body.message) || '加载失败'
        });
        return;
      }
      var records = (body.data && body.data.data) ? body.data.data : [];
      self.setData({ allRecords: records, loading: false });
      self.applyDateFilter();
    }).catch(function (err) {
      self.setData({
        loading: false,
        error: (err && err.message) || '网络请求失败'
      });
    });
  },

  applyDateFilter: function () {
    var self = this;
    var allRecords = self.data.allRecords || [];
    var startDate = self.data.startDate;
    var endDate = self.data.endDate;

    var filtered = allRecords.filter(function (r) {
      if (!r.eventTime) return false;
      var datePart = r.eventTime.substring(0, 10);
      if (startDate && datePart < startDate) return false;
      if (endDate && datePart > endDate) return false;
      return true;
    });

    var dateGroups = groupByDate(filtered);
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    var page = self.data.page;
    if (page > totalPages) page = totalPages;

    var start = (page - 1) * PAGE_SIZE;
    var endIdx = Math.min(start + PAGE_SIZE, filtered.length);
    var pagedRecords = filtered.slice(start, endIdx);
    var pagedDateGroups = groupByDate(pagedRecords);

    self.setData({
      filteredRecords: filtered,
      pagedRecords: pagedRecords,
      dateGroups: pagedDateGroups,
      page: page,
      totalPages: totalPages
    });
  },

  onStartDateChange: function (e) {
    var val = e.detail.value;
    this.setData({ startDate: val, page: 1 });
    this.applyDateFilter();
  },

  onEndDateChange: function (e) {
    var val = e.detail.value;
    this.setData({ endDate: val, page: 1 });
    this.applyDateFilter();
  },

  onPrevPage: function () {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 });
    this.applyDateFilter();
  },

  onNextPage: function () {
    if (this.data.page >= this.data.totalPages) return;
    this.setData({ page: this.data.page + 1 });
    this.applyDateFilter();
  },

  onRetry: function () {
    this.loadRecords();
  }
});

function formatDate(date) {
  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  var d = date.getDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
}

function groupByDate(records) {
  if (!records || !records.length) return [];
  var map = {};
  records.forEach(function (r) {
    var datePart = r.eventTime ? r.eventTime.substring(0, 10) : '';
    if (!datePart) return;
    if (!map[datePart]) map[datePart] = [];
    map[datePart].push(r);
  });
  var keys = Object.keys(map).sort(function (a, b) {
    if (a > b) return -1;
    if (a < b) return 1;
    return 0;
  });
  var result = [];
  keys.forEach(function (k) {
    result.push({
      date: k,
      dayOfWeek: getDayOfWeek(k),
      records: map[k]
    });
  });
  return result;
}

function getDayOfWeek(dateStr) {
  var parts = dateStr.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var d = parseInt(parts[2], 10);
  var dt = new Date(y, m, d);
  var labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return labels[dt.getDay()];
}
