import { authHttp } from "@/api/core/authHttp";
import axios from "axios";

/* ── 类型 ── */

export type ContentType = "NEWS" | "NOTICE" | "MODEL_RESOURCE" | "PAGE";
export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface PortalCategory {
  id: number;
  name: string;
  scope: ContentType | "ALL";
  parentId: number | null;
  sortOrder: number;
  status: number;
  coverUrl: string | null;
}

export interface PortalContentView {
  id: number;
  contentType: ContentType;
  categoryId: number | null;
  categoryName: string | null;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  contentHtml: string | null;
  extensionJson: Record<string, unknown> | null;
  status: ContentStatus;
  sortOrder: number;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalContentUpsertRequest {
  contentType: ContentType;
  categoryId?: number | null;
  title: string;
  summary?: string | null;
  coverUrl?: string | null;
  contentHtml?: string | null;
  extensionJson?: Record<string, unknown> | null | string;
  status: ContentStatus;
  publishedAt?: string | null;
  sortOrder?: number;
}

export interface PortalContentPage {
  data: PortalContentView[];
  total: number;
}

/* ── 公开 API ── */

/** 公开：分页查询已发布内容 */
export async function fetchPublicContents(params: {
  type?: ContentType;
  categoryId?: number;
  search?: string;
  page?: number;
  size?: number;
  sort?: string;
}): Promise<PortalContentPage> {
  const res = await axios.get<{ data: PortalContentPage }>("/api/public/portal/content", { params });
  return res.data.data;
}

/** 公开：单条详情 */
export async function fetchPublicContent(id: number): Promise<PortalContentView> {
  const res = await axios.get<{ data: PortalContentView }>(`/api/public/portal/content/${id}`);
  return res.data.data;
}

/** 公开：分类列表 */
export async function fetchPublicCategories(scope?: ContentType): Promise<PortalCategory[]> {
  const res = await axios.get<{ data: PortalCategory[] }>("/api/public/portal/categories", { params: { scope } });
  return res.data.data;
}

/* ── 管理 API ── */

/** 管理：分页列表（含草稿/已删除） */
export async function fetchAdminContents(params: {
  type?: ContentType;
  status?: ContentStatus;
  search?: string;
  page?: number;
  size?: number;
}): Promise<PortalContentPage> {
  const res = await authHttp.get<{ data: PortalContentPage }>("/portal/admin/content", { params });
  return res.data.data;
}

/** 管理：单条 */
export async function fetchAdminContent(id: number): Promise<PortalContentView> {
  const res = await authHttp.get<{ data: PortalContentView }>(`/api/portal/admin/content/${id}`);
  return res.data.data;
}

/** 管理：新建 */
export async function createContent(body: PortalContentUpsertRequest): Promise<PortalContentView> {
  const res = await authHttp.post<{ data: PortalContentView }>("/portal/admin/content", body);
  return res.data.data;
}

/** 管理：更新 */
export async function updateContent(id: number, body: Partial<PortalContentUpsertRequest>): Promise<PortalContentView> {
  const res = await authHttp.patch<{ data: PortalContentView }>(`/api/portal/admin/content/${id}`, body);
  return res.data.data;
}

/** 管理：软删除 */
export async function deleteContent(id: number): Promise<void> {
  await authHttp.delete(`/api/portal/admin/content/${id}`);
}

/** 管理：回收站列表 */
export async function fetchRecycleContents(params: {
  page?: number;
  size?: number;
}): Promise<PortalContentPage> {
  const res = await authHttp.get<{ data: PortalContentPage }>("/portal/admin/content/recycle", { params });
  return res.data.data;
}

/** 管理：恢复 */
export async function restoreContent(id: number): Promise<void> {
  await authHttp.post(`/portal/admin/content/recycle/${id}/restore`);
}

/** 管理：物理删除 */
export async function purgeContent(id: number): Promise<void> {
  await authHttp.delete(`/portal/admin/content/recycle/${id}`);
}

/* ── 分类管理 API ── */

export async function fetchAdminCategories(): Promise<PortalCategory[]> {
  const res = await authHttp.get<{ data: PortalCategory[] }>("/portal/admin/categories");
  return res.data.data;
}

export async function createCategory(body: { name: string; scope: string; sortOrder?: number }): Promise<PortalCategory> {
  const res = await authHttp.post<{ data: PortalCategory }>("/portal/admin/categories", body);
  return res.data.data;
}

export async function updateCategory(id: number, body: { name?: string; scope?: string; sortOrder?: number; status?: number }): Promise<PortalCategory> {
  const res = await authHttp.patch<{ data: PortalCategory }>(`/portal/admin/categories/${id}`, body);
  return res.data.data;
}

export async function deleteCategory(id: number): Promise<void> {
  await authHttp.delete(`/portal/admin/categories/${id}`);
}
