import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  changePasswordAfterReset,
  fetchPasswordChangeStatus,
  refreshAuthSession,
  updateProfileDisplayNickname,
  type PasswordChangeStatus,
} from "@/api/domains/auth.api";
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import type { AuthUserInfo } from "@/api/domains/auth.api";

const DEFAULT_STATUS: PasswordChangeStatus = {
  requiredReset: false,
  canChange: false,
};

function primaryDisplayLabel(u: AuthUserInfo | null): string {
  if (!u) return "—";
  const dn = (u.displayName || "").trim();
  if (dn) return dn;
  const nick = (u.displayNickname || "").trim();
  if (nick) return nick;
  const un = (u.username || "").trim();
  if (un) return un;
  return "—";
}

export default function ProfileSecurityPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnToRaw = (location.state as { returnTo?: string } | null)?.returnTo;
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.startsWith("/") ? returnToRaw : "/admin";

  const [me, setMe] = useState<AuthUserInfo | null>(() => authStorage.getUserInfo());
  const [nicknameDraft, setNicknameDraft] = useState(() => (authStorage.getUserInfo()?.displayNickname || "").trim());
  const [nicknameSaving, setNicknameSaving] = useState(false);

  const [status, setStatus] = useState<PasswordChangeStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const syncMeFromStorage = useCallback(() => {
    const u = authStorage.getUserInfo();
    setMe(u);
    setNicknameDraft((u?.displayNickname || "").trim());
  }, []);

  useEffect(() => {
    const onUpd = () => syncMeFromStorage();
    window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, onUpd);
  }, [syncMeFromStorage]);

  useEffect(() => {
    let cancelled = false;
    void refreshAuthSession()
      .then((data) => {
        if (cancelled) return;
        authStorage.setAuth(data.token, data.role, data.userInfo);
      })
      .catch(() => {
        /* 未登录或失效时忽略，由其它接口提示 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const headerLine = useMemo(() => primaryDisplayLabel(me), [me]);
  const accountLine = useMemo(() => {
    const un = (me?.username || "").trim();
    return un ? `@${un}` : "";
  }, [me]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await fetchPasswordChangeStatus();
      setStatus(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleSaveNickname = async () => {
    if (!me?.canEditDisplayNickname) {
      toast.error("当前账号不支持修改展示昵称");
      return;
    }
    setNicknameSaving(true);
    try {
      const data = await updateProfileDisplayNickname(nicknameDraft.trim());
      // 保存后仅合并会话 userInfo（与工单 displayName 同源），禁止整表 load — post-save-no-full-refresh.mdc
      authStorage.setAuth(data.token, data.role, data.userInfo);
      toast.success("展示昵称已保存，顶部与工单展示名将随规则更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setNicknameSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!status.canChange) {
      toast.error("当前账号未处于重置后改密状态");
      return;
    }
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error("请完整填写密码信息");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("新密码至少6位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      await changePasswordAfterReset(oldPassword, newPassword);
      toast.success("密码修改成功");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(returnTo, { replace: true })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              返回
            </button>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">个人中心</h1>
          <p className="mt-2 text-sm text-slate-600">
            账号展示名与工单申请人展示使用同一套规则：优先人员库姓名，其次您设置的展示昵称，再次登录账号名。
          </p>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">{headerLine}</div>
            {accountLine ? <div className="mt-0.5 text-xs text-slate-600">{accountLine}</div> : null}
          </div>

          {me?.canEditDisplayNickname ? (
            <div className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-sm text-slate-700">展示昵称（最多 32 字）</label>
                <input
                  type="text"
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  maxLength={32}
                  placeholder="无人员库姓名时用于报修/采购等展示"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={nicknameSaving}
                onClick={() => void handleSaveNickname()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {nicknameSaving ? "保存中…" : "保存展示昵称"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              当前账号不可在此修改展示昵称（例如已绑定人员库姓名、或绑定方式非账号密码等），如需变更请联系超级管理员。
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">密码安全</h2>
          <p className="mt-2 text-sm text-slate-600">
            本区块仅用于教职工账号在管理员“重置密码”后完成自助改密，不提供登录页找回密码。
          </p>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            {loading ? (
              <span className="text-slate-500">正在读取状态...</span>
            ) : status.canChange ? (
              <span className="text-emerald-700">检测到已重置，当前可修改密码。</span>
            ) : (
              <span className="text-amber-700">当前不可改密，请联系超级管理员先执行“重置密码”。</span>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-700">当前密码（重置后的密码）</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={!status.canChange || loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={!status.canChange || loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={!status.canChange || loading}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!status.canChange || loading || submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "提交中..." : "确认修改密码"}
            </button>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              刷新状态
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
