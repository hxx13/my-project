import { adminHttp } from "@/api/core/adminHttp";
import { unwrapList, type ApiResponse } from "@/api/types/common";

export type StudentViolationStatus = "ACTIVE" | "CLEARED" | "EXPIRED" | "SUPERSEDED" | "PROCESSED";

export const VIOLATION_STATUS_LABEL: Record<StudentViolationStatus, string> = {
  ACTIVE: '生效中',
  CLEARED: '已解除',
  EXPIRED: '已过期',
  SUPERSEDED: '已替换',
  PROCESSED: '已处理',
};

export const UNBLOCK_METHOD_LABEL: Record<string, string> = {
  '自助解禁': '自助解禁',
  '仅工作人员': '仅工作人员',
};

export interface StudentViolationRow {
  id: number;
  targetUserId: string;
  /** 展示用姓名：人员库优先，与后端 UserDisplayNameService 一致 */
  targetUserDisplayName?: string;
  violationText?: string;
  /** JSON 字符串或已解析数组（列表接口为 JSON 字符串） */
  imageUrls?: string | string[];
  forbidEnter?: number;
  maxEnterSuccess?: number | null;
  enterSuccessCount?: number;
  showNoticeEveryScan?: number;
  expireAt?: string | null;
  status?: StudentViolationStatus;
  source?: string;  // MANUAL | AUTO_STRANDED
  createdByUserId?: string;
  /** 创建人展示名（UserDisplayNameService） */
  createdByDisplayName?: string;
  createdAt?: string;
  updatedAt?: string;
  clearedAt?: string | null;
  clearedByUserId?: string | null;
  /** 解除人展示名 */
  clearedByDisplayName?: string | null;
  /** 交互式确认短语；null 表示普通公告 */
  interactiveChallenge?: string | null;
  interactiveChallengeVerifiedAt?: string | null;
  interactiveUnlockOnVerify?: number;
  /** Obligation 处置策略编码（期 3） */
  dispositionType?: string | null;
  dispositionConfigJson?: string | null;
  /** 当前是否禁止扫码进入（与扫码端 enterLocked 一致） */
  enterLocked?: boolean;
  ruleId?: number | null;
  ruleName?: string | null;
  /** 笼架联动：关联的父记录ID */
  cageViolationId?: number | null;
  /** 笼架联动：父记录状态码 */
  cageParentStatus?: string | null;
  /** 笼架联动：笼位标签 */
  cageParentPosition?: string | null;
  /** 笼架联动：课题组 */
  cageParentGroup?: string | null;
}

export interface CreateStudentViolationPayload {
  targetUserId: string;
  violationText: string;
  /** 期 6：ProseMirror JSON 真源（可选；服务端也可从 HTML 反解析） */
  contentJson?: string | null;
  imageUrls: string[];
  forbidEnter: boolean;
  maxEnterSuccess: number | null;
  showNoticeEveryScan: boolean;
  expireAfterDays: number | null;
  /** 交互式确认短语；非空时强制禁止进入直至扫码端完成拼图 */
  interactiveChallenge?: string | null;
  /** 交互验证完成后是否自动解除禁入；默认 true */
  interactiveUnlockOnVerify?: boolean;
  /** 关联触发规则ID（不传则自动使用 MANUAL 规则） */
  ruleId?: number | null;
  /** 关联笼架违规父记录ID */
  cageViolationId?: number | null;
  /** 期 3 处置策略覆盖（写入 Obligation） */
  dispositionType?: string | null;
  dispositionConfigJson?: string | null;
}

export type BatchCreateStudentViolationPayload = Omit<CreateStudentViolationPayload, "targetUserId"> & {
  targetUserIds: string[];
};

export interface BatchCreateStudentViolationResult {
  createdCount: number;
  failed: { userId: string; message: string }[];
}

/** 人员档案库中的课题组名（已按逗号拆分去重） */
export async function searchViolationProjectGroups(keyword: string, limit = 30): Promise<string[]> {
  const q = keyword.trim();
  if (!q) return [];
  const sp = new URLSearchParams();
  sp.set("keyword", q);
  sp.set("limit", String(limit));
  const res = await adminHttp.get<ApiResponse<string[]>>(
    `/twin/student-violations/personnel/project-groups/search?${sp.toString()}`
  );
  const list = unwrapList<string>(res.data, []);
  return list.map((x) => String(x).trim()).filter(Boolean);
}

export interface ProjectGroupMemberRow {
  user_id: string;
  name?: string;
  head?: string;
  project_group_name?: string;
}

export async function listViolationPersonnelByProjectGroup(
  projectGroupName: string,
  limit = 500
): Promise<ProjectGroupMemberRow[]> {
  const name = projectGroupName.trim();
  if (!name) return [];
  const sp = new URLSearchParams();
  sp.set("projectGroupName", name);
  sp.set("limit", String(limit));
  const res = await adminHttp.get<ApiResponse<ProjectGroupMemberRow[]>>(
    `/twin/student-violations/personnel/by-project-group?${sp.toString()}`
  );
  return unwrapList<ProjectGroupMemberRow>(res.data, []);
}

