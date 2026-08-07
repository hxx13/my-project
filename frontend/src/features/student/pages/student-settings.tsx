import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Key, ArrowLeft } from "lucide-react";
import { AdminPageShell, AdminFormCard } from "@/components/admin/AdminPageShell";
import { StudentButton } from "../components/ui";
import { checkPinStatus, selfResetPin } from "@/api/domains/specialChannel.api";
import { fetchPasswordChangeStatus } from "@/api/domains/auth.api";
import ForgotPasswordPanel from "@/components/shared/ForgotPasswordPanel";
import { authStorage } from "@/features/auth/authStorage";
import toast from "react-hot-toast";
import type { AuthUserInfo } from "@/api/domains/auth.api";

const SETTINGS_CATEGORIES = [{ key: "account", label: "账户安全", icon: Shield }] as const;

export default function StudentSettingsPage() {
  const navigate = useNavigate();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pinLoading, setPinLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [canChangePassword, setCanChangePassword] = useState<boolean | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const userInfo: AuthUserInfo | null = authStorage.getUserInfo();
  const userId = userInfo?.username || userInfo?.id || "";
  const authProfile = userInfo?.authProfile;
  const isCasUser = authProfile === "CAS_LOGIN";

  // 查询 PIN 状态
  useEffect(() => {
    if (!userId) {
      setPinLoading(false);
      return;
    }
    checkPinStatus(userId)
      .then(setHasPin)
      .catch(() => setHasPin(null))
      .finally(() => setPinLoading(false));
  }, [userId]);

  // 查询改密状态
  useEffect(() => {
    fetchPasswordChangeStatus()
      .then((s) => setCanChangePassword(s.canChange))
      .catch(() => setCanChangePassword(null));
  }, []);

  const handleResetPin = async () => {
    if (
      !window.confirm(
        "确认重置个人PIN码吗？重置后需要在扫码设备上重新设置新的PIN码。",
      )
    )
      return;
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
    <AdminPageShell>
      <div className="flex gap-6 items-start">
        {/* ── Left sidebar ── */}
        <nav className="w-56 shrink-0 flex flex-col">
          <div className="rounded-xl border border-[var(--student-border)] bg-[var(--student-surface)] shadow-sm">
            <div className="border-b border-[var(--student-border)] px-3 py-2.5">
              <p className="text-xs font-semibold text-[var(--student-ink)]">
                设置分类
              </p>
            </div>
            <div className="px-2 py-2">
              {SETTINGS_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.key}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{cat.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </nav>

        {/* ── Right content ── */}
        <div className="min-w-0 flex-1">
          {/* Breadcrumb header */}
          <div className="mb-4 flex items-center gap-2 border-b border-[var(--student-border)] pb-3">
            <button
              type="button"
              onClick={() => navigate("/student/home")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--student-mute)] transition-colors hover:bg-[var(--student-canvas-soft)] hover:text-[var(--student-ink)]"
              aria-label="返回学生首页"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-[var(--student-mute)]">设置</span>
            <span className="text-sm text-[var(--student-mute)]">/</span>
            <h3 className="text-base font-semibold text-[var(--student-ink)]">
              账户安全
            </h3>
          </div>

          <div className="space-y-6">
            {/* ── PIN 管理 ── */}
            <AdminFormCard title="个人PIN码">
              <p className="text-xs text-[var(--student-mute)] mb-3">
                PIN码用于扫码设备身份验证，为6-8位纯数字。忘记PIN码可在此重置，随后在扫码设备上重新设置。
              </p>

              {pinLoading ? (
                <p className="text-xs text-[var(--student-mute)]">查询中…</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--student-mute)]">
                      当前状态：
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: hasPin
                          ? "var(--student-success)"
                          : "var(--student-mute)",
                      }}
                    >
                      {hasPin ? "● 已设置" : "○ 未设置"}
                    </span>
                  </div>

                  {hasPin && (
                    <StudentButton
                      variant="destructive"
                      onClick={handleResetPin}
                      disabled={resetting}
                    >
                      {resetting ? "重置中…" : "重置PIN码"}
                    </StudentButton>
                  )}

                  {hasPin === false && (
                    <p className="text-xs text-[var(--student-mute)]">
                      当前未设置PIN码，无需重置。
                    </p>
                  )}

                  {hasPin === null && !pinLoading && (
                    <p className="text-xs text-[var(--student-warning)]">
                      无法获取PIN状态。如你未在人员库中注册，则无需PIN码。
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-[var(--student-mute)] mt-3">
                重置后需在扫码设备上重新设置新的PIN码。重置不会影响登录密码和微信绑定。
              </p>
            </AdminFormCard>

            {/* ── 账号密码 ── */}
            <AdminFormCard title="账号密码">
              {canChangePassword === null ? (
                <p className="text-xs text-[var(--student-mute)]">查询中…</p>
              ) : isCasUser ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-lg bg-[var(--student-canvas-soft)] px-3 py-2.5">
                    <Shield className="size-4 text-[var(--student-mute)] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-[var(--student-ink)]">
                        统一认证用户
                      </p>
                      <p className="text-[11px] text-[var(--student-mute)] mt-0.5">
                        你通过CAS统一认证登录，密码由校园统一认证中心管理。如需修改密码，请联系统一认证中心。
                      </p>
                    </div>
                  </div>
                </div>
              ) : canChangePassword ? (
                <div className="space-y-3">
                  {showForgotPassword ? (
                    <ForgotPasswordPanel
                      theme="student"
                      onBackToLogin={() => setShowForgotPassword(false)}
                      onResetSuccess={() => { setShowForgotPassword(false); toast.success("密码已重置，请使用新密码登录"); }}
                    />
                  ) : (
                    <>
                      <p className="text-xs text-[var(--student-mute)]">
                        修改登录密码需验证身份，请选择验证方式后设置新密码。
                      </p>
                      <StudentButton onClick={() => setShowForgotPassword(true)}>
                        修改密码
                      </StudentButton>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg bg-[var(--student-canvas-soft)] px-3 py-2.5">
                  <Shield className="size-4 text-[var(--student-mute)] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-[var(--student-ink)]">
                      暂不支持修改
                    </p>
                    <p className="text-[11px] text-[var(--student-mute)] mt-0.5">
                      当前账号未设置登录密码，暂不支持自助修改。如有需要请联系管理员。
                    </p>
                  </div>
                </div>
              )}
            </AdminFormCard>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
