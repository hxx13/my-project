import { adminHttp } from "@/api/core/adminHttp";
import type { FormField, FormSection } from "../schema/formTemplate";

export interface ExamPaperSummary {
  id: number;
  code: string;
  title: string;
  status: string;
  folderId?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExamPaperFolder {
  id: number;
  name: string;
}

export interface ExamPaperDetail {
  id: number;
  code: string;
  title: string;
  status: string;
  sections: FormSection[];
}

interface PaperSectionJson {
  id?: number;
  code: string;
  label: string;
  sortOrder?: number;
  fields: PaperFieldJson[];
}

interface PaperFieldJson {
  id?: number;
  questionKey: string;
  label: string;
  type: string;
  required?: boolean;
  options?: unknown;
  showWhen?: unknown;
  sortOrder?: number;
  config?: unknown;
}

/** 后端 questionKey → 前端 fieldKey */
function mapSections(sections: PaperSectionJson[] | undefined): FormSection[] {
  return (sections ?? []).map((s) => ({
    code: s.code,
    label: s.label,
    sortOrder: s.sortOrder,
    fields: (s.fields ?? []).map((f) => ({
      fieldKey: f.questionKey,
      label: f.label,
      type: f.type as FormField["type"],
      required: f.required,
      options: f.options as FormField["options"],
      showWhen: (f.showWhen as FormField["showWhen"]) ?? null,
      sortOrder: f.sortOrder,
      config: f.config as FormField["config"],
    })),
  }));
}

/** 前端 fieldKey → 后端 questionKey */
function mapToPaperSections(sections: FormSection[]): Record<string, unknown>[] {
  return sections.map((s) => ({
    code: s.code,
    label: s.label,
    fields: (s.fields ?? []).map((f) => ({
      questionKey: f.fieldKey,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      showWhen: f.showWhen ?? null,
      config: f.config,
    })),
  }));
}

export async function fetchExamPapers(params: { page: number; pageSize: number; keyword?: string }) {
  const r = await adminHttp.get("/exam-papers", { params });
  return (r.data?.data ?? { list: [], total: 0, page: 0 }) as {
    list: ExamPaperSummary[];
    total: number;
    page: number;
  };
}

export async function fetchExamPaper(id: number): Promise<ExamPaperDetail> {
  const r = await adminHttp.get(`/exam-papers/${id}`);
  const d = r.data?.data as ExamPaperSummary & { sections?: PaperSectionJson[] };
  return { ...d, sections: mapSections(d.sections) };
}

export async function createExamPaper(body: { code: string; title: string }): Promise<ExamPaperDetail> {
  const r = await adminHttp.post("/exam-papers", body);
  const d = r.data?.data as ExamPaperSummary & { sections?: PaperSectionJson[] };
  return { ...d, sections: mapSections(d.sections) };
}

export async function saveExamPaper(id: number, body: { title: string; sections: FormSection[] }): Promise<ExamPaperDetail> {
  const r = await adminHttp.put(`/exam-papers/${id}`, {
    title: body.title,
    sections: mapToPaperSections(body.sections),
  });
  const d = r.data?.data as ExamPaperSummary & { sections?: PaperSectionJson[] };
  return { ...d, sections: mapSections(d.sections) };
}

export async function publishExamPaper(id: number): Promise<ExamPaperDetail> {
  const r = await adminHttp.post(`/exam-papers/${id}/publish`);
  const d = r.data?.data as ExamPaperSummary & { sections?: PaperSectionJson[] };
  return { ...d, sections: mapSections(d.sections) };
}

export async function unpublishExamPaper(id: number): Promise<ExamPaperDetail> {
  const r = await adminHttp.post(`/exam-papers/${id}/unpublish`);
  const d = r.data?.data as ExamPaperSummary & { sections?: PaperSectionJson[] };
  return { ...d, sections: mapSections(d.sections) };
}

export async function deleteExamPaper(id: number): Promise<{ ok: boolean; rows: number }> {
  const r = await adminHttp.delete(`/exam-papers/${id}`);
  return (r.data?.data ?? { ok: false, rows: 0 }) as { ok: boolean; rows: number };
}

export async function fetchExamFolders(): Promise<ExamPaperFolder[]> {
  const r = await adminHttp.get("/exam-papers/folders");
  return (r.data?.data ?? []) as ExamPaperFolder[];
}

export async function createExamFolder(name: string): Promise<ExamPaperFolder> {
  const r = await adminHttp.post("/exam-papers/folders", { name });
  return r.data?.data as ExamPaperFolder;
}

export async function renameExamFolder(id: number, name: string): Promise<{ ok: boolean }> {
  const r = await adminHttp.put(`/exam-papers/folders/${id}`, { name });
  return (r.data?.data ?? { ok: false }) as { ok: boolean };
}

export async function deleteExamFolder(id: number): Promise<{ ok: boolean }> {
  const r = await adminHttp.delete(`/exam-papers/folders/${id}`);
  return (r.data?.data ?? { ok: false }) as { ok: boolean };
}

export async function moveExamPaperToFolder(paperId: number, folderId: number | null): Promise<{ ok: boolean }> {
  const r = await adminHttp.put(`/exam-papers/${paperId}/folder`, { folderId });
  return (r.data?.data ?? { ok: false }) as { ok: boolean };
}

export interface ExamSeed {
  code: string;
  title: string;
  questionCount: number;
  imported: boolean;
}

export async function fetchExamSeeds(): Promise<ExamSeed[]> {
  const r = await adminHttp.get("/exam-papers/seeds");
  return (r.data?.data ?? []) as ExamSeed[];
}

export async function importExamSeeds(codes: string[]): Promise<{ imported: number }> {
  const r = await adminHttp.post("/exam-papers/import-seeds", { codes });
  return (r.data?.data ?? { imported: 0 }) as { imported: number };
}
