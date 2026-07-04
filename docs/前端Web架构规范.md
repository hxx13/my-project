# Twin System Web 前端架构分析

> **定位**：本文档是对前端 Web 代码现状的架构描述，记录当前实际使用的技术栈、目录结构、路由设计、状态管理和组件模式。**本文档是分析文档，不作为开发方向指导。** 后续将提供独立的开发规范文档。
>
> **分析日期**：2026-06-09
>
> **代码范围**：`frontend/src/`

---

## 一、技术栈（当前实际使用）

| 组件 | 版本/选型 | 备注 |
|------|----------|------|
| 框架 | React 19 | 函数组件 + Hooks |
| 构建 | Vite 8 | `@vitejs/plugin-react` |
| 类型 | TypeScript 5.9 | strict: true |
| 路由 | react-router-dom v7 | `createHashRouter`（Hash 路由） |
| 服务端状态 | TanStack React Query v5 | `useQuery` / `useMutation` |
| 客户端状态 | Zustand | 3 个 store：`useEventStore`、`useSpecialChannelStore`、`useSwipeAlertStore` |
| UI 组件 | shadcn/ui (Radix) | `components/ui/` 下按需引入 |
| 样式 | Tailwind CSS v4 | utility-first |
| HTTP 客户端 | Axios | 3 个预配置实例（`http`、`authHttp`、`adminHttp`） |
| 图标 | Lucide React + HugeIcons | 全项目统一 |
| 实时通信 | Socket.IO Client | 连接 `:9092` |
| 动画 | GSAP + Rive | 复杂动画与交互动效 |
| 图表 | ECharts + Recharts | 数据可视化 |
| 路径别名 | `@/` → `./src/` | TypeScript + Vite 双配置 |

---

## 二、目录结构（实际）

```
frontend/
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json                  ← @/* → ./src/*
├── index.html
└── src/
    ├── App.tsx                        ← 根组件（QueryClientProvider + RouterProvider）
    ├── main.tsx                       ← 入口
    ├── api/
    │   ├── core/                      ← Axios 实例 + 拦截器
    │   │   ├── http.ts                ← baseURL=/api/v1/twin, 15s 超时
    │   │   ├── authHttp.ts            ← baseURL=/api, 20s 超时, 业务状态码校验
    │   │   ├── adminHttp.ts           ← baseURL=/api, 20s 超时
    │   │   └── tokenRefresh.ts        ← Token 刷新拦截器（三个实例共用）
    │   ├── hooks/                     ← TanStack Query hooks
    │   ├── domains/                   ← 38 个业务域 API 文件
    │   │   ├── repair.api.ts
    │   │   ├── supplies.api.ts
    │   │   └── ...
    │   └── types/                     ← API 类型定义
    ├── components/
    │   ├── ui/                        ← shadcn/ui 基础组件（button, dialog, table...）
    │   ├── admin/                     ← 管理端共享组件（表格、表单、抽屉）
    │   ├── markdown/                  ← Markdown 渲染组件
    │   └── scanner/                   ← 扫码相关组件（门禁交互核心）
    ├── features/                      ← 按功能模块组织（22 个）
    │   ├── access-audit/              ← 门禁审计
    │   ├── access-fusion/             ← 门禁融合
    │   ├── admin/                     ← 管理端导航注册、命令面板
    │   ├── analytics/                 ← 数据分析
    │   ├── auth/                      ← 登录、authStorage
    │   ├── cage-shelf/                ← 笼架
    │   ├── dahua-swing-records/       ← 大华刷卡记录
    │   ├── dahua-swing-stats/         ← 大华刷卡统计
    │   ├── dashboard/                 ← 仪表盘
    │   ├── dashboard-cosmos/          ← Cosmos 主题仪表盘
    │   ├── dashboard-scifi-theme/     ← 科幻主题仪表盘
    │   ├── dev-tools/                 ← 开发工具
    │   ├── digital-twin-screen/       ← 数字孪生大屏
    │   ├── llm/                       ← AI/LLM 功能
    │   ├── notification/              ← 通知、SSE 流
    │   ├── realtime-stream/           ← 实时数据流
    │   ├── scanner/                   ← 扫码引擎
    │   ├── staff-inbox/               ← 员工收件箱
    │   ├── student/                   ← 学生端（独立子应用）
    │   ├── swipe-alert/               ← 刷卡告警
    │   ├── twin-chrome/               ← Twin 框架壳
    │   └── twin-debug/                ← Twin 调试工具
    ├── pages/                         ← 页面入口（路由直接引用，77 个文件）
    ├── layouts/
    │   ├── TwinLayout.tsx             ← 主应用布局（数字孪生 + 调试页）
    │   ├── TwinLayoutInner.tsx        ← TwinLayout 内部实现
    │   └── AdminLayout.tsx            ← 管理端布局（侧边栏 + 顶栏）
    ├── router/
    │   ├── index.tsx                  ← createHashRouter 配置（全部路由定义）
    │   ├── AuthGuard.tsx              ← 通用认证守卫
    │   ├── AdminGuard.tsx             ← 管理端守卫
    │   ├── AdminAccessGuard.tsx       ← 管理端访问守卫
    │   ├── SuperAdminGuard.tsx        ← 超级管理员守卫
    │   └── TwinDebugStaffGuard.tsx    ← Twin 调试权限守卫
    ├── store/                         ← Zustand stores
    │   ├── useEventStore.ts           ← 事件总线
    │   ├── useSpecialChannelStore.ts  ← 特殊通道状态
    │   └── useSwipeAlertStore.ts      ← 刷卡告警状态
    ├── hooks/                         ← 通用 Hooks
    ├── types/                         ← 共享 TS 类型
    ├── utils/                         ← 通用工具函数
    ├── config/                        ← 前端配置常量
    ├── constants/                     ← 常量定义
    └── telemetry-view/                ← 遥测可视化库
```

