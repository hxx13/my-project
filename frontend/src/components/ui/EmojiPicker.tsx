/**
 * EmojiPicker — 通用 emoji 选择弹层（业务无关）
 *
 * 内容 = 搜索框（按关键词/emoji 过滤，跨全部分类）+ 分类切换 + emoji 网格。
 * 点击单元格即 onChange(emoji) 并关闭。只依赖 emojiCatalog / Portal / cn，
 * 不 import 任何业务 api，供资产、物品台账等模块复用。
 */

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";
import { emojiCatalog, filterEmojis } from "./emojiCatalog";

export type EmojiPickerProps = {
  value?: string;
  onChange: (emoji: string) => void;
  onClose: () => void;
};

export default function EmojiPicker({ value, onChange, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const [catKey, setCatKey] = useState(emojiCatalog[0]?.key ?? "");

  const items = useMemo(() => filterEmojis(query, catKey), [query, catKey]);
  const searching = query.trim().length > 0;

  const pick = (emoji: string) => {
    onChange(emoji);
    onClose();
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2.5 flex shrink-0 items-center justify-between">
            <h3 className="text-base font-semibold text-[var(--twin-ink)]">选择图标</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-twin-sm text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 flex shrink-0 items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索图标（如：椅子 / 显微镜 / 冰箱）"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="shrink-0 text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                aria-label="清除搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!searching && (
            <div className="mb-2 flex shrink-0 flex-wrap gap-1">
              {emojiCatalog.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCatKey(c.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                    catKey === c.key
                      ? "border-[var(--twin-link-deep)] bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)] font-medium text-[var(--twin-link-deep)]"
                      : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-[var(--twin-mute)]">
                没有匹配的图标
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1.5">
                {items.map((it, i) => {
                  const active = value === it.emoji;
                  return (
                    <button
                      key={`${it.emoji}-${i}`}
                      type="button"
                      onClick={() => pick(it.emoji)}
                      title={it.keywords}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-twin-sm border text-2xl leading-none transition",
                        active
                          ? "border-[var(--twin-link-deep)] bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)] ring-2 ring-[color-mix(in_srgb,var(--twin-link-deep)_30%,transparent)]"
                          : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] hover:bg-[var(--twin-canvas)] hover:ring-1 hover:ring-[var(--twin-hairline-strong)]"
                      )}
                    >
                      {it.emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
