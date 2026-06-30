# 管理后台系统设置重构 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 4 个独立管理页面（schedule-manager, external-comm-config, page-permissions, login-branding）降级并入 `/admin/settings`，重构为 Vercel 式统一设置中心，17 个模块合并为 8 个子页面。

**Architecture:** `/admin/settings` 作为 layout route（AdminSettingsLayout），内部二级侧边栏 + `<Outlet />` 渲染子页面。ADMIN 起可访问入口，SUPER_ADMIN 子页面权限过滤。全局搜索跨子页面匹配配置项。

**Tech Stack:** React 18 + TypeScript + React Router 6 (hash) + Tailwind CSS + Radix UI

---

## 文件结构总览

### 新增
| 文件 | 职责 |
|------|------|
| `features/admin/settings/AdminSettingsLayout.tsx` | Settings 布局：二级侧边栏 + Outlet + 全局搜索 |
| `features/admin/settings/GeneralSettings.tsx` | 通用设置（合并 system/network/logging/frontend_runtime/scanner/material） |
| `features/admin/settings/AppearanceSettings.tsx` | 外观与品牌（login-branding + mini_program） |
| `features/admin/settings/NotificationsSettings.tsx` | 通知配置（notification + capability + template + supplies） |
| `features/admin/settings/AccessControlSettings.tsx` | 门禁与人脸（face + telemetry_facility + external-comm-config） |
| `features/admin/settings/SchedulerSettings.tsx` | 定时任务（原 AdminScheduleManagerPage 内容） |
| `features/admin/settings/IntegrationsSettings.tsx` | 集成与凭证（llm + credentials + integration） |
| `features/admin/settings/PermissionsSettings.tsx` | 页面权限（原 AdminPagePermissionSettingsPage 内容） |
| `features/admin/settings/DangerZoneSettings.tsx` | 危险操作（ClientReloadOpsPanel + 其他） |

### 修改
| 文件 | 变更 |
|------|------|
| `router/index.tsx` | 替换 AdminSettingsPage → AdminSettingsLayout + 子路由；旧路由 redirect |
| `features/admin/adminNavRegistry.ts` | 删除 4 个独立入口；settings 入口降为 ADMIN |
| `features/admin/settings/SystemConfigsPanel.tsx` | 修复 LLM 标题硬编码 "通义/DashScope" |
| `features/admin/settings/settingsLabels.ts` | 移除 dashboard_codex 分组 |
| `pages/AdminStudentViolationsPage.tsx` | 新增 "主页文案" tab，加载 dashboard_codex 配置 |

### 删除（保留为 re-export stub 直到确认无外部引用）
| 文件 | 处理 |
|------|------|
| `pages/AdminScheduleManagerPage.tsx` | 内容迁入 SchedulerSettings，原文件删除 |
| `pages/AdminExternalCommConfigPage.tsx` | 内容迁入 AccessControlSettings，原文件删除 |
| `pages/AdminPagePermissionSettingsPage.tsx` | 内容迁入 PermissionsSettings，原文件删除 |
| `pages/AdminLoginBrandingPage.tsx` | 内容迁入 AppearanceSettings，原文件删除 |

---

## Task 1: AdminSettingsLayout — 核心布局

**Files:**
- Create: `frontend/src/features/admin/settings/AdminSettingsLayout.tsx`

这个文件是整个重构的骨架。它提供：
1. 左侧二级侧边栏（8 个子页面，ADMIN 见 5 个 + scheduler，SUPER_ADMIN 见全部 8 个）
2. 右侧 `<Outlet />` 渲染子页面
3. 顶部栏：返回按钮 + 面包屑 + 全局搜索框
4. 搜索：跨子页面匹配配置项 key/中文标签/描述

### 子页面侧边栏定义

