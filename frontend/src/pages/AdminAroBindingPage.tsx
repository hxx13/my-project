import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { KeyRound, Unlink, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchCasBindingStatus,
  unbindCasAccount,
  getCasCaptchaUrl,
  acquireCasToken,
  type CasBindingStatus,
} from "@/api/domains/admin.api";

export default function AdminAroBindingPage() {
  const [status, setStatus] = useState<CasBindingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acquiring, setAcquiring] = useState(false);
  const [casUsername, setCasUsername] = useState("");
  const [casPassword, setCasPassword] = useState("");
  const [casCaptcha, setCasCaptcha] = useState("");
  const [captchaTs, setCaptchaTs] = useState(Date.now());

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

  const refreshCaptcha = () => setCaptchaTs(Date.now());

  const handleCasAcquire = async () => {
    if (!casUsername.trim() || !casPassword || !casCaptcha.trim()) {
      toast.error("请填写 CAS 账号、密码和验证码");
      return;
    }
    setAcquiring(true);
    try {
      const result = await acquireCasToken(casUsername.trim(), casPassword, casCaptcha.trim());
      toast.success(`CAS 绑定成功：${result.casAccount}`);
      setCasUsername(""); setCasPassword(""); setCasCaptcha("");
      fetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "登录失败");
      refreshCaptcha();
      setCasCaptcha("");
    } finally {
      setAcquiring(false);
    }
  };

  const handleUnbind = async () => {
    if (!confirm("确定要解绑 CAS 账号吗？解绑后需重新绑定才能使用 ARO 功能。"))
      return;
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
          <div className="flex gap-3">
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
        </div>
      ) : (
        <div className="rounded-lg border p-6 space-y-4">
          <p className="text-sm text-muted-foreground">请通过 CAS 代理登录获取 ARO Token</p>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">CAS 账号</label>
              <input
                type="text"
                value={casUsername}
                onChange={(e) => setCasUsername(e.target.value)}
                placeholder="如 YF0408"
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium">密码</label>
              <input
                type="password"
                value={casPassword}
                onChange={(e) => setCasPassword(e.target.value)}
                placeholder="CAS 密码"
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium">验证码</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="text"
                  value={casCaptcha}
                  onChange={(e) => setCasCaptcha(e.target.value)}
                  placeholder="验证码"
                  className="w-24 rounded border px-3 py-2 text-sm"
                  autoComplete="off"
                />
                <img
                  src={getCasCaptchaUrl() + "&_=" + captchaTs}
                  alt="验证码"
                  className="h-10 cursor-pointer border rounded"
                  onClick={refreshCaptcha}
                  title="点击刷新验证码"
                />
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  className="text-xs text-blue-600 hover:underline shrink-0"
                >
                  刷新
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleCasAcquire}
            disabled={acquiring}
            className={cn(
              "inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm",
              "text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            )}
          >
            <KeyRound className="h-4 w-4" />
            {acquiring ? "登录中..." : "代理登录获取 Token"}
          </button>
        </div>
      )}
    </div>
  );
}
