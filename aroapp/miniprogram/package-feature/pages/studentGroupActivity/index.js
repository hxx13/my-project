var springAuth = require('../../../utils/springAuth.js');

var BASE_URL = '/api/student/mobile/group-activity';

var WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function formatDateYMD(date) {
  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  var d = date.getDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
}

function toDateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function computePresetDates(preset) {
  var now = new Date();
  var today = toDateOnly(now);
  var start = new Date(today);
  var end = new Date(today);

  switch (preset) {
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'week':
      var dow = today.getDay();
      var mondayOffset = dow === 0 ? -6 : 1 - dow;
      start.setDate(start.getDate() + mondayOffset);
      end.setDate(end.getDate() - 1);
      break;
    case 'month':
      start.setDate(1);
      end.setDate(end.getDate() - 1);
      break;
    case 'lastWeek':
      var dow2 = today.getDay();
      var lastMondayOffset = dow2 === 0 ? -13 : -6 - dow2;
      start.setDate(start.getDate() + lastMondayOffset);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      break;
    case 'lastMonth':
      start.setMonth(start.getMonth() - 1, 1);
      end = new Date(start);
      end.setMonth(end.getMonth() + 1, 0);
      break;
    default:
      start.setDate(1);
      end.setDate(end.getDate() - 1);
  }

  return {
    start: formatDateYMD(start),
    end: formatDateYMD(end)
  };
}

function initHeatmapGrid() {
  var grid = [];
  for (var d = 0; d < 7; d++) {
    grid[d] = [];
    for (var h = 0; h < 24; h++) {
      grid[d][h] = 0;
    }
  }
  return grid;
}

function buildHourLabels() {
  var arr = [];
  for (var h = 0; h < 24; h++) {
    arr.push({ idx: h, label: h, show: h % 3 === 0 });
  }
  return arr;
}

function buildDayRows(grid, maxVal) {
  var DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var rows = [];
  for (var d = 0; d < 7; d++) {
    var cells = [];
    for (var h = 0; h < 24; h++) {
      var val = (grid[d] && grid[d][h]) ? grid[d][h] : 0;
      cells.push({ hourIdx: h, opacity: maxVal > 0 ? val / maxVal : 0 });
    }
    rows.push({ dayIdx: d, dayLabel: DAY_LABELS[d], cells: cells });
  }
  return rows;
}

function buildRoomBars(roomUsage) {
  if (!roomUsage || roomUsage.length === 0) return [];
  var maxEntry = roomUsage[0].entryCount || 1;
  return roomUsage.map(function (item) {
    return {
      roomName: item.roomName,
      entryCount: item.entryCount,
      pct: maxEntry > 0 ? Math.round(item.entryCount / maxEntry * 100) : 0
    };
  });
}

function formatDuration(minutes) {
  var m = Number(minutes) || 0;
  if (m < 60) return m + '分钟';
  var h = Math.floor(m / 60);
  var rest = m % 60;
  return rest > 0 ? h + '小时' + rest + '分' : h + '小时';
}

function formatLastActive(daysSince) {
  var d = Number(daysSince);
  if (isNaN(d) || d < 0) return { text: '无记录', tone: 'none' };
  if (d === 0) return { text: '今天', tone: 'fresh' };
  if (d === 1) return { text: '昨天', tone: 'fresh' };
  if (d <= 3) return { text: d + '天前', tone: 'warm' };
  if (d <= 7) return { text: d + '天前', tone: 'hot' };
  return { text: d + '天前', tone: 'cold' };
}

function avatarText(name) {
  if (!name || typeof name !== 'string') return '?';
  return name.trim().slice(0, 1) || '?';
}

function decorateMemberRow(item) {
  var active = formatLastActive(item.daysSinceLastActive);
  return Object.assign({}, item, {
    avatarText: avatarText(item.userName),
    durationText: formatDuration(item.totalDurationMinutes),
    activeText: active.text,
    activeTone: active.tone
  });
}

