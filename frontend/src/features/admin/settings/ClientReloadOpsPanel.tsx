import { useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { broadcastClientReload } from "@/api/domains/notification.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";

export function ClientReloadOpsPanel() {
  const [pending, setPending] = useState(false);

  const onBroadcastReload = async () => {
    const ok = window.confirm(
      "将向所有已连接实时通道的浏览器发送强制刷新指令（含数字孪生大屏、管理后台等）。\n\n" +
        "请确认已完成前端 build 并部署静态资源。未保存的表单内容可能丢失。\n\n是否继续？"
    );
    if (!ok) return;
    setPending(true);
    try {
      await broadcastClientReload();
      toast.success("已广播刷新指令；本页与其它在线页将即将重新加载");
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "广播失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <AdminFormCard
      title="前端部署同步"
      description="重新 build 并部署静态资源后，可一键通知所有在线页面重新加载，便于无人值守大屏同步新 UI。需 Socket.IO（默认端口 9092）可达。"
    >
      <p className="text-xs leading-relaxed text-neutral-600">
        仅刷新浏览器中的前端资源，不会重启后端服务。当时未打开或未连上 Socket 的页面需手动刷新。
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void onBroadcastReload()}
        className="inline-flex items-center gap-2 rounded-lg bg-[#0070f3] px-4 py-2 text-sm font-medium text-white hover:bg-[#0060df] disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        {pending ? "发送中…" : "通知所有在线页面刷新"}
      </button>
    </AdminFormCard>
  );
}