```typescript
const SETTINGS_SUB_PAGES = [
  { path: "general",        label: "通用设置",   icon: Sliders,         minRole: "ADMIN" as const },
  { path: "appearance",     label: "外观与品牌", icon: Palette,         minRole: "ADMIN" as const },
  { path: "notifications",  label: "通知配置",   icon: Bell,            minRole: "ADMIN" as const },
  { path: "access-control", label: "门禁与人脸", icon: Fingerprint,     minRole: "ADMIN" as const },
  { path: "scheduler",      label: "定时任务",   icon: CalendarClock,   minRole: "ADMIN" as const },
  { path: "integrations",   label: "集成与凭证", icon: PlugZap,         minRole: "SUPER_ADMIN" as const },
  { path: "permissions",    label: "页面权限",   icon: KeyRound,        minRole: "SUPER_ADMIN" as const },
  // danger-zone 放最底部，红色文字，分隔线隔开
  { path: "danger-zone",    label: "危险操作",   icon: AlertTriangle,   minRole: "SUPER_ADMIN" as const, danger: true },
];
```

### 权限过滤逻辑

```typescript
const role = authStorage.getRole();
const visiblePages = SETTINGS_SUB_PAGES.filter(p => hasMinRole(role, p.minRole));
```

### 全局搜索

全局搜索通过维护一个 `searchIndex`（所有子页面的配置项摘要），用户输入时实时过滤匹配结果。点击结果跳转到对应子页面并高亮。

搜索索引数据结构：

```typescript
interface SearchHit {
  subPagePath: string;    // 所属子页面 path，如 "general"
  subPageLabel: string;   // 所属子页面中文名
  configKey: string;      // 配置项 key
  configLabel: string;    // 配置项中文标签
  description: string;    // 配置项描述
}
```

搜索索引在首次打开 settings 时异步构建（调用各模块的 `fetchConfigDefinitions`），缓存结果。输入时客户端过滤即可。

### 组件结构

```tsx
export default function AdminSettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = authStorage.getRole();
  const visiblePages = SETTINGS_SUB_PAGES.filter(p => hasMinRole(role, p.minRole));
  
  // 当前激活的子页面
  const activePath = location.pathname.split('/').pop() || 'general';
  
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  
  // 搜索逻辑...
  
  return (
    <AdminPageShell title="系统设置" description="统一管理系统所有配置项">
      <div className="flex gap-6 lg:flex-row">
        {/* 左侧二级侧边栏 — 粘性 */}
        <nav className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col">
          <div className="sticky top-4 ...">
            {visiblePages.map(page => (
              <NavLink key={page.path} to={`/console/admin/settings/${page.path}`}
                className={page.danger ? 'text-red-600' : ''}>
                <page.icon />
                {page.label}
              </NavLink>
            ))}
          </div>
        </nav>
        
        {/* 右侧内容区 */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </AdminPageShell>
  );
}
```

**依赖：**
- `AdminPageShell` — 复用现有页面壳组件
- `authStorage` / `hasMinRole` — 角色判断
- `useNavigate`, `useLocation`, `Outlet` — react-router-dom
- Lucide 图标

---

## Task 2: GeneralSettings — 通用设置

**Files:**
- Create: `frontend/src/features/admin/settings/GeneralSettings.tsx`

合并原 `system`, `network`, `logging`, `frontend_runtime`, `scanner`, `material` 六个模块到一个页面。每个模块作为一个独立 `AdminFormCard` 卡片区域，内部使用 `SystemConfigsPanel` 加载该模块的配置。

### 实现策略

```tsx
const GENERAL_MODULES = [
  { key: 'system',             label: '系统参数',     desc: '通用系统级参数' },
  { key: 'frontend_runtime',   label: '前端运行时',   desc: '前端运行时开关与展示参数' },
  { key: 'network',            label: '网络与接口',   desc: '网络与接口相关参数' },
  { key: 'logging',            label: '日志控制',     desc: '运行时控制台日志级别管理' },
  { key: 'scanner',            label: '扫码器配置',   desc: '扫码器相关系统配置' },
  { key: 'material',           label: '素材审核配置', desc: '学生物资申领系统配置' },
];
```

每个模块独立渲染一个可折叠的卡片区域（默认展开第一个，其余折叠以减少滚动）。每个卡片内部是一个自包含的 `SystemConfigsPanel`。

**注意：** 每个 `SystemConfigsPanel` 需要独立的数据加载。复用原 `AdminSettingsPage` 的 `loadData` 模式，但改为每个模块独立加载和独立状态。

**依赖：**
- `SystemConfigsPanel` — 已有组件
- `AdminFormCard` — 已有卡片组件
- `fetchSystemConfigs`, `fetchConfigDefinitions` — 已有 API

---

## Task 3: AppearanceSettings — 外观与品牌

