# 管理后台系统设置重构 · 设计规格

- **版本**: 1.0
- **日期**: 2026-06-30
- **类型**: 重构 + 功能整合
- **影响范围**: 前端路由、侧边栏、Settings 模块、4 个独立管理页面、student-violations 页面

---

## 一、背景与目标

### 当前问题

1. **入口分散**：`schedule-manager`、`external-comm-config`、`page-permissions`、`login-branding` 四个页面作为独立路由存在，与 `settings` 本质同类功能却各有独立侧边栏入口
2. **模块平铺**：Settings 内部 17 个模块挤在左侧小导航，`SystemConfigsPanel` 被复用 11 次但按模块拆得太细，找配置困难
3. **无跨模块搜索**：无法跨子页面搜索配置项，只能逐个模块翻找
4. **权限不一致**：同类功能分散在不同 Guard 级别——settings 是 SUPER_ADMIN，schedule-manager 却是 ADMIN
5. **内容归属错位**：`dashboard_codex` 模块的"主页公告/还卡说明/惩戒公告"属于学生端内容管理，却放在系统设置中
6. **残留过期标签**：LLM 面板标题仍显示 "通义/DashScope"，实际已迁移到 DeepSeek

### 目标

- 将 4 个独立页面降级为 settings 的子页面，侧边栏只留一个"系统设置"入口
- 按功能域重新分组合并，17 个模块收敛为 8 个子页面
- 提供全局搜索，跨子页面检索配置项
- 按子页面分级权限（ADMIN / SUPER_ADMIN）
- `dashboard_codex` 模块迁移到 `student-violations` 页面
- 清理残留过期标签和无效配置引用

---

## 二、路由设计

### 新路由树

```
/console/admin/settings              AdminSettingsLayout (ADMIN+)
  ├── /general                       通用设置 (ADMIN)
  ├── /appearance                    外观与品牌 (ADMIN)
  ├── /notifications                 通知配置 (ADMIN)
  ├── /access-control                门禁与人脸 (ADMIN)
  ├── /scheduler                     定时任务 (ADMIN)
  ├── /integrations                  集成与凭证 (SUPER_ADMIN)
  ├── /permissions                   页面权限 (SUPER_ADMIN)
  └── /danger-zone                   危险操作 (SUPER_ADMIN)
```

### 路由实现策略

- `AdminSettingsLayout` 作为 layout route，渲染二级侧边栏 + `<Outlet />`
- 每个子页面是懒加载的独立组件
- 旧路由保留 301 redirect：`/admin/schedule-manager` → `/admin/settings/scheduler` 等
- `AdminSettingsLayout` 在 `router/index.tsx` 中替代原有的 `AdminSettingsPage` 路由

### Guard 调整

- `AdminSettingsLayout` 最低角色：ADMIN（从原 SUPER_ADMIN 下调）
- SUPER_ADMIN 子页面在组件内部二次校验，ADMIN 用户不可见对应侧边栏项
- 侧边栏入口 `adminNavRegistry.ts` 中 `fallbackMinRole` 降为 ADMIN

---

## 三、模块合并与子页面归属

| 新子页面 | 合并来源（旧模块/页面） | 最低角色 |
|---------|----------------------|---------|
| `general` | system + network + logging + frontend_runtime | ADMIN |
| `appearance` | mini_program + AdminLoginBrandingPage | ADMIN |
| `notifications` | notification + capability + template + supplies | ADMIN |
| `access-control` | face + telemetry_facility + AdminExternalCommConfigPage | ADMIN |
| `scheduler` | AdminScheduleManagerPage（整页迁入） | ADMIN |
| `integrations` | llm + credentials + integration | SUPER_ADMIN |
| `permissions` | AdminPagePermissionSettingsPage（整页迁入） | SUPER_ADMIN |
| `danger-zone` | system（危险操作部分）+ ClientReloadOpsPanel | SUPER_ADMIN |

### 不再属于 settings 的模块

| 旧模块 | 去向 |
|--------|------|
| `dashboard_codex` | 迁移到 student-violations 页面，新增 "主页文案" tab |
| `scanner` | 保留在 general 子页面中作为独立卡片 |
| `material` | 保留在 general 子页面中作为独立卡片 |

---

## 四、权限模型

| 角色 | 可见子页面 |
|------|----------|
| ADMIN | general, appearance, notifications, access-control, scheduler |
| SUPER_ADMIN | 以上全部 + integrations, permissions, danger-zone |

### 实现方式

- `AdminSettingsLayout` 加载时获取当前用户角色
- 二级侧边栏根据角色过滤可见项
- SUPER_ADMIN 专属子页面在组件内做二次校验（直接访问 URL 时拦截）
- 侧边栏注册表 `adminNavRegistry.ts` 中 settings 入口 `fallbackMinRole` 设为 ADMIN

---

## 五、导航与 UI

### 二级侧边栏

```
┌──────────────────┐
│ ◆ 通用设置        │  ← 当前激活项：蓝色左边框 + 浅蓝背景
│   外观与品牌      │
│   通知配置        │
│   门禁与人脸      │
│   定时任务        │
│   集成与凭证 🔒   │  ← 仅 SUPER_ADMIN 可见
│   页面权限 🔒    │  ← 仅 SUPER_ADMIN 可见
│ ───────────────── │  ← 分隔线
│   危险操作 🔒 ⚠  │  ← 红色文字，仅 SUPER_ADMIN
└──────────────────┘
```

### 顶部栏

- 左侧：返回按钮（回到 admin 首页）+ "系统设置" 标题 + 面包屑
- 右侧：全局搜索框（`Ctrl+K` 或 `/` 聚焦），跨子页面搜索配置项的中文名、key、描述

