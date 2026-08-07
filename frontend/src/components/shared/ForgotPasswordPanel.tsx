/** 忘记密码面板 — 可嵌入登录抽屉、Portal弹窗、学生设置页 */
import { useState, useRef, useEffect, type FC } from "react";
import toast from "react-hot-toast";
import {
  forgotPasswordDecodeQr,
  forgotPasswordVerify,
  forgotPasswordReset,
  sendVerificationCode,
  forgotPasswordByEmailVerify,
  forgotPasswordByEmailReset,
} from "@/api/domains/auth.api";

/* ================================================================== */
/*  Theme tokens                                                        */
/* ================================================================== */

interface ThemeTokens {
  container: string;
  title: string;
  body: string;
  label: string;
  input: string;
  button: string;
  buttonDisabled: string;
  accent: string;
  accentHover: string;
  muted: string;
  mutedHover: string;
  card: string;
  cardHover: string;
  cardBorder: string;
  cardBorderHover: string;
  link: string;
  linkHover: string;
}

const THEMES: Record<string, ThemeTokens> = {
  /* Login drawer / Portal modal — dark gold */
  drawer: {
    container: "",
    title: "text-[#f3e9d8]",
    body: "text-[#b8a88c]",
    label: "text-[#e8dcc4]",
    input:
      "admin-login-input w-full border border-[#f5d76a]/30 bg-black/35 px-4 py-3 text-sm text-[#f8efd9] placeholder:text-[#b8a89a]",
    button:
      "admin-login-button-primary w-full border border-[#b8860b]/50 bg-gradient-to-r from-[#8b4513]/90 to-[#c9a227]/90 py-3 text-sm font-semibold text-[#1a0a06] shadow-md hover:from-[#a0522d] hover:to-[#e8c547]",
    buttonDisabled: "disabled:cursor-not-allowed disabled:opacity-60",
    accent: "text-[#e8c547]",
    accentHover: "hover:text-[#f5e6a8]",
    muted: "text-[#9a8b72]",
    mutedHover: "text-[#b8a88c]",
    card: "border-2 border-[#f5d76a]/20 bg-black/25",
    cardHover: "hover:border-[#f5d76a]/50 hover:bg-black/35",
    cardBorder: "border-[#f5d76a]/20",
    cardBorderHover: "hover:border-[#f5d76a]/50 hover:bg-black/35",
    link: "text-[#e8c547]",
    linkHover: "hover:text-[#f5e6a8]",
  },
  /* Student settings — uses --student-* tokens */
  student: {
    container: "space-y-3",
    title: "text-sm font-semibold",
    body: "text-xs",
    label: "text-xs font-medium",
    input:
      "w-full rounded-lg border border-[var(--student-border)] bg-[var(--student-surface)] px-3 py-2 text-sm text-[var(--student-ink)] placeholder:text-[var(--student-mute)]",
    button:
      "w-full rounded-lg bg-[var(--student-primary)] py-2.5 text-sm font-medium text-[var(--student-on-primary)] hover:opacity-90 transition-opacity",
    buttonDisabled: "disabled:opacity-50 disabled:cursor-not-allowed",
    accent: "",
    accentHover: "",
    muted: "text-[var(--student-mute)]",
    mutedHover: "text-[var(--student-ink)]",
    card:
      "rounded-lg border border-[var(--student-border)] bg-[var(--student-surface)] p-4 hover:border-[var(--student-primary)] cursor-pointer transition-colors",
    cardHover: "",
    cardBorder: "border-[var(--student-border)]",
    cardBorderHover: "",
    link: "text-[var(--student-primary)]",
    linkHover: "hover:underline",
  },
};

/* ================================================================== */
/*  Props                                                              */
/* ================================================================== */

