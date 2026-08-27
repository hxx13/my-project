import type { CageClaimItem } from "@/api/domains/cageShelf.api";

/** 笼位申请分组维度：三档可切换 */
export type CageClaimGroupDimension = "space" | "group" | "person";

export const CAGE_CLAIM_UNSPECIFIED = "未指定";

export const CAGE_CLAIM_DIMENSION_LABEL: Record<CageClaimGroupDimension, string> = {
  space: "按空间",
  group: "按课题组",
  person: "按人员",
};

/** 每个维度一条有序字段序列（树只到房间层，深层下沉到卡片） */
export const CAGE_CLAIM_DIMENSION_FIELDS: Record<CageClaimGroupDimension, string[]> = {
  space: ["campusName", "floorName", "roomName"],
  group: ["projectGroupName", "claimantName"],
  person: ["claimantName"],
};

/** 叶子卡片展示的标签字段（未参与分层的字段下沉到卡片，避免树过深） */
export const CAGE_CLAIM_CARD_TAG_FIELDS: Record<CageClaimGroupDimension, string[]> = {
  space: ["shelveName", "positionLabel", "projectGroupName", "claimantName"],
  group: ["roomName", "shelveName", "positionLabel"],
  person: ["projectGroupName", "roomName", "shelveName", "positionLabel"],
};

/** 卡片标签字段中文名 */
export const CAGE_CLAIM_TAG_LABEL: Record<string, string> = {
  campusName: "校区",
  floorName: "楼层",
  roomName: "房间",
  shelveName: "笼架",
  positionLabel: "坐标",
  projectGroupName: "课题组",
  claimantName: "人员",
};

/** (char)('A'+x-1)+'-'+y */
export function cagePositionLabel(x: number | undefined | null, y: number | undefined | null): string {
  if (x == null || y == null) return "";
  return `${String.fromCharCode(65 + x - 1)}-${y}`;
}

function claimFieldValue(c: CageClaimItem, field: string): string {
  if (field === "positionLabel") return cagePositionLabel(c.positionX, c.positionY);
  const v = (c as unknown as Record<string, unknown>)[field];
  return v == null ? "" : String(v);
}

export interface CageClaimGroupNode {
  key: string;
  label: string;
  children: CageClaimGroupNode[];
  /** 叶子节点：claims 非空且 children 为空 */
  claims: CageClaimItem[];
}

/** 按 fieldPath 逐层 groupBy，空值归入「未指定」，返回嵌套节点；叶子 claims 非空 */
export function buildGroupTree(claims: CageClaimItem[], fieldPath: string[]): CageClaimGroupNode[] {
  const [field, ...rest] = fieldPath;
  if (!field) return [];
  const groups = new Map<string, CageClaimItem[]>();
  for (const c of claims) {
    const raw = claimFieldValue(c, field);
    const key = raw || CAGE_CLAIM_UNSPECIFIED;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    label: key,
    children: rest.length ? buildGroupTree(list, rest) : [],
    claims: rest.length ? [] : list,
  }));
}

export function isPendingCageClaim(c: CageClaimItem): boolean {
  return c.claimStatus === "pending_approval" || c.claimStatus === "pending_release_approval";
}

export function countCageClaims(node: CageClaimGroupNode): number {
  if (node.claims.length) return node.claims.length;
  return node.children.reduce((sum, ch) => sum + countCageClaims(ch), 0);
}

export function countPendingCageClaims(node: CageClaimGroupNode): number {
  if (node.claims.length) return node.claims.filter(isPendingCageClaim).length;
  return node.children.reduce((sum, ch) => sum + countPendingCageClaims(ch), 0);
}

/** 收集该分组下所有可批量通过的 claim id（仅 pending_approval，release 审批另走） */
export function collectApprovalClaimIds(node: CageClaimGroupNode): number[] {
  if (node.claims.length) {
    return node.claims.filter((c) => c.claimStatus === "pending_approval").map((c) => c.id);
  }
  return node.children.flatMap(collectApprovalClaimIds);
}

/** 跳转定位 query；shelveId/positionX/positionY 任一缺失返回 null */
export function cageClaimJumpQuery(c: CageClaimItem): string | null {
  if (c.shelveId == null || c.positionX == null || c.positionY == null) return null;
  return `?jumpShelveId=${encodeURIComponent(String(c.shelveId))}&jumpX=${c.positionX}&jumpY=${c.positionY}`;
}