---

## 三、路由设计（核心架构）

**路由方式**：`createHashRouter`（Hash 路由，URL 格式 `/#/path`）

**三层嵌套结构**：

```
/login, /register                    ← 公开路由
/student                             ← 学生端（AuthGuard + StudentLayout）
  ├── /home
  ├── /records
  ├── /rooms
  ├── /stats
  ├── /notifications
  ├── /feedback
  ├── /settings
  └── /cage-shelf
/                                    ← 主应用（AuthGuard）
  ├── /                              ← 首页（TwinLayout → DashboardPage）
  ├── /dashboard                     ← 仪表盘
  ├── /dashboard-preview             ← 仪表盘预览
  ├── /debug/*                       ← 调试页面（TwinDebugStaffGuard）
  ├── /animal-room-telemetry         ← 动物房遥测
  ├── /animal-room-cockpit           ← 动物房驾驶舱
  ├── /digital-twin-screen           ← 数字孪生大屏
  └── /admin                         ← 管理端（AdminAccessGuard + AdminLayout）
      ├── /home                      ← 管理首页
      ├── /personnel                 ← 人员管理
      ├── /access-rules              ← 门禁规则
      ├── /supplies                  ← 物资商城
      ├── /repair-request            ← 报修申请
      ├── ...（约 40 个管理端页面）
      └── /student-violations        ← 学生违规
```

**守卫组件**（`router/` 下）：

| 守卫 | 作用 |
|------|------|
| `AuthGuard` | 通用登录验证，`requireRole` 属性限制角色 |
| `AdminGuard` | 管理端权限 |
| `AdminAccessGuard` | 管理端访问控制 |
| `SuperAdminGuard` | 超级管理员专用 |
| `TwinDebugStaffGuard` | Twin 调试功能权限 |

---

## 四、HTTP 客户端层（三个 Axios 实例）

### 4.1 `http`（扫码引擎）

- 文件：`api/core/http.ts`
- baseURL：`/api/v1/twin`
- 超时：15s
- 拦截器：自动挂 `Authorization: Bearer <token>` + `X-Scan-Operator-Role`
- 用途：扫码引擎、看板实时流水

### 4.2 `authHttp`（管理端主用）

- 文件：`api/core/authHttp.ts`
- baseURL：`/api`
- 超时：20s
- 拦截器：自动挂 Bearer token + **业务状态码校验**（`code !== 200` 或 `success === false` 时抛错）
- 用途：管理端 CRUD、门禁配置

### 4.3 `adminHttp`（管理端专用）

- 文件：`api/core/adminHttp.ts`
- baseURL：`/api`
- 超时：20s
- 用途：管理端额外鉴权逻辑

### 4.4 共用机制

- 所有三个实例都调 `attachTokenRefreshInterceptor()`，自动刷新过期的 token
- Token 从 `authStorage`（`features/auth/authStorage.ts`）读取，不直接操作 `localStorage`

---

## 五、API Domain 文件模式

每个业务域的 API 函数集中在 `api/domains/{module}.api.ts` 中。

**当前存在的 API Domain 文件（38 个）**：

`accessAudit` `accessFusion` `admin` `adminNavConfig` `adminPageHelp` `analytics` `analyticsChat` `asset` `auth` `cageShelf` `chat` `dahuaSwing` `dahuaSwingStats` `dashboardViolationBoard` `docs` `facilityMaintenance` `fileTemplates` `logging` `me` `mpContentHub` `notification` `pagePermission` `profile` `publicSite` `purchase` `repair` `scanPopupAnnouncement` `scanner` `schedule` `siteAdmin` `specialChannel` `studentViolation` `supplies` `swipeAlert` `telemetryArchive` `telemetryWatchlistAdmin` `upload` `violationTextTemplate`

