// utils/reportFormBlocks.ts —— 与后端 ReportFormBlocks 同口径
import type { FormBlock } from '../types';

export const BLOCKS_KEY = '__blocks';
/** 老扁平数据归一化后的固定块 id —— 必须稳定，否则按 id 回写会找不到块 */
export const DEFAULT_BLOCK_ID = 'b_default';

type RawValues = Record<string, unknown> | string | null | undefined;

function parse(raw: RawValues): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      let v: unknown = JSON.parse(raw);
      // 历史数据存在「JSON 再被包一层字符串」的存法，解包一层
      if (typeof v === 'string') {
        v = JSON.parse(v);
      }
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw;
}

/** 归一化：任何输入都返回至少一块。老扁平数据 → 单块（固定 id）。 */
export function normalizeBlocks(raw: RawValues): FormBlock[] {
  const parsed = parse(raw);
  const blocks = parsed[BLOCKS_KEY];
  if (Array.isArray(blocks)) {
    return blocks.map((b, i) => {
      const o = (b ?? {}) as Record<string, unknown>;
      const values = (o.values && typeof o.values === 'object' ? o.values : {}) as Record<string, unknown>;
      return {
        id: typeof o.id === 'string' && o.id ? o.id : i === 0 ? DEFAULT_BLOCK_ID : `${DEFAULT_BLOCK_ID}_${i}`,
        version: typeof o.version === 'number' ? o.version : 0,
        values,
      };
    });
  }
  return [{ id: DEFAULT_BLOCK_ID, version: 0, values: parsed }];
}

/** 非重复表单：还原成扁平 JSON（后端旧接口只认这个形状）。 */
export function flattenFirstBlock(blocks: FormBlock[]): string {
  return JSON.stringify(blocks[0]?.values ?? {});
}

/** 按 id 取块；不存在返回 undefined */
export function findBlock(blocks: FormBlock[], id: string): FormBlock | undefined {
  return blocks.find(b => b.id === id);
}

/** 字段级合并：以 base 为底，只把 changedKeys 里出现过的字段从 changes 盖上去 */
export function mergeChangedFields(
  base: Record<string, unknown>,
  changes: Record<string, unknown>,
  changedKeys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of changedKeys) {
    if (k in changes) out[k] = changes[k];
  }
  return out;
}
