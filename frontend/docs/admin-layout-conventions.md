# 管理端布局约定（Admin + Debug）

与 `.cursor/rules/post-save-no-full-refresh.mdc` 一致：列表页**保存成功后仅合并当前行**，禁止为单条保存整表 `load()`。

## 工具栏（Fluent 命令栏轻量版）

- 使用 `AdminToolbar` / `AdminToolbarPrimary` / `AdminToolbarActions`（`frontend/src/components/admin/AdminToolbar.tsx`）。
- 主按钮组：`inline-flex flex-wrap`，按钮默认 **`w-auto`**，避免无理由 `w-full`（移动端单列意图除外）。
- 主筛选区放在 `AdminToolbarPrimary`：`min-w-0 flex-1 basis-[min(100%,20rem)]`，长标签 `truncate` + `title`。
- 间距由 `index.css` 的 `--admin-toolbar-gap`、`--admin-toolbar-row-gap`、`--admin-control-height` 控制。

## 表格与滚动

- 表格外层使用 `.admin-table-shell-inner`（见 `index.css`）；容器 `min-w-0`，横向滚动留在表格外壳内。

## 侧栏「常用 / 收藏」

- 在所有业务分组**上方**插入 `常用`（最近访问 LRU，与命令面板一致）与 `收藏`（星标路径）；条目仍受权限过滤，仅展示当前账号侧栏中已有入口。
- 有内容时默认展开；琥珀色描边与 `History` / `Star` 分组图标与业务分组区分。

## 分组角标

- 每个分组标题右侧：**入口数量**（浅底圆角数字）；若有待办类子项角标，则额外显示**汇总数字**（玫瑰红，与单条 `NavPendingBadge` 规则一致：纯数字相加，否则每条计 1）。

## z-index（避免与命令面板冲突）

- **命令面板** overlay `1300`、content `1301`（`CommandDialog` / `frontend/src/components/ui/command.tsx`）。
- **移动侧栏抽屉** overlay `199`、content `200`（`DialogContent` `variant="leftSheet"`）。
- 业务弹层若需高于表格内层，建议 **不超过 1250**；确需更高时须评估与命令面板的叠放并同步文档与本段。

## 侧栏响应式

- `md` 及以上：固定侧栏 + 顶栏「收起侧栏」。
- `md` 以下：侧栏收入 **左侧抽屉**（`AdminLayout`），顶栏 **菜单** 打开；导航跳转后自动关闭抽屉。

## 断点与主内容宽度

| 断点 | 典型用途 |
|------|-----------|
| 默认（&lt; `sm`） | 顶栏元素可换行；工具栏主按钮组 `w-full` / `flex-col` 意图允许 |
| `sm` | 工具栏开始横向收紧；搜索框 `max-w-md` 等 |
| `md` | 固定侧栏出现；顶栏 `h-16` `flex-nowrap` |
| `lg` | 宽表格仍须 `min-w-0` + 表格外壳横向滚动 |

**主内容**：`section` / `main` 使用 `min-w-0`，避免 flex 子项把表格挤出视口导致布局崩坏。

## 触控目标

- 参考 [`nn-group-enterprise-ux-checklist.md`](./nn-group-enterprise-ux-checklist.md)：重要可点击控件建议 **约 40～44px** 最小命中区（`min-h-[44px]` 或等价 padding）。
- 侧栏链接、命令面板项在窄屏上仍应保持足够 `py` 与可点区域。

## 角标数据源同步（检查清单）

侧栏单项 `NavPendingBadge`、分组汇总数字、命令面板若展示角标/待办时，须基于 **同一套** `fetchPendingBadges`（或等价 pending API）结果推导。

修改角标逻辑时的自检：

1. `AdminLayout` 内 `pendingBadges` → `buildAdminNavModel` 注入条目 `badgeText`。
2. 分组标题右侧汇总与 `sidebarGroupPendingTotal` 规则一致（纯数字相加，否则每条计 1）。
3. 若命令面板增加角标展示，使用 **同一 model** 字段，避免第二份客户端拼装逻辑分叉。

详见 [`admin-ui-design-system.md`](./admin-ui-design-system.md) 命令面板安全节。

## 页头结构

- 内容区第一块可为工具栏；若使用 `AdminPageShell`，将 `actions` 与 `AdminToolbarActions` 语义对齐即可。
