import { useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StudentButton, StudentInput, StudentCard, showToast } from "../components/ui";
import { loginWeb } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";

export default function StudentLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const doLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      showToast("请输入账号和密码", "error");
      return;
    }

    try {
      setSubmitting(true);
      const data = await loginWeb(username.trim(), password);

      authStorage.setAuth(data.token, data.role, data.userInfo);
      authStorage.markLoginPortal("student");
      showToast("登录成功", "success");
      navigate("/student/home", { replace: true });
    } catch (err) {
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

          <StudentButton
            onClick={doLogin}
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
          <Link
            to="/login"
            className="text-[var(--student-mute)] hover:text-[var(--student-primary)] transition-colors"
          >
            教职工登录入口
          </Link>
        </div>
      </StudentCard>
    </div>
  );
}
