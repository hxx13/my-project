import { useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StudentButton, StudentInput, StudentCard, showToast } from "../components/ui";
import { loginWeb, WebLoginError, type WebLoginCandidate } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";
import AccountChooser from "@/components/auth/AccountChooser";

export default function StudentLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** 手机号命中多个账号时的候选（历史数据有重号），让用户自己挑一个再重试 */
  const [accountChoices, setAccountChoices] = useState<WebLoginCandidate[] | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const doLogin = useCallback(async (overrideUsername?: string) => {
    const loginName = (overrideUsername ?? username).trim();
    if (!loginName || !password.trim()) {
      showToast("请输入账号和密码", "error");
      return;
    }

    try {
      setSubmitting(true);
      const data = await loginWeb(loginName, password);

      authStorage.setAuth(data.token, data.role, data.userInfo);
      authStorage.markLoginPortal("student");
      showToast("登录成功", "success");
      navigate("/", { replace: true });
    } catch (err) {
      // 手机号绑定了多个账号：列出候选让用户挑，挑完用账号名直接重试（不替他猜）
      if (err instanceof WebLoginError && err.errorCode === "MULTIPLE_ACCOUNTS") {
        setAccountChoices(err.candidates ?? []);
        return;
      }
      const message = err instanceof Error ? err.message : "登录失败";
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }, [username, password, navigate]);

  const handleUsernameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      passwordRef.current?.focus();
    }
  };

  const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doLogin();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--student-canvas-soft)] p-4">
      <StudentCard padding="lg" className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-bold text-[var(--student-ink)]">学生登录</h1>
          <p className="mt-2 text-sm text-[var(--student-mute)]">
            使用你的账号密码登录
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
              用户名
            </label>
            <StudentInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleUsernameKeyDown}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
              密码
            </label>
            <StudentInput
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handlePasswordKeyDown}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>

          {accountChoices && accountChoices.length > 0 && (
            <AccountChooser
              candidates={accountChoices}
              onPick={(u) => {
                setAccountChoices(null);
                setUsername(u);
                void doLogin(u);
              }}
            />
          )}

          <StudentButton
            onClick={() => void doLogin()}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "登录中..." : "登 录"}
          </StudentButton>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <p className="text-[var(--student-mute)]">
            还没有账号？
            <Link
              to="/student/register"
              className="ml-1 font-medium text-[var(--student-primary)] hover:underline"
            >
              立即注册
            </Link>
          </p>
          <p className="text-[var(--student-mute)]">
            已有身份但未设密码？
            <Link
              to="/m/activate"
              state={{ from: "/student/login" }}
              className="ml-1 font-medium text-[var(--student-primary)] hover:underline"
            >
              激活账号
            </Link>
          </p>
          <Link
            to="/"
            className="text-[var(--student-mute)] hover:text-[var(--student-primary)] transition-colors"
          >
            教职工登录入口
          </Link>
        </div>
      </StudentCard>
    </div>
  );
}
