import type { RefOrder, RefOrderLine } from "@/api/domains/referenceData.api";
import { formatBeijingDateTimeFull } from "@/utils/beijingTime";

/**
 * 订单「展示模型」：把头+行两级、且本地单与 ARO 导入单结构不同的数据，
 * 归一成一套字段，供卡片/表格（含小程序与 H5）共用。
 * 抽出来的意义是**两端字段不会各写各的**——改一处两边都生效。
 */

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  APPROVED: "已批准",
  REJECTED: "已驳回",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export function statusTone(s: string): "pending" | "ok" | "bad" | "none" {
  if (s === "PENDING") return "pending";
  if (s === "APPROVED" || s === "COMPLETED") return "ok";
  if (s === "REJECTED") return "bad";
  return "none";
}

function chainName(line: RefOrderLine, refType: string): string {
  const chain = Array.isArray(line.hierarchyChain) ? line.hierarchyChain : [];
  const hit = chain.find((n) => n && typeof n === "object" && (n as { refType?: string }).refType === refType);
  return (hit as { displayName?: string } | undefined)?.displayName?.trim() || "";
}

/** 明细取名：优先 ARO 导入的结构化列，回退到本地 hierarchy_chain */
export function lineNames(line: RefOrderLine): { supplier: string; strain: string; spec: string } {
  return {
    supplier: (line.supplierName || "").trim() || chainName(line, "SUPPLIER"),
    strain: (line.strainName || "").trim() || chainName(line, "ANIMAL_STRAIN"),
    spec: (line.specName || "").trim() || chainName(line, "GENOTYPE"),
  };
}

export function specOptionText(line: RefOrderLine): string {
  const raw = line.specSelections;
  if (!raw) return "";
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return raw; }
  } else {
    obj = raw as Record<string, unknown>;
  }
  const opt = obj.option;
  return typeof opt === "string" ? opt : "";
}

/** 性别在本地与 ARO 都落在规格选项上，据此拆雄/雌数量 */
function lineGender(line: RefOrderLine): "male" | "female" | "" {
  const opt = specOptionText(line);
  if (opt.includes("雄性")) return "male";
  if (opt.includes("雌性")) return "female";
  return "";
}

/**
 * 单行的雄/雌数量：性别只写在行的规格选项上，所以一行最多落在一边。
 * 表格拆成明细行后每行要各显各的，订单级汇总仍看 {@link OrderDisplay} 的 maleQty/femaleQty。
 */
export function lineGenderQty(line: RefOrderLine): { male: number; female: number } {
  const qty = line.quantity ?? 0;
  const g = lineGender(line);
  return { male: g === "male" ? qty : 0, female: g === "female" ? qty : 0 };
}

export function lineAupLabel(line: RefOrderLine): string {
  if (line.registerNo?.trim()) return line.registerNo.trim();
  return line.aupRecordId != null ? `AUP#${line.aupRecordId}` : "";
}

/** 按 AUP 分组明细，便于一眼看清多 AUP 共享车提交 */
export function groupLinesByAup(lines: RefOrderLine[]): Array<{ key: string; label: string; lines: RefOrderLine[] }> {
  const map = new Map<string, { label: string; lines: RefOrderLine[] }>();
  for (const line of lines) {
    const key = line.aupRecordId != null ? String(line.aupRecordId) : "none";
    const label = lineAupLabel(line) || "未归属 AUP";
    const bucket = map.get(key);
    if (bucket) bucket.lines.push(line);
    else map.set(key, { label, lines: [line] });
  }
  return Array.from(map.entries()).map(([key, v]) => ({ key, label: v.label, lines: v.lines }));
}

export interface OrderDisplay {
  key: string;
  orderId: number;
  no: string;
  source: "LOCAL" | "ARO";
  projectGroup: string;
  submitter: string;
  items: Array<{ label: string; spec: string; qty: number }>;
  suppliers: string;
  strains: string;
  maleQty: number;
  femaleQty: number;
  totalQty: number;
  amount: number | null;
  aup: string;
  collector: string;
  room: string;
  /** 目标笼位人读串（订购→笼位预定），多笼位用「、」连接 */
  cage: string;
  arrivalDate: string;
  campus: string;
  /** 备注（整单优先，无整单备注时汇总行备注）——卡片按这个显示 */
  remark: string;
  /** 只含整单备注：表格拆成明细行后「整单备注」与「行备注」分列，不能再回退拼接 */
  orderRemark: string;
  status: string;
  statusLabel: string;
  /** 服务端判定：当前人是不是该单提交人（PI）且订单待处理 —— 只有他能进编辑 */
  editable: boolean;
  time: string;
}

