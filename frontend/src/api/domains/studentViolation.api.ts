import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

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
  createdAt?: string;
  updatedAt?: string;
  clearedAt?: string | null;
  clearedByUserId?: string | null;
  /** 交互式确认短语；null 表示普通公告 */
  interactiveChallenge?: string | null;
  interactiveUnlockOnVerify?: number;
  ruleId?: number | null;
  ruleName?: string | null;
}

export interface CreateStudentViolationPayload {
  targetUserId: string;
  violationText: string;
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
}

export type BatchCreateStudentViolationPayload = Omit<CreateStudentViolationPayload, "targetUserId"> & {
  targetUserIds: string[];
};

export interface BatchCreateStudentViolationResult {
  createdCount: number;
  failed: { userId: string; message: string }[];
}

/** 人员档案库中的课题组名（已按逗号拆分去重） */
export async function searchViolationProjectGroups(keyword: string, limit = 30) {
  const sp = new URLSearchParams();
  sp.set("keyword", keyword.trim());
  sp.set("limit", String(limit));
  const res = await adminHttp.get<ApiResponse<string[]>>(
    `/twin/student-violations/personnel/project-groups/search?${sp.toString()}`
  );
  return res.data?.data || [];
}

export interface ProjectGroupMemberRow {
  user_id: string;
  name?: string;
  head?: string;
  project_group_name?: string;
}

export async function listViolationPersonnelByProjectGroup(projectGroupName: string, limit = 500) {
  const sp = new URLSearchParams();
  sp.set("projectGroupName", projectGroupName.trim());
  sp.set("limit", String(limit));
  const res = await adminHttp.get<ApiResponse<ProjectGroupMemberRow[]>>(
    `/twin/student-violations/personnel/by-project-group?${sp.toString()}`
  );
  return res.data?.data || [];
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

/** 标记已处理：后端置为 PROCESSED，扫码弹窗不再展示 */
export async function markStudentViolationProcessed(id: number) {
  await adminHttp.post<ApiResponse<unknown>>(`/twin/student-violations/${id}/mark-processed`);
}

/** 与后端 RoleEnum.code 一致 */
export type UnboundApplyRoleCode = "STUDENT" | "STAFF" | "SENIOR" | "ADMIN" | "SUPER_ADMIN" | "PLATFORM_OWNER";

export const UNBOUND_APPLY_ROLE_OPTIONS: { code: UnboundApplyRoleCode; label: string }[] = [
  { code: "STUDENT", label: "学生" },
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
  if (!Array.isArray(raw) || !raw.length) return ["STUDENT"];
  const out = raw.filter((x): x is UnboundApplyRoleCode => typeof x === "string" && valid.has(x as UnboundApplyRoleCode));
  return out.length ? out : ["STUDENT"];
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
  expireAfterDays?: number;
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
  autoSignoutEnabled: number;
  whitelistDepts?: string;
  cronExpression?: string;
}

export async function listViolationRules(): Promise<ViolationRule[]> {
  const res = await adminHttp.get<ApiResponse<ViolationRule[]>>(
    "/twin/student-violations/rules"
  );
  return res.data?.data || [];
}

export async function getViolationRule(id: number): Promise<ViolationRule | null> {
  const res = await adminHttp.get<ApiResponse<ViolationRule>>(
    `/twin/student-violations/rules/${id}`
  );
  return res.data?.data ?? null;
}

export async function createViolationRule(body: ViolationRule): Promise<ViolationRule> {
  const res = await adminHttp.post<ApiResponse<ViolationRule>>(
    "/twin/student-violations/rules", body
  );
  return res.data?.data!;
}

export async function updateViolationRule(id: number, body: ViolationRule): Promise<ViolationRule> {
  const res = await adminHttp.put<ApiResponse<ViolationRule>>(
    `/twin/student-violations/rules/${id}`, body
  );
  return res.data?.data!;
}

export async function deleteViolationRule(id: number): Promise<void> {
  await adminHttp.delete<ApiResponse<unknown>>(
    `/twin/student-violations/rules/${id}`
  );
}
