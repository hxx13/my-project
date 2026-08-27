import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { QrUploader } from "../components/qr";
import { StudentButton, StudentInput, StudentCard, showToast } from "../components/ui";
import { authStorage } from "@/features/auth/authStorage";
import { registerStudent, verifyUserId } from "../api";
import type { AuthUserInfo } from "@/api/domains/auth.api";

type RegisterStep = "qr" | "confirm" | "credentials" | "success";

interface VerifiedData {
  userId: string;
  name: string;
  departmentName: string;
  projectGroupName: string;
}

export default function StudentRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<RegisterStep>("qr");
  const [verifiedData, setVerifiedData] = useState<VerifiedData | null>(null);

  // Manual ID input (alternative to QR)
  const [manualUserId, setManualUserId] = useState("");
  const [manualVerifying, setManualVerifying] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Step 3 form fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    username?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // Step 4 auto-redirect
  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(() => {
      navigate("/student/home", { replace: true });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [step, navigate]);

  const handleVerified = (data: VerifiedData) => {
    setVerifiedData(data);
    setStep("confirm");
  };

  const handleManualVerify = async () => {
    const id = manualUserId.trim();
    if (!id || id.length !== 19) {
      setManualError("请输入19位人员编号");
      return;
    }
    setManualVerifying(true);
    setManualError(null);
    try {
      const result = await verifyUserId(id);
      if (result.verified && result.userId && result.name) {
        setVerifiedData({
          userId: result.userId,
          name: result.name,
          departmentName: result.departmentName || "",
          projectGroupName: result.projectGroupName || "",
        });
        setStep("confirm");
      } else {
        setManualError(result.message || "验证失败，请确认编号正确");
      }
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "验证失败，请重试");
    } finally {
      setManualVerifying(false);
    }
  };

  const handleBackToQr = () => {
    setVerifiedData(null);
    setStep("qr");
  };

  const validateCredentials = (): boolean => {
    const errors: typeof formErrors = {};

    if (!username.trim() || username.trim().length < 3 || username.trim().length > 64) {
      errors.username = "用户名长度需在 3-64 位之间";
    }
    if (!password || password.length < 6) {
      errors.password = "密码长度至少 6 位";
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = "两次输入的密码不一致";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateCredentials() || !verifiedData) return;

    try {
      setSubmitting(true);
      setFormErrors({});
      setNeedsActivation(false);
      const result = await registerStudent(
        verifiedData.userId,
        username.trim(),
        password
      );
      authStorage.setAuth(result.data.token, result.data.role, result.data.userInfo as AuthUserInfo);
      authStorage.markLoginPortal("student");
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败，请重试";
      showToast(message, "error");
      if (message.includes("未设密码") || message.includes("激活页面")) {
        setNeedsActivation(true);
      } else {
        setNeedsActivation(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCredentialsEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRegister();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--student-canvas-soft)] p-4">
      <StudentCard padding="lg" className="w-full max-w-md">
        {step === "qr" && (
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold text-[var(--student-ink)]">学生注册</h1>
            <p className="mt-2 text-sm text-[var(--student-mute)]">
              输入你的 19 位人员编号或上传 QR 码进行验证
            </p>

            {/* 手动输入人员编号 */}
            <div className="mt-8 w-full space-y-3">
              <div className="text-left">
                <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
                  人员编号（19 位）
                </label>
                <StudentInput
                  value={manualUserId}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 19);
                    setManualUserId(v);
                    setManualError(null);
                  }}
                  placeholder="手动输入 19 位人员编号"
                  error={manualError ?? undefined}
                  autoComplete="off"
                />
              </div>
              <StudentButton
                onClick={handleManualVerify}
                disabled={manualVerifying || manualUserId.trim().length !== 19}
                className="w-full"
              >
                {manualVerifying ? "验证中..." : "验证"}
              </StudentButton>
            </div>

            {/* 分割线 */}
            <div className="my-6 flex w-full items-center gap-3">
              <div className="flex-1 border-t border-[var(--student-hairline)]" />
              <span className="text-xs text-[var(--student-mute)]">或</span>
              <div className="flex-1 border-t border-[var(--student-hairline)]" />
            </div>

            {/* QR 上传 */}
            <div className="w-full">
              <QrUploader onVerified={handleVerified} />
            </div>

            <p className="mt-6 text-sm text-[var(--student-mute)]">
              已有账号？
              <Link
                to="/"
                className="ml-1 font-medium text-[var(--student-primary)] hover:underline"
              >
                去登录
              </Link>
            </p>
          </div>
        )}

        {step === "confirm" && verifiedData && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-[var(--student-success-soft)] p-3">
              <CheckCircle className="h-12 w-12 text-[var(--student-success)]" />
            </div>

            <h1 className="mt-4 text-2xl font-bold text-[var(--student-ink)]">身份验证通过</h1>
            <p className="mt-2 text-sm text-[var(--student-mute)]">
              请确认以下信息是否正确
            </p>

            <div className="mt-6 w-full space-y-3 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] p-4 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--student-mute)]">姓名</span>
                <span className="font-medium text-[var(--student-ink)]">{verifiedData.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--student-mute)]">部门</span>
                <span className="font-medium text-[var(--student-ink)]">
                  {verifiedData.departmentName || "-"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--student-mute)]">课题组</span>
                <span className="font-medium text-[var(--student-ink)]">
                  {verifiedData.projectGroupName || "-"}
                </span>
              </div>
            </div>

            <div className="mt-8 flex w-full flex-col gap-3">
              <StudentButton onClick={() => setStep("credentials")} className="w-full">
                确认，设置账号
              </StudentButton>
              <StudentButton variant="secondary" onClick={handleBackToQr} className="w-full">
                重新验证
              </StudentButton>
            </div>
          </div>
        )}

        {step === "credentials" && (
          <div>
            <h1 className="text-2xl font-bold text-[var(--student-ink)]">设置账号密码</h1>
            <p className="mt-2 text-sm text-[var(--student-mute)]">
              创建你的登录凭据，用于后续登录学生中心
            </p>

            <div className="mt-8 space-y-4" onKeyDown={handleCredentialsEnter}>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
                  用户名
                </label>
                <StudentInput
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3-64 位，字母或数字"
                  error={formErrors.username}
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
                  密码
                </label>
                <StudentInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  error={formErrors.password}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
                  确认密码
                </label>
                <StudentInput
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  error={formErrors.confirmPassword}
                  autoComplete="new-password"
                />
              </div>

              <StudentButton
                onClick={handleRegister}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? "注册中..." : "完成注册"}
              </StudentButton>

              {needsActivation && (
                <p className="mt-3 rounded-[var(--student-radius-sm)] bg-[var(--student-warning-soft)] px-3 py-2 text-center text-sm text-[var(--student-warning)]">
                  该账号已绑定但未设密码，请
                  <Link to="/m/activate" className="ml-1 font-medium underline">
                    前往激活页面设置密码
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-[var(--student-success-soft)] p-4">
              <CheckCircle className="h-16 w-16 text-[var(--student-success)]" />
            </div>
            <h1 className="mt-6 text-2xl font-bold text-[var(--student-ink)]">注册成功！</h1>
            <p className="mt-2 text-sm text-[var(--student-mute)]">正在跳转...</p>
          </div>
        )}
      </StudentCard>
    </div>
  );
}
