# 学生端门户设计基线

> **创建日期**：2026-05-29
>
> **设计基调**：Vercel（骨架） + Notion（色彩温度） + Airbnb（圆角友好度） = 混合体系
>
> **视觉隔离**：与教职工后台 Sci-Fi 暗色主题零交叉，完全独立的视觉体系
>
> **后续 agent 读取指引**：本文档是学生端所有前端工作的唯一设计真相源。组件开发、页面组装、代码审查均以此为基准。

---

## 一、设计决策记录

| 决策项 | 结论 | 理由 |
|--------|------|------|
| 设计参考 | Vercel + Notion + Airbnb 混合 | Vercel 令牌体系与项目现有 CSS 变量最兼容；Notion pastel 色卡注入温度；Airbnb 圆角友好度降低工具感 |
| 注册入口 | 独立 URL 路由 | `/register` 教职工 / `/student/register` 学生，URL 即隔离边界 |
| 主题色 | 默认浅紫，可切换 | 避免纠结单一色系；用户设置页持久化偏好 |
| 学生页面范围 | 占位骨架优先 | 页面内容待定，先搭建布局壳 + 导航 + 设计系统组件 |
| 文档交付 | 五件套 | 设计系统 + 架构 + 路线 + 组件规范 + API 契约 |

---

## 二、设计令牌（Design Tokens）

所有令牌以 `--student-` 为命名空间前缀，与教职工的 `--twin-*` / `--admin-*` 零交叉。

### 2.1 主色调（默认浅紫）

```css
:root {
  --student-primary:          #8b5cf6;  /* Violet-500，浅紫色主调 */
  --student-primary-hover:    #7c3aed;  /* Violet-600，悬停加深 */
  --student-primary-pressed:  #6d28d9;  /* Violet-700，按下更深 */
  --student-primary-soft:     #ede9fe;  /* Violet-100，浅紫底色（通知/信息卡片） */
  --student-primary-muted:    #ddd6fe;  /* Violet-200，选中态底色 */
  --student-on-primary:       #ffffff;  /* 紫色背景上的文字色 */
}
```

### 2.2 主题色切换机制

用户可在 `/student/settings` 中切换主题色。前端通过 CSS 自定义属性 `--student-primary-*` 动态替换实现，不重新编译。

预设主题色：

```css
/* 浅紫（默认） */
[data-student-theme="violet"] {
  --student-primary: #8b5cf6;
  --student-primary-soft: #ede9fe;
}
/* 蓝色 */
[data-student-theme="blue"] {
  --student-primary: #3b82f6;
  --student-primary-soft: #dbeafe;
}
/* 绿色 */
[data-student-theme="green"] {
  --student-primary: #22c55e;
  --student-primary-soft: #dcfce7;
}
/* 琥珀 */
[data-student-theme="amber"] {
  --student-primary: #f59e0b;
  --student-primary-soft: #fef3c7;
}
/* 玫瑰 */
[data-student-theme="rose"] {
  --student-primary: #f43f5e;
  --student-primary-soft: #ffe4e6;
}
```

存储方式：后端 `sys_user.student_theme_preference` 字段持久化，登录后前端设置 `<html data-student-theme="...">`。

### 2.3 灰度阶梯（继承 Vercel）

```css
:root {
  --student-ink:             #1a1a1a;  /* 正文，对比度 ≈ 15:1 on white */
  --student-body:            #525252;  /* 次级文字 */
  --student-mute:            #8c8c8c;  /* 占位/禁用/辅助 */
  --student-canvas:          #ffffff;  /* 卡片表面 */
  --student-canvas-soft:     #fafafa;  /* 页面底色 */
  --student-canvas-soft-2:   #f5f5f5;  /* 内嵌区域底色 */
  --student-hairline:        #e5e5e5;  /* 分割线/卡片边框 */
  --student-hairline-strong: #a3a3a3;  /* 强调分割线 */
}
```

### 2.4 功能色卡（注入 Notion pastel）

每个功能模块有独立强调色，用于侧边栏图标、卡片左边框、统计数字等：