**文件内模式**（以 `repair.api.ts` 为例）：

```
├── TS 类型定义（与 API 函数同文件，不拆到 types/）
├── 通用解包工具（asData<T>、asArrayData 等私有函数）
├── API 函数（fetchXxxPage, createXxx, updateXxx, deleteXxx）
└── 分页返回值固定为 { data, total }
```

---

## 六、状态管理（当前实际使用）

### 6.1 服务端数据 → TanStack React Query

`api/hooks/` 下使用 `useQuery` / `useMutation` 管理异步数据缓存与自动刷新。

### 6.2 客户端状态 → Zustand（3 个 Store）

| Store | 用途 |
|-------|------|
| `useEventStore` | 全局事件总线 |
| `useSpecialChannelStore` | 特殊通道（如门禁 PIN 验证）状态 |
| `useSwipeAlertStore` | 刷卡告警实时状态 |

### 6.3 认证状态 → authStorage

`features/auth/authStorage.ts` — 封装 `localStorage` 的 token/role 读写，不直接操作 `localStorage`。

---

## 七、组件分层（当前实际模式）

```
pages/            ← 路由入口，组装 features + components，处理页面级数据获取
features/         ← 功能模块，包含该功能的业务逻辑和特定 UI（22 个）
components/       ← 可复用 UI 组件
  ├── ui/         ← shadcn/ui 基础组件（button, dialog, table...，无业务逻辑）
  ├── admin/      ← 管理端复用组件（表格、表单、抽屉、命令面板）
  ├── markdown/   ← Markdown 渲染
  └── scanner/    ← 扫码引擎相关组件
layouts/          ← 布局组件（TwinLayout、AdminLayout）
hooks/            ← 通用 Hooks（跨功能复用）
store/            ← Zustand 全局状态
```

**页面组件示例**（`pages/RepairRequestPage.tsx`）：
```tsx
export default function RepairRequestPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["repair", "list", page],
    queryFn: () => fetchRepairList(page),
  });
  if (isLoading) return <Skeleton />;
  return <RepairTable data={data} />;
}
```

---

## 八、管理端导航系统

管理端使用**注册表模式**管理导航：

**核心文件**：`features/admin/`

| 文件 | 作用 |
|------|------|
| `adminNavRegistry.ts` | 导航项注册表 |
| `buildAdminNavModel.ts` | 构建导航模型 |
| `AdminNavManager.tsx` | 导航管理组件 |
| `AdminNavManagerTree.tsx` | 导航树形编辑器 |
| `AdminNavManagerCreateDialog.tsx` | 新建导航项对话框 |
| `AdminNavManagerEditor.tsx` | 导航项编辑器 |
| `adminShellNavigation.ts` | 壳导航逻辑 |
| `adminChromeClipboard.ts` | 剪贴板功能 |
| `adminFormUi.ts` | 表单 UI 工具 |
| `AdminCommandPalette.tsx` | 命令面板（Ctrl+K） |
| `AdminPageHelpDialog.tsx` | 页面帮助对话框 |
| `AdminSensitiveAction.tsx` | 敏感操作确认 |

---

## 九、学生端（独立子应用）

学生端位于 `features/student/`，是一个功能完整的独立子应用：

```
features/student/
├── pages/                           ← 学生端页面
│   ├── student-register/            ← 注册
│   ├── student-login/               ← 登录
│   ├── student-home/                ← 首页
│   ├── student-records/             ← 记录
│   ├── student-rooms/               ← 房间
│   ├── student-stats/               ← 统计
│   ├── student-notifications/       ← 通知
│   ├── student-feedback/            ← 反馈
│   ├── student-settings/            ← 设置
│   └── student-cage-shelf/          ← 笼架
└── components/layout/
    └── student-layout/              ← 学生端布局
```

路由通过 `AuthGuard requireRole="STUDENT"` 保护，使用 `StudentLayout` 而非 `AdminLayout`。

---

## 十、UI 样式（当前实际使用）

- **Tailwind CSS v4**：utility-first，类名驱动样式
- **shadcn/ui**：基于 Radix UI 原语，`components/ui/` 下按需复制组件源码
- **图标**：Lucide React + HugeIcons（`@hugeicons/react`）
- **动画**：GSAP（`@gsap/react`）+ Rive（`@rive-app/react-canvas`）
- 组件导出格式：`export default function ComponentName()`
- 路径别名：`@/` → `./src/`（TypeScript + Vite 双配置）

---

