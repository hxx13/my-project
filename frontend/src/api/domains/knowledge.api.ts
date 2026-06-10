import { adminHttp } from "@/api/core/adminHttp";
import type {
  KnowledgeTreeNode, KnowledgePage, KnowledgeHistory,
  KnowledgePageSaveRequest, GraphData, TimelineEvent,
  TagStats, KnowledgeStats,
} from "@/features/knowledge/types";

interface Result<T> { code: number; success: boolean; message: string; data: T; }

// ── Tree ──
export async function fetchKnowledgeTree(): Promise<KnowledgeTreeNode[]> {
  const res = await adminHttp.get<Result<KnowledgeTreeNode[]>>("/knowledge/categories/tree");
  return res.data.data;
}

// ── Page ──
export async function fetchKnowledgePage(pageId: number): Promise<KnowledgePage> {
  const res = await adminHttp.get<Result<KnowledgePage>>(`/knowledge/pages/${pageId}`);
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

// ── History ──
export async function fetchKnowledgeHistory(pageId: number): Promise<KnowledgeHistory[]> {
  const res = await adminHttp.get<Result<KnowledgeHistory[]>>(`/knowledge/pages/${pageId}/history`);
  return res.data.data;
}

export async function rollbackKnowledgePage(pageId: number, version: number): Promise<KnowledgePage> {
  const res = await adminHttp.post<Result<KnowledgePage>>(`/knowledge/pages/${pageId}/rollback/${version}`);
  return res.data.data;
}

// ── Graph ──
export async function fetchKnowledgeGraph(): Promise<GraphData> {
  const res = await adminHttp.get<Result<GraphData>>("/knowledge/graph");
  return res.data.data ?? { nodes: [], edges: [] };
}

export async function fetchPageBacklinks(pageId: number): Promise<{ pageId: number; title: string; type: string }[]> {
  const res = await adminHttp.get<Result<any>>(`/knowledge/pages/${pageId}/backlinks`);
  return res.data.data ?? [];
}

// ── Timeline ──
export async function fetchKnowledgeTimeline(params?: { limit?: number; type?: string }): Promise<TimelineEvent[]> {
  const res = await adminHttp.get<Result<TimelineEvent[]>>("/knowledge/timeline", { params });
  return res.data.data ?? [];
}

// ── Tags / Stats ──
export async function fetchKnowledgeTags(): Promise<TagStats[]> {
  const res = await adminHttp.get<Result<TagStats[]>>("/knowledge/tags");
  return res.data.data ?? [];
}

export async function fetchKnowledgeStats(): Promise<KnowledgeStats> {
  const res = await adminHttp.get<Result<KnowledgeStats>>("/knowledge/stats");
  return res.data.data ?? { totalPages: 0, totalCategories: 0, totalTags: 0, lastUpdated: null };
}

// ── Import ──
export async function importKnowledgePage(data: { categoryId: number; title: string; content: string; format: "markdown" | "html"; author: string }): Promise<KnowledgePage> {
  const res = await adminHttp.post<Result<KnowledgePage>>("/knowledge/pages/import", data);
  return res.data.data;
}

// ── Category CRUD ──
export async function createKnowledgeCategory(data: { name: string; slug: string; icon?: string }): Promise<KnowledgeTreeNode> {
  const res = await adminHttp.post<Result<KnowledgeTreeNode>>("/knowledge/categories", data);
  return res.data.data;
}

export async function deleteKnowledgeCategory(id: number): Promise<void> {
  await adminHttp.delete(`/knowledge/categories/${id}`);
}
