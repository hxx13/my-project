import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSpecTemplates } from "@/api/hooks/useReferenceData";
import type { RefDataItem } from "@/api/domains/referenceData.api";

interface SpecSelectPanelProps {
  item: RefDataItem;
  /** Parent strain name for context display */
  parentLabel?: string;
  onConfirm: (entries: { optionLabel: string; qty: number; remark: string }[]) => void;
  onClose: () => void;
}

function extractOptions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : (p?.items ?? []); } catch { return []; }
  }
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as any).items)) return (raw as any).items;
  return [];
}

export default function SpecSelectPanel({ item, parentLabel, onConfirm, onClose }: SpecSelectPanelProps) {
  const { data: templates = [] } = useSpecTemplates();

  const templateIds: number[] = useMemo(() => {
    const raw = (item.fieldData as Record<string, unknown>)?.specTemplateIds;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === "string") {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(Number) : []; } catch { return []; }
    }
    return [];
  }, [item.fieldData]);

  interface OptionRow {
    key: string;
    templateName: string;
    label: string;
  }

  const optionRows: OptionRow[] = useMemo(() => {
    const rows: OptionRow[] = [];
    for (const tpl of templates) {
      if (!templateIds.includes(tpl.id)) continue;
      const opts = extractOptions(tpl.options);
      for (const opt of opts) {
        rows.push({ key: `${tpl.id}:${opt}`, templateName: tpl.name, label: opt });
      }
    }
    return rows;
  }, [templates, templateIds]);

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const handleConfirm = () => {
    const entries = optionRows
      .filter(r => (qtys[r.key] || 0) > 0)
      .map(r => ({ optionLabel: `${r.templateName}: ${r.label}`, qty: qtys[r.key], remark: remarks[r.key] || "" }));
    if (entries.length === 0) return;
    onConfirm(entries);
  };

  const itemLabel = ((item.fieldData as Record<string, unknown>)?.title as string) || `ID ${item.id}`;
  const headerLine = parentLabel ? `${parentLabel} · ${itemLabel}` : itemLabel;

  if (optionRows.length === 0) {
    return createPortal(
      <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--twin-ink)]">{headerLine} — 选购</h3>
            <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]">关闭</button>
          </div>
          <p className="text-xs text-[var(--twin-mute)] text-center py-6">该物品未配置规格模板</p>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-4 flex flex-col max-h-[85vh]"
        style={{ border: "2px solid #16a34a" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — 品系 · 规格 */}
        <div className="flex items-center justify-between shrink-0 px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold text-[var(--twin-ink)]">{headerLine} — 选购</h3>
          <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]">关闭</button>
        </div>

        {/* Body — one row per option, each with its own remark */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-2">
          {optionRows.map(row => {
            const q = qtys[row.key] || 0;
            return (
              <div key={row.key} className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2 space-y-1.5">
                {/* Option label + qty stepper */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--twin-ink)] min-w-0 truncate mr-2">{row.label}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      className="h-6 w-6 rounded border border-[var(--twin-hairline)] bg-white text-xs font-bold text-[var(--twin-body)] disabled:opacity-30"
                      disabled={q <= 0}
                      onClick={() => setQtys(prev => {
                        const cur = prev[row.key] || 0;
                        if (cur <= 1) { const n = { ...prev }; delete n[row.key]; return n; }
                        return { ...prev, [row.key]: cur - 1 };
                      })}
                    >−</button>
                    <input
                      type="number" min={0} max={999}
                      value={q || ""}
                      placeholder="0"
                      onChange={e => {
                        const n = parseInt(e.target.value || "0", 10);
                        if (n <= 0) { setQtys(prev => { const nxt = { ...prev }; delete nxt[row.key]; return nxt; }); }
                        else setQtys(prev => ({ ...prev, [row.key]: Math.min(999, n) }));
                      }}
                      className="h-6 w-12 rounded border border-[var(--twin-hairline)] text-center text-xs"
                    />
                    <button
                      type="button"
                      className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white"
                      onClick={() => setQtys(prev => ({ ...prev, [row.key]: Math.min(999, (prev[row.key] || 0) + 1) }))}
                    >+</button>
                  </div>
                </div>
                {/* Per-option remark */}
                <input
                  type="text"
                  placeholder="备注…"
                  value={remarks[row.key] || ""}
                  onChange={e => setRemarks(prev => ({ ...prev, [row.key]: e.target.value }))}
                  className="w-full rounded border border-[var(--twin-hairline)] bg-white px-2 py-1 text-[11px] text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)] outline-none"
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--twin-hairline)] shrink-0">
          <button onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-4 py-2 text-sm text-[var(--twin-body)]">取消</button>
          <button
            onClick={handleConfirm}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: optionRows.some(r => (qtys[r.key] || 0) > 0) ? "#16a34a" : "#9ca3af" }}
          >
            加入购物车
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
