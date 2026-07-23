import { useEffect, useState, useCallback } from "react";
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

  // CAS redirect: use ARO's domain as service URL so ARO loginAuth accepts the ticket.
  // CAS will redirect to ARO after login — user must manually return to our app.
  const ARO_SERVICE = "https://aro.shsmu.edu.cn";

  const handleCasLogin = () => {
    window.location.href =
      `https://auth2.shsmu.edu.cn/cas/login?service=${encodeURIComponent(ARO_SERVICE)}`;
  };

  // Manual binding: admin enters the ticket (copied from ARO's redirect URL)
  const [manualTicket, setManualTicket] = useState("");
  const handleManualBind = async () => {
    const ticket = manualTicket.trim();
    if (!ticket) { toast.error("请输入 ticket"); return; }
    if (!ticket.startsWith("ST-")) { toast.error("ticket 格式无效，应以 ST- 开头"); return; }
    setBinding(true);
    try {
      await bindCasAccount(ticket);
      toast.success("CAS 账号绑定成功");
      setManualTicket("");
      fetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "绑定失败");
    } finally {
      setBinding(false);
    }
  };

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

          {/* Step 1: Open CAS login and copy ticket */}
          <div className="space-y-2">
            <p className="text-sm font-medium">步骤一：获取 CAS ticket</p>
            <p className="text-xs text-muted-foreground">
              点击下方按钮打开 CAS 登录页。登录成功后，CAS 会重定向到 ARO。
              从浏览器地址栏复制 <code className="text-xs bg-muted px-1 rounded">?ticket=ST-xxx</code> 中的完整 ticket。
            </p>
            <button onClick={handleCasLogin} disabled={binding}
              className={cn("inline-flex items-center gap-2 rounded border px-4 py-2 text-sm hover:bg-accent")}>
              <KeyRound className="h-4 w-4" /> 打开 CAS 登录
            </button>
          </div>

          {/* Step 2: Paste ticket */}
          <div className="space-y-2">
            <p className="text-sm font-medium">步骤二：粘贴 ticket 完成绑定</p>
            <div className="flex gap-2">
              <input
                type="text" value={manualTicket}
                onChange={(e) => setManualTicket(e.target.value)}
                placeholder="ST-xxx..."
                className="flex-1 rounded border px-3 py-2 text-sm font-mono"
              />
              <button onClick={handleManualBind} disabled={binding}
                className={cn("rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}>
                {binding ? "绑定中..." : "绑定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
