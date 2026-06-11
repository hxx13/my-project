# Bento Theme Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all scanner popup components + 7 debug pages from hardcoded Tailwind colors to `--app-color-*` semantic tokens, achieving automatic theme response (light/dark/scifi) via existing CSS variable inheritance.

**Architecture:** Pure token migration — no new abstractions. `semantic.css` already defines three-theme mappings (`:root` → light, `.dark` → dark, `.theme-scifi` → scifi). Components rendered via `createPortal` to `<body>` inherit theme from `<html>` class set by `ThemeProvider`. Debug pages under `TwinLayout` inherit the same CSS variable cascade.

**Tech Stack:** React + TypeScript + Tailwind CSS + framer-motion (popups). CSS token system already in place.

---

## Phase 1: Token Completion

### Task 1.1: Complete .theme-scifi token mappings

**Files:**
- Modify: `frontend/src/styles/semantic.css:124-155`

**Context:** The `.theme-scifi` block is missing several tokens that Bento light/dark already define. Without them, components referencing those tokens will break under scifi theme.

- [ ] **Step 1: Add missing token mappings to .theme-scifi**

Replace the existing `.theme-scifi` block (lines 124-155) with:

```css
/* ═══════ 科幻流光主题映射 ═══════ */
.theme-scifi {
  /* Surface */
  --app-color-surface-page:      var(--color-slate-950);
  --app-color-surface-container: oklch(0.17 0.01 260);
  --app-color-surface-elevated:  oklch(0.21 0.01 260);
  --app-color-surface-hover:     oklch(0.22 0.02 260);
  --app-color-surface-active:    oklch(0.25 0.04 240);

  /* Text */
  --app-color-text-primary:      var(--color-slate-50);
  --app-color-text-secondary:    var(--color-slate-300);
  --app-color-text-tertiary:     var(--color-slate-500);
  --app-color-text-inverse:      var(--color-slate-950);

  /* Accent — cyan neon */
  --app-color-accent:            var(--color-cyan-400);
  --app-color-accent-hover:      var(--color-cyan-300);
  --app-color-accent-active:     var(--color-cyan-200);
  --app-color-accent-soft:       oklch(0.18 0.04 220);
  --app-color-accent-secondary:  var(--color-cyan-300);

  /* Border */
  --app-color-border-default:    oklch(0.25 0.01 260);
  --app-color-border-strong:     var(--color-cyan-400);

  /* Feedback */
  --app-color-feedback-danger:        var(--color-red-400);
  --app-color-feedback-danger-soft:   var(--color-red-950);
  --app-color-feedback-warning:       var(--color-amber-400);
  --app-color-feedback-warning-soft:  var(--color-amber-950);
  --app-color-feedback-success:       var(--color-green-400);
  --app-color-feedback-success-soft:  var(--color-green-950);
  --app-color-feedback-info:          var(--color-cyan-400);
  --app-color-feedback-info-soft:     var(--color-cyan-950);

  /* Glow — scifi variants */
  --app-glow-accent:       rgba(34, 211, 238, 0.08);
  --app-glow-selected:     rgba(34, 211, 238, 0.12);
  --app-row-header-tint:   rgba(34, 211, 238, 0.04);

  /* Radius */
  --app-radius-container: var(--radius-xl);
  --app-radius-element:   var(--radius-md);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/semantic.css
git commit -m "feat: complete .theme-scifi semantic token mappings"
```

---

## Phase 2: Scanner Popup Components

### Task 2.1: ScanAnnouncementBanner — already done ✅

Completed in previous work. No changes needed.

### Task 2.2: ViolationNoticeBanner — token migration

**Files:**
- Modify: `frontend/src/components/scanner/ViolationNoticeBanner.tsx`

**Context:** Has a `THEME` object with two hardcoded color sets (`violation` amber, `unbound` cyan). Replace with semantic tokens while preserving the violation/unbound visual distinction via `--app-color-feedback-warning` and `--app-color-feedback-info`.

- [ ] **Step 1: Replace THEME object with token-based helper**

Remove the entire `THEME` const (lines 32-83) and replace with a function that maps `kind` + `locked` to token-based Tailwind classes:

