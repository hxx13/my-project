import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { KeyRound, Unlink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchCasBindingStatus,
  bindCasAccount,
  unbindCasAccount,
  type CasBindingStatus,
} from "@/api/domains/admin.api";

export default function AdminAroBindingPage() {
  const [status, setStatus] = useState<CasBindingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);
  const ticketRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCasBindingStatus();
      setStatus(data);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Redirect user to CAS (same as LoginPage) → ticket comes back to our app → exchangeTicket
  const handleCasLogin = () => {
    window.location.href =
      `https://auth2.shsmu.edu.cn/cas/login?service=${encodeURIComponent(window.location.origin)}`;
  };

  // Extract ticket from URL and call cas-bind (R7: useRef guard)
  useEffect(() => {
    if (ticketRef.current) return;
    const ticket =
      new URLSearchParams(window.location.search).get("ticket") ||
      window.location.href.match(/[?&]ticket=([^&#]+)/)?.[1];
    if (!ticket || status?.bound) return;
    ticketRef.current = true;

    (async () => {
      setBinding(true);
      try {
        await bindCasAccount(ticket);
        toast.success("CAS 账号绑定成功");
        const cleanUrl = window.location.href
          .replace(/[?&]ticket=[^&#]+/, "").replace(/\?$/, "");
        window.history.replaceState(null, "", cleanUrl);
        fetchStatus();
      } catch (e: any) {
        toast.error(e?.message || "绑定失败");
      } finally {
        setBinding(false);
      }
    })();
  }, [status?.bound]);

  const handleUnbind = async () => {
    if (!confirm("确定要解绑 CAS 账号吗？解绑后需重新绑定才能使用 ARO 功能。")) return;
    try {
      await unbindCasAccount();
      toast.success("已解绑");
      fetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "解绑失败");
    }
  };

  const formatRemaining = (sec: number) => {
    if (sec <= 0) return "已过期";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    if (d > 0) return `${d} 天 ${h} 小时`;
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} 小时 ${m} 分钟`;
    return `${m} 分钟`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
          <button onClick={fetchStatus} className="ml-3 underline hover:no-underline">重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">ARO 认证管理</h1>

      {status?.bound ? (
        <div className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-green-500" />
            <span className="font-medium">已绑定 CAS 账号</span>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>账号：{status.casAccount}</p>
            {status.remainingSeconds != null && (
              <p>剩余有效期：{formatRemaining(status.remainingSeconds)}</p>
            )}
          </div>
          <button
            onClick={handleUnbind}
            className={cn(
              "inline-flex items-center gap-2 rounded px-4 py-2 text-sm",
              "border border-red-200 text-red-600 hover:bg-red-50"
            )}
          >
            <Unlink className="h-4 w-4" /> 解绑
          </button>
        </div>
      ) : (
        <div className="rounded-lg border p-6 space-y-4">
          <p className="text-muted-foreground">尚未绑定 CAS 统一认证账号</p>
          <button
            onClick={handleCasLogin}
            disabled={binding}
            className={cn(
              "inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm",
              "text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            )}
          >
            <KeyRound className="h-4 w-4" />
            {binding ? "绑定中..." : "绑定 CAS 账号"}
          </button>
        </div>
      )}
    </div>
  );
}
