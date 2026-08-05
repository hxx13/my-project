import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Star, History, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALL_NAV_ITEMS, type NavItem } from "./student-sidebar";
import { readStudentNavStars, readStudentNavRecent, appendStudentNavRecent } from "./student-nav-personalization";

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface StudentCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentCommandPalette({ open, onOpenChange }: StudentCommandPaletteProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentPaths, setRecentPaths] = useState<string[]>(() => readStudentNavRecent());
  const [starredPaths] = useState<string[]>(() => readStudentNavStars());

  /* Reset state on open */
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setRecentPaths(readStudentNavRecent());
    }
  }, [open]);

  /* Filter items */
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ALL_NAV_ITEMS;
    return ALL_NAV_ITEMS.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.to.toLowerCase().includes(q),
    );
  }, [query]);

  /* Sort: starred first, then recent, then alphabetical */
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aStar = starredPaths.includes(a.to) ? 1 : 0;
      const bStar = starredPaths.includes(b.to) ? 1 : 0;
      if (aStar !== bStar) return bStar - aStar;

      const aRecent = recentPaths.indexOf(a.to);
      const bRecent = recentPaths.indexOf(b.to);
      if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
      if (aRecent !== -1) return -1;
      if (bRecent !== -1) return 1;

      return a.label.localeCompare(b.label);
    });
  }, [filtered, starredPaths, recentPaths]);

  /* Clamp selection */
  const safeIndex = Math.min(selectedIndex, Math.max(0, sorted.length - 1));

  /* Keyboard */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, sorted.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = sorted[safeIndex];
        if (item) {
          appendStudentNavRecent(item.to);
          navigate(item.to);
          onOpenChange(false);
        }
      }
    },
    [sorted, safeIndex, navigate, onOpenChange],
  );

  const handleSelect = (item: NavItem) => {
    appendRecent(item.to);
    navigate(item.to);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        overlayClassName="z-[var(--z-command)] bg-black/60"
        className="z-[var(--z-command)] max-h-[85vh] w-[min(100vw-1.5rem,34rem)] overflow-hidden border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <DialogTitle className="sr-only">搜索页面</DialogTitle>

        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="搜索页面…"
            className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
          />
          <kbd className="hidden shrink-0 rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 sm:inline dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto overscroll-y-contain p-1">
          {sorted.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-neutral-400">
              未找到匹配页面
            </div>
          ) : (
            sorted.map((item, idx) => {
              const isStarred = starredPaths.includes(item.to);
              const isRecent = recentPaths.includes(item.to);
              const isSelected = idx === safeIndex;
              const Icon = item.icon;

              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                    isSelected
                      ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                      : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/50",
                  )}
                >
                  <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-100 p-1 dark:bg-neutral-800">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 text-[11px] text-neutral-400">
                    {item.to}
                  </span>
                  {isStarred && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  )}
                  {isRecent && !isStarred && (
                    <History className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-500" />
                  )}
                  {isSelected && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-500" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-400 dark:border-neutral-700">
          <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 py-0.5 font-mono dark:border-neutral-600 dark:bg-neutral-800">↑↓</kbd> 导航{" "}
          <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 py-0.5 font-mono dark:border-neutral-600 dark:bg-neutral-800">Enter</kbd> 跳转{" "}
          <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 py-0.5 font-mono dark:border-neutral-600 dark:bg-neutral-800">Esc</kbd> 关闭
        </div>
      </DialogContent>
    </Dialog>
  );
}
