# 管理后台工作台重设计 — 实现计划

**Goal:** 重构工作台首页、命令面板搜索、nav registry，实现入口自动发现、全局模糊搜索。

**Architecture:** registry 唯一数据源 → 首页/侧栏/搜索全自动推导；build:check-nav 扫描遗漏。

**Tech Stack:** React 19 + TypeScript + cmdk + Tailwind CSS

---

### Task 1: Registry 扩展 alias 字段

**Files:**
- Modify: `frontend/src/features/admin/adminNavRegistry.ts`

- [ ] **Step 1: 类型加 alias**

```typescript
export type AdminNavRegistryItem = {
  // ... existing fields
  alias?: string[];  // 搜索关键词
};
```

- [ ] **Step 2: 补全现有条目的 alias**

为所有 registry 条目添加中文+英文别名关键词。

- [ ] **Step 3: Commit**

---

### Task 2: buildAdminNavModel 传递 alias

**Files:**
- Modify: `frontend/src/features/admin/buildAdminNavModel.ts`

- [ ] **Step 1: AdminCommandPaletteItem 加 alias 字段**

- [ ] **Step 2: 从 registry 传递 alias 到 palette items**

- [ ] **Step 3: Commit**

---

### Task 3: AdminCommandPalette 全局模糊搜索

**Files:**
- Modify: `frontend/src/features/admin/AdminCommandPalette.tsx`

- [ ] **Step 1: 搜索结果带图标**

renderRow 渲染图标 + 标题 + 分组名 + 路径。

- [ ] **Step 2: value 包含 alias + label + path + group**

```tsx
value={`${it.label} ${it.path} ${it.groupTitle} ${(it.alias ?? []).join(" ")}`}
```

- [ ] **Step 3: Commit**

---

### Task 4: AdminHomePage 智能分区卡片

**Files:**
- Modify: `frontend/src/pages/AdminHomePage.tsx`

- [ ] **Step 1: 紧凑卡片组件**

图标 32px + 标题 13px + 底部色条。

- [ ] **Step 2: 三分区布局**

收藏展开 / 最近展开 / 分组折叠。

- [ ] **Step 3: 卡片网格 `grid-cols-2 sm:3 lg:4 xl:5`**

- [ ] **Step 4: Commit**

---

### Task 5: 全局返回按钮

**Files:**
- Modify: `frontend/src/layouts/AdminLayout.tsx`

- [ ] **Step 1: 在 header 下方、Outlet 上方加面包屑栏**

```tsx
{pathname !== "/admin" && (
  <div className="px-4 py-2 border-b">
    <button onClick={() => navigate("/admin")}>← 返回工作台</button>
    <span className="mx-2">/</span>
    <span>{currentPageLabel}</span>
  </div>
)}
```

- [ ] **Step 2: Commit**

---

### Task 6: 构建检查脚本

**Files:**
- Create: `scripts/check-nav-registry.ts`

- [ ] **Step 1: 解析 router 中 /admin/* 路由，对比 registry path，输出遗漏列表**

- [ ] **Step 2: 加到 package.json build hook**

---

### Task 7: 构建验证

- [ ] `npm run build` 通过
- [ ] 提交