```typescript
const TOKEN_THEME = (kind: ViolationNoticeKind, locked: boolean) => {
  const accentVar = kind === "violation"
    ? "var(--app-color-feedback-warning)"
    : "var(--app-color-feedback-info)";
  const lockedBorder = locked
    ? "border-[var(--app-color-feedback-danger)] bg-[var(--app-color-feedback-danger)]/5"
    : `border-[${accentVar}]/40 bg-[${accentVar}]/5`;
  return {
    islandBorder: `border ${lockedBorder} bg-[var(--app-color-surface-container)]`,
    iconRing: `bg-[${accentVar}]/10 ring-1 ring-[${accentVar}]/20`,
    icon: `text-[${accentVar}]`,
    chevron: "text-[var(--app-color-text-tertiary)]",
    badge: "text-[var(--app-color-text-primary)]",
    tag: "text-[var(--app-color-text-tertiary)]",
    tagUpper: "uppercase tracking-[0.2em]",
    panelBorder: "border-[var(--app-color-border-default)]",
    panelBg: "bg-[var(--app-color-surface-container)]",
    headerBorder: "border-[var(--app-color-border-default)]",
    title: "text-[var(--app-color-text-primary)]",
    meta: "text-[var(--app-color-text-tertiary)]",
    btnBorder: "border-[var(--app-color-border-default)]",
    btnText: "text-[var(--app-color-text-secondary)]",
    closeBtn: "text-[var(--app-color-text-tertiary)]",
    textBorder: "border-[var(--app-color-border-default)]",
    textBody: "text-[var(--app-color-text-primary)]",
    emptyHint: "text-[var(--app-color-text-tertiary)]",
    dialogTitle: kind === "violation" ? "违规通告" : "未绑卡提示",
    alertTag: kind === "violation" ? "Alert" : "Unbound",
    imgAlt: kind === "violation" ? "违规附图" : "未绑卡提示附图",
  };
};
```

- [ ] **Step 2: Update island button (lines 206-234)**

Replace all `theme.X` references with `t.X` from the new helper, and update the button class from hardcoded gradient to tokens:

```tsx
const t = TOKEN_THEME(kind, locked);

// Island button className:
`group flex w-full min-w-0 items-center gap-2 rounded-full border ${t.islandBorder} px-3 py-2 shadow-lg backdrop-blur-md transition-all hover:bg-[var(--app-color-surface-hover)] active:scale-[0.98] sm:gap-2.5 sm:px-4 sm:py-2.5`
```

- [ ] **Step 3: Update panel (lines 238-258)**

```tsx
// Backdrop:
className="fixed inset-0 z-[100130] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"

// Panel:
className={`relative flex max-h-[min(88vh,720px)] w-full max-w-[min(96vw,640px)] flex-col overflow-hidden rounded-[var(--app-radius-container)] border ${t.panelBorder} ${t.panelBg} shadow-[var(--app-elevation-modal)]`}
```

- [ ] **Step 4: Update header (lines 259-298)**

Replace header elements: `bg-black/40` removed, borders use `t.headerBorder`, icons/text use token classes.

- [ ] **Step 5: Update content area (lines 300-353)**

Replace the content section: wrap text in a content card with `bg-[var(--app-color-surface-page)] border border-[var(--app-color-border-default)] rounded-[var(--app-radius-element)] p-4`.

- [ ] **Step 6: Update all remaining theme references**

Search-and-replace all remaining `theme.` → `t.` in the JSX. Verify no `bg-black/40`, `bg-black/30`, `bg-gradient-to-b from-[#...]`, `border-violet-*`, `border-amber-*`, `border-cyan-*`, `text-violet-*`, `text-amber-*`, `text-cyan-*` remain (except the dynamic accent variables).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/scanner/ViolationNoticeBanner.tsx
git commit -m "refactor: ViolationNoticeBanner — hardcoded colors to --app-color-* tokens"
```

### Task 2.3: ScanAccessNoticeOverlay — token migration

**Files:**
- Modify: `frontend/src/components/scanner/ScanAccessNoticeOverlay.tsx`

**Context:** The `resolveNoticeTheme` function returns two hardcoded dark theme objects (pink female / cyan male). Replace with token-based approach.

- [ ] **Step 1: Replace resolveNoticeTheme with token-based version**

Remove the existing `resolveNoticeTheme` function (lines 16-36). Replace with:

```typescript
function resolveNoticeTheme(themeColor?: string) {
  const isPink = themeColor === "#fbb9b6";
  const accentVar = isPink
    ? "var(--app-color-feedback-danger)"
    : "var(--app-color-accent)";
  return {
    backdrop: "bg-[var(--app-color-surface-page)]/75 backdrop-blur-md",
    card: `border-[${accentVar}]/30 bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)]`,
    iconWrap: `border-[${accentVar}]/30 bg-[${accentVar}]/8`,
    icon: `text-[${accentVar}]`,
    text: "text-[var(--app-color-text-primary)]",
    label: `text-[${accentVar}]/70`,
  };
}
```

- [ ] **Step 2: Update card className (lines 63-68)**

Replace `rounded-3xl` → `rounded-[var(--app-radius-container)]`, remove `backdrop-blur-xl` (handled via container bg now).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/scanner/ScanAccessNoticeOverlay.tsx
git commit -m "refactor: ScanAccessNoticeOverlay — hardcoded colors to --app-color-* tokens"
```

