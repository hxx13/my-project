# H5 学生统一登录入口 · 设计规格

> **版本**: 1.0 | **日期**: 2026-06-26 | **状态**: 设计阶段

---

## 1. 概述与上下文

### 1.1 目标

在 H5 移动端路由域（`/m/`）新增学生统一登录/注册入口。学生通过扫码进入 H5 登录页，使用与 Web 端相同的后端接口完成注册或登录，获得 JWT 认证后进入 H5 优化的学生中心。

### 1.2 核心约束

- **复用后端接口**：注册和登录直接调用现有 `POST /api/auth/login/web` 和 `POST /api/auth/register/student`，不新增认证接口
- **保留现有直达 QR**：`/m/sc/:token` 路由及 `/api/public/mobile-center/{token}/*` 全部保留不变，现有 QR 码继续工作
- **H5 数据结构为规范**：新 JWT 接口返回结构与现有 `MobileCenterData` 类型定义一致，Web 学生端后续向 H5 数据格式对齐
- **JWT 鉴权**：所有新端点必须通过 JWT Bearer Token 鉴权，不沿用手动 token 拼接模式

### 1.3 设计原则

1. **融入而非替代**：新 `StudentMobileController` 复用全部现有 Service（`StudentDashboardService`、`StudentRoomService`、`MaterialService` 等），纯转发层
2. **懒加载优先**：首页拆为 profile + home-summary 两次请求，其余 tab 按需加载
3. **渐进增强**：旧 token 链路零改动，新 JWT 链路独立部署

---

## 2. 架构分层总览

### 2.1 模块归属

```
前端:
  frontend/src/pages/mobile/          ← 现有 H5 页面（MobileStudentCenterPage 等）
  frontend/src/pages/mobile/auth/     ← 新增 H5 登录/注册页面
  frontend/src/api/domains/
    mobileStudent.api.ts              ← 保留：token-based 公共接口
    studentMobile.api.ts              ← 新增：JWT-based 学生移动端接口
  frontend/src/router/index.tsx       ← 修改：新增 /m/login, /m/register, /m/home

后端:
  modules/student/controller/
    StudentMobileCenterController.java  ← 保留：/api/public/mobile-center/*（token）
    StudentMobileController.java        ← 新增：/api/student/mobile/*（JWT）
```

### 2.2 数据流

```
扫码入口 QR → /#/m/login ──登录──→ JWT → localStorage
                    │                        │
                    └──注册──→ /#/m/register  │
                         │                   │
                         └──→ JWT ──────────┘
                                             │
                    ┌────────────────────────┘
                    ▼
              /#/m/home (MobileStudentCenterPage)
                    │
       ┌────────────┼────────────┬───────────┬──────────┐
       ▼            ▼            ▼           ▼          ▼
    profile     home-summary  room-dash   records   materials ...
    (共享)      (stats+       (房间tab)   (记录tab)  (物资tab)
                rooms+recs)
```

### 2.3 两套认证链路对比

| | 旧链路（直达 QR） | 新链路（通用入口） |
|---|---|---|
| 路由入口 | `/m/sc/:token` | `/m/login` → `/m/home` |
| 认证方式 | URL 中的 bearer token | JWT Bearer (localStorage) |
| API 前缀 | `/api/public/mobile-center/{token}/` | `/api/student/mobile/` |
| HTTP 客户端 | `publicHttp` | `authHttp` |
| 后端鉴权 | `tokenService.validateToken()` | `authContextService.getCurrentUser()` |
| WebSocket | `channel: mobile` + token | `channel: student` + JWT |
| 适用场景 | 教工生成临时码，学生临时访问 | 学生自主扫码登录，长期使用 |

---

## 3. 数据库变更

**无新增表/字段。** 学生账号复用 `sys_user` 表，注册流程复用 `StudentRegistrationService`。

唯一涉及的是：JWT 版 WebSocket 握手需新增一个 channel 参数校验分支，不涉及存储。

---

## 4. 后端 API 契约

### 4.1 新 Controller：`StudentMobileController`

- **基路径**：`/api/student/mobile`
- **鉴权**：所有方法通过 `AuthContextService.getCurrentUser()` 获取当前用户
- **角色要求**：`STUDENT` 及以上（html5PrivilegeBypass 逻辑从 JWT role 直接读取，不再从接口返回）