```css
:root {
  /* 门禁/通行 — 绿 */
  --student-accent-access:        #16a34a;
  --student-accent-access-soft:   #dcfce7;
  /* 环控/数据 — 天蓝 */
  --student-accent-telemetry:     #0284c7;
  --student-accent-telemetry-soft:#e0f2fe;
  /* 提醒/告警 — 琥珀 */
  --student-accent-alert:         #d97706;
  --student-accent-alert-soft:    #fef3c7;
  /* 个人/档案 — 紫（与主色呼应） */
  --student-accent-profile:       #7c3aed;
  --student-accent-profile-soft:  #ede9fe;
}
```

### 2.5 语义色（Vercel 语义体系）

```css
:root {
  --student-success:       #16a34a;
  --student-success-soft:  #dcfce7;
  --student-error:         #dc2626;
  --student-error-soft:    #fee2e2;
  --student-warning:       #f59e0b;
  --student-warning-soft:  #fef3c7;
}
```

### 2.6 排版

字体栈（中文优先）：

```css
:root {
  --student-font-sans: 'Inter', 'Noto Sans SC', 'PingFang SC',
                       'Microsoft YaHei', system-ui, -apple-system, sans-serif;
  --student-font-mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace;
}
```

排版层级（继承 Vercel 的 weight 400/500/600 体系，禁止 700+）：

| Token | Size | Weight | Line Height | Letter Spacing | 用途 |
|-------|------|--------|-------------|----------------|------|
| `display-xl` | 48px | 600 | 1.0 | -1px | 登录/注册页 Hero |
| `display-lg` | 32px | 600 | 1.25 | -0.5px | 页面标题 |
| `heading` | 24px | 600 | 1.33 | 0 | 区块标题 |
| `subheading` | 18px | 500 | 1.55 | 0 | 卡片标题 |
| `body-lg` | 16px | 400 | 1.5 | 0 | 正文段落 |
| `body` | 14px | 400 | 1.43 | 0 | 列表/表格/表单 |
| `caption` | 12px | 400 | 1.33 | 0 | 辅助信息/时间戳 |
| `button` | 14px | 500 | 1.0 | 0 | 按钮标签 |

### 2.7 圆角（Airbnb 友好度）

```css
:root {
  --student-radius-xs:   6px;    /* 小标签/徽章（Airbnb 影响：4px→6px） */
  --student-radius-sm:   8px;    /* 按钮/输入框 */
  --student-radius-md:   12px;   /* 卡片（Airbnb lg≈14px → 折中 12px） */
  --student-radius-lg:   16px;   /* 大卡片/弹窗 */
  --student-radius-xl:   24px;   /* Hero 面板 */
  --student-radius-pill: 100px;  /* 胶囊按钮（保留 Vercel 标志） */
  --student-radius-full: 9999px; /* 圆形头像 */
}
```

### 2.8 间距

基准单位 4px（Vercel 体系）：

| Token | Value | 用途 |
|-------|-------|------|
| `xxs` | 4px | 图标与文字间距 |
| `xs` | 8px | 紧凑内边距 |
| `sm` | 12px | 按钮内边距 |
| `md` | 16px | 卡片内边距 |
| `lg` | 24px | 区块间距 |
| `xl` | 32px | 页面内边距 |
| `2xl` | 40px | 大区块间距 |
| `3xl` | 48px | Section 间距 |
| `4xl` | 64px | Hero 上下间距 |

### 2.9 阴影（Vercel 堆叠阴影体系）

不使用单一重阴影，使用多层小偏移堆叠 + 内嵌边框：

```css
:root {
  --student-shadow-card: 
    0 0 0 1px rgba(0,0,0,0.08),
    0 1px 2px rgba(0,0,0,0.04),
    0 2px 4px rgba(0,0,0,0.04);
  --student-shadow-card-hover:
    0 0 0 1px rgba(0,0,0,0.08),
    0 2px 4px rgba(0,0,0,0.06),
    0 8px 16px rgba(0,0,0,0.06);
  --student-shadow-modal:
    0 0 0 1px rgba(0,0,0,0.08),
    0 8px 16px rgba(0,0,0,0.08),
    0 24px 48px rgba(0,0,0,0.10);
}
```

