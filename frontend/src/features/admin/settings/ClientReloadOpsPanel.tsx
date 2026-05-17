import { useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { broadcastClientReload } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { cn } from "@/lib/utils";

/** 页头紧凑操作：部署新静态资源后通知在线页刷新，不占主内容区 */
export function ClientReloadOpsPanel() {
  const [pending, setPending] = useState(false);

  const onBroadcastReload = async () => {
    const ok = window.confirm(
      "将向所有已连接实时通道的浏览器发送强制刷新（含孪生大屏、管理后台等）。\n\n" +
        "请确认已完成前端 build 并部署静态资源；未保存的表单可能丢失。\n\n是否继续？",
    );
    if (!ok) return;
    setPending(true);
    try {
      await broadcastClientReload();
      toast.success("已广播刷新；在线页面将重新加载");
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "广播失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <AdminButton
      type="button"
      tone="secondary"
      size="sm"
      className="gap-1.5"
      disabled={pending}
      title="重新 build 并部署静态资源后，通知所有已连接 Socket 的浏览器刷新（不重启后端）"
      onClick={() => void onBroadcastReload()}
    >
      <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} aria-hidden />
      {pending ? "发送中…" : "同步在线页"}
    </AdminButton>
  );
}
