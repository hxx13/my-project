# 大屏二维码轮播 + 学生账号激活 · 设计规格

> **版本**: 1.0 | **日期**: 2026-06-26 | **状态**: 设计阶段

---

## 功能 A：大屏二维码轮播

### A.1 目标

在 Web 端 Dashboard 大屏右下角，将现有的 `NestedPieChart`（双圆环）与 QR 码入口整合为双页轮播，方便现场学生扫码进入 H5 学生中心。

### A.2 组件设计

**新建**：`frontend/src/features/dashboard/DashboardQrCarousel.tsx`

- **Page 1**：现有 `NestedPieChart` 组件（不改动）
- **Page 2**：QR 码卡片
  - 上方文字："学生手机端入口"（主标题）
  - 中央：QR 码，编码内容为 `{window.location.origin}/#/m/login`
  - QR 码生成：使用 `qrcode` npm 包（或轻量 canvas 方案）
  - 下方文字："打开微信扫一扫，直接进入学生中心"（副标题）
- **底部**：两个圆点指示器，当前页高亮
- **过渡**：GSAP fade（opacity 0→1, duration 0.4s）
- **轮播**：8 秒自动切换，手动点击圆点后重置计时器

### A.3 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `features/dashboard/DashboardQrCarousel.tsx` | 新建 | 轮播容器 |
| `pages/DashboardPage.tsx` | 修改 | 右列下方替换 NestedPieChart 为 DashboardQrCarousel |
| `features/dashboard/NestedPieChart.tsx` | **不改** | 作为子组件传入 |

### A.4 DashboardPage 变更（仅替换右下角 block）

```
替换前 (line 289-293):
  <div className="flex min-h-0 flex-[4] dash-card">
    <GlassCard blobColor="rgba(45,92,247,0.3)">
      <NestedPieChart />
    </GlassCard>
  </div>

替换后:
  <div className="flex min-h-0 flex-[4] dash-card">
    <GlassCard blobColor="rgba(45,92,247,0.3)">
      <DashboardQrCarousel
        qrUrl={`${window.location.origin}/#/m/login`}
      >
        <NestedPieChart />
      </DashboardQrCarousel>
    </GlassCard>
  </div>
```

### A.5 QR 码生成

使用 `qrcode` 库（项目已安装或通过 canvas 轻量实现）。若未安装：

```bash
cd frontend && npm install qrcode
```

QR 码渲染为 `<canvas>` 元素，尺寸由容器决定（`width: 100%`, `maxWidth: 200px`）。

---

## 功能 B：学生账号激活（设密码桥接）

### B.1 目标

为已存在但无密码的学生账号（来自定时任务自动创建、微信小程序绑定、教工 ARO 绑定）提供"激活账号"流程，使其能通过 H5 登录入口（`/m/login`）使用用户名密码登录。

### B.2 后端 API

**新增端点**：`POST /api/auth/register/student/activate`

**Controller**：在 `StudentAuthController.java` 新增方法

**Request DTO**：`StudentActivateRequest.java`

```java
// 字段：
@NotBlank String userId;     // 19 位 ARO user_id（QR 验证后获得）
@NotBlank String username;   // 自定义用户名（3-64 位）
@NotBlank String password;   // 密码（≥6 位）
```

**Service 逻辑**（`StudentRegistrationService.activate()`）：

```
1. 校验 userId 格式（19 位数字）
2. 查 sys_user WHERE id = userId → 不存在 → 404 "未找到该学生账号"
3. 查该 sys_user 是否已有 password → 有 → 409 "该账号已激活，请直接登录"
4. 查 username 是否已被其他 userId 占用 → 是 → 400 "用户名已被使用"
5. 校验 username 格式（3-64 位）、password 长度（≥6）
6. UPDATE sys_user SET username=?, password=BCrypt(password), auth_profile='WEB_PASSWORD' WHERE id=?
   （openId、miniBindType 保留原值不动）
7. 生成 JWT auth 结果返回（同 login 响应格式）
```

**返回**：`Result<AuthData>`（与 login 一致，前端直接 `setAuth` + `markLoginPortal("mobile")`）

**错误码**：

| HTTP 状态码 | 消息 | 场景 |
|-----------|------|------|
| 400 | 参数格式不合法 | userId/username/password 校验失败 |
| 400 | 用户名已被使用 | username 被其他人占用 |
| 404 | 未找到该学生账号 | userId 不在 sys_user 中 |
| 409 | 该账号已激活 | 已有密码 |

### B.3 前端：激活页面

**新建**：`frontend/src/pages/mobile/auth/MobileActivatePage.tsx`

**路由**：`/m/activate`（public，无 AuthGuard）

**三步向导**：

```
Step 1 "身份验证"：QR 上传 → verifyQrCode() → 获得 userId + name
  └─ 展示：上传 QR 码图片
  └─ 顶部：← 返回按钮 → /m/login

