import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

/** 候选池里的单个笼位。selectable=false 时 reason 说明为什么不能点。 */
export interface ReservableCell {
  animalCageId: string;
  aupNumber?: string | null;
  cageTypeCode?: number | null;
  /** 笼位已放入的性别（用于前端提前灰掉规格不同的格子） */
  sex?: string | null;
  strainName?: string | null;
  selectable: boolean;
  reason?: string | null;
  /** 是本人锁的 */
  reservedByMe?: boolean;
  /**
   * 预定阶段：SELECTING=有人锁了但还没加购 / IN_CART=已进购物车等 PI 提交 /
   * ORDERED=已随订单提交。非空即不可选（多人可能同时在选购同一空笼位）。
   */
  cartState?: "SELECTING" | "IN_CART" | "ORDERED" | null;
}

export interface ReservableCages {
  aupRecordId: string;
  aupRegisterNo?: string | null;
  projectGroupName?: string | null;
  /** 单个笼位可放数量上限（设置中心 animal_order.cage_capacity_per_cage） */
  maxQuantityPerCage: number;
  /** 可点的笼位元数据；不可点的也在这里，带 reason */
  cells: ReservableCell[];
  selectableCageIds: string[];
  reasons: Record<string, string>;
}

/** 本课题组占用的笼架 —— 抽屉渲染哪些架子由它决定，与 AUP 无关 */
export interface GroupShelf {
  shelfIndexId: string;
  shelveId?: string | null;
  shelveName?: string | null;
  campusName?: string | null;
  areaName?: string | null;
  floorName?: string | null;
  roomName?: string | null;
  roomId?: string | null;
}

/** 抽屉渲染范围：本课题组的笼架。 */
export async function fetchGroupShelves(): Promise<GroupShelf[]> {
  const res = await authHttp.get<Result<GroupShelf[]>>("/animal-order/cage-reservations/group-shelves");
  if (!res.data?.success) throw new Error(res.data?.message || "加载本课题组笼架失败");
  return res.data.data ?? [];
}

/**
 * 该 AUP 名下可点的笼位。
 * 注意：它只管「哪个格子能点」，不管「渲染哪些架子」——后者看 fetchGroupShelves。
 */
export async function fetchReservableCages(aupRecordId: number | string): Promise<ReservableCages> {
  const res = await authHttp.get<Result<ReservableCages>>("/animal-order/cage-reservations/reservable", {
    params: { aupRecordId },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载可点笼位失败");
  return res.data.data;
}

export interface CageReservation {
  id: string;
  animalCageId: string;
  status: string;
  quantity: number;
  sex?: string | null;
  strainName?: string | null;
}

/**
 * 点笼位即锁定（预定态）。笼位本身仍是 type2，只是这张预定记录挡住别人再选。
 * 关弹窗不加购要记得 release。
 */
export async function reserveCage(body: {
  aupRecordId: number | string;
  animalCageId: string;
  refDataId?: number | null;
  /** 规格选项原文「模板名: 选项」，后端据此回填笼位表单 */
  specOptionLabel?: string | null;
  quantity: number;
}): Promise<CageReservation> {
  const res = await authHttp.post<Result<CageReservation>>("/animal-order/cage-reservations", body);
  if (!res.data?.success) throw new Error(res.data?.message || "预定笼位失败");
  return res.data.data;
}

export async function releaseCageReservation(id: number | string): Promise<void> {
  const res = await authHttp.post<Result<{ ok: boolean }>>(
    `/animal-order/cage-reservations/${encodeURIComponent(String(id))}/release`,
  );
  if (!res.data?.success) throw new Error(res.data?.message || "释放笼位失败");
}

/** 一条活跃预定（笼架网格打「已被订单预定」标记用） */
export interface ActiveCageReservation {
  reservationId: string;
  animalCageId: string;
  reserverName: string;
  quantity?: number | null;
  sex?: string | null;
  strainName?: string | null;
  orderId?: string | null;
  /** 非空 = 这次预定已挂到购物车行（加购完成），不该再接回「选择中」态 */
  cartId?: string | null;
}

export async function fetchActiveCageReservations(): Promise<ActiveCageReservation[]> {
  const res = await authHttp.get<Result<ActiveCageReservation[]>>("/animal-order/cage-reservations/active");
  if (!res.data?.success) throw new Error(res.data?.message || "加载笼位预定失败");
  return res.data.data ?? [];
}
