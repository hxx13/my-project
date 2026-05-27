import { useCallback, useEffect, useState } from "react";
import { toBizCompositeKey } from "@/api/domains/notification.api";
import {
  loadUnreadBizFlagMap,
  NOTIFICATION_READ_CHANGED_EVENT,
  type NotificationReadChangedDetail,
} from "@/features/notification/notificationReadSync";

/** 工单列表页批量拉取未读标记，与 read-by-biz 联动 */
export function useWorkorderUnreadFlags(bizType: string, orderIds: string[]) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const ids = orderIds.filter(Boolean);
    if (!ids.length) {
      setFlags({});
      return;
    }
    const map = await loadUnreadBizFlagMap(ids.map((bizId) => ({ bizType, bizId })));
    setFlags(map);
  }, [bizType, orderIds]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = (ev: Event) => {
      const d = (ev as CustomEvent<NotificationReadChangedDetail>).detail;
      if (d?.all) {
        setFlags({});
        return;
      }
      if (d?.bizType && d?.bizId && d.bizType.toUpperCase() === bizType.toUpperCase()) {
        const ck = toBizCompositeKey(d.bizType, d.bizId);
        setFlags((prev) => ({ ...prev, [ck]: false }));
      }
    };
    window.addEventListener(NOTIFICATION_READ_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATION_READ_CHANGED_EVENT, onChanged);
  }, [bizType]);

  const isUnread = (orderId: string) => !!flags[toBizCompositeKey(bizType, orderId)];

  return { isUnread, refresh };
}
