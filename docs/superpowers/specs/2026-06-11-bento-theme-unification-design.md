# Bento 主题统一适配 · 设计规格

> **日期**：2026-06-11
> **工作流**：⑧ 重构优化（UI 主题统一）
> **状态**：待实施

---

## 一、背景与目标

### 1.1 问题

项目存在三套互不通信的着色方式：

1. **Bento 令牌体系**（`--app-color-*`）— 知识库模块在用，自动响应亮/暗/科幻主题
2. **硬编码 Tailwind 色** — 7 个 debug 页面 + 扫码弹窗，不响应任何主题
3. **Sci-Fi 霓虹覆盖** — 348 行 CSS 通过 `data-twin-chrome-theme` 强制覆盖 debug 页面颜色

结果是：切换主题后，知识库页面变色了，但 debug 页面和弹窗纹丝不动。

### 1.2 目标

- 扫码弹窗 + 7 个 debug 页面全部迁移到 `--app-color-*` 令牌引用
- 三种主题（Bento 亮 / Bento 暗 / Sci-Fi 霓虹）切换时，全站统一响应
- 首页 `AdminHomePage` 保持固定暖桃色，不跟随主题
- 保留 Sci-Fi 霓虹作为独立主题选项，不做减法

### 1.3 非目标

- 不新增主题切换机制
- 不创建新组件抽象
- 不改首页配色
- 不删除 Sci-Fi 霓虹功能

---

## 二、架构决策

### 决策 1：纯令牌迁移（方案 A）

**选型**：不引入新抽象，只把所有硬编码 Tailwind 颜色类替换为 `var(--app-color-*)` 引用。

**原理**：`semantic.css` 已有的三层映射（`:root` → `.dark` → `.theme-scifi`）自动处理主题切换。组件代码不需要知道当前是哪个主题——它只引用语义令牌，由 CSS 层负责把令牌解析为具体色值。

**对比被否决的方案**：
- 方案 B（DebugPageShell 包装器）：增加组件抽象，与现有 TwinLayout 层级重叠
- 方案 C（Context 注入弹窗）：破坏令牌单向依赖，引入 if-else 分支

### 决策 2：弹窗跟随主题

弹窗覆盖层（`UiverseProfilePopup`）当前写死暗色。改为引用 `--app-color-*` 令牌后：
- 亮色主题：弹窗呈暖奶油底色 + 白色内容卡
- 暗色主题：弹窗呈暖暗炭底色 + 深色内容卡
- 科幻主题：弹窗呈深空 slate 底色 + 青色霓虹

弹窗通过 `createPortal` 渲染到 `document.body`，而 `<html>` 上的主题类由 `ThemeProvider` 维护——CSS 变量自然继承，无需 JS 干预。

### 决策 3：Sci-Fi 令牌补全而非替换

`.theme-scifi` 当前缺少部分语义令牌映射（如 `--app-color-feedback-*` 系列）。补全缺失映射即可让三套主题平等工作。旧的 `TwinChromeDebugNeonGlobal.css` 逐步退场——当 debug 页面改用令牌后，其霓虹覆盖规则自动失效（因为不再有硬编码 slate 色可供覆盖）。

---

## 三、设计规格

### 3.1 令牌映射表

#### 通用映射（所有组件和页面统一使用）

| 硬编码（旧） | 令牌（新） |
|-------------|-----------|
| `bg-slate-50`, `bg-slate-50/50` | `bg-[var(--app-color-surface-page)]` |
| `bg-white` | `bg-[var(--app-color-surface-container)]` |
| `bg-slate-100`, `hover:bg-slate-100` | `bg-[var(--app-color-surface-hover)]` |
| `text-slate-900` | `text-[var(--app-color-text-primary)]` |
| `text-slate-600` | `text-[var(--app-color-text-secondary)]` |
| `text-slate-400`, `text-slate-500` | `text-[var(--app-color-text-tertiary)]` |
| `text-white` (在暗色容器内) | `text-[var(--app-color-text-primary)]` |
| `border-slate-200`, `border-white/10` | `border-[var(--app-color-border-default)]` |
| 裸 Tailwind shadow | `shadow-[var(--app-elevation-card)]` |

#### 弹窗专用映射

| 元素 | 硬编码（旧） | 令牌（新） |
|------|-------------|-----------|
| 全屏遮罩 | `bg-[#050A15]/85` | `bg-[var(--app-color-surface-page)]/90` |
| 区域卡片 | `bg-[#1e293b]` (slate-800) | `bg-[var(--app-color-surface-container)]` |
| 半透明暗层 | `bg-black/40` | `bg-[var(--app-color-surface-container)]/40` |
| 违规琥珀强调 | `border-amber-500/45` 等硬编码 | `--app-color-feedback-warning` |
| 未绑卡青色强调 | `border-cyan-500/45` 等硬编码 | `--app-color-feedback-info` |
| 进入按钮选中态 | `bg-indigo-600` | `bg-[var(--app-color-accent)]` |