---

## 三、组件体系

### 3.1 组件目录

所有学生端组件放置在 `frontend/src/features/student/components/`，不引用 `@/components/ui/`（教职工共用组件库）或 `@/components/admin/`。

```
frontend/src/features/student/
├── components/
│   ├── ui/                          ← 学生端专属 UI 基础组件
│   │   ├── button.tsx               ← 基于 student 令牌的按钮
│   │   ├── input.tsx                ← 文本输入框
│   │   ├── select.tsx               ← 下拉选择
│   │   ├── switch.tsx               ← 开关
│   │   ├── checkbox.tsx             ← 复选框
│   │   ├── badge.tsx                ← 状态徽章
│   │   ├── card.tsx                 ← 卡片容器
│   │   ├── dialog.tsx               ← 弹窗
│   │   ├── toast.tsx                ← 操作提示
│   │   ├── avatar.tsx               ← 头像
│   │   ├── skeleton.tsx             ← 加载占位
│   │   ├── empty-state.tsx          ← 空状态
│   │   ├── error-retry.tsx          ← 错误重试
│   │   ├── table.tsx                ← 数据表格
│   │   ├── tabs.tsx                 ← 标签页
│   │   ├── tooltip.tsx              ← 悬浮提示
│   │   └── theme-picker.tsx         ← 主题色选择器
│   ├── layout/
│   │   ├── student-layout.tsx       ← 学生后台布局壳
│   │   ├── student-sidebar.tsx      ← 侧边导航
│   │   └── student-header.tsx       ← 顶栏
│   └── qr/
│       ├── qr-uploader.tsx          ← QR 图片上传 + 预览
│       └── qr-camera.tsx            ← 摄像头实时扫描
├── hooks/
│   ├── use-student-theme.ts         ← 主题色读取/切换
│   ├── use-student-profile.ts       ← 个人档案查询
│   └── use-student-access-records.ts ← 出入记录查询
├── pages/
│   ├── student-login.tsx
│   ├── student-register.tsx
│   ├── student-home.tsx
│   ├── student-records.tsx
│   ├── student-permissions.tsx
│   ├── student-profile.tsx
│   └── student-settings.tsx
├── router/
│   └── student-routes.tsx           ← 学生端路由配置
├── api/
│   └── student.api.ts              ← 学生端 API 函数
└── config/
    └── student-design-tokens.css    ← 所有 CSS 令牌
```

### 3.2 核心组件规范

#### Button

```
变体: primary | secondary | ghost | destructive
尺寸: sm (32px) | md (40px) | lg (48px)
圆角: --student-radius-sm (8px) 默认 | --student-radius-pill (100px) CTA
状态: default | hover | pressed | disabled | loading

  primary:   bg=--student-primary, text=--student-on-primary
  secondary: bg=--student-canvas, text=--student-ink, border=--student-hairline
  ghost:     bg=transparent, text=--student-body
  destructive: bg=--student-error, text=white
```

#### Input

```
变体: default | filled
尺寸: sm (32px) | md (40px) | lg (48px)
圆角: --student-radius-sm (8px)
状态: default | focused | error | disabled

  default: bg=--student-canvas, border=--student-hairline
  focused: border=--student-primary, ring=2px --student-primary-soft
  error:   border=--student-error, ring=2px --student-error-soft
  filled:  bg=--student-canvas-soft-2（非焦点态无边框）
```

#### Card

```
变体: default | soft | bordered
圆角: --student-radius-md (12px)
阴影: --student-shadow-card (:hover → --student-shadow-card-hover)
内边距: --spacing-md (16px) | --spacing-lg (24px)

  default:  bg=--student-canvas, shadow
  soft:     bg=--student-canvas-soft, no shadow
  bordered: bg=--student-canvas, border=--student-hairline, no shadow
```

#### Dialog

```
圆角: --student-radius-lg (16px)
阴影: --student-shadow-modal
内边距: 24px
背景遮罩: rgba(0,0,0,0.5)

  包含: DialogTitle (subheading), DialogDescription (body), DialogFooter
```

