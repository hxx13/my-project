import type { MyCertificate } from "../api/student.api";

export interface CertificateGroup {
  key: string;
  /** 分区标题：培训名 */
  name: string;
  /** 该培训下最晚的培训日期（可能为空） */
  date?: string;
  items: MyCertificate[];
}

/**
 * 按培训分区（分区标题 = 培训名）。
 * 后端已按培训日期倒序返回，顺着切段即天然有序，同场次发的那两张（准入 + 安乐死）也不会被拆开。
 */
export function groupByTraining(list: MyCertificate[]): CertificateGroup[] {
  const out: CertificateGroup[] = [];
  const at = new Map<string, number>();
  for (const c of list) {
    const key = c.trainingId != null ? `t${c.trainingId}` : "none";
    let i = at.get(key);
    if (i === undefined) {
      i = out.length;
      at.set(key, i);
      out.push({ key, name: c.trainingName || "未关联培训", items: [] });
    }
    out[i].items.push(c);
    const d = c.trainingDate ?? "";
    if (d > (out[i].date ?? "")) out[i].date = d;
  }
  return out;
}
