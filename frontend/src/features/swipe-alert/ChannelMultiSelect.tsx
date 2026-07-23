import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { fetchDahuaDeviceChannels, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { cn } from "@/lib/utils";

interface Props {
  selected: string[];                        // selected channel codes
  onChange: (codes: string[]) => void;       // callback
  className?: string;
}

interface ChannelEntry {
  code: string;
  name: string;
}

async function loadChannels(keyword: string): Promise<ChannelEntry[]> {
  const { list } = await fetchDahuaDeviceChannels({
    page: 1,
    pageSize: 500,
    keyword: keyword.trim() || undefined,
  });
  return list
    .filter((r) => r.channelCode)
    .map((r) => ({
      code: r.channelCode!,
      name: r.channelName || r.channelCode!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

export function ChannelMultiSelect({ selected, onChange, className }: Props) {
  const [all, setAll] = useState<ChannelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => { void doLoad(); }, []);

  const doLoad = async (kw = "") => {
    setLoading(true);
    try {
      setAll(await loadChannels(kw));
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = keyword.trim()
    ? all.filter(
        (c) =>
          c.name.includes(keyword.trim()) ||
          c.code.includes(keyword.trim())
      )
    : all;

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const removeSelected = (code: string) => {
    onChange(selected.filter((c) => c !== code));
  };

  const nameByCode = (code: string) => {
    const found = all.find((c) => c.code === code);
    return found ? found.name : code;
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected pills */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800"
            >
              {nameByCode(code)}
              <button
                type="button"
                onClick={() => removeSelected(code)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-200"
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
            placeholder={selected.length ? "继续搜索通道…" : "搜索通道名称或编码…"}
            value={keyword}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setKeyword(e.target.value);
              setOpen(true);
              doLoad(e.target.value);
            }}
          />
          {loading && <span className="text-xs text-neutral-400">加载中…</span>}
        </div>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-neutral-500">
                  {loading ? "加载中…" : "无匹配通道"}
                </p>
              ) : (
                filtered.map((ch) => {
                  const checked = selected.includes(ch.code);
                  return (
                    <label
                      key={ch.code}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-neutral-50",
                        checked && "bg-indigo-50"
                      )}
                    >
                      <AdminSwitchScaled size="sm" checked={checked} onChange={() => toggle(ch.code)} />
                      <span className="truncate">{ch.name}</span>
                      <span className="shrink-0 text-xs text-neutral-400">{ch.code}</span>
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
