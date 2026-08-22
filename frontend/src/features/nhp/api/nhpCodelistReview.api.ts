/**
 * NHP 码表审核 API 层（item 级 verdict + 版本冻结）。
 *
 * 对接后端契约（后端未实现，前端按 22 §6.5 先行定义）：
 * - crf_codelist_item 加 verdict + verdict_note（item 级四态校对）
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 码表项（带 verdict 审核态） */
export interface NhpCodelistReviewItem {
  id: number;
  itemCode: string;
  itemLabel: string;
  /** CONFIRM / MODIFY / DELETE / QUESTION */
  verdict?: string | null;
  verdictNote?: string | null;
}

export async function fetchNhpCodelistReviewItems(code: string): Promise<NhpCodelistReviewItem[]> {
  return authHttp
    .get<Result<NhpCodelistReviewItem[]>>(`/nhp/codelists/${encodeURIComponent(code)}/review-items`)
    .then(({ data }) => data.data);
}

export async function submitNhpCodelistItemVerdict(
  code: string,
  itemId: number,
  body: { verdict: string; verdictNote?: string },
): Promise<void> {
  await authHttp.post<Result<void>>(`/nhp/codelists/${encodeURIComponent(code)}/items/${itemId}/verdict`, body);
}

export async function freezeNhpCodelist(code: string): Promise<void> {
  await authHttp.post<Result<void>>(`/nhp/codelists/${encodeURIComponent(code)}/freeze`);
}
