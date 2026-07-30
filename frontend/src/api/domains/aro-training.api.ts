import { adminHttp } from "@/api/core/adminHttp";

// ---- types ----

export interface TrainingSession {
  id: string;
  title: string;
  testContent: string;
  address: string;
  startTime: string;
  endTime: string;
  signNumber: number;
  signed: number;
  totalNumber: number;
  examinerName: string;
  examinerNumber: string;
  examState: number;
  examCertType: number;
  state: number;
}

export interface Trainee {
  examSignId: string;
  name: string;
  jobNumber: string;
  mobilePhone: string;
  projectGroupName: string;
  testYn: number;
  testFraction: number;
  reviewedAt?: string;
  scoredAt?: string;
  userId: string;
  userJoinRooms: {
    areaName: string;
    floorName: string;
    name: string;
    id: string;
  }[];
  createdAt?: string;
}

export interface PendingTrainingSession {
  session: TrainingSession;
  trainees: Trainee[];
}

// ---- favorites ----

export async function fetchAroFavorites(): Promise<string[]> {
  const r = await adminHttp.get<{ data: string[] }>("/aro-training/favorites");
  return r.data?.data ?? [];
}

export async function starAroSession(sessionId: string): Promise<void> {
  await adminHttp.post(`/aro-training/favorites/${sessionId}`);
}

export async function unstarAroSession(sessionId: string): Promise<void> {
  await adminHttp.delete(`/aro-training/favorites/${sessionId}`);
}

// ---- audit / score ----

export async function auditTrainee(examSignId: string, state: 1 | 2): Promise<void> {
  await adminHttp.post("/aro-training/audit", { examSignId, state });
}

export async function scoreTrainee(examSignId: string, state: 1 | 2): Promise<void> {
  await adminHttp.post("/aro-training/score", { examSignId, state });
}

// ---- pending training sessions (for review tab) ----

export async function fetchPendingTrainingSessions(): Promise<PendingTrainingSession[]> {
  const r = await adminHttp.get<{ data: { list: any[]; total: number } }>("/aro-training/sessions/pending");
  const raw = r.data?.data?.list ?? [];
  return raw.map((item: any) => ({
    session: {
      id: item.id,
      title: item.title ?? "",
      testContent: "",
      address: item.address ?? "",
      startTime: item.startTime ?? "",
      endTime: item.endTime ?? "",
      signNumber: 0,
      signed: 0,
      totalNumber: 0,
      examinerName: "",
      examinerNumber: "",
      examState: 0,
      examCertType: 0,
      state: 0,
    },
    trainees: (item.trainees ?? []).map((t: any) => ({
      examSignId: t.examSignId ?? "",
      name: t.name ?? "",
      jobNumber: t.jobNumber ?? "",
      mobilePhone: t.mobilePhone ?? "",
      projectGroupName: t.projectGroupName ?? "",
      testYn: t.testYn ?? 0,
      testFraction: t.testFraction ?? 0,
      reviewedAt: t.reviewedAt ?? undefined,
      scoredAt: t.scoredAt ?? undefined,
      userId: "",
      userJoinRooms: [],
    })),
  }));
}
