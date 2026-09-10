export interface CartLine {
  id: number;
  key: string;
  itemId: number;
  itemLabel: string;
  specLabel: string;
  qty: number;
  /** 单价（元）；物品未开启价格或未配价时为 null */
  unitPrice?: number | null;
  /** 小计 = unitPrice × qty */
  lineAmount?: number | null;
  /** 领用方式/房间（房间全路径） */
  pickupRoomName?: string | null;
  /** 领用人显示名；空=本人 */
  collectorName?: string | null;
  aupRecordId?: number | null;
  aupLabel?: string;
  packageStatus?: string;
  packageRemark?: string | null;
  addedBy: string;
  addedByLabel?: string;
}