#### Switch

```
尺寸: 20px × 36px 轨道, 16px 圆形滑块
圆角: --student-radius-pill
状态: off | on | disabled

  off:  bg=--student-hairline
  on:   bg=--student-primary
```

#### Badge

```
变体: default | success | warning | error | accent-*
圆角: --student-radius-full (9999px)
尺寸: h=20px, padding=0 8px
文字: caption, 500 weight

  default:  bg=--student-primary-soft, text=--student-primary
  success:  bg=--student-success-soft, text=--student-success
  warning:  bg=--student-warning-soft, text=--student-warning
  error:    bg=--student-error-soft, text=--student-error
```

#### Table

```
表头: bg=--student-canvas-soft, text=caption uppercase, border-bottom=--student-hairline
行: border-bottom=--student-hairline, hover=bg=--student-canvas-soft
单元格内边距: 10px 16px
无分页器组件（使用 shadcn/ui 标准或自行实现）
```

#### Tabs

```
变体: underline | pills
underline: 底部 2px --student-primary 指示器, 间距 24px
pills: bg=--student-canvas-soft, 选中=bg=--student-primary text=white, rounded=pill
```

#### Skeleton

```
变体: text | circular | rectangular
动画: 1.5s ease-in-out pulse (opacity 100%→50%→100%)
颜色: bg=--student-canvas-soft-2
```

#### EmptyState

```
布局: 垂直居中 (icon + title + description + action button)
图标: 48px, color=--student-mute
标题: subheading
描述: body, color=--student-body
```

#### ErrorRetry

```
布局: 垂直居中 (icon + message + retry button)
图标: 24px, color=--student-error
消息: body, color=--student-body
按钮: button/ghost variant
```

---

## 四、布局架构

### 4.1 StudentLayout

```
┌──────────────────────────────────────────┐
│ StudentHeader (h=56px, bg=canvas)        │
│ [Logo]          [通知铃铛] [头像▼]        │
├──────────┬───────────────────────────────┤
│ Sidebar  │ <Outlet />                    │
│ (240px)  │                               │
│          │                               │
│ 🏠 首页   │                               │
│ 📋 出入   │                               │
│ 🔑 权限   │                               │
│ 👤 档案   │                               │
│ ⚙️ 设置   │                               │
│          │                               │
│ 可折叠    │ bg=canvas-soft               │
│ bg=canvas│                               │
└──────────┴───────────────────────────────┘
```

**视觉规范**：
- 侧边栏：亮色底（`--student-canvas`），左侧浅紫细线标记当前选中项
- 顶栏：白色底，56px 高，1px 底部 `--student-hairline` 分割
- 内容区：`--student-canvas-soft` 底色
- 侧边栏折叠态：56px 宽，仅显示图标

### 4.2 响应式断点

| 断点 | 宽度 | 行为 |
|------|------|------|
| Mobile | < 640px | 侧边栏隐藏，顶栏汉堡菜单 |
| Tablet | 640-1023px | 侧边栏默认折叠 |
| Desktop | ≥ 1024px | 侧边栏展开 |

---

## 五、路由设计

```typescript
// frontend/src/router/index.tsx 中新增

{
  path: '/student/login',
  element: <StudentLoginPage />,  // 无 AuthGuard
},
{
  path: '/student/register',
  element: <StudentRegisterPage />,  // 无 AuthGuard
},
{
  path: '/student',
  element: <AuthGuard requireRole="STUDENT"><StudentLayout /></AuthGuard>,
  children: [
    { index: true, element: <Navigate to="/student/home" /> },
    { path: 'home', element: <StudentHomePage /> },
    { path: 'records', element: <StudentRecordsPage /> },
    { path: 'permissions', element: <StudentPermissionsPage /> },
    { path: 'profile', element: <StudentProfilePage /> },
    { path: 'settings', element: <StudentSettingsPage /> },
  ],
},
```

**路由守卫规则**：
- `AuthGuard requireRole="STUDENT"`：仅 role=STUDENT 可访问 `/student/*`
- 教职工及其他角色访问 `/student/*` → 重定向到其默认首页
- 学生访问 `/admin/*` → 重定向到 `/student/home`