export async function batchCreateStudentViolations(body: BatchCreateStudentViolationPayload) {
  const res = await adminHttp.post<ApiResponse<BatchCreateStudentViolationResult>>(
    "/twin/student-violations/batch",
    body
  );
  return res.data?.data;
}

export async function listStudentViolations(params: { targetUserId?: string; limit?: number }) {
  const sp = new URLSearchParams();
  sp.set("limit", String(params.limit ?? 50));
  if (params.targetUserId) sp.set("targetUserId", params.targetUserId);
  const res = await adminHttp.get<ApiResponse<StudentViolationRow[]>>(`/twin/student-violations?${sp.toString()}`);
  return res.data?.data || [];
}

export async function createStudentViolation(body: CreateStudentViolationPayload) {
  const res = await adminHttp.post<ApiResponse<StudentViolationRow>>("/twin/student-violations", body);
  return res.data?.data;
}

export interface UpdateStudentViolationPayload {
  violationText: string;
  contentJson?: string | null;
  imageUrls: string[];
  forbidEnter: boolean;
  maxEnterSuccess: number | null;
  showNoticeEveryScan: boolean;
  /** KEEP | CLEAR | RELATIVE */
  expireMode: "KEEP" | "CLEAR" | "RELATIVE";
  expireAfterDays: number | null;
  /** 交互式确认短语；传 null 或空串=关闭，传非空=开启 */
  interactiveChallenge?: string | null;
  interactiveUnlockOnVerify?: boolean;
  dispositionType?: string | null;
  dispositionConfigJson?: string | null;
}

export async function updateStudentViolation(id: number, body: UpdateStudentViolationPayload) {
  const res = await adminHttp.put<ApiResponse<StudentViolationRow>>(`/twin/student-violations/${id}`, body);
  return res.data?.data;
}

export async function deleteStudentViolation(id: number) {
  await adminHttp.delete<ApiResponse<unknown>>(`/twin/student-violations/${id}`);
}

export async function clearStudentViolation(id: number) {
  await adminHttp.post<ApiResponse<unknown>>(`/twin/student-violations/${id}/clear`);
}

/** 与后端 RoleEnum.code 一致 */
export type UnboundApplyRoleCode = "MEMBER" | "STAFF" | "SENIOR" | "ADMIN" | "SUPER_ADMIN" | "PLATFORM_OWNER";

export const UNBOUND_APPLY_ROLE_OPTIONS: { code: UnboundApplyRoleCode; label: string }[] = [
  { code: "MEMBER", label: "学生" },
  { code: "STAFF", label: "普通员工" },
  { code: "SENIOR", label: "高级员工" },
  { code: "ADMIN", label: "管理员" },
  { code: "SUPER_ADMIN", label: "超级管理员" },
  { code: "PLATFORM_OWNER", label: "平台所有者" },
];

export interface UnboundCardNoticeSettings {
  enabled: boolean;
  showNoticeEveryScan: boolean;
  forbidEnter?: boolean;
  applyRoleCodes?: UnboundApplyRoleCode[];
  violationText?: string;
  imageUrls?: string[];
}

export function normalizeApplyRoleCodes(raw: unknown): UnboundApplyRoleCode[] {
  const valid = new Set(UNBOUND_APPLY_ROLE_OPTIONS.map((o) => o.code));
  if (!Array.isArray(raw) || !raw.length) return ["MEMBER"];
  const out = raw.filter((x): x is UnboundApplyRoleCode => typeof x === "string" && valid.has(x as UnboundApplyRoleCode));
  return out.length ? out : ["MEMBER"];
}

export async function getUnboundCardNoticeSettings(): Promise<UnboundCardNoticeSettings> {
  const res = await adminHttp.get<ApiResponse<UnboundCardNoticeSettings>>(
    "/twin/student-violations/unbound-notice-settings"
  );
  const data = res.data?.data;
  return {
    enabled: data?.enabled !== false,
    showNoticeEveryScan: data?.showNoticeEveryScan !== false,
    forbidEnter: Boolean(data?.forbidEnter),
    applyRoleCodes: normalizeApplyRoleCodes(data?.applyRoleCodes),
    violationText: data?.violationText ?? "",
    imageUrls: Array.isArray(data?.imageUrls) ? data.imageUrls : [],
  };
}

