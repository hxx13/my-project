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
  1:{bg:"#fef3c7",border:"#f59e0b",label:"(等待分配)"},
  2:{bg:"#d1fae5",border:"#10b981",label:"(空笼位)"},
  3:{bg:"#ffe4e6",border:"#e11d48",label:"(饲养中)"},
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

/* ═══════════════════════════════════════════════════════════
   特殊饲养明细（特殊饲养下的可配置子状态）
   —— 与后端 CageStatusIntervalService 的常量一一对应，改一处要改两处。
   每个码表项以 `SF_ + item_code` 作为独立的 statusCode 参与阈值/超时/违规链。
   ═══════════════════════════════════════════════════════════ */

/** 明细字段的 canonical（单选之外的多选字段，值落 cage_info_value.value_json）。 */
export const SPECIAL_DETAIL_CANONICAL = "special_feeding_details";
/** 明细的码表 code（与字段的 dict_key 一致）—— 可选项从这份码表读。 */
export const SPECIAL_DETAIL_DICT = "special_feeding_detail";
/** 明细状态码前缀（与后端一致）：statusCode = 前缀 + item_code。 */
export const SPECIAL_DETAIL_STATUS_PREFIX = "SF_";

/* ═══════════════════════════════════════════════════════════
   健康异常严重程度（健康异常下的**互斥单选**子值）
   —— 与后端 CageInfoValueService.HEALTH_SEVERITY_CANONICAL 一一对应，改一处要改两处。
   它**不产生状态码、不进折叠、没有阈值行**：只影响展示与「通知兽医/所有者」的文案。
   ═══════════════════════════════════════════════════════════ */

/** 严重程度字段的 canonical（单选 ENUM，值落 cage_info_value.value_text）。 */
export const HEALTH_SEVERITY_CANONICAL = "health_abnormality_severity";
/** 严重程度的码表 code（与字段的 dict_key 一致）—— 可选项从这份码表读，加项不用改代码。 */
export const HEALTH_SEVERITY_DICT = "health_abnormality_severity";
/**
 * 健康异常「瘙痒」字段的 canonical —— **布尔**（落 value_bool）。
 *
 * 界面把勾选框画在每一档严重程度旁边（数据上它是一个布尔，不是「每档一个」）：
 * 严重程度互斥，所以实际最多出现「某一档 + 瘙痒」一个组合。
 * 写接口约定：`itemCodes` 传 `["1"]` = 打勾、`[]` = 取消（见后端 `BOOL_TRUE_CODE`）。
 */
export const HEALTH_ITCH_CANONICAL = "health_abnormality_itch";
/** 瘙痒在学生侧的动作码（与后端 STUDENT_EDIT_ACTIONS 的键一致）。 */
export const HEALTH_ITCH_ACTION = "HEALTH_ITCH";
/** 瘙痒的中文名 —— 布尔字段没有码表可查，角标/勾选框都用这一个名字。 */
export const HEALTH_ITCH_LABEL = "瘙痒";
/** 布尔子值「打勾」的哨兵值（与后端 CageInfoValueService.BOOL_TRUE_CODE 一致）。 */
export const HEALTH_ITCH_TRUE = "1";

/**
 * 「兽医未读」的紫色 —— 三端描边共用这一处。
 *
 * 它是**悬浮层**（内描边），不动笼位自己的状态底色：表达的是「这条消息看过没」，
 * 不是笼位状态；与右上角角标、红框（最后扫码）等各占各的图层。
 */
export const VET_UNREAD_COLOR = "#a855f7";
/**
 * 严重程度在学生侧对应的**动作码** —— 与后端 `CageModeVisibilityService.STUDENT_EDIT_ACTIONS`
 * 的键一致。它不在 {@link CAGE_BOX_ACTIONS} 里（那不是状态，是状态下的子值），
 * 所以学生的可见性单独按它查下发的动作白名单。
 */
export const HEALTH_SEVERITY_ACTION = "HEALTH_SEVERITY";
/** 健康异常父状态对应的动作码（学生侧同样按白名单查）。 */
export const HEALTH_CHECK_ACTION = "HEALTH_CHECK";

/**
 * 从表单值行里取「特殊饲养明细」的当前选中集合。
 * 多选字段（data_type=ENUM_MULTI）的值是 item_code 数组；读不到就是空集。
 * 三端共用这一份 —— 判断「用户改了什么」的起点必须同源。
 */
