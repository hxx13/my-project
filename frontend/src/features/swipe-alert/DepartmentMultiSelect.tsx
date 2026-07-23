import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { fetchDahuaDepartments, type DahuaDepartmentRow } from "@/api/twinApi";
import { cn } from "@/lib/utils";

interface Props {
  selected: string[];                        // selected department names
  onChange: (names: string[]) => void;       // callback
  className?: string;
}

/** Build a flat sorted unique list from paginated Dahua department tree. */
async function loadAllDepartments(keyword: string): Promise<string[]> {
  const { list } = await fetchDahuaDepartments(1, 500, keyword.trim() || "");
  const names = new Set<string>();
  for (const row of list) {
    const n = (row.deptName || row.name || "").trim();
    if (n) names.add(n);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "zh"));
}

export function DepartmentMultiSelect({ selected, onChange, className }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async (kw = "") => {
    setLoading(true);
    try {
      setAll(await loadAllDepartments(kw));
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = keyword.trim()
    ? all.filter((n) => n.includes(keyword.trim()))
    : all;

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const removeSelected = (name: string) => {
    onChange(selected.filter((n) => n !== name));
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected pills */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800"
            >
              {name}
              <button
                type="button"
                onClick={() => removeSelected(name)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-violet-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + dropdown */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            className="flex-1 text-sm outline-none placeholder:text-neutral-400"
            placeholder={selected.length ? "继续搜索部门…" : "搜索部门名称…"}
            value={keyword}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setKeyword(e.target.value);
              setOpen(true);
              load(e.target.value);
            }}
          />
          {loading && <span className="text-xs text-neutral-400">加载中…</span>}
        </div>

        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            {/* Dropdown */}
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-neutral-500">
                  {loading ? "加载中…" : "无匹配部门"}
                </p>
              ) : (
                filtered.map((name) => {
                  const checked = selected.includes(name);
                  return (
                    <label
                      key={name}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-neutral-50",
                        checked && "bg-violet-50"
                      )}
                    >
                      <AdminSwitchScaled size="sm" checked={checked} onChange={() => toggle(name)} />
                      {name}
                    </label>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
