# CLAUDE.md

<!--
  会话启动时自动注入 AI 上下文。
-->

## ⚠️ 硬性规则：首次响应必须是菜单

**无论用户第一句话说什么，AI 的首次响应必须：**

1. 读 `docs/superpowers/handoff/MANIFEST.json` → 有 active 任务则展示接手选项
2. 读 `docs/superpowers/ai-secretary.md` → 按 `@menu` 区块展示工作流菜单
3. 菜单之后，再处理用户说的话

**唯一的例外**：如果用户在首条消息中明确说了要做什么（如"修bug: 弹窗关不掉"），则直接归类到对应工作流并开始，跳过菜单。

## 📁 项目概要

- Java Spring Boot + React TypeScript 全栈应用，基于芋道 ruoyi-vue-pro
- 前端: React + TypeScript + Tailwind CSS 3 + Radix UI + Vite
- 后端: Spring Boot + MyBatis + MySQL

## 🔗 关键文档

| 用途 | 路径 |
|------|------|
| **工作流定义（必读）** | `docs/superpowers/ai-secretary.md` |
| 手交任务 | `docs/superpowers/handoff/` |
| 设计资源目录 | `docs/superpowers/specs/previews/design-catalog.md` |
| 当前设计系统 | 🍱 Bento `.claude/skills/bento/` |
| 架构规范 | `docs/架构设计规范.md` |
| 后端规范 | `docs/后端架构规范.md` |
| 前端规范 | `docs/前端Web架构规范.md` |
| UI设计标准 | `docs/UI设计规范与主题标准.md` |

## 🎨 设计系统 — 硬性执行规则

<!-- ⚠️ 此章节优先级最高。任何 UI 编码工作开始前必须先过这一关。 -->

### 🛑 强制触发条件

**当以下任一情况发生时，AI 必须先读设计文档再动手——不准跳过，不准假设，不准"我记得"：**

- 创建或修改任何 `.tsx` / `.jsx` / `.css` / `.scss` 文件
- 添加或修改任何 HTML/JSX 元素的 `className`、`style`、颜色、间距、圆角、阴影、z-index
- 使用 GSAP / framer-motion / 任何动画库
- 创建或修改任何 UI 组件（Button/Dialog/Table/Card/Popover/Modal 等）

### 📖 强制阅读顺序（不可跳过）

**AI 在写第一行 UI 代码前，必须按顺序读完以下文件：**

```
① docs/UI设计规范与主题标准.md        ← 令牌体系（54色、间距、圆角、阴影、z-index、Bento 布局）
② docs/UI令牌实施调教指南.md          ← Tailwind 桥接、语义类名映射、主题注册表
③ .claude/skills/bento/SKILL.md      ← 当前设计系统 AI 指令（如有）
④ .claude/skills/bento/DESIGN.md     ← 当前设计系统令牌表（如有）
```

**完成阅读后 AI 必须输出确认语**：
> "已读取 UI 设计规范 v1.7 + Bento 设计系统。当前配色：暖桃色 Peach #FAD4C0 + 钢蓝 Steel #80A1C1。所有颜色将通过 --app-color-* 语义令牌引用。"

### ❌ 绝对禁止（违反即错误）

| 禁止行为 | 正确做法 |
|---------|---------|
| `bg-[#09090b]` / `bg-white` / `text-slate-800` 等硬编码颜色 | `bg-[var(--app-color-surface-page)]` / `text-[var(--app-color-text-primary)]` |
| `z-50` / `z-40` 等裸 z-index | `z-[var(--z-dropdown)]` (=200) / `z-[var(--z-modal)]` (=800) |
| `--smartsheet-*` / `--mycomponent-*` 等独立变量体系 | 组件令牌 `--<name>-<prop>` 引用 `var(--app-color-*)` |
| `rounded-[8px]` / `p-[12px]` 等硬编码像素 | `rounded-[var(--app-radius-container)]` / `p-[var(--app-space-container-padding)]` |
| 不读设计文档直接写 UI 代码 | 先执行上方"强制阅读顺序" |
| 暗色主题用自己的值 | 必须对齐 `docs/UI设计规范与主题标准.md` §4.6 暗色映射 |

### 🔍 自我审查（代码写完后，提交前）

AI 必须对自己的 UI 代码执行 Grep 自查：

```bash
# 检查硬编码颜色
grep -rn 'bg-\[#' frontend/src/   # 应无结果
grep -rn 'bg-white\|bg-slate\|bg-gray\|bg-zinc' frontend/src/  # 应无结果
# 检查裸 z-index
grep -rn 'z-\[[0-9]' frontend/src/  # 应有 var(--z-*) 而非裸数字
# 检查独立变量体系
grep -rn '\-\-[a-z]+-' frontend/src/styles/  # 应为 --app-* 或 --<component>-*
```

**自查不通过 → 不准提交 → 先修复违规。**

## ⚙️ 项目约定

- 新功能遵循 `docs/架构设计规范.md` 的 Spec 模板
- 数据库变更必须写 SQL 迁移文件
- 文档不写大段代码，聚焦架构决策和接口契约
- 部署/运维需用户确认，不擅自杀进程
- 文档/文案必须调用 humanizer skill
- UI 代码禁止硬编码颜色，全部通过 --app-color-* 令牌引用
