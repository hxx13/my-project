import { useEffect, useState } from "react";
import { fetchSpecQuotaBatch, type RefDataItem, type RefSpecTemplate, type SpecQuota } from "@/api/domains/referenceData.api";
import { specRowsOf } from "./ReferenceCard";

/**
 * 一屏卡片逐规格剩余量：把「可见卡片列表」的全部规格拼成一次批量请求（不是每卡/每规格各发一次），
 * 每 15s 轮询一次（与购物车轮询同节奏），校区/品类/周期变化时重查。失败或加载中返回空 → 卡片不显示剩余行。
 */
export function useSpecQuotaBatch(
  cards: RefDataItem[],
  templates: RefSpecTemplate[],
  campus?: string,
  cycle?: string | null,
): Record<string, SpecQuota> {
  const [map, setMap] = useState<Record<string, SpecQuota>>({});

  useEffect(() => {
    if (!campus || cards.length === 0) { setMap({}); return; }
    const items: Array<{ refDataId: number; spec?: string }> = [];
    for (const c of cards) {
      if ((c.fieldData as Record<string, unknown>)?.purchasable !== true) continue;
      for (const r of specRowsOf(c, templates)) items.push({ refDataId: c.id, spec: r.spec });
    }
    if (items.length === 0) { setMap({}); return; }

    let cancelled = false;
    const load = async () => {
      try {
        const m = await fetchSpecQuotaBatch(items, { campus, cycle: cycle ?? undefined });
        if (!cancelled) setMap(m);
      } catch { /* 失败当未知，保持上次结果或空 */ }
    };
    void load();
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [cards, templates, campus, cycle]);

  return map;
}
