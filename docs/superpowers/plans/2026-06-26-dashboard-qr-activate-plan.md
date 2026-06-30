# 大屏二维码轮播 + 学生账号激活 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** A) Dashboard 右下角 NestedPieChart ↔ QR 码双页轮播；B) 无密码学生账号激活流程（QR 验证 → 设用户名密码 → 登录）

**Architecture:** Feature A 纯前端（1 新组件 + DashboardPage 1 行替换，复用已安装的 qrcode.react）。Feature B 全栈：后端 StudentRegistrationService 新增 activate() 方法 UPDATE 已有 sys_user（非 INSERT），前端新增 /m/activate 三步向导页，登录/注册页加返回按钮。

**Tech Stack:** React + TypeScript + GSAP + qrcode.react, Spring Boot + MyBatis + BCrypt

---

## Task A1: 创建 DashboardQrCarousel 轮播组件

**Files:**
- Create: `frontend/src/features/dashboard/DashboardQrCarousel.tsx`

- [ ] **Step 1: 创建 DashboardQrCarousel.tsx**

```typescript
// frontend/src/features/dashboard/DashboardQrCarousel.tsx
import { useState, useEffect, useRef, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  qrUrl: string;
  children: ReactNode; // Page 1 content (NestedPieChart)
}

export default function DashboardQrCarousel({ qrUrl, children }: Props) {
  const [page, setPage] = useState<0 | 1>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setPage((prev) => (prev === 0 ? 1 : 0));
    }, 8000);
  };

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const switchTo = (p: 0 | 1) => {
    setPage(p);
    resetTimer();
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Page content with GSAP fade handled via CSS transition for simplicity */}
      <div className="flex-1 min-h-0 relative">
        <div
          className="absolute inset-0 transition-opacity duration-400"
          style={{ opacity: page === 0 ? 1 : 0, pointerEvents: page === 0 ? "auto" : "none" }}
        >
          {children}
        </div>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 transition-opacity duration-400"
          style={{ opacity: page === 1 ? 1 : 0, pointerEvents: page === 1 ? "auto" : "none" }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--app-color-text-primary)" }}>
            学生手机端入口
          </p>
          <div className="rounded-xl p-3" style={{ background: "#fff" }}>
            <QRCodeSVG
              value={qrUrl}
              size={160}
              level="M"
              includeMargin
            />
          </div>
          <p className="text-xs text-center" style={{ color: "var(--app-color-text-secondary)" }}>
            打开微信扫一扫，直接进入学生中心
          </p>
        </div>
      </div>
      {/* Dots */}
      <div className="flex justify-center gap-2 py-2">
        <button
          onClick={() => switchTo(0)}
          className="w-2 h-2 rounded-full transition-colors"
          style={{ background: page === 0 ? "var(--app-color-accent)" : "var(--app-color-border-default)" }}
        />
        <button
          onClick={() => switchTo(1)}
          className="w-2 h-2 rounded-full transition-colors"
          style={{ background: page === 1 ? "var(--app-color-accent)" : "var(--app-color-border-default)" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 修改 DashboardPage.tsx — 替换右下角**

将 `pages/DashboardPage.tsx` 中约 289-293 行：

**替换前：**
```tsx
                    <div className="flex min-h-0 flex-[4] dash-card">
                        <GlassCard blobColor="rgba(45,92,247,0.3)">
                            <NestedPieChart />
                        </GlassCard>
                    </div>
```

**替换后：**
```tsx
                    <div className="flex min-h-0 flex-[4] dash-card">
                        <GlassCard blobColor="rgba(45,92,247,0.3)">
                            <DashboardQrCarousel qrUrl={`${window.location.origin}/#/m/login`}>
                                <NestedPieChart />
                            </DashboardQrCarousel>
                        </GlassCard>
                    </div>
```

并在文件顶部新增导入：
```typescript
import DashboardQrCarousel from '@/features/dashboard/DashboardQrCarousel';
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: 无错误。

---

## Task B1: 后端 — DTO + Service + Controller

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentActivateRequest.java`
- Modify: `src/main/java/com/example/demo/modules/student/service/StudentRegistrationService.java`
- Modify: `src/main/java/com/example/demo/modules/student/controller/StudentAuthController.java`

- [ ] **Step 1: 创建 StudentActivateRequest.java**

```java
// src/main/java/com/example/demo/modules/student/dto/StudentActivateRequest.java
package com.example.demo.modules.student.dto;

