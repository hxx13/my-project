# 页面与入口权限：自动发现规范

本文约定后台 **「页面权限」** 模块如何从代码库自动发现节点，以及与 **HTTP API** 权限的关系。实现代码以 `PagePermissionService` 为准；修改侧栏或路由后请在 **页面权限设置** 中点击 **「重新扫描」** 同步数据库。

## 1. Web 管理端（platform = `WEB`）

### 1.1 路由页面（`node_type = PAGE`，`entry_source = route`）

| 数据源 | 路径 | 说明 |
|--------|------|------|
| `frontend/src/router/index.tsx` | `path: "..."` 双引号 | 每个 React Router 路径生成一条 PAGE 节点；另强制包含 `/admin`。 |
| 展示名 | `adminNavRegistry.ts` 优先 | 若该路径在注册表中有对应项，则 `display_name` 使用注册表 **label**，否则退回为路径字符串。 |

### 1.2 侧栏入口（`node_type = ENTRY`，`entry_source = sidebar`）

侧栏真实链接来自 `ADMIN_NAV_REGISTRY`（`buildAdminNavModel`），扫描器**不再依赖** `AdminLayout.tsx` 中的 `to="..."` 字面量（历史遗留仍会被合并扫描，但不保证完整）。

| 数据源 | 路径 | 说明 |
|--------|------|------|
| **`frontend/src/features/admin/adminNavRegistry.ts`** | 正则匹配 `{ id: "...", path: "/admin/...", label: "..." }` 块 | 每个注册项生成 **PAGE + ENTRY(sidebar)** 各一条；`display_name` = **label**。 |
| `frontend/src/layouts/AdminLayout.tsx` | `to="/..."` | 兼容顶层固定链接（如返回主页、工作台）。 |
| `frontend/src/features/dev-tools/DebugNav.tsx` | `path: '/...'` 单引号 | 开发调试导航中的路径。 |

**节点键**：`WEB:ENTRY:sidebar:{path}`（`path` 经 `normalizeWebPath`：前导 `/`、折叠重复 `/`）。

**默认最小角色**：`PagePermissionService.inferWebMinRole(path)` 按路径前缀推断；可在库中人工调高，但不得低于父 PAGE 节点（保存时校验）。

### 1.4 整页自定义右键（`AdminLayout` + `AdminChromeContextMenu`）

- **教职工（`STAFF`）及以上**：在后台任意位置右键将打开主菜单，并**禁用浏览器默认右键**。
- **主菜单优先**：首块为「入口权限」：命中 `#/admin` 链接时，点击「入口权限（快捷）」在**主菜单右侧**打开接力子面板（内含 `AdminEntryPermQuickSection`），主列高度不被表单撑开；敏感操作同理为琥珀色子面板。
- **主列与子列**：滚动条视觉隐藏（仍可用滚轮滚动）；子列贴右侧空间不足时自动翻到主列左侧。
- **菜单内收紧**：入口改权保存仍仅 **超级管理员**；敏感区跳转权限页由 `configureMinRole` 控制。
- **高敏感控件**：`AdminSensitiveAction`（示例：文件模板「删除」）。
- **便民 / 调试**：主列提供新标签打开当前页、命令面板、刷新、复制路径；超级管理员另有调试摘要、接口中心、页面权限设置入口。

## 2. 小程序端（platform = `MINI`）

| 类型 | 数据源 | 说明 |
|------|--------|------|
| PAGE | `aroapp/miniprogram/app.json` 的 `pages` | 每个页面路径一条。 |
| ENTRY | `pages/mine/index.wxml` + `mine/index.js` 中 `url: '...'` 与 `hasMinRole` | 「我的」列表入口。 |
| ENTRY | `pages/index/index.wxml` + `index/index.js` | 首页快捷入口。 |
| ENTRY | `utils/tabBarHelper.js` 中 `path: '...'` | 底部 Tab。 |

展示名：WXML 中 `van-cell` 的 `title` 或快捷项占位文案。

## 3. API 接口权限（与 `page_permission_item` 的关系）

**`page_permission_item` 表只描述「前端路由 / 小程序页面与入口」的可见性**，不逐条枚举 REST URL。

HTTP API 的鉴权在 **各 Controller / Service** 中通过统一方法实现，常见命名：

| 方法语义 | 典型最低角色 | 检索方式（运维/Code Review） |
|----------|--------------|------------------------------|
| 学生可访问 | `STUDENT` | `grep -r "resolveUserFromBearer" src/main/java` 结合业务判断 |
| 教职工 | `STAFF` | `grep -r "requireStaff" src/main/java` |
| 管理员 | `ADMIN` | `grep -r "requireAdmin" src/main/java` |
| 超级管理员 | `SUPER_ADMIN` | `grep -r "requireSuperAdmin" src/main/java` 或拦截器注解 |

**约定**：新增管理端接口时，在 Controller 层显式调用与业务一致的 `require*`；若某页面对应的 API 角色门槛变更，应同时检查该页在 **页面权限** 中的 ENTRY/PAGE 是否与产品预期一致（前端隐藏 ≠ 接口安全，接口必须独立鉴权）。

## 4. 运维检查清单

1. 合并包含 `adminNavRegistry.ts` 改动的分支后，在 **页面权限设置** 执行 **重新扫描**。
2. 若仍有个别路径未出现：确认是否已加入 `frontend/src/router/index.tsx`；仅存在于动态 URL 的入口需在注册表或文档中备案后扩展扫描器。
3. 生产库：`page_permission_item` 与 `schema.sql` / 增量脚本由既有流程维护；本发现逻辑不自动改表结构。
