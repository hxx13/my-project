# 管理后台工作台重设计 — 设计规格

> **目标**：重构 AdminHomePage + AdminCommandPalette + adminNavRegistry，实现入口自动发现、智能分区卡片、全局模糊搜索、自动返回导航。
>
> **设计日期**：2026-06-10
>
> **版本**：v1

---

## 一、架构总览

```
adminNavRegistry.ts（唯一定义处）
  ├── label / icon / alias / 分组 / 权限 / homeTone
  │
  ├──→ AdminHomePage（智能分区卡片：收藏/最近/分组折叠）
  ├──→ AdminSidebar（左侧导航）
  ├──→ AdminCommandPalette（全局模糊搜索）
  └──→ build:check-nav（扫描 router 对比 registry）
```

**核心原则**：registry 是唯一数据源。新增一个管理入口只需加一行 registry 定义——首页卡片、侧栏、搜索全部自动适配。

---

## 二、AdminHomePage 重设计

### 2.1 智能分区布局

```
┌─────────────────────────────────────────────────┐
│ ⭐ 工作台                           STAFF · 42入口 │
├─────────────────────────────────────────────────┤
│ ★ 收藏（N）→ 始终展开                            │
│  [📖 知识库] [👤 人员授权] [📦 资产记录] ...      │
├─────────────────────────────────────────────────┤
│ 🕐 最近访问（6）→ 始终展开                        │
│  [标签1] [标签2] [标签3] ...                     │
├─────────────────────────────────────────────────┤
│ ▸ 组织与通知（6）→ 默认折叠                       │
│ ▸ 系统与安全（7）→ 默认折叠                       │
│ ▸ 资产与运维（12）→ 默认折叠                      │
│ ...                                              │
└─────────────────────────────────────────────────┘
```

### 2.2 卡片规格

- 紧凑型：图标 32px + 标题 13px + 分组色条（2px 底部边框）
- 自适应网格：`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
- 收藏卡片带 ⭐ 角标，最近访问无角标
- 分组折叠卡片带数量角标（如"6 入口"）

### 2.3 全局返回

在 AdminLayout 的内容区顶部统一渲染面包屑/返回栏：

```
非首页管理页面 → 自动显示 "← 返回工作台" 导航条
首页 → 不显示
```

通过 React Router 的 `useLocation` 判断 `pathname !== "/admin"`。

---

## 三、AdminCommandPalette 重设计

### 3.1 全局模糊搜索

搜索范围包括：
- `label`（中文标题）
- `path`（URL 路径）
- 分组名（如"资产与运维"）
- `alias` 字段（新增，中文别名 + 英文关键词）

### 3.2 结果展示

```
┌──────────────────────────────────────────────┐
│ 🔍 门                                         │
├──────────────────────────────────────────────┤
│ ⭐ 收藏                                      │
│   🚪 门禁管理          资产与运维 /admin/...  │
├──────────────────────────────────────────────┤
│ 资产与运维                                   │
│   🚪 门禁管理          /admin/door-control   │
│   📦 门组仓库          /admin/door-group-... │
└──────────────────────────────────────────────┘
```

每行显示：**图标 + 中文标题 + 分组名 + 路径**。

### 3.3 alias 字段

```typescript
export type AdminNavRegistryItem = {
  // ... 现有字段
  alias?: string[];  // 搜索关键词：中文别名 + 英文 + 缩写
};
```

---

## 四、adminNavRegistry 扩展

### 4.1 新增 alias 字段

所有现有 registry 条目补充 alias 关键词。

### 4.2 构建检查脚本

`scripts/check-nav-registry.ts`：

```typescript
// 1. 解析 router/index.tsx 中所有 /admin/* 路由
// 2. 对比 ADMIN_NAV_REGISTRY 中已注册的 path
// 3. 输出未注册路由列表（warning）
```

集成到 `package.json`：`"check-nav": "npx tsx scripts/check-nav-registry.ts"`，在 `build` 前自动运行。

---

## 五、Registry 条目示例

```typescript
{
  id: "personnel",
  path: "/admin/personnel",
  label: "人员授权",
  icon: Users,
  alias: ["人员", "用户", "授权", "权限", "personnel", "user"],
  homeTone: "from-indigo-600 to-blue-700",
  fallbackMinRole: "SUPER_ADMIN",
  sidebarVisible: (ctx) => ctx.flags.canManagePersonnel && show(ctx, "/admin/personnel", "SUPER_ADMIN"),
}
```

---

## 六、实施阶段

### Phase 1：registry 扩展 + alias 补全

1. `AdminNavRegistryItem` 加 `alias?: string[]` 字段
2. 为所有现有条目补充 alias
3. `buildAdminNavModel` 传递 alias 到命令面板

### Phase 2：AdminHomePage 重写

1. 智能分区布局（收藏/最近/分组折叠）
2. 紧凑卡片组件
3. 权限过滤自动应用

### Phase 3：AdminCommandPalette 重写

1. 全局模糊搜索（alias + label + path + group）
2. 搜索结果带图标+分组
3. 搜索即跳转

### Phase 4：全局返回 + 构建检查

1. AdminLayout 面包屑栏
2. `scripts/check-nav-registry.ts`
3. `package.json` build hook

---

*本文档交付给下一个实施阶段。*
