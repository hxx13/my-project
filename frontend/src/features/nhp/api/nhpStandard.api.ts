/**
 * NHP 标准库 API 层。
 *
 * 对接后端契约（后端未实现，前端按 22 §3.7 先行定义）：
 * - crf_standard_version：D12 统一标准库版本实体（PANEL/CRITERIA/PROTOCOL/DICT）
 * - 方案库 crf_regimen_library（immu_code + dose_rule/target_range）为独立内容，待后续补
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** standard_code 类别（码表 VER） */
export const STANDARD_CODE_OPTIONS = [
  { value: "PANEL", label: "panel" },
  { value: "CRITERIA", label: "放行标准" },
  { value: "PROTOCOL", label: "协议" },
  { value: "DICT", label: "字典" },
] as const;

/** 标准库版本（crf_standard_version 一行） */
export interface NhpStandardVersion {
  id: number;
  /** PANEL / CRITERIA / PROTOCOL / DICT */
  standardCode: string;
  /** 具体对象，如 panel 编码或协议码 */
  objectRef: string;
  version: number;
  versionNote?: string | null;
  active: boolean;
}

export async function fetchNhpStandards(): Promise<NhpStandardVersion[]> {
  return authHttp.get<Result<NhpStandardVersion[]>>("/nhp/standards").then(({ data }) => data.data);
}
