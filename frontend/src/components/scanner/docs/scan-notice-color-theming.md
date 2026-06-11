# 扫码公告灵动岛颜色修改指南

> **状态**：诊断完成，待修复
> **日期**：2026-06-11
> **相关文件**：`scanPopupTheme.ts`、`scanPopupNotice.css`、`ScanPopupNoticeBanner.tsx`

---

## 一、问题诊断

### 1.1 症状

扫码弹窗顶部灵动岛公告小窗口（`ScanPopupNoticeBanner`）的颜色无法通过修改 `--app-color-*` 令牌来调整。无论怎么改主题，公告始终是固定的 rose（玫瑰红）色系。

### 1.2 根因

颜色值在 [`scanPopupTheme.ts`](../scanPopupTheme.ts) 的 `noticeThemeCssVars()` 函数中以**硬编码 hex 值**定义，完全绕过了项目的三层令牌体系。

```typescript
// ❌ 当前代码 — scanPopupTheme.ts 第 98-119 行
export function noticeThemeCssVars(kind: NoticeKind): Record<string, string> {
  const colors = {
    announcement: {
      accent: "#fb7185",      // 硬编码 hex，不引用 --app-color-*
      bg: "#fff1f2",
      bgDark: "#1c1014",
      border: "#fecdd3",
      text: "#be123c",
      panelBg: "#fff5f5",
      panelBgDark: "#1c1416",
    },
    // violation 和 unbound 同样硬编码
  };
  // 直接输出为 CSS 变量
  return {
    '--notice-accent': c.accent,
    '--notice-bg': c.bg,
    // ...
  };
}
```

这些变量注入到 Portal 根节点的 `style` 属性，优先级高于任何 CSS 文件，**无法通过外部 CSS 覆盖**。

### 1.3 影响范围

| 类型 | `kind` 值 | 硬编码色系 | 影响组件 |
|------|-----------|-----------|---------|
| 扫码公告 | `"announcement"` | rose（玫瑰红 #fb7185） | 灵动岛 Island 按钮 + 详情弹窗 |
| 违规通告 | `"violation"` | amber（琥珀 #f59e0b） | 同上 |
| 未绑卡提示 | `"unbound"` | orange（橙色 #f97316） | 同上 |

---

## 二、正确的架构

### 2.1 项目令牌体系（必须遵循）

```
组件令牌（第三层）  →  语义令牌（第二层）  →  基础令牌（第一层）
--scan-notice-*        --app-color-*          --color-peach-500
                                                  #FAD4C0
```

**原则**：组件令牌只能引用语义令牌层的 `--app-color-*`，禁止跨组件引用，禁止硬编码。

### 2.2 正确做法：对标 smartsheet 组件

[`smartsheet-theme.css`](../../styles/smartsheet-theme.css) 是正确的参考实现：

```css
/* ✅ 正确模式 — smartsheet 的组件令牌全部引用语义层 */
--smartsheet-accent:  var(--app-color-accent);
--smartsheet-success: var(--app-color-feedback-success);
--smartsheet-warning: var(--app-color-feedback-warning);
--smartsheet-danger:  var(--app-color-feedback-danger);
```

### 2.3 公告组件的设计意图

三种公告类型（announcement / violation / unbound）有不同的**语义色彩**：

| 类型 | 语义 | 应映射的令牌 |
|------|------|-------------|
| `announcement` | 系统公告/信息通知 | `--app-color-accent`（当前 Bento 暖桃色）或 `--app-color-feedback-info` |
| `violation` | 违规警告 | `--app-color-feedback-warning`（琥珀） |
| `unbound` | 未绑卡提醒 | `--app-color-feedback-warning` 或独立色系 |

**关键认识**：这三类公告可以保有各自的颜色区分（不强制统一为一个色），但每种颜色必须通过 `--app-color-*` 令牌引用，而非 hex 硬编码。

---

## 三、修改方案

### 方案 A：直接映射到反馈令牌（最小改动，推荐）

让三种公告类型分别映射到已有的 `--app-color-feedback-*` 语义令牌。

**步骤 1**：改造 `scanPopupNotice.css` — 去除 `--notice-*` 中间层，直接引用语义令牌

