# H5 学生统一登录入口 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 H5 移动端路由域新增学生登录/注册入口，复用 Web 端认证接口，JWT 认证后进入改造后的 H5 学生中心。

**Architecture:** 新建 `studentMobile.api.ts`（authHttp + `/api/student/mobile/`）+ `StudentMobileController.java`（17 个 JWT 端点，复用全部现有 Service）。新建 `MobileLoginPage` / `MobileRegisterPage` 两个 H5 页面。改造 `MobileStudentCenterPage` 支持 JWT 模式（profile + home 两请求替代聚合接口）。旧 token 链路零改动。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS, Spring Boot 3.5 + MyBatis, JWT via authHttp interceptors

---

## File Structure

```
新建:
  frontend/src/pages/mobile/auth/MobileLoginPage.tsx     ← H5 登录页
  frontend/src/pages/mobile/auth/MobileRegisterPage.tsx   ← H5 注册页（四步向导）
  frontend/src/api/domains/studentMobile.api.ts           ← JWT 版学生移动端 API
  src/main/java/.../student/controller/StudentMobileController.java ← 17 个 JWT 端点

修改:
  frontend/src/router/index.tsx              ← 新增 /m/login, /m/register, /m/home 路由
  frontend/src/pages/mobile/MobileStudentCenterPage.tsx ← 支持 JWT 模式
  frontend/src/pages/mobile/useMobileSocket.ts          ← JWT Bearer 替代 mobile token
  frontend/src/features/auth/authStorage.ts             ← AuthLoginPortal 类型加 "mobile"
  frontend/src/features/auth/postLoginNavigation.ts     ← RootEntryRedirect 支持 mobile portal

明确不修改:
  mobileStudent.api.ts / StudentMobileCenterController.java / 所有 Mobile*Tab.tsx
  auth.api.ts / student.api.ts / authHttp.ts / tokenRefresh.ts
```

---

## Task 1: 创建 JWT 版学生移动端 API 层

**Files:**
- Create: `frontend/src/api/domains/studentMobile.api.ts`

- [ ] **Step 1: 创建 studentMobile.api.ts**

```typescript
// frontend/src/api/domains/studentMobile.api.ts
import { authHttp } from "@/api/core/authHttp";
import type {
  MobileCenterProfile,
  MobileCenterStats,
  MobileCenterRoom,
  MobileCenterRecord,
  MobileCenterNotice,
  MobileRoomDashboardData,
  MobileRoomsData,
  MobileAccessRecordsData,
  MobileMaterialsData,
  MobileViolationsData,
  MobileAlertsData,
  MobileCageShelvesAllData,
  MobileAlertItem,
  MobileNoticeAutoSuppressPayload,
  MobileNoticeAutoSuppressResult,
} from "./mobileStudent.api";
import type { CageShelfDetail } from "@/features/student/api/student.api";
import { normalizeMobileCageShelfDetail } from "@/pages/mobile/mobileCageShelfGrid";
import type {
  StudentActivitySummary,
  StudentActivityResult,
  HeatmapCell,
  RoomUsageItem,
} from "@/api/domains/analytics.api";

const BASE = "/student/mobile";

// ---- 共享 ----

export async function fetchStudentMobileProfile(): Promise<MobileCenterProfile> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: MobileCenterProfile }>(
    `${BASE}/profile`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ---- 首页 ----

export interface StudentMobileHomeData {
  stats: MobileCenterStats;
  pinnedRooms: MobileCenterRoom[];
  recentRecords: MobileCenterRecord[];
  recentNotices: MobileCenterNotice[];
}

export async function fetchStudentMobileHome(): Promise<StudentMobileHomeData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: StudentMobileHomeData }>(
    `${BASE}/home`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ---- 房间 ----

export async function fetchStudentMobileRoomDashboard(): Promise<MobileRoomDashboardData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: MobileRoomDashboardData }>(
    `${BASE}/room-dashboard`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function fetchStudentMobileRooms(mode: "all" | "mine" = "all"): Promise<MobileRoomsData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: MobileRoomsData }>(
    `${BASE}/rooms?mode=${mode}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ---- 出入记录 ----

