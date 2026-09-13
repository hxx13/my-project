import type { StudentViolationRow } from "@/api/domains/studentViolation.api";

/** 块内一段连续同课题组的行（合并格信息）。 */
export type ViolationGroupSegment = {
  /** 课题组名；null 显示为「—」 */
  name: string | null;
  /** 段行数（合并格 rowSpan） */
  rowSpan: number;
  /** 段首行在 `block.rows` 中的下标 */
  startIndex: number;
};

export type ViolationBatchBlock = {
  batchId: string;
  rows: StudentViolationRow[];
  groups: ViolationGroupSegment[];
};

/** 后端已按 batch_id DESC, id ASC 排序——只做连续分段，绝不排序。 */
export function groupViolationRows(rows: StudentViolationRow[]): ViolationBatchBlock[] {
  const blocks: ViolationBatchBlock[] = [];
  for (const row of rows) {
    const batchId = row.batchId ?? `SINGLE-${row.id}`;
    const last = blocks[blocks.length - 1];
    if (last && last.batchId === batchId) last.rows.push(row);
    else blocks.push({ batchId, rows: [row], groups: [] });
  }
  for (const block of blocks) block.groups = groupSegments(block.rows);
  return blocks;
}

function groupSegments(rows: StudentViolationRow[]): ViolationGroupSegment[] {
  const segs: ViolationGroupSegment[] = [];
  for (let i = 0; i < rows.length; i++) {
    const name = (rows[i].projectGroupName ?? "").trim() || null;
    const last = segs[segs.length - 1];
    if (last && last.name === name) last.rowSpan += 1;
    else segs.push({ name, rowSpan: 1, startIndex: i });
  }
  return segs;
}

/** 签名图 dataUrl 只在点击「查看签名」后从 disposition-detail 的 answerPayload 里取。 */
export function parseSignatureDataUrl(answerPayload?: string | null): string | null {
  if (!answerPayload) return null;
  try {
    const parsed = JSON.parse(answerPayload) as { signature?: unknown };
    const sig = parsed?.signature;
    return typeof sig === "string" && sig.trim() ? sig : null;
  } catch {
    return null;
  }
}