**Files:**
- Create: `frontend/src/features/admin/settings/AppearanceSettings.tsx`

合并 `AdminLoginBrandingPage` 内容和 `mini_program` 模块。

### 实现策略

不重写代码，直接导入现有页面组件。分为两个卡片区域：

1. **登录页品牌** — 复用 `AdminLoginBrandingPage` 的内容逻辑（轮播图开关、图片上传、URL 管理、轮播间隔）
2. **小程序展示** — 使用 `SystemConfigsPanel` 加载 `mini_program` 模块

提取 `AdminLoginBrandingPage` 的核心逻辑到一个可嵌入组件。由于原页面是完整的 page 组件，最简方式是在 `AppearanceSettings` 中直接 import 并渲染：

```tsx
import AdminLoginBrandingPage from "@/pages/AdminLoginBrandingPage";

export default function AppearanceSettings() {
  return (
    <div className="space-y-6">
      <AdminFormCard title="登录页轮播图" description="管理登录页背景轮播图">
        <AdminLoginBrandingPage />  {/* 原页面作为子组件嵌入 */}
      </AdminFormCard>
      <AdminFormCard title="小程序展示配置" description="微信小程序订阅消息等推送参数">
        <MiniProgramConfigs />
      </AdminFormCard>
    </div>
  );
}
```

但 `AdminLoginBrandingPage` 本身用了 `AdminPageShell`，直接嵌入会有双重壳问题。更好的做法是提取其内部渲染逻辑到一个独立组件。如果改动量大，可以先简单卸载 `AdminPageShell` 包装再从 AppearanceSettings 中直接渲染其内部 JSX。

**实际执行时的判断：** 如果 `AdminLoginBrandingPage` 内部逻辑简单（209行），可以直接在 AppearanceSettings 中重写；如果复杂则提取内部组件。

---

## Task 4: NotificationsSettings — 通知配置

**Files:**
- Create: `frontend/src/features/admin/settings/NotificationsSettings.tsx`

合并 `notification`, `capability`, `template`, `supplies` 四个模块。

### 实现策略

直接复用现有面板组件。每个模块的数据加载模式与原 `AdminSettingsPage.loadData` 一致：

```tsx
export default function NotificationsSettings() {
  // notification 数据
  const [rules, setRules] = useState<NotifyRuleRecord[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState<NotifyTemplateRecord[]>([]);
  // capability 数据
  const [policies, setPolicies] = useState<CapabilityPolicyRecord[]>([]);
  // template + supplies 数据
  const [templates, setTemplates] = useState<NotifyTemplateRecord[]>([]);
  const [supplyConfigs, setSupplyConfigs] = useState<SystemConfigRecord[]>([]);
  const [supplyDefs, setSupplyDefs] = useState<SettingDefinitionRecord[]>([]);

  // 4 个面板各自独立加载，互不阻塞
  // NotificationRulesPanel / CapabilityPoliciesPanel / NotificationTemplatesPanel

  return (
    <div className="space-y-6">
      <AdminFormCard title="通知规则" ...>
        <NotificationRulesPanel rules={rules} templates={templateCatalog} onRulesChange={setRules} />
      </AdminFormCard>
      <AdminFormCard title="业务能力策略" ...>
        <CapabilityPoliciesPanel policies={policies} onPoliciesChange={setPolicies} />
      </AdminFormCard>
      <AdminFormCard title="通知模板与物资推送" ...>
        <NotificationTemplatesPanel ... />
      </AdminFormCard>
    </div>
  );
}
```

**依赖：**
- `NotificationRulesPanel` — 已有
- `CapabilityPoliciesPanel` — 已有
- `NotificationTemplatesPanel` — 已有
- `fetchNotificationRules`, `fetchNotificationTemplates`, `fetchCapabilityPolicies`, `fetchSystemConfigs`, `fetchConfigDefinitions` — 已有 API

---

## Task 5: AccessControlSettings — 门禁与人脸

**Files:**
- Create: `frontend/src/features/admin/settings/AccessControlSettings.tsx`

合并 `face`, `telemetry_facility`, 和 `AdminExternalCommConfigPage`。

### 实现策略

三个卡片区域：

