import { useMemo } from "react";
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
  open,
  onOpenChange,
  items,
  starredItems = [],
  recentItems = [],
  pathname,
  search,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 按注册表分组展示（已排除「收藏」「最近」独占项） */
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
      } catch {
        /* ignore */
      }
      void navigate(it.path, { state: { returnTo: `${pathname}${search}` } });
    } else {
      void navigate(it.path);
    }
  };

  const renderRow = (it: AdminCommandPaletteItem, title: string) => (
    <CommandItem
      key={`${title}-${it.id}`}
      value={`${it.label} ${it.path} ${title}`}
      onSelect={() => run(it)}
      className="cursor-pointer rounded-md py-2.5 transition-colors aria-selected:bg-neutral-100 hover:bg-neutral-50"
    >
      <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
      <span className="ml-2 max-w-[40%] shrink-0 truncate text-xs text-neutral-500">{it.path}</span>
    </CommandItem>
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索页面标题或路径…" />
      <CommandList className="[&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:transition-colors [&_[cmdk-item][aria-selected=true]]:bg-neutral-100 [&_[cmdk-item]:hover]:bg-neutral-50">
        <CommandEmpty>无匹配结果；清空搜索框可浏览全部入口</CommandEmpty>
        {starredItems.length ? (
          <CommandGroup heading="收藏">
            {starredItems.map((it) => renderRow(it, "收藏"))}
          </CommandGroup>
        ) : null}
        {recentItems.length ? (
          <CommandGroup heading="最近">
            {recentItems.map((it) => renderRow(it, "最近"))}
          </CommandGroup>
        ) : null}
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
        点击或 Enter 进入 · Esc 关闭
      </div>
    </CommandDialog>
  );
}
