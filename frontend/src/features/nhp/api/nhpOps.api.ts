/**
 * NHP 运维/辅助能力 API（后端已有、面板补入口）。
 * - seed / pig-dictionary
 * - imports 批次
 * - ids/next 取号
 * - query/concepts 概念库
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface NhpConcept {
  id: number;
  conceptCode: string;
  nameCn?: string;
  nameEn?: string;
  unit?: string;
  active?: boolean;
}

export interface NhpIdNextResult {
  idType: string;
  scopeKey?: string;
  code: string;
  ctx?: Record<string, unknown>;
  /** preview 端点为 true，表示未持久化 */
  preview?: boolean;
}

export async function seedNhpAll(): Promise<Record<string, number>> {
  return authHttp.post<Result<Record<string, number>>>("/nhp/seed").then(({ data }) => data.data ?? {});
}

/** 导入内置原子种子（nhp-atoms.json 四层：套、字段、DRAFT 原子、题目模板） */
export async function seedNhpAtoms(): Promise<{ atoms?: number }> {
  return authHttp
    .post<Result<{ atoms?: number }>>("/nhp/seed/atoms")
    .then(({ data }) => data.data ?? {});
}

/** 系统启动种子：生成/补全默认组合模板 nhp-crf（钉住全部原子并发布）；用户「导入内置种子」不调用此接口 */
export async function seedNhpComposite(): Promise<{ composite?: number }> {
  return authHttp
    .post<Result<{ composite?: number }>>("/nhp/seed/composite")
    .then(({ data }) => data.data ?? {});
}

export async function nextNhpId(body: {
  idType: string;
  [k: string]: unknown;
}): Promise<NhpIdNextResult> {
  return authHttp.post<Result<NhpIdNextResult>>("/nhp/ids/next", body).then(({ data }) => data.data);
}

/** 预览下一编号（不递增序列、不持久化） */
export async function previewNhpId(body: {
  idType: string;
  [k: string]: unknown;
}): Promise<NhpIdNextResult> {
  return authHttp.post<Result<NhpIdNextResult>>("/nhp/ids/preview", body).then(({ data }) => data.data);
}

export async function fetchNhpConcepts(): Promise<NhpConcept[]> {
  return authHttp.get<Result<NhpConcept[]>>("/nhp/query/concepts").then(({ data }) => data.data ?? []);
}

export async function createNhpImportBatch(body: Record<string, unknown>): Promise<{ id: number; status?: string }> {
  return authHttp
    .post<Result<{ id: number; status?: string }>>("/nhp/imports/batches", body)
    .then(({ data }) => data.data);
}

export async function validateNhpImportBatch(batchId: number): Promise<unknown> {
  return authHttp
    .post<Result<unknown>>(`/nhp/imports/batches/${batchId}/validate`)
    .then(({ data }) => data.data);
}

export async function executeNhpImportBatch(batchId: number): Promise<unknown> {
  return authHttp
    .post<Result<unknown>>(`/nhp/imports/batches/${batchId}/import`)
    .then(({ data }) => data.data);
}
