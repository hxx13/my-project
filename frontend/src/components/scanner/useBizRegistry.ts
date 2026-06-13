import { useSpecialChannelStore } from "@/store/useSpecialChannelStore";
import type { BizItem } from "./BizOverlayShell.types";

/** 非 Hook 方式获取已注册业务列表（供 BizOverlayShell 动态导入使用） */
export function getBizItems(): BizItem[] {
  return useSpecialChannelStore.getState().getBizItems();
}

export function useBizRegistry() {
  const registerBiz = useSpecialChannelStore((s) => s.registerBiz);
  const unregisterBiz = useSpecialChannelStore((s) => s.unregisterBiz);
  const getBizItemsFromStore = useSpecialChannelStore((s) => s.getBizItems);
  const clearBiz = useSpecialChannelStore((s) => s.clearBiz);

  return {
    register: registerBiz,
    unregister: unregisterBiz,
    getItems: getBizItemsFromStore,
    clear: clearBiz,
  };
}
