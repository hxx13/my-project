/**
 * 笼位详情字段映射 — 对齐管理端 AdminCageShelfPage CAGE_BOX_INFO_LABEL
 */
import type { CageShelfCell } from "@/features/student/api/student.api";
import { CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import {
  buildSpecialStatusEntriesFromCageBoxInfo,
  formatSpecialStatusDisplayLabel,
  resolveSpecialStatusLabel,
} from "@/utils/cageSpecialStatusLabels";

export const CAMPUS_ORDER = ["浦东", "浦西"] as const;

/** 管理端 cageBoxInfo 字段 → 中文标签（移动端详情展示子集） */
export const CAGE_BOX_INFO_LABEL: Record<string, string> = {
  AnimalCageType: "笼位类型",
  State: "状态值",
  StateName: "状态名称",
  DepartmentName: "部门",
  ProjectPiName: "课题 PI",
  MobilePhone: "手机号",
  AupNumber: "AUP 编号",
  CageBoxQrCode: "笼盒卡号",
  createAdmin: "创建人",
  CreateTime: "创建时间",
  UpdateTime: "更新时间",
  SpecialBreedingName: "特殊饲养名称",
  specialBreedingDescription: "特殊饲养说明",
  NeedDivideYn: "请分笼",
  NeedFeedingYn: "特殊饲养",
  NeedTransferYn: "动物转移",
  AbnormalHealthYn: "健康异常",
  ClosingDate: "合笼日期",
  HasPhysicalBox: "是否有实体笼盒",
  RoomName: "房间名称",
  ShelveName: "笼架名称",
};

export interface CageDetailField {
  key: string;
  label: string;
  value: string;
  highlight?: "danger" | "warn" | "info" | "health";
  fullWidth?: boolean;
  mono?: boolean;
}

export interface CageDetailSection {
  id: string;
  title: string;
  fields: CageDetailField[];
  /** true = 区块可折叠；无数据时不渲染 */
  collapsible?: boolean;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "是" : "否";
  if (v === 1 || v === "1") return "是";
  if (v === 0 || v === "0") return "否";
  return String(v).trim();
}

function biGet(bi: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!bi) return "";
  for (const k of keys) {
    const v = formatValue(bi[k]);
    if (v) return v;
  }
  return "";
}

function ynTrue(bi: Record<string, unknown> | undefined, key: string): boolean {
  if (!bi) return false;
  const v = bi[key];
  return v === 1 || v === "1" || v === true;
}

/** 笼位类型文案（animalCageType ≠ 动物类型） */
export function resolveCageTypeLabel(cell: Pick<CageShelfCell, "animalCageType" | "stateLabel">): string {
  const t = cell.animalCageType;
  if (t != null && CAGE_TYPE_LABEL[t]) return CAGE_TYPE_LABEL[t];
  if (t === 1) return "等待分配";
  if (t === 2) return "已预约(空笼盒)";
  if (t === 3) return "已预约(饲养中)";
  if (t === 4) return "异常";
  return "未知";
}

/**
 * 状态名称 — 与笼位类型去重，避免 header 与字段重复展示相同文案
 */
export function resolveStateNameDisplay(
  cell: Pick<CageShelfCell, "stateLabel" | "animalCageType">,
  bi?: Record<string, unknown> | null,
): string | null {
  const cageType = resolveCageTypeLabel(cell);
  const stateName = biGet(bi ?? undefined, "StateName", "stateName") || (cell.stateLabel?.trim() ?? "");
  if (!stateName || stateName === "空位" || stateName === cageType) return null;
  return stateName;
}

export function resolveSpecialStatusChips(cell: CageShelfCell) {
  let list = cell.specialStatuses ?? [];
  if (!list.length || (list.length === 1 && list[0].code === "NORMAL")) {
    list = buildSpecialStatusEntriesFromCageBoxInfo(cell.cageBoxInfo);
  }
  return list
    .filter((s) => s.code !== "NORMAL")
    .map((s) => ({
      code: s.code,
      label: resolveSpecialStatusLabel(s.code, s.label),
    }));
}

