import { useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { broadcastClientReload } from "@/api/domains/clientVersion.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { cn } from "@/lib/utils";

/** 页头紧凑操作：部署新静态资源后通知在线页刷新，不占主内容区 */
export function ClientReloadOpsPanel() {
  const [pending, setPending] = useState(false);

  const onBroadcastReload = async () => {
    const ok = window.confirm(
      "将向所有在线客户端发送刷新指令（双通道：WebSocket + HTTP 轮询）。\n\n" +
        "请确认已完成前端 build 并部署静态资源；未保存的表单可能丢失。\n\n是否继续？",
    );
    if (!ok) return;
    setPending(true);
    try {
      const result = await broadcastClientReload();
      toast.success(
        `已双通道下发刷新指令。${result.stats.totalClients} 台在线，` +
        `${result.stats.outdated} 台待刷新。活跃标签页 <1s 收到，后台标签页 ≤15s。`,
        { duration: 6000 }
      );
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
      title="向所有客户端双通道下发刷新指令"
      onClick={() => void onBroadcastReload()}
    >
      <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} aria-hidden />
      {pending ? "发送中…" : "同步在线页"}
    </AdminButton>
  );
}
