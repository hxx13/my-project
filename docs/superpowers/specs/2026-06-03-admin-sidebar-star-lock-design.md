# Admin Sidebar Star & Lock Design

**Date:** 2026-06-03
**Branch:** refactor/twin-package-split

## Overview

Add per-item star (favorite) and lock (pin) action buttons to every entry in the admin sidebar. Starred items appear in a prioritized "收藏" group above messages. Locked items (only one at a time) trigger auto-navigation on admin entry.

## Current State

- Star/favorite **data layer already exists** (`adminNavPersonalization.ts`): localStorage key `aro-admin-nav-stars`, functions `toggleAdminNavStar()`, `isAdminNavStarred()`, `readAdminNavStars()`.
- Sidebar groups order: 消息 → 常用 → 收藏 → registry groups.
- No per-item action buttons exist in the sidebar UI — `renderNavItem` renders plain NavLinks.
- No lock/pin mechanism exists.

## Requirements

### Star (收藏)

| Aspect | Decision |
|---|---|
| Button visibility | Always visible on each nav item in expanded mode |
| Data persistence | Reuse existing `aro-admin-nav-stars` (no new storage) |
| Group ordering | Move "收藏" group **above** "消息" group |
| Multiple selection | Yes, unlimited starred items |

### Lock (上锁)

| Aspect | Decision |
|---|---|
| Button visibility | Always visible on each nav item in expanded mode |
| Data persistence | New localStorage key `aro-admin-nav-lock` (single string) |
| Mutual exclusivity | Only ONE page locked at a time; locking a new one replaces the old |
| Auto-redirect | On admin entry, navigate to locked page if current page differs |
| Visual feedback | Locked item shows gold left border + highlighted lock icon |
| Permission safety | Before auto-redirect, verify the locked path is still accessible; clear lock if not |

### Star & Lock Independence

Star and lock are independent dimensions. A page can be both starred and locked simultaneously.

## Implementation Scope

Three files modified:

### 1. `frontend/src/features/admin/adminNavPersonalization.ts`

Add lock functions:

- `readAdminNavLock(): string | null`
- `toggleAdminNavLock(pathname: string): boolean` — toggle on/off; if switching to a different page, automatically unlock the previous one first. Returns new locked state.
- `isAdminNavLocked(pathname: string): boolean`

Lock changes dispatch `ADMIN_NAV_PERSONALIZATION_EVENT` (reuse existing event).

Reorder `prependPersonalNavSidebarGroups` output: 收藏 → 消息 → 常用 → registry.

### 2. `frontend/src/layouts/AdminLayout.tsx`

**renderNavItem changes:**
- In expanded mode, render two icon buttons (star + lock) at the right end of each nav item
- Buttons are `<button>` elements (not NavLink); `stopPropagation` + `preventDefault` on click
- Active state: `fill-amber-400 text-amber-400`
- Inactive state: `text-neutral-500 hover:text-neutral-200`
- Locked item wrapper div gets `border-l-2 border-amber-400`
- Buttons hidden in collapsed mode

**Auto-redirect on admin entry (new useEffect):**
- On mount, read `aro-admin-nav-lock`
- If locked path exists, differs from current pathname, and page is still visible in sidebar model → `navigate(lockedPath, { replace: true })`
- Use a `useRef` to ensure redirect fires at most once per session
- If locked path is no longer visible (permission removed), clear the lock and skip redirect

### 3. CSS / Tailwind (inline in AdminLayout)

No new CSS files. All styling uses existing Tailwind classes consistent with current sidebar design.

## Visual Specification

### Button Layout (expanded nav item)

```
┌─────────────────────────────────────────────────────┐
│ [icon]  label text...              [badge]  🔒  ⭐  │
└─────────────────────────────────────────────────────┘
```

### Locked Item Visual Feedback

```
┌─────────────────────────────────────────────────────┐ ← border-l-2 border-amber-400
│ [icon]  label text...              [badge]  🔒  ⭐  │   🔒 = fill-amber-400 text-amber-400
└─────────────────────────────────────────────────────┘
```

### Starred State

⭐ icon: `fill-amber-400 text-amber-400` when active, otherwise `text-neutral-500`

### Collapsed Mode

Buttons hidden entirely (insufficient width at `w-14`).

## Group Ordering (Expanded Sidebar)

```
  ┌─ 收藏 ───────────────────────┐  ← amber border (existing personal group style)
  │  starred items...             │
  └───────────────────────────────┘
  ┌─ 消息 ───────────────────────┐  ← violet border (existing)
  │  staff messages link          │
  └───────────────────────────────┘
  ┌─ 常用 ───────────────────────┐  ← amber border (existing)
  │  recent items...              │
  └───────────────────────────────┘
  ┌─ 组织与通知 ─────────────────┐
  ┌─ 系统与安全 ─────────────────┐
  ┌─ 门禁、元数据与环境 ─────────┐
  ┌─ ARO 房间与联动 ─────────────┐
  ┌─ 资产与运维 ─────────────────┐
  ┌─ 报修与物资领用 ─────────────┐
```

## Edge Cases

| Scenario | Behavior |
|---|---|
| Locked page permission revoked | Clear lock on next admin entry, skip redirect |
| Locked page path no longer in registry | Same as above |
| User is already on locked page | No redirect needed |
| localStorage unavailable | Fail silently, buttons still render (state not persisted) |
| Star a page, then page becomes hidden | Item naturally filtered out of stars group by existing logic |
| Rapid double-click on lock | Idempotent — toggle is symmetric |
| Collapsed sidebar | Buttons hidden; star/lock state still functional via command palette or other entry points |