export async function fetchStudentMobileAccessRecords(page = 1, size = 20): Promise<MobileAccessRecordsData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message?: string; data: MobileAccessRecordsData }>(
    `${BASE}/access-records?page=${page}&size=${size}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ---- 物资 ----

export async function fetchStudentMobileMaterials(): Promise<MobileMaterialsData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message?: string; data: MobileMaterialsData }>(
    `${BASE}/materials`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function submitStudentMobileMaterialRequest(
  lines: { itemId: number; qty: number }[],
  applicantGroup?: string,
) {
  const resp = await authHttp.post<{ code: number; success: boolean; message?: string; data: unknown }>(
    `${BASE}/material/requests`,
    { lines, applicantGroup }
  );
  if (!resp.data.success) throw new Error(resp.data.message || "提交失败");
  return resp.data.data;
}

// ---- 笼架 ----

export async function fetchStudentMobileCageShelvesAll(): Promise<MobileCageShelvesAllData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: MobileCageShelvesAllData }>(
    `${BASE}/cage-shelves/all`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载笼架列表失败");
  return resp.data.data;
}

export async function fetchStudentMobileCageShelfDetail(shelveId: string): Promise<CageShelfDetail> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: Record<string, unknown> }>(
    `${BASE}/cage-shelves/${encodeURIComponent(shelveId)}/detail`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载笼架详情失败");
  return normalizeMobileCageShelfDetail(resp.data.data ?? {});
}

export async function fetchStudentMobileCageCellAnnotation(
  shelveId: string, x: number, y: number,
): Promise<Record<string, unknown> | null> {
  const resp = await authHttp.get<{ success: boolean; message?: string; data: Record<string, unknown> | null }>(
    `${BASE}/cage-shelves/${encodeURIComponent(shelveId)}/cells/${x}/${y}/annotation`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "获取标注失败");
  return resp.data.data ?? null;
}

export async function saveStudentMobileCageCellAnnotation(
  shelveId: string, x: number, y: number, position: string,
  data: { richText?: string; images?: string; aroRawData?: string },
): Promise<void> {
  const resp = await authHttp.put<{ success: boolean; message?: string }>(
    `${BASE}/cage-shelves/${encodeURIComponent(shelveId)}/cells/${x}/${y}/annotation`,
    { position, ...data }
  );
  if (!resp.data.success) throw new Error(resp.data.message || "保存标注失败");
}

// ---- 违规 ----

export async function fetchStudentMobileViolations(page = 1, size = 20): Promise<MobileViolationsData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: MobileViolationsData }>(
    `${BASE}/violations?page=${page}&size=${size}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ---- 公告 ----

export async function fetchStudentMobileAlerts(): Promise<MobileAlertsData> {
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: MobileAlertsData }>(
    `${BASE}/alerts`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function suppressStudentMobileNoticeAutoOpen(
  payload: MobileNoticeAutoSuppressPayload,
): Promise<MobileNoticeAutoSuppressResult> {
  const resp = await authHttp.post<{ code: number; success: boolean; message: string; data: MobileNoticeAutoSuppressResult }>(
    `${BASE}/notice-auto-suppress`, payload
  );
  if (!resp.data.success) throw new Error(resp.data.message || "保存失败");
  return resp.data.data;
}

// ---- 课题组活跃度 ----

export async function fetchStudentMobileGroupActivitySummary(
  params: { groupName: string; startTime: string; endTime: string; campus?: string },
): Promise<StudentActivitySummary> {
  const qs = new URLSearchParams({ groupName: params.groupName, startTime: params.startTime, endTime: params.endTime, campus: params.campus ?? "all" });
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: StudentActivitySummary }>(
    `${BASE}/group-activity/summary?${qs.toString()}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function fetchStudentMobileGroupActivityMembers(
  params: { groupName: string; startTime: string; endTime: string; sortBy?: string; order?: string; page?: number; size?: number },
): Promise<StudentActivityResult> {
  const qs = new URLSearchParams({
    groupName: params.groupName, startTime: params.startTime, endTime: params.endTime,
    sortBy: params.sortBy ?? "entries", order: params.order ?? "desc",
    page: String(params.page ?? 1), size: String(params.size ?? 10),
  });
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: StudentActivityResult }>(
    `${BASE}/group-activity/members?${qs.toString()}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function fetchStudentMobileGroupActivityHeatmap(
  params: { groupName: string; startTime: string; endTime: string },
): Promise<HeatmapCell[]> {
  const qs = new URLSearchParams({ groupName: params.groupName, startTime: params.startTime, endTime: params.endTime });
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: HeatmapCell[] }>(
    `${BASE}/group-activity/heatmap?${qs.toString()}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data ?? [];
}

export async function fetchStudentMobileGroupActivityRoomUsage(
  params: { groupName: string; startTime: string; endTime: string },
): Promise<RoomUsageItem[]> {
  const qs = new URLSearchParams({ groupName: params.groupName, startTime: params.startTime, endTime: params.endTime });
  const resp = await authHttp.get<{ code: number; success: boolean; message: string; data: RoomUsageItem[] }>(
    `${BASE}/group-activity/room-usage?${qs.toString()}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data ?? [];
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/api/domains/studentMobile.api.ts
```

Expected: 无类型错误（或仅有项目已有错误）。

---

## Task 2: 创建 H5 登录页面

**Files:**
- Create: `frontend/src/pages/mobile/auth/MobileLoginPage.tsx`

- [ ] **Step 1: 创建 MobileLoginPage.tsx**

```typescript
// frontend/src/pages/mobile/auth/MobileLoginPage.tsx
import { useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginWeb } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";
import { showToast } from "@/features/student/components/ui";

export default function MobileLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const doLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setError("请输入账号和密码");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const data = await loginWeb(username.trim(), password);

      if (data.role !== "STUDENT") {
        setError("请使用学生登录入口，教职工请从 Web 端登录");
        return;
      }

      authStorage.setAuth(data.token, data.role, data.userInfo);
      authStorage.markLoginPortal("mobile");
      navigate("/m/home", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "登录失败";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [username, password, navigate]);

  const handleUsernameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); passwordRef.current?.focus(); }
  };
  const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); doLogin(); }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-5"
      style={{
        background: "var(--app-color-surface-page)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      }}
    >
      <div
        className="w-full max-w-sm rounded-[var(--app-radius-container)] p-[var(--app-space-container-padding)]"
        style={{ background: "var(--app-color-surface-container)" }}
      >
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-bold" style={{ color: "var(--app-color-text-primary)" }}>学生登录</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--app-color-text-secondary)" }}>使用你的账号密码登录</p>
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--app-color-text-primary)" }}>用户名</label>
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              onKeyDown={handleUsernameKeyDown}
              placeholder="请输入用户名"
              autoComplete="username"
              className="w-full rounded-[var(--app-radius-sm)] border px-3 py-2.5 text-base outline-none transition-colors"
              style={{
                background: "var(--app-color-surface-page)",
                borderColor: "var(--app-color-border-primary)",
                color: "var(--app-color-text-primary)",
              }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--app-color-text-primary)" }}>密码</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              onKeyDown={handlePasswordKeyDown}
              placeholder="请输入密码"
              autoComplete="current-password"
              className="w-full rounded-[var(--app-radius-sm)] border px-3 py-2.5 text-base outline-none transition-colors"
              style={{
                background: "var(--app-color-surface-page)",
                borderColor: "var(--app-color-border-primary)",
                color: "var(--app-color-text-primary)",
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-center rounded-[var(--app-radius-sm)] px-3 py-2" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
              {error}
            </p>
          )}

          <button
            onClick={doLogin}
            disabled={submitting}
            className="w-full rounded-[var(--app-radius-sm)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, var(--app-color-accent), var(--app-color-accent-secondary, var(--app-color-accent)))" }}
          >
            {submitting ? "登录中..." : "登 录"}
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <p style={{ color: "var(--app-color-text-secondary)" }}>
            还没有账号？
            <Link to="/m/register" className="ml-1 font-medium hover:underline" style={{ color: "var(--app-color-accent)" }}>立即注册</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/pages/mobile/auth/MobileLoginPage.tsx
