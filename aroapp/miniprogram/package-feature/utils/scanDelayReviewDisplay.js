/** 延迟免冻结审核列表：选项分组与展示文案（与 Web scanDelayReviewDisplay.ts 同源） */

function scanDelayOptionDisplayLabel(item) {
  const label = item && item.optionLabel != null ? String(item.optionLabel).trim() : '';
  return label || '延迟免冻结';
}

function scanDelayOptionGroupKey(item) {
  const label = item && item.optionLabel != null ? String(item.optionLabel).trim() : '';
  if (label) return label;
  if (item && item.optionId) return 'option:' + item.optionId;
  return '__default__';
}

function groupScanDelayByOption(items) {
  const map = {};
  (items || []).forEach(function (item) {
    const key = scanDelayOptionGroupKey(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return Object.keys(map)
    .map(function (groupKey) {
      const groupItems = map[groupKey];
      return {
        groupKey: groupKey,
        optionLabel: scanDelayOptionDisplayLabel(groupItems[0]),
        count: groupItems.length,
        items: groupItems,
      };
    })
    .sort(function (a, b) {
      return a.optionLabel.localeCompare(b.optionLabel, 'zh-CN');
    });
}

module.exports = {
  scanDelayOptionDisplayLabel,
  scanDelayOptionGroupKey,
  groupScanDelayByOption,
};
