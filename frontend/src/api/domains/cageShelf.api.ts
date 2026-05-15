import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface CageShelfOption {
  shelveId: string;
  shelveName: string;
}

export interface CageShelfFilterOptions {
  campuses: Array<{ campusId: string; campusName: string }>;
  areas: Array<{ areaId: string; areaName: string }>;
  floors: Array<{ floorId: string; floorName: string }>;
  rooms: Array<{ roomId: string; roomName: string }>;
  shelves: CageShelfOption[];
}

export interface CageShelfCell {
  x: number;
  y: number;
  position: string;
  empty: boolean;
  stateLabel: string;
  animalCageType?: number;
  name?: string;
  piName?: string;
  projectGroup?: string;
  departmentName?: string;
  projectPiName?: string;
  cageBoxInfo?: Record<string, unknown>;
  detail?: Record<string, unknown>;
}

export interface CageShelfDetail {
  shelfMeta: {
    campusName: string;
    areaName: string;
    floorName: string;
    roomName: string;
    shelveId: string;
    shelveName: string;
  };
  grid: CageShelfCell[];
  totalCells: number;
  filledCells: number;
}

export async function importCageShelfCsv(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<Result<{ created: number; updated: number; skipped: number; errors?: string[] }>>(
    "/v1/cage-shelves/import",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "导入失败");
  }
  return (
    res.data.data || {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    }
  );
}

export async function fetchCageShelfFilterOptions(params: {
  campusId?: number;
  areaId?: string;
  areaName?: string;
  floorId?: string;
  floorName?: string;
  roomId?: string;
  roomName?: string;
}) {
  const res = await authHttp.get<Result<CageShelfFilterOptions>>("/v1/cage-shelves/filter-options", { params });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "加载筛选项失败");
  }
  return res.data.data;
}

export async function fetchCageShelfDetail(shelveId: string) {
  const res = await authHttp.get<Result<CageShelfDetail>>(`/v1/cage-shelves/${encodeURIComponent(String(shelveId))}/detail`);
  if (!res.data?.success) {
    throw new Error(res.data?.message || "加载笼架详情失败");
  }
  return res.data.data;
}

export interface CageShelfIndexRow {
  campusId: string;
  campusName: string;
  areaId: string;
  areaName: string;
  floorId: string;
  floorName: string;
  roomId: string;
  roomName: string;
  shelveId: string;
  shelveName: string;
  orders?: number;
  updateTime?: string;
}

export async function fetchCageShelfIndexes(params: {
  campusId?: number;
  areaId?: string;
  floorId?: string;
  roomId?: string;
  page?: number;
  size?: number;
}) {
  const res = await authHttp.get<Result<{ rows: CageShelfIndexRow[]; total: number; page: number; size: number }>>(
    "/v1/cage-shelves/indexes",
    { params }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "加载索引表失败");
  }
  return res.data.data;
}
