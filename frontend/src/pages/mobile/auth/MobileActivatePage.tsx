import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { QrUploader } from "@/features/student/components/qr";
import { authStorage } from "@/features/auth/authStorage";
import { activateStudent } from "@/features/student/api";
import type { AuthUserInfo } from "@/api/domains/auth.api";

import { appAlert } from "@/lib/appDialog";
type Step = "qr" | "credentials" | "success";

interface VerifiedData {
  userId: string;
  name: string;
  departmentName: string;
  projectGroupName: string;
}

export default function MobileActivatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPortal = (location.state as any)?.fromPortal === true;
  const [step, setStep] = useState<Step>("qr");
  const [verifiedData, setVerifiedData] = useState<VerifiedData | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ username?: string; password?: string; confirmPassword?: string }>({});

  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(() => navigate("/m/home", { replace: true }), 1500);
    return () => window.clearTimeout(timer);
  }, [step, navigate]);

  const handleVerified = (data: VerifiedData) => {
    setVerifiedData(data);
    setStep("credentials");
  };

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

  const handleActivate = async () => {
    if (!validateCredentials() || !verifiedData) return;
    try {
      setSubmitting(true);
      setFormErrors({});
      const result = await activateStudent(verifiedData.userId, username.trim(), password);
      authStorage.setAuth(result.data.token, result.data.role, result.data.userInfo as AuthUserInfo);
      authStorage.markLoginPortal("mobile");
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "激活失败，请重试";
      await appAlert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const bg = "var(--app-color-surface-page)";
  const cardBg = "var(--app-color-surface-container)";
  const primary = "var(--app-color-text-primary)";
  const secondary = "var(--app-color-text-secondary)";
  const accent = "var(--app-color-accent)";
  const border = "var(--app-color-border-default)";
  const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-5 overflow-y-auto" style={{ background: bg, fontFamily }}>
      {/* Back button */}
      <button
        onClick={() => {
          if (step === "qr") {
            if (fromPortal) navigate("/", { replace: true });
            else navigate("/m/login");
          } else {
            setStep("qr");
          }
        }}
        className="absolute top-4 left-4 z-10 flex items-center gap-1 px-3 py-2 rounded-full transition active:scale-95"
        style={{ background: "rgba(0,0,0,0.06)" }}
      >
        <ArrowLeft className="size-5" style={{ color: primary }} />
        {step === "qr" && fromPortal && <span className="text-sm" style={{ color: secondary }}>返回首页</span>}
      </button>

      <div className="w-full max-w-sm rounded-[var(--app-radius-container)] p-[var(--app-space-container-padding)]" style={{ background: cardBg }}>

        {/* Step 1: QR Upload */}
        {step === "qr" && (
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold" style={{ color: primary }}>激活账号</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>上传你的身份 QR 码验证身份，设置登录密码</p>
            <div className="mt-8 w-full"><QrUploader onVerified={handleVerified} /></div>
            <p className="mt-6 text-sm" style={{ color: secondary }}>
              已有账号？<Link to="/m/login" className="ml-1 font-medium hover:underline" style={{ color: accent }}>去登录</Link>
            </p>
          </div>
        )}

        {/* Step 2: Confirm Identity + Set Credentials */}
        {step === "credentials" && verifiedData && (
          <div>
            <h1 className="text-2xl font-bold" style={{ color: primary }}>创建登录账号</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>身份已验证通过。现在为你自己创建一个用户名和密码，之后用它登录学生中心</p>

            <div className="mt-4 w-full space-y-2 rounded-[var(--app-radius-element)] p-4 text-left" style={{ background: bg }}>
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4" style={{ color: "#22c55e" }} />
                <span className="font-medium text-base" style={{ color: primary }}>{verifiedData.name}</span>
              </div>
              <p className="text-xs" style={{ color: secondary }}>
                {[verifiedData.departmentName, verifiedData.projectGroupName].filter(Boolean).join(" · ") || ""}
              </p>
              <p className="text-xs mt-1" style={{ color: secondary }}>确认这是你的账号吗？</p>
            </div>

            <div className="mt-6 space-y-4">
              {[
                { label: "设置用户名", value: username, setter: setUsername, placeholder: "自定义一个登录用户名（3-64位）", error: formErrors.username, type: "text", autoComplete: "username" },
                { label: "密码", value: password, setter: setPassword, placeholder: "至少 6 位", error: formErrors.password, type: "password", autoComplete: "new-password" },
                { label: "确认密码", value: confirmPassword, setter: setConfirmPassword, placeholder: "再次输入密码", error: formErrors.confirmPassword, type: "password", autoComplete: "new-password" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>{f.label}</label>
                  <input type={f.type} value={f.value}
                    onChange={(e) => { f.setter(e.target.value); setFormErrors({}); }}
                    placeholder={f.placeholder} autoComplete={f.autoComplete}
                    className="w-full rounded-[var(--app-radius-element)] border px-3 py-2.5 text-base outline-none"
                    style={{ background: bg, borderColor: f.error ? "#ef4444" : border, color: primary }} />
                  {f.error && <p className="mt-1 text-xs" style={{ color: "#ef4444" }}>{f.error}</p>}
                </div>
              ))}
              <button onClick={handleActivate} disabled={submitting}
                className="w-full rounded-[var(--app-radius-element)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                {submitting ? "激活中..." : "激活并登录"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === "success" && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full p-4" style={{ background: "rgba(34,197,94,0.1)" }}>
              <CheckCircle className="h-16 w-16" style={{ color: "#22c55e" }} />
            </div>
            <h1 className="mt-6 text-2xl font-bold" style={{ color: primary }}>激活成功！</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>正在跳转...</p>
          </div>
        )}
      </div>
    </div>
  );
}
