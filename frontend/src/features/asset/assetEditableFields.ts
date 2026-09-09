import type { AssetColumnDef } from "@/api/domains/asset.api";

/**
 * 资产可编辑字段集（抽屉编辑弹层 / 表格编辑模式共用，保证两处编辑同一组字段）。
 *
 * base 是 asset_record 固定字段：
 *   assetName 资产名称 / status 状态 / note 标注
 * dynamic 是 EAV 动态列（排除只读列：编码、转移申请列、数量单价价值、类别、锁定、型号）。
 *
 * 例外：note（标注）表格视图没有对应列，故表格编辑模式只补「资产名称 / 状态」两个单元格，
 *       note 仍只能在抽屉编辑弹层改 —— 这是 base 字段与表格列的唯一差异。
 */
export const ASSET_BASE_FIELDS = ["assetName", "status", "note"] as const;
export type AssetBaseField = (typeof ASSET_BASE_FIELDS)[number];

export function pickEditableColumns(columns: AssetColumnDef[]): AssetColumnDef[] {
  return columns.filter((c) => {
    const label = (c.columnLabel || "").trim();
    if (label === "资产编号" || label === "资产编码") return false;
    if (c.columnKey === "col_资产编号" || c.columnKey === "col_资产编码") return false;
    if (label === "申请转移时间" || label === "申请转移地点" || label === "申请人" || label === "申请备注") return false;
    if (label === "数量" || label === "单价" || label === "价值" || label === "记账日期" || label === "资产类别") return false;
    if (label === "是否锁定") return false;
    if (label.includes("规格型号") || label.includes("型号")) return false;
    return true;
  });
}

export function assetEditableFields(columns: AssetColumnDef[]): {
  base: AssetBaseField[];
  dynamic: AssetColumnDef[];
} {
  return { base: [...ASSET_BASE_FIELDS], dynamic: pickEditableColumns(columns) };
}

/** 「存放地点」动态列的 key（编辑态改用地点树选择器） */
export const ASSET_LOCATION_COLUMN_KEY = "col_存放地点";

export function isLocationColumn(c: AssetColumnDef): boolean {
  return c.columnKey === ASSET_LOCATION_COLUMN_KEY || (c.columnLabel || "").includes("存放地点");
}
