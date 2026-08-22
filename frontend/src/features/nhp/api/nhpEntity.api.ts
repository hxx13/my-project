/**
 * NHP 台账实体（样本/给药/不良事件）API 层。
 * 对接 NhpSampleController / NhpMedicationController / NhpAdverseEventController。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface NhpSample {
  id: number;
  sampleCode?: string;
  txId?: number;
  donorSubjectId?: number;
  recipientSubjectId?: number;
  sampleType?: string;
  timepointCode?: string;
  collectDatetime?: string;
  storageCondition?: string;
  storageLocation?: string;
  status?: string;
}

export interface NhpMedication {
  id: number;
  medCode?: string;
  regimenId?: number;
  anesthesiaId?: number;
  drugCode?: string;
  doseValue?: number;
  doseUnit?: string;
  route?: string;
  doseTime?: string;
  missedFlag?: string;
  status?: string;
}

export interface NhpAdverseEvent {
  id: number;
  aeCode?: string;
  txId?: number;
  aeType?: string;
  aeGrade?: string;
  rejectionRef?: number;
  biopsySampleId?: number;
  intervention?: string;
  aeOutcome?: string;
  status?: string;
}

export async function fetchNhpSamples(subjectId?: number): Promise<NhpSample[]> {
  return authHttp
    .get<Result<NhpSample[]>>("/nhp/samples", { params: subjectId != null ? { subjectId: String(subjectId) } : undefined })
    .then(({ data }) => data.data ?? []);
}

export async function createNhpSample(body: Partial<NhpSample>): Promise<NhpSample> {
  return authHttp.post<Result<NhpSample>>("/nhp/samples", body).then(({ data }) => data.data);
}

export async function fetchNhpMedications(): Promise<NhpMedication[]> {
  return authHttp.get<Result<NhpMedication[]>>("/nhp/medications").then(({ data }) => data.data ?? []);
}

export async function createNhpMedication(body: Partial<NhpMedication>): Promise<NhpMedication> {
  return authHttp.post<Result<NhpMedication>>("/nhp/medications", body).then(({ data }) => data.data);
}

export async function fetchNhpAdverseEvents(txId?: number): Promise<NhpAdverseEvent[]> {
  return authHttp
    .get<Result<NhpAdverseEvent[]>>("/nhp/adverse-events", { params: txId != null ? { txId: String(txId) } : undefined })
    .then(({ data }) => data.data ?? []);
}

export async function createNhpAdverseEvent(body: Partial<NhpAdverseEvent>): Promise<NhpAdverseEvent> {
  return authHttp.post<Result<NhpAdverseEvent>>("/nhp/adverse-events", body).then(({ data }) => data.data);
}

/** 台账实体类型 */
export type NhpEntityType = "sample" | "medication" | "adverseEvent";

/** 由数据域码推导台账实体类型：D4 样本 / D6 用药 / D5 随访(不良事件) */
export function entityTypeForDomain(domainCode?: string | null): NhpEntityType | null {
  const d = (domainCode ?? "").toUpperCase();
  if (d === "D4") return "sample";
  if (d === "D6") return "medication";
  if (d === "D5") return "adverseEvent";
  return null;
}
