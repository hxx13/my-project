/**
 * 笼架页「多模式统一抽屉」的待提交缓冲模型。
 *
 * 各模式（分配/预定/划分/状态/确认/归档）的操作先在抽屉里攒着，最后一次性提交。
 * 缓冲**按模式分开存**（见 {@link PendingByMode}），切房间/切笼架都不丢；
 * 提交是**逐条**的：成功的移出缓冲，失败的留在列表里并写明原因（用户 2026-09-11 定的口径）。
 *
 * 这里只有纯函数，页面只负责接线 —— 便于单测，也避免 2350 行的页面再膨胀。
 */

/** 一个待提交条目：笼位 + 定位信息 + 该模式自己的载荷 */
export interface PendingItem {
  cageId: string;
  /** 人读位置串：「浦东 / 201A / 201A-1 (5,4)」 */
  label: string;
  shelveId: string;
  x?: number;
  y?: number;
  roomId?: string | null;
  /** 状态模式：该笼位的表单值 fieldId → value（只存差异，不存整棵 schema） */
  form?: Record<number, unknown>;
  /** 状态模式：该笼位**新增**的动作 code */
  actions?: string[];
  /** 状态模式：该笼位**取消**的动作 code（ARO 无取消色的会被跳过） */
  removedActions?: string[];
  /** 状态模式：笼盒编码（ARO 侧按码操作） */
  cageBoxCode?: string;
  /** 分配模式：该笼位归属到哪个 AUP（取消分配类不需要，留空） */
  aupId?: string;
  /** 预定模式：该笼位归属给哪个账号 */
  assigneeAccountId?: string;
  /** 分配模式：该笼位的动作类型（allocate=下发AUP / cancel=撤销分配），同批必须一致 */
  kind?: string;
  /** 确认模式：到场的认领 id */
  claimId?: number | string;
}

/** 一条提交结果（逐条提交时由调用方组装） */
export interface SubmitResult {
  cageId: string;
  ok: boolean;
  reason?: string;
}

/** 一个模式的待提交批次 */
export interface PendingBatch {
  /** 待提交条目，**数组顺序即提交顺序** */
  items: PendingItem[];
  /** 模式共享参数：分配=AUP / 预定=人 / 划分=人名单 / 归档=原因 */
  params: Record<string, unknown>;
  /** 上一次提交失败的条目（成功的已移出 items），展示在抽屉里 */
  failed: Array<{ cageId: string; label: string; reason: string }>;
}

export type PendingByMode = Partial<Record<string, PendingBatch>>;

export const EMPTY_BATCH: PendingBatch = { items: [], params: {}, failed: [] };

/** 取某模式的批次；没有则返回空批次（不写入）。 */
export function batchOf(all: PendingByMode, mode: string): PendingBatch {
  return all[mode] ?? EMPTY_BATCH;
}

/**
 * 按分组键切批 —— 提交时逐组调用同一个接口（接口签名是一批一个目标）。
 * 组内保持原顺序（`items` 的顺序即提交顺序）。
 */
export function groupItems(
  items: PendingItem[],
  keyOf: (it: PendingItem) => string,
): Map<string, PendingItem[]> {
  const m = new Map<string, PendingItem[]>();
  for (const it of items) {
    const k = keyOf(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * 追加或就地更新一个条目。
 * 同一个笼位重复加入时**保持原位置只换内容**（不跳到末尾），避免用户排好的顺序被打乱。
 */
export function upsertItem(batch: PendingBatch, item: PendingItem): PendingBatch {
  const idx = batch.items.findIndex((x) => x.cageId === item.cageId);
  const items = idx >= 0
    ? batch.items.map((x, i) => (i === idx ? { ...x, ...item } : x))
    : [...batch.items, item];
  // 重新加入的条目要从失败列表里摘掉，否则还挂着上次的错
  const failed = batch.failed.filter((f) => f.cageId !== item.cageId);
  return { ...batch, items, failed };
}

export function removeItem(batch: PendingBatch, cageId: string): PendingBatch {
  return {
    ...batch,
    items: batch.items.filter((x) => x.cageId !== cageId),
    failed: batch.failed.filter((f) => f.cageId !== cageId),
  };
}

/** 调序（顺序即提交顺序）。越界返回原对象。 */
export function moveItem(batch: PendingBatch, from: number, to: number): PendingBatch {
  if (from === to || from < 0 || to < 0 || from >= batch.items.length || to >= batch.items.length) {
    return batch;
  }
  const items = [...batch.items];
  const [it] = items.splice(from, 1);
  items.splice(to, 0, it);
  return { ...batch, items };
}

export function setParams(batch: PendingBatch, params: Record<string, unknown>): PendingBatch {
  return { ...batch, params: { ...batch.params, ...params } };
}

/** 清空该模式（关抽屉/提交完/用户点清空）。 */
export function clearBatch(): PendingBatch {
  return { items: [], params: {}, failed: [] };
}

/**
 * 把一次逐条提交的结果落回缓冲：
 * 成功的移出 items，失败的留住并写进 failed —— 用户只需重试剩下那几条。
 *
 * 失败原因**跨轮保留**：本轮没被提交到的条目沿用上次的原因，直到它成功/被移除/被重新编辑。
 * （每次提交就清空原因的话，用户重试前会看不到「上次为什么失败」。）
 */
export function applyResults(batch: PendingBatch, results: SubmitResult[]): PendingBatch {
  const byId = new Map(results.map((r) => [r.cageId, r]));
  const items: PendingItem[] = [];
  const failed: PendingBatch['failed'] = [];
  for (const it of batch.items) {
    const r = byId.get(it.cageId);
    if (r && r.ok) continue; // 成功 → 移出，失败记录一并丢弃
    items.push(it);
    if (r) {
      failed.push({ cageId: it.cageId, label: it.label, reason: r.reason || "提交失败" });
    } else {
      const prev = batch.failed.find((f) => f.cageId === it.cageId);
      if (prev) failed.push(prev);
    }
  }
  return { ...batch, items, failed };
}

export function summarize(results: SubmitResult[]): { ok: number; failed: number } {
  let ok = 0;
  for (const r of results) if (r.ok) ok += 1;
  return { ok, failed: results.length - ok };
}
