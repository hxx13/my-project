# TwinSystem UI 设计规范与主题标准

> **定位**：定义 TwinSystem 全站统一的设计令牌体系、主题架构、组件消费模式。本文档是 UI 层的元规范——所有页面、组件、主题的视觉实现必须以本文档为准。
>
> **适用范围**：管理后台 Web 端 + 学生端 Web 端。小程序端参考本文档精神，但受原生框架限制需适配实现。
>
> **设计日期**：2026-06-09
>
> **版本**：v1.6（新增级联下拉菜单规范 §6.3a + Bento 设计系统）
>
> **外部设计系统**：🍱 [Bento](https://typeui.sh/design-skills/bento) — SKILL.md + DESIGN.md 位于 `.claude/skills/bento/`
> **实验落地模块**：知识库（`/admin/knowledge`），验证通过后推广至全站。

---

## 一、核心设计原则

> 四条铁律。所有令牌架构、组件规范、主题设计的决策均以它们为判据。违反任何一条即视为设计缺陷。

### 原则一：令牌是唯一的真相源（Single Source of Truth）

任何颜色、间距、圆角、阴影、动效时长，**禁止**以硬编码形式出现在组件或页面代码中。必须通过设计令牌引用。

```
❌ 违规：
  <div className="bg-[#f5f5f5] text-[#171717] rounded-[8px]">

✅ 正确：
  <div className="bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] rounded-[var(--app-radius-container)]">
```

### 原则二：组件之间零样式耦合（Component Style Isolation）

组件令牌只依赖语义令牌层，**禁止**跨组件引用。

```
❌ 违规：
  --dialog-bg: var(--card-bg);   ← 对话框组件引用卡片组件的令牌

✅ 正确：
  --dialog-bg: var(--app-color-surface-elevated);   ← 两个组件各自独立引用语义层
  --card-bg:   var(--app-color-surface-elevated);
```

**意图**：修改卡片背景色不应炸掉对话框；修改对话框背景色不应影响卡片。组件之间通过共享的语义令牌层"相遇"，但彼此不直接耦合。

### 原则三：主题是语义令牌的排列组合（Theme = Semantic Mapping）

主题不创造新令牌，不修改组件。主题只做一件事：**修改语义令牌 → 基础令牌的映射关系**。

```
主题 ≠ 给组件加 if-else
主题 = 改一份映射表
```

组件永远只消费 `--app-color-surface-page`，不关心它今天被映射到白色还是深灰。

### 原则四：令牌分层，依赖单向流动（Unidirectional Token Flow）

```
组件令牌 ──→ 语义令牌 ──→ 基础令牌
    │              │             │
    └──── 可以引用 ─┘             │
         └────────── 可以引用 ────┘

    ← 禁止反向依赖 ←
```

| 层级 | 职责 | 谁知道谁 |
|------|------|---------|
| 基础令牌 | 定义具体值（色值、像素、毫秒） | 不知道自己被谁用 |
| 语义令牌 | 表达设计意图（"页面底色"、"主交互色"） | 知道基础令牌，不知道组件 |
| 组件令牌 | 组件可配置接口 | 知道语义令牌，不知道其他组件 |

### 原则五：容器嵌套可验证（Container Nestability）

**任何布局代码写完必须验证**：每一级容器的高度/宽度是否由父级正确传递，子级内容是否能正确填充而不溢出或塌陷。

验证清单（写完后逐条过）：

```
□ 最外层容器高度是否由父级提供？（避免硬编码 calc，优先用 h-full / flex-1）
□ 每一层的 flex 方向是否正确？（flex-col 用于垂直层叠，flex 用于水平排列）
□ 滚动发生在正确层级？（需要滚动的内容区域有 overflow-y-auto，容器本身不重复设滚动）
□ 高度传递链是否完整？
    父级(h-full/flex-1) → 子级(flex-1 min-h-0) → 孙子(flex-1 overflow-y-auto)
□ 是否有重复的高度声明？（例如外层 h-[calc(100vh-X)] 内层又设了 h-[calc(100vh-X)]）
```

```
❌ 违规（双层高度，内层未扣除 TabBar）：
  <div className="h-[calc(100vh-6.5rem)]">          ← 外层
    <TabBar className="h-9" />
    <Layout className="h-[calc(100vh-6.5rem)]" />   ← 内层同样高度，超出
  </div>

✅ 正确：
  <div className="h-full flex flex-col">
    <TabBar className="h-9 shrink-0" />
    <div className="flex-1 min-h-0">
      <Layout className="h-full" />
    </div>
  </div>
```

### 原则六：内容自适应策略（Content-Adaptive Display）

内容区域**禁止**无条件使用 `mx-auto max-w-*` 造成的左右大量留白。按内容类型决定显示策略：

| 内容类型 | 显示策略 | 实现 |
|----------|---------|------|
| 文档正文（prose） | 居中但宽幅，留白合理 | `max-w-[75ch] mx-auto` 或去掉 max-w 依赖父级 padding |
| 仪表盘卡片网格 | 填充满可用宽度 | 无 max-w，grid 自适配列数 |
| 数据表格/代码块 | 填充满可用宽度 | 无 max-w，横向溢出则 scroll |
| 知识图谱 | 全屏填满 | `h-full w-full`，画布自适应 |

```
❌ 违规：
  <main>
    <div className="mx-auto max-w-[900px] px-8">   ← 1400px 屏幕两侧各 250px 空白
      {content}
    </div>
  </main>

✅ 正确：
  <main className="overflow-y-auto">
    <div className="p-6">                           ← 用 padding 提供呼吸感
      {content}
    </div>
  </main>
```

### 原则七：先滚动再缩小（Scroll Before Shrink）

当内容超出容器时：**优先滚动**。只有当内容必须一览无余时才采用缩小策略（如仪表盘统计卡片可 `min-w-0` 截断文字）。

| 场景 | 策略 | 理由 |
|------|------|------|
| 文档正文 | 滚动 | 阅读流自然向下延伸 |
| 代码块 | 横向滚动 | 代码换行破坏可读性 |
| 表格 | 横向滚动 | 列数不定，缩小不可读 |
| 仪表盘卡片 | 缩小（文字截断） | 卡片网格需要整体一览 |
| 目录树 | 滚动 | 节点数不定 |

### 原则八：双模滚动体系（Dual Scroll Modes）

全站采用两种滚动模式，按页面类型选择。模式选择是**页面级架构决策**，一旦选定，该页面所有子组件统一遵循。

#### 模式 A：容器内滚动（Container-Internal Scroll）

**识别特征**：页面高度固定（`h-full`），每个独立面板各自滚动（`overflow-y-auto`），顶栏/底栏固定不动。

```
┌──────────────────────────────────────────┐
│ 顶栏 (shrink-0, 固定)                     │
├────────┬─────────────────────┬───────────┤
│ 面板A   │     面板B            │  面板C     │
│ overflow│     overflow        │  overflow  │
│ -y-auto │     -y-auto         │  -y-auto   │
│         │                     │            │
│         │                     │            │
├────────┴─────────────────────┴───────────┤
│ 状态栏 (shrink-0, 固定)                    │
└──────────────────────────────────────────┘
      ↑ 浏览器不滚动，各面板内部独立滚动
```

**CSS 骨架**：
```css
/* 页面根 */
.page-shell { height: 100%; display: flex; flex-direction: column; }
/* 顶栏/底栏 */
.page-shell > .shell-top,
.page-shell > .shell-bottom { flex-shrink: 0; }
/* 中间区域 */
.page-shell > .shell-body { flex: 1; min-height: 0; }
/* 内部各面板 */
.shell-body > .panel { overflow-y: auto; }
```

**适用场景**：
- 需要固定导航/工具栏始终可见（如编辑器、文档浏览器）
- 多面板并排且各自内容独立（如三栏布局）
- 高度受限的密集型界面

**Tailwind 模板**：
```
页面根:    h-full flex flex-col
顶栏:      shrink-0
中间区:    flex-1 min-h-0 flex
面板:      flex-1 overflow-y-auto
底栏:      shrink-0
```

#### 模式 B：原生页面滚动（Native Page Scroll）

**识别特征**：页面无固定高度，内容自然流式排列，浏览器统一滚动。所有面板随页面一起滚动。

```
┌──────────────────────────────────────────┐
│ 顶栏                                      │ ← 随页面滚动消失
├──────────────────────────────────────────┤
│ 面板A (自然高度)                           │
│ 面板B (自然高度)                           │
│ 面板C (自然高度)                           │
│ ...                                      │
│                                          │ ← 浏览器滚动条
├──────────────────────────────────────────┤
│ 状态栏                                    │ ← 滚动到最底部才可见
└──────────────────────────────────────────┘
      ↑ 浏览器整体滚动，内容有多高就多高
```

**CSS 骨架**：
```css
/* 页面根 — 无高度约束 */
.page-shell { /* 不设 height，自然流 */ }
/* 所有面板 */
.panel { /* 不设 overflow，自然高度 */ }
```

**适用场景**：
- 长文档/文章阅读页
- 内容高度不可预测的列表页
- 不需要固定导航的展示型页面

#### 模式选择决策树

```
页面是否需要固定工具栏始终可见？
  ├── 是 → 模式 A（容器内滚动）
  └── 否 → 是否有多个需要独立滚动的面板？
            ├── 是 → 模式 A（容器内滚动）
            └── 否 → 模式 B（原生页面滚动）
```

#### StatusBar 兼容

| 模式 | StatusBar 行为 |
|------|---------------|
| A | `shrink-0` 固定在底部，始终可见 |
| B | 自然流位于内容末尾，滚动到底才见 |

StatusBar 组件本身**不感知**所处模式——它只是一个 `h-5 shrink-0` 的 div。父级容器决定它的定位方式。

#### AdminFullWidthPage：抵消 AdminLayout 默认 padding

`AdminLayout` 对所有管理页面添加 `p-6 sm:p-8` 提供标准页面留白。这对表单/设置页面合适，但对多栏布局、仪表盘、宽表格等页面造成不必要的水平空间浪费。

使用 `<AdminFullWidthPage>` 包裹页面内容以抵消该 padding：

```tsx
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";

export default function MyPage() {
  return (
    <AdminFullWidthPage>
      {/* 你的全宽内容 */}
    </AdminFullWidthPage>
  );
}
```

**实现原理**：`AdminFullWidthPage` 渲染一个 `-mx-6 sm:-mx-8` 的 div，通过负 margin 抵消父级 AdminLayout 的 padding。

**已应用页面**（截至 2026-06-10）：

| 页面 | 原因 |
|------|------|
| `AdminKnowledgeHomePage` | 三栏布局，需全宽 |
| `AdminHomePage` | 卡片网格仪表盘 |
| `AdminCageShelfPage` | 笼架网格 + 侧面板 |
| `AdminAnalyticsPage` | 统计图表仪表盘 |
| `AdminContentHubPage` | 内容卡片 + 原有 p-6 双层 padding |

**判断标准**：
```
页面是表单/设置/简单列表？→ 保持 AdminLayout 默认 padding
页面是多栏/仪表盘/宽表格/图表？→ 使用 AdminFullWidthPage
```

#### 解耦机制：CSS 变量替代硬编码

`AdminFullWidthPage` 的 margin 值**不硬编码**。父级 `AdminLayout` 通过 CSS 变量定义 padding，子级通过变量引用：

```css
/* 父级 AdminLayout wrapper（单点真理） */
.admin-page-content {
  --page-pad-x: 1.5rem;
}
@media (min-width: 640px) {
  .admin-page-content { --page-pad-x: 2rem; }
}

/* 子级全宽页面（引用变量，不硬编码值） */
.page-full-bleed {
  margin-left: calc(-1 * var(--page-pad-x));
  margin-right: calc(-1 * var(--page-pad-x));
}
```

修改变量值自动同步所有全宽页面。**禁止**在子组件中硬编码 `-mx-6 sm:-mx-8`——那是打补丁。

#### 架构护栏：高度链完整性（Height Chain Integrity）

包装组件渲染 DOM wrapper 时必须传递高度，否则 `h-full` 在包装层断裂：

```
❌ 违规：
  function Wrapper({ children }) {
    return <div>{children}</div>;  ← 纯 div，h-full 断链
  }
  // 后果：所有子组件的 h-full → height: auto → 独立滚动失效 → SVG 尺寸 0

✅ 正确：
  function Wrapper({ children, className }) {
    return <div className={className}>{children}</div>;
  }
  <Wrapper className="h-full"><Outlet /></Wrapper>
```

**高度链验证清单**（写完后逐层检查）：
```
□ 每一层 DOM wrapper 是否有 h-full / flex-1 / min-h-0？
□ PageTransition / AnimatePresence / Suspense 是否传递了高度？
□ 每一层 flex 容器是否加了 min-h-0？（flex 子项默认 min-height: auto 会撑破父级）
□ SVG 是否有 viewBox + ResizeObserver？（纯 CSS h-full 对 SVG 不可靠）
```

### 原则九：响应式宽度分级（Responsive Width Hierarchy）

**禁止一刀切的 `max-width`**。不同内容类型需要不同的宽度约束——文本需要窄行宽保证可读性，代码/表格需要宽度避免折行。

#### 分级体系

| 级别 | 约束 | 适用场景 | 实现 |
|------|------|---------|------|
| **T1 阅读** | `max-width: 72ch` | 段落、标题、列表、引用 | CSS 元素级约束 |
| **T2 内容** | `max-width: 1100px` | 代码块、表格、图片 | 撑满父级可用宽，不限 max-w |
| **T3 页面** | `max-width: 1200px` | 标准管理页（表单/设置） | AdminLayout 默认 padding |
| **T4 宽页** | `max-width: 1400px` | 仪表盘、卡片网格 | AdminFullWidthPage 包裹 |
| **T5 全宽** | 仅受 AdminLayout `1600px` 限制 | 三栏布局、图表、日志 | AdminFullWidthPage + 自然填充 |

#### 大屏 vs 小屏适配

```
屏幕 ≤ 1366px（笔记本）:
  T1 72ch ≈ 900px → 若父级 < 900px，自然收缩，不强制 min-w
  T2 代码/表格 → 撑满可用宽
  三栏布局 → AdminLayout 1600px 不会触发，内容自然填充

屏幕 1366-1920px（台式机）:
  T1 文本约束生效，行宽停留在 72ch
  T2 代码/表格继续扩展，利用额外宽度
  AdminLayout 居中，两侧留白增加

屏幕 ≥ 1920px（大屏/超宽）:
  AdminLayout max-w:1600px 居中 → 最大可用宽 1600px
  三栏中心栏最多 ~1100px（= 1600 - 260 左侧 - 240 右侧）
  文本仍 72ch（~900px），代码/表格可到 1100px
```

#### CSS 实现（知识库文档示例）

```css
/* 文本元素：约束到最佳阅读宽度 */
.docs-prose h1, .docs-prose h2, .docs-prose h3,
.docs-prose h4, .docs-prose p, .docs-prose li,
.docs-prose blockquote {
  max-width: 72ch;  /* ~900px at 15px font */
}

/* 代码/表格/图片：撑满父级 */
.docs-prose pre, .docs-prose table,
.docs-prose img, .docs-prose hr {
  max-width: none;
}
```

```
❌ 违规（一刀切）：
  .docs-prose { max-width: 900px; }     ← 代码块也被限制，折行或溢出

✅ 正确（分级）：
  .docs-prose p { max-width: 72ch; }    ← 只约束文本
  .docs-prose pre { max-width: none; }  ← 代码自由撑满
```

---

## 二、令牌分层架构

```
┌─────────────────────────────────────────────────────────┐
│               第三层：组件令牌 (Component Tokens)          │
│   --btn-primary-bg, --dialog-shadow, --table-row-hover  │
│   每个组件对外暴露的可变属性，引用下层令牌                  │
│   → 只有该组件的 CSS 在使用它                             │
├─────────────────────────────────────────────────────────┤
│               第二层：语义令牌 (Semantic Tokens)           │
│   --app-color-surface-page, --app-elevation-modal       │
│   表达设计意图："用在什么地方"，不表达"是什么值"           │
│   → 全站所有组件共享这一层                                │
├─────────────────────────────────────────────────────────┤
│               第一层：基础令牌 (Primitive Tokens)          │
│   --color-slate-100, --space-4, --radius-md            │
│   纯粹的原子值：色板/间距/字号/阴影档位的唯一定义处         │
│   → 改一次，全局生效                                      │
└─────────────────────────────────────────────────────────┘
```

### 2.1 命名规范

```
--{scope}-{category}-{property}-{variant}-{state}
```

| 位置 | 含义 | 示例 |
|------|------|------|
| `scope` | `app`（全局语义）/ 组件名 | `app`, `btn`, `dialog`, `table` |
| `category` | 分类标签 | `color`, `space`, `radius`, `elevation`, `font`, `motion` |
| `property` | 属性描述 | `surface`, `text`, `border`, `shadow`, `size` |
| `variant` | 变体/层级（可选） | `primary`, `secondary`, `page`, `container`, `xs`, `lg` |
| `state` | 交互状态（可选） | `hover`, `active`, `disabled`, `focus` |

**正确示例**：
```
--app-color-surface-page           ← 全局 · 颜色 · 表面 · 页面级
--app-elevation-shadow-modal       ← 全局 · 高度 · 阴影 · 模态框
--btn-color-bg-primary-hover       ← 按钮 · 颜色 · 背景 · 主按钮 · 悬停态
--dialog-radius                    ← 对话框 · 圆角
--table-font-size                  ← 表格 · 字号
```

---

## 三、基础令牌（Primitive Tokens）

> 所有具体值的唯一定义处。改一个值，全站生效。

### 3.1 色板

**54 色体系**：每个色系 11 档（50→950），覆盖亮暗双模。v1.5 新增 Bento 暖色系。

```
Gray 系 (slate)   : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
Accent 系 (blue)  : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
Warm 系 (warm)    : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950  ← 🍱 Bento surface
Peach 系 (peach)  : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950  ← 🍱 Bento primary
Steel 系 (steel)  : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950  ← 🍱 Bento secondary
Danger 系 (red)   : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
Warning 系(amber) : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
Success 系(green) : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
Info 系  (cyan)   : 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
```

CSS 定义（使用 oklch 色彩空间以保证感知均匀性）：

```css
:root {
  /* ── Gray (slate) ── */
  --color-slate-50:   oklch(0.985 0 0);
  --color-slate-100:  oklch(0.97 0 0);
  --color-slate-200:  oklch(0.922 0 0);
  --color-slate-300:  oklch(0.87 0 0);
  --color-slate-400:  oklch(0.708 0 0);
  --color-slate-500:  oklch(0.556 0 0);
  --color-slate-600:  oklch(0.439 0 0);
  --color-slate-700:  oklch(0.371 0 0);
  --color-slate-800:  oklch(0.269 0 0);
  --color-slate-900:  oklch(0.205 0 0);
  --color-slate-950:  oklch(0.145 0 0);

  /* ── Accent (blue) ── */
  --color-blue-50:    oklch(0.97 0.01 255);
  --color-blue-100:   oklch(0.932 0.032 255);
  --color-blue-200:   oklch(0.882 0.059 254);
  --color-blue-300:   oklch(0.809 0.105 251);
  --color-blue-400:   oklch(0.707 0.165 254);
  --color-blue-500:   oklch(0.623 0.214 259);
  --color-blue-600:   oklch(0.546 0.245 262);
  --color-blue-700:   oklch(0.488 0.243 264);
  --color-blue-800:   oklch(0.424 0.199 265);
  --color-blue-900:   oklch(0.379 0.146 265);
  --color-blue-950:   oklch(0.282 0.091 267);

  /* ── Danger (red) ── */
  --color-red-50:     oklch(0.971 0.013 17);
  --color-red-100:    oklch(0.936 0.032 17);
  --color-red-200:    oklch(0.885 0.062 18);
  --color-red-300:    oklch(0.808 0.114 19);
  --color-red-400:    oklch(0.704 0.191 22);
  --color-red-500:    oklch(0.577 0.245 27);
  --color-red-600:    oklch(0.505 0.213 27);
  --color-red-700:    oklch(0.444 0.177 26);
  --color-red-800:    oklch(0.396 0.141 25);
  --color-red-900:    oklch(0.337 0.102 22);
  --color-red-950:    oklch(0.258 0.069 20);

  /* ── Warning (amber) ── */
  --color-amber-50:   oklch(0.987 0.022 95);
  --color-amber-100:  oklch(0.962 0.059 95);
  --color-amber-200:  oklch(0.924 0.12 95);
  --color-amber-300:  oklch(0.879 0.169 91);
  --color-amber-400:  oklch(0.828 0.189 84);
  --color-amber-500:  oklch(0.723 0.175 80);
  --color-amber-600:  oklch(0.628 0.151 72);
  --color-amber-700:  oklch(0.555 0.133 66);
  --color-amber-800:  oklch(0.473 0.114 61);
  --color-amber-900:  oklch(0.414 0.098 57);
  --color-amber-950:  oklch(0.308 0.071 53);

  /* ── Success (green) ── */
  --color-green-50:   oklch(0.982 0.018 155);
  --color-green-100:  oklch(0.962 0.044 156);
  --color-green-200:  oklch(0.925 0.084 155);
  --color-green-300:  oklch(0.871 0.15 154);
  --color-green-400:  oklch(0.792 0.209 151);
  --color-green-500:  oklch(0.627 0.194 149);
  --color-green-600:  oklch(0.527 0.154 150);
  --color-green-700:  oklch(0.448 0.119 151);
  --color-green-800:  oklch(0.393 0.095 152);
  --color-green-900:  oklch(0.339 0.077 151);
  --color-green-950:  oklch(0.253 0.057 152);

  /* ── Info (cyan) ── */
  --color-cyan-50:    oklch(0.984 0.012 210);
  --color-cyan-100:   oklch(0.956 0.032 208);
  --color-cyan-200:   oklch(0.917 0.061 207);
  --color-cyan-300:   oklch(0.865 0.1 207);
  --color-cyan-400:   oklch(0.789 0.134 211);
  --color-cyan-500:   oklch(0.715 0.143 215);
  --color-cyan-600:   oklch(0.609 0.126 221);
  --color-cyan-700:   oklch(0.52 0.105 223);
  --color-cyan-800:   oklch(0.45 0.085 224);
  --color-cyan-900:   oklch(0.386 0.068 224);
  --color-cyan-950:   oklch(0.291 0.048 225);

  
	  /* ── Bento Warm (warm cream #FFF5E6 -> oklch) ── */
	  --color-warm-50:    oklch(0.98 0.01 82);
	  --color-warm-100:   oklch(0.96 0.02 82);
	  --color-warm-200:   oklch(0.92 0.03 80);
	  --color-warm-300:   oklch(0.85 0.04 78);
	  --color-warm-400:   oklch(0.78 0.05 76);
	  --color-warm-500:   oklch(0.70 0.06 74);
	  --color-warm-600:   oklch(0.60 0.06 72);
	  --color-warm-700:   oklch(0.50 0.05 70);
	  --color-warm-800:   oklch(0.40 0.04 68);
	  --color-warm-900:   oklch(0.30 0.03 66);
	  --color-warm-950:   oklch(0.20 0.02 64);

	  /* ── Bento Peach (warm peach #FAD4C0 -> oklch) ── */
	  --color-peach-50:   oklch(0.97 0.03 65);
	  --color-peach-100:  oklch(0.94 0.05 63);
	  --color-peach-200:  oklch(0.89 0.08 59);
	  --color-peach-300:  oklch(0.84 0.10 55);
	  --color-peach-400:  oklch(0.79 0.12 51);
	  --color-peach-500:  oklch(0.74 0.14 47);
	  --color-peach-600:  oklch(0.66 0.14 43);
	  --color-peach-700:  oklch(0.58 0.13 39);
	  --color-peach-800:  oklch(0.50 0.11 35);
	  --color-peach-900:  oklch(0.42 0.09 33);
	  --color-peach-950:  oklch(0.32 0.06 30);

	  /* ── Bento Steel (steel blue #80A1C1 -> oklch) ── */
	  --color-steel-50:   oklch(0.97 0.01 250);
	  --color-steel-100:  oklch(0.93 0.03 248);
	  --color-steel-200:  oklch(0.88 0.05 246);
	  --color-steel-300:  oklch(0.82 0.08 244);
	  --color-steel-400:  oklch(0.76 0.10 242);
	  --color-steel-500:  oklch(0.70 0.12 240);
	  --color-steel-600:  oklch(0.62 0.12 238);
	  --color-steel-700:  oklch(0.54 0.10 236);
	  --color-steel-800:  oklch(0.46 0.08 234);
	  --color-steel-900:  oklch(0.38 0.06 232);
	  --color-steel-950:  oklch(0.28 0.04 230);
/* ── 绝对色 ── */
  --color-white:      oklch(1 0 0);
  --color-black:      oklch(0 0 0);
}
```

### 3.2 间距阶梯

```css
:root {
  --space-0:   0px;
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;
  --space-16:  64px;
}
```

### 3.3 圆角阶梯

```css
:root {
  --radius-none:  0px;
  --radius-xs:    4px;
  --radius-sm:    6px;
  --radius-md:    8px;
  --radius-lg:    12px;
  --radius-xl:    16px;
  --radius-2xl:   24px;
  --radius-full:  9999px;
}
```

### 3.4 字号 / 行高 / 字重

```css
:root {
  --font-size-xs:     0.75rem;   /* 12px */
  --font-lineheight-xs:  1rem;   /* 16px */

  --font-size-sm:     0.875rem;  /* 14px */
  --font-lineheight-sm:  1.25rem;/* 20px */

  --font-size-base:   1rem;      /* 16px */
  --font-lineheight-base: 1.5rem;/* 24px */

  --font-size-lg:     1.125rem;  /* 18px */
  --font-lineheight-lg:  1.75rem;/* 28px */

  --font-size-xl:     1.25rem;   /* 20px */
  --font-lineheight-xl:  1.75rem;/* 28px */

  --font-size-2xl:    1.5rem;    /* 24px */
  --font-lineheight-2xl: 2rem;   /* 32px */

  --font-size-3xl:    1.875rem;  /* 30px */
  --font-lineheight-3xl: 2.25rem;/* 36px */

  --font-size-4xl:    2.25rem;   /* 36px */
  --font-lineheight-4xl: 2.5rem; /* 40px */

  --font-weight-normal:   400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;
}
```

### 3.5 阴影层级

```css
:root {
  --elevation-shadow-1: 0 1px 2px  rgba(0,0,0,0.04);
  --elevation-shadow-2: 0 1px 3px  rgba(0,0,0,0.06), 0 1px 2px  rgba(0,0,0,0.04);
  --elevation-shadow-3: 0 4px 6px  rgba(0,0,0,0.06), 0 2px 4px  rgba(0,0,0,0.04);
  --elevation-shadow-4: 0 10px 15px rgba(0,0,0,0.08), 0 4px 6px  rgba(0,0,0,0.04);
  --elevation-shadow-5: 0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04);
}
```

### 3.6 Z-Index 层级表

> **铁律**：任何地方不得出现本文档未定义的 z-index 值。

```css
:root {
  --z-base:       0;       /* 文档流 */
  --z-dropdown:   200;     /* 下拉菜单、Select、Popover */
  --z-sticky:     400;     /* 粘性表头、固定列 */
  --z-overlay:    600;     /* 遮罩层、Sheet 遮罩 */
  --z-modal:      800;     /* 模态框、对话框 */
  --z-toast:      1000;    /* Toast 通知、Snackbar */
  --z-tooltip:    1200;    /* Tooltip、Popover（悬浮） */
  --z-command:    1400;    /* 命令面板、全局搜索 */
}
```

使用规则：

| 层级 | 典型组件 | 说明 |
|------|---------|------|
| `--z-base` | 所有文档流元素 | 默认值，无需显式设置 |
| `--z-dropdown` | Select, DropdownMenu, Popover | 高于表格和卡片 |
| `--z-sticky` | 表头 sticky, 固定侧边栏 | 高于滚动内容 |
| `--z-overlay` | DialogOverlay, Sheet 遮罩 | 覆盖整个页面但不覆盖模态框 |
| `--z-modal` | DialogContent, 图片预览 | 最高交互层 |
| `--z-toast` | Toast, Notification | 高于模态框 |
| `--z-tooltip` | Tooltip | 高于 Toast（悬停信息优先级最高） |
| `--z-command` | CommandPalette | 全局命令面板，最高层 |

### 3.7 动效令牌

```css
:root {
  /* 时长 */
  --motion-duration-instant: 0ms;
  --motion-duration-fast:    150ms;
  --motion-duration-base:    200ms;
  --motion-duration-slow:    300ms;
  --motion-duration-gentle:  500ms;

  /* 缓动函数 */
  --motion-easing-default: cubic-bezier(0.4, 0, 0.2, 1);    /* standard */
  --motion-easing-in:      cubic-bezier(0.4, 0, 1, 1);       /* enter */
  --motion-easing-out:     cubic-bezier(0, 0, 0.2, 1);       /* exit */
  --motion-easing-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);/* elastic */
}

/* reduced-motion 全局适配 */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-fast:   0ms;
    --motion-duration-base:   0ms;
    --motion-duration-slow:   0ms;
    --motion-duration-gentle: 0ms;
  }
}
```

### 3.8 容器宽度

```css
:root {
  --container-page:     none;     /* 全宽（管理后台默认） */
  --container-content:  900px;    /* 文档阅读最佳行宽 */
  --container-dialog:   512px;    /* 标准对话框宽度 */
  --container-sheet:    448px;    /* 侧边抽屉宽度 */
}
```

---

## 四、语义令牌（Semantic Tokens）

> 表达设计意图。组件只消费这一层。主题只修改这一层的映射。

### 4.1 色彩语义令牌

```css
/* ═══════════════════════════════════════════
   表面色（Surface）
   ═══════════════════════════════════════════ */
--app-color-surface-page          /* 页面底色（最底层） */
--app-color-surface-container      /* 卡片、面板、表格 */
--app-color-surface-elevated       /* 弹窗、对话框、抽屉 */
--app-color-surface-hover          /* 列表行悬停、卡片悬停 */
--app-color-surface-active         /* 选中态（侧边栏当前项、表格选中行） */

/* ═══════════════════════════════════════════
   文字色（Text）
   ═══════════════════════════════════════════ */
--app-color-text-primary           /* 正文、标题 */
--app-color-text-secondary         /* 描述、标签、辅助信息 */
--app-color-text-tertiary          /* 占位符、禁用态 */
--app-color-text-inverse           /* 深色背景上的文字 */

/* ═══════════════════════════════════════════
   交互色（Accent）
   ═══════════════════════════════════════════ */
--app-color-accent                 /* 主按钮、链接、选中指示 */
--app-color-accent-hover           /* 悬停态 */
--app-color-accent-active          /* 按下态 */
--app-color-accent-soft            /* 浅底色（选中行背景、Tag 背景） */

/* ═══════════════════════════════════════════
   边框色（Border）
   ═══════════════════════════════════════════ */
--app-color-border-default         /* 卡片边框、分割线 */
--app-color-border-strong          /* 输入框聚焦环、选中指示 */

/* ═══════════════════════════════════════════
   反馈色（Feedback）
   ═══════════════════════════════════════════ */
--app-color-feedback-danger        /* 错误/删除 */
--app-color-feedback-danger-soft
--app-color-feedback-warning       /* 告警 */
--app-color-feedback-warning-soft
--app-color-feedback-success       /* 成功/确认 */
--app-color-feedback-success-soft
--app-color-feedback-info          /* 信息提示 */
--app-color-feedback-info-soft
```

### 4.2 间距语义令牌

```css
--app-space-container-padding:  var(--space-6);    /* 卡片/面板内边距 */
--app-space-section-gap:        var(--space-8);    /* 页面区块间距 */
--app-space-element-gap:        var(--space-3);    /* 同行元素间距 */
--app-space-page-padding:       var(--space-6);    /* 页面内容区外边距 */
```

### 4.3 圆角语义令牌

```css
--app-radius-container:  var(--radius-lg);         /* 卡片、面板 */
--app-radius-element:    var(--radius-md);         /* 按钮、输入框、Tag */
--app-radius-pill:       var(--radius-full);       /* 药丸形元素 */
```

### 4.4 阴影语义令牌

```css
--app-elevation-card:     var(--elevation-shadow-2);  /* 卡片 */
--app-elevation-dropdown: var(--elevation-shadow-3);  /* 下拉菜单 */
--app-elevation-modal:    var(--elevation-shadow-5);  /* 模态框 */
```

### 4.5 动效语义令牌

```css
--app-motion-hover:  var(--motion-duration-fast) var(--motion-easing-default);
--app-motion-enter:  var(--motion-duration-base) var(--motion-easing-out);
--app-motion-exit:   var(--motion-duration-fast) var(--motion-easing-in);
--app-motion-layout: var(--motion-duration-slow) var(--motion-easing-spring);
```

### 4.6 亮色主题默认映射（Bento 暖色系）

> 🍱 **v1.5**：亮色主题已更新为 Bento 暖桃色系。原 slate-blue 方案保留在 `.theme-classic`。
> 映射规则：Bento 主色 #FAD4C0 → `--app-color-accent` / Bento 表面 #FFF5E6 → `--app-color-surface-page`

```css
:root, .theme-standard {
  /* Surface — Bento: warm cream surface #FFF5E6 */
  --app-color-surface-page:      var(--color-warm-50);    /* ← #FFF5E6 暖奶油 */
  --app-color-surface-container: var(--color-white);
  --app-color-surface-elevated:  var(--color-white);
  --app-color-surface-hover:     var(--color-warm-100);   /* ← 暖桃色浅变体 */
  --app-color-surface-active:    var(--color-peach-100);  /* ← #FAD4C0 极浅 */

  /* Text — Bento: #111827 near-black */
  --app-color-text-primary:      var(--color-slate-900);  /* ← #111827 */
  --app-color-text-secondary:    var(--color-slate-600);
  --app-color-text-tertiary:     var(--color-slate-400);
  --app-color-text-inverse:      var(--color-white);

  /* Accent — Bento: warm peach #FAD4C0 + steel blue #80A1C1 */
  --app-color-accent:            var(--color-peach-500);  /* ← #FAD4C0 → oklch */
  --app-color-accent-hover:      var(--color-peach-600);
  --app-color-accent-active:     var(--color-peach-700);
  --app-color-accent-soft:       var(--color-peach-100);
  --app-color-accent-secondary:  var(--color-steel-500);  /* ← #80A1C1 */

  /* Border */
  --app-color-border-default:    var(--color-warm-200);
  --app-color-border-strong:     var(--color-peach-400);

  /* Feedback — 继承 Bento DESIGN.md 语义色 */
  --app-color-feedback-danger:       var(--color-red-500);    /* #DC2626 */
  --app-color-feedback-danger-soft:  var(--color-red-50);
  --app-color-feedback-warning:      var(--color-amber-500);  /* #D97706 */
  --app-color-feedback-warning-soft: var(--color-amber-50);
  --app-color-feedback-success:      var(--color-green-500);  /* #16A34A */
  --app-color-feedback-success-soft: var(--color-green-50);
  --app-color-feedback-info:         var(--color-steel-500);
  --app-color-feedback-info-soft:    var(--color-steel-100);

  /* Spacing — Bento: 4/8/12/16/24/32 */
  --app-space-container-padding: var(--space-6);   /* 24px */
  --app-space-section-gap:       var(--space-8);   /* 32px */
  --app-space-element-gap:       var(--space-3);   /* 12px */
  --app-space-page-padding:      var(--space-6);

  /* Radius — Bento: sm=4px, md=8px */
  --app-radius-container: var(--radius-md);   /* 8px — Bento card radius */
  --app-radius-element:   var(--radius-sm);   /* 4px — Bento element radius */
  --app-radius-pill:      var(--radius-full);

  /* Elevation */
  --app-elevation-card:     var(--elevation-shadow-2);
  --app-elevation-dropdown: var(--elevation-shadow-3);
  --app-elevation-modal:    var(--elevation-shadow-5);

  /* Motion — Bento: gentle ease 150-300ms */
  --app-motion-hover:  var(--motion-duration-fast) var(--motion-easing-default);
  --app-motion-enter:  var(--motion-duration-base) var(--motion-easing-out);
  --app-motion-exit:   var(--motion-duration-fast) var(--motion-easing-in);
  --app-motion-layout: var(--motion-duration-slow) var(--motion-easing-spring);
}
```

### 4.6b 经典主题（v1.4 兼容）

```css
/* 如果偏好原来的 slate-blue 配色，加 class="theme-classic" */
.theme-classic {
  --app-color-surface-page:      var(--color-slate-50);
  --app-color-surface-container: var(--color-white);
  --app-color-surface-elevated:  var(--color-white);
  --app-color-surface-hover:     var(--color-slate-50);
  --app-color-surface-active:    var(--color-blue-50);

  --app-color-text-primary:      var(--color-slate-950);
  --app-color-text-secondary:    var(--color-slate-600);
  --app-color-text-tertiary:     var(--color-slate-400);
  --app-color-text-inverse:      var(--color-white);

  --app-color-accent:            var(--color-blue-500);
  --app-color-accent-hover:      var(--color-blue-600);
  --app-color-accent-active:     var(--color-blue-700);
  --app-color-accent-soft:       var(--color-blue-50);
  --app-color-accent-secondary:  var(--color-blue-400);

  --app-color-border-default:    var(--color-slate-200);
  --app-color-border-strong:     var(--color-blue-500);
}
```

---

## 五、主题系统

### 5.1 主题定义

主题 = 一份语义令牌 → 基础令牌的映射表。主题不创建新令牌，不修改组件。组件**从不感知**当前激活的主题。

```css
/* ═══════ 暗色主题 ═══════ */
.dark, .theme-standard-dark {
  --app-color-surface-page:      var(--color-slate-950);
  --app-color-surface-container: var(--color-slate-900);
  --app-color-surface-elevated:  var(--color-slate-800);
  --app-color-surface-hover:     var(--color-slate-800);
  --app-color-surface-active:    var(--color-blue-900);

  --app-color-text-primary:      var(--color-slate-50);
  --app-color-text-secondary:    var(--color-slate-400);
  --app-color-text-tertiary:     var(--color-slate-500);
  --app-color-text-inverse:      var(--color-slate-950);

  --app-color-accent:            var(--color-blue-400);
  --app-color-accent-hover:      var(--color-blue-300);
  --app-color-accent-active:     var(--color-blue-200);
  --app-color-accent-soft:       var(--color-blue-950);

  --app-color-border-default:    var(--color-slate-800);
  --app-color-border-strong:     var(--color-blue-400);

  --app-color-feedback-danger:       var(--color-red-400);
  --app-color-feedback-danger-soft:  var(--color-red-950);
  --app-color-feedback-warning:      var(--color-amber-400);
  --app-color-feedback-warning-soft: var(--color-amber-950);
  --app-color-feedback-success:      var(--color-green-400);
  --app-color-feedback-success-soft: var(--color-green-950);
  --app-color-feedback-info:         var(--color-cyan-400);
  --app-color-feedback-info-soft:    var(--color-cyan-950);
}

/* ═══════ 科幻流光主题（暗色变体） ═══════ */
.theme-scifi {
  --app-color-surface-page:      var(--color-slate-950);
  --app-color-surface-container: oklch(0.17 0.01 260);
  --app-color-surface-elevated:  oklch(0.21 0.01 260);
  --app-color-surface-hover:     oklch(0.22 0.02 260);
  --app-color-surface-active:    oklch(0.25 0.04 240);

  --app-color-text-primary:      var(--color-slate-50);
  --app-color-text-secondary:    var(--color-slate-300);
  --app-color-text-tertiary:     var(--color-slate-500);
  --app-color-text-inverse:      var(--color-slate-950);

  --app-color-accent:            var(--color-cyan-400);
  --app-color-accent-hover:      var(--color-cyan-300);
  --app-color-accent-active:     var(--color-cyan-200);
  --app-color-accent-soft:       oklch(0.18 0.04 220);

  --app-color-border-default:    oklch(0.25 0.01 260);
  --app-color-border-strong:     var(--color-cyan-400);

  /* 圆角偏向更大 */
  --app-radius-container: var(--radius-xl);
  --app-radius-element:   var(--radius-md);
}
```

### 5.2 主题注册表

```typescript
// features/theme/types.ts
export interface ThemeDefinition {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  /** 挂载到 <html> 的 CSS class */
  className: string;
  /** 设置页预览色块 */
  preview: {
    accent: string;
    surface: string;
    text: string;
  };
}

// features/theme/themeRegistry.ts
export const THEME_REGISTRY: ThemeDefinition[] = [
  {
    id: 'standard',
    label: '标准',
    mode: 'light',
    className: 'theme-standard',
    preview: { accent: '#3b82f6', surface: '#ffffff', text: '#0f172a' },
  },
  {
    id: 'standard-dark',
    label: '暗色',
    mode: 'dark',
    className: 'theme-standard-dark',
    preview: { accent: '#60a5fa', surface: '#0f172a', text: '#f8fafc' },
  },
  {
    id: 'scifi',
    label: '科幻流光',
    mode: 'dark',
    className: 'theme-scifi',
    preview: { accent: '#22d3ee', surface: '#0b1121', text: '#e2e8f0' },
  },
];
```

### 5.3 ThemeProvider

```tsx
// features/theme/ThemeProvider.tsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { THEME_REGISTRY, type ThemeDefinition } from './themeRegistry';

interface ThemeContextValue {
  themeId: string;
  theme: ThemeDefinition;
  setThemeId: (id: string) => void;
  themes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'twin-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'standard';
  });

  const theme = THEME_REGISTRY.find(t => t.id === themeId) || THEME_REGISTRY[0];

  const setThemeId = useCallback((id: string) => {
    if (THEME_REGISTRY.some(t => t.id === id)) {
      setThemeIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // 清除所有主题 class
    THEME_REGISTRY.forEach(t => root.classList.remove(t.className));
    // 挂载新主题
    root.classList.add(theme.className);
    // 暗色模式
    if (theme.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ themeId, theme, setThemeId, themes: THEME_REGISTRY }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

### 5.4 App.tsx 集成

```tsx
// App.tsx
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>                     {/* ← 新增 */}
        <GlobalSocketListener />
        <RouterProvider router={router} />
        <Toaster position="top-right" />
        <SwipeFailureBanner />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

### 5.5 主题可配置维度

一个主题可以覆盖以下维度的语义令牌。未显式覆盖的维度继承默认值：

| 维度 | 语义令牌群 | 说明 |
|------|----------|------|
| 颜色 | `--app-color-*` | surface, text, accent, border, feedback |
| 圆角模式 | `--app-radius-*` | 方角偏技术感，圆角偏亲和感 |
| 间距密度 | `--app-space-*` | 紧凑模式（数据密集页）vs 舒适模式（阅读页） |
| 动效强度 | `--app-motion-*` | 完整动效 vs 减弱（prefers-reduced-motion 自动触发） |

---

## 六、组件令牌（Component Tokens）

> 每个组件的可变属性提取为独立令牌，引用语义层。组件自身不硬编码任何视觉值。

### 6.1 按钮（Button）

```css
/* ── 引用语义令牌 ── */
--btn-color-bg-primary:         var(--app-color-accent);
--btn-color-text-primary:       var(--color-white);
--btn-color-bg-primary-hover:   var(--app-color-accent-hover);

--btn-color-bg-secondary:       var(--app-color-surface-container);
--btn-color-text-secondary:     var(--app-color-text-primary);
--btn-color-bg-secondary-hover: var(--app-color-surface-hover);

--btn-color-border:             var(--app-color-border-default);

/* ── 引用基础令牌 ── */
--btn-radius:                   var(--app-radius-element);
--btn-transition:               var(--app-motion-hover);
--btn-padding-x:                var(--space-3);
--btn-padding-y:                var(--space-2);
--btn-font-size:                var(--font-size-sm);
--btn-font-weight:              var(--font-weight-medium);
```

### 6.2 输入框（Input / Select / Textarea）

```css
--input-color-bg:               var(--app-color-surface-container);
--input-color-text:             var(--app-color-text-primary);
--input-color-placeholder:      var(--app-color-text-tertiary);
--input-color-border:           var(--app-color-border-default);
--input-color-border-focus:     var(--app-color-accent);
--input-color-border-error:     var(--app-color-feedback-danger);

--input-radius:                 var(--app-radius-element);
--input-padding-x:              var(--space-3);
--input-padding-y:              var(--space-2);
--input-font-size:              var(--font-size-base);
--input-font-family:            var(--font-family-sans);
```

### 6.3 对话框（Dialog）

```css
--dialog-color-bg:              var(--app-color-surface-elevated);
--dialog-color-text-title:      var(--app-color-text-primary);
--dialog-color-text-desc:       var(--app-color-text-secondary);

--dialog-shadow:                var(--app-elevation-modal);
--dialog-radius:                var(--app-radius-container);
--dialog-padding:               var(--space-6);
--dialog-z:                     var(--z-modal);
```

### 6.3a 级联下拉菜单（Cascading Dropdown Menu）

**使用场景**：树形结构的"移动到…"、"发送到…"等操作，需要展示完整层级关系供用户选择。

**交互模式**：悬浮展开——鼠标悬停有子级的项，子菜单从右侧弹出。点击叶子项执行操作。

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ 📁 顶层      │     │              │     │               │
│ 📁 后端手册  ▸│────→│ 📁 Spring    ▸│────→│ 📁 Security   │
│ 📁 AI大模型  ▸│     │ 📁 MyBatis   │     │ 📁 OAuth2     │
│ 📁 中间件    ▸│     │ 📁 Redis     │     └───────────────┘
└─────────────┘     └──────────────┘
    一级菜单            二级菜单            三级菜单
```

**实现规范**：

```tsx
// 1. Portal 渲染的 Dropdown 组件支持 side 属性
function Dropdown({ anchor, open, onClose, children, side = "bottom" }) {
  // side="bottom": left = anchor.left, top = anchor.bottom + 4
  // side="right":  left = anchor.right + 4, top = anchor.top
  return createPortal(
    <div style={{ zIndex: "var(--z-modal)" }}>{children}</div>,
    document.body
  );
}

// 2. CascadingItem: 悬浮时展开子级 Dropdown
function CascadingItem({ node, onMove }) {
  const itemRef = useRef(null);
  const [subOpen, setSubOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div ref={itemRef}
      onMouseEnter={() => hasChildren && setSubOpen(true)}
      onMouseLeave={() => setSubOpen(false)}
    >
      <button onClick={() => onMove(node.id)}>
        {node.name}
        {hasChildren && <ChevronRight />}
      </button>
      {subOpen && hasChildren && (
        <Dropdown anchor={itemRef.current} open={subOpen} side="right">
          {node.children.map(c => <CascadingItem ... />)}
        </Dropdown>
      )}
    </div>
  );
}
```

**约束**：

| 规则 | 说明 |
|------|------|
| 必须 Portal 到 `<body>` | 避免父级 overflow/stacking context 裁剪 |
| z-index 必须用 `--z-modal` | 禁止硬编码 `z-[99999]` 等 |
| side 默认 `"bottom"` | 一级菜单向下展开；子级 `side="right"` 向右展开 |
| `onMouseEnter`/`onMouseLeave` | 悬浮开、离开关，不用 click 切换 |
| 排除自身 | `excludeId` 防止将文件夹移入自身 |
| 当前项 disabled | `currentId === id` 时灰显不可点击 |

### 6.4 侧边栏（Sidebar）

```css
--sidebar-color-bg:             var(--app-color-surface-container);
--sidebar-color-text:           var(--app-color-text-primary);
--sidebar-color-text-muted:     var(--app-color-text-secondary);
--sidebar-color-border:         var(--app-color-border-default);
--sidebar-color-item-active-bg: var(--app-color-accent-soft);
--sidebar-color-item-active-text: var(--app-color-accent);

--sidebar-transition:           var(--app-motion-hover);
--sidebar-item-padding-x:       var(--space-4);
--sidebar-item-padding-y:       var(--space-2);
--sidebar-width:                260px;
--sidebar-width-collapsed:      56px;
```

### 6.5 表格（Table）

```css
--table-color-bg:               var(--app-color-surface-container);
--table-color-header-bg:        var(--app-color-surface-page);
--table-color-header-text:      var(--app-color-text-secondary);
--table-color-cell-text:        var(--app-color-text-primary);
--table-color-row-hover:        var(--app-color-surface-hover);
--table-color-row-selected:     var(--app-color-accent-soft);
--table-color-border:           var(--app-color-border-default);

--table-header-z:               var(--z-sticky);
--table-font-size:              var(--font-size-sm);
--table-cell-padding-x:         var(--space-3);
--table-cell-padding-y:         var(--space-2);
```

### 6.6 统一规则

| 规则 | 说明 |
|------|------|
| **命名格式** | `--{组件名}-{类别}-{属性}-{变体}-{状态}` |
| **引用限制** | 只能引用语义令牌（`--app-*`）和基础令牌（`--color-*`, `--space-*`, `--radius-*` 等）。**绝不**引用其他组件的令牌 |
| **默认值** | 每个组件令牌必须有映射到语义令牌的默认值。组件 CSS 不写死值 |
| **覆盖路径** | 改主题 → 调语义映射表。改单个组件 → 调组件令牌。**两条路径不交叉** |

---

## 七、字体与排版

> 🍱 **v1.5**：新增 Bento 字体方案。Bento 指定 Inter（正文）+ JetBrains Mono（代码/标签）。

### 7.1 字体族

```css
:root {
  /* ── Bento 推荐字体方案 ── */
  --font-family-sans:   'Inter Variable', 'Figtree Variable', ui-sans-serif, system-ui, sans-serif;
  --font-family-mono:   'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  --font-family-display: var(--font-family-sans);

  /* ── 经典字体方案（classic 主题使用） ── */
  .theme-classic {
    --font-family-sans:   'Figtree Variable', ui-sans-serif, system-ui, sans-serif;
  }
}
```

| 字体 | 用途 | Bento 来源 | 安装方式 |
|------|------|-----------|---------|
| **Inter Variable** | 🍱 正文/标题/UI（Bento 默认） | DESIGN.md § typography | `@fontsource-variable/inter` |
| **Figtree Variable** | 经典方案正文（已安装保留） | 项目原有 | `@fontsource-variable/figtree` ✅ |
| **JetBrains Mono** | 🍱 代码块/等宽标签（Bento 默认） | DESIGN.md § typography | `@fontsource-variable/jetbrains-mono` |

### 7.2 排版层级（Bento 对齐：12/14/16/20/24/32）

```
Display    (--font-size-4xl: 2rem/32px)   — 🍱 Bento h1, 仅首页标题、Hero 区
Heading1   (--font-size-3xl: 1.5rem/24px)  — 文档一级标题、页面大标题
Heading2   (--font-size-2xl: 1.25rem/20px) — 文档二级标题、区块标题、卡片标题
Heading3   (--font-size-xl:  1.125rem)     — 小标题
Body       (--font-size-base: 1rem/16px)   — 🍱 Bento body-md, 正文段落
Body-sm    (--font-size-sm:  0.875rem/14px)— 辅助说明
Caption    (--font-size-xs:  0.75rem/12px) — 🍱 Bento label-caps, 标签/角标
```

### 7.3 排版语义令牌

```css
--app-font-display:   var(--font-weight-bold) var(--font-size-4xl) / var(--font-lineheight-4xl) var(--font-family-display);
--app-font-heading1:  var(--font-weight-semibold) var(--font-size-3xl) / var(--font-lineheight-3xl) var(--font-family-sans);
--app-font-heading2:  var(--font-weight-semibold) var(--font-size-2xl) / var(--font-lineheight-2xl) var(--font-family-sans);
--app-font-heading3:  var(--font-weight-medium) var(--font-size-xl) / var(--font-lineheight-xl) var(--font-family-sans);
--app-font-body:      var(--font-weight-normal) var(--font-size-base) / var(--font-lineheight-base) var(--font-family-sans);
--app-font-caption:   var(--font-weight-normal) var(--font-size-sm) / var(--font-lineheight-sm) var(--font-family-sans);
--app-font-small:     var(--font-weight-normal) var(--font-size-xs) / var(--font-lineheight-xs) var(--font-family-sans);
--app-font-code:      var(--font-weight-normal) var(--font-size-sm) / var(--font-lineheight-sm) var(--font-family-mono);
```

---

## 八、响应式断点

### 8.1 断点定义

```css
/* Tailwind 对齐（Tailwind CSS v4 默认断点） */
--breakpoint-sm:   640px;    /* 手机横屏 */
--breakpoint-md:   768px;    /* 平板竖屏 */
--breakpoint-lg:   1024px;   /* 平板横屏 / 小桌面 */
--breakpoint-xl:   1280px;   /* 标准桌面（三栏布局启用） */
--breakpoint-2xl:  1536px;   /* 大屏桌面 */
```

### 8.2 知识库模块响应式行为

| 断点 | 布局 | 侧边栏 | 大纲 |
|------|------|--------|------|
| `< 768px` | 单栏，全宽 | 隐藏，汉堡菜单呼出抽屉 | 隐藏 |
| `768px - 1023px` | 单栏，居中内容 | 隐藏，汉堡菜单呼出抽屉 | 隐藏 |
| `1024px - 1279px` | 双栏 | 260px 固定 | 隐藏 |
| `≥ 1280px` | 三栏 | 260px 固定 | 200px 固定 |

---

## 九、动画与动效规范

### 9.1 场景 → 动效映射

| 场景 | 时长 | 缓动 | 属性 | 说明 |
|------|------|------|------|------|
| 按钮悬停 | `fast` (150ms) | `default` | background-color, box-shadow | 微妙过渡 |
| 下拉菜单展开 | `base` (200ms) | `out` | opacity, transform(translateY) | 从上淡入 |
| 下拉菜单关闭 | `fast` (150ms) | `in` | opacity | 快速消失 |
| 模态框入场 | `slow` (300ms) | `out` | opacity, scale | 居中缩放 |
| 模态框退场 | `fast` (150ms) | `in` | opacity, scale | 快速缩小消失 |
| 侧边栏折叠 | `slow` (300ms) | `spring` | width | 弹性过渡 |
| 页面路由切换 | `gentle` (500ms) | `out` | opacity, translateY(4px) | 淡入上移 |
| 列表项入场 | `base` (200ms) | `out` | opacity, translateY(8px) | 交错延迟（stagger） |
| Tooltip 显隐 | `fast` (150ms) | `default` | opacity | 即时跟随 |

### 9.2 GSAP 使用规范

- **复杂动画**（粒子系统、路径动画、scroll-trigger）使用 GSAP
- **微交互**（hover、focus、展开/折叠）使用 CSS transition，不引入 GSAP
- GSAP 实例必须在组件卸载时 `gsap.killTweensOf()` 清理
- 不得在 `useEffect` 依赖数组不完整的情况下使用 GSAP（避免叠加动画）

### 9.3 reduced-motion 全局适配

已在基础令牌层定义。所有使用 `--app-motion-*` 令牌的动效自动响应 `prefers-reduced-motion`。使用 GSAP 的动画需手动检查：

```typescript
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReduced) {
  gsap.set(target, { opacity: 1 }); // 直接跳至最终状态
  return;
}
```

---

## 十、知识库模块落地——组件消费令牌

> 以知识库模块（`/admin/knowledge`）为实验落地场景，展示组件如何通过消费语义令牌和组件令牌实现零硬编码。

### 10.1 三栏布局壳（KnowledgeLayout）

**组件令牌**：
```css
--layout-knowledge-sidebar-width:  260px;
--layout-knowledge-content-max:    900px;
--layout-knowledge-outline-width:  200px;
--layout-knowledge-bg:             var(--app-color-surface-page);
```

**行为**：
- 背景：`var(--layout-knowledge-bg)`
- 左侧栏：固定 `var(--layout-knowledge-sidebar-width)`，可折叠
- 中间内容：`max-width: var(--layout-knowledge-content-max)`，居中
- 右侧大纲：固定 `var(--layout-knowledge-outline-width)`，≥1280px 显示

### 10.2 分类树（KnowledgeCategoryTree）

消费侧边栏组件令牌：
```
背景：var(--sidebar-color-bg)
文字：var(--sidebar-color-text)
辅助文字：var(--sidebar-color-text-muted)
边框：var(--sidebar-color-border)
选中背景：var(--sidebar-color-item-active-bg)
选中文字：var(--sidebar-color-item-active-text)
过渡：var(--sidebar-transition)
内边距 X：var(--sidebar-item-padding-x)
内边距 Y：var(--sidebar-item-padding-y)
```

### 10.3 文档正文（KnowledgePageRenderer）

消费排版语义令牌：
```
标题：var(--app-font-heading1 / heading2 / heading3)   ← 取决于 h1/h2/h3
正文：var(--app-font-body)
代码：var(--app-font-code)
背景：var(--app-color-surface-container)               ← 仅代码块背景
文字主色：var(--app-color-text-primary)
文字辅色：var(--app-color-text-secondary)
边框：var(--app-color-border-default)
最大宽度：var(--container-content)                      ← 900px
内边距：var(--app-space-container-padding)
```

### 10.4 底部元数据栏（KnowledgePageMeta）

消费排版和间距令牌：
```
文字色：var(--app-color-text-tertiary)
字体：var(--app-font-caption)
顶部边框：1px solid var(--app-color-border-default)
上边距：var(--app-space-section-gap)
```

### 10.5 落地验证清单

知识库模块上线时，检查以下项：

- [ ] 所有 `bg-*` / `text-*` / `rounded-*` 是否通过令牌引用（不是硬编码值）
- [ ] 是否出现了 `var(--sidebar-*)` 被其他模块引用（跨组件耦合）
- [ ] 是否出现了 z-index 硬编码（应从 `--z-*` 引用）
- [ ] 暗色模式下切换是否无闪烁
- [ ] 科幻流光主题下视觉效果是否正确
- [ ] reduced-motion 下动效是否正确降级

---

## 十一、兼容与迁移策略

### 11.1 与现有 shadcn/ui 变量的关系

现有 shadcn/ui CSS 变量（`--background`, `--primary`, `--foreground` 等）**不删除**。通过映射别名与新令牌共存：

```css
:root {
  /* 新令牌（主力） */
  --app-color-surface-page: var(--color-slate-50);
  ...
  /* shadcn 兼容映射（保持现有组件不崩） */
  --background: var(--app-color-surface-page);
  --foreground: var(--app-color-text-primary);
  --primary:    var(--app-color-accent);
  --primary-foreground: var(--color-white);
  --muted:      var(--app-color-surface-hover);
  --muted-foreground: var(--app-color-text-secondary);
  ...
}
```

迁移完成后（全站组件都已切换到 `--app-*` 令牌），可以移除 shadcn 兼容映射。

### 11.2 与现有 Twin 令牌的关系

现有的 `--twin-ink`, `--twin-canvas` 等 Twin Design Tokens 逐步迁移到新体系：

| 旧令牌 | 新令牌 | 说明 |
|--------|--------|------|
| `--twin-ink` | `--app-color-text-primary` | 主文字色 |
| `--twin-body` | `--app-color-text-secondary` | 辅文字色 |
| `--twin-mute` | `--app-color-text-tertiary` | 三级文字 |
| `--twin-canvas` | `--app-color-surface-container` | 卡片/面板底 |
| `--twin-canvas-soft` | `--app-color-surface-page` | 页面底 |
| `--twin-hairline` | `--app-color-border-default` | 边框 |
| `--twin-link` | `--app-color-accent` | 链接色 |
| `--twin-error` | `--app-color-feedback-danger` | 错误色 |
| `--twin-success` | `--app-color-feedback-success` | 成功色 |

迁移期间两套令牌并存。新代码**只**使用 `--app-*` 令牌。旧代码逐批替换。

### 11.3 与学生端令牌的关系

学生端已有 `--student-*` 令牌体系（`student-design-tokens.css`），五个主题变体。短期不强制对齐（两套体系可共存），长期考虑统一到同一语义令牌层，学生端增加 `--student-*` → `--app-*` 的映射层。

### 11.4 迁移路径

```
Phase 1: 规范落地
  - 本文档生效
  - ThemeProvider 接入 App.tsx
  - 基础令牌 CSS 文件：frontend/src/styles/tokens.css
  - 语义令牌 CSS 文件：frontend/src/styles/semantic.css

