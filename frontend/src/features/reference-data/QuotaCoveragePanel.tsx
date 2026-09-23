import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useSpecTemplates } from "@/api/hooks/useReferenceData";
import {
  fetchRefDataOptions,
  type RefDataItem,
  type RefSpecTemplate,
} from "@/api/domains/referenceData.api";
import { extractSpecOptions, specPriceKey } from "./typeRegistry";

interface QuotaCoveragePanelProps {
  onClose: () => void;
}

/**
 * 某类型下**全部**可订购条目。
 *
 * 必须走 `/options` 而不是列表接口：列表接口不传 parentId 时语义是「只取顶层行」
 * （`AND parent_id IS NULL`），而可订购的规格卡片挂在品系下（parent_id 非空），
 * 用列表接口会一条都取不到 —— 面板会谎报「暂无已开启选购的商品」，管理员以为配齐了。
 * `/options` 的 SQL 是「该类型 + 已发布 + purchasable=true」，与层级无关。
 */
function useAllPurchasableItems(typeKey: string) {
  return useQuery({
    queryKey: ["referenceData", "options", typeKey],
    queryFn: () => fetchRefDataOptions(typeKey),
    staleTime: 5 * 60 * 1000,
  });
}

/** fieldData.specTemplateIds 可能是数组或历史 JSON 字符串 */
function parseTemplateIds(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(Number) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function QuotaCoveragePanel({ onClose }: QuotaCoveragePanelProps) {
  const { data: templates = [] } = useSpecTemplates();
  const { data: strainItems = [], isLoading: strainLoading } = useAllPurchasableItems("ANIMAL_STRAIN");
  const { data: genotypeItems = [], isLoading: genotypeLoading } = useAllPurchasableItems("GENOTYPE");

  const tplById = useMemo(() => {
    const m = new Map<number, RefSpecTemplate>();
    for (const t of templates) m.set(t.id, t);
    return m;
  }, [templates]);

  const { groups, unconfigured } = useMemo(() => {
    const map = new Map<number, { cardLabel: string; specs: Array<{ specLabel: string; configured: boolean }> }>();
    let unconfigured = 0;
    const ensure = (id: number, cardLabel: string) => {
      let g = map.get(id);
      if (!g) {
        g = { cardLabel, specs: [] };
        map.set(id, g);
      }
      return g;
    };
    const addSpec = (id: number, cardLabel: string, specLabel: string, configured: boolean) => {
      if (!configured) unconfigured++;
      ensure(id, cardLabel).specs.push({ specLabel, configured });
    };
    const walk = (items: RefDataItem[]) => {
      for (const item of items) {
        const fd = item.fieldData ?? {};
        if (fd.purchasable !== true) continue;
        const cardLabel = String(fd.title || fd.subtitle || `ID ${item.id}`);
        const quotas =
          fd.specQuotas && typeof fd.specQuotas === "object"
            ? (fd.specQuotas as Record<string, unknown>)
            : {};
        const ids = parseTemplateIds(fd.specTemplateIds);
        if (ids.length > 0) {
          for (const tid of ids) {
            const tpl = tplById.get(tid);
            if (!tpl) continue;
            for (const opt of extractSpecOptions(tpl.options)) {
              const v = quotas[specPriceKey(tpl.name, opt)];
              addSpec(item.id, cardLabel, `${tpl.name} · ${opt}`, v != null && v !== "");
            }
          }
        } else {
          const v = fd.quota;
          addSpec(item.id, cardLabel, "无规格", v != null && v !== "");
        }
      }
    };
    walk(strainItems);
    walk(genotypeItems);
    return { groups: Array.from(map.values()), unconfigured };
  }, [strainItems, genotypeItems, tplById]);

  const loading = strainLoading || genotypeLoading;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h3 className="text-base font-semibold text-[var(--twin-ink)]">每周期订购上限 · 未配置清单</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
          >
            关闭
          </button>
        </div>

        <div className="shrink-0 mb-3 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-[11px] text-[var(--twin-body)]">
          留空 = 该规格本周期不可订。当前已开启选购的商品中，共
          <span className={`mx-0.5 font-semibold ${unconfigured > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {unconfigured}
          </span>
          个规格未配置上限。
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载中…</div>
          ) : groups.length === 0 ? (
            <div className="text-xs text-[var(--twin-mute)] py-4 text-center">暂无已开启选购的商品</div>
          ) : (
            groups.map((g, gi) => (
              <div key={gi} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
                <div className="text-sm font-medium text-[var(--twin-ink)] truncate">{g.cardLabel}</div>
                <div className="mt-1 space-y-0.5">
                  {g.specs.map((s, si) => (
                    <div key={si} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--twin-mute)]">{s.specLabel}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          s.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {s.configured ? "已配置" : "未配置"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
