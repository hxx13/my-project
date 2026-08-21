import { useEffect, useState } from "react";
import type { JSX } from "react";
import { fetchDahuaDepartments } from "@/api/twinApi";
import { MultiSelectField } from "./MultiSelectField";
import type { MultiSelectOption } from "./multiSelectModel";

type DepartmentMultiSelectProps = {
  selected: string[];
  onChange: (names: string[]) => void;
  disabled?: boolean;
  id?: string;
};

/**
 * 白名单部门多选。从大华部门树拉取扁平名称列表，交给主题化的 MultiSelectField 渲染，
 * 取代 swipe-alert 里硬编码 neutral/violet 色的旧版 DepartmentMultiSelect（不自带主题，搬进来会破相）。
 */
export function DepartmentMultiSelect({ selected, onChange, disabled, id }: DepartmentMultiSelectProps): JSX.Element {
  const [options, setOptions] = useState<MultiSelectOption<string>[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { list } = await fetchDahuaDepartments(1, 500, "");
        if (cancelled) return;
        const names = new Set<string>();
        for (const row of list) {
          const n = (row.deptName || row.name || "").trim();
          if (n) names.add(n);
        }
        setOptions(Array.from(names).sort((a, b) => a.localeCompare(b, "zh")).map((v) => ({ value: v, label: v })));
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <MultiSelectField id={id} options={options} value={selected} onChange={onChange} placeholder="不限" disabled={disabled} />;
}
