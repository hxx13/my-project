const { formatDailyScheduleLabel } = require('./autoApproveScheduleTime.js');

function str(v) {
  return v == null ? '' : String(v).trim();
}

function num(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonIds(raw) {
  if (Array.isArray(raw)) return raw.map((x) => num(x)).filter((x) => x > 0);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseJsonIds(JSON.parse(raw));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function scanDelayCandidateKey(c) {
  return `${c.subjectUserId}:${c.optionId}:${c.roomId || ''}`;
}

function materialCandidateKey(c) {
  return `${c.subjectUserId}:${c.itemId}`;
}

function normalizeScanDelayTrustRule(row) {
  const optionId = num(row.option_id ?? row.optionId);
  const roomId = str(row.room_id ?? row.roomId);
  const optionLabel = str(row.option_label ?? row.optionLabel) || (optionId ? `选项 #${optionId}` : '');
  let dimensionLabel = optionLabel;
  const roomName = str(row.option_room_name ?? row.optionRoomName ?? row.room_name ?? row.roomName);
  if (roomId) dimensionLabel = `${optionLabel} · ${roomName || roomId}`;
  const scheduleCron = str(row.schedule_cron ?? row.scheduleCron) || '0 0 9 * * *';
  return {
    id: num(row.id),
    subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
    subjectDisplayName: str(row.subjectDisplayName ?? row.subject_display_name),
    optionId,
    roomId,
    enabled: row.enabled === undefined ? true : Number(row.enabled) !== 0,
    triggerMode: str(row.trigger_mode ?? row.triggerMode) || 'ON_SUBMIT',
    scheduleCron,
    scheduleLabel: formatDailyScheduleLabel(scheduleCron),
    note: str(row.note),
    dimensionLabel,
    selectedKey: scanDelayCandidateKey({
      subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
      optionId,
      roomId,
    }),
  };
}

function normalizeMaterialTrustRule(row) {
  const itemId = num(row.item_id ?? row.itemId);
  const scheduleCron = str(row.schedule_cron ?? row.scheduleCron) || '0 0 9 * * *';
  return {
    id: num(row.id),
    subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
    subjectDisplayName: str(row.subjectDisplayName ?? row.subject_display_name),
    itemId,
    enabled: row.enabled === undefined ? true : Number(row.enabled) !== 0,
    triggerMode: str(row.trigger_mode ?? row.triggerMode) || 'ON_SUBMIT',
    scheduleCron,
    scheduleLabel: formatDailyScheduleLabel(scheduleCron),
    note: str(row.note),
    dimensionLabel: str(row.item_name ?? row.itemName) || (itemId ? `物资 #${itemId}` : ''),
    selectedKey: materialCandidateKey({
      subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
      itemId,
    }),
  };
}

function normalizeScanDelayBatchRule(row, optionLabelMap) {
  const optionIds = parseJsonIds(row.option_ids ?? row.optionIds);
  const scheduleCron = str(row.schedule_cron ?? row.scheduleCron) || '0 0 9 * * *';
  const optionSummary = optionIds.map((id) => (optionLabelMap && optionLabelMap[id]) || `#${id}`).join('、') || '—';
  return {
    id: num(row.id),
    name: str(row.name) || '批量自动审批',
    optionIds,
    roomIds: parseJsonIds(row.room_ids ?? row.roomIds),
    enabled: row.enabled === undefined ? true : Number(row.enabled) !== 0,
    scheduleCron,
    scheduleLabel: formatDailyScheduleLabel(scheduleCron),
    maxPerRun: num(row.max_per_run ?? row.maxPerRun) || 20,
    onlyIfReviewerMatch: row.only_if_reviewer_match === undefined
      ? row.onlyIfReviewerMatch !== false
      : Number(row.only_if_reviewer_match) !== 0,
    optionSummary,
  };
}

function normalizeMaterialBatchRule(row, itemLabelMap) {
  const itemIds = parseJsonIds(row.item_ids ?? row.itemIds);
  const scheduleCron = str(row.schedule_cron ?? row.scheduleCron) || '0 0 9 * * *';
  const itemSummary = itemIds.map((id) => (itemLabelMap && itemLabelMap[id]) || `#${id}`).join('、') || '—';
  return {
    id: num(row.id),
    name: str(row.name) || '批量自动审批',
    itemIds,
    enabled: row.enabled === undefined ? true : Number(row.enabled) !== 0,
    scheduleCron,
    scheduleLabel: formatDailyScheduleLabel(scheduleCron),
    maxPerRun: num(row.max_per_run ?? row.maxPerRun) || 20,
    onlyIfReviewerMatch: row.only_if_reviewer_match === undefined
      ? row.onlyIfReviewerMatch !== false
      : Number(row.only_if_reviewer_match) !== 0,
    itemSummary,
  };
}

function normalizeScanDelayCandidate(row) {
  const subjectUserId = str(row.subjectUserId ?? row.subject_user_id);
  const optionId = num(row.optionId ?? row.option_id);
  const roomId = str(row.roomId ?? row.room_id);
  const optionLabel = str(row.optionLabel ?? row.option_label) || (optionId ? `选项 #${optionId}` : '');
  const roomName = str(row.roomName ?? row.room_name);
  let dimensionLabel = optionLabel;
  if (roomId || roomName) dimensionLabel = `${optionLabel} · ${roomName || roomId}`;
  const key = scanDelayCandidateKey({ subjectUserId, optionId, roomId });
  const name = str(row.subjectDisplayName ?? row.subject_display_name) || subjectUserId;
  const stats = [];
  if (row.pendingCount) stats.push(`待审 ${row.pendingCount}`);
  if (row.approvedCount) stats.push(`已通过 ${row.approvedCount}`);
  const suffix = stats.length ? ` · ${stats.join(' / ')}` : '';
  const trusted = row.alreadyTrusted ? ' · 已配置' : '';
  return {
    ...row,
    key,
    subjectUserId,
    optionId,
    roomId,
    subjectDisplayName: str(row.subjectDisplayName ?? row.subject_display_name),
    pickerLabel: `${name} · ${dimensionLabel}${suffix}${trusted}`,
  };
}

function normalizeMaterialCandidate(row) {
  const subjectUserId = str(row.subjectUserId ?? row.subject_user_id);
  const itemId = num(row.itemId ?? row.item_id);
  const itemName = str(row.itemName ?? row.item_name) || (itemId ? `物资 #${itemId}` : '');
  const key = materialCandidateKey({ subjectUserId, itemId });
  const name = str(row.subjectDisplayName ?? row.subject_display_name) || subjectUserId;
  const stats = [];
  if (row.pendingCount) stats.push(`待审 ${row.pendingCount}`);
  if (row.approvedCount) stats.push(`已通过 ${row.approvedCount}`);
  const suffix = stats.length ? ` · ${stats.join(' / ')}` : '';
  const trusted = row.alreadyTrusted ? ' · 已配置' : '';
  return {
    ...row,
    key,
    subjectUserId,
    itemId,
    subjectDisplayName: str(row.subjectDisplayName ?? row.subject_display_name),
    pickerLabel: `${name} · ${itemName}${suffix}${trusted}`,
  };
}

function buildDimensionOptions(rows, kind, selectedIds) {
  const set = new Set((selectedIds || []).map((x) => Number(x)));
  return (rows || []).map((row) => {
    const id = num(row.id);
    const label = kind === 'material'
      ? str(row.name)
      : str(row.optionLabel ?? row.option_label);
    return {
      id,
      label: label || (kind === 'material' ? `物资 #${id}` : `选项 #${id}`),
      checked: set.has(id),
    };
  }).filter((x) => x.id > 0);
}

function labelMapFromDimensions(options) {
  const map = {};
  (options || []).forEach((o) => {
    if (o.id) map[o.id] = o.label;
  });
  return map;
}

module.exports = {
  normalizeScanDelayTrustRule,
  normalizeMaterialTrustRule,
  normalizeScanDelayBatchRule,
  normalizeMaterialBatchRule,
  normalizeScanDelayCandidate,
  normalizeMaterialCandidate,
  buildDimensionOptions,
  labelMapFromDimensions,
  scanDelayCandidateKey,
  materialCandidateKey,
};
