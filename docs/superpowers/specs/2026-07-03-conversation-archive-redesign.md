# conversation-archive 页面重设计

**日期**：2026-07-03
**类型**：UI 重设计
**参考页面**：`/console/admin/staff-messages`

## 目标

为 `/console/admin/conversation-archive` 页面的左侧用户列表和右侧对话视图应用 Bento 设计系统，提升视觉层次和用户体验。

## 现状

- 页面已正确使用 `--app-color-*` Bento 令牌
- 缺乏视觉层次：左右面板无容器包裹，无深度感
- 聊天气泡功能完整但设计粗糙

## 设计策略

将 staff-messages 的 `--twin-*` 设计模式映射到 Bento `--app-color-*` 令牌体系：

| 设计元素 | staff-messages | conversation-archive |
|---------|---------------|---------------------|
| 页面背景 | `twin-canvas-soft` | `app-color-surface-page` |
| 面板容器 | `twin-canvas` + `rounded-twin-xl` + `shadow-twin-level-1` | `app-color-surface-container` + `app-radius-container` + `app-shadow-card` |
| 面板边框 | `twin-hairline` | `app-color-border-default` |
| 选中行 | `border-violet-200 bg-violet-50` | `app-color-accent/10` + `border-l-accent`（已有） |
| 搜索框 | 裸 input | `app-color-surface-raised` elevated |

## 布局结构

```
AdminPageShell
├── 标题 + 操作按钮区（已有）
├── 批量进度条（已有，保留）
└── 左右两栏 (flex-row, gap-3)
    ├── 左面板 320px（card 容器）
    │   ├── 搜索框 + 全选
    │   └── 用户列表（scrollable）
    └── 右面板 flex-1（card 容器）
        ├── 会话元数据栏
        ├── 聊天气泡列表（scrollable）
        └── 底部操作栏
```

## 关键变更

1. **页面基底**：添加 `bg-[var(--app-color-surface-page)]` padding
2. **左右面板**：各包裹在 `rounded-[var(--app-radius-container)] border shadow` card 中
3. **面板间距**：`gap-3` 替代紧贴的 `border-r` 分隔
4. **搜索框**：elevated surface 风格
5. **空态/加载态/错误态**：在 card 容器内居中
6. **聊天气泡**：保持在 card 内 `max-w-3xl mx-auto`，微调间距

## 不变内容

- 所有业务逻辑、状态管理、API 调用
- AdminPageShell 外壳
- 批量进度条
- UserRow / ChatBubble 子组件结构和交互
- 颜色令牌体系（已是 `--app-color-*`）
