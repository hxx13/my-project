# 管理端 + 登录页 UI 设计基线

本文件约束 **Web 管理后台（`AdminLayout` 下页面）** 与 **登录页**（`LoginPage`）。**Twin 业务全屏壳**（`TwinLayout`）为另一套沉浸场景，此处仅说明关系：Twin 不受本 token 强制覆盖，新功能优先在 Admin + Login 落地。

角标与侧栏分组规则见 [`admin-layout-conventions.md`](./admin-layout-conventions.md)。

## 品牌与层级

- **主色**：沿用主题 `--primary` / `--ring`（shadcn 变量），管理顶栏与卡片为白底 + 浅灰边框（`border-slate-200`）。
- **侧栏**：`bg-slate-900` + 高对比文字；分组卡片 `bg-black/20`。
- **表面**：主内容 `bg-slate-100`，卡片/表格容器 `bg-white` + `rounded-lg border`。
- **阴影**：命令面板 `shadow-2xl`；下拉 `shadow-md`（见 `dropdown-menu.tsx`）。

## Token（`index.css` `:root`）

| 变量 | 用途 |
|------|------|
| `--admin-toolbar-gap` / `--admin-toolbar-row-gap` | 工具栏间距 |
| `--admin-control-height` | 工具栏按钮、原生 `select` 目标高度（2.25rem） |
| `--admin-radius-sm` / `--md` / `--lg` | 卡片、输入、按钮圆角档位 |
| `--admin-focus-ring` | 焦点环颜色（与 `--ring` 对齐） |
| `--admin-z-command-overlay` / `--admin-z-command-content` | 命令面板 z-index |

登录页输入/按钮使用 **同一套半径与焦点叙事**：`rounded-[length:var(--admin-radius-lg)]` + `ring` 类引用 `--admin-focus-ring`。

## 按钮四态

通过薄封装 `AdminButton`（`frontend/src/components/admin/AdminButton.tsx`）映射到 shadcn `Button`：

| 语义 | `tone` | 说明 |
|------|--------|------|
| 主 | `primary` | 实心主色 |
| 次 | `secondary` | 描边/浅底 |
| 幽灵 | `ghost` | 弱背景 hover |
| 危险 | `destructive` | 删除类操作 |

高度与工具栏一致时使用 `size="default"`（`h-9` 与 `--admin-control-height` 接近）。**禁用**时 `disabled` + 降低透明度；**loading** 时在文案侧由调用方传入「保存中…」等，组件不内置请求态。

## 表单

- **高度**：筛选条原生 `select` 使用 `AdminSelect`，高度与 `--admin-control-height` 对齐。
- **焦点**：`focus-visible:ring-[3px] ring-[color:var(--admin-focus-ring)]` 或与 Tailwind `ring-ring/50` 组合。
- **触控**：重要操作区建议 **最小点击区域约 44px**（见 `admin-layout-conventions.md` 与 NN 清单）。

## 表格

- **只读**：动态列以纯文本展示，无边框输入框外观。
- **编辑模式**：开启后动态列为 `input`；保存逻辑须遵守 [`.cursor/rules/post-save-no-full-refresh.mdc`](../.cursor/rules/post-save-no-full-refresh.mdc)：**成功后仅合并当前行**，禁止为单条保存整表 `load()`。

## 命令面板与导航安全

- **数据源**：列表项 **仅** 来自 `buildAdminNavModel` → `flatNavigableItems`（经权限与 `sidebarVisible` / `canShowWebEntry` 过滤），与侧栏同源。不向列表注入任何 **非 registry**、**非权限过滤** 的路径。
- **空查询**：cmdk 默认展示全部分组；底部提示 **「点击或 Enter 进入」**，强调鼠标可用。
- **威胁模型**：禁止前端拼接用户输入或外部数据作为「可跳转 path」。若未来支持「自定义 URL」或deeplink，必须 **后端校验** 或与 **registry 白名单求交**；否则存在未授权页面访问与开放重定向风险。

## 组件索引

| 组件 | 路径 |
|------|------|
| `AdminButton` | `frontend/src/components/admin/AdminButton.tsx` |
| `AdminSelect` | `frontend/src/components/admin/AdminSelect.tsx` |
| `AdminToolbar` | `frontend/src/components/admin/AdminToolbar.tsx` |

### `AdminButton`

```tsx
import { AdminButton } from "@/components/admin/AdminButton";

<AdminButton tone="primary" type="button">查询</AdminButton>
<AdminButton tone="secondary">取消</AdminButton>
<AdminButton tone="ghost" size="sm">次要</AdminButton>
<AdminButton tone="destructive">删除</AdminButton>
```

其余 props 透传底层 `Button`（`disabled`、`className`、`asChild` 等）。

### `AdminSelect`

```tsx
import { AdminSelect } from "@/components/admin/AdminSelect";

<AdminSelect value={v} onChange={(e) => setV(e.target.value)}>
  <option value="a">A</option>
</AdminSelect>
```

用于筛选条等原生下拉；需要 Combobox 时另选组件。

## 与 Twin 壳体关系

Twin 为全屏业务视图（如动物房等），布局与 z-index 栈独立演进。共享 token 可用于未来收敛，但 **不在首波** 强制修改 `TwinLayout`。
