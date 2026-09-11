import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

export interface SearchOption {
  /** 唯一键：人员=accountId */
  key: string;
  label: string;
  subtitle?: string;
}

/**
 * 抽屉内联「可搜索可选」下拉 —— 输入框 + 候选列表 + 点外关闭 + 选中回填。
 * `search` 由调用方注入：选人传各自的接口。
 */
export default function StudentSearchSelect({
  search, onPick, excludeKeys, placeholder = "搜索", emptyHint = "没有匹配项",
}: {
  search: (keyword: string) => Promise<SearchOption[]>;
  onPick: (opt: SearchOption) => void;
  excludeKeys?: string[];
  placeholder?: string;
  emptyHint?: string;
}) {
  const [kw, setKw] = useState("");
  const [rows, setRows] = useState<SearchOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  /** search 走 ref：调用方常传内联箭头函数，进依赖数组会每渲染重查 → 死循环 */
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  /** 空串也查一次：划分模式要一进来就看到本课题组名单，不是非得先打字 */
  useEffect(() => {
    let dead = false;
    const t = setTimeout(() => {
      setBusy(true);
      searchRef.current(kw.trim())
        /* 只备数据，**不在这里弹开**：否则抽屉一挂载（每次展开都重挂）搜索框就自己弹出来。
           弹开只由用户动作触发 —— onFocus / onChange。 */
        .then((list) => { if (!dead) setRows(list); })
        .catch(() => { if (!dead) setRows([]); })
        .finally(() => { if (!dead) setBusy(false); });
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [kw]);

  const excluded = new Set(excludeKeys ?? []);
  const shown = rows.filter((r) => r.key && !excluded.has(r.key));

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--student-canvas)] px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" />
        <input
          value={kw}
          onChange={(e) => { setKw(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--app-color-text-primary)] outline-none"
        />
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--app-color-text-tertiary)]" />}
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--student-canvas)] shadow-lg">
          {shown.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => { onPick(o); setKw(""); }}
              className="block w-full px-2 py-1.5 text-left text-[11px] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
            >
              {o.label}
              {o.subtitle ? <span className="ml-1 text-[10px] text-[var(--app-color-text-tertiary)]">{o.subtitle}</span> : null}
            </button>
          ))}
          {shown.length === 0 && !busy && (
            <div className="px-2 py-2 text-[10px] text-[var(--app-color-text-tertiary)]">{emptyHint}</div>
          )}
        </div>
      )}
    </div>
  );
}
