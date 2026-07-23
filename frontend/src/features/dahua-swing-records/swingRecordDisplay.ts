/** 与大华 openType 及后台 AccessSwingRecordPresenter 对齐 */
export const SWING_OPEN_TYPE_LABEL: Record<number, string> = {
  51: "合法刷卡开门",
  52: "非法刷卡开门",
  48: "远程开门",
  49: "按钮开门",
};

export function labelOpenType(openType?: number | null): string {
  if (openType == null) return "-";
  return SWING_OPEN_TYPE_LABEL[openType] ?? String(openType);
}

export function labelOpenResult(openResult?: number | null, label?: string): string {
  if (label) return label;
  if (openResult === 1) return "成功";
  if (openResult === 0) return "失败";
  return "-";
}

export function labelMappingHit(mappingHit?: number | null, mappingUserId?: string): string {
  if (mappingHit === 1) {
    return mappingUserId ? `已映射 ${mappingUserId}` : "已映射";
  }
  if (mappingHit === 0) return "未映射";
  return "-";
}