1. **人脸识别配置** — 复用 `FaceSettingsPanel`
2. **设施遥测配置** — 使用 `SystemConfigsPanel` 加载 `telemetry_facility`
3. **外部通信配置** — 提取 `AdminExternalCommConfigPage` 的表格逻辑（去掉 AdminPageShell 包装）

```tsx
import FaceSettingsPanel from "@/features/admin/settings/FaceSettingsPanel";
// ExternalCommConfig 的核心逻辑提取

export default function AccessControlSettings() {
  return (
    <div className="space-y-6">
      <AdminFormCard title="人脸识别" ...>
        <FaceSettingsPanel configs={faceConfigs} configDefs={faceDefs} onConfigsChange={setFaceConfigs} />
      </AdminFormCard>
      <AdminFormCard title="设施遥测" ...>
        <SystemConfigsPanel moduleKey="telemetry_facility" ... />
      </AdminFormCard>
      <AdminFormCard title="外部通信连接状态" description="只读检查，不支持在线修改">
        <ExternalCommConfigTable />  {/* 提取自 AdminExternalCommConfigPage */}
      </AdminFormCard>
    </div>
  );
}
```

---

## Task 6: SchedulerSettings — 定时任务

**Files:**
- Create: `frontend/src/features/admin/settings/SchedulerSettings.tsx`

原 `AdminScheduleManagerPage`（965 行）内容迁入。这个页面逻辑复杂，采用直接导入策略。

### 实现策略

```tsx
// 提取 AdminScheduleManagerPage 的内部渲染函数（去掉 AdminPageShell 包装）
// 或直接将整个页面嵌入（如果 AdminPageShell 不引起双重嵌套问题）
import { ScheduleManagerContent } from "@/pages/AdminScheduleManagerPage";

export default function SchedulerSettings() {
  return <ScheduleManagerContent />;
}
```

如果原页面没有导出内部组件，则在 SchedulerSettings 中重写，复用原页面的 API 调用和状态管理逻辑。

**依赖：**
- `fetchScheduleJobs`, `updateScheduleJob`, `runScheduleJobNow` — schedule.api
- `listDahuaSwingTasks`, `updateDahuaSwingTask`, `executeDahuaSwingTask` — dahuaSwing.api

---

## Task 7: IntegrationsSettings — 集成与凭证

**Files:**
- Create: `frontend/src/features/admin/settings/IntegrationsSettings.tsx`

合并 `llm`, `credentials`, `integration` 三个模块。

### 实现策略

```tsx
export default function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      <AdminFormCard title="AI 大模型" ...>
        <LlmSettingsPanel configs={llmConfigs} configDefs={llmDefs} onConfigsChange={setLlmConfigs} />
      </AdminFormCard>
      <AdminFormCard title="外部系统凭证（大华 / ARO）" ...>
        <CredentialsTestPanel moduleKey="credentials" ... />
      </AdminFormCard>
      <AdminFormCard title="WinCC 集成" ...>
        <CredentialsTestPanel moduleKey="integration" ... />
      </AdminFormCard>
    </div>
  );
}
```

**依赖：**
- `LlmSettingsPanel` — 已有
- `CredentialsTestPanel` — 已有

---

## Task 8: PermissionsSettings — 页面权限

**Files:**
- Create: `frontend/src/features/admin/settings/PermissionsSettings.tsx`

原 `AdminPagePermissionSettingsPage`（508 行）内容迁入。同样采用提取内部组件或直接嵌入策略。

---

## Task 9: DangerZoneSettings — 危险操作

**Files:**
- Create: `frontend/src/features/admin/settings/DangerZoneSettings.tsx`

```tsx
export default function DangerZoneSettings() {
  return (
    <div className="space-y-6">
      <AdminFormCard title="⚠️ 客户端操作" description="以下操作会影响所有在线用户" danger>
        <ClientReloadOpsPanel />
      </AdminFormCard>
    </div>
  );
}
```

**依赖：**
- `ClientReloadOpsPanel` — 已有

---

## Task 10: 更新路由

**Files:**
- Modify: `frontend/src/router/index.tsx`

### 变更

1. **删除旧 import**（第 30, 32, 52, 53, 76 行附近）：
   - `import AdminSettingsPage from ...`
   - `import AdminExternalCommConfigPage from ...`
   - `import AdminPagePermissionSettingsPage from ...`
   - `import AdminScheduleManagerPage from ...`
   - `import AdminLoginBrandingPage from ...`

