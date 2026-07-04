import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { WatchlistVariableCatalog, WatchlistVariableCatalogEntry } from "@/features/telemetry-insights/buildWatchlistVariableCatalog";

export type TelemetryVariablePickerProps = {
  catalog: WatchlistVariableCatalog;
  selected: string[];
  onChange: (variableNames: string[]) => void;
  disabled?: boolean;
};

const METRIC_FILTER_OPTIONS = [
  { code: "", label: "全部类型" },
  { code: "TEMP", label: "温度" },
  { code: "HUM", label: "湿度" },
  { code: "PRESS", label: "压差" },
] as const;

function matchesMetricFilter(code: string, filter: string): boolean {
  if (!filter) return true;
  const mk = code.toUpperCase();
  if (filter === "TEMP") return mk.includes("TEMP") || mk === "T";
  if (filter === "HUM") return mk.includes("HUM") || mk.includes("RH") || mk === "H";
  if (filter === "PRESS") return mk.includes("PRESS") || mk.includes("PA") || mk === "P";
  return mk.includes(filter);
}

function groupKey(entry: WatchlistVariableCatalogEntry): string {
  return `${entry.floorCode || "—"}|${entry.bundleCode || "—"}`;
}

function groupLabel(floor: string, bundleCode: string, bundleDisplayName: string): string {
  const floorPart = floor && floor !== "—" ? floor : "未分楼层";
  const bundlePart = bundleDisplayName || bundleCode || "未分前缀";
  return `${floorPart} · ${bundlePart}`;
}

export function TelemetryVariablePicker({ catalog, selected, onChange, disabled }: TelemetryVariablePickerProps) {
  const [floorFilter, setFloorFilter] = useState("");
  const [bundleFilter, setBundleFilter] = useState("");
  const [metricFilter, setMetricFilter] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.entries.filter((e) => {
      if (floorFilter && e.floorCode !== floorFilter) return false;
      if (bundleFilter && e.bundleCode !== bundleFilter) return false;
      if (!matchesMetricFilter(e.metricKindCode, metricFilter)) return false;
      if (!q) return true;
      return (
        e.displayLabel.toLowerCase().includes(q) ||
        e.variableName.toLowerCase().includes(q) ||
        e.roomCanonical.toLowerCase().includes(q)
      );
    });
  }, [catalog.entries, floorFilter, bundleFilter, metricFilter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: WatchlistVariableCatalogEntry[] }>();
    for (const e of filtered) {
      const key = groupKey(e);
      const label = groupLabel(e.floorCode || "—", e.bundleCode, e.bundleDisplayName);
      const g = map.get(key) ?? { label, items: [] };
      g.items.push(e);
      map.set(key, g);
    }
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, "zh-Hans-CN", { numeric: true }));
  }, [filtered]);

  const toggle = (vn: string) => {
    if (disabled) return;
    const lower = vn.toLowerCase();
    if (selectedSet.has(lower)) {
      onChange(selected.filter((s) => s.toLowerCase() !== lower));
    } else {
      onChange([...selected, vn]);
    }
  };

  const toggleGroup = (items: WatchlistVariableCatalogEntry[]) => {
    if (disabled) return;
    const allSelected = items.every((e) => selectedSet.has(e.variableName.toLowerCase()));
    if (allSelected) {
      const remove = new Set(items.map((e) => e.variableName.toLowerCase()));
      onChange(selected.filter((s) => !remove.has(s.toLowerCase())));
    } else {
      const next = new Set(selected.map((s) => s.toLowerCase()));
      const out = [...selected];
      for (const e of items) {
        if (!next.has(e.variableName.toLowerCase())) {
          out.push(e.variableName);
          next.add(e.variableName.toLowerCase());
        }
      }
      onChange(out);
    }
  };

  const selectCls =
    "rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1.5 text-xs text-[var(--app-color-text-primary)]";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[var(--app-color-text-muted)]">楼层</span>
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} className={selectCls}>
            <option value="">全部楼层</option>
            {catalog.floors.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--app-color-text-muted)]">分区/前缀</span>
          <select value={bundleFilter} onChange={(e) => setBundleFilter(e.target.value)} className={selectCls}>
            <option value="">全部分区</option>
            {Array.from(
              catalog.entries.reduce<Map<string, string>>((acc, e) => {
                if (e.bundleCode) acc.set(e.bundleCode, e.bundleDisplayName || e.bundleCode);
                return acc;
              }, new Map())
            )
              .sort((a, b) => a[1].localeCompare(b[1], "zh-Hans-CN"))
              .map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--app-color-text-muted)]">指标类型</span>
          <select value={metricFilter} onChange={(e) => setMetricFilter(e.target.value)} className={selectCls}>
            {METRIC_FILTER_OPTIONS.map((o) => (
              <option key={o.code || "all"} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-xs">
          <span className="mb-1 block text-[var(--app-color-text-muted)]">搜索</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-color-text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="展示名 / 变量名 / 房间"
              className={`${selectCls} w-full pl-7`}
            />
          </span>
        </label>
      </div>

      <div className="text-[10px] text-[var(--app-color-text-muted)]">
        已选 {selected.length} 个变量 · 共 {filtered.length} 条可选（来源 WinCC 变量导入）
      </div>

      <div className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-2">
        {groups.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--app-color-text-muted)]">
            无匹配变量。请先在「WinCC 变量导入」维护展示映射并启用测量点。
          </div>
        ) : (
          groups.map(([key, group]) => {
            const isCollapsed = collapsed[key] ?? false;
            const groupAll = group.items.every((e) => selectedSet.has(e.variableName.toLowerCase()));
            const groupSome = group.items.some((e) => selectedSet.has(e.variableName.toLowerCase()));
            return (
              <div key={key} className="rounded-[var(--app-radius-control)] border border-[var(--app-color-border-subtle)]">
                <div className="flex items-center gap-2 bg-[var(--app-color-surface-raised)] px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [key]: !isCollapsed }))}
                    className="text-[var(--app-color-text-muted)]"
                    aria-label={isCollapsed ? "展开" : "折叠"}
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <input
                    type="checkbox"
                    checked={groupAll}
                    ref={(el) => {
                      if (el) el.indeterminate = !groupAll && groupSome;
                    }}
                    disabled={disabled}
                    onChange={() => toggleGroup(group.items)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex-1 text-xs font-medium text-[var(--app-color-text-primary)]">{group.label}</span>
                  <span className="text-[10px] text-[var(--app-color-text-muted)]">{group.items.length}</span>
                </div>
                {!isCollapsed ? (
                  <ul className="divide-y divide-[var(--app-color-border-subtle)]">
                    {group.items.map((e) => {
                      const checked = selectedSet.has(e.variableName.toLowerCase());
                      return (
                        <li key={e.variableName}>
                          <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-[var(--app-color-surface-raised)]">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggle(e.variableName)}
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-medium text-[var(--app-color-text-primary)]">
                                {e.displayLabel}
                              </span>
                              <span className="block truncate font-mono text-[10px] text-[var(--app-color-text-muted)]">
                                {e.variableName}
                              </span>
                              <span className="text-[10px] text-[var(--app-color-text-secondary)]">
                                {e.metricKindLabel}
                                {e.roomCanonical ? ` · ${e.roomCanonical}` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
