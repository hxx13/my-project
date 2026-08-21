/** 手机版 — 账户安全页（PIN 码管理） */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Key } from "lucide-react";
import { checkPinStatus, selfResetPin } from "@/api/domains/specialChannel.api";
import { authStorage } from "@/features/auth/authStorage";
import toast from "react-hot-toast";

import { appConfirm } from "@/lib/appDialog";
export default function MobileAccountSecurityPage() {
  const navigate = useNavigate();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const userInfo = authStorage.getUserInfo();
  const userId = userInfo?.username || userInfo?.id || "";

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    checkPinStatus(userId)
      .then(setHasPin)
      .catch(() => setHasPin(null))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleReset = async () => {
    if (!await appConfirm("确认重置个人PIN码吗？重置后需要在扫码设备上重新设置新的PIN码。")) return;
    try {
      setResetting(true);
      await selfResetPin();
      setHasPin(false);
      toast.success("PIN码已重置");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重置失败");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* header */}
      <div className="sticky top-0 z-[var(--z-sticky)] bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 h-12">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="size-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">账户安全</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* PIN section */}
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-4 py-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center size-8 rounded-full shrink-0"
              style={{ background: "var(--student-warning-soft)" }}>
              <Key className="size-4" style={{ color: "var(--student-warning)" }} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">个人PIN码</p>
              <p className="text-[11px] text-gray-400">用于扫码设备身份验证，6-8位纯数字</p>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-gray-400 py-2">查询中…</p>
          ) : hasPin === null ? (
            <p className="text-xs py-2" style={{ color: "var(--student-warning)" }}>
              无法获取PIN状态。如你未在人员库中注册，则无需PIN码。
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-400">当前状态：</span>
                <span
                  className="text-xs font-medium"
                  style={{ color: hasPin ? "var(--student-success)" : "var(--student-mute)" }}
                >
                  {hasPin ? "● 已设置" : "○ 未设置"}
                </span>
              </div>

              {hasPin && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetting}
                  className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: resetting ? "var(--student-mute)" : "var(--student-danger)",
                    color: "var(--student-destructive-foreground)",
                  }}
                >
                  {resetting ? "重置中…" : "重置PIN码"}
                </button>
              )}

              {hasPin === false && (
                <p className="text-xs text-gray-400">当前未设置PIN码，无需重置。</p>
              )}

              <p className="text-[11px] text-gray-400 mt-3">
                重置后需在扫码设备上重新设置新的PIN码。
              </p>
            </>
          )}
        </div>

        {/* Info */}
        <div className="rounded-xl px-4 py-3"
          style={{ background: "var(--student-accent-telemetry-soft)", borderColor: "var(--student-accent-telemetry)" }}>
          <div className="flex items-start gap-2">
            <Shield className="size-4 mt-0.5 shrink-0" style={{ color: "var(--student-accent-telemetry)" }} />
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--student-accent-telemetry)" }}>安全提示</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--student-accent-telemetry)", opacity: 0.8 }}>
                PIN码重置不会影响你的登录密码和微信绑定。重置后原PIN码立即失效。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