---

## 六、后端 API 契约

### 6.1 学生注册

```
POST /api/auth/register/student/verify-qr
  Content-Type: multipart/form-data
  file: <QR码图片>
  → 200 { verified: true, userId: "2034525746445213697",
          name: "张三", departmentName: "基础医学院",
          projectGroupName: "神经科学实验室" }
  → 200 { verified: false, message: "该ID未在授权人员库中" }

POST /api/auth/register/student
  Content-Type: application/json
  { userId: "2034525746445213697", username: "zhangsan", password: "***" }
  → 200 { token, role: "STUDENT", userInfo: { ...聚合档案 } }
  → 400 { message: "用户名已存在" }
  → 400 { message: "该ID未在授权人员库中" }
```

### 6.2 学生档案

```
GET /api/student/profile
  Authorization: Bearer <token>
  → 200 {
    account: { username, role, createTime },
    personnel: { name, gender, mobilePhone, email, head, departmentName,
                 projectGroupName, userTypeNames, allowedRoomsDisplayZh,
                 hasOfficialRoomPermission, totalExp },
    stats: { recentAccessCount, roomRank, ... }
  }
```

### 6.3 出入记录

```
GET /api/student/access-records?page=1&size=20&startDate=&endDate=
  Authorization: Bearer <token>
  → 200 { data: AccessRecord[], total: number }
```

### 6.4 门禁权限

```
GET /api/student/permissions
  Authorization: Bearer <token>
  → 200 { rooms: [{ roomName, accessLevel, expiryDate, ... }] }
```

### 6.5 主题偏好

```
GET /api/student/theme-preference
  → 200 { theme: "violet" }

PUT /api/student/theme-preference
  { theme: "blue" }
  → 200
```

---

## 七、与现有系统的隔离规则

| 规则 | 说明 |
|------|------|
| CSS 令牌隔离 | 学生端用 `--student-*`，不引用 `--twin-*` / `--admin-*` |
| 组件隔离 | 学生端组件在 `features/student/components/ui/`，不 import `@/components/ui/` |
| 路由隔离 | `/student/*` 与 `/admin/*` 互斥，角色守卫阻止跨角色访问 |
| 布局隔离 | StudentLayout 和 AdminLayout 是完全独立的两个布局组件 |
| API 隔离 | 学生 API 以 `/api/student/` 为前缀，后端自动注入 STUDENT 角色校验 |
| 状态隔离 | 学生端 TanStack Query key 以 `["student", ...]` 为前缀 |

---

## 八、实施阶段

| 阶段 | 内容 | 依赖 | 预估 |
|------|------|------|------|
| 0 | 设计基线文档（本文档） | 无 | ✅ 已完成 |
| 1 | 后端 API：QR 注册 + 学生档案 + 出入记录 | 阶段 0 | 2-3d |
| 2 | 前端设计令牌落地：CSS 变量 + Tailwind 配置 | 阶段 0 | 0.5d |
| 3 | 前端 UI 组件逐个实现（button→input→card→...） | 阶段 2 | 2-3d |
| 4 | StudentLayout + 路由 + 登录/注册页 | 阶段 3 | 2d |
| 5 | 学生后台占位页面 + 个人档案页（含聚合数据） | 阶段 4 | 2d |
| 6 | 主题色切换功能 | 阶段 3 | 0.5d |
| 7 | 验证、审查、合并 | 阶段 5-6 | 1d |

---

## 九、关联文档

- [后端底层架构规范](../ARCHITECTURE_BACKEND.md)
- [Web 前端参考架构](../ARCHITECTURE_FRONTEND_WEB.md)
- [竞品迁移分析](../COMPETITIVE_PRODUCT_ANALYSIS.md)（本文档的上游输入）
- 待产出：STUDENT_ARCHITECTURE.md
- 待产出：STUDENT_ROADMAP.md
- 待产出：STUDENT_COMPONENT_SPEC.md
- 待产出：STUDENT_API_SPEC.md
