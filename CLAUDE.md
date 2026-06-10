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
- 前端: React + TypeScript + Tailwind CSS + shadcn/ui
- 后端: Spring Boot + MyBatis + MySQL

## 🔗 关键文档

| 用途 | 路径 |
|------|------|
| **工作流定义（必读）** | `docs/superpowers/ai-secretary.md` |
| 手交任务 | `docs/superpowers/handoff/` |
| 架构规范 | `docs/架构设计规范.md` |
| 后端规范 | `docs/后端架构规范.md` |
| 前端规范 | `docs/前端Web架构规范.md` |
| UI设计标准 | `docs/UI设计规范与主题标准.md` |

## ⚙️ 项目约定

- 新功能遵循 `docs/架构设计规范.md` 的 Spec 模板
- 数据库变更必须写 SQL 迁移文件
- 文档不写大段代码，聚焦架构决策和接口契约
- 部署/运维需用户确认，不擅自杀进程
- 文档/文案必须调用 humanizer skill
