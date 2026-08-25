/**
 * ============================================================================
 * 笼架管理 — 共享常量 & 工具函数
 * ============================================================================
 *
 * 本文件是笼架模块的唯一常量来源。所有页面/组件引用这些值时必须从这里 import，
 * 禁止在各自文件中重复定义。
 *
 * ⚠️ 新增规则:
 *   - 新增字段映射 → CAGE_BOX_INFO_FIELD_ORDER + CAGE_BOX_INFO_LABEL 同步追加
 *   - 新增状态标记 → CAGE_BOX_ACTIONS 追加
 *   - 新增校区 → CAMPUS_ORDER + CAMPUS_STYLES 同步追加
 *   - 新增工具函数 → 放入本文件，所有组件共用
 * ============================================================================
 */

import { CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import { SPECIAL_STATUS_LABELS } from "@/utils/cageSpecialStatusLabels";

/* ═══════════════════════════════════════════════════════════
   笼盒详情 — 字段顺序 & 中文标签映射
   用于详情面板的字段渲染顺序和显示名称
   ═══════════════════════════════════════════════════════════ */

export const CAGE_BOX_INFO_FIELD_ORDER = [
  "AnimalCageType","PositionX","PositionY","AreaId","DepartmentName",
  "floorId","RoomName","ShelveName","ProjectPiName","MobilePhone",
  "AupNumber","CageBoxQrCode","createAdmin","CreateTime","UpdateTime",
  "SpecialBreedingName","specialBreedingDescription",
  "NeedDivideYn","NeedFeedingYn","NeedTransferYn","AbnormalHealthYn","ClosingDate",
  "State","StateName","HasPhysicalBox",
  "AnimalStrainName","AnimalSex","AnimalWeekAge",
  "AnimalMaleNumber","AnimalFemaleNumber","AnimalComeFrom",
  "ExperimenterName","LabAssistantName",
] as const;

export const CAGE_BOX_INFO_LABEL: Record<string,string> = {
  AnimalCageType:"笼位类型",PositionX:"X 坐标",PositionY:"Y 坐标",
  AreaId:"区域 ID",DepartmentName:"部门",floorId:"楼层 ID",
  RoomName:"房间名称",ShelveName:"笼架名称",ProjectPiName:"课题 PI",
  MobilePhone:"手机号",AupNumber:"AUP 编号",CageBoxQrCode:"笼盒卡号",
  createAdmin:"创建人",CreateTime:"创建时间",UpdateTime:"更新时间",
  SpecialBreedingName:"特殊饲养名称",specialBreedingDescription:"特殊饲养说明",
  NeedDivideYn:"请分笼",NeedFeedingYn:"特殊饲养",NeedTransferYn:"动物转移",
  AbnormalHealthYn:"健康异常",ClosingDate:"合笼日期",
  State:"状态值",StateName:"状态名称",HasPhysicalBox:"是否有实体笼盒",
  AnimalStrainName:"动物品系",AnimalSex:"性别",AnimalWeekAge:"周龄",
  AnimalMaleNumber:"雄性数量",AnimalFemaleNumber:"雌性数量",AnimalComeFrom:"来源",
  ExperimenterName:"实验员",LabAssistantName:"实验人员",
};

/* ═══════════════════════════════════════════════════════════
   租用类型标签
   ═══════════════════════════════════════════════════════════ */

export const RENT_TYPE_LABEL: Record<number,string> = { 1:"空闲", 2:"正常租用", 3:"接近到期", 4:"很快到期" };

/* ═══════════════════════════════════════════════════════════
   笼位类型 → 颜色映射
   1=等待分配(黄) / 2=已预约(绿) / 3=饲养中(红) / 4=异常(蓝)
   ═══════════════════════════════════════════════════════════ */

export const CAGE_TYPE_COLORS: Record<number,{bg:string;border:string;label:string}> = {
  1:{bg:"#fef3c7",border:"#f59e0b",label:"等待分配"},
  2:{bg:"#d1fae5",border:"#10b981",label:"已预约(空笼盒)"},
  3:{bg:"#ffe4e6",border:"#e11d48",label:"饲养中"},
  4:{bg:"#dbeafe",border:"#3b82f6",label:"异常"},
};


/* ═══════════════════════════════════════════════════════════
   编辑模式状态动作 — 唯一来源
   一个状态涉及 4 个命名：UI 动作名、表单 canonical(snake)、statusPhotos key(=snake)、ARO Yn 字段。
   状态标记唯一真相源是表单 cage_info_value（canonical=snake_case），
   禁止再读 cage_cell_detail 的 camelCase 字段（已删 detailKey）。
   ⚠️ 新增状态：本表加一行 + 后端 CageCellDetailService.toggleStatus 加 case。
   ═══════════════════════════════════════════════════════════ */

export const CAGE_BOX_ACTIONS = [
  {action:"DIVIDE",           statusField:"needs_division",         aroYnField:"NeedDivideYn",    statusCode:"NEED_DIVIDE",    label:SPECIAL_STATUS_LABELS.NEED_DIVIDE},
  {action:"SPECIAL_BREEDING", statusField:"needs_special_feeding",  aroYnField:"NeedFeedingYn",   statusCode:"SPECIAL_FEEDING",label:SPECIAL_STATUS_LABELS.SPECIAL_FEEDING},
  {action:"HEALTH_CHECK",     statusField:"has_health_abnormality", aroYnField:"AbnormalHealthYn",statusCode:"HEALTH_ABNORMAL",label:SPECIAL_STATUS_LABELS.HEALTH_ABNORMAL},
  {action:"COHABITATION",     statusField:"needs_cohabitation",     aroYnField:null,              statusCode:"COHABITATION",   label:SPECIAL_STATUS_LABELS.COHABITATION},
  {action:"TRANSFER",         statusField:"needs_transfer",         aroYnField:"NeedTransferYn",  statusCode:"ANIMAL_TRANSFER",label:SPECIAL_STATUS_LABELS.ANIMAL_TRANSFER},
] as const;

/** 编辑模式可切换的状态动作。合笼为本地自定义状态，ARO 侧无对应字段。 */
export type CageBoxAction = (typeof CAGE_BOX_ACTIONS)[number]["action"];

export const CAGE_BOX_ACTION_LIST = CAGE_BOX_ACTIONS.map(a => a.action) as readonly CageBoxAction[];

export function cageBoxAction(action: CageBoxAction) {
  return CAGE_BOX_ACTIONS.find(a => a.action === action)!;
}

/** 真值判定：表单值存 boolean，ARO 快照存 1/0，字符串形态也出现过 */
function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

/**
 * 从表单值(cage_info_value)读出当前已开启的动作 —— 状态标记的唯一真相源。
 * 编辑弹窗反向使能按钮必须读这里（canonical=snake_case），不能再读 cage_cell_detail 的 camelCase 字段。
 */
export function actionsFromFormValues(
  rows: Array<{ canonical: string; value: unknown }> | undefined | null,
): Set<CageBoxAction> {
  const set = new Set<CageBoxAction>();
  if (!rows) return set;
  const byCanonical: Record<string, unknown> = {};
  for (const r of rows) if (r && r.canonical != null) byCanonical[r.canonical] = r.value;
  for (const a of CAGE_BOX_ACTIONS) if (truthy(byCanonical[a.statusField])) set.add(a.action);
  return set;
}

/** 从 ARO 笼盒快照读出当前已开启的动作（cageBoxVo 是同一批字段的 camelCase 别名） */
export function actionsFromCageBoxInfo(
  cbi: Record<string, unknown> | undefined | null,
  cvo?: Record<string, unknown> | null,
): Set<CageBoxAction> {
  const set = new Set<CageBoxAction>();
  for (const a of CAGE_BOX_ACTIONS) {
    if (!a.aroYnField) continue; // 本地专有状态，ARO 快照里查不到
    const camel = a.aroYnField.charAt(0).toLowerCase() + a.aroYnField.slice(1);
    if (truthy(cbi?.[a.aroYnField]) || truthy(cvo?.[camel])) set.add(a.action);
  }
  return set;
}

/**
 * 该笼位当前应写入哪些 statusPhotos key。
 * 照片按「已开启的状态」归档，与编辑弹窗里临时勾选的动作无关 ——
 * 勾选尚未提交时状态还没开，照片应落 _status 兜底。
 */
export function statusPhotoKeys(activeActions: Set<CageBoxAction>): string[] {
  return CAGE_BOX_ACTIONS.filter(a => activeActions.has(a.action)).map(a => a.statusField);
}

/* ═══════════════════════════════════════════════════════════
   通用工具函数
   ═══════════════════════════════════════════════════════════ */

export function nonEmptyText(s?:string|null):boolean{return typeof s==="string"&&s.trim()!==""}

export function formatCageDetailValue(v:unknown,key?:string):string{
  if(v===null||v===undefined||v==="")return"-";
  if(typeof v==="boolean")return v?"是":"否";
  if(key==="AnimalCageType"){
    const ct = Number(v);
    return CAGE_TYPE_LABEL[ct] ?? String(v);
  }
  return String(v);
}

/** 坐标显示反转：后端 A-1(顶行) → 显示 A-10(底行)，内容不动仅编号反转 */
export function displayPosition(pos: string): string {
  // 字母格式: A-1 → A-10
  const m1 = pos.match(/^([A-H])-(\d+)$/);
  if (m1) return `${m1[1]}-${11 - parseInt(m1[2])}`;
  // 数字格式: 1-1 → A-10
  const m2 = pos.match(/^(\d+)-(\d+)$/);
  if (m2) {
    const col = String.fromCharCode(64 + parseInt(m2[1]));
    return `${col}-${11 - parseInt(m2[2])}`;
  }
  return pos;
}

/* ═══════════════════════════════════════════════════════════
   校区 — 排序 & 样式
   CampusTree 组件依赖这些常量渲染左侧目录树
   ═══════════════════════════════════════════════════════════ */

export const CAMPUS_ORDER = ["浦东","浦西"] as const;

export const CAMPUS_STYLES: Record<string,{bg:string;badge:string;text:string}> = {
  "浦东":{bg:"linear-gradient(135deg,#0284c7,#0369a1)",badge:"rgba(255,255,255,0.18)",text:"#fff"},
  "浦西":{bg:"linear-gradient(135deg,#d97706,#b45309)",badge:"rgba(255,255,255,0.18)",text:"#fff"},
};

export const cs = (n:string) => CAMPUS_STYLES[n] ?? {bg:"#64748b",badge:"rgba(255,255,255,0.15)",text:"#fff"};

export interface TreeNode {
  key:string;
  label:string;
  type:"campus"|"area"|"floor"|"room"|"shelf";
  children:TreeNode[];
  raw?:any;
}
