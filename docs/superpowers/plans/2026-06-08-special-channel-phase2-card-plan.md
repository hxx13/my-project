# Phase 2 · Card Redesign + Student Nav · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace popup bottom-left CapacityStatusList with a paginated StudentEntryCard (room capacity + action buttons), add student center back button and idle-timeout auto-logout.

**Architecture:** StudentEntryCard is a pure Tailwind component with internal page state (useState). UiverseProfilePopup swaps CapacityStatusList for it and removes the center-bottom entry buttons. StudentLayout gains a back button and a useIdleTimeout hook that monitors user activity and auto-clears auth after configurable idle time.

**Tech Stack:** React 19 + TypeScript 5.9 + Tailwind CSS v4 + existing Zustand stores

---

### Task 1: Create idle timeout config constants

**Files:**
- Create: `frontend/src/config/idleTimeout.ts`

- [ ] **Step 1: Write config file**

```ts
// frontend/src/config/idleTimeout.ts
/** 无操作多久后触发警告（毫秒） */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟

/** 警告倒计时时长（毫秒） */
export const IDLE_WARNING_MS = 30 * 1000; // 30 秒
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/config/idleTimeout.ts
git commit -m "feat: add idle timeout config constants"
```

---

### Task 2: Create useIdleTimeout hook

**Files:**
- Create: `frontend/src/hooks/useIdleTimeout.ts`

- [ ] **Step 1: Write the hook**

```ts
// frontend/src/hooks/useIdleTimeout.ts
import { useEffect, useRef, useState, useCallback } from "react";

const EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
];

interface UseIdleTimeoutOptions {
  timeoutMs: number;
  warningMs: number;
  onTimeout: () => void;
}

export function useIdleTimeout({ timeoutMs, warningMs, onTimeout }: UseIdleTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningIntervalRef.current) {
      clearInterval(warningIntervalRef.current);
      warningIntervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    setRemainingSeconds(0);

    // 启动空闲计时
    timeoutRef.current = setTimeout(() => {
      // 进入警告阶段
      setShowWarning(true);
      const warnStart = Date.now();
      const totalWarnMs = warningMs;
      setRemainingSeconds(Math.ceil(totalWarnMs / 1000));

      warningIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - warnStart;
        const remaining = Math.max(0, Math.ceil((totalWarnMs - elapsed) / 1000));
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          clearTimers();
          setShowWarning(false);
          onTimeoutRef.current();
        }
      }, 500);
    }, timeoutMs);
  }, [timeoutMs, warningMs, clearTimers]);

  useEffect(() => {
    reset();

    const handler = () => reset();

    EVENTS.forEach((event) => {
      window.addEventListener(event, handler, { passive: true });
    });

    return () => {
      clearTimers();
      EVENTS.forEach((event) => {
        window.removeEventListener(event, handler);
      });
    };
  }, [reset, clearTimers]);

  return { showWarning, remainingSeconds };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit --pretty
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useIdleTimeout.ts
git commit -m "feat: add useIdleTimeout hook with warning + auto-logout phases"
```

---

### Task 3: Create StudentEntryCard component

**Files:**
- Create: `frontend/src/components/scanner/StudentEntryCard.tsx`

- [ ] **Step 1: Write StudentEntryCard**

