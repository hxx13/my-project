/**
 * NHP 编码规则 API 层。
 *
 * 对接后端契约：
 * - crf_id_rule：16 类 ID 的 pattern + derived 标记
 * - crf_sequence：键 (id_type, scope_key) 泛化
 * - POST /nhp/ids/next 正式取号；POST /nhp/ids/preview 预览（不递增）
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 16 类 ID 编码规则（crf_id_rule 一行） */
export interface NhpIdRule {
  id: number;
  /** 如 DON/RCP/TX/XM/SMP/MED/AE/ANES/RS/… */
  idType: string;
  /** 编码模板，如 DON-{base}{year}-{seq:4} */
  pattern: string;
  /** 派生键（ANES/HX/RS=1），不走取号器 */
  derived: boolean;
  active?: boolean;
}

/** pattern 占位符全集（22 §4.2，仅作文档提示，非数据） */
export const PATTERN_PLACEHOLDERS: string[] = [
  "{base}（FARM 基地码）",
  "{center}（CENTER 中心码）",
  "{year}（YY）",
  "{seq} / {seq:N}",
  "{DONOR}/{DON}（供体码）",
  "{RECIP}（受体码）",
  "{TX}",
  "{REG}",
  "{TEST_ID}",
  "{TP}（时点码）",
  "{日期}（YYMMDD）",
  "{年月}（YYMM）",
  "{样本类型}",
  "{实验室}",
  "{项目码}",
];

export async function fetchNhpIdRules(): Promise<NhpIdRule[]> {
  return authHttp.get<Result<NhpIdRule[]>>("/nhp/idrules").then(({ data }) => data.data);
}

export async function updateNhpIdRule(id: number, patch: Partial<NhpIdRule>): Promise<NhpIdRule> {
  return authHttp.put<Result<NhpIdRule>>(`/nhp/idrules/${id}`, patch).then(({ data }) => data.data);
}
