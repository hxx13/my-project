import { useState, useMemo, useRef, useEffect, createElement } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ADMIN_NAV_REGISTRY } from "@/features/admin/adminNavRegistry";
import { appendAdminNavRecent, resolveAdminNavUserId } from "@/features/admin/adminNavPersonalization";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY } from "@/features/admin/adminTelemetryNav";
import type { AdminCommandPaletteItem } from "@/features/admin/buildAdminNavModel";

function orderedGroupTitles(items: AdminCommandPaletteItem[]): string[] {
  const registryOrder = ADMIN_NAV_REGISTRY.map((g) => g.title);
  const present = new Set(items.map((i) => i.groupTitle));
  const out: string[] = [];
  for (const t of registryOrder) {
    if (present.has(t)) out.push(t);
  }
  for (const t of present) {
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export function AdminCommandPalette({
  open, onOpenChange, items, starredItems = [], recentItems = [], pathname, search,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AdminCommandPaletteItem[];
  starredItems?: AdminCommandPaletteItem[];
  recentItems?: AdminCommandPaletteItem[];
  pathname: string;
  search: string;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const groupOrder = useMemo(() => orderedGroupTitles(items), [items]);

  const byGroup = useMemo(() => {
    const m = new Map<string, AdminCommandPaletteItem[]>();
    for (const it of items) {
      if (!m.has(it.groupTitle)) m.set(it.groupTitle, []);
      m.get(it.groupTitle)!.push(it);
    }
    return m;
  }, [items]);

  // 过滤逻辑
  const q = query.trim().toLowerCase();
  const matchItem = (it: AdminCommandPaletteItem) => {
    if (!q) return true;
    const haystack = [it.label, it.path, it.groupTitle, ...(it.alias ?? [])].join(" ").toLowerCase();
    return haystack.includes(q);
  };

  const filteredStarred = q ? starredItems.filter(matchItem) : starredItems;
  const filteredRecent = q ? recentItems.filter(matchItem) : recentItems;
  const filteredGroups = groupOrder.map((title) => {
    const list = (byGroup.get(title) ?? []).filter(matchItem);
    return { title, list };
  }).filter((g) => g.list.length > 0);

  // 展平所有可选项（用于键盘导航）
  const flatResults = useMemo(() => {
    const out: (AdminCommandPaletteItem & { _section: string })[] = [];
    for (const it of filteredStarred) out.push({ ...it, _section: "⭐ 收藏" });
    for (const it of filteredRecent) out.push({ ...it, _section: "🕐 最近" });
    for (const g of filteredGroups) {
      for (const it of g.list) out.push({ ...it, _section: g.title });
    }
    return out;
  }, [filteredStarred, filteredRecent, filteredGroups]);

  // 重置选中项
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const run = (it: AdminCommandPaletteItem) => {
    if (resolveAdminNavUserId()) appendAdminNavRecent(it.path);
    const dest = toAdminRoutePath(it.path);
    if (it.telemetry) {
      try {
        const returnKey = it.telemetryReturnStorageKey ?? ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY;
        sessionStorage.setItem(returnKey, `${pathname}${search}`);
      } catch { /* ignore */ }
      void navigate(dest, { state: { returnTo: `${pathname}${search}` } });
    } else {
      void navigate(dest);
    }
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatResults[selectedIdx]) run(flatResults[selectedIdx]);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  const hasResults = flatResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        overlayClassName="z-[var(--z-command)] bg-black/60"
        className="z-[var(--z-command)] max-h-[85vh] w-[min(100vw-1.5rem,36rem)] overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl"
        onPointerDownOutside={() => onOpenChange(false)}
      >
        <DialogTitle className="sr-only">搜索并跳转后台页面</DialogTitle>
        <DialogDescription className="sr-only">输入页面名称或路径筛选，↑↓ 选择，Enter 跳转。</DialogDescription>

        {/* 搜索框 */}
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-neutral-400"
            placeholder="搜索页面标题、路径或关键词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* 结果列表 */}
        <div className="max-h-[min(60vh,360px)] overflow-y-auto overflow-x-hidden p-1" onKeyDown={handleKeyDown}>
          {!hasResults && (
            <div className="py-6 text-center text-sm text-neutral-400">无匹配结果；尝试其他关键词</div>
          )}

          {filteredStarred.length > 0 && (
            <div className="mb-1">
              <div className="px-2 py-1.5 text-xs font-medium text-neutral-400">⭐ 收藏</div>
              {filteredStarred.map((it) => {
                const idx = flatResults.findIndex((f) => f.id === it.id && f._section === "⭐ 收藏");
                return renderRow(it, idx, selectedIdx, run);
              })}
            </div>
          )}

          {filteredRecent.length > 0 && (
            <div className="mb-1">
              <div className="px-2 py-1.5 text-xs font-medium text-neutral-400">🕐 最近</div>
              {filteredRecent.map((it) => {
                const idx = flatResults.findIndex((f) => f.id === it.id && f._section === "🕐 最近");
                return renderRow(it, idx, selectedIdx, run);
              })}
            </div>
          )}

          {filteredGroups.map((g) => (
            <div key={g.title} className="mb-1">
              <div className="px-2 py-1.5 text-xs font-medium text-neutral-400">{g.title}</div>
              {g.list.map((it) => {
                const idx = flatResults.findIndex((f) => f.id === it.id && f._section === g.title);
                return renderRow(it, idx, selectedIdx, run);
              })}
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-500">
          ↑↓ 选择 · Enter 跳转 · Esc 关闭
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderRow(
  it: AdminCommandPaletteItem,
  idx: number,
  selectedIdx: number,
  onPick: (it: AdminCommandPaletteItem) => void,
) {
  const isSelected = idx === selectedIdx;
  return (
    <div
      key={`${it.id}-${it.groupTitle}`}
      role="option"
      aria-selected={isSelected}
      className={`cursor-pointer rounded-md py-2.5 px-2 transition-colors flex items-center gap-3 text-neutral-800 ${
        isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onPick(it);
      }}
      onMouseEnter={() => {
        // 鼠标 hover 更新选中下标，让键盘导航跟上
        const el = document.activeElement;
        if (el && (el as HTMLElement).tagName === "INPUT") {
          // 仅在输入框焦点时更新
          (window as any).__paletteSelectedIdx = idx;
        }
      }}
    >
      {it.icon && createElement(it.icon, { className: "h-4 w-4 shrink-0 text-neutral-400" })}
      <div className="min-w-0 flex-1">
        <span className="font-medium text-sm">{it.label}</span>
        <span className="ml-2 text-xs text-neutral-400">{it.groupTitle}</span>
      </div>
      <span className="shrink-0 text-[10px] text-neutral-300 font-mono">{it.path}</span>
    </div>
  );
}
