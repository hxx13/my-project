# 后台模块设计说明：人员授权 · 门禁规则 · 领用物资

> 视觉基线：`docs/ADMIN_UI_STYLE.md`（Vercel 式中性层次 + `#0070f3` 作交互强调）。  
> 本文描述**信息架构、路由层级、返回逻辑与页面职责**，供实现与 Code Review 对照。

---

## 1. 通用原则

### 1.1 一级页 vs 二级页

| 层级 | 定义 | 导航与返回 |
|------|------|------------|
| **一级** | 侧栏 `ADMIN_NAV_REGISTRY` 或权限下发的 `sidebar` ENTRY 精确匹配的 URL | 依赖全局壳层高亮；**不要求**页内重复「返回上一页」。 |
| **二级** | 同一业务域下、**非**侧栏精确匹配的子路径（如 `/admin/supplies/mine`）或「全屏编辑态」 | **必须**提供页内返回：组件 `AdminSubPageHeader`；进入时用 `navigate(path, { state: { returnTo } })` 保留来源。 |

### 1.2 `returnTo` 约定

- 类型：`string`，必须以 `/` 开头，表示 hash 路由下的 path（如 `/admin/supplies`）。
- 注入方：从一级页跳转到二级页的 `Link` / `navigate`。
- 消费方：`AdminSubPageHeader` 优先 `location.state.returnTo`，非法时回退 `fallbackTo`。

### 1.3 与「保存后不整表刷新」规则的关系

- 人员授权、门禁列表等：写操作成功后**仅合并当前行或关闭编辑器**，禁止成功后再全表 `load()`；已在代码注释中引用 `post-save-no-full-refresh.mdc`。

---

## 2. 人员授权（`/admin/personnel`）

### 2.1 职责

- **学生**：小程序/门户用户；角色、启用状态、openId 重置、详情查看。
- **员工**：后台登录账号；同上 + 创建、删除、重置密码、展示昵称。

### 2.2 信息架构

- **单一路由**，无子 path；**学生 | 员工** 为页内 **Segmented** 切换，非二级路由。
- **新建员工**、**详情**、**改昵称** 为 **Modal**，关闭即回到当前列表上下文，不占用新 URL。

### 2.3 返回与焦点

- 无需 `AdminSubPageHeader`（非二级路由）。
- 使用 `AdminPageShell` 统一页题与说明，与全局 `main` 留白一致。

---

## 3. 门禁规则配置（`/admin/access-rules`）

### 3.1 职责

- 列表：规则编号、名称、状态、更新时间、编辑/删除。
- **新增/编辑**：全屏 **Modal 编辑器**（非独立路由），避免丢失列表滚动位置。

### 3.2 返回逻辑（痛点修复）

- 用户在编辑器内应始终能 **明确回到列表**，不仅依赖右上角 `X`。
- 在 Modal 顶栏增加 **「返回列表」**（与关闭等价，语义更清晰），与标题并排。

### 3.3 列表区

- 使用 `AdminPageShell`：`title` + `description`；主操作「新增规则」置于 `actions`。

---

## 4. 领用物资域（`/admin/supplies` 及其子路径）

### 4.1 路由树

```
/admin/supplies              # 一级：领用物资（商城）
├── /admin/supplies/mine      # 二级：我的记录
├── /admin/supplies/claim-export?claimId=   # 二级：单张领用单导出/预览
├── /admin/supplies/manage    # 二级：物资管理（超管）
├── /admin/supplies/process   # 二级：物资处理台
└── /admin/supplies/audit-export   # 一级（侧栏）；从处理台带 claimId 进入时视为「处理上下文」
```

### 4.2 `returnTo` 注入矩阵

| 从 → 到 | `state.returnTo` |
|---------|------------------|
| 商城 → 我的记录 / 管理 / 处理 | 当前 `pathname + search` |
| 我的记录 → 导出页 | 当前路径（含 tab 若以后有 query） |
| 我的记录 → 商城修订 `?reviseClaimId=` | 我的记录路径，修订完成后可再回 mine |
| 处理台 → 审计导出页（带 `claimId`） | 处理台路径 |

### 4.3 各页 `fallbackTo`（`returnTo` 缺失时）

| 页面 | `fallbackTo` | `backLabel`（建议） |
|------|----------------|---------------------|
| 我的记录 | `/admin/supplies` | 返回领用物资 |
| 领用单导出 | `/admin/supplies/mine` | 返回我的记录 |
| 物资管理 | `/admin/supplies` | 返回领用物资 |
| 物资处理 | `/admin/supplies` 或 `/admin/supplies/audit-export`（按入口策略：默认物资首页） | 返回领用物资 |
| 审计导出（**且 URL 含 `claimId`**） | `/admin/supplies/process` | 返回物资处理台 |

### 4.4 商城页（`/admin/supplies`）

- 顶部外链一律使用 `<Link state={{ returnTo }}>`，保证二级页能回到进入前的商城 URL（含筛选类 query 若未来扩展）。

---

## 5. 组件对照

| 组件 | 用途 |
|------|------|
| `AdminPageShell` | 一级页或有独立页题的容器：标题、描述、右侧 `actions`。 |
| `AdminSubPageHeader` | 二级页顶：返回 + 标题 + 可选描述/操作。 |
| `AdminTableShell` / `AdminFormCard` | 列表/表单分区，与 `ADMIN_UI_STYLE` 圆角与边框一致。 |

---

## 6. 修订记录

- 初版：补齐人员授权壳层、门禁编辑器「返回列表」、领用域全链路 `returnTo` + `AdminSubPageHeader`。
- 实现文件：`components/admin/AdminSubPageHeader.tsx`；页面：`AdminPersonnelPage`、`AdminAccessRulesPage`、`AdminSupplies*` 系列。

## 7. 相关全局文档

- `docs/ADMIN_UI_STYLE.md` — 视觉 token 与壳层约定。
