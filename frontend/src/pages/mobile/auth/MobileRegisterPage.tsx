import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { QrUploader } from "@/features/student/components/qr";
import { authStorage } from "@/features/auth/authStorage";
import { registerStudent } from "@/features/student/api";
import type { AuthUserInfo } from "@/api/domains/auth.api";

type RegisterStep = "qr" | "confirm" | "credentials" | "success";

interface VerifiedData {
  userId: string;
  name: string;
  departmentName: string;
  projectGroupName: string;
}

export default function MobileRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<RegisterStep>("qr");
  const [verifiedData, setVerifiedData] = useState<VerifiedData | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ username?: string; password?: string; confirmPassword?: string }>({});
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [needsActivation, setNeedsActivation] = useState(false);

  // Auto-redirect after success
  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(() => navigate("/m/home", { replace: true }), 1500);
    return () => window.clearTimeout(timer);
  }, [step, navigate]);

  const handleVerified = (data: VerifiedData) => { setVerifiedData(data); setStep("confirm"); };
  const handleBackToQr = () => { setVerifiedData(null); setStep("qr"); };

  const validateCredentials = (): boolean => {
    const errors: typeof formErrors = {};
    if (!username.trim() || username.trim().length < 3 || username.trim().length > 64)
      errors.username = "用户名长度需在 3-64 位之间";
    if (!password || password.length < 6)
      errors.password = "密码长度至少 6 位";
    if (password !== confirmPassword)
      errors.confirmPassword = "两次输入的密码不一致";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateCredentials() || !verifiedData) return;
    try {
      setSubmitting(true);
      setFormErrors({});
      const result = await registerStudent(verifiedData.userId, username.trim(), password);
      authStorage.setAuth(result.data.token, result.data.role, result.data.userInfo as AuthUserInfo);
      authStorage.markLoginPortal("mobile");
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败，请重试";
      setRegisterError(message);
      if (message.includes("未设密码") || message.includes("激活页面")) {
        setNeedsActivation(true);
      } else {
        setNeedsActivation(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Token variables for style reuse
  const bg = "var(--app-color-surface-page)";
  const cardBg = "var(--app-color-surface-container)";
  const primary = "var(--app-color-text-primary)";
  const secondary = "var(--app-color-text-secondary)";
  const accent = "var(--app-color-accent)";
  const border = "var(--app-color-border-default)";
  const inputStyle = { background: bg, borderColor: border, color: primary };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-5 overflow-y-auto"
      style={{ background: bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" }}>
      {/* Back button */}
      <button
        onClick={() => {
          if (step === "qr") navigate("/m/login");
          else if (step === "confirm") { setVerifiedData(null); setStep("qr"); }
          else if (step === "credentials") setStep("confirm");
        }}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95"
        style={{ background: "rgba(0,0,0,0.06)" }}
      >
        <ArrowLeft className="size-5" style={{ color: primary }} />
      </button>
      <div className="w-full max-w-sm rounded-[var(--app-radius-container)] p-[var(--app-space-container-padding)]" style={{ background: cardBg }}>

        {/* Step 1: QR Upload */}
        {step === "qr" && (
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold" style={{ color: primary }}>学生注册</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>上传你的身份 QR 码进行验证，开始注册账号</p>
            <div className="mt-8 w-full"><QrUploader onVerified={handleVerified} /></div>
            <p className="mt-6 text-sm" style={{ color: secondary }}>
              已有账号？<Link to="/m/login" className="ml-1 font-medium hover:underline" style={{ color: accent }}>去登录</Link>
            </p>
          </div>
        )}

        {/* Step 2: Confirm Identity */}
        {step === "confirm" && verifiedData && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full p-3" style={{ background: "rgba(34,197,94,0.1)" }}>
              <CheckCircle className="h-12 w-12" style={{ color: "#22c55e" }} />
            </div>
            <h1 className="mt-4 text-2xl font-bold" style={{ color: primary }}>身份验证通过</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>请确认以下信息是否正确</p>
            <div className="mt-6 w-full space-y-3 rounded-[var(--app-radius-element)] p-4 text-left" style={{ background: bg }}>
              {[
                { label: "姓名", value: verifiedData.name },
                { label: "部门", value: verifiedData.departmentName || "-" },
                { label: "课题组", value: verifiedData.projectGroupName || "-" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between text-sm">
                  <span style={{ color: secondary }}>{row.label}</span>
                  <span className="font-medium" style={{ color: primary }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex w-full flex-col gap-3">
              <button onClick={() => setStep("credentials")}
                className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98]"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                确认，设置账号
              </button>
              <button onClick={handleBackToQr}
                className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium transition active:scale-[0.98]"
                style={{ background: "var(--app-color-surface-hover)", color: secondary }}>
                重新验证
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Set Credentials */}
        {step === "credentials" && (
          <div>
            <h1 className="text-2xl font-bold" style={{ color: primary }}>设置账号密码</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>创建你的登录凭据，用于后续登录学生中心</p>
            <div className="mt-8 space-y-4">
              {[
                { label: "用户名", value: username, setter: setUsername, placeholder: "3-64 位，字母或数字", error: formErrors.username, type: "text", autoComplete: "username" },
                { label: "密码", value: password, setter: setPassword, placeholder: "至少 6 位", error: formErrors.password, type: "password", autoComplete: "new-password" },
                { label: "确认密码", value: confirmPassword, setter: setConfirmPassword, placeholder: "再次输入密码", error: formErrors.confirmPassword, type: "password", autoComplete: "new-password" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>{f.label}</label>
                  <input type={f.type} value={f.value}
                    onChange={(e) => { f.setter(e.target.value); setFormErrors({}); setRegisterError(null); }}
                    placeholder={f.placeholder} autoComplete={f.autoComplete}
                    className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none"
                    style={{ background: bg, borderColor: f.error ? "#ef4444" : border, color: primary }} />
                  {f.error && <p className="mt-1 text-xs" style={{ color: "#ef4444" }}>{f.error}</p>}
                </div>
              ))}
              <button onClick={handleRegister} disabled={submitting}
                className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                {submitting ? "注册中..." : "完成注册"}
              </button>
              {registerError && (
                <div className="mt-3 text-sm text-center rounded-[var(--app-radius-sm)] px-3 py-2" style={{ background: needsActivation ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)" }}>
                  <p style={{ color: needsActivation ? "#d97706" : "#ef4444" }}>{registerError}</p>
                  {needsActivation && (
                    <Link to="/m/activate" className="inline-block mt-1 font-medium hover:underline" style={{ color: accent }}>
                      前往激活页面设置密码 →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === "success" && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full p-4" style={{ background: "rgba(34,197,94,0.1)" }}>
              <CheckCircle className="h-16 w-16" style={{ color: "#22c55e" }} />
            </div>
            <h1 className="mt-6 text-2xl font-bold" style={{ color: primary }}>注册成功！</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>正在跳转...</p>
          </div>
        )}
      </div>
    </div>
  );
}
