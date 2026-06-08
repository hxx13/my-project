import { create } from "zustand";
import type { BizItem } from "@/components/scanner/BizOverlayShell.types";

interface SpecialChannelState {
  bizItems: Map<string, BizItem>;

  registerBiz: (item: BizItem) => void;
  unregisterBiz: (id: string) => void;
  getBizItems: () => BizItem[];
  clearBiz: () => void;
}

export const useSpecialChannelStore = create<SpecialChannelState>((set, get) => ({
  bizItems: new Map(),

  registerBiz: (item) =>
    set((s) => {
      const next = new Map(s.bizItems);
      next.set(item.id, item);
      return { bizItems: next };
    }),

  unregisterBiz: (id) =>
    set((s) => {
      const next = new Map(s.bizItems);
      next.delete(id);
      return { bizItems: next };
    }),

  getBizItems: () => {
    const items = Array.from(get().bizItems.values());
    return items
      .filter((item) => item.enabled !== false)
      .sort((a, b) => a.order - b.order);
  },

  clearBiz: () => set({ bizItems: new Map() }),
}));
