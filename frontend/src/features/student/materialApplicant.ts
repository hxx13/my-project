import type { AuthUserInfo } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";

/** 学生中心实际身份：镜像模式取被扫学生，否则取当前登录学生 */
export function getEffectiveStudentUserInfo(): AuthUserInfo | null {
  if (authStorage.isMirrorMode()) {
    return authStorage.getMirrorUserInfo() ?? authStorage.getUserInfo();
  }
  return authStorage.getUserInfo();
}

/**
 * 提交申领单时的 applicantGroup —— **必须是课题组，不是院系**。
 *
 * 历史实现取的是 departmentName，把院系写进了单子的「课题组」（审计页课题组列显示成部门、
 * 按真正的课题组筛选永远筛不到）。解析不到课题组就不传，交给后端按人员库补，避免再写脏值。
 */
export function resolveMaterialApplicantGroup(source?: {
  projectGroupName?: string | null;
  project_group_name?: string | null;
}): string | undefined {
  const pg = (source?.projectGroupName ?? source?.project_group_name ?? "").trim();
  return pg || undefined;
}

/** 学生中心会话（含镜像模式）：从当前有效 userInfo 取课题组；取不到就返回 undefined，由后端按人员库补全 */
export function resolveMaterialApplicantGroupForStudentSession(): string | undefined {
  const info = getEffectiveStudentUserInfo();
  if (!info) return undefined;
  return resolveMaterialApplicantGroup(info);
}

/** 扫码弹窗展示用：课题组/部门（仅 UI，提交仍以 resolveMaterialApplicantGroup 为准） */
export function formatMaterialApplicantGroupLabel(source?: {
  departmentName?: string | null;
  department_name?: string | null;
  projectGroupName?: string | null;
  project_group_name?: string | null;
  group?: string | null;
}): string {
  const dept = (source?.departmentName ?? source?.department_name ?? "").trim();
  if (dept) return dept;
  const pg = (source?.projectGroupName ?? source?.project_group_name ?? "").trim();
  if (pg) return pg;
  const g = (source?.group ?? "").trim();
  return g || "—";
}
