import { authHttp } from "@/api/core/authHttp";
import type { CardArchive, CardFieldOption, CardTemplate } from "@/features/card-print/types";

/** 与 cageForm.api.ts / cageShelf.api.ts 一致：Result 在各 api 文件内本地声明 */
interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

const BASE = "/admin/card-print";

export async function fetchCardFields(): Promise<CardFieldOption[]> {
  const res = await authHttp.get<Result<CardFieldOption[]>>(`${BASE}/fields`);
  return res.data.data ?? [];
}

export async function fetchCardTemplates(): Promise<CardTemplate[]> {
  const res = await authHttp.get<Result<CardTemplate[]>>(`${BASE}/templates`);
  return res.data.data ?? [];
}

export async function saveCardTemplate(
  body: Partial<CardTemplate> & { name: string; specJson: string; slotsJson: string },
): Promise<CardTemplate | undefined> {
  if (body.id) {
    const res = await authHttp.put<Result<CardTemplate>>(`${BASE}/templates/${body.id}`, body);
    return res.data.data;
  }
  const res = await authHttp.post<Result<CardTemplate>>(`${BASE}/templates`, body);
  return res.data.data;
}

export async function deleteCardTemplate(id: number): Promise<void> {
  await authHttp.delete(`${BASE}/templates/${id}`);
}

export interface CardValueMap {
  id: number;
  canonical: string;
  rawValue: string;
  shortValue: string;
}

export async function fetchCardValueMaps(): Promise<CardValueMap[]> {
  const res = await authHttp.get<Result<CardValueMap[]>>(`${BASE}/value-maps`);
  return res.data.data ?? [];
}

export async function saveCardValueMap(
  body: { id?: number; canonical: string; rawValue: string; shortValue: string },
): Promise<CardValueMap | undefined> {
  if (body.id) {
    const res = await authHttp.put<Result<CardValueMap>>(`${BASE}/value-maps/${body.id}`, body);
    return res.data.data;
  }
  const res = await authHttp.post<Result<CardValueMap>>(`${BASE}/value-maps`, body);
  return res.data.data;
}

export async function deleteCardValueMap(id: number): Promise<void> {
  await authHttp.delete(`${BASE}/value-maps/${id}`);
}

export async function previewCardPdf(templateId: number, animalCageId?: string): Promise<Blob> {
  const res = await authHttp.post(`${BASE}/preview`, { templateId, animalCageId }, { responseType: "blob" });
  return res.data as Blob;
}

export async function generateCardPdf(templateId: number, animalCageIds: string[], nameSuffix?: string) {
  const res = await authHttp.post<Result<{ archiveId: number; pageCount: number; fileName: string }>>(
    `${BASE}/generate`,
    { templateId, animalCageIds, nameSuffix },
  );
  return res.data.data;
}

/** 取一批笼位组装好的卡牌数据（右侧实时预览用） */
export async function fetchCardData(animalCageIds: string[]): Promise<Record<string, string>[]> {
  const res = await authHttp.post<Result<Record<string, string>[]>>(`${BASE}/data`, { animalCageIds });
  return res.data.data ?? [];
}

export async function fetchCardArchives(page = 1, size = 20) {
  const res = await authHttp.get<Result<{ rows: CardArchive[]; total: number; page: number; size: number }>>(
    `${BASE}/archives`,
    { params: { page, size } },
  );
  return res.data.data;
}

export async function downloadCardArchive(id: number): Promise<Blob> {
  const res = await authHttp.get(`${BASE}/archives/${id}/download`, { responseType: "blob" });
  return res.data as Blob;
}

export async function deleteCardArchive(id: number): Promise<void> {
  await authHttp.delete(`${BASE}/archives/${id}`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
