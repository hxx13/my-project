# 特殊通道学生入口 · 架构设计

**日期**: 2026-06-08
**状态**: 设计评审通过
**分支**: refactor/twin-package-split
**依赖规范**: [ARCHITECTURE_BACKEND.md](../../ARCHITECTURE_BACKEND.md) · [ARCHITECTURE_FRONTEND_WEB.md](../../ARCHITECTURE_FRONTEND_WEB.md)

---

## 1. 概述与上下文

### 1.1 目标

利用学生刷卡弹出的个人信息弹窗（UiverseProfilePopup）作为切入口，通过数字键盘（PIN）验证，构建两条路径：

| 路径 | 说明 |
|------|------|
| **方案一 · 跳转学生中心** | 弹窗按钮 → 数字键盘验证 → 签发 JWT → 进入 /student/* |
| **方案二 · 弹窗内快捷业务** | 覆盖层展开业务 → 业务注册表驱动 → 提交时数字键盘确认 |

### 1.2 核心约束

- 数据来源：`aro_personnel` 表（user_id 为 19 位学号）
- 系统自动预建学生中心账号（与正式注册互通）
- 弹窗入口免账号密码，用个人数字密码（6-8 位纯数字，bcrypt 哈希）替代
- 方案二的快捷业务由后续 agent 通过注册表注入，本次仅搭建注册表框架
- 特殊通道 JWT 与 `POST /api/auth/login/web` 返回格式完全一致

### 1.3 架构设计原则

| 原则 | 说明 |
|------|------|
| **融入而非替代** | 复用 `AuthService.generateAuthResult()`，前端 `authStorage` 和 `AuthGuard` 零改动 |
| **壳与逻辑分离** | 每个复杂组件拆为 `Component.tsx`（壳）+ `useComponent.ts`（逻辑 hook）+ `Component.types.ts`（类型契约） |
| **注册表驱动扩展** | 方案二的快捷业务通过 `useBizRegistry` 注册/注销，BizOverlayShell 不感知具体业务 |
| **层级常量管理** | 所有 Portal z-index 集中在 `constants/zIndex.ts`，禁止硬编码数值 |
| **写操作有事务，读操作无事务** | 遵循 ARCHITECTURE_BACKEND.md Service 层规范 |
| **构造函数注入** | 所有后端类统一构造器注入，禁用 `@Autowired` 字段注入 |

---

## 2. 架构分层总览

### 2.1 模块归属

```
后端 (Spring Boot):
  modules/auth/                           ← 特殊通道归属 auth 模块
  ├── controller/
  │   ├── AuthController.java             (已有，不改)
  │   └── SpecialChannelController.java   (新建 — 3 个公开 API)
  ├── service/
  │   ├── AuthService.java                (已有，复用 generateAuthResult)
  │   ├── PasswordCredentialService.java  (已有，复用 bcrypt 哈希)
  │   ├── SpecialChannelService.java      (新建 — PIN 业务逻辑)
  │   └── StudentAccountProvisioner.java  (新建 — 定时预建账号)
  ├── dto/
  │   ├── SetPinRequest.java              (新建)
  │   ├── SpecialChannelLoginRequest.java (新建)
  │   └── PinStatusResponse.java          (新建)
  └── mapper/
      ├── UserMapper.java                 (已有，复用 findById/insertUser)
      └── AroPersonnelMapper.java         (已有，新增 PIN 查询方法)

  modules/aro/mapper/
  └── AroPersonnelMapper.xml              (修改 — 新增 PIN 相关 SQL)

  common/exception/
  └── ErrorCodeConstants.java             (修改 — 新增特殊通道错误码)

前端 (React + TypeScript):
  components/ui/                          ← 通用组件归属
  ├── NumericKeypad.tsx                   (新建 — 数字键盘壳)
  ├── useNumericKeypad.ts                 (新建 — 纯逻辑 hook)
  └── NumericKeypad.types.ts              (新建 — Props 类型)

  components/scanner/
  ├── index.ts                            (新建 — barrel 统一导出)
  ├── BizOverlayShell.tsx                 (新建 — 覆盖层容器壳)
  ├── useBizOverlayShell.ts               (新建 — 覆盖层逻辑 hook)
  ├── BizOverlayShell.types.ts            (新建 — Props + BizItem 类型)
  ├── useBizRegistry.ts                   (新建 — 业务注册表 hook)
  ├── specialChannel.api.ts               (新建 — API 封装)
  ├── UiverseProfilePopup.tsx             (修改 — 新增学生入口按钮)
  └── ...已有文件不变

  api/domains/
  └── specialChannel.api.ts               (新建 — 共享 API 类型定义)

  constants/
  └── zIndex.ts                           (新建 — Portal Z 轴层级常量)

  store/
  └── useSpecialChannelStore.ts           (新建 — Zustand，PIN 状态缓存)
```

### 2.2 数据流

```
刷卡 (ScannerPanel)
  │  searchPersonnel(userId)
  ▼
弹窗 (UiverseProfilePopup)  ← z=300
  │
  ├── [进入学生中心] ───────────────────────────────────────┐
  │     │  GET /api/auth/special-channel/pin-status         │
  │     ▼                                                   │
  │   ┌─ hasPin=false ── NumericKeypad (set 模式, z=500)    │
  │   │    输入(6-8位) → 确认 → POST set-pin                │
  │   │    → bcrypt 哈希写入 aro_personnel                  │
  │   │    → 签发 JWT → authStorage.setAuth()               │
  │   │                                                     │
  │   └─ hasPin=true ── NumericKeypad (verify 模式, z=500)  │
  │        输入 → POST login                                │
  │        → 成功: 签发 JWT → authStorage.setAuth()         │
  │        → 失败 3 次: 锁定 30s                            │
  │                                                         │
  │   token → authStorage.setAuth(token, "STUDENT", info)   │
  │        → navigate("/student/home") ─────────────────────┤
  │                                                         │
  └── [快捷业务] ───────────────────────────────────────────┤
        │  useBizRegistry.getItems()                        │
        ▼                                                   │
      BizOverlayShell (覆盖层, z=400)                        │
        ├── Header (title + 关闭)                            │
        ├── Body                                            │
        │   ├── 业务项A (后续注册, ErrorBoundary包裹)         │
        │   ├── 业务项B (后续注册, ErrorBoundary包裹)         │
        │   └── 空状态占位提示 (当前)                         │
        └── Footer [提交]                                   │
              → NumericKeypad (verify, z=500)               │
              → 验证通过 → onConfirm(pin)                   │
              → 业务项 onAfterConfirm 回调                  │
```

---

## 3. 数据库变更

### 3.1 DDL

```sql
-- 由 SpecialChannelTableBootstrap 在应用启动时幂等执行
ALTER TABLE aro_personnel
  ADD COLUMN personal_pin VARCHAR(255) NULL COMMENT 'bcrypt哈希，NULL=未设置';

ALTER TABLE aro_personnel
  ADD COLUMN pin_updated_at DATETIME NULL COMMENT 'PIN最后修改时间';
```

### 3.2 upsert 兼容性验证

**结论：安全。** 现有 `AroPersonnelMapper.xml` 的 `upsertPersonnelBatch` 仅更新 ARO 外部同步的列（name, department, gender 等），`personal_pin` 和 `pin_updated_at` 不在 INSERT VALUES 也不在 ON DUPLICATE KEY UPDATE 子句中，与 `total_exp`、`allowed_rooms_display_zh` 等应用管理列遵循相同保护模式，不会被外部同步覆盖。

**验证点：**
- `INSERT` 新人员时，`personal_pin` 默认 NULL（MySQL 列默认值）— 正确
- `UPDATE` 已有人员时，PIN 列不在 SET 子句 — 保留原值
- `aro_personnel` 表的 `allowed_rooms_display_zh` 和 `has_official_room_permission` 已证明此模式可靠

### 3.3 Bootstrap 类

```java
// 遵循 MiniProgramReleaseTableBootstrap 模式
@Component
@Order(6)  // 在已有 Bootstrap 之后执行
public class SpecialChannelTableBootstrap implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    // ALTER TABLE 用 try-catch 包装，列已存在时忽略
    // 首次启动执行全量账号预建 → StudentAccountProvisioner.provisionAll()
    // 日志前缀: [special-channel]
}
```

### 3.4 账号预建调度

```java
@Service
public class StudentAccountProvisioner {
    // @Scheduled(fixedDelay = 300_000)  // 每 5 分钟
    // 逻辑: SELECT user_id FROM aro_personnel
    //       （不过滤 role — aro_personnel 无 role 列，
    //        与 bindStudent 逻辑一致：人员库存在即可创建学生账号）
    //       对每个 userId → 检查 sys_user 是否存在
    //       不存在 → INSERT (id=userId, username=userId, role=STUDENT, status=1)
    // 幂等: INSERT 前先 SELECT，已存在跳过
    // 日志: [special-channel] provisioned=N skipped=M
}
```

**注意：** `aro_personnel` 表没有 `role` 列。账号预建扫描全员，与现有 `bindStudent` 行为一致（人员库中存在即可作为学生身份）。若后续需要按人员类型筛选，可使用 `user_type_names` 或 `user_class_name` 字段。

---

## 4. 后端 API 契约

### 4.1 Controller

```
SpecialChannelController
  路径前缀: /api/auth/special-channel
  认证: 公开接口（免 Bearer Token）
  返回类型: 统一 Result<T>
  构造函数注入: SpecialChannelService, AuthContextService
```

| 方法 | 路径 | 请求体/参数 | 返回值 | 说明 |
|------|------|------------|--------|------|
| `GET` | `/pin-status` | `?userId=` | `Result<PinStatusResponse>` | 查询是否已设 PIN |
| `POST` | `/set-pin` | `SetPinRequest` | `Result<AuthData>` | 首次设置 PIN，成功签发 JWT |
| `POST` | `/login` | `SpecialChannelLoginRequest` | `Result<AuthData>` | PIN 验证登录 |
| `POST` | `/admin/personnel/{userId}/reset-pin` | — | `Result<?>` | SUPER_ADMIN 重置 PIN |

**SetPinRequest:**
```java
@Data
public class SetPinRequest {
    @NotBlank private String userId;   // 19 位学号
    @NotBlank private String pin;      // 6-8 位纯数字
}
```

**SpecialChannelLoginRequest:**
```java
@Data
public class SpecialChannelLoginRequest {
    @NotBlank private String userId;
    @NotBlank private String pin;
}
```

**PinStatusResponse:**
```java
@Data
public class PinStatusResponse {
    private boolean hasPin;
}
```

### 4.2 Service

```java
@Service
public class SpecialChannelService {

    private final AroPersonnelMapper aroPersonnelMapper;
    private final UserMapper userMapper;
    private final AuthService authService;
    private final PasswordCredentialService passwordCredentialService;
    // 构造函数注入

    // 查询 PIN 状态（读操作，不加 @Transactional）
    public boolean hasPin(String userId);

    // 首次设置 PIN
    // @Transactional — 涉及 personnel 写入 + user 创建
    // 1. 校验 userId 存在于 aro_personnel
    // 2. 校验 personal_pin IS NULL（防止重复设置）
    // 3. 校验 pin 格式: 6-8 位纯数字
    // 4. bcrypt 哈希 → 写入 personal_pin + pin_updated_at
    // 5. 确保 sys_user 存在（兜底预建）
    // 6. 查询 User → generateAuthResult → 返回 AuthData
    // 异常: TwinBusinessException(PIN_ALREADY_SET) / (INVALID_PIN_FORMAT)
    public AuthData setPin(String userId, String rawPin);

    // PIN 登录
    // 读 user → 校验 PIN → 成功签发 / 失败计数+锁定
    // 1. 查询 aro_personnel.personal_pin
    // 2. NULL → throw PIN_NOT_SET
    // 3. bcrypt.compare → 失败 → incrementFailCount → 达到3次 → lockedUntil
    // 4. 成功 → 清零失败计数 → generateAuthResult
    // 锁定: 内存 Map<userId, FailRecord{failCount, lockedUntil}>
    public AuthData login(String userId, String rawPin);

    // 管理员重置（仅 SUPER_ADMIN 可调用）
    // @Transactional
    // 清空 personal_pin + pin_updated_at
    // 日志: [special-channel] PIN reset by admin=xxx for userId=xxx
    public void resetPin(String userId);
}
```

### 4.3 Mapper 新增方法

```java
// AroPersonnelMapper 新增
int updatePersonalPin(@Param("userId") String userId,
                      @Param("pinHash") String pinHash,
                      @Param("now") String now);

int clearPersonalPin(@Param("userId") String userId);

// 查询单字段，避免加载整行
@Select("SELECT personal_pin FROM aro_personnel WHERE user_id = #{userId}")
String findPersonalPinByUserId(@Param("userId") String userId);
```

**updatePersonalPin XML:**
```xml
<update id="updatePersonalPin">
    UPDATE aro_personnel
    SET personal_pin = #{pinHash},
        pin_updated_at = #{now}
    WHERE user_id = #{userId}
      AND personal_pin IS NULL   <!-- 防止覆盖已有 PIN -->
</update>
```

### 4.4 锁定策略实现

```
内存存储: ConcurrentHashMap<String, FailRecord>
  FailRecord: { int failCount; Instant lockedUntil; }

流程:
  login() 失败:
    1. record = map.computeIfAbsent(userId, ...)
    2. 若 record.lockedUntil > now → 返回 "已锁定，请X秒后重试"
    3. record.failCount++
    4. 若 record.failCount >= 3 → record.lockedUntil = now + 30s
    5. 返回 "PIN 错误"

  login() 成功:
    1. map.remove(userId)  // 清零

未来升级路径: 替换为 Redis，接口不变（SpecialChannelService 内部封装）
```

---

## 5. 前端组件接口契约

### 5.1 壳与逻辑分离模式

所有复杂组件遵循统一的三文件结构：

```
ComponentName.tsx        ← 组件壳（仅渲染，从 hook 取值）
useComponentName.ts      ← 纯逻辑 hook（状态机、API 调用、不引入 JSX）
ComponentName.types.ts   ← 所有 Props + 事件类型集中定义
```

**调用方只需：**
```ts
import { NumericKeypad, BizOverlayShell } from '@/components/scanner';
```

### 5.2 NumericKeypad（通用组件，归属 components/ui/）

**NumericKeypad.types.ts:**

```ts
export type KeypadMode = "set" | "verify";
export type KeypadStep = "input" | "confirm";

export interface NumericKeypadProps {
  mode: KeypadMode;
  userId: string;
  userName?: string;
  onSuccess: (result: AuthData) => void;
  onCancel: () => void;
  className?: string;
}

// Hook 暴露给壳的状态和方法
export interface UseNumericKeypadReturn {
  // 状态
  dots: number[];
  mode: KeypadMode;
  step: KeypadStep;
  isLocked: boolean;
  lockSeconds: number;
  errorText: string | null;
  isLoading: boolean;
  // 动作
  handleDigit: (d: number) => void;
  handleDelete: () => void;
  handleSubmit: () => void;
  handleCancel: () => void;
}
```

**useNumericKeypad.ts — 状态机:**

```
                    ┌─────────┐
        ┌──────────→│  idle   │←─────────────── cancel
        │           └────┬────┘
        │                │ 开始输入
        │           ┌────▼────┐
        │   ┌───────│  input   │←─────────────────┐
        │   │       └────┬────┘                   │
        │   │            │ 提交                   │ (set) 两次不一致
        │   │       ┌────▼────┐                   │
        │   │       │verifying│───────────────────┘
        │   │       └────┬────┘
        │   │            │
        │   │     ┌──────┴──────┐
        │   │     │             │
        │   │  success       failure
        │   │     │             │
        │   │  onSuccess   ┌───▼────┐
        │   │              │ locked │──30s→ idle
        │   │              └────────┘
        │   │
 (set) confirm:
   idle → input(首次) → confirming(二次确认) → setPin → success
                                              → failure
```

**实现：** 一个 `useReducer`，不引入 XState 等外部库。

**NumericKeypad.tsx — 壳：**
- 调用 `useNumericKeypad` 获取状态和 handler
- 渲染三列网格 `[1,2,3] [4,5,6] [7,8,9] [空,0,退格]`
- 圆点指示器 + 提示文字 + 错误文字 + 锁定倒计时
- Portal 渲染到 `document.body`，z=500（引用 `Z_INDEX.keypad`）
- 所有样式通过 CSS 变量和 className 透出，无硬编码视觉
- 锁定态：所有数字按钮 disabled，倒计时文字替换提示

### 5.3 BizOverlayShell（覆盖层容器，归属 components/scanner/）

**BizOverlayShell.types.ts:**

```ts
import type { ReactNode, ComponentType } from "react";

// 业务项与容器之间的唯一接口契约
export interface BizItemSlotProps {
  userId: string;
  pin: string;                  // 已验证的 PIN
  onDone: () => void;           // 业务完成
  onError: (msg: string) => void;
}

// 注册表中的业务项定义
export interface BizItem {
  id: string;
  label: string;
  icon?: ReactNode;
  order: number;
  component: ComponentType<BizItemSlotProps>;
  enabled?: boolean;

  // 生命周期钩子（全部可选）
  onBeforeConfirm?: (pin: string) => boolean | Promise<boolean>;
  onAfterConfirm?: (pin: string) => void | Promise<void>;
  validate?: () => string | null;  // null=通过, string=错误提示
}

export interface BizOverlayShellProps {
  userId: string;
  title: string;
  onCancel: () => void;
  className?: string;
}
```

**useBizOverlayShell.ts:**
```
状态: isOpen, showKeypad
动作: open(), close(), confirm() → showKeypad=true
handlePinSuccess(authData) → onConfirm(pin) → close
```

**BizOverlayShell.tsx — 壳：**
- Portal 渲染到 `document.body`，z=400（引用 `Z_INDEX.bizOverlay`）
- 结构: 遮罩层 / Header(title + 关闭) / Body(children) / Footer(提交按钮)
- 每个业务项独立 `<ErrorBoundary>` 包裹，一个崩溃不影响其他
- 空状态: children 为空时渲染占位提示
- `onConfirm` 逻辑: 遍历 items 调 `onBeforeConfirm`，全部通过后调 `showKeypad`

### 5.4 useBizRegistry（业务注册表）

```ts
// 使用 Zustand store（遵循项目状态管理惯例）
// store/useSpecialChannelStore.ts

interface BizRegistryState {
  items: Map<string, BizItem>;

  register: (item: BizItem) => void;
  unregister: (id: string) => void;
  getItems: () => BizItem[];    // 按 order 排序，过滤 enabled=false
  clear: () => void;
}

// 使用方式（后续 agent 注册业务）:
// const { register } = useBizRegistry();
// register({ id: "attendance", label: "签到", order: 1, component: AttendanceForm });
```

### 5.5 specialChannel.api.ts（API 封装）

```ts
// 使用原始 axios（非 authHttp），因为这些是公开接口
import axios from "axios";
import type { AuthData } from "@/api/domains/auth.api";

const BASE = "/api/auth/special-channel";

export async function checkPinStatus(userId: string): Promise<boolean>;
export async function setPin(userId: string, pin: string): Promise<AuthData>;
export async function specialChannelLogin(userId: string, pin: string): Promise<AuthData>;
// 均遵循项目 Result<T> 包装格式，取 response.data.data
```

### 5.6 UiverseProfilePopup 改造

**改造原则：最小侵入。** 不改变现有布局、动画、数据结构。

| 改动点 | 说明 |
|--------|------|
| z-index | `z-[99999]` → `Z_INDEX.scannerPopup`（300） |
| 底部新增按钮区域 | 与现有 ActionButtons 并列，仅 `role === STUDENT` 时渲染 |
| "进入学生中心"按钮 | 流程见 2.2 数据流 |
| "快捷业务"按钮 | 打开 BizOverlayShell |
| Props 扩展 | 新增 `onEnterStudentCenter?` / `onOpenQuickActions?` 回调 |

**导入变更（UiverseProfilePopup.tsx）：**
```tsx
+ import { Z_INDEX } from '@/constants/zIndex';
+ import { checkPinStatus } from '@/components/scanner/specialChannel.api';
+ import { authStorage } from '@/features/auth/authStorage';
// z 值替换
- className="fixed inset-0 z-[99999] ..."
+ className="fixed inset-0 ..."
+ style={{ zIndex: Z_INDEX.scannerPopup }}
```

---

## 6. Z 轴层级体系

### 6.1 常量定义

```ts
// frontend/src/constants/zIndex.ts
export const Z_INDEX = {
  base: 0,
  dropdown: 100,
  modal: 200,
  scannerPopup: 300,       // UiverseProfilePopup
  popupNotice: 310,         // ScanAccessNoticeOverlay
  popupModal: 320,          // DisciplinaryModal
  bizOverlay: 400,          // BizOverlayShell
  keypad: 500,              // NumericKeypad（永远最顶层）
  globalToast: 600,         // 全局 Toast/Notification
} as const;
```

### 6.2 使用规则

- 所有 Portal 组件必须引用 `Z_INDEX` 常量，**禁止硬编码 z 值**
- 每层间隔 100，为未来插入层留空间
- 同一功能域内的子层 +10（如 300→310→320）
- 新增层级需在此常量文件中定义并加注释

### 6.3 受影响的现有文件

| 文件 | 改动 |
|------|------|
| `UiverseProfilePopup.tsx` | `z-[99999]` → `Z_INDEX.scannerPopup` |
| `ScanAccessNoticeOverlay.tsx` | 硬编码 z → `Z_INDEX.popupNotice` |
| `DisciplinaryModal` (UiverseProfilePopup 内) | 引用 `Z_INDEX.popupModal` |
| `ExpToaster.tsx` | 不改（渲染在 UiverseProfilePopup Portal 内部，z 继承父级） |

---

## 7. 安全设计

### 7.1 分层防护

| 层级 | 措施 | 实现位置 |
|------|------|---------|
| 传输 | HTTPS | 已有基础设施 |
| 存储 | bcrypt 哈希，永不明文 | PasswordCredentialService (已有) |
| 客户端限流 | 3 次失败锁定 30s | useNumericKeypad 状态机 |
| 服务端限流 | 3 次失败锁定 30s | SpecialChannelService (ConcurrentHashMap) |
| 权限 | token role 固定 STUDENT | AuthService.generateAuthResult |
| 重置 | 仅 SUPER_ADMIN | SpecialChannelController + SuperAdminGuard |
| 密码强度 | 6-8 位纯数字，范围 000000-99999999 | 正则 `^\d{6,8}$` |

### 7.2 锁定策略细节

- 客户端和服务端**独立计数**，互不依赖
- 客户端锁定: UI 倒计时，不可绕过
- 服务端锁定: `userId` 维度，防止跨客户端暴力尝试
- 登录成功: 双端同时清零
- 服务重启: 内存锁失效（可接受，PIN 空间 10^8，暴力不可行）

---

## 8. 路由与导航

### 8.1 特殊通道登录后跳转

```ts
// UiverseProfilePopup 内部（或通过回调）
const onEnterStudentCenter = async () => {
  const hasPin = await checkPinStatus(userId);
  // → NumericKeypad (set/verify)
  // → onSuccess: (authData) => {
  //     authStorage.setAuth(authData.token, authData.role, authData.userInfo);
  //     navigate("/student/home");
  //   }
};
```

### 8.2 路由不变

- 特殊通道登录的 JWT 与正常登录完全一致
- `AuthGuard requireRole="STUDENT"` 已保护 `/student/*` 路由
- 不需要新增路由，不需要修改 `router/index.tsx`

### 8.3 导航后体验

- 学生中心页面检测到 `authStorage` 有 token → 正常渲染
- 学生中心内的导航（home/records/rooms/stats...）完全不受影响
- 登出: 复用现有登出逻辑（清除 authStorage → 跳转首页）

---

## 9. 数据对接清单

| 序号 | 调用方 | API | 请求方式 | 说明 |
|------|--------|-----|---------|------|
| 1 | UiverseProfilePopup | `GET /api/auth/special-channel/pin-status` | axios (公开) | 判断弹设置 PIN 还是验证 PIN |
| 2 | NumericKeypad (set) | `POST /api/auth/special-channel/set-pin` | axios (公开) | 首次设 PIN，获得 JWT |
| 3 | NumericKeypad (verify) | `POST /api/auth/special-channel/login` | axios (公开) | PIN 登录，获得 JWT |
| 4 | AdminPersonnelPage | `POST /api/admin/personnel/{userId}/reset-pin` | authHttp | 管理员重置 PIN |
| 5 | StudentAccountProvisioner | `aro_personnel` → `sys_user` | 后端定时任务 | 账号预建 |

---

## 10. 可复用模块清单

| 模块 | 路径 | 用途 |
|------|------|------|
| `PasswordCredentialService` | `modules/auth/service/PasswordCredentialService.java` | bcrypt 哈希/验证 |
| `AuthService.generateAuthResult()` | `modules/auth/service/AuthService.java` | JWT 签发 |
| `AuthContextService` | `common/service/AuthContextService.java` | 从 Bearer token 解析 User |
| `Result<T>` | `common/dto/Result.java` | 统一响应包装 |
| `TwinBusinessException` | `common/exception/TwinBusinessException.java` | 业务异常 |
| `ErrorCodeConstants` | `common/exception/ErrorCodeConstants.java` | 错误码常量 |
| `authStorage` | `features/auth/authStorage.ts` | 前端 token 存储 |
| `AuthGuard` | `router/AuthGuard.tsx` | 路由保护 |
| `hasMinRole` | `features/auth/roleAccess.ts` | 角色判断 |
| `SuperAdminGuard` | `router/SuperAdminGuard.tsx` | 超管保护 |
| `AdminPageShell` | `components/admin/AdminPageShell.tsx` | 管理端页面壳 |
| `axios` (原始实例) | — | 公开 API 请求 |

---

## 11. 新增文件清单

### 后端新建

| 文件 | 说明 |
|------|------|
| `modules/auth/controller/SpecialChannelController.java` | 特殊通道 Controller |
| `modules/auth/service/SpecialChannelService.java` | PIN 业务逻辑 |
| `modules/auth/service/StudentAccountProvisioner.java` | 定时预建账号 |
| `modules/auth/dto/SetPinRequest.java` | 设置 PIN 请求体 |
| `modules/auth/dto/SpecialChannelLoginRequest.java` | PIN 登录请求体 |
| `modules/auth/dto/PinStatusResponse.java` | PIN 状态响应 |
| `common/component/SpecialChannelTableBootstrap.java` | 启动时建表 |

### 后端修改

| 文件 | 改动 |
|------|------|
| `modules/aro/mapper/AroPersonnelMapper.java` | 新增 `findPersonalPinByUserId` / `updatePersonalPin` / `clearPersonalPin` |
| `resources/mapper/AroPersonnelMapper.xml` | 新增对应 XML SQL |
| `common/exception/ErrorCodeConstants.java` | 新增特殊通道相关错误码 |

### 前端新建

| 文件 | 说明 |
|------|------|
| `constants/zIndex.ts` | Portal Z 轴层级常量 |
| `components/ui/NumericKeypad.tsx` | 数字键盘壳 |
| `components/ui/useNumericKeypad.ts` | 数字键盘纯逻辑 hook |
| `components/ui/NumericKeypad.types.ts` | 数字键盘类型定义 |
| `components/scanner/index.ts` | Barrel 统一导出 |
| `components/scanner/BizOverlayShell.tsx` | 覆盖层容器壳 |
| `components/scanner/useBizOverlayShell.ts` | 覆盖层逻辑 hook |
| `components/scanner/BizOverlayShell.types.ts` | 覆盖层 + BizItem 类型定义 |
| `components/scanner/useBizRegistry.ts` | 业务注册表 hook（导出 Zustand store） |
| `components/scanner/specialChannel.api.ts` | 特殊通道 API 封装 |
| `api/domains/specialChannel.api.ts` | 共享 API 类型定义 |
| `store/useSpecialChannelStore.ts` | Zustand store（业务注册表 + PIN 缓存） |

### 前端修改

| 文件 | 改动 |
|------|------|
| `components/scanner/UiverseProfilePopup.tsx` | z 值替换 + 底部新增按钮区域 |
| `components/scanner/ScanAccessNoticeOverlay.tsx` | z 值替换为常量 |
| `components/scanner/ExpToaster.tsx` | 不改（渲染在 UiverseProfilePopup Portal 内部，z 继承父级） |
| `pages/AdminPersonnelPage.tsx` | 学生 tab 表格新增"个人密码"列 + 重置按钮 |

### 无需修改（明确排除）

| 文件 | 原因 |
|------|------|
| `router/index.tsx` | 路由不变 |
| `router/AuthGuard.tsx` | 零改动 |
| `features/auth/authStorage.ts` | 零改动 |
| `modules/auth/service/AuthService.java` | 复用 generateAuthResult，不修改 |
| `modules/auth/controller/AuthController.java` | 不修改 |
| `ScannerPanel.tsx` | 仅传回调 Props 给 Popup，不改核心逻辑 |
| 学生中心全部页面 | 入口透明，零改动 |

---

## 12. 导入变更

### UiverseProfilePopup.tsx

```tsx
// 新增导入
+ import { Z_INDEX } from '@/constants/zIndex';
+ import { checkPinStatus } from '@/components/scanner/specialChannel.api';
// barrel 导出后统一为:
+ import { checkPinStatus, BizOverlayShell } from '@/components/scanner';

// 移除硬编码
- className="fixed inset-0 z-[99999] ..."
+ className="fixed inset-0 ..." style={{ zIndex: Z_INDEX.scannerPopup }}
```

### AdminPersonnelPage.tsx

```tsx
// 新增导入
+ import { resetStudentPin } from '@/api/domains/specialChannel.api';
// 表格新增列: "个人密码" → 状态标签 + 重置按钮
```

### ScannerPanel.tsx（如需传回调）

```tsx
// 可能新增
+ import { useNavigate } from 'react-router-dom';
// UiverseProfilePopup Props 新增:
+ onEnterStudentCenter={() => { /* PIN flow → navigate */ }}
```

---

## 13. 边缘情况与错误处理

| 场景 | 处理方式 |
|------|---------|
| **userId 不在 aro_personnel 中** | 所有接口先查 personnel 表，不存在返回 404 "未在人员库中找到该学号" |
| **PIN 已设置但再次调 set-pin** | Service 层校验 `personal_pin IS NULL`，Mapper XML 同样条件防竞态，返回 400 "已设置过个人密码" |
| **PIN 未设置但调 login** | 返回 400 "请先设置个人密码"，不泄露人员是否存在 |
| **PIN 格式不合法** | 正则 `^\d{6,8}$`，前后端双重校验，返回 400 "密码为6-8位纯数字" |
| **连续 3 次失败** | 客户端 + 服务端各锁定 30s，返回剩余秒数 |
| **set-pin 并发调用** | Mapper XML `WHERE personal_pin IS NULL` 防竞态，第二次调用返回 0 行 → Service 抛异常 |
| **账号预建时 sys_user 已存在** | 先 SELECT 再 INSERT，幂等跳过 |
| **personnel 表无 role 字段** | 通过 `user_type_names` 或 `user_class_name` 判定学生身份，需确认业务规则 |
| **NumericKeypad 打开时按 Esc** | 触发 `onCancel` 回调，回到弹窗 |
| **BizOverlayShell 中所有业务项 disabled** | 渲染空状态占位提示 |
| **BizOverlayShell 中一个业务组件崩溃** | ErrorBoundary 捕获，仅该组件显示错误卡片，其他业务项正常 |
| **token 过期后访问学生中心** | 已有 token refresh 拦截器自动处理 |
| **浏览器关闭 localStorage 清除** | 无持久化需求，下次刷卡重新验证 PIN |

---

## 14. 约束与原则

### 14.1 明确不做的

- ❌ 方案二的快捷业务具体实现（签到/异常上报/物品申领等）— 由后续 agent 负责
- ❌ 数字键盘的最终视觉样式 — 预留 CSS 变量，独立样式文件
- ❌ 批量预写入的手动触发 UI — 系统定时自动执行
- ❌ 学生中心内部的 PIN 修改功能 — 后续在学生中心设置页迭代
- ❌ 修改 `AuthService.generateAuthResult()` 或 JWT 格式
- ❌ 修改 `router/index.tsx` 或 `AuthGuard.tsx`
- ❌ 引入新的第三方状态机库（XState 等）— useReducer 足够
- ❌ PIN 锁定持久化（Redis）— 当前体量内存足够，后续可无感升级

### 14.2 必须遵守的

- ✅ Barrel export：调用方一律从 `@/components/scanner` 导入
- ✅ 壳与逻辑分离：每个新组件三文件结构
- ✅ z-index 常量化：禁止硬编码
- ✅ 构造函数注入：后端所有类
- ✅ `@Transactional` 仅写操作
- ✅ 业务异常统一 `TwinBusinessException`
- ✅ Mapper 参数用 `@Param`
- ✅ 日志前缀 `[special-channel]` 统一标识

---

## 15. 错误码定义

### ErrorCodeConstants 新增

```java
// 特殊通道 (special-channel)
public static final int SPECIAL_CHANNEL_PIN_ALREADY_SET  = 4101;  // "已设置过个人密码"
public static final int SPECIAL_CHANNEL_PIN_NOT_SET       = 4102;  // "请先设置个人密码"
public static final int SPECIAL_CHANNEL_PIN_INVALID       = 4103;  // "个人密码错误"
public static final int SPECIAL_CHANNEL_PIN_FORMAT        = 4104;  // "密码为6-8位纯数字"
public static final int SPECIAL_CHANNEL_USER_NOT_FOUND    = 4105;  // "未在人员库中找到该学号"
public static final int SPECIAL_CHANNEL_PIN_LOCKED        = 4106;  // "密码已锁定，请{seconds}秒后重试"
public static final int SPECIAL_CHANNEL_ACCOUNT_DISABLED  = 4107;  // "账号已禁用"
```

**范围分配：** 41xx 分配给特殊通道模块，不与现有错误码冲突。

### HTTP 状态码映射

| 错误码 | HTTP 状态 | 场景 |
|--------|----------|------|
| 4101, 4104 | 400 Bad Request | 客户端参数/状态错误 |
| 4102 | 400 Bad Request | PIN 未设置 |
| 4103 | 401 Unauthorized | PIN 错误 |
| 4105 | 404 Not Found | 人员不存在 |
| 4106 | 429 Too Many Requests | 锁定中 |
| 4107 | 403 Forbidden | 账号禁用 |

---

## 16. 测试边界

### 16.1 后端测试

| 测试对象 | 类型 | 测什么 | 不测什么 |
|----------|------|--------|---------|
| `SpecialChannelService` | 单元 (JUnit + Mockito) | PIN 设置/验证/锁定/重置的状态逻辑；格式校验；异常路径 | 数据库真实连接 |
| `SpecialChannelController` | 集成 (MockMvc) | HTTP 状态码映射、返回体结构、参数校验 | Service 内部逻辑（Mock 掉） |
| `AroPersonnelMapper` (PIN 方法) | 集成 (MyBatis Test) | updatePersonalPin 防竞态 WHERE 条件；NULL 初始状态 | upsert 交互（已有测试覆盖） |
| `StudentAccountProvisioner` | 单元 | 幂等逻辑；计数正确性 | 真实定时调度 |

### 16.2 前端测试

| 测试对象 | 类型 | 测什么 | 不测什么 |
|----------|------|--------|---------|
| `useNumericKeypad` | 单元 (Vitest + renderHook) | 状态机转换路径；错误计数+锁定倒计时；set 模式两阶段 | UI 渲染 |
| `useBizRegistry` | 单元 (Vitest) | register/unregister/getItems/排序/enabled 过滤 | 与 BizOverlayShell 的集成 |
| `specialChannel.api.ts` | 单元 (MSW Mock) | 请求体序列化；响应解析；错误路径 | 真实网络 |
| `UiverseProfilePopup` | 暂不测 | — | 交互复杂，优先级低，后续补充 |
| `NumericKeypad` (壳) | 暂不测 | — | 纯渲染，视觉验收为主 |
| `BizOverlayShell` (壳) | 暂不测 | — | 同上 |

---

## 17. 日志与可观测性

### 17.1 日志前缀

所有特殊通道相关日志统一前缀 `[special-channel]`，遵循项目已有惯例（参考 `[CageShelf]`、`[mp-release]`）。

### 17.2 关键事件记录点

| 事件 | 级别 | 格式 |
|------|------|------|
| PIN 设置成功 | INFO | `[special-channel] PIN set userId=xxx` |
| PIN 登录成功 | INFO | `[special-channel] login ok userId=xxx` |
| PIN 登录失败 | WARN | `[special-channel] login fail userId=xxx attempt=N` |
| PIN 锁定 | WARN | `[special-channel] locked userId=xxx until=yyyy-MM-ddTHH:mm:ss` |
| 管理员重置 PIN | WARN | `[special-channel] PIN reset by admin=xxx for userId=xxx` |
| 账号预建批次 | INFO | `[special-channel] account provision: created=N skipped=M` |
| 账号预建异常 | ERROR | `[special-channel] provision failed userId=xxx: msg` |
| Bootstrap 建表 | INFO | `[special-channel] ensured column aro_personnel.personal_pin` |

### 17.3 监控指标（可选，后续补）

- PIN 设置数 / 天
- PIN 登录成功 / 失败比率
- 锁定触发次数
- 账号预建延迟（人员入库 → 账号创建的时间差）

---

## 18. 清理清单

- [ ] 移除 `UiverseProfilePopup.tsx` 中的硬编码 `z-[99999]`
- [ ] 移除 `ScanAccessNoticeOverlay.tsx` 中的硬编码 z 值
- [ ] 确认 `aro_personnel` 表 `role` 判定逻辑（当前无 `role` 列，需确认学生判定方式）
