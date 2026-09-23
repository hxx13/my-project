'use strict';

/**
 * 文件模板库 - 打印相关纯逻辑。
 * 不依赖 wx / 网络 / 任何 require，可在 Node 下直接测试。
 */

const STATUS_META = {
  PENDING: { statusText: '排队中', tone: 'pending' },
  SENT: { statusText: '打印中', tone: 'info' },
  PRINTED: { statusText: '已打印', tone: 'ok' },
  FAILED: { statusText: '失败', tone: 'bad' },
  CANCELLED: { statusText: '已撤回', tone: 'none' },
};
const UNKNOWN_META = { statusText: '未知', tone: 'none' };

const TYPE_LABEL = {
  pdf: 'PDF',
  image: '图片',
  word: 'Word',
  excel: 'Excel',
  ppt: 'PPT',
};

const STATION_STATUS_META = {
  ONLINE: { label: '在线', tone: 'ok' },
  OFFLINE: { label: '离线', tone: 'bad' },
  UNKNOWN: { label: '未知', tone: 'none' },
};
const STATION_STATUS_UNKNOWN = { label: '未知', tone: 'none' };
// 输出顺序固定，与输入顺序无关
const TYPE_ORDER = ['pdf', 'image', 'word', 'excel', 'ppt'];

/** 按文件名原始名子串过滤，大小写不敏感；关键字为空则原样返回。 */
function filterTemplates(rows, keyword) {
  if (!Array.isArray(rows)) return [];
  const kw = String(keyword == null ? '' : keyword)
    .trim()
    .toLowerCase();
  if (!kw) return rows;
  return rows.filter((row) =>
    String((row && row.originalName) || '')
      .toLowerCase()
      .includes(kw),
  );
}

/** 汇总打印队列：只认 PENDING / SENT，未知状态忽略。 */
function summarizeQueue(jobs) {
  let sent = 0;
  let pending = 0;
  if (Array.isArray(jobs)) {
    for (const job of jobs) {
      const status = job && job.status;
      if (status === 'PENDING') pending += 1;
      else if (status === 'SENT') sent += 1;
    }
  }
  return { sent, pending, hasActive: sent + pending > 0 };
}

/** 单条打印任务 -> 展示行；入参为空返回 null。 */
/**
 * 工位 id → 名称。后端 job 只给 stationId，而队列要显示「哪台工位打的」，
 * 于是拿可选工位列表拼一张映射表（调用方拉一次 /api/print/stations 即可）。
 */
function stationNameMap(stations) {
  const out = {};
  (Array.isArray(stations) ? stations : []).forEach((s) => {
    if (s && s.id != null) out[String(s.id)] = s.name || String(s.id);
  });
  return out;
}

function mapJobRow(job, stationNames) {
  if (!job) return null;
  const meta = STATUS_META[job.status] || UNKNOWN_META;
  const createdAt = job.createdAt;
  const sid = job.stationId == null ? '' : String(job.stationId);
  // 时间取「最后有意义的那个」：打完 > 已发 > 创建（与 web 队列弹窗同口径）
  const at = job.printedAt || job.sentAt || createdAt;
  return {
    id: job.id,
    status: job.status,
    stationId: sid,
    fileName: job.fileName,
    copies: job.copies,
    note: job.note || '',
    statusText: meta.statusText,
    tone: meta.tone,
    timeText: at ? String(at).replace('T', ' ').slice(0, 16) : '',
    errorText: job.lastError || '',
    // QUEUED = 此刻确实还排在那台打印机队列里（只有直发工位会有这个结论，其余为空）。
    // 「仍卡在打印机队列」标记与撤销按钮都靠它 —— 别让页面再回头按 id 去 job 上翻。
    queueState: job.queueState || '',
    // 工位名（拿不到就空：列表里那一段自动不显示）
    stationName: stationNames && stationNames[sid] ? stationNames[sid] : '',
  };
}

/** 排队中/已发（= 还在进行中）的状态；队列计数与 tab 角标都用它 */
const ACTIVE_STATUSES = ['PENDING', 'SENT'];

/**
 * 按工位把打印记录分组，供「每台打印机一个队列」的 tab 展示（照 web PrintQueueDialog）。
 * 工位清单以 stations 为准（顺序稳定），记录里出现过但清单里没有的工位也补上（名字退回 id）。
 * 每组内：进行中的排前面，其余按时间倒序。
 */
function buildStationTabs(jobs, stations, stationNames) {
  const nameMap = stationNames || stationNameMap(stations);
  const order = [];
  const map = {};
  const ensure = (sid) => {
    const key = String(sid == null ? '' : sid);
    if (!map[key]) {
      map[key] = { id: key, name: nameMap[key] || key, count: 0, rows: [] };
      order.push(key);
    }
    return map[key];
  };
  (Array.isArray(stations) ? stations : []).forEach((s) => { if (s && s.id != null) ensure(s.id); });
  (Array.isArray(jobs) ? jobs : []).forEach((j) => {
    if (!j) return;
    const tab = ensure(j.stationId);
    const row = mapJobRow(j, nameMap);
    if (row) tab.rows.push(row);
  });
  order.forEach((key) => {
    const tab = map[key];
    tab.rows.sort((a, b) => {
      const ra = ACTIVE_STATUSES.indexOf(a.status) >= 0 ? 0 : 1;
      const rb = ACTIVE_STATUSES.indexOf(b.status) >= 0 ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return String(b.timeText).localeCompare(String(a.timeText));
    });
    tab.count = tab.rows.filter((r) => ACTIVE_STATUSES.indexOf(r.status) >= 0).length;
  });
  return order.map((key) => map[key]);
}

/** 工位支持类型 -> 一行中文说明；空或全认不出 = 不限制。 */
function stationCapabilityText(station) {
  const raw = station && station.supportedTypes;
  const keys = String(raw == null ? '' : raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => TYPE_LABEL[s]);
  if (!keys.length) return '不限制文件类型';
  return (
    '支持 ' +
    TYPE_ORDER.filter((k) => keys.includes(k))
      .map((k) => TYPE_LABEL[k])
      .join(' / ')
  );
}

/** 工位在线状态 → { tone, label, reason }；未知状态/缺失一律兜底为 none，不抛。 */
function stationStatusMeta(station) {
  const status = station && station.liveStatus;
  const meta = STATION_STATUS_META[status] || STATION_STATUS_UNKNOWN;
  const reason =
    station && station.liveStatusReason
      ? String(station.liveStatusReason).trim()
      : '';
  return { tone: meta.tone, label: meta.label, reason };
}

module.exports = {
  stationNameMap,
  buildStationTabs,
  ACTIVE_STATUSES,
  filterTemplates,
  summarizeQueue,
  mapJobRow,
  stationCapabilityText,
  stationStatusMeta,
};
