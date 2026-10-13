import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, KeyRound, Mars, UserRound, Venus } from "lucide-react";
import { StudentButton, StudentInput, showToast } from "./ui";
import { PasswordRuleHint } from "./PasswordRuleHint";
import { cn } from "@/lib/utils";
import { PASSWORD_RULE_PLACEHOLDER, validatePassword } from "@/utils/passwordPolicy";
import { authStorage } from "@/features/auth/authStorage";
import { registerNewUser, type AuthUserInfo } from "@/api/domains/auth.api";

/** 后端性别码：0=未知、1=男、2=女。**不预选**，跳过就直接是「未知」 */
const GENDER_MALE = "1";
const GENDER_FEMALE = "2";
const GENDER_UNKNOWN = "0";

const GENDER_CHOICES = [
  { value: GENDER_MALE, label: "男", icon: Mars },
  { value: GENDER_FEMALE, label: "女", icon: Venus },
];

/** 表单分组标题：图标 + 标题 + 一条细线收尾，把「填谁」和「怎么登录」在视觉上分开 */
function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--student-primary)]" />
        <span className="shrink-0 text-xs font-semibold tracking-wide text-[var(--student-primary)]">
          {title}
        </span>
        <div className="h-px flex-1 bg-[var(--student-hairline)]" />
      </div>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children, optional }: { children: ReactNode; optional?: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-sm font-medium text-[var(--student-ink)]">{children}</span>
      {optional && (
        <span className="rounded-[var(--student-radius-pill)] bg-[var(--student-canvas-soft-2)] px-2 py-0.5 text-[11px] text-[var(--student-mute)]">
          选填
        </span>
      )}
    </div>
  );
}

/**
 * 性别：两个图形块，和姓名同行排。**必选**，与后端「性别不能为空」一致。
 */
function GenderPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {GENDER_CHOICES.map(({ value: v, label, icon: Icon }) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={selected}
            aria-label={label}
            onClick={() => onChange(v)}
            className={cn(
              "flex h-[38px] w-[72px] items-center justify-center gap-1.5 rounded-[var(--student-radius-md)] transition-all cursor-pointer",
              selected
                ? "bg-[var(--student-primary-soft)] ring-2 ring-[var(--student-primary)]"
                : "bg-[var(--student-surface-raised)] ring-1 ring-[var(--student-hairline)] hover:bg-[var(--student-canvas-soft-2)]",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 transition-colors",
                selected ? "text-[var(--student-primary)]" : "text-[var(--student-mute)]",
              )}
            />
            <span
              className={cn(
                "text-sm font-semibold transition-colors",
                selected ? "text-[var(--student-primary)]" : "text-[var(--student-body)]",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 新人员注册表单，受后端 app.registration.open 总闸门控制。
 *
 * <p>字段按「个人信息 → 登录凭据」两段排：先答「你是谁」，再答「怎么登录」。
 * 早前是账号名打头、姓名手机号夹在中间，填起来像在办证而不是注册。
 */
export default function NewUserRegisterForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [gender, setGender] = useState(GENDER_UNKNOWN);
  const [jobNumber, setJobNumber] = useState(params.get("jobNumber") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    username?: string;
    name?: string;
    gender?: string;
    mobilePhone?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // 统一认证引导过来的稳定标识：不回显，只随注册请求回传写绑定
  const idpUid = params.get("idpUid") ?? undefined;

  const validate = (): boolean => {
    const errors: typeof formErrors = {};
    const u = username.trim();
    if (!u || u.length < 3 || u.length > 64) errors.username = "账号名长度需在 3-64 个字符之间";
    if (!name.trim()) errors.name = "姓名不能为空";
    if (gender !== GENDER_MALE && gender !== GENDER_FEMALE) errors.gender = "请选择性别";
    if (!mobilePhone.trim()) errors.mobilePhone = "手机号不能为空";
    const pwError = validatePassword(password);
    if (pwError) errors.password = pwError;
    if (password !== confirmPassword) errors.confirmPassword = "两次输入的密码不一致";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    try {
      setSubmitting(true);
      setFormErrors({});
      const data = await registerNewUser({
        username: username.trim(),
        name: name.trim(),
        mobilePhone: mobilePhone.trim(),
        gender: Number(gender),
        jobNumber: jobNumber.trim() || undefined,
        email: email.trim() || undefined,
        password,
        idpUid,
      });
      authStorage.setAuth(data.token, data.role, data.userInfo as AuthUserInfo);
      authStorage.markLoginPortal("student");
      setSuccess(true);
      navigate("/student/home", { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "注册失败，请重试", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRegister();
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="rounded-full bg-[var(--student-success-soft)] p-4">
          <CheckCircle className="h-16 w-16 text-[var(--student-success)]" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-[var(--student-ink)]">注册成功！</h1>
        <p className="mt-2 text-sm text-[var(--student-mute)]">正在跳转...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--student-ink)]">新用户注册</h1>
      <p className="mt-2 text-sm text-[var(--student-mute)]">
        填写基本信息，创建学生中心账号
      </p>

      <div className="mt-7 space-y-6" onKeyDown={handleEnter}>
        <FormSection icon={UserRound} title="个人信息">
          {/* 姓名与性别同行：性别只有两个选项，占满一整行太费高度。
              用 items-start（不是 items-end）—— 姓名的错误提示挂在下面，items-end 会把性别一起拽下去 */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <FieldLabel>姓名</FieldLabel>
              <StudentInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="真实姓名"
                error={formErrors.name}
                autoComplete="name"
              />
            </div>
            <div className="shrink-0">
              <FieldLabel>性别</FieldLabel>
              <GenderPicker value={gender} onChange={setGender} />
            </div>
          </div>
          {formErrors.gender && (
            <p className="-mt-2 text-xs text-[var(--student-destructive)]">{formErrors.gender}</p>
          )}

          <div>
            <FieldLabel>手机号</FieldLabel>
            <StudentInput
              value={mobilePhone}
              onChange={(e) => setMobilePhone(e.target.value)}
              placeholder="手机号（也可以用它登录）"
              error={formErrors.mobilePhone}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>

          <div>
            <FieldLabel optional>工号 / 学号</FieldLabel>
            <StudentInput
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              placeholder="与人员库一致，便于对账"
              autoComplete="off"
            />
          </div>

          <div>
            <FieldLabel optional>邮箱</FieldLabel>
            <StudentInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="用于接收通知"
              inputMode="email"
              autoComplete="email"
            />
          </div>
        </FormSection>

        <FormSection icon={KeyRound} title="登录凭据">
          <div>
            <FieldLabel>账号名</FieldLabel>
            <StudentInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-64 位，用作登录名"
              error={formErrors.username}
              autoComplete="username"
            />
          </div>

          <div>
            <FieldLabel>密码</FieldLabel>
            <StudentInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={PASSWORD_RULE_PLACEHOLDER}
              error={formErrors.password}
              autoComplete="new-password"
            />
            <PasswordRuleHint password={password} />
          </div>

          <div>
            <FieldLabel>确认密码</FieldLabel>
            <StudentInput
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              error={formErrors.confirmPassword}
              autoComplete="new-password"
            />
          </div>
        </FormSection>

        <StudentButton onClick={handleRegister} disabled={submitting} className="w-full">
          {submitting ? "注册中..." : "完成注册"}
        </StudentButton>

        <p className="text-center text-sm text-[var(--student-mute)]">
          已有账号？
          <Link to="/" className="ml-1 font-medium text-[var(--student-primary)] hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
