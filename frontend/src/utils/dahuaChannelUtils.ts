import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { DahuaDeviceChannelRow } from "@/api/twinApi";

/** 与后端、大华缓存表比较时统一 trim，避免「选中后丢名」的隐性不匹配 */
export function normalizeChannelCode(code: string | null | undefined): string {
  return String(code ?? "").trim();
}

/** 从列表行构建 code(规范化) -> 展示名（无名称时用编码兜底，避免空白） */
export function labelForChannelRow(row: DahuaDeviceChannelRow): string {
  const code = normalizeChannelCode(row.channelCode);
  const name = (row.channelName || "").trim();
  if (!code) return name || "—";
  return name || `未命名 / ${code}`;
}

export type FetchChannelsFn = (p: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) => Promise<{ list?: DahuaDeviceChannelRow[]; total?: number }>;

/**
 * 按已保存的通道编码补全展示名；关键字未命中时翻页扫描缓存，避免分页「加载更多」导致已选通道显示未知。
 */
export async function resolveChannelLabelsByCodes(
  codes: string[],
  fetchChannels: FetchChannelsFn
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const pending = new Set(codes.map(normalizeChannelCode).filter(Boolean));

  for (const code of [...pending]) {
    try {
      const res = await fetchChannels({ page: 1, pageSize: 100, keyword: code });
      const list = res.list || [];
      const row = list.find((r) => normalizeChannelCode(r.channelCode) === code);
      if (row) {
        out[code] = labelForChannelRow(row);
        pending.delete(code);
      }
    } catch {
      // 单码检索失败时留给全量翻页
    }
  }

  if (pending.size > 0) {
    let page = 1;
    const pageSize = 200;
    for (let guard = 0; guard < 80 && pending.size > 0; guard += 1) {
      try {
        const res = await fetchChannels({ page, pageSize, keyword: "" });
        const list = res.list || [];
        if (!list.length) break;
        for (const row of list) {
          const code = normalizeChannelCode(row.channelCode);
          if (pending.has(code)) {
            out[code] = labelForChannelRow(row);
            pending.delete(code);
          }
        }
        const total = res.total ?? 0;
        if (list.length < pageSize || (total > 0 && page * pageSize >= total)) break;
        page += 1;
      } catch {
        break;
      }
    }
  }

  for (const code of pending) {
    out[code] = labelForChannelRow({ channelCode: code, channelName: "" } as DahuaDeviceChannelRow);
  }
  return out;
}

/** 将解析结果合并进 channelNameMap（用于已选通道标签展示） */
export function mergeChannelLabelMap(
  prev: Record<string, string>,
  labels: Record<string, string>
): Record<string, string> {
  if (!Object.keys(labels).length) return prev;
  return { ...prev, ...labels };
}

/**
 * 当已选通道编码变化时，自动补全 channelNameMap，避免未加载分页项显示为未知通道。
 */
export function useHydrateChannelNameMap(
  selectedCodes: string[],
  channelNameMap: Record<string, string>,
  setChannelNameMap: Dispatch<SetStateAction<Record<string, string>>>,
  fetchChannels: FetchChannelsFn,
  enabled = true
) {
  const inflightRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const need = selectedCodes
      .map(normalizeChannelCode)
      .filter((c) => c && !channelNameMap[c]);
    const uniq = [...new Set(need)];
    if (!uniq.length) return;

    const ticket = ++inflightRef.current;
    void (async () => {
      const labels = await resolveChannelLabelsByCodes(uniq, fetchChannels);
      if (ticket !== inflightRef.current) return;
      setChannelNameMap((prev) => mergeChannelLabelMap(prev, labels));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随已选编码与缺失项触发
  }, [enabled, selectedCodes.join("\0"), channelNameMap, fetchChannels, setChannelNameMap]);
}