### Task 2.4: UiverseProfilePopup — outer shell token migration

**Files:**
- Modify: `frontend/src/components/scanner/UiverseProfilePopup.tsx`

**Context:** The main scanner popup container plus internal sections. Sub-components (ProfileHeader, StudentEntryCard, AIPredictionCard, ActionButtons) will be handled separately if they have hardcoded colors.

- [ ] **Step 1: Replace outer backdrop (line 177)**

```tsx
// Before:
className="fixed inset-0 flex flex-col bg-[#050A15]/85 backdrop-blur-sm"
// After:
className="fixed inset-0 flex flex-col bg-[var(--app-color-surface-page)]/90 backdrop-blur-sm"
```

- [ ] **Step 2: Replace close button (line 180)**

```tsx
// Before:
className="absolute top-6 right-6 z-[10000] flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:border-red-500 hover:bg-red-500/80"
// After:
className="absolute top-6 right-6 z-[10000] flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]/30 text-[var(--app-color-text-primary)] hover:border-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger)]/50"
```

- [ ] **Step 3: Replace unbound-bind hint button (lines 183-190)**

```tsx
// Before:
className="absolute bottom-8 left-1/2 z-[10001] -translate-x-1/2 max-w-[min(320px,90vw)] rounded-xl border border-cyan-400/60 bg-cyan-500/20 px-4 py-2.5 text-center text-[12px] font-bold text-cyan-50 shadow-lg shadow-cyan-900/40 hover:bg-cyan-500/35 transition-colors"
// After:
className="absolute bottom-8 left-1/2 z-[10001] -translate-x-1/2 max-w-[min(320px,90vw)] rounded-xl border border-[var(--app-color-accent)]/40 bg-[var(--app-color-accent)]/10 px-4 py-2.5 text-center text-[12px] font-bold text-[var(--app-color-text-primary)] shadow-lg hover:bg-[var(--app-color-accent)]/20 transition-colors"
```

- [ ] **Step 4: Replace level badge (lines 203-206)**

```tsx
// Before:
className="relative w-12 h-12 rounded-full bg-[#1e293b] border-[2px] border-cyan-400/70 shadow-lg flex items-center justify-center z-20 shrink-0"
// After:
className="relative w-12 h-12 rounded-full bg-[var(--app-color-surface-container)] border-2 border-[var(--app-color-accent)]/40 shadow-lg flex items-center justify-center z-20 shrink-0"
```

- [ ] **Step 5: Replace EXP bar (lines 213-222)**

```tsx
// EXP bar container:
className="relative h-[20px] bg-[var(--app-color-surface-page)]/90 rounded-r-full border border-[var(--app-color-border-default)] overflow-hidden pl-5 pr-2 flex items-center"
// Gradient fill:
className="absolute left-0 top-0 bottom-0 transition-all duration-500 z-0 bg-[var(--app-color-accent)]/20"
```

- [ ] **Step 6: Replace name text (line 211)**

```tsx
// Before:
className="font-bold text-white text-[12px] truncate"
// After:
className="font-bold text-[var(--app-color-text-primary)] text-[12px] truncate"
```

- [ ] **Step 7: Replace EXP text (lines 205-206, 218-220)**

All `text-white` → `text-[var(--app-color-text-primary)]`, `text-white/60` → `text-[var(--app-color-text-tertiary)]`, `text-white/40` → `text-[var(--app-color-text-tertiary)]`.

- [ ] **Step 8: Replace error popup message (lines 253-262)**