### 4.2 端点清单

#### 共享

| 方法 | 路径 | 返回类型 | 说明 |
|------|------|---------|------|
| GET | `/api/student/mobile/profile` | `MobileCenterProfile` | 当前学生个人信息（home + mine 共用） |

#### 首页

| 方法 | 路径 | 返回类型 | 说明 |
|------|------|---------|------|
| GET | `/api/student/mobile/home` | `{ stats, pinnedRooms, recentRecords, recentNotices }` | 首页聚合数据 |

#### 各 Tab（结构与旧 public 接口一致，仅鉴权方式变更）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/student/mobile/room-dashboard` | 房间页（wechat-overview + scan/analyze） |
| GET | `/api/student/mobile/rooms?mode=all\|mine` | 房间列表按 campus/floor 分组 |
| GET | `/api/student/mobile/access-records?page=&size=` | 出入记录分页 |
| GET | `/api/student/mobile/materials` | 物资目录 + 我的申领 |
| POST | `/api/student/mobile/material/requests` | 提交物资申领 |
| GET | `/api/student/mobile/cage-shelves/all` | 课题组全部笼架 |
| GET | `/api/student/mobile/cage-shelves/{id}/detail` | 笼架 8×10 网格详情 |
| GET | `/api/student/mobile/cage-shelves/{id}/cells/{x}/{y}/annotation` | 笼位标注 |
| PUT | `/api/student/mobile/cage-shelves/{id}/cells/{x}/{y}/annotation` | 保存笼位标注 |
| GET | `/api/student/mobile/violations?page=&size=` | 违规记录分页 |
| GET | `/api/student/mobile/alerts` | 公告 + 违规提醒 |
| POST | `/api/student/mobile/notice-auto-suppress` | 公告"不再弹出" |
| GET | `/api/student/mobile/group-activity/summary` | 课题组活跃度 KPI |
| GET | `/api/student/mobile/group-activity/members` | 课题组成员活跃排行 |
| GET | `/api/student/mobile/group-activity/heatmap` | 进出时段热力图 |
| GET | `/api/student/mobile/group-activity/room-usage` | 喜好房间排行 |

共 17 个端点，全部在 `StudentMobileController` 中实现，构造器注入与 `StudentMobileCenterController` 相同的 Service 集合。

### 4.3 返回结构

所有端点返回结构与前端现有类型定义完全一致（`MobileCenterProfile`、`MobileCenterStats`、`MobileCenterRoom` 等），不做字段增删，只去掉 `html5PrivilegeBypass` 字段（前端直接从 JWT role 判定）。

### 4.4 与旧接口的对应关系

新 Controller 每个方法内部调用逻辑与旧 `StudentMobileCenterController` 对应方法相同，差异仅在于：

```
旧: String userId = tokenService.validateToken(token, clientIp);
新: User user = authContextService.getCurrentUser();
```

---

## 5. 前端组件接口契约

### 5.1 新增 API 层

**文件**：`frontend/src/api/domains/studentMobile.api.ts`

```typescript
// 使用 authHttp (JWT Bearer)，复用 mobileStudent.api.ts 中的全部类型定义
// 导出: fetchStudentMobileProfile, fetchStudentMobileHome, fetchStudentMobileRooms,
//       fetchStudentMobileRoomDashboard, fetchStudentMobileAccessRecords,
//       fetchStudentMobileMaterials, submitStudentMobileMaterialRequest,
//       fetchStudentMobileCageShelvesAll, fetchStudentMobileCageShelfDetail, ...
```

关键约定：所有函数签名去掉 `token: string` 参数，内部 `publicHttp` → `authHttp`，路径 `/public/mobile-center/{token}/` → `/student/mobile/`。

### 5.2 新增页面组件

| 组件 | 路由 | 说明 |
|------|------|------|
| `MobileLoginPage` | `/m/login` | H5 登录表单，用户名+密码 |
| `MobileRegisterPage` | `/m/register` | H5 注册流程：上传 QR 图片 → 确认身份 → 设用户名密码 |