## 十一、实时通信

- **Socket.IO Client**：连接后端 Netty Socket.IO（端口 9092）
- **用途**：通知实时推送
- **SSE 备选**：`GET /api/notifications/stream` 作为长连接备用方案
- Socket 回调不直接操作 DOM，而是更新 Zustand store，由组件响应式渲染

---

## 十二、鉴权与登录流程

```
LoginPage
  → POST /api/auth/login/web
  → 得到 { token, role, userInfo }
  → authStorage.setToken(token)
  → authStorage.setRole(role)
  → navigate("/")
  → axios 拦截器自动从 authStorage 读取 token 挂到 Authorization 头
```

**权限控制**：
- 路由级：通过 Guard 组件（AuthGuard、AdminAccessGuard 等）包裹
- 页面级：`page_permission_item` 表控制入口可见性
- 不在渲染路径中硬编码 `if (role === 'ADMIN')`

---

## 十三、关键观察

1. **Hash 路由**：使用 `createHashRouter` 而非 `createBrowserRouter`，URL 格式为 `/#/path`，刷新不丢路由状态
2. **三类 HTTP 客户端**：`http`（扫码）、`authHttp`（管理端主用，带业务码校验）、`adminHttp`（管理端专用），各有不同拦截器逻辑
3. **学生端是独立子应用**：有自己的路由、布局、页面，通过 `AuthGuard requireRole="STUDENT"` 隔离
4. **管理端导航是注册表驱动**：`adminNavRegistry.ts` + `buildAdminNavModel.ts` 构建动态导航树
5. **Zustand 使用克制**：仅 3 个 store（事件、特殊通道、刷卡告警），大部分状态走 React Query
6. **守卫组件分层**：AuthGuard（通用）→ AdminAccessGuard（管理端）→ SuperAdminGuard（超管），层层嵌套
7. **双滚动布局**（2026-07-04）：后台页面默认不传 title/actions 给 AdminPageShell，页面内容直接顶满。需要 header 时显式传 title/actions。

---

## 十一、管理端双滚动布局

### 设计原则

- AdminPageShell 的 header 区域按需渲染：`hasHeader = !!(title || description || actions)`
- 不传任何 header props 时，内容区零 header 直接顶满，页面自行管理内部滚动
- 页面内的滚动容器使用 CSS 变量 `--admin-chrome-offset` 计算高度上限

### CSS 变量

`--admin-chrome-offset` 定义在 `.admin-page-content` 规则块内（`index.css`）：

```css
--admin-chrome-offset: calc(64px + var(--page-pad-y) * 2);
/* = sticky header(64px) + 上下 page padding */
/* sm 断点自动跟随 --page-pad-y 增长（1.5rem → 2rem） */
```

### 标准用法

```tsx
<AdminPageShell>                          {/* 无 header */}
  {/* 可选：页面级 toolbar（shrink-0，不参与滚动） */}
  <div className="flex items-center gap-3 shrink-0">
    <h3>页面标题</h3>
    <div className="flex-1" />
    <Button>操作</Button>
  </div>

  {/* 滚动容器：有 toolbar 时额外减 48px */}
  <div className="max-h-[calc(100dvh-var(--admin-chrome-offset)-48px)] min-h-[200px] overflow-y-auto">
    {content}
  </div>
</AdminPageShell>
```

**双栏模式**（左树/导航 + 右内容）：

```tsx
<AdminPageShell>
  <div className="flex gap-2">
    <div className="w-48 xl:w-52 shrink-0 flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
      <div className="shrink-0">{toolbar}</div>
      <div className="flex-1 min-h-0 overflow-y-auto">{tree}</div>
    </div>
    <div className="flex-1 min-w-0 max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px] overflow-y-auto">
      {content}
    </div>
  </div>
</AdminPageShell>
```

### Header actions 搬迁模式

| 模式 | 适用场景 | 目标位置 |
|------|----------|----------|
| A: 页面工具栏 | 页面级操作（按钮/链接） | `<AdminPageShell>` 与滚动容器之间 |
| B: 左栏顶部 | 与左侧导航强相关 | 左栏 flex 最顶部 `shrink-0` |
| C: 右栏顶部 | 与当前 tab 绑定 | 右栏内容区 `sticky top-0` |
| D: 丢弃 | 纯装饰性说明文字 | 删除 |

### 已知限制

- 内部滚动容器的滚动位置**不会**在浏览器 back/forward 时自动恢复
- 移动端响应式双栏折叠暂未适配（后台移动端使用率极低）
- `fillHeight` prop 保留（DebugCardMappingPage 仍在使用），与双滚动模式互斥

---

*分析完成于 2026-06-09。本文档描述现状，不构成开发方向建议。*