Phase 2: 知识库模块实验
  - 知识库全部新组件使用新令牌
  - 验证三栏布局、暗色切换、主题切换

Phase 3: 组件令牌覆盖
  - 将 components/ui/ 下组件逐一迁移到组件令牌
  - shadcn 兼容映射保持，逐个验证

Phase 4: 全站推广
  - 新页面强制使用新令牌
  - 旧页面按需重构
  - 学生端评估统一方案
```

---

## 十二、文件结构

```
frontend/src/
├── styles/
│   ├── tokens.css              ← 基础令牌（色板/间距/圆角/阴影/字号/Z/动效）
│   └── semantic.css            ← 语义令牌（亮色默认映射）
├── features/
│   └── theme/
│       ├── types.ts            ← ThemeDefinition 类型
│       ├── themeRegistry.ts    ← THEME_REGISTRY 主题注册表
│       ├── ThemeProvider.tsx    ← 主题上下文 + 切换逻辑
│       ├── theme-semantic.css  ← 主题语义映射（.theme-standard / .dark / .theme-scifi）
│       └── ThemeSwitcher.tsx   ← 主题切换器 UI 组件
├── components/
│   └── ui/
│       └── *.css               ← 各组件令牌（btn.css / dialog.css / table.css 等）
```

---

## 十三、Z-Index 使用公约

| 元素 | 应引用的令牌 | 示例 |
|------|------------|------|
| 表格粘性表头 | `var(--z-sticky)` | `z-index: var(--z-sticky)` |
| 下拉菜单内容 | `var(--z-dropdown)` | `z-index: var(--z-dropdown)` |
| 对话框遮罩 | `var(--z-overlay)` | `z-index: var(--z-overlay)` |
| 对话框内容 | `var(--z-modal)` | `z-index: var(--z-modal)` |
| Toast 通知 | `var(--z-toast)` | `z-index: var(--z-toast)` |
| Tooltip | `var(--z-tooltip)` | `z-index: var(--z-tooltip)` |
| 命令面板 | `var(--z-command)` | `z-index: var(--z-command)` |

**禁止**在任何 CSS/组件中出现本文档未定义的 z-index 值（如 `z-[9999]`、`z-[100130]`）。

---

## 十四、🍱 Bento 布局原则 — 模块化卡片网格

> 本章节从 Bento 设计系统提取，定义 TwinSystem 的模块化卡片网格布局规范。
> 来源：`.claude/skills/bento/SKILL.md` § Brand + § Component Rule Expectations

### 14.1 核心概念：Bento Grid（便当盒网格）

Bento 的核心是**模块化卡片网格**——像日式便当盒一样，用不规则的矩形块在网格中组织内容，每个块有清晰的层次和柔和的视觉对比。

```
┌──────────────────────┐  ┌──────────┐  ┌──────────┐
│                      │  │  Stats   │  │  Quick   │
│     Hero Card        │  │  Card    │  │  Actions │
│                      │  └──────────┘  └──────────┘
└──────────────────────┘  ┌──────────┐  ┌──────────┐
┌──────────┐ ┌──────────┐ │  Chart   │  │  Recent  │
│  Metric  │ │  Metric  │ │  Card    │  │  Items   │
│  Card    │ │  Card    │ └──────────┘  └──────────┘
└──────────┘ └──────────┘
```

### 14.2 Bento Grid CSS 骨架

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);                /* 🍱 16px — Bento md spacing */
  padding: var(--app-space-page-padding);
}

.bento-card {
  background: var(--app-color-surface-container);
  border: 1px solid var(--app-color-border-default);
  border-radius: var(--app-radius-container);  /* 🍱 8px */
  padding: var(--app-space-container-padding);
  transition: var(--app-motion-hover);
}

.bento-card:hover {
  border-color: var(--app-color-border-strong);
  box-shadow: var(--app-elevation-card);
}

/* 大卡片跨多列 */
.bento-card--wide { grid-column: span 2; }
.bento-card--tall { grid-row: span 2; }
```

