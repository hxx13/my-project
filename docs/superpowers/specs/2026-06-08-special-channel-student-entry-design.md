# 特殊通道学生入口 · 设计方案

**日期**: 2026-06-08
**状态**: 待评审
**分支**: refactor/twin-package-split

---

## 1. 需求概述

利用学生刷卡弹出的个人信息弹窗（UiverseProfilePopup）作为切入口，构建两条新路径：

| 路径 | 说明 | 密码 |
|------|------|------|
| **方案一 · 跳转学生中心** | 弹窗按钮 → 数字键盘验证 → 免密登录 → 进入 /student/* | 同一套个人数字密码 |
| **方案二 · 弹窗内快捷业务** | 覆盖层展开业务操作 → 提交时数字键盘确认 | 同一套个人数字密码 |

**核心约束**:
- 数据来源：人员授权页面（AdminPersonnelPage）学生 tab 中的 19 位 userid
- 系统自动根据 userid 预建学生中心账号（与正式注册互通）
- 弹窗入口免账号密码，用个人数字密码（6-8 位纯数字）替代
- 方案二的快捷业务由后续 agent 实现，本次仅预留框架

---

## 2. 架构决策

采用 **轻量融入式方案**：
- 特殊通道登录返回与 `loginWeb` 完全相同的 JWT 格式 (`{ token, role, userInfo }`)
- 前端复用 `authStorage.setAuth()` + 现有 `AuthGuard`，零改动
- PIN 存储在 personnel 表，bcrypt 哈希

---

## 3. 数据库变更

### personnel 表新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `personal_pin` | VARCHAR(255) | bcrypt 哈希，NULL = 未设置 |
| `pin_updated_at` | DATETIME | 最后修改时间，可空 |

对应 SQL 迁移文件，遵循项目现有迁移规范。

### 学生中心账号预建

系统自动扫描 personnel 表（role=STUDENT），对尚无系统账号的 userid，自动创建 system_users 记录：
- username = userid（19 位）
- role = STUDENT
- 状态 = 启用
- 无需预设密码（通过特殊通道 PIN 进入，正式注册时自行设密）

**触发时机**: 系统后台定时任务自动执行（非手动触发），增量扫描，幂等。

---

## 4. 后端 API

### 4.1 `GET /api/auth/special-channel/check-pin-status`
查询某 userid 是否已设置个人密码。

- **Method**: GET
- **Query**: `?userId={19位userId}`
- **Response**: `{ hasPin: boolean }`
- **用途**: 前端弹数字键盘前调用，决定展示"设置 PIN"还是"验证 PIN"

### 4.2 `POST /api/auth/special-channel/set-pin`
首次设置个人密码（仅当 personal_pin IS NULL 时允许）。

- **Body**: `{ userId: string, pin: string }`
- **校验**: pin 长度 6-8 位纯数字；personal_pin 必须为 NULL
- **处理**: bcrypt 哈希后写入 personnel 表，同时确保学生中心账号已预建
- **Response**: `{ token: string, role: "STUDENT", userInfo: AuthUserInfo }`
- **说明**: 设置成功直接签发 JWT，前端拿到即跳转，无需二次验证

### 4.3 `POST /api/auth/special-channel/login`
特殊通道登录（已有 PIN 时使用）。

- **Body**: `{ userId: string, pin: string }`
- **校验**: bcrypt.compare(pin, personal_pin)
- **失败处理**:
  - PIN 未设置 → 400 `"请先设置个人密码"`
  - PIN 不匹配 → 401，记录失败次数（建议 3 次锁定 30s）
- **Response**: `{ token: string, role: "STUDENT", userInfo: AuthUserInfo }`（与 `loginWeb` 完全一致）

### 4.4 `POST /api/admin/personnel/{userId}/reset-pin`
管理员重置某学生的个人密码（清空 personal_pin，下次需重新设置）。

- **权限**: SUPER_ADMIN
- **Response**: `{ success: true }`

### 4.5 学生中心账号自动预建（定时任务）

- **逻辑**: 扫描 personnel WHERE role='STUDENT' AND userid 对应的 system_users 不存在 → INSERT
- **SQL 迁移后首次执行全量**，之后增量
- **幂等**: 已有账号不重复创建
- **日志**: 记录每次执行创建数/跳过数

---

## 5. 前端设计

### 5.1 组件注册与文件组织（重要）

采用 barrel export 模式，组件接口契约与实现分离：

```
frontend/src/components/scanner/
├── index.ts                          # barrel 统一导出 — 调用方唯一入口
├── NumericKeypad.tsx                  # 组件壳 (可替换为开源组件)
├── useNumericKeypad.ts               # 纯逻辑 hook (与 UI 无关)
├── NumericKeypad.types.ts            # Props / 事件类型定义
├── BizOverlayShell.tsx               # 覆盖层容器壳 (可替换)
├── useBizOverlayShell.ts             # 覆盖层逻辑 hook
├── BizOverlayShell.types.ts          # Props / 事件类型定义
├── specialChannel.api.ts             # 特殊通道 API 封装 (check/set/login)
└── ...已有文件不变
```

**调用方只需**:
```ts
import { NumericKeypad, BizOverlayShell } from '@/components/scanner';
```

组件实现内部通过 hook 驱动，壳与逻辑解耦。替换开源组件时：保持 Props 接口不变，只改壳文件。

### 5.2 解耦原则

- **逻辑 hook** — 纯 TS，不引入 JSX，不依赖任何 UI 库。处理状态机、API 调用、错误计数
- **组件壳** — 仅渲染，从 hook 取值，通过 `className`/`style` 透出样式控制点
- **类型文件** — 所有 Props 集中定义，组件与 hook 共同引用
- **API 文件** — 封装 `check-pin-status` / `set-pin` / `login` 三个调用，返回 Promise

### 5.3 NumericKeypad 组件

**类型**: `NumericKeypad.types.ts`

```ts
interface NumericKeypadProps {
  mode: "set" | "verify";
  userId: string;
  userName?: string;
  onSuccess: (result: { token: string; role: string; userInfo: AuthUserInfo }) => void;
  onCancel: () => void;
  className?: string;
}
```

**Hook**: `useNumericKeypad.ts`
- 输入缓冲管理：追加/删除数字，长度限制 6-8
- 设置模式：两阶段（输入 → 确认），比对一致后调 `setPin()`，成功回调 onSuccess
- 验证模式：调 `specialChannelLogin()`，成功回调 onSuccess
- 错误限制：连续 3 次失败锁定 30s（客户端计时器）
- 键盘布局约定：`[1,2,3] [4,5,6] [7,8,9] [空,0,退格]` 三列网格
- Portal 层：z-index 高于弹窗（约定值 100001）

**组件壳**: `NumericKeypad.tsx`
- 调用 `useNumericKeypad` 获取状态和 handler
- 渲染数字键盘网格 + 圆点指示器 + 提示文字
- 所有样式通过 CSS 变量和 className 控制，无硬编码视觉

### 5.4 UiverseProfilePopup 改造

在弹窗底部新增两个操作按钮：

1. **"进入学生中心"按钮**（仅 role=STUDENT 时显示）
   - 点击 → GET check-pin-status
   - hasPin=false → 打开 NumericKeypad mode="set"
   - hasPin=true → 打开 NumericKeypad mode="verify"
   - onSuccess → navigate("/student/home")

2. **"快捷业务"按钮**（仅 role=STUDENT 时显示）
   - 点击 → 打开 BizOverlayShell

按钮区域与现有 ActionButtons 并列，通过 prop 控制显示。

### 5.5 BizOverlayShell 覆盖层容器

**类型**: `BizOverlayShell.types.ts`

```ts
interface BizOverlayShellProps {
  userId: string;
  title: string;
  children: ReactNode;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  className?: string;
}
```

**Hook**: `useBizOverlayShell.ts`
- 管理覆盖层开/关状态
- 管理提交确认流：点击提交 → 打开 NumericKeypad(verify) → 验证通过 → onConfirm

**组件壳**: `BizOverlayShell.tsx`
- Portal (z=100000)，高于弹窗
- 结构：遮罩层 / Header(title + 关闭) / Body(children 插槽) / Footer(提交按钮)
- 当前 children 为空时渲染占位提示，后续 agent 注入具体业务内容

### 5.5 AdminPersonnelPage 改造

学生 tab 表格新增"个人密码"列：

| 显示 | 条件 |
|------|------|
| 🔐 已设置（绿色标签） | personal_pin IS NOT NULL |
| 🔐 未设置（红色标签） | personal_pin IS NULL |
| 重置按钮 | 仅 SUPER_ADMIN 可见，点击 → reset-pin |

注意：**不展示 PIN 明文**，仅显示状态标签。

### 5.6 路由与认证

- 特殊通道拿到的 JWT 与正常登录一致，role=STUDENT
- `AuthGuard` 无需改动，已有 `<AuthGuard requireRole="STUDENT">` 保护 /student/*
- 登录后跳转逻辑复用现有 `authStorage.setAuth()` 流程

---

## 6. 完整交互流

```
刷卡 (ScannerPanel)
  │
  ▼
弹窗 (UiverseProfilePopup)
  │
  ├── [进入学生中心] ──────────────────────────────────────┐
  │     │                                                  │
  │     ▼                                                  │
  │   check-pin-status ──┬── hasPin=false ── NumericKeypad │
  │                      │     (set 模式: 输入→确认→写PIN)  │
  │                      │     → 签发 token               │
  │                      │                                │
  │                      └── hasPin=true ── NumericKeypad  │
  │                            (verify 模式: 输入→验证)     │
  │                            → 签发 token               │
  │                                                       │
  │   token → authStorage.setAuth()                       │
  │        → navigate("/student/home") ────────────────────┤
  │                                                       │
  └── [快捷业务] ─────────────────────────────────────────  │
        │                                                  │
        ▼                                                  │
      BizOverlayShell (覆盖层)                              │
        ├── 业务内容 (后续 agent 填充)                       │
        └── [提交] → NumericKeypad(verify)                 │
              → 验证通过 → onConfirm(pin)                   │
```

---

## 7. 安全设计

| 层级 | 措施 |
|------|------|
| 传输 | HTTPS |
| 存储 | bcrypt 哈希，永不明文存储 |
| 验证 | 3 次失败锁定 30s（客户端 + 建议后端也做） |
| 权限 | 特殊通道 token role 固定为 STUDENT，无法越权 |
| 重置 | 仅 SUPER_ADMIN 可清空 PIN，学生需重新设置 |
| 密码强度 | 6-8 位纯数字，范围 000000-99999999 |

---

## 8. 与现有系统的关系

| 现有模块 | 关系 |
|----------|------|
| `loginWeb` (auth.api) | 特殊通道返回相同格式，前端零改动 |
| `authStorage` | 完全相同调用 `setAuth(token, role, userInfo)` |
| `AuthGuard` | 无需改动，role=STUDENT 自动放行 /student/* |
| `StudentDahuaBindPanel` | 绑卡流程不变，与 PIN 设置相互独立 |
| `ScannerPanel` | 仅新增按钮回调，不改动核心扫码逻辑 |
| `AdminPersonnelPage` | 新增一列 + 一个重置 API |
| 学生中心全部页面 | 零改动，入口透明 |

---

## 9. 不做的

- 方案二的快捷业务具体实现（签到/异常上报/物品申领等）—— 由后续 agent 负责
- 数字键盘的最终视觉样式 —— 预留 CSS 变量，独立样式文件
- 批量预写入的手动触发 UI —— 系统定时自动执行
- 学生中心内部的 PIN 修改功能 —— 学生目前仅能通过弹窗首次设置，后续修改入口留待学生中心设置页迭代

## 10. 接口认证说明

特殊通道相关接口（check-pin-status / set-pin / login）为 **免登录接口**，调用方来自弹窗（尚未持有 token）。仅通过 userId 定位人员，PIN 验证后才签发 token。

---

## 11. 待确认

无。以上全部内容已与需求方逐项确认。