### 5.3 修改 MobileStudentCenterPage

`MobileStudentCenterPage` 需要支持两种模式：

| 模式 | 触发条件 | 数据源 |
|------|---------|--------|
| token 模式（旧） | URL 有 `:token` 参数 | `mobileStudent.api.ts` → `publicHttp` |
| JWT 模式（新） | 无 token，有 JWT | `studentMobile.api.ts` → `authHttp` |

通过检测 `token` prop/param 是否为空来切换。JWT 模式下：
- 首页：并行调用 `fetchStudentMobileProfile()` + `fetchStudentMobileHome()`
- 其余 Tab：按需懒加载对应 JWT 端点
- WebSocket：连接时传 JWT Bearer 而非 mobile token
- 去掉 `expiresAt` 展示（JWT 永不过期展示，由 tokenRefresh 拦截器静默刷新）

### 5.4 状态机

```
MobileLoginPage
  ├─ 输入用户名密码 → loginWeb() → 成功 → setAuth() → navigate("/m/home")
  │                             → 失败 → 展示错误信息
  └─ 点击注册 → navigate("/m/register")

MobileRegisterPage（四步向导，与 Web 端 StudentRegisterPage 同逻辑）
  Step 1: 上传 QR 图片 → verifyQrCode()
  Step 2: 确认身份信息（name, department, projectGroup）
  Step 3: 设置 username + password → registerStudent()
  Step 4: 注册成功 → setAuth() → 1.5s 后 navigate("/m/home")
```

---

## 6. 安全设计

### 6.1 认证

- **登录**：复用 `POST /api/auth/login/web`，前端 `MobileLoginPage` 调用 `loginWeb()` 后验证 `data.role === "STUDENT"`
- **注册**：复用 `POST /api/auth/register/student`，后端已有防重复注册检查（userId 已存在 → 409）
- **Token 存储**：JWT 存入 `localStorage`，通过 `authStorage.setAuth()` 写入，走现有 `authHttp` 拦截器自动附带
- **Token 刷新**：现有的 `tokenRefresh.ts` 拦截器自动处理 401 → refresh → retry 链路

### 6.2 鉴权

- 所有 `/api/student/mobile/*` 端点通过 `AuthContextService.getCurrentUser()` 获取当前用户
- `StudentMobileController` 级别或方法级别校验 `role >= STUDENT`
- 数据隔离：Service 层直接使用 `user.getId()` 查询，无法越权访问其他学生数据

### 6.3 防攻击

- 登录接口已有现有限流机制（如有配置），新端点不新增限流
- 注册接口已有防重复注册检查
- JWT 过期时间沿用现有配置

---

## 7. 路由与导航

### 7.1 新增路由

在 `router/index.tsx` 的 public routes 区域新增：

```
{ path: "/m/login",    element: <MobileLoginPage /> }
{ path: "/m/register", element: <MobileRegisterPage /> }
{ path: "/m/home",     element: <AuthGuard requireRole="STUDENT"><MobileStudentCenterPage /></AuthGuard> }
```

`/m/sc/:token` 保持不变（public，无 AuthGuard）。

### 7.2 跳转逻辑

| 从 | 到 | 触发条件 |
|----|----|---------|
| `/m/login` | `/m/home` | 登录成功 |
| `/m/login` | `/m/register` | 点击注册链接 |
| `/m/register` | `/m/home` | 注册成功 |
| `/m/register` | `/m/login` | 已有账号，点击登录 |
| `/m/home` | `/m/login` | 无 JWT token（AuthGuard 拦截） |
| `/` (根路径) | `/m/home` | `RootEntryRedirect` 检测到 JWT + role=STUDENT + loginPortal=mobile |

### 7.3 与 Web 端路由的关系

- Web 学生端 `/student/*` 路由完全不受影响
- `/m/home` 与 `/student/home` 渲染同一个 `MobileStudentCenterPage` 组件，区别是认证模式（JWT vs mirror mode）
- 用户从 Web 端登录（`/student/login`）不会自动跳转到 `/m/home`，反之亦然，各自独立

---

## 8. 数据对接清单