2. **新增 import**：
   ```typescript
   import AdminSettingsLayout from "@/features/admin/settings/AdminSettingsLayout";
   import GeneralSettings from "@/features/admin/settings/GeneralSettings";
   import AppearanceSettings from "@/features/admin/settings/AppearanceSettings";
   import NotificationsSettings from "@/features/admin/settings/NotificationsSettings";
   import AccessControlSettings from "@/features/admin/settings/AccessControlSettings";
   import SchedulerSettings from "@/features/admin/settings/SchedulerSettings";
   import IntegrationsSettings from "@/features/admin/settings/IntegrationsSettings";
   import PermissionsSettings from "@/features/admin/settings/PermissionsSettings";
   import DangerZoneSettings from "@/features/admin/settings/DangerZoneSettings";
   ```

3. **替换 settings 路由**（原第 293 行）：
   ```tsx
   // 旧：
   { path: "settings", element: <AdminSettingsPage /> },
   // 新：
   {
     path: "settings",
     element: <AdminSettingsLayout />,
     children: [
       { index: true, element: <Navigate to={`${STAFF_NS}/admin/settings/general`} replace /> },
       { path: "general", element: <GeneralSettings /> },
       { path: "appearance", element: <AppearanceSettings /> },
       { path: "notifications", element: <NotificationsSettings /> },
       { path: "access-control", element: <AccessControlSettings /> },
       { path: "scheduler", element: <SchedulerSettings /> },
       { path: "integrations", element: <IntegrationsSettings /> },
       { path: "permissions", element: <PermissionsSettings /> },
       { path: "danger-zone", element: <DangerZoneSettings /> },
     ],
   },
   ```

4. **删除独立路由**：
   - 从 AdminGuard 下删除：`login-branding`（第 266 行）、`schedule-manager`（第 268 行）
   - 从 SuperAdminGuard 下删除：`external-comm-config`（第 295 行）、`page-permissions`（第 297 行）

5. **添加旧路由 redirect**（在 SuperAdminGuard 或外层）：
   ```tsx
   { path: "schedule-manager", element: <Navigate to={`${STAFF_NS}/admin/settings/scheduler`} replace /> },
   { path: "external-comm-config", element: <Navigate to={`${STAFF_NS}/admin/settings/access-control`} replace /> },
   { path: "page-permissions", element: <Navigate to={`${STAFF_NS}/admin/settings/permissions`} replace /> },
   { path: "login-branding", element: <Navigate to={`${STAFF_NS}/admin/settings/appearance`} replace /> },
   ```

6. **权限调整**：`AdminSettingsLayout` 路由从 `SuperAdminGuard` 移到 `AdminGuard` 下。

---

## Task 11: 更新侧边栏导航注册表

**Files:**
- Modify: `frontend/src/features/admin/adminNavRegistry.ts`

### 变更

1. **删除 4 个独立入口**（第 196-203 行 schedule、第 225-231 行 external-comm、第 243-249 行 page-perms、第 280-286 行 login-branding）

2. **更新 settings 入口**（第 205-214 行）：
   ```typescript
   {
     id: "settings",
     path: "/admin/settings",
     label: "系统设置",
     icon: Settings,
     alias: ["设置", "配置", "系统", "定时任务", "权限", "人脸", "通知", "集成", "品牌", "settings", "config"],
     homeTone: "from-slate-400 to-zinc-500",
     fallbackMinRole: "ADMIN",  // 从 SUPER_ADMIN 降为 ADMIN
     sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/settings", "ADMIN"),
   },
   ```

3. **扩展 alias** 包含被合并页面的搜索关键词（定时任务、权限、人脸、通知、集成、品牌）

---

## Task 12: 迁移 dashboard_codex → student-violations

**Files:**
- Modify: `frontend/src/pages/AdminStudentViolationsPage.tsx`

### 变更

在原 6 个 tab 定义中新增第 7 个 tab：

```tsx
// 新增 tab 定义（在现有 SWIPE_ALERT_TABS 或同级）
{
  id: "homepage-content",
  label: "主页文案",
  content: <HomepageContentTab />,
}
```

创建 `HomepageContentTab` 组件（可内联或独立文件），加载 `dashboard_codex` 模块的配置：

