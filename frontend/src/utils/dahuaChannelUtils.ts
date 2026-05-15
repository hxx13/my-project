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

/**
 * 按已保存的通道编码补全展示名（keyword 可命中 channel_code），用于编辑已存规则时不在当前分页里的通道。
 */
export async function resolveChannelLabelsByCodes(
  codes: string[],
  fetchChannels: (p: {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) => Promise<{ list?: DahuaDeviceChannelRow[] }>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = [...new Set(codes.map(normalizeChannelCode).filter(Boolean))];
  for (const code of uniq) {
    try {
      const res = await fetchChannels({ page: 1, pageSize: 100, keyword: code });
      const list = res.list || [];
      const row = list.find((r) => normalizeChannelCode(r.channelCode) === code);
      if (row) {
        out[code] = labelForChannelRow(row);
      } else {
        out[code] = `未知通道 / ${code}`;
      }
    } catch {
      out[code] = code;
    }
  }
  return out;
}
