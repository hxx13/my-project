# UI 令牌实施调教指南

> **上级文档**：[UI设计规范与主题标准.md](UI设计规范与主题标准.md) — 设计体系元规范，本文档是其**具体实施配方**。
>
> **定位**：从零开始搭建 TwinSystem 三层令牌体系的完整配方——文件创建顺序、精确的 CSS 代码、Tailwind 集成配置、ThemeProvider 接线、现有组件的迁改对照、验证步骤。
>
> **调教日期**：2026-06-09
>
> **适用版本**：Tailwind CSS v4 + shadcn/ui + Vite

---

## 一、当前状态

> **截至 2026-06-13**：以下文件已全部落地，令牌体系在生产环境运行中。

| 文件 | 状态 | 说明 |
|------|------|------|
| `frontend/src/styles/tokens.css` | ✅ 已落地 | 含 Bento Warm/Peach/Steel + Dark 色系 |
| `frontend/src/styles/semantic.css` | ✅ 已落地 | 含 4 个主题映射（standard / standard-dark / scifi / classic-backup）+ 通知岛令牌 |
| `frontend/src/index.css` | ✅ 已落地 | shadcn 兼容映射已建立 |
| `frontend/tailwind.config.js` | ✅ 已落地 | app/* 颜色类名已注册 |
| `frontend/src/features/theme/` | ✅ 已落地 | ThemeProvider 含 autoSchedule / effectiveMode / toggleLightDark |
| `frontend/src/App.tsx` | ✅ 已落地 | ThemeProvider 包裹 |
| `frontend/src/constants/zIndex.ts` | ✅ 已落地 | 扫描弹窗专用层级常量 |

以下为原始搭建指南（供新增主题或迁移参考）。

---

## 二、Step 1：基础令牌文件

### 2.1 创建 `frontend/src/styles/tokens.css`

```css
/* ═══════════════════════════════════════════════════════════
   TwinSystem — 基础令牌（Primitive Tokens）
   全站所有具体值的唯一定义处。改一个值，全局生效。
   ═══════════════════════════════════════════════════════════ */