```tsx
// frontend/src/components/scanner/StudentEntryCard.tsx
import { useState } from "react";
import type { CapacityStat } from "./components/types";

interface StudentEntryCardProps {
  capacityStats: CapacityStat[];
  roomOverviewFetching: boolean;
  roomOverviewSourceCount: number;

  studentUserId: string;
  studentName?: string;

  onEnterStudentCenter: () => void;
  onOpenQuickActions: () => void;
  onClosePopup: () => void;
}

type Page = 1 | 2;

export function StudentEntryCard({
  capacityStats,
  roomOverviewFetching,
  roomOverviewSourceCount,
  studentUserId: _studentUserId,
  studentName,
  onEnterStudentCenter,
  onOpenQuickActions,
  onClosePopup,
}: StudentEntryCardProps) {
  const [page, setPage] = useState<Page>(1);

  const pageTitles: Record<Page, { icon: string; title: string; subtitle: string }> = {
    1: { icon: "🏠", title: "馆内实时负载", subtitle: "各房间当前占用情况" },
    2: { icon: "🔑", title: "快捷入口", subtitle: "选择你要执行的操作" },
  };

  const current = pageTitles[page];

  const actions = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2 2 6 2s6-.9 6-2v-5" />
        </svg>
      ),
      title: "进入学生中心",
      desc: studentName ? `以 ${studentName} 的身份进入` : "查看个人学习记录与数据",
      onClick: onEnterStudentCenter,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="3" width="18" height="18" rx="3" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="12" y2="17" />
        </svg>
      ),
      title: "快捷业务",
      desc: "签到 · 上报 · 申领",
      onClick: onOpenQuickActions,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      ),
      title: "返回主屏幕",
      desc: "关闭弹窗回到扫码页",
      onClick: onClosePopup,
    },
  ];

  return (
    <div className="w-full flex flex-col rounded-2xl bg-[#0b0c10] border border-white/5 shadow-2xl overflow-hidden relative">
      {/* Left glow effect */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-10 w-16 h-1/2 bg-purple-500 blur-[60px] opacity-10 pointer-events-none" />

      <div className="relative z-10 p-4 flex flex-col gap-3">
        {/* Page indicator dots */}
        <div className="flex justify-center gap-1">
          {([1, 2] as Page[]).map((p) => (
            <div
              key={p}
              className={`w-5 h-1 rounded-full transition-all duration-300 ${
                p === page
                  ? "bg-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                  : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <span className="text-3xl">{current.icon}</span>
        </div>

        {/* Title + subtitle */}
        <div className="text-center">
          <h3 className="text-sm font-semibold text-white">{current.title}</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">{current.subtitle}</p>
        </div>

        {/* Page content */}
        {page === 1 ? (
          /* ---- Page 1: Room Capacity ---- */
          <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto [&::-webkit-scrollbar]:hidden">
            {roomOverviewFetching && capacityStats.length === 0 && roomOverviewSourceCount === 0 ? (
              <div className="h-10 w-full rounded-lg bg-white/[0.02] border border-white/5 animate-pulse" />
            ) : capacityStats.length === 0 ? (
              <p className="text-center text-[10px] text-white/30 py-3">
                暂无负载数据
              </p>
            ) : (
              capacityStats.map((stat, i) => {
                const isFull = stat.remaining <= 0;
                const totalSlots = Math.max(1, stat.total || 1);
                const pct = Math.min(100, Math.round((stat.count / totalSlots) * 100));
                return (
                  <div
                    key={`${stat.name}-${i}`}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.02] border border-white/5"
                  >
                    <span className="text-[10px] text-white/80 w-16 truncate shrink-0">
                      {stat.name}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isFull ? "bg-rose-500" : "bg-cyan-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-bold w-12 text-right shrink-0 ${
                        isFull ? "text-rose-400" : "text-cyan-300"
                      }`}
                    >
                      {isFull ? "满载" : `${stat.count}/${totalSlots}`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* ---- Page 2: Action Buttons ---- */
          <div className="flex flex-col gap-1.5">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl
                           bg-[#12141a] border border-white/5
                           hover:bg-[#1a1c23] hover:border-white/10
                           active:scale-[0.98] transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-white">{action.title}</div>
                  <div className="text-[9px] text-slate-500">{action.desc}</div>
                </div>
                <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-slate-500 group-hover:bg-white/10 group-hover:text-white transition-colors shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Footer: prev/next */}
        <div className="flex justify-between items-center">
          {page === 1 ? (
            <div /> /* empty placeholder to keep next on right */
          ) : (
            <button
              onClick={() => setPage(1)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-3xl
                         border border-white/5 text-[10px] text-slate-400
                         hover:bg-white/5 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              上一页
            </button>
          )}
          {page === 1 ? (
            <button
              onClick={() => setPage(2)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-3xl
                         border border-white/5 text-[10px] text-slate-400
                         hover:bg-white/5 hover:text-white transition-colors"
            >
              下一页
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ) : (
            <div /> /* empty placeholder to keep layout consistent */
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit --pretty
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/scanner/StudentEntryCard.tsx
git commit -m "feat: add StudentEntryCard — paginated room capacity + action buttons"
```

---

### Task 4: Integrate StudentEntryCard into UiverseProfilePopup

**Files:**
- Modify: `frontend/src/components/scanner/UiverseProfilePopup.tsx`

Three changes: (A) import StudentEntryCard, (B) replace CapacityStatusList with StudentEntryCard, (C) remove the bottom student buttons.

- [ ] **Step 1: Replace CapacityStatusList import with StudentEntryCard**

```tsx
// Remove this import:
- import { CapacityStatusList } from "./components/CapacityStatusList";

// Add this import:
+ import { StudentEntryCard } from "./StudentEntryCard";
```

- [ ] **Step 2: Replace CapacityStatusList JSX with StudentEntryCard**

Find the CapacityStatusList usage (the `<div className="basis-1/2 min-h-0 ...">` block containing it in the left column) and replace:

```tsx
// Replace the entire left-column bottom half (the CapacityStatusList block):
- <div className="basis-1/2 min-h-0 rounded-2xl border border-white/5 px-4 flex flex-col min-h-0 overflow-hidden">
-   <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
-     <CapacityStatusList
-       items={state.myCapacityStats}
-       roomOverviewFetching={state.roomOverviewFetching}
-       roomOverviewSourceCount={state.roomOverviewSourceCount}
-     />
-   </div>
- </div>

+ <div className="basis-1/2 min-h-0 flex flex-col min-h-0 overflow-visible">
+   <StudentEntryCard
+     capacityStats={state.myCapacityStats}
+     roomOverviewFetching={state.roomOverviewFetching}
+     roomOverviewSourceCount={state.roomOverviewSourceCount}
+     studentUserId={studentUserId}
+     studentName={state.user?.name}
+     onEnterStudentCenter={handleEnterStudentCenter}
+     onOpenQuickActions={() => setShowQuickActions(true)}
+     onClosePopup={onClose}
+   />
+ </div>
```

- [ ] **Step 3: Remove the bottom student entry buttons**

Remove the entire `{studentUserId && (<div>进入学生中心 + 快捷业务</div>)}` block (the one with `absolute bottom-8 left-1/2 z-[10001]`):

```tsx
// Remove this entire block:
- {/* Student entry buttons */}
- {studentUserId && (
-     <div className="absolute bottom-8 left-1/2 z-[10001] -translate-x-1/2 flex gap-3">
-         <button ...>进入学生中心</button>
-         <button ...>快捷业务</button>
-     </div>
- )}
```

- [ ] **Step 4: Remove the unused import for checkPinStatus (if only used by the removed buttons)**

Check if `checkPinStatus` is still used elsewhere in UiverseProfilePopup. If only used in `handleEnterStudentCenter`, keep the import (handler is still referenced by StudentEntryCard's onEnterStudentCenter prop).

`handleEnterStudentCenter` calls `checkPinStatus` — so the import stays.

- [ ] **Step 5: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit --pretty
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/scanner/UiverseProfilePopup.tsx
git commit -m "feat: integrate StudentEntryCard into popup, remove bottom entry buttons"
```

---

### Task 5: Add back button + idle timeout to StudentLayout

**Files:**
- Modify: `frontend/src/features/student/components/layout/student-layout.tsx`

- [ ] **Step 1: Read current StudentLayout to understand structure**

Read the current `student-layout.tsx` to find the header/nav area. The plan assumes it has a `<header>` or `<nav>` area where we can add a back button.

- [ ] **Step 2: Add imports and hook usage**

```tsx
+ import { useNavigate } from "react-router-dom";
+ import { authStorage } from "@/features/auth/authStorage";
+ import { useIdleTimeout } from "@/hooks/useIdleTimeout";
+ import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/config/idleTimeout";
```

- [ ] **Step 3: Add hook and back button inside the component**

```tsx
// Inside the StudentLayout component function, at the top level:
const navigate = useNavigate();

const { showWarning, remainingSeconds } = useIdleTimeout({
  timeoutMs: IDLE_TIMEOUT_MS,
  warningMs: IDLE_WARNING_MS,
  onTimeout: () => {
    authStorage.clear();
    navigate("/");
  },
});
```

- [ ] **Step 4: Add back button in the header area**

Find the right side of the header/topbar and add:

```tsx
<button
  onClick={() => {
    authStorage.clear();
    navigate("/");
  }}
  className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M15 18l-6-6 6-6" />
  </svg>
  返回扫码页面
</button>
```

- [ ] **Step 5: Add idle warning overlay at the bottom of the component's JSX (before the closing tag)**

```tsx
{/* Idle timeout warning overlay */}
{showWarning && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="bg-slate-800 border border-white/10 rounded-xl px-6 py-4 text-center text-white shadow-2xl">
      <p className="text-sm font-bold">长时间未操作</p>
      <p className="text-2xl font-black text-purple-400 my-2">{remainingSeconds}s</p>
      <p className="text-xs text-slate-400">秒后自动退出，点击任意位置继续使用</p>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit --pretty
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/student/components/layout/student-layout.tsx
git commit -m "feat: add back button + idle timeout auto-logout to StudentLayout"
```

---

### Task 6: Build verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npx tsc --noEmit --pretty
```
Expected: No errors

- [ ] **Step 2: Backend compile check**

```bash
./mvnw compile -q
```
Expected: No errors

- [ ] **Step 3: Git log review**

```bash
git log --oneline -6
```

---

## Affected Files Summary

| Action | File |
|--------|------|
| NEW | `frontend/src/config/idleTimeout.ts` |
| NEW | `frontend/src/hooks/useIdleTimeout.ts` |
| NEW | `frontend/src/components/scanner/StudentEntryCard.tsx` |
| MODIFY | `frontend/src/components/scanner/UiverseProfilePopup.tsx` |
| MODIFY | `frontend/src/features/student/components/layout/student-layout.tsx` |
