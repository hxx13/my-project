# Ant Design Pro 思路对照（本栈为 Tailwind + shadcn，不引入整套 Ant）

可执行清单：

1. **ProLayout**：顶栏 + 侧栏 + 内容区 — 对应 `AdminLayout`；小屏侧栏抽屉化。
2. **菜单与权限同源**：侧栏、`buildAdminNavModel`、`AdminCommandPalette` 使用同一 registry + `PublicPagePermissionNode`。
3. **PageHeader 信息密度**：标题一行、说明一行；操作进 `AdminToolbarActions`。
4. **错误边界**：列表用 `AdminTableShell` 的 `loading` / `error` / `empty` 三态，避免白屏。
5. **敏感操作**：危险操作保留 `confirm`，文案写清后果（不可恢复等）。