@layer base {
  :root {
    /* ═════════════════════════════════════════
       色板 — 48 色体系，oklch 色彩空间
       ═════════════════════════════════════════ */

    /* Gray (slate) */
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

    /* Accent (blue) */
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

    /* Danger (red) */
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

    /* Warning (amber) */
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

    /* Success (green) */
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

    /* Info (cyan) */
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

    /* 绝对色 */
    --color-white:      oklch(1 0 0);
    --color-black:      oklch(0 0 0);

    /* ═════════════════════════════════════════
       间距阶梯
       ═════════════════════════════════════════ */
    --space-0:   0px;
    --space-1:   0.25rem;  /*  4px */
    --space-2:   0.5rem;   /*  8px */
    --space-3:   0.75rem;  /* 12px */
    --space-4:   1rem;     /* 16px */
    --space-5:   1.25rem;  /* 20px */
    --space-6:   1.5rem;   /* 24px */
    --space-8:   2rem;     /* 32px */
    --space-10:  2.5rem;   /* 40px */
    --space-12:  3rem;     /* 48px */
    --space-16:  4rem;     /* 64px */

    /* ═════════════════════════════════════════
       圆角阶梯
       ═════════════════════════════════════════ */
    --radius-none:  0px;
    --radius-xs:    0.25rem;  /*  4px */
    --radius-sm:    0.375rem; /*  6px */
    --radius-md:    0.5rem;   /*  8px */
    --radius-lg:    0.75rem;  /* 12px */
    --radius-xl:    1rem;     /* 16px */
    --radius-2xl:   1.5rem;   /* 24px */
    --radius-full:  9999px;

    /* ═════════════════════════════════════════
       字号 / 行高 / 字重
       ═════════════════════════════════════════ */
    --font-size-xs:     0.75rem;
    --font-lineheight-xs:   1rem;
    --font-size-sm:     0.875rem;
    --font-lineheight-sm:   1.25rem;
    --font-size-base:   1rem;
    --font-lineheight-base: 1.5rem;
    --font-size-lg:     1.125rem;
    --font-lineheight-lg:   1.75rem;
    --font-size-xl:     1.25rem;
    --font-lineheight-xl:   1.75rem;
    --font-size-2xl:    1.5rem;
    --font-lineheight-2xl:  2rem;
    --font-size-3xl:    1.875rem;
    --font-lineheight-3xl:  2.25rem;
    --font-size-4xl:    2.25rem;
    --font-lineheight-4xl:  2.5rem;

    --font-weight-normal:   400;
    --font-weight-medium:   500;
    --font-weight-semibold: 600;
    --font-weight-bold:     700;

    /* ═════════════════════════════════════════
       阴影层级
       ═════════════════════════════════════════ */
    --elevation-shadow-1: 0 1px 2px  rgba(0,0,0,0.04);
    --elevation-shadow-2: 0 1px 3px  rgba(0,0,0,0.06), 0 1px 2px  rgba(0,0,0,0.04);
    --elevation-shadow-3: 0 4px 6px  rgba(0,0,0,0.06), 0 2px 4px  rgba(0,0,0,0.04);
    --elevation-shadow-4: 0 10px 15px rgba(0,0,0,0.08), 0 4px 6px  rgba(0,0,0,0.04);
    --elevation-shadow-5: 0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04);

    /* ═════════════════════════════════════════
       Z-Index 层级表 — 全站唯一 z-index 定义处
       ═════════════════════════════════════════ */
    --z-base:       0;
    --z-dropdown:   200;
    --z-sticky:     400;
    --z-overlay:    600;
    --z-modal:      800;
    --z-toast:      1000;
    --z-tooltip:    1200;
    --z-command:    1400;

    /* ═════════════════════════════════════════
       动效时长 & 缓动函数
       ═════════════════════════════════════════ */
    --motion-duration-instant: 0ms;
    --motion-duration-fast:    150ms;
    --motion-duration-base:    200ms;
    --motion-duration-slow:    300ms;
    --motion-duration-gentle:  500ms;

    --motion-easing-default: cubic-bezier(0.4, 0, 0.2, 1);
    --motion-easing-in:      cubic-bezier(0.4, 0, 1, 1);
    --motion-easing-out:     cubic-bezier(0, 0, 0.2, 1);
    --motion-easing-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);

    /* ═════════════════════════════════════════
       容器宽度
       ═════════════════════════════════════════ */
    --container-page:     none;
    --container-content:  900px;
    --container-dialog:   512px;
    --container-sheet:    448px;

    /* ═════════════════════════════════════════
       字体族
       ═════════════════════════════════════════ */
    --font-family-sans:  'Figtree Variable', ui-sans-serif, system-ui, sans-serif;
    --font-family-mono:  'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    --font-family-display: var(--font-family-sans);
  }

  /* ═════════════════════════════════════════
     reduced-motion 全局适配
     ═════════════════════════════════════════ */
  @media (prefers-reduced-motion: reduce) {
    :root {
      --motion-duration-fast:   0ms;
      --motion-duration-base:   0ms;
      --motion-duration-slow:   0ms;
      --motion-duration-gentle: 0ms;
    }
  }
}
```

---

## 三、Step 2：语义令牌文件

### 3.1 创建 `frontend/src/styles/semantic.css`

```css
/* ═══════════════════════════════════════════════════════════
   TwinSystem — 语义令牌（Semantic Tokens）
   表达设计意图。亮色主题默认映射。组件只消费此层。
   ═══════════════════════════════════════════════════════════ */

