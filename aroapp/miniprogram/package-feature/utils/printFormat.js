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
function mapJobRow(job) {
  if (!job) return null;
  const meta = STATUS_META[job.status] || UNKNOWN_META;
  const createdAt = job.createdAt;
  return {
    id: job.id,
    fileName: job.fileName,
    copies: job.copies,
    statusText: meta.statusText,
    tone: meta.tone,
    timeText: createdAt ? String(createdAt).replace('T', ' ').slice(0, 16) : '',
    errorText: job.lastError || '',
  };
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
  filterTemplates,
  summarizeQueue,
  mapJobRow,
  stationCapabilityText,
  stationStatusMeta,
};