```tsx
// Before:
className="max-w-[min(260px,100%)] rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] leading-snug text-red-200/95 shadow-md flex items-start gap-1.5"
// After:
className="max-w-[min(260px,100%)] rounded-md border border-[var(--app-color-feedback-danger)]/30 bg-[var(--app-color-feedback-danger-soft)] px-2 py-1 text-[10px] leading-snug text-[var(--app-color-text-primary)] shadow-md flex items-start gap-1.5"
```

- [ ] **Step 9: Replace toaster area border (line 266)**

```tsx
// Before:
className="flex min-h-0 flex-[2] flex-col justify-end overflow-visible rounded-2xl border border-white/5 pb-0.5"
// After:
className="flex min-h-0 flex-[2] flex-col justify-end overflow-visible rounded-2xl border border-[var(--app-color-border-default)] pb-0.5"
```

- [ ] **Step 10: Replace entry mode toggle (lines 273-288)**

```tsx
// Container:
className="bg-[var(--app-color-surface-container)]/40 p-1.5 rounded-xl border border-[var(--app-color-border-default)] flex gap-1"
// Selected state (OWN):
className={`flex-1 py-2 text-[11px] font-black rounded-lg text-center pointer-events-none select-none ${
  state.entryMode === "OWN" ? "bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]" : "text-[var(--app-color-text-tertiary)]"
}`}
// Selected state (BORROWED):
className={`flex-1 py-2 text-[11px] font-black rounded-lg text-center pointer-events-none select-none ${
  state.entryMode === "BORROWED" ? "bg-[var(--app-color-feedback-danger)] text-white" : "text-[var(--app-color-text-tertiary)]"
}`}
```

- [ ] **Step 11: Replace card-mapping hint text (line 290)**