@layer base {
  /* ═══════ 亮色主题默认映射 ═══════ */
  :root, .theme-standard {
    /* ── 表面色 ── */
    --app-color-surface-page:      var(--color-slate-50);
    --app-color-surface-container: var(--color-white);
    --app-color-surface-elevated:  var(--color-white);
    --app-color-surface-hover:     var(--color-slate-50);
    --app-color-surface-active:    var(--color-blue-50);

    /* ── 文字色 ── */
    --app-color-text-primary:      var(--color-slate-950);
    --app-color-text-secondary:    var(--color-slate-600);
    --app-color-text-tertiary:     var(--color-slate-400);
    --app-color-text-inverse:      var(--color-white);

    /* ── 交互色 ── */
    --app-color-accent:            var(--color-blue-500);
    --app-color-accent-hover:      var(--color-blue-600);
    --app-color-accent-active:     var(--color-blue-700);
    --app-color-accent-soft:       var(--color-blue-50);

    /* ── 边框色 ── */
    --app-color-border-default:    var(--color-slate-200);
    --app-color-border-strong:     var(--color-blue-500);

    /* ── 反馈色 ── */
    --app-color-feedback-danger:        var(--color-red-500);
    --app-color-feedback-danger-soft:   var(--color-red-50);
    --app-color-feedback-warning:       var(--color-amber-500);
    --app-color-feedback-warning-soft:  var(--color-amber-50);
    --app-color-feedback-success:       var(--color-green-500);
    --app-color-feedback-success-soft:  var(--color-green-50);
    --app-color-feedback-info:          var(--color-cyan-500);
    --app-color-feedback-info-soft:     var(--color-cyan-50);

    /* ── 间距语义 ── */
    --app-space-container-padding: var(--space-6);
    --app-space-section-gap:       var(--space-8);
    --app-space-element-gap:       var(--space-3);
    --app-space-page-padding:      var(--space-6);

    /* ── 圆角语义 ── */
    --app-radius-container: var(--radius-lg);
    --app-radius-element:   var(--radius-md);
    --app-radius-pill:      var(--radius-full);

    /* ── 阴影语义 ── */
    --app-elevation-card:     var(--elevation-shadow-2);
    --app-elevation-dropdown: var(--elevation-shadow-3);
    --app-elevation-modal:    var(--elevation-shadow-5);

    /* ── 动效语义 ── */
    --app-motion-hover:  var(--motion-duration-fast) var(--motion-easing-default);
    --app-motion-enter:  var(--motion-duration-base) var(--motion-easing-out);
    --app-motion-exit:   var(--motion-duration-fast) var(--motion-easing-in);
    --app-motion-layout: var(--motion-duration-slow) var(--motion-easing-spring);

    /* ── 排版语义 ── */
    --app-font-display:   var(--font-weight-bold) var(--font-size-4xl) / var(--font-lineheight-4xl) var(--font-family-display);
    --app-font-heading1:  var(--font-weight-semibold) var(--font-size-3xl) / var(--font-lineheight-3xl) var(--font-family-sans);
    --app-font-heading2:  var(--font-weight-semibold) var(--font-size-2xl) / var(--font-lineheight-2xl) var(--font-family-sans);
    --app-font-heading3:  var(--font-weight-medium) var(--font-size-xl) / var(--font-lineheight-xl) var(--font-family-sans);
    --app-font-body:      var(--font-weight-normal) var(--font-size-base) / var(--font-lineheight-base) var(--font-family-sans);
    --app-font-caption:   var(--font-weight-normal) var(--font-size-sm) / var(--font-lineheight-sm) var(--font-family-sans);
    --app-font-small:     var(--font-weight-normal) var(--font-size-xs) / var(--font-lineheight-xs) var(--font-family-sans);
    --app-font-code:      var(--font-weight-normal) var(--font-size-sm) / var(--font-lineheight-sm) var(--font-family-mono);
  }

  /* ═══════ 暗色主题映射 ═══════ */
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

    --app-color-feedback-danger:        var(--color-red-400);
    --app-color-feedback-danger-soft:   var(--color-red-950);
    --app-color-feedback-warning:       var(--color-amber-400);
    --app-color-feedback-warning-soft:  var(--color-amber-950);
    --app-color-feedback-success:       var(--color-green-400);
    --app-color-feedback-success-soft:  var(--color-green-950);
    --app-color-feedback-info:          var(--color-cyan-400);
    --app-color-feedback-info-soft:     var(--color-cyan-950);
  }

  /* ═══════ 科幻流光主题映射 ═══════ */
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

    --app-color-feedback-danger:        var(--color-red-400);
    --app-color-feedback-danger-soft:   var(--color-red-950);
    --app-color-feedback-warning:       var(--color-amber-400);
    --app-color-feedback-warning-soft:  var(--color-amber-950);
    --app-color-feedback-success:       var(--color-green-400);
    --app-color-feedback-success-soft:  var(--color-green-950);
    --app-color-feedback-info:          var(--color-cyan-400);
    --app-color-feedback-info-soft:     var(--color-cyan-950);

    --app-radius-container: var(--radius-xl);
    --app-radius-element:   var(--radius-md);
  }
}
```

---

## 四、Step 3：修改 index.css

### 4.1 当前 index.css 的结构

```
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/figtree";
@import "@/features/student/config/student-design-tokens.css";
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root { ...现有 shadcn 变量 + Twin 令牌 }
  .dark { ...暗色覆盖 }
}
```

### 4.2 修改后

```css
/* ── 第三方 ── */
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/figtree";

/* ── TwinSystem 设计令牌（新体系） ── */
@import "@/styles/tokens.css";         /* Step 1: 基础令牌 */
@import "@/styles/semantic.css";       /* Step 2: 语义令牌 + 三主题映射 */

