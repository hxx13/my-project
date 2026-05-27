import type { AuditFilterQuery } from "@/api/domains/accessAudit.api";

export type SwingRecordFilters = {
  taskId: string;
  channelName: string;
  personCode: string;
  personName: string;
  cardNumber: string;
  departmentName: string;
  openType: string;
  enterOrExit: string;
  openResult: string;
  audienceType: string;
  mappingHit: string;
  requireMapping: boolean;
  openSuccessOnly: boolean;
  startTime: string;
  endTime: string;
};

export function toAuditFilterQuery(
  filters: SwingRecordFilters,
  toApiDateTime: (v: string) => string
): Omit<AuditFilterQuery, "page" | "pageSize"> {
  return {
    taskId: filters.taskId ? Number(filters.taskId) : undefined,
    channelName: filters.channelName.trim() || undefined,
    personCode: filters.personCode.trim() || undefined,
    personName: filters.personName.trim() || undefined,
    cardNumber: filters.cardNumber.trim() || undefined,
    departmentName: filters.departmentName.trim() || undefined,
    openType: filters.openType ? Number(filters.openType) : undefined,
    enterOrExit: filters.enterOrExit ? Number(filters.enterOrExit) : undefined,
    openResult: filters.openResult !== "" ? Number(filters.openResult) : undefined,
    audienceType: filters.audienceType || undefined,
    mappingHit: filters.mappingHit !== "" ? Number(filters.mappingHit) : undefined,
    requireMapping: filters.requireMapping || undefined,
    openSuccessOnly: filters.openSuccessOnly || undefined,
    startTime: filters.startTime ? toApiDateTime(filters.startTime) : undefined,
    endTime: filters.endTime ? toApiDateTime(filters.endTime) : undefined,
  };
}
