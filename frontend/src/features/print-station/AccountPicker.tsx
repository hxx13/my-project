import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { adminHttp } from "@/api/core/adminHttp";

/**
 * 打印者账号选择器。
 *
 * 为什么不复用 report-form 的 UserSelector：它 onChange 回传的是**昵称**，
 * 而工位要绑的是 sys_user.id（STAFF_xxx）；它的 id 字段还声明成了 number，
 * 与后端实际返回的字符串不符。改它会影响报表填写页，所以这里单独做一个 id 版。
 *
 * 接口复用现成的 /api/admin/report-fill/users/search（只查 sys_user，不掺人员档案）。
 */
export interface AccountOption {
  id: string;
  label: string;
}

interface SearchRow {
  id?: unknown;
  username?: unknown;
  displayNickname?: unknown;
}

export function AccountPicker({
  value,
  onChange,
  placeholder = "搜索账号…",
}: {
  value: AccountOption | null;
  onChange: (v: AccountOption | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await adminHttp.get("/report-fill/users/search", { params: { keyword: q } });
      const list = (res.data?.data ?? []) as SearchRow[];
      setRows(
        (Array.isArray(list) ? list : [])
          .map((r) => {
            const id = r.id == null ? "" : String(r.id);
            const username = r.username == null ? "" : String(r.username);
            const nick = r.displayNickname == null ? "" : String(r.displayNickname);
            return { id, label: nick || username || id };
          })
          .filter((r) => r.id !== ""),
      );
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void doSearch(keyword), 300);
    return () => clearTimeout(t);
  }, [keyword, doSearch]);

  const inputCls =
    "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[13px] text-[var(--app-color-text-primary)] outline-none";

  return (
    <div ref={boxRef} className="relative">
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[13px]">
          <span className="truncate text-[var(--app-color-text-primary)]">{value.label}</span>
          <button
            type="button"
            aria-label="清除"
            className="ml-auto shrink-0 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-error)]"
            onClick={() => onChange(null)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
          <input
            className={inputCls + " pl-7"}
            placeholder={placeholder}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </div>
      )}

      {open && !value ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-[12px] text-[var(--app-color-text-tertiary)]">搜索中…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--app-color-text-tertiary)]">
              {keyword.trim() ? "没有匹配的账号" : "输入用户名或昵称开始搜索"}
            </div>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-[13px] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
                onClick={() => {
                  onChange(r);
                  setKeyword("");
                  setOpen(false);
                }}
              >
                {r.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default AccountPicker;
