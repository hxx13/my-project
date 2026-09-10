import { ClipboardList, LayoutGrid } from "lucide-react";
import type { FmTemplateItem } from "@/api/domains/facilityMaintenance.api";
import EmptyState from "@/components/ui/EmptyState";
import { cellKey, normalizeCells } from "@/features/facility-maintenance/inspectionPayload";

type InspectionMatrixProps = {
  sheet: Record<string, unknown> | null;
  onCellChange: (cellKey: string, value: string) => void;
  templateItems: FmTemplateItem[];
  sites: { id: string; name: string }[];
  readOnly?: boolean;
};

/**
 * 当日巡查矩阵：机房 × 巡查项的可编辑网格。
 * 纯展示 + 上报单元格变更；防抖保存 / version 乐观锁 / 轮询留在 InspectionTab。
 */
export default function InspectionMatrix({
  sheet,
  onCellChange,
  templateItems,
  sites,
  readOnly,
}: InspectionMatrixProps) {
  const cells = normalizeCells(sheet?.cells);

  if (!sheet) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          icon={ClipboardList}
          title="尚未打开当日巡查表"
          description="选择日期与模板后点击「打开当日巡查表」。若该日已有表，将直接加载协作内容。"
          className="min-h-0 flex-1"
        />
      </div>
    );
  }

  if (templateItems.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          icon={ClipboardList}
          title="当前模板无巡查项"
          description="请在「设置」中编辑模板；若模板已有项仍如此，请点「刷新」或检查接口返回的 template.items。"
          className="min-h-0 flex-1"
        />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          icon={LayoutGrid}
          title="没有可填写的机房行"
          description="可能全部停用，或模板未绑定启用机房。请在「设置」中检查机房状态或模板的适用机房。"
          className="min-h-0 flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
        <table className="min-w-full border-collapse text-sm twin-table">
          <thead>
            <tr className="border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
              <th className="sticky left-0 z-10 border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-left font-semibold text-[var(--twin-ink)]">
                机房
              </th>
              {templateItems.map((it, hi) => (
                <th key={String(it.id || `h-${hi}`)} className="min-w-[120px] px-2 py-2 text-left font-medium text-[var(--twin-body)]">
                  {it.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id} className="border-b border-[var(--twin-hairline)]">
                <td className="sticky left-0 z-10 border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 font-medium text-[var(--twin-ink)]">
                  {site.name}
                </td>
                {templateItems.map((it, ci) => {
                  const key = cellKey(site.id, String(it.id || ""));
                  const val = cells[key] ?? "";
                  const ft = String(it.fieldType || "").toUpperCase();
                  const opts = it.optionItems ?? [];
                  if (ft === "SELECT" && opts.length > 0) {
                    return (
                      <td key={`${site.id}-${it.id || ci}`} className="px-1 py-1 align-top">
                        <select
                          className="w-full min-w-[100px] rounded-lg border border-[var(--app-color-border-default)] bg-[var(--twin-canvas)] px-2 py-1.5 text-sm"
                          value={val}
                          disabled={readOnly}
                          onChange={(e) => onCellChange(key, e.target.value)}
                        >
                          <option value=""></option>
                          {opts.map((o) => (
                            <option key={String(o.id ?? o.label)} value={o.label}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={`${site.id}-${it.id || ci}`} className="px-1 py-1 align-top">
                      <input
                        className="w-full min-w-[100px] rounded-lg border border-[var(--app-color-border-default)] bg-[var(--twin-canvas)] px-2 py-1.5 text-sm"
                        value={val}
                        disabled={readOnly}
                        onChange={(e) => onCellChange(key, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
