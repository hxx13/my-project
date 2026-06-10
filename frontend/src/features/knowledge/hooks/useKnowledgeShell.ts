import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { ShellView } from "@/features/knowledge/types";

interface UseKnowledgeShellReturn {
  view: ShellView;
  selectedPageId: number | null;
  isEditing: boolean;
  editingPageId: number | null;
  isHistoryOpen: boolean;
  historyPageId: number | null;
  setView: (v: ShellView) => void;
  selectPage: (id: number) => void;
  deselectPage: () => void;
  startEdit: (pageId?: number) => void;
  stopEdit: () => void;
  openHistory: (pageId: number) => void;
  closeHistory: () => void;
}

export function useKnowledgeShell(): UseKnowledgeShellReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const view = (searchParams.get("view") as ShellView) || "browse";
  const selectedPageId = searchParams.get("page") ? Number(searchParams.get("page")) : null;
  const editingPageId = searchParams.has("edit") ? Number(searchParams.get("edit")) : null;
  const isEditing = editingPageId !== null || searchParams.has("new");

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyPageId, setHistoryPageId] = useState<number | null>(null);

  const setView = useCallback((v: ShellView) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("view", v);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const selectPage = useCallback((id: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("page", String(id));
      next.delete("edit");
      next.delete("new");
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  const deselectPage = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("page");
      next.delete("edit");
      next.delete("new");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const startEdit = useCallback((pageId?: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (pageId) {
        next.set("edit", String(pageId));
        next.delete("new");
      } else {
        next.set("new", "");
        next.delete("edit");
        next.delete("page");
      }
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  const stopEdit = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("edit");
      next.delete("new");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const openHistory = useCallback((pageId: number) => {
    setHistoryPageId(pageId);
    setIsHistoryOpen(true);
  }, []);

  const closeHistory = useCallback(() => {
    setIsHistoryOpen(false);
    setHistoryPageId(null);
  }, []);

  return {
    view,
    selectedPageId,
    isEditing,
    editingPageId: editingPageId ?? null,
    isHistoryOpen,
    historyPageId,
    setView,
    selectPage,
    deselectPage,
    startEdit,
    stopEdit,
    openHistory,
    closeHistory,
  };
}