export async function saveUnboundCardNoticeSettings(body: UnboundCardNoticeSettings): Promise<UnboundCardNoticeSettings> {
  const res = await adminHttp.put<ApiResponse<UnboundCardNoticeSettings>>(
    "/twin/student-violations/unbound-notice-settings",
    body
  );
  const data = res.data?.data;
  return {
    enabled: data?.enabled !== false,
    showNoticeEveryScan: data?.showNoticeEveryScan !== false,
    forbidEnter: Boolean(data?.forbidEnter),
    applyRoleCodes: normalizeApplyRoleCodes(data?.applyRoleCodes),
    violationText: data?.violationText ?? "",
    imageUrls: Array.isArray(data?.imageUrls) ? data.imageUrls : [],
  };
}

// ═══ 触发规则 ═══

export interface ViolationRule {
  id?: number;
  ruleCode: string;
  ruleName: string;
  enabled: number;
  sourceTag?: string;
  violationTextTpl?: string;
  forbidEnter: number;
  maxEnterSuccess?: number | null;
  expireAfterDays?: number | null;
  showNoticeEveryScan: number;
  interactiveChallenge?: string;
  interactiveUnlockOnVerify: number;
  /** 解禁方式: 自助解禁 | 仅工作人员 */
  unblockMethod: '自助解禁' | '仅工作人员';
  /** 窗口内最大违规次数; null=不限制 */
  unblockMaxCount?: number | null;
  /** 滑动窗口 | 固定周期 */
  unblockWindowType?: '滑动窗口' | '固定周期';
  /** 滑动天数 / 固定周期编号(1=月 2=周 3=学期) */
  unblockWindowValue?: number;
  /** 固定周期起始 (MM-DD 格式，如 03-01) */
  unblockWindowStart?: string;
  /** 固定周期结束 (MM-DD 格式，如 07-01) */
  unblockWindowEnd?: string;
  /** 达到上限时的替换公告文案（支持 ${name} ${dept} ${date}）；留空则沿用原违规文案 */
  criticalNoticeText?: string;
  autoSignoutEnabled: number;
  whitelistDepts?: string;
  cronExpression?: string;
  // 笼架联动字段
  cageStatusCodes?: string[];
  cageDelayDays?: number;
  cageJudgeMode?: 'AUTO_SYNC_LINKED' | 'PURE_DAYS' | 'PURE_MANUAL';
  cageManualTrigger?: number;
  cageAreaFilter?: { campuses?: string[]; rooms?: string[] };
  cageGroupWhitelist?: string[];
  cageTriggerAction?: 'VIOLATION_ONLY' | 'NOTICE_ONLY' | 'BOTH';
  cageImageUrls?: string[];
}

/** 解析后端返回的笼架 JSON 字符串字段为 JS 数组/对象 */
function deserializeCageFields(rule: ViolationRule): ViolationRule {
  if (!rule) return rule;
  const out = { ...rule };
  try { if (typeof out.cageStatusCodes === "string") out.cageStatusCodes = JSON.parse(out.cageStatusCodes); } catch {}
  try { if (typeof out.cageAreaFilter === "string") out.cageAreaFilter = JSON.parse(out.cageAreaFilter); } catch {}
  try { if (typeof out.cageGroupWhitelist === "string") out.cageGroupWhitelist = JSON.parse(out.cageGroupWhitelist); } catch {}
  try { if (typeof out.cageImageUrls === "string") out.cageImageUrls = JSON.parse(out.cageImageUrls); } catch {}
  return out;
}

export async function listViolationRules(): Promise<ViolationRule[]> {
  const res = await adminHttp.get<ApiResponse<ViolationRule[]>>(
    "/twin/student-violations/rules"
  );
  return (res.data?.data || []).map(deserializeCageFields);
}

/** 将笼架联动规则的 JS 数组/对象字段序列化为 JSON 字符串，后端 Entity 为 String 类型 */
function serializeCageFields(body: ViolationRule): ViolationRule {
  const out = { ...body };
  if (out.cageStatusCodes != null) out.cageStatusCodes = JSON.stringify(out.cageStatusCodes) as any;
  if (out.cageAreaFilter != null) out.cageAreaFilter = JSON.stringify(out.cageAreaFilter) as any;
  if (out.cageGroupWhitelist != null) out.cageGroupWhitelist = JSON.stringify(out.cageGroupWhitelist) as any;
  if (out.cageImageUrls != null) out.cageImageUrls = JSON.stringify(out.cageImageUrls) as any;
  return out;
}

export async function createViolationRule(body: ViolationRule): Promise<ViolationRule> {
  const res = await adminHttp.post<ApiResponse<ViolationRule>>(
    "/twin/student-violations/rules", serializeCageFields(body)
  );
  return res.data?.data!;
}

export async function updateViolationRule(id: number, body: ViolationRule): Promise<ViolationRule> {
  const res = await adminHttp.put<ApiResponse<ViolationRule>>(
    `/twin/student-violations/rules/${id}`, serializeCageFields(body)
  );
  return res.data?.data!;
}

export async function deleteViolationRule(id: number): Promise<void> {
  await adminHttp.delete<ApiResponse<unknown>>(
    `/twin/student-violations/rules/${id}`
  );
}
