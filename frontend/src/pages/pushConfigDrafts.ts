/**
 * 推送配置页的「渠道草稿」纯逻辑。
 *
 * 回归背景：页面每次保存（渠道、接收人）都会 invalidate → 重新拉 /admin/notify-source，
 * 原来 initDrafts 用服务端数据整体重建草稿，于是**任何一次保存都会把用户在其它渠道上
 * 刚拨动、还没点保存的开关和模板一起打回服务端默认值**（服务端默认多为开启，
 * 看起来就是「点保存之后所有开关全被打开」）。
 *
 * 现在改为只补不覆盖：已有草稿保留本地值，新渠道补上，消失的渠道剔除。
 */

/** 服务端通道配置里草稿用得上的字段（宽松结构，页面的 DTO 可直接传入） */
export interface ChannelDraftSource {
  id: number;
  enabled: boolean;
  titleTpl: string | null;
  contentTpl: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  rateLimitSeconds: number | null;
}

/** Per-channel editable draft held in local state while the user edits. */
export interface ChannelDraft {
  titleTpl: string;
  contentTpl: string;
  enabled: boolean;
  quietStart: string;
  quietEnd: string;
  rateLimitSeconds: number;
}

export function toChannelDraft(ch: ChannelDraftSource): ChannelDraft {
  return {
    titleTpl: ch.titleTpl ?? "",
    contentTpl: ch.contentTpl ?? "",
    enabled: ch.enabled,
    quietStart: ch.quietStart ?? "",
    quietEnd: ch.quietEnd ?? "",
    rateLimitSeconds: ch.rateLimitSeconds ?? 300,
  };
}

export function mergeChannelDrafts(
  prev: Record<number, Record<number, ChannelDraft>>,
  list: Array<{ sourceId: number; channels: ChannelDraftSource[] }>,
): Record<number, Record<number, ChannelDraft>> {
  const next: Record<number, Record<number, ChannelDraft>> = {};
  for (const s of list) {
    const prevSource = prev[s.sourceId] ?? {};
    const cur: Record<number, ChannelDraft> = {};
    for (const ch of s.channels) {
      cur[ch.id] = prevSource[ch.id] ?? toChannelDraft(ch);
    }
    next[s.sourceId] = cur;
  }
  return next;
}
