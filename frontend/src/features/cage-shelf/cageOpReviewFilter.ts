import type { CageOpRequestView } from "@/api/domains/cageShelf.api";

/**
 * 分笼/转移审核列表的纯筛选逻辑。
 *
 * 抽成独立模块（不放在组件里）有两个原因：
 *  ① 关键词/状态判定是「一列一列拼、再逐个 includes」的分支逻辑，最容易被后续改歪；
 *  ② 组件里塞着 React/请求，测试跑不动它 —— 这里单独留一条断言就能锁住口径。
 */

export type CageOpStatusFilter = "all" | "pending" | "approved" | "rejected";

export const CAGE_OP_STATUS_FILTER_OPTIONS: Array<{ value: CageOpStatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
];

/** 状态筛选 → 后端状态码集合。cancelled 等其余状态只在「全部」里出现。 */
const STATUS_MATCH: Record<Exclude<CageOpStatusFilter, "all">, string[]> = {
  pending: ["pending"],
  approved: ["approved"],
  rejected: ["rejected"],
};

/** 坐标匹配串：与卡片展示的「坐标」同口径是 `x-y`（如 1-2），不是 A-2 的位号名。 */
function coordText(x?: number | null, y?: number | null): string {
  if (x == null || y == null) return "";
  return `${x}-${y}`;
}

/**
 * 关键词匹配申请人姓名/账号、原因、校区·房间·笼架名、坐标。
 * 源与目标两侧都算 —— 审的人找「搬到 201C 的单」和找「从 201C 搬走的单」是同一个搜法。
 * 大小写不敏感、去首尾空格。
 */
export function matchesCageOpKeyword(req: CageOpRequestView, rawKeyword: string): boolean {
  const kw = rawKeyword.trim().toLowerCase();
  if (!kw) return true;
  const fields: string[] = [
    req.applicantName ?? "",
    req.applicantId ?? "",
    req.reason ?? "",
    req.campusName ?? "",
    req.roomName ?? "",
    req.shelveName ?? "",
    coordText(req.positionX, req.positionY),
  ];
  for (const t of req.targets ?? []) {
    fields.push(t.campusName ?? "", t.roomName ?? "", t.shelveName ?? "", coordText(t.positionX, t.positionY));
  }
  return fields.some((f) => f.toLowerCase().includes(kw));
}

/** 待审 / 已审两个分区各自过滤：关键词 + 状态，两者同时命中才留下。 */
export function filterCageOpRows(
  rows: readonly CageOpRequestView[],
  opts: { keyword: string; status: CageOpStatusFilter },
): CageOpRequestView[] {
  const allow = opts.status === "all" ? null : STATUS_MATCH[opts.status];
  return rows.filter((r) => (!allow || allow.includes(r.status)) && matchesCageOpKeyword(r, opts.keyword));
}

/** 三签角色的固定顺序与中文名（与卡片一致：归属地 → 目的地 → 兽医）。 */
const SIGN_ROLE_LABEL: Record<"ORIGIN" | "DEST" | "VET", string> = {
  ORIGIN: "归属地",
  DEST: "目的地",
  VET: "兽医",
};

/** 表格里的签署文案（卡片的「通过/暂缓/不同意」在表格里压成短词）。 */
const SIGN_DECISION_LABEL: Record<"approved" | "held" | "rejected", string> = {
  approved: "已同意",
  held: "已暂缓",
  rejected: "不同意",
};

/**
 * 三签进度文字，如「归属地 已同意 · 目的地 待签 · 兽医 待签」。
 * 只认 signatures 里有没有该角色的记录 —— missingRoles 分不出「暂缓」和「还没签」。
 * 分笼单没有三签（signatures 为空），调用方自行显示「—」。
 */
export function signatureProgressText(req: CageOpRequestView): string {
  return (["ORIGIN", "DEST", "VET"] as const)
    .map((role) => {
      const sign = req.signatures?.find((s) => s.role === role);
      const state = sign?.decision ? SIGN_DECISION_LABEL[sign.decision] : "待签";
      return `${SIGN_ROLE_LABEL[role]} ${state}`;
    })
    .join(" · ");
}

/**
 * 勾选集合 → 按当前列表顺序排列的 id。
 * 合并打印的顺序 = 入参顺序，所以必须按列表顺序收敛，不能按 Set 插入顺序。
 * 只保留仍出现在 `rows` 里的 id（过滤后隐藏的行不该进 PDF）。
 */
export function selectedIdsInOrder(
  rows: readonly CageOpRequestView[],
  selected: ReadonlySet<string>,
): string[] {
  return rows.filter((r) => selected.has(r.id)).map((r) => r.id);
}