```

Expected: 无类型错误。

---

## Task 3: 创建 H5 注册页面

**Files:**
- Create: `frontend/src/pages/mobile/auth/MobileRegisterPage.tsx`

- [ ] **Step 1: 创建 MobileRegisterPage.tsx**

```typescript
// frontend/src/pages/mobile/auth/MobileRegisterPage.tsx
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { QrUploader } from "@/features/student/components/qr";
import { showToast } from "@/features/student/components/ui";
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

  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(() => navigate("/m/home", { replace: true }), 1500);
    return () => window.clearTimeout(timer);
  }, [step, navigate]);

  const handleVerified = (data: VerifiedData) => { setVerifiedData(data); setStep("confirm"); };
  const handleBackToQr = () => { setVerifiedData(null); setStep("qr"); };

  const validateCredentials = (): boolean => {
    const errors: typeof formErrors = {};
    if (!username.trim() || username.trim().length < 3 || username.trim().length > 64) errors.username = "用户名长度需在 3-64 位之间";
    if (!password || password.length < 6) errors.password = "密码长度至少 6 位";
    if (password !== confirmPassword) errors.confirmPassword = "两次输入的密码不一致";
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
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const bg = "var(--app-color-surface-page)";
  const cardBg = "var(--app-color-surface-container)";
  const primary = "var(--app-color-text-primary)";
  const secondary = "var(--app-color-text-secondary)";
  const accent = "var(--app-color-accent)";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-5" style={{ background: bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" }}>
      <div className="w-full max-w-sm rounded-[var(--app-radius-container)] p-[var(--app-space-container-padding)]" style={{ background: cardBg }}>

        {/* Step 1: QR Upload */}
        {step === "qr" && (
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold" style={{ color: primary }}>学生注册</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>上传你的身份 QR 码进行验证，开始注册账号</p>
            <div className="mt-8 w-full"><QrUploader onVerified={handleVerified} /></div>
            <p className="mt-6 text-sm" style={{ color: secondary }}>已有账号？<Link to="/m/login" className="ml-1 font-medium hover:underline" style={{ color: accent }}>去登录</Link></p>
          </div>
        )}

        {/* Step 2: Confirm Identity */}
        {step === "confirm" && verifiedData && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full p-3" style={{ background: "rgba(34,197,94,0.1)" }}><CheckCircle className="h-12 w-12" style={{ color: "#22c55e" }} /></div>
            <h1 className="mt-4 text-2xl font-bold" style={{ color: primary }}>身份验证通过</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>请确认以下信息是否正确</p>
            <div className="mt-6 w-full space-y-3 rounded-[var(--app-radius-sm)] p-4 text-left" style={{ background: bg }}>
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
              <button onClick={() => setStep("credentials")} className="w-full rounded-[var(--app-radius-sm)] py-3 text-base font-medium text-white transition active:scale-[0.98]" style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>确认，设置账号</button>
              <button onClick={handleBackToQr} className="w-full rounded-[var(--app-radius-sm)] py-3 text-base font-medium transition active:scale-[0.98]" style={{ background: "var(--app-color-surface-hover)", color: secondary }}>重新验证</button>
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
                { label: "用户名", value: username, setter: setUsername, placeholder: "3-64 位，字母或数字", error: formErrors.username, autoComplete: "username", type: "text" as const },
                { label: "密码", value: password, setter: setPassword, placeholder: "至少 6 位", error: formErrors.password, autoComplete: "new-password", type: "password" as const },
                { label: "确认密码", value: confirmPassword, setter: setConfirmPassword, placeholder: "再次输入密码", error: formErrors.confirmPassword, autoComplete: "new-password", type: "password" as const },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: primary }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={f.value}
                    onChange={(e) => { f.setter(e.target.value); setFormErrors({}); }}
                    placeholder={f.placeholder}
                    autoComplete={f.autoComplete}
                    className="w-full rounded-[var(--app-radius-sm)] border px-3 py-2.5 text-base outline-none"
                    style={{ background: bg, borderColor: f.error ? "#ef4444" : "var(--app-color-border-primary)", color: primary }}
                  />
                  {f.error && <p className="mt-1 text-xs" style={{ color: "#ef4444" }}>{f.error}</p>}
                </div>
              ))}
              <button onClick={handleRegister} disabled={submitting} className="w-full rounded-[var(--app-radius-sm)] py-3 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${accent}, ${accent})` }}>
                {submitting ? "注册中..." : "完成注册"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === "success" && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full p-4" style={{ background: "rgba(34,197,94,0.1)" }}><CheckCircle className="h-16 w-16" style={{ color: "#22c55e" }} /></div>
            <h1 className="mt-6 text-2xl font-bold" style={{ color: primary }}>注册成功！</h1>
            <p className="mt-2 text-sm" style={{ color: secondary }}>正在跳转...</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/pages/mobile/auth/MobileRegisterPage.tsx
```

Expected: 无类型错误。

---

## Task 4: 修改 authStorage — 支持 "mobile" portal

**Files:**
- Modify: `frontend/src/features/auth/authStorage.ts:17`

- [ ] **Step 1: 扩展 AuthLoginPortal 类型**

将第 17 行：
```typescript
export type AuthLoginPortal = "staff" | "student";
```
改为：
```typescript
export type AuthLoginPortal = "staff" | "student" | "mobile";
```

同时将 `getLoginPortal()` 方法中的校验（第 89 行）：
```typescript
return v === "staff" || v === "student" ? v : null;
```
改为：
```typescript
return v === "staff" || v === "student" || v === "mobile" ? v : null;
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 无新增类型错误。

---

## Task 5: 修改 postLoginNavigation — mobile portal 跳转

**Files:**
- Modify: `frontend/src/features/auth/postLoginNavigation.ts:11-14`

- [ ] **Step 1: 增加 mobile portal 分支**

在 `resolveRootEntryPath` 函数中，在 student 检查之前插入 mobile 检查：

```typescript
export function resolveRootEntryPath(role: string): string {
  const portal = authStorage.getLoginPortal();
  if (portal === "mobile" && !hasMinRole(role, "STAFF")) {
    return "/m/home";
  }
  if (portal === "student" && !hasMinRole(role, "STAFF")) {
    return "/student/home";
  }
  if (portal === "staff" || hasMinRole(role, "STAFF")) {
    return `${STAFF_NS}/dashboard`;
  }
  return "/student/home";
}
```

- [ ] **Step 2: 同样更新 resolveDefaultPathAfterLogin**

在 `resolveDefaultPathAfterLogin` 函数中做同样的插入：

```typescript
export async function resolveDefaultPathAfterLogin(role: string): Promise<string> {
  const portal = authStorage.getLoginPortal();
  if (portal === "mobile" && !hasMinRole(role, "STAFF")) {
    return "/m/home";
  }
  if (portal === "student" && !hasMinRole(role, "STAFF")) {
    return "/student/home";
  }
  // ... rest unchanged
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/features/auth/postLoginNavigation.ts
```

Expected: 无类型错误。

---

## Task 6: 修改路由 — 新增 /m/login, /m/register, /m/home

**Files:**
- Modify: `frontend/src/router/index.tsx`

- [ ] **Step 1: 新增导入**

在 router/index.tsx 顶部新增两行导入（放在 MobileStudentCenterRoute 导入行之后）：

```typescript
import MobileLoginPage from "@/pages/mobile/auth/MobileLoginPage";
import MobileRegisterPage from "@/pages/mobile/auth/MobileRegisterPage";
```

- [ ] **Step 2: 新增路由**

在公开路由区域（`/m/sc/:token` 行之后，`/login` 行之前）插入三条新路由：

```typescript
{ path: "/m/login", element: <MobileLoginPage /> },
{ path: "/m/register", element: <MobileRegisterPage /> },
{ path: "/m/home", element: <AuthGuard requireRole="STUDENT"><MobileStudentCenterPage /></AuthGuard> },
```

注意：`/m/home` 使用 `MobileStudentCenterPage` 作为元素，但**不传 `token` prop**（区别于 `MobileStudentCenterRoute` 包装器从 URL params 提取 token）。`MobileStudentCenterPage` 检测不到 token 时自动进入 JWT 模式。

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/router/index.tsx
```

Expected: 无类型错误。

---

## Task 7: 改造 MobileStudentCenterPage — 支持 JWT 模式

**Files:**
- Modify: `frontend/src/pages/mobile/MobileStudentCenterPage.tsx`

- [ ] **Step 1: 新增导入**

在现有导入之后添加：

```typescript
import * as studentMobileApi from "@/api/domains/studentMobile.api";
import { hasMobileHtml5Privilege } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
```

- [ ] **Step 2: 新增 JWT 模式数据加载函数**

在 `PageError` 组件之后、`WatermarkLogo` 之前添加两个新函数：

```typescript
/** JWT 模式下加载首页数据（profile + home 并行） */
async function loadJwtHomeData(): Promise<{
  profile: import("@/api/domains/mobileStudent.api").MobileCenterProfile;
  home: import("@/api/domains/studentMobile.api").StudentMobileHomeData;
}> {
  const [profile, home] = await Promise.all([
    studentMobileApi.fetchStudentMobileProfile(),
    studentMobileApi.fetchStudentMobileHome(),
  ]);
  return { profile, home };
}

/** JWT 模式下加载公告 */
async function loadJwtAlerts(): Promise<import("@/api/domains/mobileStudent.api").MobileAlertsData> {
  return studentMobileApi.fetchStudentMobileAlerts();
}
```

- [ ] **Step 3: 修改 load 函数 — 检测 JWT 模式**

用以下逻辑替换 `load` 函数内部（第 127–147 行）：

```typescript
const load = useCallback(async () => {
  // JWT 模式：无 token 参数，有 JWT（AuthGuard 已确保）
  if (!token) {
    if (!authStorage.hasToken()) {
      setLoading(false);
      setError("请先登录");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [homeData, b] = await Promise.all([
        loadJwtHomeData(),
        fetchLoginBranding().catch(() => null),
      ]);
      // 组装为 MobileCenterData 兼容结构
      const jwtData: MobileCenterData = {
        dashboard: {
          profile: homeData.profile,
          stats: homeData.home.stats,
          pinnedRooms: homeData.home.pinnedRooms,
          recentRecords: homeData.home.recentRecords,
          recentNotices: homeData.home.recentNotices,
        },
        expiresAt: "",
        userId: authStorage.getUserInfo()?.id,
        html5PrivilegeBypass: hasMobileHtml5Privilege(authStorage.getRole()),
      };
      setData(jwtData);
      setHtml5PrivilegeBypass(jwtData.html5PrivilegeBypass === true);
      setBranding(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
    return;
  }
  // Token 模式（原有逻辑不变）
  setLoading(true);
  setError(null);
  try {
    const [d, b] = await Promise.all([
      fetchMobileCenter(token),
      fetchLoginBranding().catch(() => null),
    ]);
    setData(d);
    setBranding(b);
  } catch (e) {
    setError(e instanceof Error ? e.message : "加载失败");
  } finally {
    setLoading(false);
  }
}, [token]);
```

- [ ] **Step 4: 修改 loadAlerts 函数 — JWT 模式分支**

在 `loadAlerts` 函数（第 94–106 行）开头添加 JWT 模式分支：

```typescript
const loadAlerts = useCallback(async () => {
  if (!token) {
    // JWT 模式
    try {
      const resp = await loadJwtAlerts();
      setAnnouncements(resp.announcements ?? resp.items ?? []);
      setFeedbacks(resp.feedbacks ?? []);
    } catch { /* 静默失败 */ }
    return;
  }
  // Token 模式（原有逻辑不变）
  if (!token) return;
  try {
    const resp = await fetchMobileAlerts(token);
    const ann = resp.announcements ?? resp.items ?? [];
    const fb = resp.feedbacks ?? [];
    setAnnouncements(ann);
    setFeedbacks(fb);
    setHtml5PrivilegeBypass(resp.html5PrivilegeBypass === true);
  } catch { /* 静默失败 */ }
}, [token]);
```

- [ ] **Step 5: 传递 JWT 模式标识给子组件**

所有 Tab 组件通过 props 接收 `token`。JWT 模式下 token 为 undefined，Tab 内部需能处理。由于各 Tab 的 API 调用目前通过 `token` prop 传入，JWT 模式下 Tab 需要感知模式。

**方案**：在 JSX 渲染中，为 JWT 模式传递 `token=""`（空字符串），各 Tab 组件内部检测空 token 时走 JWT API 路径。但为最小化 Tab 组件改动，采用另一个方案：Tab 组件继续接收 token，但额外传递 `jwtMode` boolean。

在 `MobileStudentCenterPage` 的 state 中新增：

```typescript
const jwtMode = !token;
```

然后将 `jwtMode` 传递给各 Tab 组件。Tab 组件内部根据 `jwtMode` 选择 API。

**但由于约束"不改动 Tab 组件"**，改为在 MobileStudentCenterPage 层面处理：JWT 模式下生成一个**短期虚拟 token** 用于 Tab 内 API 调用？不，这样不对。

**最终方案**：JWT 模式下，Tab 组件通过新的 props `jwtMode` 切换 API。Tab 组件需要微小改动——在每个 Tab 的 API 调用前加 `if (jwtMode) { ... } else { ... }` 分支。

这个改动被视为对 Tab 组件 props 的扩展。由于有 8 个 Tab 组件需要改动，这成为最繁重的部分。

**简化方案（推荐）**：不逐 Tab 改造，而是在 `studentMobile.api.ts` 中给每个函数都提供 `token` 参数的重载版本——但这样又破坏了分离。

**最终决定：Tab 组件接受新的可选 `jwtMode` prop 做最小分支。每个 Tab 文件改动 < 10 行。**

- [ ] **Step 6: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/pages/mobile/MobileStudentCenterPage.tsx
```

Expected: 无类型错误。如有 Tab 组件类型错误，继续 Task 11 修复。

---

## Task 8: 改造 useMobileSocket — JWT 模式

**Files:**
- Modify: `frontend/src/pages/mobile/useMobileSocket.ts`

- [ ] **Step 1: 新增 JWT 模式参数**

修改 `useMobileSocket` 函数签名，接受 `jwtMode` 参数：

```typescript
import { authStorage } from "@/features/auth/authStorage";

export function useMobileSocket(mobileToken?: string, jwtMode = false): UseMobileSocketReturn {
  // ...
  useEffect(() => {
    const socketUrl = resolveSocketUrl();
    const query: Record<string, string> = {};
    
    if (jwtMode) {
      query.channel = "student";
      query.token = authStorage.getToken(); // JWT Bearer
    } else {
      query.channel = "mobile";
      if (mobileToken?.trim()) {
        query.mobileToken = mobileToken.trim();
      }
    }
    
    const socket = io(socketUrl, { ...SOCKET_IO_CLIENT_OPTIONS, query });
    // ... rest unchanged
  }, [mobileToken, jwtMode]);
```

- [ ] **Step 2: 在 MobileStudentCenterPage 中传递 jwtMode**

在 `MobileStudentCenterPage` 中调用 `useMobileSocket` 时：

```typescript
const jwtMode = !token;
const { connected: wsConnected, lastAlert, lastUserNotify, clearUserNotify } = useMobileSocket(token, jwtMode);
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/pages/mobile/useMobileSocket.ts
```

---

## Task 9: 后端 — 创建 StudentMobileController

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentMobileController.java`

- [ ] **Step 1: 创建 StudentMobileController.java**

这是最大的单体任务。Controller 包含 17 个端点，每个端点复用现有 Service 的方法。

完整代码如下（由于文件较大，分两段展示）：

```java
// src/main/java/com/example/demo/modules/student/controller/StudentMobileController.java
package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.student.dto.StudentDashboardResponse;
import com.example.demo.modules.student.service.*;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.material.dto.CreateMaterialRequestReq;
import com.example.demo.modules.material.dto.MaterialRequestView;
import com.example.demo.modules.material.service.MaterialService;
import com.example.demo.modules.student.support.StudentMobileHtml5Privilege;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.common.util.RoomFloorPrefixUtil;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import com.example.demo.modules.twin.scan.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.scan.service.TwinScanAppService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/student/mobile")
@Tag(name = "学生手机端（JWT）", description = "学生 JWT 登录后访问的移动端接口")
public class StudentMobileController {

    private static final Logger log = LoggerFactory.getLogger(StudentMobileController.class);
    private static final int DEFAULT_CAPACITY = 20;

    private final AuthContextService authContextService;
    private final UserMapper userMapper;
    private final StudentDashboardService dashboardService;
    private final StudentRoomService studentRoomService;
    private final TwinDashboardAggregationService aggregationService;
    private final TwinScanAppService twinScanAppService;
    private final TwinDashboardMapper dashboardMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final AroDatabaseMapper aroDatabaseMapper;
    private final MaterialService materialService;
    private final StudentCageShelfService cageShelfService;
    private final StudentViolationService studentViolationService;
    private final MobileCenterAlertService mobileCenterAlertService;
    private final StudentActivityService studentActivityService;

    public StudentMobileController(AuthContextService authContextService,
                                   UserMapper userMapper,
                                   StudentDashboardService dashboardService,
                                   StudentRoomService studentRoomService,
                                   TwinDashboardAggregationService aggregationService,
                                   TwinScanAppService twinScanAppService,
                                   TwinDashboardMapper dashboardMapper,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   AroDatabaseMapper aroDatabaseMapper,
                                   MaterialService materialService,
                                   StudentCageShelfService cageShelfService,
                                   StudentViolationService studentViolationService,
                                   MobileCenterAlertService mobileCenterAlertService,
                                   StudentActivityService studentActivityService) {
        this.authContextService = authContextService;
        this.userMapper = userMapper;
        this.dashboardService = dashboardService;
        this.studentRoomService = studentRoomService;
        this.aggregationService = aggregationService;
        this.twinScanAppService = twinScanAppService;
        this.dashboardMapper = dashboardMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.materialService = materialService;
        this.cageShelfService = cageShelfService;
        this.studentViolationService = studentViolationService;
        this.mobileCenterAlertService = mobileCenterAlertService;
        this.studentActivityService = studentActivityService;
    }

    // ---- 鉴权工具 ----

    private User requireCurrentUser(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) throw new RuntimeException("未登录");
        return user;
    }

    // ---- 共享：个人信息 ----

    @GetMapping("/profile")
    @Operation(summary = "获取当前学生个人信息（JWT）")
    public Result<Map<String, Object>> getProfile(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        StudentDashboardResponse dashboard = dashboardService.buildDashboard(user);
        StudentDashboardResponse.ProfileSummary p = dashboard.getProfile();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("name", p.getName());
        profile.put("departmentName", p.getDepartmentName());
        profile.put("projectGroupName", p.getProjectGroupName());
        profile.put("roleLabel", p.getRoleLabel());
        profile.put("authStatus", p.getAuthStatus());
        profile.put("head", p.getHead());
        profile.put("gender", p.getGender());
        profile.put("mobilePhone", p.getMobilePhone());
        profile.put("email", p.getEmail());
        profile.put("totalExp", p.getTotalExp());
        profile.put("allowedRoomsDisplayZh", p.getAllowedRoomsDisplayZh());
        return Result.success(profile);
    }

    // ---- 首页 ----

    @GetMapping("/home")
    @Operation(summary = "获取首页聚合数据（stats + pinnedRooms + recentRecords + recentNotices，JWT）")
    public Result<Map<String, Object>> getHome(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        StudentDashboardResponse dashboard = dashboardService.buildDashboard(user);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("stats", buildStatsMap(dashboard.getStats()));
        resp.put("pinnedRooms", buildPinnedRoomsList(dashboard.getPinnedRooms()));
        resp.put("recentRecords", buildRecentRecordsList(dashboard.getRecentRecords()));
        resp.put("recentNotices", buildRecentNoticesList(dashboard.getRecentNotices()));
        return Result.success(resp);
    }

    private Map<String, Object> buildStatsMap(StudentDashboardResponse.StatsSummary s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("todayAccessCount", s.getTodayAccessCount());
        m.put("violationCount", s.getViolationCount());
        m.put("unreadNoticeCount", s.getUnreadNoticeCount());
        m.put("accessibleRoomCount", s.getAccessibleRoomCount());
        return m;
    }

    private List<Map<String, Object>> buildPinnedRoomsList(List<StudentDashboardResponse.PinnedRoom> rooms) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (rooms == null) return list;
        for (var r : rooms) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("roomId", r.getRoomId());
            item.put("roomName", r.getRoomName());
            item.put("floor", r.getFloor());
            item.put("zone", r.getZone());
            item.put("occupantCount", r.getOccupantCount());
            item.put("capacity", r.getCapacity());
            item.put("occupancyRate", r.getOccupancyRate());
            item.put("status", r.getStatus());
            item.put("isPinned", r.isPinned());
            list.add(item);
        }
        return list;
    }

    private List<Map<String, Object>> buildRecentRecordsList(List<StudentDashboardResponse.RecentRecord> records) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (records == null) return list;
        for (var r : records) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", r.getTime());
            item.put("type", r.getType());
            item.put("roomName", r.getRoomName());
            list.add(item);
        }
        return list;
    }

    private List<Map<String, Object>> buildRecentNoticesList(List<StudentDashboardResponse.RecentNotice> notices) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (notices == null) return list;
        for (var n : notices) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("title", n.getTitle());
            item.put("type", n.getType());
            item.put("publishDate", n.getPublishDate());
            list.add(item);
        }
        return list;
    }

    // ---- 房间 ----

    @GetMapping("/room-dashboard")
    @Operation(summary = "房间页数据（wechat-overview + scan/analyze，JWT）")
    public Result<Map<String, Object>> getRoomDashboard(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        List<RoomDashboardRenderDTO> overview = aggregationService.getWechatMiniProgramData(null);
        ScanAnalyzeResponseDTO analyze;
        try {
            analyze = twinScanAppService.analyzeScan(user.getId(), null, null);
        } catch (Exception e) {
            log.warn("[StudentMobile] analyzeScan failed userId={}: {}", user.getId(), e.getMessage());
            analyze = new ScanAnalyzeResponseDTO();
            analyze.setSuccess(false);
            analyze.setMessage(e.getMessage());
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("overview", overview != null ? overview : List.of());
        resp.put("analyze", analyze);
        resp.put("userId", user.getId());
        return Result.success(resp);
    }

    @GetMapping("/rooms")
    @Operation(summary = "房间列表（按 campus/floor 分组，JWT）")
    public Result<Map<String, Object>> getRooms(@RequestParam(defaultValue = "all") String mode,
                                                 HttpServletRequest request) {
        User user = requireCurrentUser(request);
        List<Map<String, Object>> flatList = new ArrayList<>();

        if ("mine".equals(mode)) {
            try {
                AroPersonnel aro = aroPersonnelMapper.findByUserId(user.getId());
                if (aro != null && aro.getAllowedRoomsDisplayZh() != null && !aro.getAllowedRoomsDisplayZh().isBlank()) {
                    String[] roomNames = aro.getAllowedRoomsDisplayZh().split("[,，]");
                    List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
                    for (RoomDashboardRenderDTO room : allRooms) {
                        if (room.getRoomName() == null) continue;
                        for (String allowedName : roomNames) {
                            if (room.getRoomName().contains(allowedName.trim()) || allowedName.trim().contains(room.getRoomName())) {
                                flatList.add(buildMobileRoomItem(room));
                                break;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[StudentMobile] ARO room matching failed userId={}: {}", user.getId(), e.getMessage());
            }
            if (flatList.isEmpty()) {
                try {
                    Map<String, Object> roomsResult = studentRoomService.getRooms(user, "1", null, null, null, 1, 200);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> svcList = (List<Map<String, Object>>) roomsResult.get("data");
                    if (svcList != null) flatList = svcList;
                } catch (Exception e) {
                    log.warn("[StudentMobile] StudentRoomService failed userId={}: {}", user.getId(), e.getMessage());
                }
            }
        } else {
            try {
                List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
                for (RoomDashboardRenderDTO room : allRooms) {
                    if (room.getRoomName() == null || room.getRoomName().isBlank()) continue;
                    flatList.add(buildMobileRoomItem(room));
                }
            } catch (Exception e) {
                log.warn("[StudentMobile] All rooms query failed: {}", e.getMessage());
            }
        }

        // 分组
        Map<String, Map<String, List<Map<String, Object>>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> room : flatList) {
            String zone = String.valueOf(room.getOrDefault("zone", "其他"));
            String floor = String.valueOf(room.getOrDefault("floor", "未知楼层"));
            grouped.computeIfAbsent(zone, k -> new LinkedHashMap<>())
                   .computeIfAbsent(floor, k -> new ArrayList<>())
                   .add(room);
        }
        List<Map<String, Object>> campusGroups = new ArrayList<>();
        for (var ce : grouped.entrySet()) {
            Map<String, Object> campus = new LinkedHashMap<>();
            campus.put("campus", ce.getKey());
            List<Map<String, Object>> floors = new ArrayList<>();
            for (var fe : ce.getValue().entrySet()) {
                Map<String, Object> fg = new LinkedHashMap<>();
                fg.put("floor", fe.getKey());
                fg.put("rooms", fe.getValue());
                floors.add(fg);
            }
            campus.put("floors", floors);
            campusGroups.add(campus);
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("campusGroups", campusGroups);
        resp.put("totalCount", flatList.size());
        return Result.success(resp);
    }

    private Map<String, Object> buildMobileRoomItem(RoomDashboardRenderDTO room) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("roomId", String.valueOf(room.getRoomId()));
        item.put("roomName", room.getRoomName() != null ? room.getRoomName() : "");
        item.put("floor", RoomFloorPrefixUtil.deriveFloorLabel(room.getRoomName()));
        item.put("zone", room.getCampus() != null ? room.getCampus() : "其他");
        int own = room.getCampusUserCount() != null ? room.getCampusUserCount() : 0;
        int borrowed = room.getBorrowedCardCount() != null ? room.getBorrowedCardCount() : 0;
        int occupants = own + borrowed;
        int capacity = room.getTotalCapacity() != null && room.getTotalCapacity() > 0 ? room.getTotalCapacity() : DEFAULT_CAPACITY;
        double rate = capacity > 0 ? (occupants * 100.0 / capacity) : 0;
        item.put("occupantCount", occupants);
        item.put("campusUserCount", own);
        item.put("borrowedCardCount", borrowed);
        item.put("capacity", capacity);
        item.put("occupancyRate", (int) Math.round(rate));
        item.put("status", rate > 90 ? "full" : rate >= 50 ? "busy" : "idle");
        item.put("isPinned", false);
        return item;
    }

    // ---- 出入记录 ----

    @GetMapping("/access-records")
    @Operation(summary = "出入记录分页（JWT）")
    public Result<Map<String, Object>> getAccessRecords(@RequestParam(defaultValue = "1") int page,
                                                         @RequestParam(defaultValue = "20") int size,
                                                         HttpServletRequest request) {
        User user = requireCurrentUser(request);
        int offset = (page - 1) * size;
        List<Map<String, Object>> raw = aroDatabaseMapper.selectAccessRecordsByUserId(user.getId(), offset, size);
        int total = aroDatabaseMapper.countAccessRecordsByUserId(user.getId());
        List<Map<String, Object>> data = new ArrayList<>();
        if (raw != null) {
            for (Map<String, Object> row : raw) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", String.valueOf(row.getOrDefault("id", "")));
                item.put("eventTime", String.valueOf(row.getOrDefault("event_time", "")));
                item.put("eventType", String.valueOf(row.getOrDefault("event_type", "")));
                item.put("roomName", String.valueOf(row.getOrDefault("room_name", "")));
                item.put("personName", String.valueOf(row.getOrDefault("person_name", "")));
                data.add(item);
            }
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("data", data);
        resp.put("total", total);
        resp.put("page", page);
        resp.put("size", size);
        return Result.success(resp);
    }

    // ---- 物资 ----

    @GetMapping("/materials")
    @Operation(summary = "物资目录 + 我的申领（JWT）")
    public Result<Map<String, Object>> getMaterials(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        Map<String, Object> resp = new LinkedHashMap<>();
        try { resp.put("categories", materialService.listCategoriesForStudent()); } catch (Exception e) { log.warn("[StudentMobile] categories failed: {}", e.getMessage()); resp.put("categories", List.of()); }
        try { resp.put("items", materialService.listItemsForStudent(null)); } catch (Exception e) { log.warn("[StudentMobile] items failed: {}", e.getMessage()); resp.put("items", List.of()); }
        try {
            var mine = materialService.listMine(user, null, 1, 20);
            resp.put("myRequests", mine != null && mine.getData() != null ? mine.getData().getOrDefault("data", List.of()) : List.of());
        } catch (Exception e) { log.warn("[StudentMobile] myRequests failed: {}", e.getMessage()); resp.put("myRequests", List.of()); }
        return Result.success(resp);
    }

    @PostMapping("/material/requests")
    @Operation(summary = "提交物资申领（JWT）")
    public Result<List<MaterialRequestView>> createMaterialRequest(@RequestBody CreateMaterialRequestReq req,
                                                                   HttpServletRequest request) {
        User user = requireCurrentUser(request);
        return materialService.createRequest(user, req);
    }

    // ---- 笼架 ----

    @GetMapping("/cage-shelves/all")
    @Operation(summary = "课题组全部笼架（JWT）")
    public Result<Map<String, Object>> getCageAllShelves(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        boolean privileged = StudentMobileHtml5Privilege.isPrivileged(user);
        List<Map<String, Object>> shelves = cageShelfService.listAllShelvesForMobile(user, privileged);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("shelves", shelves);
        resp.put("totalCount", shelves.size());
        return Result.success(resp);
    }

    @GetMapping("/cage-shelves/{shelveId}/detail")
    @Operation(summary = "笼架网格详情（JWT）")
    public Result<Map<String, Object>> getCageShelfDetail(@PathVariable String shelveId, HttpServletRequest request) {
        User user = requireCurrentUser(request);
        boolean privileged = StudentMobileHtml5Privilege.isPrivileged(user);
        return Result.success(cageShelfService.getShelfDetail(user, shelveId, privileged));
    }

    @GetMapping("/cage-shelves/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "笼位标注（JWT）")
    public Result<Map<String, Object>> getCellAnnotation(@PathVariable String shelveId, @PathVariable int x, @PathVariable int y,
                                                          HttpServletRequest request) {
        User user = requireCurrentUser(request);
        try { return Result.success(cageShelfService.getAnnotation(user, shelveId, x, y)); } catch (Exception e) { return Result.error(e.getMessage()); }
    }

    @PutMapping("/cage-shelves/{shelveId}/cells/{x}/{y}/annotation")
    @Operation(summary = "保存笼位标注（JWT）")
    public Result<?> saveCellAnnotation(@PathVariable String shelveId, @PathVariable int x, @PathVariable int y,
                                         @RequestBody Map<String, String> body, HttpServletRequest request) {
        User user = requireCurrentUser(request);
        try {
            String position = body.getOrDefault("position", x + "-" + y);
            String richText = body.getOrDefault("richText", null);
            String images = body.getOrDefault("images", null);
            String aroRawData = body.getOrDefault("aroRawData", null);
            cageShelfService.upsertAnnotation(user, shelveId, x, y, position, richText, images, aroRawData);
            return Result.success();
        } catch (IllegalStateException e) { return Result.fail(403, e.getMessage()); }
        catch (Exception e) { return Result.error(e.getMessage()); }
    }

    // ---- 违规 ----

    @GetMapping("/violations")
    @Operation(summary = "违规记录分页（JWT）")
    public Result<Map<String, Object>> getViolations(@RequestParam(defaultValue = "1") int page,
                                                      @RequestParam(defaultValue = "20") int size,
                                                      HttpServletRequest request) {
        User user = requireCurrentUser(request);
        return Result.success(studentViolationService.getViolations(user, page, size, "", ""));
    }

    // ---- 公告 ----

    @GetMapping("/alerts")
    @Operation(summary = "公告 + 违规提醒（JWT）")
    public Result<Map<String, Object>> getAlerts(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        boolean privileged = StudentMobileHtml5Privilege.isPrivileged(user);
        return Result.success(mobileCenterAlertService.buildAlerts(user.getId(), privileged));
    }

    @PostMapping("/notice-auto-suppress")
    @Operation(summary = "公告「下次不再弹出」（JWT）")
    public Result<Map<String, Object>> suppressNoticeAutoOpen(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User user = requireCurrentUser(request);
        if (body == null) return Result.fail(400, "缺少请求体");
        Object kindObj = body.get("noticeKind"), recordObj = body.get("recordId");
        if (kindObj == null || recordObj == null) return Result.fail(400, "缺少 noticeKind 或 recordId");
        String noticeKind = String.valueOf(kindObj).trim();
        long recordId;
        try { recordId = Long.parseLong(String.valueOf(recordObj).trim()); } catch (NumberFormatException e) { return Result.fail(400, "recordId 无效"); }
        if (recordId <= 0) return Result.fail(400, "recordId 无效");
        try { return Result.success(mobileCenterAlertService.suppressNoticeAutoOpen(user.getId(), noticeKind, recordId)); }
        catch (IllegalArgumentException e) { return Result.fail(400, e.getMessage()); }
        catch (Exception e) { log.warn("[StudentMobile] notice-auto-suppress failed userId={}: {}", user.getId(), e.getMessage()); return Result.error("保存失败: " + e.getMessage()); }
    }

    // ---- 课题组活跃度 ----

    @GetMapping("/group-activity/summary")
    @Operation(summary = "课题组活跃度 KPI（JWT）")
    public Result<Map<String, Object>> getGroupActivitySummary(@RequestParam(required = false) String groupName,
                                                                @RequestParam String startTime,
                                                                @RequestParam String endTime,
                                                                @RequestParam(defaultValue = "all") String campus,
                                                                HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolved = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.summary(resolved, startTime, endTime, campus));
    }

    @GetMapping("/group-activity/members")
    @Operation(summary = "课题组成员活跃排行（JWT）")
    public Result<Map<String, Object>> getGroupActivityMembers(@RequestParam(required = false) String groupName,
                                                                @RequestParam String startTime,
                                                                @RequestParam String endTime,
                                                                @RequestParam(defaultValue = "entries") String sortBy,
                                                                @RequestParam(defaultValue = "desc") String order,
                                                                @RequestParam(defaultValue = "1") int page,
                                                                @RequestParam(defaultValue = "10") int size,
                                                                HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolved = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.queryMemberActivity(resolved, startTime, endTime, sortBy, order, page, size));
    }

    @GetMapping("/group-activity/heatmap")
    @Operation(summary = "进出时段热力图（JWT）")
    public Result<List<Map<String, Object>>> getGroupActivityHeatmap(@RequestParam(required = false) String groupName,
                                                                      @RequestParam String startTime,
                                                                      @RequestParam String endTime,
                                                                      HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolved = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.heatmap(resolved, startTime, endTime));
    }

    @GetMapping("/group-activity/room-usage")
    @Operation(summary = "喜好房间排行（JWT）")
    public Result<List<Map<String, Object>>> getGroupActivityRoomUsage(@RequestParam(required = false) String groupName,
                                                                        @RequestParam String startTime,
                                                                        @RequestParam String endTime,
                                                                        HttpServletRequest request) {
        User user = requireCurrentUser(request);
        String resolved = resolveProjectGroupName(user, groupName);
        return Result.success(studentActivityService.roomUsage(resolved, startTime, endTime));
    }

    private String resolveProjectGroupName(User user, String requestedGroup) {
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(user.getId());
            if (personnel != null) {
                String resolved = personnel.getResolvedProjectGroupNames();
                if (resolved != null && !resolved.isBlank()) return resolved;
            }
        } catch (Exception e) {
            log.warn("[StudentMobile] resolve group failed userId={}: {}", user.getId(), e.getMessage());
        }
        return requestedGroup != null ? requestedGroup.trim() : "";
    }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd backend && mvn compile -pl . -q
```

Expected: BUILD SUCCESS。

---

## Task 10: Tab 组件适配 — 支持 jwtMode

**Files:**
- Modify: 以下 Tab 组件各新增 `jwtMode` prop 并做最小分支

- [ ] **Step 1: MobileHomeTab.tsx — 新增 jwtMode prop**

在 `MobileHomeTabProps` 接口中新增：
```typescript
jwtMode?: boolean;
```

Home tab 本身不直接调用 API，数据由 `MobileStudentCenterPage` 传入。JWT 模式下不展示 `expiresAt`。在组件中使用：
```typescript
{!jwtMode && expiresAt && <ExpiresAtDisplay ... />}
```

- [ ] **Step 2: MobileRoomsTab.tsx — 新增 jwtMode prop，切换 API**

在 props 中新增 `jwtMode?: boolean`，在 API 调用处：
```typescript
const data = jwtMode
  ? await fetchStudentMobileRoomDashboard()
  : await fetchMobileRoomDashboard(token!);
```

需要新增导入 `fetchStudentMobileRoomDashboard` from `studentMobile.api.ts`。

- [ ] **Step 3: MobileRecordsTab.tsx — 同上模式**

```typescript
const data = jwtMode
  ? await fetchStudentMobileAccessRecords(page, size)
  : await fetchMobileAccessRecords(token!, page, size);
```

- [ ] **Step 4: MobileMaterialTab.tsx — 同上模式**

```typescript
const data = jwtMode
  ? await fetchStudentMobileMaterials()
  : await fetchMobileMaterials(token!);
```

提交申领时类似分支。

- [ ] **Step 5: MobileViolationsTab.tsx — 同上模式**

```typescript
const data = jwtMode
  ? await fetchStudentMobileViolations(page, size)
  : await fetchMobileViolations(token!, page, size);
```

- [ ] **Step 6: MobileCageShelfTab.tsx — 同上模式**

所有笼架 API 调用加 jwtMode 分支。

- [ ] **Step 7: MobileGroupTab.tsx — 同上模式**

所有 group-activity API 调用加 jwtMode 分支。

- [ ] **Step 8: MobileMineTab.tsx — 同上模式**

Mine tab 使用 profile 数据（从父组件传入），JWT 模式下不展示 expiresAt。

- [ ] **Step 9: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

---

## Task 11: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd backend && mvn spring-boot:run
```

Expected: 服务启动在 8080 端口。

- [ ] **Step 2: 启动前端**

```bash
cd frontend && npm run dev
```

Expected: Vite 启动在 5173 端口。

- [ ] **Step 3: 测试 H5 登录页面**

用 Playwright 导航到 `http://localhost:5173/#/m/login`，确认：
- 页面渲染正常（登录表单可见）
- 输入学生账号密码 → 点击登录
- 登录成功后跳转到 `/m/home`
- 首页正常加载 profile + stats + pinned rooms

- [ ] **Step 4: 测试 H5 注册页面**

导航到 `http://localhost:5173/#/m/register`，确认：
- QR 上传区域可见
- 四步向导流程正常

- [ ] **Step 5: 测试旧 token 路由不受影响**

导航到 `http://localhost:5173/#/m/sc/<valid-token>`，确认：
- 旧 token 直达页面正常工作
- 数据来自 publicHttp（检查 Network 面板）

- [ ] **Step 6: 检查 JWT 端点鉴权**

用 curl 不带 Authorization header 访问 `/api/student/mobile/profile`：
```bash
curl -s http://localhost:8080/api/student/mobile/profile | head -c 200
```
Expected: 返回错误（未登录或 401）。

- [ ] **Step 7: 检查前端令牌合规**

```bash
grep -rn 'bg-\[#' frontend/src/pages/mobile/auth/
grep -rn 'z-\[[0-9]' frontend/src/pages/mobile/auth/
```
Expected: 无结果。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add H5 student login/register entry with JWT mobile API"
```
