import { useSpecialChannelStore } from "@/store/useSpecialChannelStore";
import type { BizItem } from "./BizOverlayShell.types";

export function useBizRegistry() {
  const registerBiz = useSpecialChannelStore((s) => s.registerBiz);
  const unregisterBiz = useSpecialChannelStore((s) => s.unregisterBiz);
  const getBizItems = useSpecialChannelStore((s) => s.getBizItems);
  const clearBiz = useSpecialChannelStore((s) => s.clearBiz);

  return {
    register: registerBiz,
    unregister: unregisterBiz,
    getItems: getBizItems,
    clear: clearBiz,
  };
}
