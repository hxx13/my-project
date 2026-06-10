import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

// ── Types ──

export interface KnowledgeCategory {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  icon: string;
  description?: string;
}

export interface KnowledgePage {
  id: number;
  categoryId: number;
  slug: string;
  title: string;
  contentHtml: string;
  contentMd?: string;
  source: 'imported' | 'agent' | 'manual';
  version: number;
  author: string;
  isPublished: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeHistory {
  id: number;
  pageId: number;
  version: number;
  author: string;
  summary?: string;
  createdAt: string;
}

export interface KnowledgeTreeNode {
  categoryId: number;
  parentId: number | null;
  categoryName: string;
  categorySlug: string;
  icon: string;
  sortOrder: number;
  pages: KnowledgePageSummary[];
  children: KnowledgeTreeNode[];
}

export interface KnowledgePageSummary {
  id: number;
  slug: string;
  title: string;
  source: string;
  version: number;
}

export interface KnowledgePageSaveRequest {
  categoryId: number;
  slug: string;
  title: string;
  contentHtml?: string;
  contentMd?: string;
  summary?: string;
}

export interface KnowledgeImportRequest {
  categoryId: number;
  title: string;
  content: string;
  format: 'markdown';
  author: string;
}

// ── Category APIs ──

export async function fetchKnowledgeTree(): Promise<KnowledgeTreeNode[]> {
  const res = await adminHttp.get<Result<KnowledgeTreeNode[]>>("/knowledge/categories/tree");
  return res.data.data;
}

export async function createKnowledgeCategory(data: {
  name: string; slug: string; icon?: string; description?: string; sortOrder?: number;
}): Promise<KnowledgeCategory> {
  const res = await adminHttp.post<Result<KnowledgeCategory>>("/knowledge/categories", data);
  return res.data.data;
}

export async function updateKnowledgeCategory(id: number, data: {
  name?: string; slug?: string; icon?: string; description?: string; sortOrder?: number;
}): Promise<KnowledgeCategory> {
  const res = await adminHttp.put<Result<KnowledgeCategory>>(`/knowledge/categories/${id}`, data);
  return res.data.data;
}

export async function deleteKnowledgeCategory(id: number): Promise<void> {
  await adminHttp.delete(`/knowledge/categories/${id}`);
}

export async function updateCategoriesSort(ids: number[]): Promise<void> {
  await adminHttp.put("/knowledge/categories/sort", ids);
}

// ── Page APIs ──

export async function fetchKnowledgePage(pageId: number): Promise<KnowledgePage> {
  const res = await adminHttp.get<Result<KnowledgePage>>(`/knowledge/pages/${pageId}`);
  return res.data.data;
}

export async function fetchKnowledgePageBySlug(categoryId: number, slug: string): Promise<KnowledgePage> {
  const res = await adminHttp.get<Result<KnowledgePage>>("/knowledge/pages/by-slug", {
    params: { categoryId, slug },
  });
  return res.data.data;
}

export async function createKnowledgePage(data: KnowledgePageSaveRequest): Promise<KnowledgePage> {
  const res = await adminHttp.post<Result<KnowledgePage>>("/knowledge/pages", data);
  return res.data.data;
}

export async function updateKnowledgePage(pageId: number, data: KnowledgePageSaveRequest): Promise<KnowledgePage> {
  const res = await adminHttp.put<Result<KnowledgePage>>(`/knowledge/pages/${pageId}`, data);
  return res.data.data;
}

export async function deleteKnowledgePage(pageId: number): Promise<void> {
  await adminHttp.delete(`/knowledge/pages/${pageId}`);
}

export async function importKnowledgePage(data: KnowledgeImportRequest): Promise<KnowledgePage> {
  const res = await adminHttp.post<Result<KnowledgePage>>("/knowledge/pages/import", data);
  return res.data.data;
}

export async function importKnowledgeBatch(items: KnowledgeImportRequest[]): Promise<KnowledgePage[]> {
  const res = await adminHttp.post<Result<KnowledgePage[]>>("/knowledge/pages/import-batch", { items });
  return res.data.data;
}

export async function searchKnowledgePages(q: string, categoryId?: number): Promise<KnowledgePage[]> {
  const res = await adminHttp.get<Result<KnowledgePage[]>>("/knowledge/pages/search", {
    params: { q, ...(categoryId ? { categoryId } : {}) },
  });
  return res.data.data;
}

export async function exportKnowledgePage(pageId: number): Promise<string> {
  const res = await adminHttp.get<Result<string>>(`/knowledge/pages/${pageId}/export`, {
    params: { format: 'md' },
  });
  return res.data.data;
}

// ── History APIs ──

export async function fetchKnowledgeHistory(pageId: number): Promise<KnowledgeHistory[]> {
  const res = await adminHttp.get<Result<KnowledgeHistory[]>>(`/knowledge/pages/${pageId}/history`);
  return res.data.data;
}

export async function rollbackKnowledgePage(pageId: number, version: number): Promise<KnowledgePage> {
  const res = await adminHttp.post<Result<KnowledgePage>>(`/knowledge/pages/${pageId}/rollback/${version}`);
  return res.data.data;
}

// ── Graph APIs ──

export async function fetchKnowledgeGraph(params?: {
  categoryId?: number; tag?: string;
}): Promise<{ nodes: { id: number; title: string; categoryId: number; categoryName: string; refCount: number }[]; edges: { source: number; target: number; type: 'manual' | 'auto' }[] }> {
  const res = await adminHttp.get<Result<any>>("/knowledge/graph", { params });
  return res.data.data ?? res.data;
}

export async function fetchPageBacklinks(pageId: number): Promise<{ pageId: number; title: string; type: 'manual' | 'auto' }[]> {
  const res = await adminHttp.get<Result<any>>(`/knowledge/pages/${pageId}/backlinks`);
  return res.data.data ?? res.data;
}

export async function rebuildGraph(): Promise<void> {
  await adminHttp.post("/knowledge/graph/rebuild");
}

// ── Timeline APIs ──

export async function fetchKnowledgeTimeline(params?: {
  limit?: number; type?: string; author?: string; since?: string;
}): Promise<{ id: number; pageId: number; pageTitle: string; categoryName: string; type: string; author: string; summary: string | null; createdAt: string }[]> {
  const res = await adminHttp.get<Result<any>>("/knowledge/timeline", { params });
  return res.data.data ?? res.data;
}

// ── Tag APIs ──

export async function fetchKnowledgeTags(params?: { categoryId?: number }): Promise<{ name: string; count: number }[]> {
  const res = await adminHttp.get<Result<any>>("/knowledge/tags", { params });
  return res.data.data ?? res.data;
}

// ── Stats APIs ──

export async function fetchKnowledgeStats(): Promise<{ totalPages: number; totalCategories: number; totalTags: number; lastUpdated: string | null }> {
  const res = await adminHttp.get<Result<any>>("/knowledge/stats");
  return res.data.data ?? res.data;
}
