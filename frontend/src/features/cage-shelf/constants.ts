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
 *   - 新增状态标记 → STATUS_CHIPS 追加
 *   - 新增校区 → CAMPUS_ORDER + CAMPUS_STYLES 同步追加
 *   - 新增工具函数 → 放入本文件，所有组件共用
 * ============================================================================
 */

import { CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";

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
   特殊状态标记
   用于详情面板和编辑模式的状态选择
   ═══════════════════════════════════════════════════════════ */

export const STATUS_CHIPS: Array<{key:string;label:string;color:string;icon:string}> = [
  {key:"needsDivision",label:"需分笼",color:"#eab308",icon:"🟡"},
  {key:"needsSpecialFeeding",label:"特殊饲养",color:"#ef4444",icon:"🔴"},
  {key:"hasHealthAbnormality",label:"健康异常",color:"#a855f7",icon:"🟣"},
  {key:"needsTransfer",label:"动物转移",color:"#06b6d4",icon:"🔵"},
  {key:"cohabitationDate",label:"合笼",color:"#10b981",icon:"🟢"},
];

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
