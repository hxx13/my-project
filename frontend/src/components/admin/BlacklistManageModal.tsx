import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, ShieldAlert, Trash2, User, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { addToBlacklist, fetchBlacklist, removeFromBlacklist, searchPersonnel } from "@/api/twinApi";
import { normalizePersonnelRecord, type PersonnelRecordView } from "@/utils/personnelRecord";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 添加/删除成功后回调（刷新列表等） */
  onChanged?: () => void;
};

export function BlacklistManageModal({ open, onClose, onChanged }: Props) {
  const [personKeyword, setPersonKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<PersonnelRecordView[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PersonnelRecordView | null>(null);
  const [reason, setReason] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const { data: blacklistData = [], refetch: refetchBlacklist } = useQuery({
    queryKey: ["twinBlacklist"],
    queryFn: fetchBlacklist,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setPersonKeyword("");
      setSearchResults([]);
      setSelected(null);
      setReason("");
    }
  }, [open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runSearch = async (keyword: string) => {
    const kw = keyword.trim();
    if (!kw) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const rows = await searchPersonnel(kw);
      const list = (Array.isArray(rows) ? rows : [])
        .map((r) => normalizePersonnelRecord(r as Record<string, unknown>))
        .filter((p): p is PersonnelRecordView => p != null && Boolean(p.userId));
      setSearchResults(list);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const onKeywordChange = (val: string) => {
    setPersonKeyword(val);
    if (selected && val !== `${selected.name} (${selected.userId})`) {
      setSelected(null);
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (!val.trim()) {
        setSearchResults([]);
        return;
      }
      void runSearch(val);
    }, 250);
  };

  const pickPerson = (p: PersonnelRecordView) => {
    setSelected(p);
    setPersonKeyword(`${p.name} (${p.userId})`);
    setSearchResults([]);
  };

  const handleAdd = async () => {
    if (!selected?.userId) {
      toast.error("请先输入姓名或工号并选择人员");
      return;
    }
    try {
      await addToBlacklist({
        userId: selected.userId,
        name: selected.name,
        reason: reason.trim(),
      });
      toast.success("已加入黑名单");
      setPersonKeyword("");
      setSelected(null);
      setReason("");
      await refetchBlacklist();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeFromBlacklist(userId);
      await refetchBlacklist();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失败");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="flex w-[min(600px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-800">
            <ShieldAlert className="h-5 w-5 text-rose-500" />
            系统风控黑名单
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-100 bg-slate-50/50 p-4">
          <div ref={searchWrapRef} className="relative">
            <label className="mb-1 block text-[11px] font-bold text-slate-500">人员检索</label>
            <input
              type="text"
              placeholder="输入姓名或学工号，自动匹配…"
              value={personKeyword}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch(personKeyword);
              }}
              onChange={(e) => onKeywordChange(e.target.value)}
            />
            {searching ? <p className="mt-1 text-[10px] text-slate-400">检索中…</p> : null}
            {searchResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[220px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {searchResults.map((p) => {
                  const headSrc = resolvePersonnelAvatarUrl(p.head);
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-slate-50"
                      onClick={() => pickPerson(p)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                        {headSrc ? (
                          <img src={headSrc} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-4 w-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-900">{p.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">{p.userId}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{p.groupName}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {selected ? (
            <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/80 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white">
                <Check className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-indigo-600">已锁定学工号</p>
                <p className="text-sm font-medium text-slate-900">
                  {selected.name}{" "}
                  <span className="ml-1 font-mono text-xs text-slate-500">({selected.userId})</span>
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="屏蔽原因（选填）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-black"
            >
              <Plus className="h-4 w-4" /> 添加
            </button>
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto p-4">
          {blacklistData.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">暂无黑名单数据</p>
          ) : (
            <div className="flex flex-col gap-2">
              {blacklistData.map((item: { userId: string; name: string; reason?: string }) => (
                <div
                  key={item.userId}
                  className="group flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/30 p-3 hover:bg-rose-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{item.name}</span>
                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                        {item.userId}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.reason || "未填写原因"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(item.userId)}
                    className="rounded-lg p-2 text-rose-400 opacity-70 transition-all hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