export function buildCageDetailSections(
  cell: CageShelfCell,
  gridMeta?: {
    campusName?: string;
    areaName?: string;
    floorName?: string;
    roomName?: string;
    shelveName?: string;
  } | null,
): CageDetailSection[] {
  const bi = (cell.cageBoxInfo ?? cell.detail ?? {}) as Record<string, unknown>;
  const sections: CageDetailSection[] = [];

  const basicFields: CageDetailField[] = [
    { key: "cageType", label: "笼位类型", value: resolveCageTypeLabel(cell) },
  ];
  const stateName = resolveStateNameDisplay(cell, bi);
  if (stateName) {
    basicFields.push({ key: "stateName", label: "状态名称", value: stateName });
  }
  const specialSummary = formatSpecialStatusDisplayLabel(
    cell.specialStatuses?.length
      ? cell.specialStatuses
      : buildSpecialStatusEntriesFromCageBoxInfo(cell.cageBoxInfo),
  );
  if (specialSummary) {
    basicFields.push({ key: "specialSummary", label: "特殊状态", value: specialSummary, fullWidth: true });
  }
  sections.push({ id: "basic", title: "基础信息", fields: basicFields });

  const projectFields: CageDetailField[] = [];
  const dept = cell.departmentName || biGet(bi, "DepartmentName", "departmentName");
  const pi = cell.projectPiName || biGet(bi, "ProjectPiName", "projectPiName", "piName");
  const aup = cell.aupNumber || biGet(bi, "AupNumber", "aupNumber");
  const phone = biGet(bi, "MobilePhone", "mobilePhone");
  if (dept) projectFields.push({ key: "dept", label: "课题组", value: dept });
  if (pi) projectFields.push({ key: "pi", label: "课题 PI", value: pi });
  if (aup) projectFields.push({ key: "aup", label: "AUP 编号", value: aup });
  if (phone) projectFields.push({ key: "phone", label: "手机号", value: phone });
  if (projectFields.length) {
    sections.push({ id: "project", title: "课题信息", fields: projectFields, collapsible: true });
  }

  const flagFields: CageDetailField[] = [];
  if (ynTrue(bi, "NeedDivideYn")) flagFields.push({ key: "divide", label: "请分笼", value: "是", highlight: "danger" });
  if (ynTrue(bi, "NeedFeedingYn")) flagFields.push({ key: "feeding", label: "特殊饲养", value: "是", highlight: "warn" });
  if (ynTrue(bi, "NeedTransferYn")) flagFields.push({ key: "transfer", label: "动物转移", value: "是", highlight: "info" });
  if (ynTrue(bi, "AbnormalHealthYn")) flagFields.push({ key: "health", label: "健康异常", value: "是", highlight: "health" });
  const closing = biGet(bi, "ClosingDate", "closingDate");
  if (closing) flagFields.push({ key: "closing", label: "合笼日期", value: closing });
  const breedingName = biGet(bi, "SpecialBreedingName", "specialBreedingName");
  if (breedingName) flagFields.push({ key: "breedingName", label: "特殊饲养名称", value: breedingName, fullWidth: true });
  const breedingDesc = biGet(bi, "specialBreedingDescription", "SpecialBreedingDescription");
  if (breedingDesc) flagFields.push({ key: "breedingDesc", label: "特殊饲养说明", value: breedingDesc, fullWidth: true });
  if (flagFields.length) {
    sections.push({ id: "flags", title: "饲养与状态标记", fields: flagFields, collapsible: true });
  }

  const boxFields: CageDetailField[] = [];
  const qr = cell.cageBoxQrCode || biGet(bi, "CageBoxQrCode", "cageBoxQrCode");
  if (qr) boxFields.push({ key: "qr", label: "笼盒卡号", value: qr, fullWidth: true, mono: true });
  const hasBox = biGet(bi, "HasPhysicalBox", "hasPhysicalBox");
  if (hasBox) boxFields.push({ key: "hasBox", label: "是否有实体笼盒", value: hasBox });
  if (boxFields.length) {
    sections.push({ id: "box", title: "笼盒信息", fields: boxFields, collapsible: true });
  }

  const locParts = [
    gridMeta?.campusName,
    gridMeta?.areaName,
    gridMeta?.floorName,
    gridMeta?.roomName,
    gridMeta?.shelveName,
  ].filter((p) => p && String(p).trim());
  if (locParts.length) {
    sections.push({
      id: "location",
      title: "位置",
      fields: [{ key: "loc", label: "位置", value: locParts.join(" / "), fullWidth: true }],
      collapsible: true,
    });
  }

  const sysFields: CageDetailField[] = [];
  const createAdmin = biGet(bi, "createAdmin");
  const createTime = biGet(bi, "CreateTime", "createTime");
  const updateTime = biGet(bi, "UpdateTime", "updateTime");
  if (createAdmin) sysFields.push({ key: "createAdmin", label: "创建人", value: createAdmin });
  if (createTime) sysFields.push({ key: "createTime", label: "创建时间", value: createTime });
  if (updateTime) sysFields.push({ key: "updateTime", label: "更新时间", value: updateTime });
  if (sysFields.length) {
    sections.push({ id: "system", title: "系统信息", fields: sysFields, collapsible: true });
  }

  return sections;
}

export function parseImageUrlLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function appendImageUrls(existing: string, newUrls: string[]): string {
  const merged = [...parseImageUrlLines(existing), ...newUrls.filter(Boolean)];
  return merged.join("\n");
}