/* ── 学生端独立令牌（保留，后续逐步合并） ── */
@import "@/features/student/config/student-design-tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* ═══════ shadcn 兼容映射（保留现有组件不崩） ═══════ */
  :root {
    --background:            var(--app-color-surface-page);
    --foreground:            var(--app-color-text-primary);
    --card:                  var(--app-color-surface-container);
    --card-foreground:       var(--app-color-text-primary);
    --popover:               var(--app-color-surface-elevated);
    --popover-foreground:    var(--app-color-text-primary);
    --primary:               var(--app-color-accent);
    --primary-foreground:    var(--color-white);
    --secondary:             var(--app-color-surface-hover);
    --secondary-foreground:  var(--app-color-text-primary);
    --muted:                 var(--app-color-surface-hover);
    --muted-foreground:      var(--app-color-text-secondary);
    --accent:                var(--app-color-accent-soft);
    --accent-foreground:     var(--app-color-text-primary);
    --destructive:           var(--app-color-feedback-danger);
    --destructive-foreground: var(--color-white);
    --border:                var(--app-color-border-default);
    --input:                 var(--app-color-border-default);
    --ring:                  var(--app-color-accent);
    --radius:                var(--app-radius-element);

    /* 侧边栏 shadcn 兼容 */
    --sidebar:               var(--app-color-surface-container);
    --sidebar-foreground:    var(--app-color-text-primary);
    --sidebar-primary:       var(--app-color-accent);
    --sidebar-primary-foreground: var(--color-white);
    --sidebar-accent:        var(--app-color-surface-hover);
    --sidebar-accent-foreground: var(--app-color-text-primary);
    --sidebar-border:        var(--app-color-border-default);
    --sidebar-ring:          var(--app-color-accent);
  }

  /* ── 暗色模式下 shadcn 变量跟随语义令牌自动切换（无需手动覆盖） ── */

  /* ── 全局基础样式（保留） ── */
  .theme {
    --font-sans: 'Figtree Variable', sans-serif;
  }
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

### 4.3 关键改动点

| 改动 | 说明 |
|------|------|
| 新增 `@import "@/styles/tokens.css"` | 在 `@tailwind` 之前加载基础令牌 |
| 新增 `@import "@/styles/semantic.css"` | 在 `@tailwind` 之前加载语义映射 |
| shadcn `:root` 变量改为引用 `--app-*` | 不再直接写死 oklch 值，改为 `var(--app-*-)` |
| 移除 `.dark` 中重复的 shadcn 变量覆盖 | 语义令牌层已在 `.dark` 中重映射，shadcn 变量自动跟随 |
| **保留** `student-design-tokens.css` | 不影响现有学生端 |
| **保留** `@tailwind` 三件套和现有全局样式 | 不破坏现有布局 |

---

## 五、Step 4：Tailwind 配置桥接

