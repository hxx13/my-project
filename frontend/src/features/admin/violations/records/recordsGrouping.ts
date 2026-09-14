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

/** 块内一段连续同人的行（合并格信息）。键用 targetUserId，不能用显示名（同名会串段）。 */
export type ViolationPersonSegment = {
  /** 稳定键：targetUserId */
  key: string;
  /** 显示名；targetUserDisplayName 缺失时兜底 targetUserId */
  name: string;
  /** 段行数（合并格 rowSpan） */
  rowSpan: number;
  /** 段首行在 `block.rows` 中的下标 */
  startIndex: number;
};

export type ViolationBatchBlock = {
  batchId: string;
  rows: StudentViolationRow[];
  groups: ViolationGroupSegment[];
  persons: ViolationPersonSegment[];
};

/** 后端已按 batch_id DESC, id ASC 排序——只做连续分段，绝不排序。 */
export function groupViolationRows(rows: StudentViolationRow[]): ViolationBatchBlock[] {
  const blocks: ViolationBatchBlock[] = [];
  for (const row of rows) {
    // 空串也要回退：否则所有空 batchId 的行会塌成同一块
    const rawBatchId = row.batchId?.trim();
    const batchId = rawBatchId ? rawBatchId : `SINGLE-${row.id}`;
    const last = blocks[blocks.length - 1];
    if (last && last.batchId === batchId) last.rows.push(row);
    else blocks.push({ batchId, rows: [row], groups: [], persons: [] });
  }
  for (const block of blocks) {
    block.groups = groupSegments(block.rows);
    block.persons = groupPersonSegments(block.rows);
  }
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

/** 人的连续分段：同一 targetUserId 相邻即合并。块内同人不连续时切成两段（与课题组同口径，不重排）。 */
function groupPersonSegments(rows: StudentViolationRow[]): ViolationPersonSegment[] {
  const segs: ViolationPersonSegment[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = row.targetUserId;
    const last = segs[segs.length - 1];
    if (last && last.key === key) last.rowSpan += 1;
    else {
      segs.push({
        key,
        name: (row.targetUserDisplayName ?? "").trim() || key,
        rowSpan: 1,
        startIndex: i,
      });
    }
  }
  return segs;
}

/**
 * 签名图 dataUrl 只在点击「查看签名」后从 disposition-detail 的 answerPayload 里取。
 *
 * <p>回执的**真实形状是两层**：`{"answer":"{\"signature\":\"data:image/jpeg;...\"}"}`
 * ——后端 `writeReceiptAndComplete` 统一包成 `{answer: <原始提交>}`，而原始提交自己又是
 * `JSON.stringify({signature})`。只认扁平 `{signature}` 会永远解不出来（表现：弹窗报「未找到签名图」）。
 * 兼容扁平与「answer 直接就是 dataUrl」两种写法。
 */
export function parseSignatureDataUrl(answerPayload?: string | null): string | null {
  if (!answerPayload) return null;

  const readSignature = (value: unknown): string | null => {
    if (typeof value === "string") {
      const s = value.trim();
      if (s.startsWith("data:image/")) return s; // answer 直接就是图
      try {
        const inner = JSON.parse(s) as { signature?: unknown };
        const sig = inner?.signature;
        return typeof sig === "string" && sig.trim() ? sig : null;
      } catch {
        return null;
      }
    }
    if (value && typeof value === "object") {
      const sig = (value as { signature?: unknown }).signature;
      return typeof sig === "string" && sig.trim() ? sig : null;
    }
    return null;
  };

  try {
    const parsed = JSON.parse(answerPayload) as { answer?: unknown; signature?: unknown };
    return readSignature(parsed?.answer) ?? readSignature(parsed);
  } catch {
    return readSignature(answerPayload);
  }
}
