/**
 * 收件箱 kind → 展示标签（跳转逻辑见 notifications 页 onTimelineMainTap / onTimelineDetailTap）。
 * 新业务扩展时在文档 checklist 中登记 kind，并在此处增加标签映射。
 */
const KIND_LABELS = {
  NOTIFICATION: '通知',
  REPAIR: '报修',
  PURCHASE: '采购',
  SUPPLIES_CLAIM: '物资领用',
};

function labelForKind(kind) {
  const k = String(kind || '').trim().toUpperCase();
  return KIND_LABELS[k] || k || '-';
}

module.exports = {
  KIND_LABELS,
  labelForKind,
};