public class StudentActivateRequest {
    private String userId;
    private String username;
    private String password;

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
```

- [ ] **Step 2: StudentRegistrationService — 新增 activate() 方法**

在 `StudentRegistrationService.java` 的 `register()` 方法之后、`isPersonnelExists()` 之前插入：

```java
    /**
     * 学生激活（设密码）：对已存在但无密码的学生账号 UPDATE 而非 INSERT
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<?> activate(StudentActivateRequest req) {
        if (req == null || !StringUtils.hasText(req.getUserId())) {
            return Result.fail(400, "用户ID(user_id)不能为空");
        }
        if (!DIGIT_19.matcher(req.getUserId()).matches()) {
            return Result.fail(400, "用户ID(user_id)必须为19位数字");
        }
        if (!StringUtils.hasText(req.getUsername())) {
            return Result.fail(400, "用户名不能为空");
        }
        if (!StringUtils.hasText(req.getPassword())) {
            return Result.fail(400, "密码不能为空");
        }
        if (req.getPassword().length() < 6) {
            return Result.fail(400, "密码长度不能少于6位");
        }

        String username = req.getUsername().trim();
        if (username.length() < 3 || username.length() > 64) {
            return Result.fail(400, "用户名长度需在3-64个字符之间");
        }

        String userId = req.getUserId();

        // 1. 必须存在 sys_user 记录
        User existing = userMapper.findById(userId);
        if (existing == null) {
            return Result.fail(404, "未找到该学生账号，请先通过微信或管理员完成身份绑定");
        }

        // 2. 已有密码 → 不允许重复激活
        if (StringUtils.hasText(existing.getPassword())) {
            return Result.fail(409, "该账号已激活，请直接登录");
        }

        // 3. username 不能被其他人占用（允许自身已有 username 的情况）
        User byUsername = userMapper.findByUsername(username);
        if (byUsername != null && !byUsername.getId().equals(userId)) {
            return Result.fail(400, "用户名已被使用");
        }

        // 4. UPDATE: 设 username + password + authProfile
        existing.setUsername(username);
        existing.setPassword(passwordCredentialService.encodeForStorage(req.getPassword()));
        existing.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        userMapper.updateUser(existing);

        // 5. 重新查一次确保数据一致，生成 JWT 返回
        User updated = userMapper.findById(userId);
        if (updated == null) {
            return Result.error("激活失败，请稍后重试");
        }
        updated.setRole(authService.normalizeRole(updated.getRole()));
        return authService.generateAuthResult(updated);
    }
```

需要新增导入（在文件顶部）：
```java
import com.example.demo.modules.student.dto.StudentActivateRequest;
```

检查 `UserMapper` 是否有 `updateUser` 方法——若没有，需新增。通常 MyBatis 项目中 UserMapper 会有 update 方法。需验证。

- [ ] **Step 3: StudentAuthController — 新增 activate 端点**

在 `StudentAuthController.java` 的 `register()` 方法后、类结束 `}` 前插入：

```java
    @PostMapping("/activate")
    @Operation(summary = "学生激活（已有账号设密码）")
    public Result<?> activate(@RequestBody StudentActivateRequest request) {
        return studentRegistrationService.activate(request);
    }
```

需新增导入：
```java
import com.example.demo.modules.student.dto.StudentActivateRequest;
```

- [ ] **Step 4: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS。若 `userMapper.updateUser` 不存在，根据编译错误补全 Mapper。

---

## Task B2: 前端 API — 新增 activateStudent

**Files:**
- Modify: `frontend/src/features/student/api/student.api.ts`

- [ ] **Step 1: 新增 activateStudent 函数**

在 `student.api.ts` 的 `registerStudent()` 函数之后插入：

```typescript
/**
 * 学生激活（已有账号设密码，UPDATE 而非 INSERT）
 * POST /api/auth/register/student/activate
 */
export async function activateStudent(
  userId: string,
  username: string,
  password: string
): Promise<Result<{ token: string; role: string; userInfo: unknown }>> {
  const res = await authHttp.post<Result<{ token: string; role: string; userInfo: unknown }>>(
    "/auth/register/student/activate",
    { userId, username, password }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "激活失败");
  }
  return res.data;
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

---

## Task B3: 创建 MobileActivatePage + 路由

**Files:**
- Create: `frontend/src/pages/mobile/auth/MobileActivatePage.tsx`
- Modify: `frontend/src/router/index.tsx`

- [ ] **Step 1: 创建 MobileActivatePage.tsx**

```typescript
// frontend/src/pages/mobile/auth/MobileActivatePage.tsx
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { QrUploader } from "@/features/student/components/qr";
import { authStorage } from "@/features/auth/authStorage";
import { activateStudent } from "@/features/student/api";
import type { AuthUserInfo } from "@/api/domains/auth.api";

type Step = "qr" | "credentials" | "success";

interface VerifiedData {
  userId: string;
  name: string;
  departmentName: string;
  projectGroupName: string;
}

export default function MobileActivatePage() {
  const navigate = useNavigate();
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
      alert(message);
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
  const inputStyle = { background: bg, borderColor: border, color: primary };
  const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-5 overflow-y-auto" style={{ background: bg, fontFamily }}>
      {/* Back button */}
      <button
        onClick={() => step === "qr" ? navigate("/m/login") : setStep("qr")}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95"
        style={{ background: "rgba(0,0,0,0.06)" }}
      >
        <ArrowLeft className="size-5" style={{ color: primary }} />
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

        {/* Step 2: Confirm + Set Credentials */}
        {step === "credentials" && verifiedData && (
          <div>
            <h1 className="text-2xl font-bold" style={{ color: primary }}>确认身份并设置密码</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>请确认你的身份信息，然后设置登录凭据</p>

            {/* Identity card */}
            <div className="mt-4 w-full space-y-2 rounded-[var(--app-radius-sm)] p-4 text-left" style={{ background: bg }}>
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4" style={{ color: "#22c55e" }} />
                <span className="font-medium text-base" style={{ color: primary }}>{verifiedData.name}</span>
              </div>
              <p className="text-xs" style={{ color: secondary }}>
                {verifiedData.departmentName || ""}{verifiedData.projectGroupName ? " · " + verifiedData.projectGroupName : ""}
              </p>
              <p className="text-xs mt-1" style={{ color: secondary }}>确认这是你的账号吗？</p>
            </div>

            <div className="mt-6 space-y-4">
              {[
                { label: "用户名", value: username, setter: setUsername, placeholder: "3-64 位", error: formErrors.username, type: "text", autoComplete: "username" },
                { label: "密码", value: password, setter: setPassword, placeholder: "至少 6 位", error: formErrors.password, type: "password", autoComplete: "new-password" },
                { label: "确认密码", value: confirmPassword, setter: setConfirmPassword, placeholder: "再次输入密码", error: formErrors.confirmPassword, type: "password", autoComplete: "new-password" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>{f.label}</label>
                  <input type={f.type} value={f.value}
                    onChange={(e) => { f.setter(e.target.value); setFormErrors({}); }}
                    placeholder={f.placeholder} autoComplete={f.autoComplete}
                    className="w-full rounded-[var(--app-radius-sm)] border px-3 py-2.5 text-base outline-none"
                    style={{ background: bg, borderColor: f.error ? "#ef4444" : border, color: primary }} />
                  {f.error && <p className="mt-1 text-xs" style={{ color: "#ef4444" }}>{f.error}</p>}
                </div>
              ))}
              <button onClick={handleActivate} disabled={submitting}
                className="w-full rounded-[var(--app-radius-sm)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
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
```

- [ ] **Step 2: 新增路由**

在 `router/index.tsx` 中，`/m/register` 路由后面新增：

```typescript
import MobileActivatePage from "@/pages/mobile/auth/MobileActivatePage";
```

并在路由数组中，`/m/register` 之后插入：
```typescript
{ path: "/m/activate", element: <MobileActivatePage /> },
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

---

## Task B4: 登录页加激活入口 + 所有页面加返回按钮

**Files:**
- Modify: `frontend/src/pages/mobile/auth/MobileLoginPage.tsx`
- Modify: `frontend/src/pages/mobile/auth/MobileRegisterPage.tsx`

- [ ] **Step 1: MobileLoginPage — 新增激活链接**

在 `MobileLoginPage.tsx` 的底部链接区域，找到：
```tsx
<p style={{ color: secondary }}>
  还没有账号？
  <Link to="/m/register" ...>立即注册</Link>
</p>
```

在其后新增：
```tsx
<p style={{ color: secondary }}>
  已有身份但未设密码？
  <Link to="/m/activate" className="ml-1 font-medium hover:underline" style={{ color: accent }}>激活账号</Link>
</p>
```

- [ ] **Step 2: MobileRegisterPage — 加返回按钮**

在 `MobileRegisterPage.tsx` 的根 `<div>` 内部、卡片之前，新增返回按钮：

```tsx
import { ArrowLeft } from "lucide-react";

// 在 fixed inset-0 div 内、卡片 div 之前:
<button
  onClick={() => step === "qr" ? navigate("/m/login") : step === "confirm" ? (setVerifiedData(null), setStep("qr")) : setStep("credentials" ? "confirm" : "qr")}
  className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95"
  style={{ background: "rgba(0,0,0,0.06)" }}
>
  <ArrowLeft className="size-5" style={{ color: primary }} />
</button>
```

实际逻辑简化：返回按钮始终回到上一步或 `/m/login`。最简单的实现：
```tsx
<button
  onClick={() => {
    if (step === "qr") navigate("/m/login");
    else if (step === "confirm") { setVerifiedData(null); setStep("qr"); }
    else if (step === "credentials") setStep("confirm");
  }}
  ...
>
```

- [ ] **Step 3: 验证编译 + 令牌合规**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
grep -rn 'bg-\[#\|bg-white\|bg-slate\|bg-gray\|bg-zinc' frontend/src/pages/mobile/auth/
```

Expected: 无类型错误 + 无硬编码颜色。

---

## Task B5: 最终验证

- [ ] **Step 1: 后端编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -3
```

- [ ] **Step 2: 前端编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: 路由顺序检查**

```bash
grep -n '/m/' frontend/src/router/index.tsx
```

Expected 顺序: `/m/sc` → `/m/login` → `/m/register` → `/m/activate` → `/m/home`

- [ ] **Step 4: G04 令牌合规**

```bash
grep -rn 'bg-\[#' frontend/src/pages/mobile/auth/ frontend/src/features/dashboard/DashboardQrCarousel.tsx
grep -rn 'bg-white\|bg-slate\|bg-gray\|bg-zinc' frontend/src/pages/mobile/auth/ frontend/src/features/dashboard/DashboardQrCarousel.tsx
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: dashboard QR carousel + student account activation flow"
```
