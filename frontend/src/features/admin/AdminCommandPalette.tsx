import { useMemo, createElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ADMIN_NAV_REGISTRY } from "@/features/admin/adminNavRegistry";
import { appendAdminNavRecent } from "@/features/admin/adminNavPersonalization";
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
  const groupOrder = useMemo(() => orderedGroupTitles(items), [items]);

  const byGroup = useMemo(() => {
    const m = new Map<string, AdminCommandPaletteItem[]>();
    for (const it of items) {
      if (!m.has(it.groupTitle)) m.set(it.groupTitle, []);
      m.get(it.groupTitle)!.push(it);
    }
    return m;
  }, [items]);

  const run = (it: AdminCommandPaletteItem) => {
    appendAdminNavRecent(it.path);
    onOpenChange(false);
    if (it.telemetry) {
      try {
        const returnKey = it.telemetryReturnStorageKey ?? ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY;
        sessionStorage.setItem(returnKey, `${pathname}${search}`);
      } catch { /* ignore */ }
      void navigate(it.path, { state: { returnTo: `${pathname}${search}` } });
    } else {
      void navigate(it.path);
    }
  };

  /** 搜索 value: label + path + group + alias，保证全局模糊匹配 */
  function searchValue(it: AdminCommandPaletteItem, context: string): string {
    return [it.label, it.path, it.groupTitle, context, ...(it.alias ?? [])].join(" ");
  }

  const renderRow = (it: AdminCommandPaletteItem, context: string) => (
    <CommandItem
      key={`${context}-${it.id}`}
      value={searchValue(it, context)}
      onSelect={() => run(it)}
      className="cursor-pointer rounded-md py-2.5 transition-colors aria-selected:bg-neutral-100 hover:bg-neutral-50 flex items-center gap-3"
    >
      {it.icon && createElement(it.icon, { className: "h-4 w-4 shrink-0 text-neutral-400" })}
      <div className="min-w-0 flex-1">
        <span className="font-medium text-sm">{it.label}</span>
        <span className="ml-2 text-xs text-neutral-400">{it.groupTitle}</span>
      </div>
      <span className="shrink-0 text-[10px] text-neutral-300 font-mono">{it.path}</span>
    </CommandItem>
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索页面标题、路径或关键词…" />
      <CommandList>
        <CommandEmpty>无匹配结果；尝试其他关键词</CommandEmpty>
        {starredItems.length > 0 && (
          <CommandGroup heading="⭐ 收藏">
            {starredItems.map((it) => renderRow(it, "收藏"))}
          </CommandGroup>
        )}
        {recentItems.length > 0 && (
          <CommandGroup heading="🕐 最近">
            {recentItems.map((it) => renderRow(it, "最近"))}
          </CommandGroup>
        )}
        {groupOrder.map((title) => {
          const list = byGroup.get(title);
          if (!list?.length) return null;
          return (
            <CommandGroup key={title} heading={title}>
              {list.map((it) => renderRow(it, title))}
            </CommandGroup>
          );
        })}
      </CommandList>
      <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-500">
        ↑↓ 选择 · Enter 跳转 · Esc 关闭
      </div>
    </CommandDialog>
  );
}