### 搜索行为

- 输入时实时过滤：列出所有匹配的配置项，显示其所属子页面
- 点击搜索结果 → 跳转到对应子页面 + 高亮该配置项
- 搜索范围：所有子页面的配置项 key、中文标签、描述字段
- 无结果时给出 "未找到匹配的配置项" 提示

---

## 六、内容迁移：dashboard_codex → student-violations

### 迁移内容

原 `dashboard_codex` 模块中的富文本配置项，包括但不限于：
- 主页公告
- 还卡说明
- 惩戒公告
- 其他面向学生端的文案与展示样式

### 目标位置

`AdminStudentViolationsPage` 新增第 7 个 tab："主页文案"（`homepage-content`）

### 实现要点

- `AdminStudentViolationsPage` 新增 tab 定义
- 复用现有 `SystemConfigsPanel` 或 `ConfigFieldEditor` 渲染 dashboard_codex 的富文本配置
- 原 settings 模块列表中移除 `dashboard_codex`
- 后端 API 无需改动（配置项仍通过 `/settings/configs?module=dashboard_codex` 获取，只是前端展示位置迁移）

---

## 七、清理清单

### 删除

| 项目 | 文件/位置 | 原因 |
|------|----------|------|
| 4 个独立路由注册 | `router/index.tsx` | schedule-manager, external-comm-config, page-permissions, login-branding 降级为 settings 子路由 |
| 4 个独立侧边栏入口 | `adminNavRegistry.ts` | 同上，归入一个 settings 入口 |
| 4 个独立页面组件 | `pages/AdminScheduleManagerPage.tsx` 等 | 迁入 settings 子目录，原文件删除 |
| `dashboard_codex` 模块注册 | `settingsLabels.ts` MODULE_GROUP_DEFS | 迁移到 student-violations |

### 修复

| 项目 | 位置 | 处理 |
|------|------|------|
| LLM 面板标题 "通义/DashScope" | `SystemConfigsPanel.tsx:123` | 改为读取 `moduleDescription` 动态标题 |
| `AdminLoginBrandingPage` 迁入 | 新建 `features/admin/settings/AppearanceSettings.tsx` | 包装原页面内容为 settings 子页面 |

### 保留但标记

| 项目 | 位置 | 处理 |
|------|------|------|
| `visibilityPublicAllowed` | `CapabilityPolicyRecord` 类型 | 后端可能使用，前端保留类型但继续不展示 |
| `sortOrder` | `CapabilityPolicyRecord` 类型 | 同上 |

---

## 八、文件变更计划

### 新增

| 文件 | 说明 |
|------|------|
| `features/admin/settings/AdminSettingsLayout.tsx` | Settings layout：二级侧边栏 + Outlet + 搜索 |
| `features/admin/settings/GeneralSettings.tsx` | 通用设置子页面（合并 system/network/logging/frontend_runtime/scanner/material） |
| `features/admin/settings/AppearanceSettings.tsx` | 外观子页面（原 login-branding + mini_program） |
| `features/admin/settings/AccessControlSettings.tsx` | 门禁子页面（face + telemetry_facility + external-comm-config） |
| `features/admin/settings/IntegrationsSettings.tsx` | 集成子页面（llm + credentials + integration） |
| `features/admin/settings/PermissionsSettings.tsx` | 权限子页面（原 page-permissions） |
| `features/admin/settings/SchedulerSettings.tsx` | 定时任务子页面（原 schedule-manager） |

### 修改

| 文件 | 变更 |
|------|------|
| `router/index.tsx` | 替换 AdminSettingsPage 路由为 AdminSettingsLayout + 子路由；添加旧路由 redirect |
| `features/admin/adminNavRegistry.ts` | 删除 4 个独立入口，保留一个 settings 入口（ADMIN+） |
| `pages/AdminSettingsPage.tsx` | 重构为 AdminSettingsLayout |
| `features/admin/settings/SystemConfigsPanel.tsx` | 修复 LLM 标题硬编码 |
| `features/admin/settings/settingsLabels.ts` | 移除 dashboard_codex 分组 |

### 删除

| 文件 | 说明 |
|------|------|
| `pages/AdminScheduleManagerPage.tsx` | 迁入 SchedulerSettings.tsx |
| `pages/AdminExternalCommConfigPage.tsx` | 迁入 AccessControlSettings.tsx |
| `pages/AdminPagePermissionSettingsPage.tsx` | 迁入 PermissionsSettings.tsx |
| `pages/AdminLoginBrandingPage.tsx` | 迁入 AppearanceSettings.tsx |

### 迁移（不改逻辑，只改位置）

`AdminStudentViolationsPage.tsx` 新增 "主页文案" tab，加载 dashboard_codex 配置。

---

## 九、边界与不涉及范围

- **不涉及后端 API 变更**：所有现有 API 端点保持不变
- **不涉及数据库变更**：不新增/删除/修改任何数据库表或字段
- **不改变配置项本身的行为**：只改变前端组织方式，配置的读写逻辑不变
- **不改变 student-violations 现有 6 个 tab 的逻辑**：只新增第 7 个 tab
- **不做设计令牌迁移**：新 UI 沿用现有 `--app-color-*` 令牌体系 + Bento 卡片风格

---

## 十、风险与回滚

- **风险**：旧书签/外部链接指向旧路由 → 保留 redirect 兼容
- **风险**：ADMIN 用户突然能访问 settings → 原 settings 确实是 SUPER_ADMIN 但 schedule-manager 等本来就是 ADMIN，统一为 ADMIN 入口合理
- **回滚**：每个子页面保持独立组件，如有问题可快速恢复为独立路由