```tsx
// Before:
className="text-[10px] text-slate-500 text-center leading-snug"
// After:
className="text-[10px] text-[var(--app-color-text-tertiary)] text-center leading-snug"
```

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/scanner/UiverseProfilePopup.tsx
git commit -m "refactor: UiverseProfilePopup — hardcoded colors to --app-color-* tokens"
```

### Task 2.5: Sub-components with hardcoded colors

**Files to check and fix:**
- `frontend/src/components/scanner/AIPredictionCard.tsx`
- `frontend/src/components/scanner/WeeklyRoutineMatrixChart` (in UiverseProfilePopup.tsx lines 23-89)
- `frontend/src/components/scanner/components/ActionButtons.tsx`

- [ ] **Step 1: Fix WeeklyRoutineMatrixChart (UiverseProfilePopup.tsx lines 23-89)**

Replace internal hardcoded colors:

```tsx
// Container (line 65):
className="w-full p-4 rounded-2xl shadow-2xl border backdrop-blur-md bg-[var(--app-color-surface-container)] border-[var(--app-color-border-default)]"
// Title text (line 67):
className="text-xs font-bold text-[var(--app-color-text-primary)] tracking-wider"
// Badge (line 68):
className="text-[9px] text-[var(--app-color-accent)] bg-[var(--app-color-accent)]/10 px-2 py-0.5 rounded-full border border-[var(--app-color-accent)]/30"
// SVG axis labels (lines 71-72):
className="text-[8px] text-[var(--app-color-text-tertiary)]"
// Day labels (line 83):
className="text-[9px] font-bold text-[var(--app-color-text-tertiary)]"
```

- [ ] **Step 2: Fix ActionButtons auto-signout label (lines 82-89)**

```tsx
// Before:
className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-bold text-amber-400 shrink-0"
// After:
className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-warning-soft)] border border-[var(--app-color-feedback-warning)]/25 text-[11px] font-bold text-[var(--app-color-feedback-warning)] shrink-0"
```

- [ ] **Step 3: Fix ActionButtons checkbox labels (lines 105, 127)**

```tsx
// Before:
className="flex items-center gap-1.5 text-[10px] text-slate-400 whitespace-nowrap"
// After:
className="flex items-center gap-1.5 text-[10px] text-[var(--app-color-text-tertiary)] whitespace-nowrap"
```

- [ ] **Step 4: Check and fix AIPredictionCard.tsx**

Read the file, find all hardcoded colors (`bg-[#...]`, `text-white`, `text-slate-*`, `bg-black/*`, `border-*`), replace with `var(--app-color-*)` equivalents following the token mapping table.

- [ ] **Step 5: Check and fix ProfileHeader, StudentEntryCard, HamsterExitButton, AnimatedRoomButton**

Read each file, identify hardcoded colors, replace with tokens. Prioritize components that have visible hardcoded white/slate text or dark backgrounds.

- [ ] **Step 6: Commit sub-component changes**

```bash
git add frontend/src/components/scanner/
git commit -m "refactor: scanner sub-components — hardcoded colors to --app-color-* tokens"
```

---

## Phase 3: Debug Pages

All 7 pages follow the same migration pattern. Each page gets its own task.

### Common Pattern for All Debug Pages

For every debug page, apply these replacements (exact class names vary per page but the token mapping is consistent):

| Find pattern | Replace with |
|---|---|
| `bg-slate-50` or `bg-slate-50/50` | `bg-[var(--app-color-surface-page)]` |
| `bg-white` | `bg-[var(--app-color-surface-container)]` |
| `bg-slate-100` | `bg-[var(--app-color-surface-hover)]` |
| `border-slate-200` | `border-[var(--app-color-border-default)]` |
| `border-slate-100` | `border-[var(--app-color-border-default)]` |
| `border-slate-300` | `border-[var(--app-color-border-strong)]` |
| `text-slate-900` or `text-slate-800` | `text-[var(--app-color-text-primary)]` |
| `text-slate-700` or `text-slate-600` | `text-[var(--app-color-text-secondary)]` |
| `text-slate-500` or `text-slate-400` | `text-[var(--app-color-text-tertiary)]` |
| `text-slate-300` | `text-[var(--app-color-text-tertiary)]` |
| `shadow-sm` or `shadow-md` or `shadow-xl` | `shadow-[var(--app-elevation-card)]` |
| `bg-indigo-50/70` (zebra row) | `bg-[var(--app-color-surface-hover)]` |
| `hover:bg-blue-100/70` | `hover:bg-[var(--app-color-surface-active)]` |
| `text-blue-600` | `text-[var(--app-color-accent)]` |
| `bg-blue-600` (selected) | `bg-[var(--app-color-accent)]` |
| `text-emerald-600` (success) | `text-[var(--app-color-feedback-success)]` |
| `text-red-*` (danger) | `text-[var(--app-color-feedback-danger)]` |
| `bg-rose-100` (badge) | `bg-[var(--app-color-feedback-danger-soft)]` |
| `text-rose-700` (badge) | `text-[var(--app-color-feedback-danger)]` |
| `bg-amber-100` | `bg-[var(--app-color-feedback-warning-soft)]` |
| `accent-rose-500` (checkbox) | `accent-[var(--app-color-feedback-danger)]` |

**Important:** Do NOT change Sci-Fi specific utility classes (like `data-twin-debug-*`, `twin-debug-scifi-shell`), structural classes (layout, flex, grid, sizing), or non-color classes. Only change color-related Tailwind classes.

### Task 3.1: DebugTablePage

**Files:** Modify: `frontend/src/pages/DebugTablePage.tsx`

- [ ] Apply common pattern substitutions to all color classes
- [ ] Search for any remaining `slate-`, `white`, `blue-`, `indigo-`, `rose-`, `emerald-`, `amber-` color classes and replace
- [ ] Commit: `git add frontend/src/pages/DebugTablePage.tsx && git commit -m "refactor: DebugTablePage — slate colors to --app-color-* tokens"`

### Task 3.2: DebugPersonnelPage

**Files:** Modify: `frontend/src/pages/DebugPersonnelPage.tsx`

- [ ] Read file, find all hardcoded colors via grep
- [ ] Apply common pattern substitutions
- [ ] Commit: `refactor: DebugPersonnelPage — slate colors to --app-color-* tokens`

### Task 3.3: DebugPredictionPage

**Files:** Modify: `frontend/src/pages/DebugPredictionPage.tsx`

- [ ] Apply common pattern substitutions
- [ ] Commit: `refactor: DebugPredictionPage — slate colors to --app-color-* tokens`

### Task 3.4: DebugOrderPage

**Files:** Modify: `frontend/src/pages/DebugOrderPage.tsx`

- [ ] Apply common pattern substitutions (this page has the most hardcoded colors — ~40 occurrences)
- [ ] Handle special cases: order state colors (`text-blue-600`, `text-emerald-600`, `text-slate-400 line-through`)
- [ ] Commit: `refactor: DebugOrderPage — slate colors to --app-color-* tokens`

### Task 3.5: DebugHeatmapPage

**Files:** Modify: `frontend/src/pages/DebugHeatmapPage.tsx`

- [ ] Apply common pattern substitutions
- [ ] Heatmap gradient colors (emerald, amber, orange, red) → keep as-is if they're data-driven (semantic meaning), but switch to token references where they represent UI state
- [ ] Commit: `refactor: DebugHeatmapPage — slate colors to --app-color-* tokens`

### Task 3.6: DebugCardStatusPage

**Files:** Modify: `frontend/src/pages/DebugCardStatusPage.tsx`

- [ ] Apply common pattern substitutions
- [ ] Commit: `refactor: DebugCardStatusPage — slate colors to --app-color-* tokens`

### Task 3.7: DebugCardMappingPage

**Files:** Modify: `frontend/src/pages/DebugCardMappingPage.tsx`

- [ ] Apply common pattern substitutions (this page is under AdminLayout, uses `bg-white` extensively)
- [ ] Commit: `refactor: DebugCardMappingPage — slate colors to --app-color-* tokens`

---

## Phase 4: Sci-Fi CSS Cleanup

### Task 4.1: Trim TwinChromeDebugNeonGlobal.css

**Files:**
- Modify: `frontend/src/features/twin-chrome/TwinChromeDebugNeonGlobal.css`

**Context:** This 348-line CSS file uses `[data-twin-chrome-theme="dashboardSciFi"]` selectors to override hardcoded slate colors. Once debug pages reference `--app-color-*` tokens, many of these overrides become redundant (the tokens already resolve to scifi-appropriate values). Only keep rules that add scifi-specific visual effects (glow, neon borders, animation) that go beyond what tokens provide.

- [ ] **Step 1: Identify rules to remove**

Scan the file for rules that only override colors now handled by tokens:
- Any rule that sets `background:` or `background-color:` to a dark slate value
- Any rule that sets `color:` to a light slate/white value
- Any rule that sets `border-color:`
- Leave rules that set `box-shadow` (neon glow), `text-shadow`, `filter`, animation

- [ ] **Step 2: Remove redundant rules**

Delete the identified color-override rules. Keep scifi-specific glow effects.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/twin-chrome/TwinChromeDebugNeonGlobal.css
git commit -m "refactor: trim Sci-Fi CSS — remove color overrides now handled by tokens"
```

---

## Phase 5: Verification

### Task 5.1: G04 token compliance check

- [ ] **Step 1: Scan for hardcoded colors in modified files**

```bash
grep -rn 'bg-\[#' frontend/src/components/scanner/ frontend/src/pages/Debug*.tsx
# Expected: no results

grep -rn 'bg-white\|bg-slate\|bg-gray\|bg-zinc' frontend/src/components/scanner/ frontend/src/pages/Debug*.tsx
# Expected: no results (or only in comments / non-color contexts)
```

- [ ] **Step 2: Scan for bare z-index in modified files**

```bash
grep -rn 'z-\[[0-9]' frontend/src/components/scanner/ScanAnnouncementBanner.tsx frontend/src/components/scanner/ViolationNoticeBanner.tsx
# Expected: only z-[100130] (portal overlay — pre-existing, documented)
```

- [ ] **Step 3: Scan for independent variable systems**

```bash
grep -rn '\-\-[a-z]+-' frontend/src/components/scanner/ScanAnnouncementBanner.tsx frontend/src/components/scanner/ViolationNoticeBanner.tsx
# Expected: only --app-* prefixed variables
```

### Task 5.2: Theme switch visual verification

- [ ] **Step 1: Test light theme**

Set theme to `standard` (light). Open a debug page. Verify: warm cream background, white cards, slate text, peach accents.

- [ ] **Step 2: Test dark theme**

Switch to `standard-dark`. Verify: warm dark charcoal backgrounds, warm cream text, steel blue accents.

- [ ] **Step 3: Test scifi theme**

Switch to `scifi` via ThemeSwitcher. Verify: deep space slate backgrounds, cyan accents, proper contrast.

- [ ] **Step 4: Test scanner popup across themes**

Trigger scanner popup (or mock it). Verify popup background, text, borders change with theme.

### Task 5.3: Homepage isolation check

- [ ] **Step 1: Verify AdminHomePage unchanged**

Switch themes. Homepage should remain warm cream + peach regardless of theme selection.

### Task 5.4: Commit verification results

```bash
git add -A
git commit -m "chore: G04 compliance verification + final cleanup"
```