import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { StudentButton, StudentInput, StudentSelect, showToast } from "./ui";
import { authStorage } from "@/features/auth/authStorage";
import { registerNewUser, type AuthUserInfo } from "@/api/domains/auth.api";

const GENDER_OPTIONS = [
  { value: "0", label: "未知" },
  { value: "1", label: "男" },
  { value: "2", label: "女" },
];

/** 新人员注册表单：姓名/手机号/性别/工号/邮箱/密码，受后端 app.registration.open 总闸门控制。 */
export default function NewUserRegisterForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [gender, setGender] = useState("0");
  const [jobNumber, setJobNumber] = useState(params.get("jobNumber") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    username?: string;
    name?: string;
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
    if (!mobilePhone.trim()) errors.mobilePhone = "手机号不能为空";
    if (password.length < 6) errors.password = "密码长度至少 6 位";
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

      <div className="mt-8 space-y-4" onKeyDown={handleEnter}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
            账号名
          </label>
          <StudentInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="3-64 位，用作登录名"
            error={formErrors.username}
            autoComplete="username"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
            姓名
          </label>
          <StudentInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="真实姓名"
            error={formErrors.name}
            autoComplete="name"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
            手机号
          </label>
          <StudentInput
            value={mobilePhone}
            onChange={(e) => setMobilePhone(e.target.value)}
            placeholder="手机号（也可以用它登录）"
            error={formErrors.mobilePhone}
            autoComplete="tel"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
            性别
          </label>
          <StudentSelect
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            options={GENDER_OPTIONS}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
            工号 / 学号
          </label>
          <StudentInput
            value={jobNumber}
            onChange={(e) => setJobNumber(e.target.value)}
            placeholder="选填"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">
            邮箱
          </label>
          <StudentInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="选填"
            autoComplete="email"
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