```css
/* scan-notice-theme-announcement */
.scan-notice-theme-announcement {
  --scan-notice-accent: var(--app-color-accent);
  --scan-notice-accent-soft: color-mix(in srgb, var(--app-color-accent) 18%, transparent);
  --scan-notice-accent-ink: var(--app-color-text-primary);
  --scan-notice-border: color-mix(in srgb, var(--app-color-accent) 38%, var(--app-color-border-default));
  --scan-notice-surface-top: var(--app-color-surface-page);
  --scan-notice-surface-bottom: var(--app-color-surface-container);
  --scan-notice-glow: color-mix(in srgb, var(--app-color-accent) 22%, transparent);
}

.scan-notice-theme-violation {
  --scan-notice-accent: var(--app-color-feedback-warning);
  --scan-notice-accent-soft: color-mix(in srgb, var(--app-color-feedback-warning) 18%, transparent);
  --scan-notice-accent-ink: var(--app-color-text-primary);
  --scan-notice-border: color-mix(in srgb, var(--app-color-feedback-warning) 38%, var(--app-color-border-default));
  --scan-notice-surface-top: var(--app-color-surface-page);
  --scan-notice-surface-bottom: var(--app-color-surface-container);
  --scan-notice-glow: color-mix(in srgb, var(--app-color-feedback-warning) 22%, transparent);
}

.scan-notice-theme-unbound {
  --scan-notice-accent: var(--app-color-feedback-warning);
  --scan-notice-accent-soft: color-mix(in srgb, var(--app-color-feedback-warning) 18%, transparent);
  --scan-notice-accent-ink: var(--app-color-text-primary);
  --scan-notice-border: color-mix(in srgb, var(--app-color-feedback-warning) 38%, var(--app-color-border-default));
  --scan-notice-surface-top: var(--app-color-surface-page);
  --scan-notice-surface-bottom: var(--app-color-surface-container);
  --scan-notice-glow: color-mix(in srgb, var(--app-color-feedback-warning) 22%, transparent);
}

/* 暗色下微调边界和文字颜色 */
.dark .scan-notice-theme-announcement {
  --scan-notice-accent-ink: color-mix(in srgb, var(--app-color-accent) 55%, var(--app-color-text-primary));
  --scan-notice-border: color-mix(in srgb, var(--app-color-accent) 48%, var(--app-color-border-strong));
  --scan-notice-surface-top: var(--app-color-surface-elevated);
}

.dark .scan-notice-theme-violation {
  --scan-notice-accent-ink: color-mix(in srgb, var(--app-color-feedback-warning) 58%, var(--app-color-text-primary));
  --scan-notice-border: color-mix(in srgb, var(--app-color-feedback-warning) 48%, var(--app-color-border-strong));
  --scan-notice-surface-top: var(--app-color-surface-elevated);
}

.dark .scan-notice-theme-unbound {
  --scan-notice-accent-ink: color-mix(in srgb, var(--app-color-feedback-warning) 52%, var(--app-color-text-primary));
  --scan-notice-border: color-mix(in srgb, var(--app-color-feedback-warning) 48%, var(--app-color-border-strong));
  --scan-notice-surface-top: var(--app-color-surface-elevated);
}
```

**步骤 2**：清理 `scanPopupTheme.ts` — 删除不再需要的 `noticeThemeCssVars()` 函数和 `NOTICE_COLORS` 对象

**步骤 3**：更新 `ScanPopupNoticeBanner.tsx` — 移除 Portal 根节点上的 `style={noticeVars}` 注入

```tsx
// 删除这一行：
style={noticeVars as React.CSSProperties}
```

**改后效果**：修改 `--app-color-accent` 即可改变公告颜色；修改 `--app-color-feedback-warning` 即可改变违规/未绑卡颜色。

---

### 方案 B：保留类型独立色系，但通过基础令牌绑定（进阶）

如果需要公告保持独立的 rose 色系（与其他模块的 accent 颜色区分），则新增语义令牌：

**步骤 1**：在 `semantic.css` 中新增语义令牌

```css
:root {
  --app-color-notice-announcement: var(--color-rose-500);
  --app-color-notice-violation:    var(--color-amber-500);
  --app-color-notice-unbound:      var(--color-orange-500);
}

.theme-standard-dark {
  --app-color-notice-announcement: var(--color-rose-400);
  --app-color-notice-violation:    var(--color-amber-400);
  --app-color-notice-unbound:      var(--color-orange-400);
}
```

**步骤 2**：`scanPopupNotice.css` 引用新令牌（同方案 A 结构，替换引用对象）

**步骤 3**：后续任何模块想用公告色系，直接引用 `--app-color-notice-*`，实现跨组件复用。

---

## 四、自查清单（修改完成后）

根据项目 `@gates G04` 门禁，修改后必须执行以下自查：

```bash
# 1. 检查 CSS 文件中是否仍有硬编码 hex
grep -rn '#[0-9a-fA-F]\{6\}' frontend/src/styles/scanPopupNotice.css

# 2. 检查 TS 文件中是否仍有硬编码颜色注入
grep -rn "'--notice-" frontend/src/components/scanner/scanPopupTheme.ts

# 3. 确认所有颜色都通过 var(--app-color-*) 或 var(--scan-notice-*) 引用
grep -rn 'var(--scan-notice-' frontend/src/styles/scanPopupNotice.css
```

---

## 五、相关文件索引

| 文件 | 角色 | 改动 |
|------|------|------|
| [scanPopupTheme.ts](../scanPopupTheme.ts#L97-L131) | `noticeThemeCssVars()` — 硬编码 hex 的源头 | **删除或重构** |
| [scanPopupTheme.ts](../scanPopupTheme.ts#L60-L85) | `NOTICE_COLORS` — 硬编码 Tailwind 类名（疑似死代码） | **删除** |
| [scanPopupNotice.css](../../styles/scanPopupNotice.css#L39-L90) | 公告组件样式 — 消费 `--notice-*` 生成 `--scan-notice-*` | **改为引用 `--app-color-*`** |
| [ScanPopupNoticeBanner.tsx](../ScanPopupNoticeBanner.tsx#L347-L349) | Portal 注入 `style={noticeVars}` | **移除 style 注入** |
| [semantic.css](../../styles/semantic.css) | 语义令牌定义（如选方案 B） | **新增令牌** |
| [smartsheet-theme.css](../../styles/smartsheet-theme.css#L17) | ✅ 正确模式参考 | 不改动 |
