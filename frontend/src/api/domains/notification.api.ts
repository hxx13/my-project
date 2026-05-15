import { authHttp } from "@/api/core/authHttp";
import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface NotificationRecord {
  id: string;
  eventType: string;
  title: string;
  content: string;
  senderId?: string;
  bizType?: string;
  bizId?: string;
  isRead: number;
  readTime?: string;
  createTime: string;
}

export interface NotifyRuleRecord {
  id: number;
  eventType: string;
  bizType: string;
  enabled: number;
  recipientMode: string;
  minRoleLevel: number;
  templateKey: string;
}

export interface NotifyTemplateRecord {
  id: number;
  templateKey: string;
  titleTpl: string;
  contentTpl: string;
  enabled: number;
}

export interface SystemConfigRecord {
  id: number;
  module: string;
  configKey: string;
  configValue: string;
  valueType: string;
  remark?: string;
}

export interface SettingDefinitionRecord {
  id: number;
  module: string;
  configKey: string;
  labelZh: string;
  description: string;
  valueType: string;
  options: string[];
  defaultValue?: string;
  isSensitive?: number;
  requiresRestart?: number;
  isPublic?: number;
}

export interface ExternalCommConfigItem {
  key: string;
  value: string;
  actualValue?: string;
  masked: boolean;
  exists: boolean;
  source: string;
  modifiable: boolean;
}

export interface ExternalCommConfigOverview {
  hardcoded: ExternalCommConfigItem[];
  applicationProperties: ExternalCommConfigItem[];
  environmentVariables: ExternalCommConfigItem[];
}

export async function fetchNotifications(
  page = 1,
  size = 20,
  onlyUnread = false,
  extra?: { excludeBizTypes?: string; bizType?: string }
) {
  const res = await authHttp.get<Result<{ data: NotificationRecord[]; total: number }>>("/notifications", {
    params: {
      page,
      size,
      onlyUnread,
      ...(extra?.excludeBizTypes ? { excludeBizTypes: extra.excludeBizTypes } : {}),
      ...(extra?.bizType ? { bizType: extra.bizType } : {}),
    },
  });
  return res.data.data;
}

export async function markNotificationRead(id: string) {
  await authHttp.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  await authHttp.patch("/notifications/read-all");
}

export async function deleteNotification(id: string) {
  await authHttp.delete(`/notifications/${encodeURIComponent(id)}`);
}

export async function fetchNotificationUnreadCount() {
  const res = await authHttp.get<Result<{ count: number }>>("/notifications/unread-count");
  return res.data.data.count;
}

export async function fetchSettingsModules() {
  const res = await adminHttp.get<Result<Array<{ key: string; label: string }>>>("/settings/modules");
  return res.data.data;
}

export interface CapabilityPolicyRecord {
  bizDomain: string;
  minRoleSubmit: number;
  minRoleProcess: number;
  minRoleViewAllPending: number;
  applicantListMode: string;
  visibilityPublicAllowed: number;
  extensionJson?: string | null;
  enabled: number;
  sortOrder: number;
  policyVersion: number;
}

export async function fetchCapabilityPolicies() {
  const res = await adminHttp.get<Result<CapabilityPolicyRecord[]>>("/settings/capability-policies");
  return res.data.data;
}

export async function patchCapabilityPolicy(bizDomain: string, payload: Partial<CapabilityPolicyRecord>) {
  await adminHttp.patch(`/settings/capability-policies/${encodeURIComponent(bizDomain)}`, payload);
}

export async function fetchNotificationRules() {
  const res = await adminHttp.get<Result<NotifyRuleRecord[]>>("/settings/notification-rules");
  return res.data.data;
}

export async function updateNotificationRule(id: number, payload: Partial<NotifyRuleRecord>) {
  await adminHttp.patch(`/settings/notification-rules/${id}`, payload);
}

export async function fetchNotificationTemplates() {
  const res = await adminHttp.get<Result<NotifyTemplateRecord[]>>("/settings/templates");
  return res.data.data;
}

export async function updateNotificationTemplate(id: number, payload: Partial<NotifyTemplateRecord>) {
  await adminHttp.patch(`/settings/templates/${id}`, payload);
}

export async function fetchSystemConfigs(module: string) {
  const res = await adminHttp.get<Result<SystemConfigRecord[]>>("/settings/configs", { params: { module } });
  return res.data.data;
}

export async function fetchConfigDefinitions(module: string) {
  const res = await adminHttp.get<Result<SettingDefinitionRecord[]>>("/settings/config-definitions", { params: { module } });
  return res.data.data;
}

export async function updateSystemConfig(id: number, payload: Partial<SystemConfigRecord>) {
  await adminHttp.patch(`/settings/configs/${id}`, payload);
}

export async function fetchExternalCommConfigOverview() {
  const res = await adminHttp.get<Result<ExternalCommConfigOverview>>("/settings/external-comm-config");
  return res.data.data;
}

/** 公开运行时配置（无需登录），用于主页公告等 */
export async function fetchPublicRuntimeConfig(): Promise<Record<string, string>> {
  const res = await fetch("/api/public/runtime-config");
  const json = (await res.json()) as Result<Record<string, string>>;
  if (!json.success) throw new Error(json.message || "加载公开配置失败");
  return json.data ?? {};
}