function buildKpiCards(summary, timeLabel) {
  var label = timeLabel || '本月';
  return [
    {
      key: 'memberCount',
      tone: 'violet',
      label: '课题组人数（' + label + '）',
      value: summary.memberCount != null ? summary.memberCount : '-'
    },
    {
      key: 'totalEntries',
      tone: 'emerald',
      label: '总进出次数（' + label + '）',
      value: summary.totalEntries != null ? summary.totalEntries : '-'
    },
    {
      key: 'perCapitaWeeklyFreq',
      tone: 'blue',
      label: '人均频次（' + label + '）',
      value: summary.perCapitaWeeklyFreq != null ? summary.perCapitaWeeklyFreq : '-'
    },
    {
      key: 'activeSharePct',
      tone: 'amber',
      label: '活跃占比（' + label + '）',
      value: summary.activeSharePct != null ? summary.activeSharePct + '%' : '-'
    }
  ];
}

Page({
  data: {
    loading: true,
    error: '',
    groupName: '',

    summary: {
      memberCount: 0,
      totalEntries: 0,
      perCapitaWeeklyFreq: 0,
      activeSharePct: 0
    },
    timeLabel: '',
    kpiCards: buildKpiCards({ memberCount: 0, totalEntries: 0, perCapitaWeeklyFreq: 0, activeSharePct: 0 }, ''),

    members: [],
    memberTotal: 0,
    memberPage: 1,
    memberSortBy: 'entries',
    memberSortOrder: 'desc',
    membersLoading: false,
    membersHasMore: true,

    heatmapGrid: initHeatmapGrid(),
    heatmapMax: 0,
    heatmapHourLabels: buildHourLabels(),
    heatmapRows: buildDayRows([], 0),

    roomUsage: [],
    roomBars: [],

    timePreset: 'month',
    presets: [
      { key: 'yesterday', label: '昨日' },
      { key: 'week', label: '本周' },
      { key: 'month', label: '本月' },
      { key: 'lastWeek', label: '上周' },
      { key: 'lastMonth', label: '上月' }
    ],
    sortOptions: [
      { key: 'entries', label: '进出次数' },
      { key: 'totalDurationMinutes', label: '总时长' },
      { key: 'weeklyAvgFreq', label: '周均频次' },
      { key: 'daysSinceLastActive', label: '最近活跃' }
    ],

    pageSize: 10
  },

  onLoad: function () {
    var self = this;
    var dates = computePresetDates(self.data.timePreset);
    self.setData({
      startTime: dates.start,
      endTime: dates.end
    });
    self.loadAll();
  },

  loadAll: function () {
    var self = this;
    self.setData({ loading: true, error: '' });

    var startTime = self.data.startTime;
    var endTime = self.data.endTime;

    Promise.all([
      self.fetchSummary(startTime, endTime),
      self.fetchMembers(startTime, endTime, 1),
      self.fetchHeatmap(startTime, endTime),
      self.fetchRoomUsage(startTime, endTime)
    ]).then(function () {
      self.setData({ loading: false });
    }).catch(function (err) {
      self.setData({
        loading: false,
        error: (err && err.message) || '加载失败'
      });
    });
  },

  fetchSummary: function (startTime, endTime) {
    var self = this;
    return springAuth.springRequest({
      url: BASE_URL + '/summary',
      method: 'GET',
      data: { startTime: startTime, endTime: endTime }
    }).then(function (res) {
      var body = parseBody(res.data);
      if (!body || !body.success) return;
      var d = body.data;
      if (d && d.memberCount !== undefined) {
        var summary = {
          memberCount: d.memberCount || 0,
          totalEntries: d.totalEntries || 0,
          perCapitaWeeklyFreq: d.perCapitaWeeklyFreq || 0,
          activeSharePct: d.activeSharePct || 0
        };
        var timeLabel = d.timeLabel || self.data.timeLabel || '';
        self.setData({
          summary: summary,
          groupName: d.campus || '',
          timeLabel: timeLabel,
          kpiCards: buildKpiCards(summary, timeLabel)
        });
      }
    });
  },

  fetchMembers: function (startTime, endTime, page) {
    var self = this;
    var pageSize = self.data.pageSize;
    return springAuth.springRequest({
      url: BASE_URL + '/members',
      method: 'GET',
      data: {
        startTime: startTime,
        endTime: endTime,
        sortBy: self.data.memberSortBy,
        order: self.data.memberSortOrder,
        page: page,
        size: pageSize
      }
    }).then(function (res) {
      var body = parseBody(res.data);
      if (!body || !body.success) return;
      var d = body.data;
      if (!d) return;
      var list = (d.members || []).map(decorateMemberRow);
      var total = typeof d.total === 'number' ? d.total : list.length;
      var members = self.data.members;
      var merged = page === 1 ? list : members.concat(list);

      if (d.summary) {
        var summary = {
          memberCount: d.summary.memberCount || 0,
          totalEntries: d.summary.totalEntries || 0,
          perCapitaWeeklyFreq: d.summary.perCapitaWeeklyFreq || 0,
          activeSharePct: d.summary.activeSharePct || 0
        };
        var timeLabel = d.summary.timeLabel || self.data.timeLabel || '';
        self.setData({
          summary: summary,
          groupName: d.summary.campus || self.data.groupName,
          timeLabel: timeLabel,
          kpiCards: buildKpiCards(summary, timeLabel)
        });
      }

      self.setData({
        members: merged,
        memberTotal: total,
        memberPage: page,
        membersHasMore: merged.length < total,
        membersLoading: false
      });
    }).catch(function (err) {
      self.setData({ membersLoading: false });
    });
  },

  fetchHeatmap: function (startTime, endTime) {
    var self = this;
    return springAuth.springRequest({
      url: BASE_URL + '/heatmap',
      method: 'GET',
      data: { startTime: startTime, endTime: endTime }
    }).then(function (res) {
      var body = parseBody(res.data);
      if (!body || !body.success) return;
      var list = body.data;
      if (!Array.isArray(list)) return;
      var grid = initHeatmapGrid();
      var maxVal = 0;
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var d = Number(item.dayOfWeek) - 1;
        var h = Number(item.hour);
        var c = Number(item.count) || 0;
        if (d >= 0 && d < 7 && h >= 0 && h < 24) {
          grid[d][h] = c;
          if (c > maxVal) maxVal = c;
        }
      }
      self.setData({
        heatmapGrid: grid,
        heatmapMax: maxVal,
        heatmapRows: buildDayRows(grid, maxVal)
      });
    });
  },

  fetchRoomUsage: function (startTime, endTime) {
    var self = this;
    return springAuth.springRequest({
      url: BASE_URL + '/room-usage',
      method: 'GET',
      data: { startTime: startTime, endTime: endTime }
    }).then(function (res) {
      var body = parseBody(res.data);
      if (!body || !body.success) return;
      var list = body.data;
      if (!Array.isArray(list)) return;
      var sorted = list.slice().sort(function (a, b) {
        return (Number(b.entryCount) || 0) - (Number(a.entryCount) || 0);
      });
      self.setData({
        roomUsage: sorted,
        roomBars: buildRoomBars(sorted)
      });
    });
  },

  onPresetTap: function (e) {
    var self = this;
    var preset = e.currentTarget.dataset.preset;
    if (!preset || preset === self.data.timePreset) return;
    var dates = computePresetDates(preset);
    self.setData({
      timePreset: preset,
      startTime: dates.start,
      endTime: dates.end,
      members: [],
      memberPage: 1,
      memberTotal: 0,
      membersHasMore: true,
      roomUsage: [],
      roomBars: [],
      heatmapGrid: initHeatmapGrid(),
      heatmapMax: 0,
      heatmapRows: buildDayRows([], 0),
      kpiCards: buildKpiCards(self.data.summary, self.data.timeLabel)
    });
    self.loadAll();
  },

  onMemberSort: function (e) {
    var self = this;
    var sortBy = e.currentTarget.dataset.sortby;
    if (!sortBy) return;
    var order = 'desc';
    if (sortBy === self.data.memberSortBy && self.data.memberSortOrder === 'desc') {
      order = 'asc';
    }
    self.setData({
      memberSortBy: sortBy,
      memberSortOrder: order,
      members: [],
      memberPage: 1,
      memberTotal: 0,
      membersHasMore: true
    });
    self.setData({ membersLoading: true });
    self.fetchMembers(self.data.startTime, self.data.endTime, 1);
  },

  loadMoreMembers: function () {
    var self = this;
    if (self.data.membersLoading || !self.data.membersHasMore) return;
    var nextPage = self.data.memberPage + 1;
    self.setData({ membersLoading: true });
    self.fetchMembers(self.data.startTime, self.data.endTime, nextPage);
  },

  getSortArrow: function (field) {
    var self = this;
    if (self.data.memberSortBy !== field) return '';
    return self.data.memberSortOrder === 'desc' ? ' ↓' : ' ↑';
  }
});

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
