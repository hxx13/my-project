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
  /** 实验员订单包统一备注（提交给 PI 时填，整包共享） */
  packageRemark?: string | null;
  /** 加购时逐规格填的行备注 */
  remark?: string | null;
  addedBy: string;
  addedByLabel?: string;
  /** 本行锁定的笼位位置（人读串）与坐标：购物车里显示 + 定位 */
  targetAnimalCageId?: number | null;
  targetCageLabel?: string | null;
  targetCageLocation?: {
    shelveId?: string | null;
    positionX?: number | null;
    positionY?: number | null;
  } | null;
  /**
   * 加购人的人级主键（personnel.id）。同一人可能有 STAFF_xxx 与 aro_user_id 两个账号，
   * 按「人」分组/判断能不能改用它，不要用 addedBy。
   */
  addedByKey?: string | null;
  /** 这行是否属于当前登录人（服务端按 personnel.id 判定，同一人换视角也算） */
  mine?: boolean;
}