export function buildOrderDisplay(order: RefOrder): OrderDisplay {
  const lines = order.lines ?? [];
  let male = 0, female = 0, total = 0;
  const suppliers = new Set<string>(), strains = new Set<string>();
  const items: Array<{ label: string; spec: string; qty: number }> = [];
  const collectors = new Set<string>(), rooms = new Set<string>(), arrivals = new Set<string>();
  const cages = new Set<string>();
  const lineRemarks: string[] = [];

  for (const l of lines) {
    const { supplier, strain, spec } = lineNames(l);
    if (supplier) suppliers.add(supplier);
    if (strain) strains.add(strain);
    const opt = specOptionText(l);
    items.push({
      label: strain || spec || (l.refDataId != null ? `物品 #${l.refDataId}` : "物品"),
      spec: opt || spec,
      qty: l.quantity ?? 0,
    });
    const g = lineGender(l);
    if (g === "male") male += l.quantity ?? 0;
    else if (g === "female") female += l.quantity ?? 0;
    total += l.quantity ?? 0;
    if (l.collectorName?.trim()) collectors.add(l.collectorName.trim());
    if (l.pickupRoomName?.trim()) rooms.add(l.pickupRoomName.trim());
    // 笼位快照串可能为空但已锁位（老数据/坐标缺失），退化成「已选笼位」而不是漏掉
    if (l.targetCageLabel?.trim()) cages.add(l.targetCageLabel.trim());
    else if (l.targetAnimalCageId != null) cages.add("已选笼位");
    if (l.arrivalDate?.trim()) arrivals.add(l.arrivalDate.trim());
    if (l.lineRemark?.trim()) lineRemarks.push(l.lineRemark.trim());
  }

  // 备注：整单备注优先，其次汇总行备注——两个视图都靠这一个字段
  const orderRemark = (order.submitRemark || "").trim();
  const remark = orderRemark || lineRemarks.join("；");
  const source = (order.source === "ARO" ? "ARO" : "LOCAL") as "LOCAL" | "ARO";

  return {
    key: `${source}-${order.id}`,
    orderId: order.id,
    no: order.sn?.trim() || `#${order.id}`,
    source,
    projectGroup: order.projectGroupName?.trim() || "—",
    // ARO 单的 submitterId 是合成键（ARO:xxx），没有真名时宁可显示「—」也不露合成 id
    submitter: order.submitterName?.trim()
      || (source === "ARO" ? "" : order.submitterId?.trim() || "")
      || "—",
    items,
    suppliers: Array.from(suppliers).join("、") || "—",
    strains: Array.from(strains).join("、") || "—",
    maleQty: male,
    femaleQty: female,
    totalQty: total,
    amount: order.totalAmount ?? null,
    aup: order.registerNo?.trim() || (order.aupRecordId != null ? `AUP#${order.aupRecordId}` : "—"),
    collector: Array.from(collectors).join("、") || "—",
    room: Array.from(rooms).join("、") || "—",
    cage: Array.from(cages).join("、") || "—",
    // 实际到货日只有 ARO 导入单有；本地自建单下单时算的是「预计送达日」，
    // 没有实际到货就回退显示预计值并标注，避免这一列对本地单永远是「—」。
    arrivalDate: Array.from(arrivals).join("、")
      || (order.estimatedDeliveryDate?.trim() ? `预计 ${order.estimatedDeliveryDate.trim()}` : "—"),
    campus: order.campus?.trim() || order.aroAreaName?.trim() || "—",
    remark: remark || "—",
    orderRemark: orderRemark || "—",
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    editable: Boolean(order.editable),
    time: formatBeijingDateTimeFull(order.submittedAt || order.createdAt),
  };
}