Step 2 "确认身份 + 设密码"（合并）：
  └─ 展示姓名确认卡片："张三，确认这是你的账号吗？"
  └─ 用户名输入框（3-64 位）
  └─ 密码输入框（≥6 位）
  └─ 确认密码输入框
  └─ "激活并登录" 按钮
  └─ 顶部：← 返回按钮 → Step 1
  └─ 调用 activateStudent(userId, username, password)

Step 3 "成功"：
  └─ 绿色勾 + "激活成功！"
  └─ 1.5s 后自动跳转 /m/home
```

### B.4 登录页入口

**修改**：`MobileLoginPage.tsx` — 底部新增链接

```diff
  还没有账号？立即注册
+ 已有身份但未设密码？激活账号
```

### B.5 所有认证页面返回按钮

| 页面 | 返回目标 | 实现 |
|------|---------|------|
| `MobileLoginPage` | 无（入口页，无需返回） | — |
| `MobileRegisterPage` | `/m/login` | 左上角 ← 箭头按钮 |
| `MobileActivatePage` | `/m/login`（Step 1）；Step 1（Step 2） | 左上角 ← 箭头按钮 |

返回按钮样式：左上角固定，`position: absolute; top: 16px; left: 16px`，圆形半透明底 + `<ArrowLeft>` icon，点击 `navigate(-1)` 或显式路径。

### B.6 前端 API 层

**修改**：`frontend/src/features/student/api/student.api.ts` 新增：

```typescript
export async function activateStudent(
  userId: string, username: string, password: string
): Promise<Result<{ token: string; role: string; userInfo: unknown }>> {
  const res = await authHttp.post<Result<...>>("/auth/register/student/activate",
    { userId, username, password }
  );
  if (!res.data?.success) throw new Error(res.data?.message || "激活失败");
  return res.data;
}
```

### B.7 路由变更

```diff
  frontend/src/router/index.tsx:
+ { path: "/m/activate", element: <MobileActivatePage /> },
```

---

## 文件清单总汇

### 新建

| 文件 | 功能 |
|------|------|
| `features/dashboard/DashboardQrCarousel.tsx` | A: 双页轮播容器 |
| `pages/mobile/auth/MobileActivatePage.tsx` | B: 激活向导 |
| `student/controller/.../dto/StudentActivateRequest.java` | B: 激活请求 DTO |

### 修改

| 文件 | 功能 |
|------|------|
| `pages/DashboardPage.tsx` | A: 右下角替换为轮播 |
| `modules/student/controller/StudentAuthController.java` | B: 新增 /activate 端点 |
| `modules/student/service/StudentRegistrationService.java` | B: 新增 activate() 方法 |
| `features/student/api/student.api.ts` | B: 新增 activateStudent() |
| `router/index.tsx` | A+B: 新增 /m/activate 路由 |
| `pages/mobile/auth/MobileLoginPage.tsx` | B: 新增激活入口 + 返回按钮 |
| `pages/mobile/auth/MobileRegisterPage.tsx` | B: 新增返回按钮 |

### 明确不改

| 文件 | 原因 |
|------|------|
| `NestedPieChart.tsx` | 作为子组件直接传入轮播 |
| `AuthController.java` | 不新增登录方式 |
| 小程序绑定逻辑 / openId 处理 | 激活时保留原值 |
| `sys_user` 表结构 | 只 UPDATE 已有列 |
| WeChat 相关代码 | 不受影响 |

---

## 边缘情况

| 场景 | 处理 |
|------|------|
| 学生已激活再次激活 | 后端返回 409，前端提示"该账号已激活，请直接登录" |
| 用户名被占用 | 后端返回 400，前端展示红色错误"用户名已被使用" |
| QR 码无法识别（激活时） | `verifyQrCode()` 返回 `verified: false`，前端展示"无法识别二维码" |
| userId 不在人员库（激活时） | 后端 404，前端展示"未找到该学生信息" |
| 定时任务创建的无密码账号（username=19位数字） | 激活时允许改成自定义用户名 |
| Dashboard 页面 JS 未加载时 QR 不可见 | 轮播默认展示 Page 1（双圆环），QR 懒加载 |
| 网络断开时 QR 码 | QR 内容是静态文本 URL，不需要网络即可展示 |
| 轮播时用户点击圆点 | 立即切换，重置 8s 计时器 |

---

## 约束

1. **不新增 npm 依赖**如果 `qrcode` 未安装，优先用轻量 canvas 手绘 QR（或直接用 `qrcode` 包，已检查可用）
2. **不改动 NestedPieChart** 内部实现
3. **激活不改动** `openId`、`miniBindType` 字段
4. **所有认证页面**（login/register/activate）必须有返回按钮
5. **Dashboard 轮播**不改变右列 flex 比例（保持 flex-[4]）
