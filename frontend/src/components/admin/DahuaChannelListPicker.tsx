import { useEffect, useMemo, useState } from "react";
import {
  fetchDahuaDeviceChannels,
  type DahuaDeviceChannelRow,
} from "@/api/twinApi";
import {
  normalizeChannelCode,
  resolveChannelLabelsByCodes,
  type FetchChannelsFn,
} from "@/utils/dahuaChannelUtils";
import { cn } from "@/lib/utils";

export interface ChannelRemarkCategory {
  id: number;
  name: string;
}

interface Props {
  /** 已选通道编码（展示时统一 trim） */
  selected: string[];
  /** 返回规范化后的通道编码列表 */
  onChange: (codes: string[]) => void;
  /** 拉取通道列表的函数，默认取大华元数据通道 */
  fetchChannels?: FetchChannelsFn;
  /** 可选：通道备注分类，传入后在「可选通道」列上方渲染分类筛选 */
  remarkCategories?: ChannelRemarkCategory[];
  title?: string;
  hint?: string;
  /** 每个实例唯一，用于 DOM key 去重 */
  idPrefix: string;
  className?: string;
  /** 左右两列滚动列表的最大高度 */
  listMaxHeightClass?: string;
}

/**
 * 双列门禁通道选择器：左侧「可选通道」、右侧「已选通道」，各带独立搜索框。
 * 与 dahua-swing-rules 页面一致，全量加载通道后本地过滤，避免分页搜索丢失已选项。
 */
export function DahuaChannelListPicker({
  selected,
  onChange,
  fetchChannels = fetchDahuaDeviceChannels,
  remarkCategories,
  title,
  hint,
  idPrefix,
  className,
  listMaxHeightClass = "max-h-64",
}: Props) {
  const [options, setOptions] = useState<DahuaDeviceChannelRow[]>([]);
  const [labelExtra, setLabelExtra] = useState<Record<string, string>>({});
  const [availKeyword, setAvailKeyword] = useState("");
  const [pickedKeyword, setPickedKeyword] = useState("");
  const [remarkId, setRemarkId] = useState<number | "">("");

  const pickedCodes = selected.map(normalizeChannelCode).filter(Boolean);

  /* 全量加载通道（翻页去重） */
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const all: DahuaDeviceChannelRow[] = [];
        const pageSize = 200;
        for (let page = 1; page <= 20; page++) {
          const res = await fetchChannels({ page, pageSize, keyword: "" });
          const list = res.list || [];
          all.push(...list);
          if (list.length < pageSize) break;
        }
        if (!active) return;
        const dedup = new Map<string, DahuaDeviceChannelRow>();
        for (const ch of all) {
          const code = normalizeChannelCode(ch.channelCode);
          if (!code) continue;
          if (!dedup.has(code)) dedup.set(code, ch);
        }
        setOptions(Array.from(dedup.values()));
      } catch {
        if (active) setOptions([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次挂载全量加载
  }, [fetchChannels]);

  /* 已选但不在本地列表中的编码，补全展示名 */
  useEffect(() => {
    const known = new Set(
      options.map((ch) => normalizeChannelCode(ch.channelCode)).filter(Boolean)
    );
    const need = [...new Set(pickedCodes)].filter((c) => !known.has(c));
    if (need.length === 0) return;
    void (async () => {
      const resolved = await resolveChannelLabelsByCodes(need, fetchChannels);
      setLabelExtra((prev) => ({ ...prev, ...resolved }));
    })();
  }, [pickedCodes.join("\0"), options, fetchChannels]);

  const nameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const ch of options) {
      const code = normalizeChannelCode(ch.channelCode);
      if (!code) continue;
      const name = (ch.channelName || "").trim();
      if (!m.has(code)) m.set(code, name || `未命名 / ${code}`);
    }
    for (const [code, label] of Object.entries(labelExtra)) {
      if (code && !m.has(code)) m.set(code, label);
    }
    return m;
  }, [options, labelExtra]);

  const matches = (code: string, name: string, kw: string) => {
    if (!kw) return true;
    return code.toLowerCase().includes(kw) || name.toLowerCase().includes(kw);
  };

  const available = options.filter((ch) => {
    const code = normalizeChannelCode(ch.channelCode);
    if (!code) return false;
    if (pickedCodes.includes(code)) return false;
    if (remarkId !== "" && ch.remarkCategoryId !== remarkId) return false;
    return matches(code, (ch.channelName || "").trim(), availKeyword.trim().toLowerCase());
  });

  const picked = pickedCodes.filter((code) =>
    matches(code, nameByCode.get(code) || "", pickedKeyword.trim().toLowerCase())
  );

  const toggle = (code: string, add: boolean) => {
    const normalized = normalizeChannelCode(code);
    if (!normalized) return;
    if (add) {
      if (!pickedCodes.includes(normalized)) onChange([...pickedCodes, normalized]);
    } else {
      onChange(pickedCodes.filter((c) => c !== normalized));
    }
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {title ? <div className="shrink-0 text-sm text-[var(--twin-body)]">{title}</div> : null}
      {hint ? <p className="shrink-0 text-xs text-[var(--twin-mute)]">{hint}</p> : null}
      <div className="flex gap-2">
        {/* 左侧：可选通道 */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="shrink-0 text-xs text-[var(--twin-mute)]">可选通道</div>
          {remarkCategories && remarkCategories.length > 0 && (
            <select
              className="h-8 w-full shrink-0 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
              value={remarkId}
              onChange={(e) => setRemarkId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">全部分类</option>
              {remarkCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            className="h-8 w-full shrink-0 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
            placeholder="搜索可选门"
            value={availKeyword}
            onChange={(e) => setAvailKeyword(e.target.value)}
          />
          <div className={cn("overflow-auto rounded border border-[var(--twin-hairline)] p-1", listMaxHeightClass)}>
            {available.length === 0 ? (
              <div className="p-2 text-center text-xs text-[var(--twin-mute)]">无可选通道</div>
            ) : (
              available.map((ch) => {
                const code = normalizeChannelCode(ch.channelCode);
                if (!code) return null;
                const name = (ch.channelName || "未命名通道") + " / " + code;
                return (
                  <button
                    key={`${idPrefix}-avail-${ch.id}`}
                    type="button"
                    onClick={() => toggle(code, true)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  >
                    <span className="shrink-0 font-bold text-indigo-600">＋</span>
                    <span className="truncate">{name}</span>
                    {ch.remarkCategoryName ? (
                      <span className="shrink-0 text-[10px] text-[var(--twin-mute)]">[{ch.remarkCategoryName}]</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
        {/* 右侧：已选通道 */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="shrink-0 text-xs text-[var(--twin-mute)]">已选通道（{picked.length}）</div>
          <input
            className="h-8 w-full shrink-0 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
            placeholder="搜索已选门"
            value={pickedKeyword}
            onChange={(e) => setPickedKeyword(e.target.value)}
          />
          <div className={cn("overflow-auto rounded border border-[var(--twin-hairline)] p-1", listMaxHeightClass)}>
            {picked.length === 0 ? (
              <div className="p-2 text-center text-xs text-[var(--twin-mute)]">尚未选择通道</div>
            ) : (
              picked.map((code) => {
                const name = nameByCode.get(code) || `未命名 / ${code}`;
                return (
                  <button
                    key={`${idPrefix}-picked-${code}`}
                    type="button"
                    onClick={() => toggle(code, false)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  >
                    <span className="shrink-0 font-bold text-red-500">×</span>
                    <span className="truncate">{name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
