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

## 🔗 核心原则：前后端不分家

**这是一个全栈项目。新功能开发默认前后端并行，Superpowers 技能全部是双端通用的。**

- 用户说"加功能"→ AI 同时派前端 agent + 后端 agent，并行推进
- 用户明确说"只做前端/后端"→ 尊重意图，单独处理
- 后端工作流 ④⑩⑪ 已完备，前端工作流 ③ 已完备，① 是全栈默认入口
- 详细调度规则见 `docs/superpowers/ai-secretary.md` § 前后端联动原则

## 📁 项目概要

- Java Spring Boot + React TypeScript 全栈应用，基于芋道 ruoyi-vue-pro
- 前端: React + TypeScript + Tailwind CSS 3 + Radix UI + Vite
- 后端: Spring Boot 3.5 + MyBatis + MySQL 8.0 + JDK 17

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

## ☕ 后端开发 — 硬性执行规则

<!-- ⚠️ 此章节优先级最高。任何后端 Java 编码工作开始前必须先过这一关。 -->

### 🛑 强制触发条件

**当以下任一情况发生时，AI 必须先读后端规范文档再动手：**

- 创建或修改任何 `.java` 文件
- 创建或修改 MyBatis Mapper XML 文件
- 创建或修改 SQL 迁移文件
- 涉及 Controller / Service / Mapper / Entity / DTO 任何一层

### 📖 强制阅读顺序（不可跳过）

**AI 在写第一行后端代码前，必须按顺序读完：**

```
① docs/后端架构规范.md                 ← 技术栈/包结构/模块约定/编码模式
② common/exception/ErrorCodeConstants.java  ← 已有错误码，新错误码在此定义
③ 目标模块的已有代码（至少读 Controller + Service + Mapper 各一份）
```

**完成阅读后 AI 必须输出确认语**：
> "已读取后端架构规范。技术栈 Spring Boot 3.5 + MyBatis + MySQL。模块结构 controller/service/mapper/entity/dto。返回 Result<T> 统一包装。异常 throw TwinBusinessException。SQL 参数用 #{} 绑定。"

### ❌ 绝对禁止（违反即错误）

| 禁止行为 | 正确做法 |
|---------|---------|
| SQL 用 `${}` 拼接字符串 | `#{}` 参数绑定（防 SQL 注入） |
| Controller 方法不校验权限 | 调用 `authContextService.getCurrentUserRole()` |
| Service 吞异常不抛出 | `throw new TwinBusinessException(ErrorCodeConstants.XXX)` |
| 返回裸对象不包装 | `Result.success(data)` / `Result.error(code, msg)` |
| 硬编码错误码数字 | 引用 `ErrorCodeConstants` 常量 |
| 请求 DTO 不加校验注解 | `@NotNull` / `@NotBlank` / `@Valid` |
| 新增数据库表不写 SQL 迁移文件 | 在 `common/schema/` 下创建 `V{timestamp}__{描述}.sql` |
| 不读后端规范直接写代码 | 先执行上方"强制阅读顺序" |

### 🔍 自我审查（代码写完后，提交前）

```bash
# 检查 SQL 注入风险
grep -rn '\${' src/main/resources/mapper/   # 应无结果（全部用 #{}）
# 检查硬编码错误码
grep -rn 'throw new TwinBusinessException([0-9]' src/main/java/  # 应有 ErrorCodeConstants 常量
```

## ⚙️ 项目约定

- 新功能遵循 `docs/架构设计规范.md` 的 Spec 模板
- 数据库变更必须写 SQL 迁移文件（`common/schema/V{timestamp}__{描述}.sql`）
- 文档不写大段代码，聚焦架构决策和接口契约
- 部署/运维需用户确认，不擅自杀进程
- 文档/文案必须调用 humanizer skill
- UI 代码禁止硬编码颜色，全部通过 --app-color-* 令牌引用
