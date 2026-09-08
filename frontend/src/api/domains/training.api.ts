import { adminHttp } from "@/api/core/adminHttp";

// ---- types ----

export interface TrainingSeries {
  id: number;
  code?: string | null;
  name: string;
  type?: number | null;
  paperId?: number | null;
  ownerId?: string | null;
  timeLimit?: number | null;
  recurrence?: string | null;
  status?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TrainingEnrollment {
  id: number;
  occurrenceId?: number;
  traineeId?: string | null;
  name?: string;
  jobNumber?: string;
  projectGroup?: string | null;
  testYn?: number;
  testFraction?: number;
  roomIds?: string[];
  rooms?: unknown[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TrainingOccurrence {
  id: number;
  trainingId?: number;
  startTime?: string | null;
  endTime?: string | null;
  address?: string | null;
  examinerName?: string | null;
  examinerNumber?: string | null;
  status?: string | null;
  enrollments?: TrainingEnrollment[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TrainingDetail extends TrainingSeries {
  occurrences: TrainingOccurrence[];
}

export interface TrainingListResult {
  list: TrainingSeries[];
  total: number;
  page: number;
}

// ---- series ----

export async function fetchTrainings(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
} = {}): Promise<TrainingListResult> {
  const r = await adminHttp.get("/training", { params });
  return (r.data?.data ?? { list: [], total: 0, page: 0 }) as TrainingListResult;
}

export async function fetchTraining(id: number | string): Promise<TrainingDetail | null> {
  const r = await adminHttp.get(`/training/${id}`);
  return (r.data?.data ?? null) as TrainingDetail | null;
}

export async function createTraining(body: Record<string, unknown>): Promise<TrainingDetail> {
  const r = await adminHttp.post("/training", body);
  return r.data?.data as TrainingDetail;
}

export async function updateTraining(id: number | string, body: Record<string, unknown>): Promise<TrainingDetail> {
  const r = await adminHttp.put(`/training/${id}`, body);
  return r.data?.data as TrainingDetail;
}

export async function publishTraining(id: number | string): Promise<TrainingDetail> {
  const r = await adminHttp.post(`/training/${id}/publish`);
  return r.data?.data as TrainingDetail;
}

export async function deleteTraining(id: number | string): Promise<void> {
  await adminHttp.delete(`/training/${id}`);
}

// ---- occurrences ----

export async function addOccurrence(
  trainingId: number | string,
  body: Record<string, unknown>,
): Promise<TrainingOccurrence> {
  const r = await adminHttp.post(`/training/${trainingId}/occurrences`, body);
  return r.data?.data as TrainingOccurrence;
}

export async function updateOccurrence(
  occurrenceId: number | string,
  body: Record<string, unknown>,
): Promise<TrainingOccurrence> {
  const r = await adminHttp.put(`/training/occurrences/${occurrenceId}`, body);
  return r.data?.data as TrainingOccurrence;
}

export async function deleteOccurrence(occurrenceId: number | string): Promise<void> {
  await adminHttp.delete(`/training/occurrences/${occurrenceId}`);
}

// ---- enrollments ----

export async function addEnrollments(
  occurrenceId: number | string,
  rows: { traineeId?: string; name?: string; jobNumber?: string; projectGroup?: string }[],
): Promise<TrainingEnrollment[]> {
  const r = await adminHttp.post(`/training/occurrences/${occurrenceId}/enrollments`, { rows });
  return (r.data?.data ?? []) as TrainingEnrollment[];
}

export async function deleteEnrollment(enrollmentId: number | string): Promise<void> {
  await adminHttp.delete(`/training/enrollments/${enrollmentId}`);
}

export async function auditEnrollment(enrollmentId: number | string, state: 1 | 2): Promise<void> {
  await adminHttp.post(`/training/enrollments/${enrollmentId}/audit`, { state });
}

export async function scoreEnrollment(enrollmentId: number | string, state: 1 | 2): Promise<void> {
  await adminHttp.post(`/training/enrollments/${enrollmentId}/score`, { state });
}

export async function setEnrollmentRooms(enrollmentId: number | string, roomIds: string[]): Promise<void> {
  await adminHttp.post(`/training/enrollments/${enrollmentId}/rooms`, { roomIds });
}
