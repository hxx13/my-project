# CLAUDE.md

<!--
  会话启动时自动注入 AI 上下文。
-->

## ⚠️ 硬性规则：首次响应必须是菜单

**无论用户第一句话说什么，AI 的首次响应必须：**

1. 读 `docs/05-任务交接/MANIFEST.json` → 有 active 任务则展示接手选项
2. 读 `docs/08-AI秘书台/ai-secretary.md` → 按 `@menu` 区块展示工作流菜单
3. 菜单之后，再处理用户说的话

**唯一的例外**：如果用户在首条消息中明确说了要做什么（如"修bug: 弹窗关不掉"），则直接归类到对应工作流并开始，跳过菜单。

## 🔗 核心原则：前后端不分家

**这是一个全栈项目。新功能开发默认前后端并行，Superpowers 技能全部是双端通用的。**

- 用户说"加功能"→ AI 同时派前端 agent + 后端 agent，并行推进
- 用户明确说"只做前端/后端"→ 尊重意图，单独处理
- 后端工作流 ④⑩⑪ 已完备，前端工作流 ③ 已完备，① 是全栈默认入口
- 详细调度规则见 `docs/08-AI秘书台/ai-secretary.md` § 前后端联动原则

## 📁 项目概要

- Java Spring Boot + React TypeScript 全栈应用，基于芋道 ruoyi-vue-pro
- 前端: React + TypeScript + Tailwind CSS 3 + Radix UI + Vite
- 后端: Spring Boot 3.5 + MyBatis + MySQL 8.0 + JDK 17

## 🔗 关键文档