### 5.1 修改 `frontend/tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                /* ── shadcn 现有：保持不变，通过 CSS 变量引用新令牌 ── */
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },

                /* ── 新增：直接引用新语义令牌（用于 Tailwind 类名） ── */
                app: {
                    surface: {
                        page:      "var(--app-color-surface-page)",
                        container: "var(--app-color-surface-container)",
                        elevated:  "var(--app-color-surface-elevated)",
                        hover:     "var(--app-color-surface-hover)",
                        active:    "var(--app-color-surface-active)",
                    },
                    text: {
                        primary:   "var(--app-color-text-primary)",
                        secondary: "var(--app-color-text-secondary)",
                        tertiary:  "var(--app-color-text-tertiary)",
                        inverse:   "var(--app-color-text-inverse)",
                    },
                    accent: {
                        DEFAULT: "var(--app-color-accent)",
                        hover:   "var(--app-color-accent-hover)",
                        active:  "var(--app-color-accent-active)",
                        soft:    "var(--app-color-accent-soft)",
                    },
                    border: {
                        DEFAULT: "var(--app-color-border-default)",
                        strong:  "var(--app-color-border-strong)",
                    },
                    feedback: {
                        danger:      "var(--app-color-feedback-danger)",
                        dangerSoft:  "var(--app-color-feedback-danger-soft)",
                        warning:     "var(--app-color-feedback-warning)",
                        warningSoft: "var(--app-color-feedback-warning-soft)",
                        success:     "var(--app-color-feedback-success)",
                        successSoft: "var(--app-color-feedback-success-soft)",
                        info:        "var(--app-color-feedback-info)",
                        infoSoft:    "var(--app-color-feedback-info-soft)",
                    },
                },

                /* ── 学生端令牌（保持不变） ── */
                student: {
                    primary: "var(--student-primary)",
                    'primary-soft': "var(--student-primary-soft)",
                    ink: "var(--student-ink)",
                    body: "var(--student-body)",
                    mute: "var(--student-mute)",
                    canvas: "var(--student-canvas)",
                    'canvas-soft': "var(--student-canvas-soft)",
                    hairline: "var(--student-hairline)",
                    success: "var(--student-success)",
                    error: "var(--student-error)",
                    warning: "var(--student-warning)",
                },
            },

            /* ── 圆角（新增 app 命名空间 + 保留原有） ── */
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
                'twin-xs': '4px',
                'twin-sm': '6px',
                'twin-md': '8px',
                'twin-lg': '12px',
                'twin-xl': '16px',
                'twin-pill': '100px',
                'twin-full': '9999px',
                'student-xs': "var(--student-radius-xs)",
                'student-sm': "var(--student-radius-sm)",
                'student-md': "var(--student-radius-md)",
                'student-lg': "var(--student-radius-lg)",
                'student-pill': "var(--student-radius-pill)",
                'student-full': "var(--student-radius-full)",
                /* 新：语义令牌引用 */
                'app-container': "var(--app-radius-container)",
                'app-element': "var(--app-radius-element)",
                'app-pill': "var(--app-radius-pill)",
            },

            /* ── 阴影（保留现有，新增语义引用） ── */
            boxShadow: {
                'twin-level-1': '0 0 0 1px rgba(0,0,0,0.08) inset',
                'twin-level-2': '0 1px 1px rgba(0,0,0,0.02), 0 2px 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'twin-level-3': '0 2px 2px rgba(0,0,0,0.04), 0 8px 8px -8px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'twin-level-4': '0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'twin-level-5': '0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04), 0 24px 32px -8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'student-card': "var(--student-shadow-card)",
                'student-card-hover': "var(--student-shadow-card-hover)",
                'student-modal': "var(--student-shadow-modal)",
                /* 新：语义令牌引用 */
                'app-card': "var(--app-elevation-card)",
                'app-dropdown': "var(--app-elevation-dropdown)",
                'app-modal': "var(--app-elevation-modal)",
            },

            /* ── 新增：语义间距工具类 ── */
            spacing: {
                'app-container-padding': "var(--app-space-container-padding)",
                'app-section-gap': "var(--app-space-section-gap)",
                'app-element-gap': "var(--app-space-element-gap)",
                'app-page-padding': "var(--app-space-page-padding)",
            },

            /* ── 动效（保留） ── */
            keyframes: {
                blob: {
                    "0%": { transform: "translate(0px, 0px) scale(1)" },
                    "33%": { transform: "translate(30px, -50px) scale(1.1)" },
                    "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
                    "100%": { transform: "translate(0px, 0px) scale(1)" },
                },
                'skeleton-pulse': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.4' },
                },
                'fade-in': {
                    '0%': { opacity: '0', transform: 'translateY(4px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: {
                blob: "blob 10s infinite alternate",
                'skeleton-pulse': 'skeleton-pulse 1.8s ease-in-out infinite',
                'fade-in': 'fade-in 0.3s ease-out',
            },
        },
    },
    plugins: [],
};
```

### 5.2 Tailwind 类名使用对照

| 旧写法（硬编码） | 新写法（通过 Tailwind 类名） | 等效 CSS 变量 |
|------|------|------|
| `bg-white` | `bg-app-surface-container` | `var(--app-color-surface-container)` |
| `bg-slate-50` | `bg-app-surface-page` | `var(--app-color-surface-page)` |
| `text-slate-900` | `text-app-text-primary` | `var(--app-color-text-primary)` |
| `text-slate-500` | `text-app-text-secondary` | `var(--app-color-text-secondary)` |
| `rounded-lg` | `rounded-app-container` | `var(--app-radius-container)` |
| `rounded-md` | `rounded-app-element` | `var(--app-radius-element)` |
| `shadow-md` | `shadow-app-card` | `var(--app-elevation-card)` |
| `px-6` | `px-app-container-padding` | `var(--app-space-container-padding)` |
| `gap-8` | `gap-app-section-gap` | `var(--app-space-section-gap)` |

---

## 六、Step 5：主题切换系统

### 6.1 创建 `frontend/src/features/theme/types.ts`

```typescript
export interface ThemeDefinition {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  className: string;
  preview: {
    accent: string;
    surface: string;
    text: string;
  };
}
```

### 6.2 创建 `frontend/src/features/theme/themeRegistry.ts`

```typescript
import type { ThemeDefinition } from './types';

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

export function getThemeById(id: string): ThemeDefinition {
  return THEME_REGISTRY.find(t => t.id === id) || THEME_REGISTRY[0];
}
```

### 6.3 创建 `frontend/src/features/theme/ThemeProvider.tsx`

```typescript
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { THEME_REGISTRY, getThemeById } from './themeRegistry';
import type { ThemeDefinition } from './types';