export function detailCodesOfValues(
  rows: { canonical?: string | null; value?: unknown }[] | null | undefined,
): Set<string> {
  const v = rows?.find((r) => r?.canonical === SPECIAL_DETAIL_CANONICAL)?.value;
  return new Set(Array.isArray(v) ? v.map(String) : []);
}

/**
 * 从表单值行里取「健康异常严重程度」的当前值（互斥单选的 item_code）。
 * 空串/非字符串/字段不存在 → null（= 未选）。三端共用这一份 —— 与 {@link detailCodesOfValues} 同源。
 */
export function severityOfValues(
  rows: { canonical?: string | null; value?: unknown }[] | null | undefined,
): string | null {
  const v = rows?.find((r) => r?.canonical === HEALTH_SEVERITY_CANONICAL)?.value;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** 从表单值行里取「瘙痒」布尔值；缺字段/非真值 → false。 */
export function itchOfValues(
  rows: { canonical?: string | null; value?: unknown }[] | null | undefined,
): boolean {
  const v = rows?.find((r) => r?.canonical === HEALTH_ITCH_CANONICAL)?.value;
  return v === true || v === 1 || v === "1";
}

/** 否定义的首字（「勿加食」「不禁食」都算否定）—— 决定角标记号的 + / −。 */
const NEGATIVE_DETAIL_LABEL = /^[勿不禁无]/;

/**
 * 明细项中文名 → 格子右上角角标的紧凑记法。
 *
 * 码表名是「需加食」这种完整说法，格子（80×82px）塞不下全名，所以压成一枚两字记号：
 * **首字定肯定/否定**（勿·不·禁·无 → `−`，其余 → `+`），**末字才是对象**（食/水）。
 * 于是 需加食 → `+食`、勿加水 → `−水`；全名挂在 title 上。名字太短（<2 字）则原样返回。
 */
export function compactDetailBadgeText(label: string): string {
  const t = (label ?? "").trim();
  if (t.length < 2) return t;
  return `${NEGATIVE_DETAIL_LABEL.test(t) ? "−" : "+"}${t.slice(-1)}`;
}

export interface SpecialDetailBadgeItem {
  /** 码表 item_code（不含 SF_ 前缀） */
  code: string;
  /** 后端下发的中文名；暂存态没有，交给角标组件查码表补 */
  label?: string | null;
}

/**
 * 该状态**不是违规行为** —— 特殊饲养 / 合笼 / 特殊饲养明细（`SF_` 前缀）/ 健康异常。
 *
 * 服务端口径：这些状态到阈值只发通知（推送中心的「笼位状态提醒」或健康异常的两个源），
 * **不建违规记录**。阈值配置界面据此把动作下拉换成「仅高亮 / 仅通知 / 高亮+通知」，
 * 免得用户配了「违规」却发现什么都没发生。
 *
 * ⚠ **两份实现必须同步**：这里（前端，决定下拉怎么显示）+ 后端
 * `CageStatusAlertScheduler.NON_VIOLATION_STATUSES`（决定真的建不建违规）。
 * 2026-09-17 就漏过一次：后端加了健康异常、前端没加，界面照旧显示「仅违规」。
 */
export function isNonViolationStatus(statusCode: string | null | undefined): boolean {
  if (!statusCode) return false;
  return statusCode === "SPECIAL_FEEDING"
    || statusCode === "COHABITATION"
    // 健康异常也是通知类型（2026-09-17 定）：到阈值只发通知兽医 / 笼位所有者，不建违规。
    // ⚠ 这份谓词有两份实现 —— 这里是**前端**那份（决定动作下拉显示「仅通知」还是「仅违规」），
    //   后端那份在 CageStatusAlertScheduler.NON_VIOLATION_STATUSES（决定真的建不建违规）。
    //   加/删一个非违规状态，**两边都要改**，否则界面会撒谎（显示「仅违规」却不产生违规）。
    || statusCode === "HEALTH_ABNORMAL"
    || statusCode.startsWith(SPECIAL_DETAIL_STATUS_PREFIX);
}

/**
 * 健康异常那一族的角标（**最多两枚**：严重程度 + 瘙痒），纵排。
 *
 * 与明细角标并排但各占一列：这一族两个标签都点同一份「有健康异常」门控，
 * 所以由一个函数一起算，别在调用方拼两个数组（拼错了就会出现「父状态关着还留着瘙痒」）。
 *
 * 取值口径同 {@link severityBadgeFor}：暂存**带了** 对应键就以暂存为准（显式 null/false = 清空）、
 * **没带**（只改了别的状态）就回落服务端值、最后强绑定父状态开着。
 */
export function healthBadgesFor(
  cellSeverity: string | null | undefined,
  cellItch: boolean | null | undefined,
  cache?: {
    currentActions: ReadonlySet<CageBoxAction>;
    currentSeverity?: string | null;
    currentItch?: boolean;
  } | null,
): SpecialDetailBadgeItem[] {
  const severity = cache && cache.currentSeverity !== undefined ? cache.currentSeverity : (cellSeverity ?? null);
  const itch = cache && cache.currentItch !== undefined ? cache.currentItch : Boolean(cellItch);
  if (!severity && !itch) return [];
  if (cache && !cache.currentActions.has("HEALTH_CHECK")) return [];
  const out: SpecialDetailBadgeItem[] = [];
  if (severity) out.push({ code: severity });
  if (itch) out.push({ code: "ITCH", label: HEALTH_ITCH_LABEL });
  return out;
}

/**
 * 该笼位**此刻**该显示的明细角标 —— 只认一个状态源，绝不把服务端与暂存拼在一起：
 * 有状态模式的暂存（editCacheEntry）就以暂存为准（预览 = 实提交），否则读服务端 specialStatuses。
 *
 * 强绑定：明细只在「需特殊饲养」开着时有意义，父状态关掉就一律不显示。这条门控同时也是
 * 脱敏门控 —— 后端对不可见笼位置空 specialStatuses，两条一起消失，不会单冒出角标。
 */
export function specialDetailItemsFor(
  statuses: Array<{ code: string; label?: string | null }> | null | undefined,
  cache?: { currentActions: ReadonlySet<CageBoxAction>; currentDetails?: ReadonlySet<string> } | null,
): SpecialDetailBadgeItem[] {
  const list = statuses ?? [];
  const sfOn = cache
    ? cache.currentActions.has("SPECIAL_BREEDING")
    : list.some((s) => s.code === "SPECIAL_FEEDING");
  if (!sfOn) return [];
  // 暂存态：勾选集合就是全部真相（含「全部取消」→ 空集，网格上角标跟着消失）
  if (cache?.currentDetails) return [...cache.currentDetails].map((code) => ({ code }));
  return list
    .filter((s) => typeof s.code === "string" && s.code.startsWith(SPECIAL_DETAIL_STATUS_PREFIX))
    .map((s) => ({ code: s.code.slice(SPECIAL_DETAIL_STATUS_PREFIX.length), label: s.label }));
}

/**
 * 「整层/整校区」批量配置的写入目标 —— **只写房间**。
 *
 * 楼层/校区只是批量入口（点它 = 把本层我可见的房间一次改完），**绝不写它自身的区域键**：
 * ① 越界：楼层行会波及同层别人负责、且自己没配规则的房间；
 * ② 服务端会拒：写入门槛要求「整层房间全归你」，只拿到部分房间时点整层必然 403。
 * 房间节点没有 extra（它的可见房间就是空），于是退回写自己 —— 单个房间照旧按房间键落行。
 */
export function regionWriteTargets(
  regionType: string,
  regionId: string,
  extraRegions?: Array<{ regionType: string; regionId: string; name?: string }> | null,
): Array<{ regionType: string; regionId: string }> {
  return extraRegions && extraRegions.length > 0 ? extraRegions : [{ regionType, regionId }];
}

export const CAGE_BOX_ACTION_LIST = CAGE_BOX_ACTIONS.map(a => a.action) as readonly CageBoxAction[];

/**
 * 色区（拖色区）的展示顺序：**「特殊饲养」排到最后**。
 *
 * 它两张卡（标记 / 撤销）下面各自挂着可展开的明细子区，一展开会把后面的卡整片推下去；
 * 排在最底就只影响自己，别的状态不会被挤走。两端都走这一份，顺序不会各排各的。
 */
/**
 * 带**子区**的父状态动作（特殊饲养明细 / 健康异常严重程度）。
 * 它们的卡下面各自挂着可展开的子区，一展开会把后面的卡整片推下去，所以排到最底：
 * 排在最底就只影响自己，别的状态不会被挤走。两端都走这一份，顺序不会各排各的。
 */
const DETAIL_PARENT_ACTIONS: ReadonlySet<string> = new Set(["SPECIAL_BREEDING", "HEALTH_CHECK"]);

export function detailParentsLast<T extends { action: string }>(list: readonly T[]): T[] {
  return [
    ...list.filter((a) => !DETAIL_PARENT_ACTIONS.has(a.action)),
    ...list.filter((a) => a.action === "SPECIAL_BREEDING"),
    ...list.filter((a) => a.action === "HEALTH_CHECK"),
  ];
}

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

/**
 * 该格子的划分标签；没有划分返回 undefined（调用方据此不渲染）。
 * 一处定义两处用（笼架页 + 订购抽屉）——分开写迟早一边说「已划分给你」、另一边只说「已划分」。
 *
 * 入参取 unknown：各处的「格子」来自两套同名 CageShelfCell 类型，其中一套没声明
 * divisionAssignees（运行时有），写成结构类型反而会在调用点报「没有公共属性」。
 */
export function divisionLabelOf(cell: unknown, meId: string): string | undefined {
  const list = (cell as { divisionAssignees?: Array<{ id?: string | null }> } | null | undefined)?.divisionAssignees;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const me = String(meId ?? "");
  return me !== "" && list.some((a) => String(a?.id ?? "") === me) ? "已划分给你" : "已划分";
}

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

/* ═══════════════════════════════════════════════════════════
   分配模式 — 笼位可选性判定（三端唯一真相源）
   ═══════════════════════════════════════════════════════════ */

/** 分配模式下一次批量操作的动作类型 */
export type AllocSelectKind = "allocate" | "cancel";

export type AllocSelectVerdict =
  | { ok: true; kind: AllocSelectKind }
  | { ok: false; reason: string };

/**
 * 分配模式点击笼位的判定：
 *
 * - `1 等待分配`      → 可选，本批动作 = 分配（选 AUP 下发）
 * - `2 已预约(空笼盒)` → 可选，本批动作 = 取消分配（撤掉 AUP，退回「等待分配」）
 * - 其它（3 饲养中 / 4 异常）→ 不可选，须先归档腾空
 *
 * 一个批次内不允许混选两种动作，否则「分配 / 取消」按钮语义不明。
 * H5 与 Web 直接调用本函数；小程序是独立技术栈，需按同一规则手写（见 index.js `allocVerdict`）。
 *
 * `pendingOp=true`（该笼位挂着未决的分笼/转移请求）时一律不可选：待审请求只是「意向」，
 * 笼位状态还没变（空笼盒仍是空笼盒），只看类型拦不住 —— 选中后分配会改掉状态/AUP，
 * 那条审批执行时就失败了。后端同口径兜底拒绝。
 */
export function allocSelectVerdict(cageTypeCode?: number | null, pendingOp?: boolean): AllocSelectVerdict {
  if (pendingOp) return { ok: false, reason: "该笼位有待审的分笼/转移请求，请先等它审完" };
  const ct = Number(cageTypeCode);
  if (ct === 1) return { ok: true, kind: "allocate" };
  if (ct === 2) return { ok: true, kind: "cancel" };
  if (ct === 3 || ct === 4) {
    return { ok: false, reason: `该笼位为「${CAGE_TYPE_LABEL[ct]}」，需先归档当前笼位后才能分配` };
  }
  return { ok: false, reason: "该笼位状态未知，无法分配" };
}

/**
 * 「不可选」网纹底纹（PC 网格 / H5 网格共用一份，改这里两端同步；小程序另有一份 cg-hatch）。
 * 红色细斜线、透明留空，盖在格子上但位号/课题人/底色透得出来。线宽 2px / 周期 9px。
 */
export const CAGE_HATCH_BG =
  "repeating-linear-gradient(45deg, rgba(220,38,38,0.28) 0, rgba(220,38,38,0.28) 2px, rgba(220,38,38,0) 2px, rgba(220,38,38,0) 9px)";

/** 混选拦截文案（三端共用） */
export const ALLOC_MIXED_KIND_HINT = "不能同时勾选「等待分配」与「空笼位」笼位，请分两批操作";

/** 分配抽屉里那个常驻「撤销分配」区的键（不是 AUP id，只是落点标记） */
export const ALLOC_CANCEL_ZONE = "@cancel";

/**
 * 分配抽屉的两个区各收哪些笼位：撤销区只收空笼盒（kind=cancel），AUP 区只收等待分配。
 * 返回 null = 可落；否则是拒绝原因。
 *
 * 这层校验和 {@link allocSelectVerdict} 是一对：verdict 决定点一下选中后是哪种动作，
 * 这里决定那个动作只能落到哪个区。两边不同口径就会出现「选得进、拖不进去」。
 */
export function allocZoneReject(zoneKey: string, kind?: string | null): string | null {
  const isCancel = kind === "cancel";
  if (zoneKey === ALLOC_CANCEL_ZONE) return isCancel ? null : "「撤销分配」只收已分配的空笼盒";
  return isCancel ? "AUP 区只收等待分配的笼位" : null;
}

/* ═══════════════════════════════════════════════════════════
   状态模式 — 色彩区键（右侧「标记区 / 撤销区」的落点标识）
   ═══════════════════════════════════════════════════════════ */

/** 色彩区键：`add:DIVIDE` = 标记该状态，`del:DIVIDE` = 撤销该状态色 */
export function statusZoneKey(action: CageBoxAction, on: boolean): string {
  return `${on ? "add" : "del"}:${action}`;
}

/** 反解色彩区键；拖回缓冲区/不是状态区 → null（不产生动作，而不是当撤销用） */
export function parseStatusZone(key: string | null | undefined): { action: CageBoxAction; on: boolean } | null {
  const [dir, action] = String(key ?? "").split(":");
  if (dir !== "add" && dir !== "del") return null;
  if (!CAGE_BOX_ACTION_LIST.includes(action as CageBoxAction)) return null;
  return { action: action as CageBoxAction, on: dir === "add" };
}

/**
 * 明细色区键：`sfadd:NEED_FEED` = 标记该明细，`sfdel:NEED_FEED` = 撤销该明细。
 * 前缀刻意与状态色的 `add:`/`del:` 分开，两个解析器各认各的，不会互相误吞。
 */
export function detailZoneKey(itemCode: string, on: boolean): string {
  return `${on ? "sfadd" : "sfdel"}:${itemCode}`;
}

/** 反解明细色区键；不是明细区 → null。 */
export function parseDetailZone(key: string | null | undefined): { itemCode: string; on: boolean } | null {
  const [dir, itemCode] = String(key ?? "").split(":");
  if (dir !== "sfadd" && dir !== "sfdel") return null;
  if (!itemCode) return null;
  return { itemCode, on: dir === "sfadd" };
}

/**
 * 严重程度色区键。**与明细不同：严重程度是互斥单选，所以标记区是「一档一个」，
 * 但撤销区只有一个**（撤销「严重」而当前是「中度」本来就是空操作，逐档配撤销区只会多出无意义的三张卡）。
 */
export const SEVERITY_CLEAR_ZONE = "sevclear";

/** 标记某一档的色区键（`sevadd:MILD`）。 */
export function severityZoneKey(itemCode: string): string {
  return `sevadd:${itemCode}`;
}

/** 反解严重程度色区键：`sevadd:X` → {itemCode:"X"}（标记）；`sevclear` → {itemCode:null}（清空）；其它 → null。 */
export function parseSeverityZone(key: string | null | undefined): { itemCode: string | null } | null {
  const s = String(key ?? "");
  if (s === SEVERITY_CLEAR_ZONE) return { itemCode: null };
  const [dir, itemCode] = s.split(":");
  if (dir !== "sevadd" || !itemCode) return null;
  return { itemCode };
}

/**
 * 照片归档用的状态码：状态色区用 statusCode，明细项用 `SF_ + item_code`。
 * 和管理端 `statusPhotoKeys` 的 statusField 键并存 —— 那边按表单字段名存历史遗留的，
 * 这里按 statusCode 存明细，互不覆盖。
 */
export function detailPhotoKey(itemCode: string): string {
  return SPECIAL_DETAIL_STATUS_PREFIX + itemCode;
}

/**
 * 状态模式的网格预览：**目标状态全集** → 该显示的色码（按 CAGE_BOX_ACTIONS 顺序，稳定）。
 *
 * 网格底色必须由整集算，不能「叠加服务端已有的色」—— 叠加是加法，撤销减不掉，
 * 往撤销区拖就永远看不到颜色变化。取全集则加了要显、撤了要没，且预览=实提交。
 */
export function previewStatusCodes(actions: ReadonlySet<CageBoxAction>): string[] {
  return CAGE_BOX_ACTIONS.filter((a) => actions.has(a.action)).map((a) => a.statusCode);
}