| 用途 | 路径 |
|------|------|
| **工作流定义（必读）** | `docs/08-AI秘书台/ai-secretary.md` |
| 手交任务 | `docs/05-任务交接/` |
| 设计资源目录 | `docs/02-设计存档/design-catalog.md` |
| 当前设计系统 | 🍱 Bento `.claude/skills/bento/` |
| 设计品质系统 | 🎯 Impeccable `~/.claude/skills/impeccable/`（全局） |
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
⑤ ~/.claude/skills/impeccable/SKILL.md   ← 设计品质规则（对比度、排版、布局、动效、反模式）
⑥ ~/.claude/skills/impeccable/reference/product.md  ← 产品 UI 品质标准（本项目的 register）
```

**完成后 AI 必须运行 Impeccable 会话初始化**（每个会话一次）：
```bash
node ~/.claude/skills/impeccable/scripts/context.mjs --target frontend/src/
```
如输出 `NO_PRODUCT_MD` 则忽略（已有 Bento 设计系统，无需重复 init）。

**完成阅读后 AI 必须输出确认语**：
> "已读取 UI 设计规范 v1.7 + Bento 设计系统 + Impeccable 设计品质 v3.9。当前配色：Warm Peach #d97706 + Cream #FFFBF5（后台 Bento Warm 与学生端已统一），light/dark 双模。所有页面通过 --student-canvas / --student-surface / --student-surface-raised 三层表面深度构建视觉层次。所有颜色通过 --app-color-* / --student-* 语义令牌引用。Impeccable 品质规则（对比度 ≥4.5:1、行宽 65-75ch、语义 z-index、prefers-reduced-motion）将在本次会话中自动执行。"

### ❌ 绝对禁止（违反即错误）

| 禁止行为 | 正确做法 |
|---------|---------|
| `bg-[#09090b]` / `bg-white` / `text-slate-800` 等硬编码颜色 | `bg-[var(--app-color-surface-page)]` / `text-[var(--app-color-text-primary)]` |
| `z-50` / `z-40` 等裸 z-index | `z-[var(--z-dropdown)]` (=200) / `z-[var(--z-modal)]` (=800) |
| `--smartsheet-*` / `--mycomponent-*` 等独立变量体系 | 组件令牌 `--<name>-<prop>` 引用 `var(--app-color-*)` |
| `rounded-[8px]` / `p-[12px]` 等硬编码像素 | `rounded-[var(--app-radius-container)]` / `p-[var(--app-space-container-padding)]` |
| 不读设计文档直接写 UI 代码 | 先执行上方"强制阅读顺序" |
| 暗色主题用自己的值 | 必须对齐 `docs/UI设计规范与主题标准.md` §4.6 暗色映射 |

### 🎯 Impeccable 设计品质 — 硬性执行规则

**Impeccable 与 Bento 分工**：Bento 管"用什么令牌"，Impeccable 管"做的够不够好"。以下品质规则每次 UI 编码自动执行，不准跳过。

#### 对比度（最高优先级）

- 正文 vs 背景 ≥ **4.5:1**；大号文字（≥18px 或 bold ≥14px）≥ **3:1**
- placeholder 文字同样需要 4.5:1，不能用默认灰色
- 灰色文字放有色背景上会显脏 → 用背景色相更深色阶的值，或文字色的透明度

#### 排版

- 正文行宽上限 **65-75ch**；数据/表格可放宽至 120ch
- 非衬线 + 非衬线配对必须选对比轴（几何 vs 人文/怪诞），同类外观的两种非衬线禁止配对
- Hero/展示标题 `clamp()` max ≤ **6rem**；letter-spacing ≥ **-0.04em**
- h1-h3 用 `text-wrap: balance`；长文用 `text-wrap: pretty`
- 产品 UI 一套非衬线字体通常就够，不需要 display/body 配对
- 固定 rem 阶梯（产品 UI），非流体；步进比 1.125-1.2

#### 布局

- **卡片不是默认方案**。能用列表/分组/分割区域就不用卡片。嵌套卡片永远错误
- 1D 用 flexbox，2D 用 Grid。不要默认 Grid 当 `flex-wrap` 更简单的时候
- 无断点响应式 Grid：`repeat(auto-fit, minmax(280px, 1fr))`
- 间距要有节奏变化，不均匀等距
- 语义 z-index 阶梯：dropdown → sticky → modal-backdrop → modal → toast → tooltip。永远不要 999/9999

#### 动效

- 动效必须有意图，不是事后点缀
- 不动画 CSS 布局属性（width/height/top/left）除非确有必要
- 缓出用指数曲线（ease-out-quart/quint/expo），不用 bounce/elastic
- **`prefers-reduced-motion: reduce` 不可跳过**：动画降级为 crossfade 或即时过渡
- 列表交错动画是合法的；禁止的是"每个 section 用完全相同的入场动画"
- 入场动画不能成为内容可见性的门控：默认状态内容必须立即可见
- 产品 UI 过渡 150-250ms，动效传达状态变化（hover/focus/active/loading），非装饰
- 禁止全页载入编排动画（产品 UI 用户不需要看页面"演"出来）

#### 产品 UI 组件强制状态覆盖

每个交互组件必须有完整七态：**default / hover / focus / active / disabled / loading / error**

- 加载态用 **skeleton**，不是居中 spinner
- 空态要教用户怎么用，不是"暂无数据"
- 同一产品内保持一致 affordance：同样的按钮形态、同样的表单控件词汇、同样的图标风格
- 不要为了"风格"重造标准控件（自定义滚动条、怪异表单、非标准弹窗）

### ❌ Impeccable 绝对禁止（反模式）

**以下任何一项出现 → 直接判定不合格 → 重写：**

| 反模式 | 说明 |
|--------|------|
| **侧边竖线装饰** | `border-left/right > 1px` 作为卡片/列表的彩色强调线 |
| **渐变文字** | `background-clip: text` + 渐变背景 |
| **玻璃态默认** | 毛玻璃/blur 卡片做默认装饰 |
| **hero-metric 模板** | 大数字 + 小标签 + 辅助数据 + 渐变强调 |
| **千篇一律卡片网格** | 相同尺寸卡片（图标 + 标题 + 文字）无限重复 |
| **每段都加眉标** | 小字号全大写 tracking-wide "ABOUT / PROCESS / PRICING" 挂在每个标题上方 |
| **01/02/03 编号段** | 每个 section 前面都标序号——只有真正的有序流程/步骤才配序号 |
| **文字溢出容器** | 长标题 + 大 clamp + 窄 Grid = 平板/手机溢出。每个断点都要测 |

### 🧪 AI Slop 检测（写完后必须自问）

1. **一阶检测**：仅凭"这是什么品类"就能猜到配色/主题？→ 重做场景句和色彩策略
2. **二阶检测**：品类 + "不是XX风格"就能猜到审美家族？→ 第一层避开了，第二层没避开，重做到两层都不显然

**检测通过标准**：用户看到这个界面时，无法毫不犹豫地说"这是 AI 做的"。

### 🔍 自我审查（代码写完后，提交前）

AI 必须对自己的 UI 代码执行双重审查：

**第一轮：Bento 令牌合规（Grep 自动化）**

```bash
# 检查硬编码颜色
grep -rn 'bg-\[#' frontend/src/   # 应无结果
grep -rn 'bg-white\|bg-slate\|bg-gray\|bg-zinc' frontend/src/  # 应无结果
# 检查裸 z-index
grep -rn 'z-\[[0-9]' frontend/src/  # 应有 var(--z-*) 而非裸数字
# 检查独立变量体系
grep -rn '\-\-[a-z]+-' frontend/src/styles/  # 应为 --app-* 或 --<component>-*
```

**第二轮：Impeccable 品质目视（人工逐项确认）**

- [ ] 正文对比度 ≥4.5:1？placeholder 不暗于正文色？
- [ ] 正文行宽 ≤75ch？数据/表格行宽合理？
- [ ] 组件七态完整（default/hover/focus/active/disabled/loading/error）？
- [ ] 加载态用 skeleton 而非居中 spinner？空态有引导文字？
- [ ] 无侧边竖线装饰？无渐变文字？无玻璃态默认？无眉标泛滥？无 01/02/03 编号段？
- [ ] 动效有 `prefers-reduced-motion: reduce` 降级方案？
- [ ] 无硬编码 `z-index: 999/9999`？z-index 来自语义阶梯？
- [ ] 一阶 AI slop 检测通过？二阶也通过？

**任一审查不通过 → 不准提交 → 先修复违规。**

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
- UI 编码自动执行 Impeccable 设计品质规则（对比度/排版/布局/动效/反模式），无需手动调用 /impeccable
- Impeccable 子命令（/audit /polish /critique /bolder /quieter /live 等）仍需手动调用
