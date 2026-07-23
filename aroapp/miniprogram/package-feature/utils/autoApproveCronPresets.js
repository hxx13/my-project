const CRON_PRESETS = [
  { id: '15m', label: '每 15 分钟', cron: '0 */15 * * * *' },
  { id: '30m', label: '每 30 分钟', cron: '0 */30 * * * *' },
  { id: '1h', label: '每小时', cron: '0 0 * * * *' },
  { id: '9am', label: '每天 09:00', cron: '0 0 9 * * *' },
  { id: 'custom', label: '自定义 Cron', cron: '' },
];

function cronPresetIdFor(cron) {
  const c = (cron || '').trim();
  if (!c) return '15m';
  const hit = CRON_PRESETS.find((p) => p.id !== 'custom' && p.cron === c);
  return hit ? hit.id : 'custom';
}

function cronPresetLabel(cron) {
  const c = (cron || '').trim();
  if (!c) return '每 15 分钟';
  const hit = CRON_PRESETS.find((p) => p.id !== 'custom' && p.cron === c);
  return hit ? hit.label : c;
}

function cronByPresetId(presetId, currentCron) {
  const preset = CRON_PRESETS.find((p) => p.id === presetId);
  if (!preset) return currentCron || '0 */15 * * * *';
  if (presetId === 'custom') return (currentCron || '').trim() || '0 */15 * * * *';
  return preset.cron;
}

module.exports = {
  CRON_PRESETS,
  cronPresetIdFor,
  cronPresetLabel,
  cronByPresetId,
};