interface ThemeContextValue {
  themeId: string;
  theme: ThemeDefinition;
  setThemeId: (id: string) => void;
  themes: ThemeDefinition[];
  cycleTheme: () => void;  // 快捷键循环切换
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'twin-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && THEME_REGISTRY.some(t => t.id === stored)) return stored;
    } catch { /* localStorage 被禁用时忽略 */ }
    return 'standard';
  });

  const theme = getThemeById(themeId);

  const setThemeId = useCallback((id: string) => {
    if (!THEME_REGISTRY.some(t => t.id === id)) return;
    setThemeIdState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = THEME_REGISTRY.findIndex(t => t.id === themeId);
    const next = THEME_REGISTRY[(idx + 1) % THEME_REGISTRY.length];
    setThemeId(next.id);
  }, [themeId, setThemeId]);

  useEffect(() => {
    const root = document.documentElement;

    // 清除所有主题 class
    THEME_REGISTRY.forEach(t => root.classList.remove(t.className));

    // 挂载当前主题 class
    root.classList.add(theme.className);

    // 同步 Tailwind darkMode
    if (theme.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ themeId, theme, setThemeId, themes: THEME_REGISTRY, cycleTheme }}>
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

### 6.4 创建 `frontend/src/features/theme/ThemeSwitcher.tsx`

```typescript
import { useTheme } from './ThemeProvider';
import { Sun, Moon, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, typeof Sun> = {
  standard: Sun,
  'standard-dark': Moon,
  scifi: Sparkles,
};

export function ThemeSwitcher({ className }: { className?: string }) {
  const { themeId, cycleTheme, theme } = useTheme();
  const Icon = iconMap[themeId] || Sun;

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-app-element px-2 py-1.5 text-app-text-secondary',
        'hover:bg-app-surface-hover hover:text-app-text-primary',
        'transition-all duration-150',
        className
      )}
      title={`当前主题：${theme.label} — 点击切换`}
    >
      <Icon className="size-4" />
      <span className="text-xs font-medium">{theme.label}</span>
    </button>
  );
}
```

---

## 七、Step 6：App.tsx 接线

修改 `frontend/src/App.tsx`，在 `QueryClientProvider` 内包裹 `ThemeProvider`：

```tsx
import { ThemeProvider } from '@/features/theme/ThemeProvider';

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

`ThemeProvider` 的位置在 `QueryClientProvider` 之下、所有消费者之上——保证 `useQuery` 和主题切换互不干扰。

---

## 八、组件迁改对照表

### 8.1 Z-Index 迁改

> 全局搜索 `z-[` 并替换为令牌引用。

| 文件 | 旧值 | 新值 |
|------|------|------|
| `dialog.tsx` — DialogOverlay | `z-[100]` | `z-[var(--z-overlay)]` |
| `dialog.tsx` — DialogContent | `z-[101]` | `z-[var(--z-modal)]` |
| `dialog.tsx` — leftSheet/rightSheet overlay | `z-[199]` | `z-[var(--z-overlay)]` |
| `dialog.tsx` — leftSheet/rightSheet content | `z-[200]` | `z-[var(--z-modal)]` |
| `dropdown-menu.tsx` — content | `z-[1400]` | `z-[var(--z-command)]` |
| `command.tsx` — overlay | `z-[1300]` | `z-[var(--z-command)]` |
| `command.tsx` — content | `z-[1301]` | `z-[var(--z-command)]` |
| `PersonnelSearchDropdown.tsx` — dropdown | `z-[9999]` | `z-[var(--z-dropdown)]` |
| `PersonnelSearchDropdown.tsx` — modal | `z-[99999]` | `z-[var(--z-modal)]` |
| `ViolationNoticeBanner.tsx` — modal | `z-[100130]` | `z-[var(--z-modal)]` |
| `PopupErrorBoundary.tsx` — overlay | `z-[99999]` | `z-[var(--z-overlay)]` |
| `AnimalRoomTelemetryPage.tsx` — overlay | `z-[500]` | `z-[var(--z-overlay)]` |
| `StaffMessagesPage.tsx` — context menu | `z-[220]` | `z-[var(--z-dropdown)]` |
| `RepairRequestPage.tsx` — overlay | `z-[1200]` | `z-[var(--z-overlay)]` |
| `RepairProcessPage.tsx` — overlay | `z-[1200]` | `z-[var(--z-overlay)]` |
| `PurchaseRequestPage.tsx` — overlay | `z-[1200]` | `z-[var(--z-overlay)]` |
| `PurchaseProcessPage.tsx` — overlay | `z-[1200]` | `z-[var(--z-overlay)]` |
| `AdminLayout.tsx` — 多个 DialogContent | `z-[320]` | `z-[var(--z-modal)]` |
| `AnalyticsCopilotDialog.tsx` — overlay | `z-[200]` | `z-[var(--z-modal)]` |

### 8.2 颜色迁改

| 旧写法 | 新写法 | 适用场景 |
|------|------|------|
| `bg-white` | `bg-app-surface-container` | 卡片、面板 |
| `bg-slate-50` | `bg-app-surface-page` | 页面底色 |
| `bg-slate-100` | `bg-app-surface-hover` | 悬停态 |
| `text-slate-900` | `text-app-text-primary` | 正文、标题 |
| `text-slate-500` | `text-app-text-secondary` | 辅助文字 |
| `text-slate-400` | `text-app-text-tertiary` | 占位、禁用 |
| `border-slate-200` | `border-app-border` | 默认边框 |
| `text-blue-500` | `text-app-accent` | 主交互色 |
| `text-red-500` | `text-app-feedback-danger` | 错误 |
| `bg-red-50` | `bg-app-feedback-dangerSoft` | 错误浅底 |
| `text-green-500` | `text-app-feedback-success` | 成功 |
| `bg-green-50` | `bg-app-feedback-successSoft` | 成功浅底 |

### 8.3 间距迁改

| 旧写法 | 新写法 | 适用场景 |
|------|------|------|
| `p-6` | `p-app-container-padding` | 面板内边距 |
| `gap-8` | `gap-app-section-gap` | 区块间距 |
| `gap-3` | `gap-app-element-gap` | 同行元素间距 |

### 8.4 圆角/阴影迁改

| 旧写法 | 新写法 |
|------|------|
| `rounded-lg` | `rounded-app-container` |
| `rounded-md` | `rounded-app-element` |
| `shadow-md` | `shadow-app-card` |

---

## 九、验证清单

### 9.1 令牌加载验证

打开浏览器 DevTools → Elements → 检查 `<html>` 上的 computed styles：

- [ ] `--color-slate-500` 存在且有值
- [ ] `--app-color-surface-page` 存在且等于 `oklch(0.985 0 0)`
- [ ] `--background` 存在且引用了 `--app-color-surface-page`

### 9.2 主题切换验证

- [ ] 默认加载标准（亮色）主题
- [ ] `localStorage.getItem('twin-theme')` === `'standard'`
- [ ] 切换到暗色：`<html>` 出现 `class="theme-standard-dark dark"`
- [ ] 切换到科幻：`<html>` 出现 `class="theme-scifi dark"`
- [ ] 刷新页面后主题保持（localStorage 持久化）
- [ ] 切换过程中无白屏闪烁

### 9.3 组件验证

- [ ] `Button` 组件在各变体下颜色正确
- [ ] `Dialog` 组件 z-index 正确、遮罩颜色正确
- [ ] `DropdownMenu` 暗色背景下可见
- [ ] 表格在亮/暗模式下斑马纹正确
- [ ] 学生端页面主题切换后颜色不变（独立令牌体系）

### 9.4 回归验证

- [ ] `npm run dev` 启动无 CSS 编译错误
- [ ] 登录页样式正常
- [ ] TwinLayout 侧边栏样式正常
- [ ] AdminLayout 侧边栏样式正常
- [ ] 管理端所有页面 5 分钟快速浏览，无明显错乱

---

## 十、常见问题

### Q: Tailwind 的 `bg-app-surface-container` 不生效？

A: 检查两个点：
1. `tailwind.config.js` 的 `theme.extend.colors.app` 节点是否正确嵌套
2. CSS 变量是否在 `@layer base` 内定义（`tokens.css` 和 `semantic.css` 都必须在 `@layer base` 内）

### Q: 暗色模式切换后部分组件颜色不对？

A: 检查该组件是否直接使用了基础色板类名（如 `bg-slate-900`）而非语义类名（`bg-app-surface-container`）。直接引用基础色板不受主题控制。

### Q: 新增主题只需改什么？

A: 两步：
1. 在 `semantic.css` 中新增 `.{theme-name}` 块，覆盖语义令牌映射
2. 在 `themeRegistry.ts` 中追加注册项

---

## 十一、🍱 Bento 设计系统集成（v1.5 新增）

> 本章节提供 Bento 风格迁移的精确代码。适用于从经典 slate-blue 配色切换到 Bento 暖桃色系。

### 11.1 集成概览

```
Step B1: 安装 Inter 字体          ← @fontsource-variable/inter
Step B2: 更新 tokens.css          ← 追加 Warm/Peach/Steel 色系
Step B3: 更新 semantic.css        ← 修改亮色主题映射为 Bento 暖色
Step B4: 新增 .theme-classic      ← 保留经典 slate-blue 方案
Step B5: 验证 Bento 主题生效       ← 浏览器 DevTools 检查 CSS 变量
```

### 11.2 Step B1：安装 Inter 字体

```bash
cd frontend
npm install @fontsource-variable/inter
```

### 11.3 Step B2：更新基础令牌文件

在 `frontend/src/styles/tokens.css` 的色板定义末尾（`--color-black` 之后、`}` 之前）追加：

```css
/* ── 🍱 Bento Warm (warm cream #FFF5E6 → oklch) ── */
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

/* ── 🍱 Bento Peach (warm peach #FAD4C0 → oklch) ── */
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

/* ── 🍱 Bento Steel (steel blue #80A1C1 → oklch) ── */
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
```

同时在 `tailwind.config.js` 的 `theme.extend.colors` 中追加：

```js
// tailwind.config.js — 追加 Bento 色系到 app 节点
colors: {
  app: {
    // ... 原有色系 ...
    'warm-50':   'var(--color-warm-50)',
    'warm-100':  'var(--color-warm-100)',
    // ... (11 档完整映射，参照现有 slate 模式) ...
    'peach-50':  'var(--color-peach-50)',
    // ... (11 档)
    'peach-500': 'var(--color-peach-500)',
    // ...
    'steel-50':  'var(--color-steel-50)',
    // ... (11 档)
  }
}
```

### 11.4 Step B3：更新语义令牌（Bento 亮色主题）

修改 `frontend/src/styles/semantic.css` 的 `:root, .theme-standard` 块：

```css
:root, .theme-standard {
  /* Surface — Bento: warm cream surface #FFF5E6 */
  --app-color-surface-page:      var(--color-warm-50);    /* #FFF5E6 */
  --app-color-surface-container: var(--color-white);
  --app-color-surface-elevated:  var(--color-white);
  --app-color-surface-hover:     var(--color-warm-100);
  --app-color-surface-active:    var(--color-peach-100);

  /* Text — Bento: #111827 near-black */
  --app-color-text-primary:      var(--color-slate-900);
  --app-color-text-secondary:    var(--color-slate-600);
  --app-color-text-tertiary:     var(--color-slate-400);
  --app-color-text-inverse:      var(--color-white);

  /* Accent — Bento: warm peach #FAD4C0 + steel blue #80A1C1 */
  --app-color-accent:            var(--color-peach-500);
  --app-color-accent-hover:      var(--color-peach-600);
  --app-color-accent-active:     var(--color-peach-700);
  --app-color-accent-soft:       var(--color-peach-100);
  --app-color-accent-secondary:  var(--color-steel-500);

  /* Border */
  --app-color-border-default:    var(--color-warm-200);
  --app-color-border-strong:     var(--color-peach-400);

  /* Feedback — Bento 语义色 */
  --app-color-feedback-danger:       var(--color-red-500);
  --app-color-feedback-danger-soft:  var(--color-red-50);
  --app-color-feedback-warning:      var(--color-amber-500);
  --app-color-feedback-warning-soft: var(--color-amber-50);
  --app-color-feedback-success:      var(--color-green-500);
  --app-color-feedback-success-soft: var(--color-green-50);
  --app-color-feedback-info:         var(--color-steel-500);
  --app-color-feedback-info-soft:    var(--color-steel-100);
}
```

### 11.5 Step B4：新增 `.theme-classic`（保留旧方案）

在 `semantic.css` 中追加：

```css
/* 经典 slate-blue 主题 — 回退到 v1.4 配色 */
.theme-classic {
  --app-color-surface-page:      var(--color-slate-50);
  --app-color-surface-container: var(--color-white);
  --app-color-surface-hover:     var(--color-slate-50);
  --app-color-surface-active:    var(--color-blue-50);

  --app-color-accent:            var(--color-blue-500);
  --app-color-accent-hover:      var(--color-blue-600);
  --app-color-accent-soft:       var(--color-blue-50);
  --app-color-accent-secondary:  var(--color-blue-400);

  --app-color-border-default:    var(--color-slate-200);
  --app-color-border-strong:     var(--color-blue-500);
}
```

同时在 `themeRegistry.ts` 中注册 `theme-classic`：

```ts
export const themeRegistry: ThemeEntry[] = [
  { id: 'standard',  name: 'Bento 暖色',   className: 'theme-standard' },
  { id: 'classic',   name: '经典 Slate',    className: 'theme-classic' },
  { id: 'dark',      name: '暗色模式',      className: 'theme-standard-dark' },
]
```

### 11.6 Step B5：验证

```bash
# 1. 确认 CSS 变量加载
# DevTools → Elements → Computed → 搜索 --color-peach-500 → 应显示 oklch(0.74 0.14 47)

# 2. 确认亮色主题
# body 应有 --app-color-surface-page = oklch(0.98 0.01 82)（暖奶油色）

# 3. 确认字体
# body 的 font-family 应包含 'Inter Variable'

# 4. 切换为经典主题
# body 加 class="theme-classic" → 颜色恢复为 slate-blue
```

---

*本文档是 [UI设计规范与主题标准.md](UI设计规范与主题标准.md) 的实施配方，包含精确的代码和迁改步骤。*
*版本 v1.6 — 新增当前状态概览；令牌体系已全量落地。*