| 前端 API 函数 | HTTP 方法 | 后端端点 | 调用方 |
|--------------|----------|---------|--------|
| `fetchStudentMobileProfile` | GET | `/api/student/mobile/profile` | MobileHomeTab, MobileMineTab |
| `fetchStudentMobileHome` | GET | `/api/student/mobile/home` | MobileHomeTab (替代 fetchMobileCenter) |
| `fetchStudentMobileRoomDashboard` | GET | `/api/student/mobile/room-dashboard` | MobileRoomsTab |
| `fetchStudentMobileRooms` | GET | `/api/student/mobile/rooms` | MobileRoomsTab |
| `fetchStudentMobileAccessRecords` | GET | `/api/student/mobile/access-records` | MobileRecordsTab |
| `fetchStudentMobileMaterials` | GET | `/api/student/mobile/materials` | MobileMaterialTab |
| `submitStudentMobileMaterialRequest` | POST | `/api/student/mobile/material/requests` | MobileMaterialTab |
| `fetchStudentMobileCageShelvesAll` | GET | `/api/student/mobile/cage-shelves/all` | MobileCageShelfTab |
| `fetchStudentMobileCageShelfDetail` | GET | `/api/student/mobile/cage-shelves/{id}/detail` | MobileCageShelfTab |
| `fetchStudentMobileViolations` | GET | `/api/student/mobile/violations` | MobileViolationsTab |
| `fetchStudentMobileAlerts` | GET | `/api/student/mobile/alerts` | MobileStudentCenterPage |
| `suppressStudentMobileNoticeAutoOpen` | POST | `/api/student/mobile/notice-auto-suppress` | MobileNoticesPanel |
| `fetchStudentMobileGroupActivitySummary` | GET | `/api/student/mobile/group-activity/summary` | MobileGroupTab |
| (其余 group-activity/* 函数略) | GET | `/api/student/mobile/group-activity/*` | MobileGroupTab |

---

## 9. 可复用模块清单

| 模块 | 路径 | 复用方式 |
|------|------|---------|
| `loginWeb()` | `frontend/src/api/domains/auth.api.ts` | 直接调用 |
| `registerStudent()` / `verifyQrCode()` | `frontend/src/features/student/api/student.api.ts` | 直接调用 |
| `authStorage.setAuth()` / `markLoginPortal()` | `frontend/src/features/auth/authStorage.ts` | 直接调用，portal 标记为 `"mobile"` |
| `AuthGuard` | `frontend/src/router/AuthGuard.tsx` | 包裹 `/m/home` |
| `QrUploader` | `frontend/src/features/student/components/qr/qr-uploader.tsx` | 在 MobileRegisterPage 中复用 |
| `StudentDashboardService` | `modules/student/service/StudentDashboardService.java` | StudentMobileController 注入 |
| `StudentRoomService` | `modules/student/service/StudentRoomService.java` | StudentMobileController 注入 |
| `MaterialService` | `modules/material/service/MaterialService.java` | StudentMobileController 注入 |
| `StudentCageShelfService` | `modules/student/service/StudentCageShelfService.java` | StudentMobileController 注入 |
| `StudentViolationService` | `modules/student/service/StudentViolationService.java` | StudentMobileController 注入 |
| `MobileCenterAlertService` | `modules/student/service/MobileCenterAlertService.java` | StudentMobileController 注入 |
| `StudentActivityService` | `modules/analytics/service/StudentActivityService.java` | StudentMobileController 注入 |
| `AuthContextService` | `common/service/AuthContextService.java` | StudentMobileController 注入 |
| `hasMobileHtml5Privilege()` | `frontend/src/features/auth/roleAccess.ts` | 前端直接调用 |
| 所有移动端 Tab 组件 | `frontend/src/pages/mobile/Mobile*Tab.tsx` | 不改动 |
| `MobileBottomTabBar` / `MobileTopNavBar` | `frontend/src/pages/mobile/` | 不改动 |

---

## 10. 新增文件清单

### 新建

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/mobile/auth/MobileLoginPage.tsx` | H5 登录页面 |
| `frontend/src/pages/mobile/auth/MobileRegisterPage.tsx` | H5 注册页面（四步向导） |
| `frontend/src/api/domains/studentMobile.api.ts` | JWT 版学生移动端 API 函数 |
| `src/main/java/.../modules/student/controller/StudentMobileController.java` | JWT 版移动端 Controller |

### 修改

| 文件 | 变更内容 |
|------|---------|
| `frontend/src/router/index.tsx` | 新增 `/m/login`, `/m/register`, `/m/home` 路由 |
| `frontend/src/pages/mobile/MobileStudentCenterPage.tsx` | 支持 JWT 模式（无 token 参数时走 authHttp） |
| `frontend/src/pages/mobile/useMobileSocket.ts` | JWT 模式下传 Bearer token 替代 mobile token |
| `frontend/src/features/auth/authStorage.ts` | `markLoginPortal` 支持 `"mobile"` 值 |
| `frontend/src/App.tsx` | `RootEntryRedirect` 支持 mobile portal 跳转 |

### 明确不修改

| 文件 | 原因 |
|------|------|
| `mobileStudent.api.ts` | 旧 token 链路完整保留 |
| `StudentMobileCenterController.java` | 旧 public 接口完整保留 |
| 所有 `Mobile*Tab.tsx` | 接收的 props 结构不变 |
| `auth.api.ts` | 登录/注册接口不变 |
| `student.api.ts` | 注册流程接口不变 |
| `authHttp.ts` / `tokenRefresh.ts` | JWT 刷新机制不变 |
| `sys_user` 表 / `aro_personnel` 表 | 无 DDL 变更 |

---

## 11. 导入变更

`MobileStudentCenterPage.tsx` 新增导入：

```typescript
import { authStorage } from "@/features/auth/authStorage";
import * as studentMobileApi from "@/api/domains/studentMobile.api";
```

`studentMobile.api.ts` 从 `mobileStudent.api.ts` 导入全部类型定义：

```typescript
import type {
  MobileCenterProfile, MobileCenterStats, MobileCenterRoom,
  MobileCenterRecord, MobileCenterNotice, MobileRoomDashboardData,
  MobileRoomsData, MobileAccessRecordsData, MobileMaterialsData,
  MobileViolationsData, MobileAlertsData, MobileCageShelvesAllData,
  // ...
} from "./mobileStudent.api";
```

---

## 12. 边缘情况与错误处理

| 场景 | 处理方式 |
|------|---------|
| 非学生角色登录 H5 入口 | `loginWeb()` 返回后检查 `role !== "STUDENT"` → 提示"请使用学生登录入口"，不跳转 |
| 老用户无 `WEB_PASSWORD` authProfile | `loginWeb()` 后端返回对应错误，前端展示"请先通过 Web 端设置密码" |
| 注册时 userId 已存在 | 后端返回 409，前端提示"该身份已注册，请直接登录" |
| 注册时 username 已占用 | 后端返回 400，前端提示"用户名已被使用" |
| QR 图片无法解析 | `verifyQrCode()` 返回 `verified: false`，前端提示"无法识别二维码" |
| JWT 过期 | `tokenRefresh.ts` 拦截器自动刷新，失败则跳 `/m/login` |
| 网络断开 | 各 API 函数 reject，Tab 组件展示已有错误状态（`PageError` 组件） |
| 并发登录 | 无冲突，后登录的覆盖前一个 token（localStorage 同一 key） |
| `/m/home` 无 token 直接访问 | `AuthGuard` 拦截 → 跳转 `/m/login` |
| `/m/sc/:token` 保留访问 | 旧逻辑不变，token 过期展示"链接已失效" |
| 首页 5 个数据块中一个失败 | 独立请求，单个失败不影响其余渲染，失败区块展示重试按钮 |
| 重复提交申领 | 后端业务逻辑已有幂等检查 |

---

## 13. 约束与原则

### 明确不做

1. **不新增登录接口**：H5 登录完全复用 `POST /api/auth/login/web`，不创建 `/api/auth/login/mobile` 之类的新端点
2. **不修改旧 public 接口**：`/api/public/mobile-center/*` 任何一行都不动
3. **不改动 Tab 组件**：`MobileHomeTab`、`MobileRoomsTab` 等 8 个 Tab 组件的 props 接口不变
4. **不引入新的扫码库**：注册 QR 识别只用图片上传方式，不调手机摄像头
5. **不做微信 OAuth**：本次只做用户名密码登录，预留 WeChat 静默登录的扩展点但不实现

### 必须遵守

1. 所有新 API 端点使用 `authHttp`（JWT Bearer），禁止 publicHttp 访问
2. 新 Controller 方法必须调用 `authContextService.getCurrentUser()` 鉴权
3. 前端所有颜色使用 `var(--app-color-*)` 令牌，不得硬编码
4. 前端所有 z-index 使用 `var(--z-*)` 令牌

---

## 14. 错误码定义

复用现有错误码，不新增。涉及到的已有错误码：

| 错误码常量 | HTTP 状态码 | 场景 |
|-----------|-----------|------|
| `AUTH_LOGIN_FAILED` (1_001_001) | 401 | 用户名或密码错误 |
| `AUTH_TOKEN_INVALID` (1_001_002) | 401 | JWT 无效或过期 |

注册相关错误由 `StudentRegistrationService` 直接返回 `Result.fail(httpCode, msg)`，不经过 `ErrorCodeConstants`：

| HTTP 状态码 | 消息 | 场景 |
|-----------|------|------|
| 400 | 用户名格式不合法 / 密码过短 / userId 格式无效 | 参数校验失败 |
| 404 | 未在人员库中找到该学号 | QR 解码的 userId 不在 aro_personnel 中 |
| 409 | 该学生已注册 | userId 已有 sys_user 记录 |

---

## 15. 测试边界

### 前端

| 测什么 | 不测什么 |
|--------|---------|
| `MobileLoginPage`：表单输入 → 调用 loginWeb → 成功跳转 / 失败提示 | `loginWeb()` 内部逻辑（已有测试） |
| `MobileRegisterPage`：四步向导流程 → 调用 verifyQrCode + registerStudent | `verifyQrCode()` 内部 QR 解码（已有测试） |
| `MobileStudentCenterPage` JWT 模式：数据加载 → 5 个 tab 切换 | 各 Tab 子组件渲染细节 |
| `AuthGuard` 对 `/m/home` 的拦截行为 | AuthGuard 内部逻辑（已有测试） |

### 后端

| 测什么 | 不测什么 |
|--------|---------|
| `StudentMobileController` 每个端点：JWT 鉴权通过 → 返回正确数据 | Service 层业务逻辑（已有测试） |
| `StudentMobileController` 每个端点：无 JWT → 401 | Token 验证本身（Spring Security） |
| 新端点返回结构与旧 public 端点一致（字段名、类型） | 数据库查询正确性 |

**测试工具**：前端 Vitest + React Testing Library，后端 JUnit 5 + MockMvc。

---

## 16. 日志与可观测性

- **日志前缀**：`[StudentMobile]`
- **关键事件**：
  - INFO：每次 Controller 方法入口，记录 `userId` 和方法名
  - WARN：Service 调用异常但被降级处理时
  - ERROR：未预期的异常（与现有 Controller 日志级别一致）

不引入新的监控指标。

---

## 17. Z 轴层级

`MobileLoginPage` 和 `MobileRegisterPage` 为全屏页面，无浮层叠加。无需定义新 z-index。

---

## 18. 整体数据流（终态）

```
                    ┌─────────────────────────┐
                    │     QR 码（两种）          │
                    │  A. 通用入口（固定不变）     │
                    │  B. 直达 token（教工生成）   │
                    └──────┬────────┬─────────┘
                           │        │
              ┌────────────┘        └────────────┐
              ▼                                  ▼
     /#/m/login                           /#/m/sc/:token
     (MobileLoginPage)                    (MobileStudentCenterPage
       │                                    token 模式，publicHttp)
       ├─ 登录 ─→ JWT ─→ /#/m/home
       └─ 注册 ─→ JWT ─→ /#/m/home
                           │
              MobileStudentCenterPage
              (JWT 模式，authHttp)
                │
    ┌───────────┼───────────┬──────────┬──────────┐
    ▼           ▼           ▼          ▼          ▼
  HomeTab   RoomsTab   MaterialTab  RecordsTab  ...
  (profile  (独立JWT   (独立JWT    (独立JWT
   + home)   请求)      请求)       请求)
```