### 14.3 卡片变体

| 变体 | 用途 | 令牌 |
|------|------|------|
| 标准卡片 | 列表项、指标、状态 | `bento-card` |
| 宽卡片 | Hero 区、图表容器、主要操作 | `bento-card--wide` |
| 高卡片 | 长列表、时间线、活动日志 | `bento-card--tall` |
| 交互卡片 | 可点击跳转的卡片 | `bento-card bento-card--interactive` |

### 14.4 布局模式选择

| 模式 | 适用场景 | 实现 |
|------|---------|------|
| **Bento Grid** | 仪表盘首页、概览页 | `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` |
| **Bento Stack** | 移动端、窄面板 | `flex-col gap-4`，单列垂直堆叠 |
| **Bento Split** | 详情页（主内容+侧边栏） | `grid-template-columns: 1fr 320px` |
| **Bento Feed** | 信息流、时间线 | `flex-col gap-3`，统一宽度 |

### 14.5 间距节奏（Bento Scale: 4/8/12/16/24/32）

```
元素内 padding:    12px (--space-3) 或 16px (--space-4)
卡片间 gap:        16px (--space-4)  ← 🍱 Bento md
区块间 margin:     24px (--space-6) 或 32px (--space-8)
页面 padding:      24px (--space-6)
```

