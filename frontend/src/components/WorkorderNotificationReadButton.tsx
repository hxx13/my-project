import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { toBizCompositeKey } from "@/api/domains/notification.api";
import {
  loadUnreadBizFlagMap,
  markBizNotificationsReadSynced,
  NOTIFICATION_READ_CHANGED_EVENT,
  type NotificationReadChangedDetail,
} from "@/features/notification/notificationReadSync";

type Props = {
  bizType: string;
  bizId: string;
  className?: string;
  /** 列表批量查询后传入，避免每行单独请求 */
  unreadOverride?: boolean;
  onRead?: () => void;
};

/** 工单行「已读」：与消息中心 read-by-biz 同源 */
export function WorkorderNotificationReadButton({
  bizType,
  bizId,
  className = "rounded border border-blue-300 px-2 py-0.5 text-[11px] text-blue-700",
  unreadOverride,
  onRead,
}: Props) {
  const composite = toBizCompositeKey(bizType, bizId);
  const [unread, setUnread] = useState(unreadOverride === true);

  const refreshUnread = useCallback(async () => {
    if (unreadOverride !== undefined) {
      setUnread(unreadOverride);
      return;
    }
    const map = await loadUnreadBizFlagMap([{ bizType, bizId }]);
    setUnread(!!map[composite]);
  }, [bizType, bizId, composite, unreadOverride]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    const onChanged = (ev: Event) => {
      const d = (ev as CustomEvent<NotificationReadChangedDetail>).detail;
      if (d?.all) {
        setUnread(false);
        return;
      }
      if (d?.bizType && d?.bizId && toBizCompositeKey(d.bizType, d.bizId) === composite) {
        setUnread(false);
      }
    };
    window.addEventListener(NOTIFICATION_READ_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATION_READ_CHANGED_EVENT, onChanged);
  }, [composite]);

  useEffect(() => {
    if (unreadOverride !== undefined) setUnread(unreadOverride);
  }, [unreadOverride]);

  if (!unread) return null;

  const onMarkRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await markBizNotificationsReadSynced(bizType, bizId);
      setUnread(false);
      onRead?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "标记已读失败");
    }
  };

  return (
    <button type="button" className={className} onClick={(e) => void onMarkRead(e)}>
      已读
    </button>
  );
}