export interface ForgotPasswordPanelProps {
  onBackToLogin: () => void;
  onResetSuccess: () => void;
  theme?: "drawer" | "student";
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

const ForgotPasswordPanel: FC<ForgotPasswordPanelProps> = ({
  onBackToLogin,
  onResetSuccess,
  theme = "drawer",
}) => {
  const t = THEMES[theme] || THEMES.drawer;

  /* ── state ── */
  const [forgotMethod, setForgotMethod] = useState<"qr" | "email" | null>(null);
  const [forgotUserId, setForgotUserId] = useState("");
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotVerified, setForgotVerified] = useState(false);
  const [forgotExistingUsername, setForgotExistingUsername] = useState("");
  const [forgotNewUsername, setForgotNewUsername] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotPersonnelName, setForgotPersonnelName] = useState("");
  const [forgotVerifying, setForgotVerifying] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrDecoded, setQrDecoded] = useState(false);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailCode, setForgotEmailCode] = useState("");
  const [forgotEmailSending, setForgotEmailSending] = useState(false);
  const [forgotEmailVerifying, setForgotEmailVerifying] = useState(false);
  const [forgotEmailCooldown, setForgotEmailCooldown] = useState(0);
  const [forgotEmailStep, setForgotEmailStep] = useState<"email" | "code" | "reset">("email");
  const [forgotEmailResetToken, setForgotEmailResetToken] = useState("");
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forgotQrRef = useRef<HTMLInputElement>(null);

  /* ── cleanup ── */
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  /* ── reset helpers ── */
  const resetAllFields = () => {
    setForgotUserId(""); setForgotPhone(""); setForgotVerified(false);
    setForgotPersonnelName(""); setQrDecoded(false);
    setForgotExistingUsername(""); setForgotNewUsername(""); setForgotNewPassword("");
    setForgotEmail(""); setForgotEmailCode("");
    setForgotEmailSending(false); setForgotEmailCooldown(0);
    setForgotEmailStep("email"); setForgotEmailResetToken("");
    if (cooldownTimerRef.current) { clearInterval(cooldownTimerRef.current); cooldownTimerRef.current = null; }
  };

  const backToMethodSelection = () => { setForgotMethod(null); resetAllFields(); };
  const exit = () => { resetAllFields(); onBackToLogin(); };

  /* ── handlers ── */
  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const result = await forgotPasswordDecodeQr(file);
      setForgotUserId(result.userId);
      setForgotPersonnelName(result.name || "");
      setQrDecoded(true);
      toast.success("二维码识别成功");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "二维码识别失败");
    } finally { setQrUploading(false); }
  };

  const handleForgotVerify = async () => {
    if (!forgotUserId.trim() || !forgotPhone.trim()) { toast.error("请输入用户ID和手机号"); return; }
    setForgotVerifying(true);
    try {
      const result = await forgotPasswordVerify(forgotUserId.trim(), forgotPhone.trim());
      if (result.verified) {
        setForgotVerified(true);
        setForgotExistingUsername(result.username);
        setForgotNewUsername(result.username);
        setForgotPersonnelName(result.name);
        toast.success("验证通过");
      } else { toast.error(result.message || "验证失败"); }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证请求失败");
    } finally { setForgotVerifying(false); }
  };

  const handleForgotReset = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 6) { toast.error("密码至少6位"); return; }
    setForgotSubmitting(true);
    try {
      const newUsername = forgotNewUsername.trim() !== forgotExistingUsername ? forgotNewUsername.trim() : undefined;
      await forgotPasswordReset(forgotUserId.trim(), forgotNewPassword, newUsername);
      toast.success("密码重置成功");
      onResetSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally { setForgotSubmitting(false); }
  };

  const handleSendCode = async () => {
    if (!forgotEmail.trim()) { toast.error("请输入邮箱地址"); return; }
    setForgotEmailSending(true);
    try {
      const result = await sendVerificationCode(forgotEmail.trim(), "FORGOT_PASSWORD");
      toast.success(result.message || "验证码已发送");
      setForgotEmailCooldown(result.cooldownSeconds || 60);
      setForgotEmailStep("code");
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = setInterval(() => {
        setForgotEmailCooldown((prev) => {
          if (prev <= 1) { if (cooldownTimerRef.current) { clearInterval(cooldownTimerRef.current); cooldownTimerRef.current = null; } return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) { toast.error(err?.message || "发送失败"); }
    finally { setForgotEmailSending(false); }
  };

  const handleEmailVerify = async () => {
    if (!forgotEmailCode.trim() || forgotEmailCode.length !== 6) { toast.error("请输入6位验证码"); return; }
    setForgotEmailVerifying(true);
    try {
      const result = await forgotPasswordByEmailVerify(forgotEmail.trim(), forgotEmailCode);
      setForgotEmailResetToken(result.resetToken);
      setForgotEmailStep("reset");
      toast.success("验证通过");
    } catch (err: any) { toast.error(err?.message || "验证失败"); }
    finally { setForgotEmailVerifying(false); }
  };

  const handleEmailReset = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 8) {
      toast.error("密码至少8位，需含大小写字母、数字、特殊符号中至少三类"); return;
    }
    setForgotSubmitting(true);
    try {
      await forgotPasswordByEmailReset(forgotEmailResetToken, forgotNewPassword);
      toast.success("密码重置成功");
      onResetSuccess();
    } catch (err: any) { toast.error(err?.message || "重置失败"); }
    finally { setForgotSubmitting(false); }
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  if (!forgotMethod) {
    /* ── Method Selection ── */
    return (
      <div className={t.container}>
        <p className={`mb-6 text-sm leading-relaxed ${t.body}`}>
          请选择一种方式验证身份后重置密码。
        </p>
        <div className="space-y-3">
          <button type="button" onClick={() => setForgotMethod("qr")}
            className={`w-full rounded px-5 py-4 text-left transition ${t.card} ${t.cardHover}`}>
            <div className={`text-base font-semibold ${t.title}`}>人员二维码 + 手机号</div>
            <div className={`mt-1 text-sm ${t.body}`}>上传身份二维码并验证登记手机号</div>
          </button>
          <button type="button" onClick={() => setForgotMethod("email")}
            className={`w-full rounded px-5 py-4 text-left transition ${t.card} ${t.cardHover}`}>
            <div className={`text-base font-semibold ${t.title}`}>绑定邮箱 + 验证码</div>
            <div className={`mt-1 text-sm ${t.body}`}>通过已绑定的邮箱接收验证码</div>
          </button>
        </div>
        <p className="mt-6 text-center text-sm">
          <button type="button" onClick={exit} className={`font-medium ${t.link} ${t.linkHover}`}>
            返回
          </button>
        </p>
      </div>
    );
  }

  if (forgotMethod === "qr") {
    return !forgotVerified ? (
      /* ── QR Step 1: verify ── */
      <div className={t.container}>
        <p className={`mb-6 text-sm leading-relaxed ${t.body}`}>
          请输入或上传二维码识别您的 19 位人员编号，并输入登记的手机号进行验证。
        </p>
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${t.label}`} htmlFor="fp-userid">人员编号（19 位）</label>
            <input id="fp-userid" type="text" inputMode="numeric" maxLength={19}
              value={forgotUserId}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 19); setForgotUserId(v); if (!v) { setForgotPersonnelName(""); setQrDecoded(false); } }}
              className={t.input} placeholder="手动输入 19 位人员编号" autoComplete="off" />
            {forgotPersonnelName ? <p className="mt-1.5 text-xs text-emerald-300/90">已识别：{forgotPersonnelName}</p> : null}
          </div>
          <div>
            <input ref={forgotQrRef} type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
            <button type="button" disabled={qrUploading} onClick={() => forgotQrRef.current?.click()}
              className={`w-full rounded border-2 border-dashed px-4 py-3 text-sm transition-colors disabled:opacity-50 ${t.cardBorder} ${t.cardBorderHover} ${t.muted} ${t.mutedHover}`}>
              {qrUploading ? "识别中..." : qrDecoded && forgotUserId ? "重新上传二维码" : "上传二维码自动填入"}
            </button>
          </div>
          <div>
            <label className={`mb-2 block text-sm font-medium ${t.label}`} htmlFor="fp-phone">登记手机号</label>
            <input id="fp-phone" type="text" value={forgotPhone}
              onChange={(e) => setForgotPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleForgotVerify(); }}
              className={t.input} placeholder="人员在库中登记的手机号" autoComplete="off" />
          </div>
          <button type="button" disabled={forgotVerifying || forgotUserId.trim().length === 0}
            onClick={() => void handleForgotVerify()}
            className={`${t.button} ${t.buttonDisabled}`}>
            {forgotVerifying ? "验证中..." : "验证"}
          </button>
        </div>
        <p className="mt-6 text-center text-sm">
          <button type="button" onClick={backToMethodSelection} className={`font-medium ${t.link} ${t.linkHover}`}>返回选择方式</button>
        </p>
      </div>
    ) : (
      /* ── QR Step 2: reset ── */
      <div className={t.container}>
        <p className={`mb-2 text-sm leading-relaxed ${t.body}`}>验证通过。请设置新密码。</p>
        {forgotPersonnelName ? <p className={`mb-4 text-sm ${t.title}`}>姓名：{forgotPersonnelName}</p> : null}
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${t.label}`}>登录账号（可修改）</label>
            <input type="text" value={forgotNewUsername} onChange={(e) => setForgotNewUsername(e.target.value)}
              className={t.input} maxLength={64} />
          </div>
          <div>
            <label className={`mb-2 block text-sm font-medium ${t.label}`}>新密码</label>
            <input type="password" value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleForgotReset(); }}
              className={t.input} placeholder="至少6位" autoComplete="new-password" />
          </div>
          <button type="button" disabled={forgotSubmitting}
            onClick={() => void handleForgotReset()}
            className={`${t.button} ${t.buttonDisabled}`}>
            {forgotSubmitting ? "重置中..." : "重置密码"}
          </button>
        </div>
        <p className="mt-6 text-center text-sm">
          <button type="button" onClick={backToMethodSelection} className={`font-medium ${t.link} ${t.linkHover}`}>返回选择方式</button>
        </p>
      </div>
    );
  }

  /* ── Email flow ── */
  if (forgotEmailStep === "email") {
    return (
      <div className={t.container}>
        <p className={`mb-6 text-sm leading-relaxed ${t.body}`}>请输入您已绑定的邮箱地址，我们将发送验证码。</p>
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${t.label}`} htmlFor="fp-email">已绑定邮箱</label>
            <input id="fp-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSendCode(); }}
              className={t.input} placeholder="请输入已绑定的邮箱地址" autoComplete="email" />
          </div>
          <button type="button" disabled={forgotEmailSending || forgotEmailCooldown > 0 || !forgotEmail.trim()}
            onClick={() => void handleSendCode()} className={`${t.button} ${t.buttonDisabled}`}>
            {forgotEmailSending ? "发送中..." : forgotEmailCooldown > 0 ? `${forgotEmailCooldown}s 后重发` : "发送验证码"}
          </button>
        </div>
        <p className="mt-6 text-center text-sm">
          <button type="button" onClick={backToMethodSelection} className={`font-medium ${t.link} ${t.linkHover}`}>返回选择方式</button>
        </p>
      </div>
    );
  }

  if (forgotEmailStep === "code") {
    return (
      <div className={t.container}>
        <p className={`mb-2 text-sm leading-relaxed ${t.body}`}>验证码已发送至 <span className={t.title}>{forgotEmail}</span></p>
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${t.label}`} htmlFor="fp-code">验证码</label>
            <input id="fp-code" type="text" inputMode="numeric" maxLength={6}
              value={forgotEmailCode} onChange={(e) => setForgotEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") void handleEmailVerify(); }}
              className="w-full border border-[var(--student-border)] bg-[var(--student-surface)] px-4 py-3 text-center text-lg tracking-[0.5em] text-[var(--student-ink)] placeholder:text-[var(--student-mute)] rounded-lg"
              placeholder="000000" autoComplete="one-time-code" />
          </div>
          <button type="button" disabled={forgotEmailCode.length !== 6 || forgotEmailVerifying}
            onClick={() => void handleEmailVerify()} className={`${t.button} ${t.buttonDisabled}`}>
            {forgotEmailVerifying ? "验证中..." : "验证"}
          </button>
          <button type="button" disabled={forgotEmailCooldown > 0 || forgotEmailSending}
            onClick={() => void handleSendCode()} className={`w-full text-sm transition ${t.link} ${t.linkHover}`}>
            {forgotEmailCooldown > 0 ? `${forgotEmailCooldown}s 后重发` : "重新发送验证码"}
          </button>
        </div>
        <p className="mt-4 text-center text-sm">
          <button type="button" onClick={backToMethodSelection} className={`font-medium ${t.link} ${t.linkHover}`}>返回选择方式</button>
        </p>
      </div>
    );
  }

  /* ── Email reset ── */
  return (
    <div className={t.container}>
      <p className={`mb-2 text-sm leading-relaxed ${t.body}`}>验证通过。请设置新密码。</p>
      <div className="space-y-4">
        <div>
          <label className={`mb-2 block text-sm font-medium ${t.label}`}>新密码</label>
          <input type="password" value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleEmailReset(); }}
            className={t.input} placeholder="至少8位，含大小写字母、数字、特殊符号中至少三类" autoComplete="new-password" />
        </div>
        <button type="button" disabled={forgotSubmitting}
          onClick={() => void handleEmailReset()} className={`${t.button} ${t.buttonDisabled}`}>
          {forgotSubmitting ? "重置中..." : "重置密码"}
        </button>
      </div>
      <p className="mt-6 text-center text-sm">
        <button type="button" onClick={exit} className={`font-medium ${t.link} ${t.linkHover}`}>返回</button>
      </p>
    </div>
  );
};

export default ForgotPasswordPanel;