### 14.6 Bento 设计约束

| 规则 | 说明 |
|------|------|
| 卡片必须有明确边界 | 用 `border` + `border-radius` 而非纯色背景区分 |
| 层次靠间距表达 | 不靠颜色深浅，靠留白大小 |
| 交互状态必须显式 | default / hover / active 三种态都要有视觉区别 |
| 圆角统一 | 卡片 8px (`--radius-md`), 元素 4px (`--radius-sm`) |
| 不超 3 列 | 桌面端最多 3 列卡片；移动端 1 列 |

---

## 十五、禁止事项清单

| 禁止行为 | 原因 |
|---------|------|
| 硬编码颜色值（`#xxx`, `rgb()`, `oklch()`）| 破坏令牌唯一真相源原则 |
| 硬编码 z-index | 破坏层级体系 |
| 硬编码像素值（`px`）用于间距/圆角 | 破坏令牌体系，无法统一调整 |
| 组件 A 的 CSS 中引用组件 B 的令牌 | 破坏组件解耦 |
| 语义令牌中引用其他语义令牌 | 破坏单向依赖 |
| GSAP 动画不清理（缺少 killTweensOf） | 内存泄漏 |
| 页面内联 `<style>` 或 inline style | 破坏令牌体系和可维护性 |
| `!important` | 破坏层叠规则，掩埋真正的问题 |
| 卡片无边距（内容贴边） | 🍱 Bento 要求卡片必须有视觉边界 |
| 网格超过 3 列（桌面端） | 🍱 Bento 约束，保持可扫描性 |

---

*本文档是 TwinSystem UI 层的元规范。所有页面、组件、主题的视觉实现必须以本文档为准。*
*版本 v1.6 — 新增级联下拉菜单规范 §6.3a；集成 Bento；Warm/Peach/Steel 色系。*
