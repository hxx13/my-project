/**
 * NHP 访视/时点 API 层。
 *
 * 对接后端契约（后端未实现，前端按 22 §2.1 先行定义）：
 * - crf_visit：TP01~TP12 定义 + event_anchor/frequency 归一化列
 * - crf_timepoint_map：65 原始 timepoint → (event_anchor × frequency × tp_code) 映射
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 通用枚举项（value 落库、label 展示） */
export interface EnumOption {
  value: string;
  label: string;
}

/** 事件锚点（16，22 §2.1） */
export const EVENT_ANCHOR_OPTIONS: EnumOption[] = [
  { value: "ENROLL", label: "入组" },
  { value: "PRE_TX", label: "术前" },
  { value: "DAY0", label: "移植当天" },
  { value: "POST_TX", label: "术后" },
  { value: "INTRAOP", label: "术中" },
  { value: "ANES", label: "麻醉" },
  { value: "PERFUSION", label: "灌注" },
  { value: "HARVEST", label: "供体获取" },
  { value: "SAMPLE", label: "取材" },
  { value: "READOUT", label: "阅片/报告" },
  { value: "REGIMEN", label: "方案" },
  { value: "STORAGE", label: "入库" },
  { value: "EVENT", label: "事件触发" },
  { value: "ENDPOINT", label: "终点" },
  { value: "LOCK", label: "锁定" },
  { value: "ALL", label: "全程" },
];

/** 频次（15，22 §2.1） */
export const FREQUENCY_OPTIONS: EnumOption[] = [
  { value: "ONCE", label: "ONCE（一次性）" },
  { value: "PER_TP", label: "各时点" },
  { value: "PER_DOSE", label: "每次给药" },
  { value: "Q3H", label: "Q3H（每 3 小时）" },
  { value: "Q1_3H", label: "Q1_3H（每 1-3 小时）" },
  { value: "Q15_30MIN", label: "Q15_30MIN（每 15-30 分钟）" },
  { value: "HOURLY", label: "HOURLY（每小时）" },
  { value: "BIWEEKLY", label: "BIWEEKLY（每周 2 次）" },
  { value: "QUARTERLY", label: "QUARTERLY（每季度）" },
  { value: "ANNUAL", label: "ANNUAL（每年）" },
  { value: "PER_LAB", label: "按血检频率" },
  { value: "PER_PROTOCOL", label: "PER_PROTOCOL（按方案）" },
  { value: "CONTINUOUS", label: "连续" },
  { value: "EVENT", label: "事件触发（可重复）" },
  { value: "PER_EVENT", label: "每次事件采一条" },
];

/** 访视时点（crf_visit 一行） */
export interface NhpVisit {
  id: number;
  /** TP01~TP12（无横线） */
  code: string;
  /** 时点名，如「术前筛查」 */
  name: string;
  eventAnchor?: string | null;
  /** 计划天数（相对锚点，可为负） */
  plannedDays?: number | null;
  /** 窗口起（相对锚点，可为负） */
  earlyDays?: number | null;
  /** 窗口止（相对锚点，可为负） */
  lateDays?: number | null;
  /** 结束天数（22 §6.2 计划列，后端未迁移） */
  endDays?: number | null;
  /** 排序序号（后端 seq） */
  seq?: number;
}

/** timepoint 归一化映射（crf_timepoint_map 一行） */
export interface NhpTimepointMapEntry {
  id: number;
  /** 原始 timepoint 文案（如「术前1月每2-3d」） */
  rawValue: string;
  eventAnchor: string;
  frequency: string;
  tpCode?: string | null;
  domain?: string;
}

export async function fetchNhpVisits(): Promise<NhpVisit[]> {
  return authHttp.get<Result<NhpVisit[]>>("/nhp/visits").then(({ data }) => data.data);
}

export async function updateNhpVisit(id: number, patch: Partial<NhpVisit>): Promise<NhpVisit> {
  return authHttp.put<Result<NhpVisit>>(`/nhp/visits/${id}`, patch).then(({ data }) => data.data);
}

export async function fetchNhpTimepointMap(): Promise<NhpTimepointMapEntry[]> {
  return authHttp.get<Result<NhpTimepointMapEntry[]>>("/nhp/timepoint-map").then(({ data }) => data.data);
}

/** 采集形态（表单-事件指派级，V2）：PANEL 事件面板 / LEDGER 台账 / SERIES 序列网格 */
export type NhpCaptureForm = "PANEL" | "LEDGER" | "SERIES";

export const CAPTURE_FORM_OPTIONS: { value: NhpCaptureForm; label: string }[] = [
  { value: "PANEL", label: "事件面板" },
  { value: "LEDGER", label: "台账" },
  { value: "SERIES", label: "序列网格" },
];

/** 访视编排（crf_visit_plan 一行）：某访视应采集的原子 */
export interface NhpVisitPlan {
  id: number;
  visitId: number;
  atomId: number;
  required: boolean;
  captureForm?: NhpCaptureForm | null;
  sortOrder?: number;
}

export async function fetchNhpVisitPlan(visitId: number): Promise<NhpVisitPlan[]> {
  return authHttp
    .get<Result<NhpVisitPlan[]>>(`/nhp/visits/${visitId}/plan`)
    .then(({ data }) => data.data);
}

/** 全部访视编排（事件→指派表单，采集侧用） */
export async function fetchNhpVisitPlans(): Promise<NhpVisitPlan[]> {
  return authHttp
    .get<Result<NhpVisitPlan[]>>("/nhp/visits/plans")
    .then(({ data }) => data.data);
}

/** 整体替换某访视的原子清单（表单-事件指派） */
export async function saveNhpVisitPlan(
  visitId: number,
  atoms: { atomId: number; required: boolean; captureForm?: NhpCaptureForm | null }[],
): Promise<NhpVisitPlan[]> {
  return authHttp
    .put<Result<NhpVisitPlan[]>>(`/nhp/visits/${visitId}/plan`, atoms)
    .then(({ data }) => data.data);
}
