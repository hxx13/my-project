import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { ShellView } from "@/features/knowledge/types";

export function useKnowledgeShell() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyPageId, setHistoryPageId] = useState<number | null>(null);

  const view = (searchParams.get("view") as ShellView) || "browse";
  const selectedPageId = searchParams.get("page") ? Number(searchParams.get("page")) : null;
  const isEditing = searchParams.has("edit") || searchParams.has("new");
  const editingPageId = searchParams.has("edit") ? Number(searchParams.get("edit")) : null;

  const setView = useCallback((v: ShellView) => {
    setSearchParams(p => { const n = new URLSearchParams(p); n.set("view", v); return n; }, { replace: true });
  }, [setSearchParams]);

  const selectPage = useCallback((id: number) => {
    setSearchParams(p => { const n = new URLSearchParams(p); n.set("page", String(id)); n.delete("edit"); n.delete("new"); return n; }, { replace: false });
  }, [setSearchParams]);

  const deselectPage = useCallback(() => {
    setSearchParams(p => { const n = new URLSearchParams(p); n.delete("page"); n.delete("edit"); n.delete("new"); return n; }, { replace: true });
  }, [setSearchParams]);

  const startEdit = useCallback((pageId?: number) => {
    setSearchParams(p => {
      const n = new URLSearchParams(p);
      if (pageId) { n.set("edit", String(pageId)); n.delete("new"); }
      else { n.set("new", ""); n.delete("edit"); n.delete("page"); }
      return n;
    }, { replace: false });
  }, [setSearchParams]);

  const stopEdit = useCallback(() => {
    setSearchParams(p => { const n = new URLSearchParams(p); n.delete("edit"); n.delete("new"); return n; }, { replace: true });
  }, [setSearchParams]);

  return {
    view, selectedPageId, isEditing, editingPageId, isHistoryOpen, historyPageId,
    setView, selectPage, deselectPage, startEdit, stopEdit,
    openHistory: (id: number) => { setHistoryPageId(id); setIsHistoryOpen(true); },
    closeHistory: () => { setIsHistoryOpen(false); setHistoryPageId(null); },
  };
}