```tsx
function HomepageContentTab() {
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [defs, setDefs] = useState<SettingDefinitionRecord[]>([]);

  useEffect(() => {
    Promise.all([
      fetchSystemConfigs("dashboard_codex"),
      fetchConfigDefinitions("dashboard_codex"),
    ]).then(([c, d]) => { setConfigs(c); setDefs(d); });
  }, []);

  return (
    <SystemConfigsPanel
      moduleKey="dashboard_codex"
      configs={configs}
      configDefs={defs}
      onConfigsChange={setConfigs}
      title="主页文案与公告"
      description="管理主页还卡说明、惩戒公告等面向学生的文案与展示样式"
    />
  );
}
```

---

## Task 13: 修复 LLM 标题硬编码

**Files:**
- Modify: `frontend/src/features/admin/settings/SystemConfigsPanel.tsx`（第 123 行）

### 变更

将：
```tsx
title={title ?? (moduleKey === "llm" ? "大模型连接（通义 / DashScope）" : "配置项")}
```
改为：
```tsx
title={title ?? (moduleKey === "llm" ? "AI 大模型连接（DeepSeek）" : "配置项")}
```

同时更新第 127 行的描述中 "通义 / DashScope" 引用为 "DeepSeek"。

---

## Task 14: 更新 settingsLabels.ts

**Files:**
- Modify: `frontend/src/features/admin/settings/settingsLabels.ts`

### 变更

在 `MODULE_GROUP_DEFS`（第 115-120 行）中从 `experience` 组的 keys 中移除 `dashboard_codex`：

```typescript
// 旧：
{ id: "experience", title: "界面与展示", keys: ["dashboard_codex", "telemetry_facility", "frontend_runtime", "scanner"] },
// 新：
{ id: "experience", title: "界面与展示", keys: ["telemetry_facility", "frontend_runtime", "scanner"] },
```

保留 `moduleDescription("dashboard_codex")` 函数定义（student-violations 页面可能用到），或改为更通用的描述。

---

## Task 15: 清理旧页面文件

在确认所有引用已更新后：

```
git rm frontend/src/pages/AdminScheduleManagerPage.tsx
git rm frontend/src/pages/AdminExternalCommConfigPage.tsx
git rm frontend/src/pages/AdminPagePermissionSettingsPage.tsx
git rm frontend/src/pages/AdminLoginBrandingPage.tsx
```

同时在 `router/index.tsx` 中移除对应的 import 行。

---

## Task 16: 验证 — 全链路检查

**Files:** 全部变更文件

### 检查清单

- [ ] `npm run build` 无 TS 编译错误
- [ ] 所有旧路由 `/admin/schedule-manager` 等正确 redirect 到新路径
- [ ] ADMIN 用户访问 settings 只看到 5+1 个子页面（general/appearance/notifications/access-control/scheduler）
- [ ] SUPER_ADMIN 用户看到全部 8 个子页面
- [ ] 搜索框能跨子页面搜索配置项
- [ ] 侧边栏只剩一个"系统设置"入口（原 4 个独立入口消失）
- [ ] LLM 面板标题显示 "DeepSeek" 而非 "通义/DashScope"
- [ ] student-violations 页面有 "主页文案" tab，加载 dashboard_codex 配置
- [ ] 所有 settings 子页面的配置保存功能正常
- [ ] `grep -rn 'bg-\[#' frontend/src/` — 无新硬编码颜色
- [ ] `grep -rn 'bg-white\|bg-slate\|bg-gray\|bg-zinc' frontend/src/features/admin/settings/` — 无违规

---

## 执行顺序

```
Task 1 (AdminSettingsLayout)  ← 基础骨架，先做
    ↓
Task 2-9 (7 个子页面)  ← 可全部并行
    ↓
Task 10 (路由更新)  ← 依赖 Task 1-9
    ↓
Task 11 (nav 注册表)  ← 可与 Task 10 并行
    ↓
Task 12 (student-violations)  ← 独立，可并行
    ↓
Task 13 (LLM 标题修复)  ← 独立小改动
    ↓
Task 14 (settingsLabels)  ← 独立小改动
    ↓
Task 15 (清理旧文件)  ← 最后
    ↓
Task 16 (验证)  ← 全链路
```