#### Sci-Fi 补充映射（追加到 `.theme-scifi` 块）

当前缺失的令牌映射：
- `--app-color-accent-secondary`
- `--app-color-border-strong`
- `--app-color-text-inverse`
- `--app-color-feedback-danger/soft`
- `--app-color-feedback-warning/soft`
- `--app-color-feedback-success/soft`
- `--app-color-feedback-info/soft`

全部映射到 cyan/slate 色系，保持 Sci-Fi 深空 + 青色霓虹调性。

### 3.2 亮/暗/科幻三套配色速查

| 令牌 | 亮色 `:root` | 暗色 `.dark` | 科幻 `.theme-scifi` |
|------|-------------|-------------|-------------------|
| `surface-page` | warm-50 (#FFF5E6) | bento-dark-50 (#12100E) | slate-950 |
| `surface-container` | white | bento-dark-100 (#1A1816) | oklch(0.17 0.01 260) |
| `surface-elevated` | white | bento-dark-200 (#22201D) | oklch(0.21 0.01 260) |
| `surface-hover` | warm-100 | bento-dark-200 | oklch(0.22 0.02 260) |
| `text-primary` | slate-900 | warm-50 (#FEF6EB) | slate-50 |
| `text-secondary` | slate-600 | warm-200 | slate-300 |
| `text-tertiary` | slate-400 | warm-300 | slate-500 |
| `accent` | peach-500 (#FAD4C0) | steel-400 (#80A1C1) | cyan-400 |
| `border-default` | warm-200 | bento-dark-300 (#2A2723) | oklch(0.25 0.01 260) |

### 3.3 不改动清单

| 保留项 | 原因 |
|--------|------|
| `AdminHomePage` 配色 | 设计意图：固定暖桃色品牌调性 |
| `ThemeProvider` | 机制已正确 |
| `TwinChromeThemeContext` | 保留 Sci-Fi 切换入口 |
| `themeRegistry.ts` | 三个主题定义不变 |
| `tokens.css` | 基础令牌不变 |

---

## 四、实施阶段

### Phase 1: 令牌补全
- 文件：`frontend/src/styles/semantic.css`
- 内容：`.theme-scifi` 块补充缺失的 `--app-color-*` 映射

### Phase 2: 弹窗组件
- `ScanAnnouncementBanner.tsx` — 已完成 ✅
- `ViolationNoticeBanner.tsx` — 移除 `THEME` 硬编码对象，改用令牌
- `ScanAccessNoticeOverlay.tsx` — 硬编码 → 令牌
- `UiverseProfilePopup.tsx` — 外层容器 + 全部子区域
- `announcementHtml.ts` — 已完成 ✅

### Phase 3: Debug 页面
- 7 个页面逐页迁移
- 每页改动模式一致：替换硬编码 Tailwind 颜色为 `var(--app-color-*)` 引用

### Phase 4: Sci-Fi CSS 精简
- `TwinChromeDebugNeonGlobal.css`：去掉已被令牌覆盖的 slate 色覆盖规则
- 保留 Sci-Fi 特有的辉光/动画规则

### Phase 5: 验证
- 三种主题下各测一轮
- 门禁：G04（令牌合规自查）

---

## 五、验证标准

### 功能验证
- [ ] ThemeSwitcher 切换到暗色 → debug 页面 + 弹窗变色
- [ ] 右击菜单切换到 Sci-Fi → debug 页面 + 弹窗变为深空+cyan
- [ ] 切回亮色 → 所有页面回到暖奶油色调
- [ ] 首页不跟随主题切换

### 令牌合规（G04）
- [ ] 无硬编码颜色（`bg-[#...]`, `bg-slate-*`, `bg-white` 等）
- [ ] 无裸 z-index（除已记录的 portal 叠加 `z-[100130]`）
- [ ] 无独立变量体系（全部 `--app-*` 前缀）

---

## 六、参考资料

- `docs/UI设计规范与主题标准.md` — 令牌分层架构 + z-index 表
- `docs/UI令牌实施调教指南.md` — Tailwind 桥接映射
- `frontend/src/styles/semantic.css` — 当前三套主题映射
- `frontend/src/styles/tokens.css` — 基础令牌定义
- `frontend/src/features/theme/ThemeProvider.tsx` — 主题切换机制