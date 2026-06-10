# 自动签退倒计时显示 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扫码弹出离开确认时，若存在自动签退计时器则显示实时倒计时

**Architecture:** 后端在 analyze 接口中查询 `twin_dahua_activation_state` 表获取 `scheduled_exit_at`，计算剩余秒数返回给前端；前端在 ActionButtons 区域和 SwipeExitConfirmDialog 两处分别显示倒计时标签和完整倒计时文案

**Tech Stack:** Java Spring Boot + MyBatis (后端), React TypeScript + framer-motion (前端)

---

### Task 1: 后端 Mapper — 新增按 userId 查激活状态

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dahua/mapper/DahuaSwingMapper.java` (追加方法)
- Modify: `src/main/resources/mapper/DahuaSwingMapper.xml` (追加 SQL)

- [ ] **Step 1: Mapper 接口新增方法**

在 `DahuaSwingMapper.java` 的 `listActivatedUsers()` 方法之后、接口闭合 `}` 之前追加：

```java
    /** 列出某用户所有待处理激活状态行（含 scheduled_exit_at 不为空的记录） */
    List<DahuaActivationState> listActivationStatesByUserId(@Param("userId") String userId);
```

- [ ] **Step 2: Mapper XML 新增 SQL**

在 `DahuaSwingMapper.xml` 的 `</mapper>` 闭合标签之前追加：

```xml
    <select id="listActivationStatesByUserId" resultType="com.example.demo.modules.twin.dahua.entity.DahuaActivationState">
        SELECT id,
               task_id AS taskId,
               user_id AS userId,
               channel_code AS channelCode,
               state,
               counter,
               DATE_FORMAT(activated_at, '%Y-%m-%d %H:%i:%s') AS activatedAt,
               DATE_FORMAT(last_swipe_at, '%Y-%m-%d %H:%i:%s') AS lastSwipeAt,
               DATE_FORMAT(scheduled_exit_at, '%Y-%m-%d %H:%i:%s') AS scheduledExitAt,
               DATE_FORMAT(debounce_until, '%Y-%m-%d %H:%i:%s') AS debounceUntil,
               last_record_id AS lastRecordId,
               DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
        FROM twin_dahua_activation_state
        WHERE user_id = #{userId}
          AND scheduled_exit_at IS NOT NULL
        ORDER BY scheduled_exit_at ASC
    </select>
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/dahua/mapper/DahuaSwingMapper.java src/main/resources/mapper/DahuaSwingMapper.xml
git commit -m "feat: add listActivationStatesByUserId query for auto-signout countdown"
```

---

### Task 2: 后端 DTO — 新增计时器字段

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/scan/dto/ScanAnalyzeResponseDTO.java`

- [ ] **Step 1: 新增 3 个字段**

在 `ScanAnalyzeResponseDTO.java` 的 `violationInteractiveChallenge` 字段之后、类闭合 `}` 之前追加：

```java
    /** 自动签退计时器状态：PENDING_ACTIVATION / AUTO_EXIT_SCHEDULED；无计时器时为 null */
    private String autoSignoutState;
    /** 计划自动签退时刻 (yyyy-MM-dd HH:mm:ss)；无计时器时为 null */
    private String autoSignoutScheduledAt;
    /** 距离自动签退剩余秒数；无计时器或已到期时为 null */
    private Integer autoSignoutSecondsRemaining;
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/scan/dto/ScanAnalyzeResponseDTO.java
git commit -m "feat: add auto-signout timer fields to ScanAnalyzeResponseDTO"
```

---

### Task 3: 后端 Service — analyze 中查询并填充计时器

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/scan/service/TwinScanAppService.java`

- [ ] **Step 1: 注入 DahuaSwingMapper**

在现有 `@Autowired` 注入块末尾（`private ScanAnalyzeTimingTrace analyzeTimingTrace;` 之后）追加：

```java
    @Autowired
    private com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper dahuaSwingMapper;
```

- [ ] **Step 2: 在 analyzeScan() 返回前查询并填充计时器**

在 `result.setSuccess(true);` 之前（即在 `ScanPopupAnnouncement` 加载完成之后、设置 success 之前），追加计时器查询逻辑：

```java
            // 自动签退倒计时：仅 INSIDE 状态有意义（OUTSIDE 无计时器）
            if ("INSIDE".equals(result.getCurrentState()) && realPhysicalId != null && !realPhysicalId.isBlank()) {
                try {
                    java.util.List<com.example.demo.modules.twin.dahua.entity.DahuaActivationState> states =
                            dahuaSwingMapper.listActivationStatesByUserId(realPhysicalId);
                    if (states != null && !states.isEmpty()) {
                        java.time.LocalDateTime now = java.time.LocalDateTime.now();
                        java.time.format.DateTimeFormatter dtf =
                                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
                        // 取最早未到期的 scheduled_exit_at
                        for (com.example.demo.modules.twin.dahua.entity.DahuaActivationState st : states) {
                            String schedStr = st.getScheduledExitAt();
                            if (schedStr == null || schedStr.isBlank()) continue;
                            try {
                                java.time.LocalDateTime scheduled = java.time.LocalDateTime.parse(schedStr, dtf);
                                long remaining = java.time.Duration.between(now, scheduled).getSeconds();
                                if (remaining > 0) {
                                    result.setAutoSignoutState(st.getState());
                                    result.setAutoSignoutScheduledAt(schedStr);
                                    result.setAutoSignoutSecondsRemaining((int) remaining);
                                    break;
                                }
                            } catch (Exception ignore) {
                                // 日期解析失败则跳过该行
                            }
                        }
                    }
                } catch (Exception e) {
                    log.debug("[扫码·解析] trace={} 自动签退计时器查询失败 id={} err={}",
                            traceId, realPhysicalId, e.getMessage());
                }
            }
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/scan/service/TwinScanAppService.java
git commit -m "feat: query activation timer in analyzeScan for auto-signout countdown"
```

---

### Task 4: 前端 TypeScript 类型 — 新增计时器字段

**Files:**
- Modify: `frontend/src/api/types/scanner.ts`

- [ ] **Step 1: AnalyzeResponse 新增字段**

在 `AnalyzeResponse` 接口的 `violationInteractiveChallenge` 之后、闭合 `}` 之前追加：

```ts
    /** 自动签退计时器状态；无计时器时为 null */
    autoSignoutState?: string | null;
    /** 计划自动签退时刻 */
    autoSignoutScheduledAt?: string | null;
    /** 距离自动签退剩余秒数 */
    autoSignoutSecondsRemaining?: number | null;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/types/scanner.ts
git commit -m "feat: add auto-signout timer fields to AnalyzeResponse type"
```

---

### Task 5: 前端 PopupState + useProfilePopup — 透传计时器

**Files:**
- Modify: `frontend/src/components/scanner/components/types.ts`
- Modify: `frontend/src/components/scanner/useProfilePopup.ts`

- [ ] **Step 1: PopupState 新增字段**

在 `types.ts` 的 `PopupState` 接口，`accessNoticeDurationMs` 之后、闭合 `}` 之前追加：

```ts
    /** 自动签退计时器状态 */
    autoSignoutState: string | null;
    /** 距离自动签退剩余秒数 */
    autoSignoutSecondsRemaining: number | null;
```

- [ ] **Step 2: useProfilePopup 提取并透传**

在 `useProfilePopup.ts` 的 return `state` 对象中（约第 545 行附近），`accessNoticeDurationMs: noticeSettings.durationMs,` 之后追加：

```ts
            autoSignoutState: result?.autoSignoutState ?? null,
            autoSignoutSecondsRemaining: result?.autoSignoutSecondsRemaining ?? null,
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/scanner/components/types.ts frontend/src/components/scanner/useProfilePopup.ts
git commit -m "feat: pass auto-signout timer fields through PopupState and useProfilePopup"
```

---

### Task 6: 前端 ActionButtons — 简短倒计时标签

**Files:**
- Modify: `frontend/src/components/scanner/components/ActionButtons.tsx`

- [ ] **Step 1: 新增 props + 倒计时逻辑**

将 `ActionButtons` 组件替换为以下完整内容：

```tsx
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedRoomButton } from "@/components/scanner/AnimatedRoomButton";
import { HamsterExitButton } from "@/components/scanner/HamsterExitButton";
import type { RoomInfo } from "@/api/types/scanner";
import { resolveRoomActionDensity } from "@/components/scanner/roomActionDensity";

export type { RoomActionDensity } from "@/components/scanner/roomActionDensity";

interface ActionButtonsProps {
    action: "ENTER" | "EXIT";
    targetRooms: RoomInfo[];
    onRoomClick: (room: RoomInfo, index: number) => void;
    isSuccess: boolean;
    exitCelebrateRoomId: string | null;
    actedRoomId: string | null;
    finishedRooms: string[];
    autoActionRoomId: string;
    getButtonText: (room: RoomInfo, roomId: string) => string;
    isEnterLocked: (room: RoomInfo) => boolean;
    isExitLocked: (room: RoomInfo) => boolean;
    getKeepCardState: (index: number) => boolean;
    setKeepCardState: (index: number, checked: boolean) => void;
    /** 自动签退剩余秒数（来自 analyze）；null 则不显示 */
    autoSignoutSecondsRemaining?: number | null;
    /** 自动签退计时器状态 */
    autoSignoutState?: string | null;
}

function formatCountdown(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const ActionButtons = (props: ActionButtonsProps) => {
    const { action, targetRooms, onRoomClick, exitCelebrateRoomId, finishedRooms,
        autoSignoutSecondsRemaining, autoSignoutState } = props;
    const safeRooms = Array.isArray(targetRooms) ? targetRooms : [];
    const density = resolveRoomActionDensity(safeRooms.length);
    const gapClass = density === "normal" ? "gap-4" : density === "compact" ? "gap-2.5" : "gap-1.5";
    const maxWClass = density === "dense" ? "max-w-[min(360px,100%)]" : "max-w-[360px]";
    const enterRowH = density === "normal" ? "h-[55px]" : density === "compact" ? "h-[48px]" : "h-[40px]";
    const exitRowMinH = density === "normal" ? "min-h-[7.5rem]" : density === "compact" ? "min-h-[6.5rem]" : "min-h-[5.5rem]";

    // 本地倒计时（仅在 EXIT 且有初始秒数时启用）
    const [countdown, setCountdown] = useState<number | null>(
        action === "EXIT" && autoSignoutSecondsRemaining != null && autoSignoutSecondsRemaining > 0
            ? autoSignoutSecondsRemaining
            : null
    );
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (action === "EXIT" && autoSignoutSecondsRemaining != null && autoSignoutSecondsRemaining > 0) {
            setCountdown(autoSignoutSecondsRemaining);
        } else {
            setCountdown(null);
        }
    }, [autoSignoutSecondsRemaining, action]);

    useEffect(() => {
        if (countdown == null || countdown <= 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev == null || prev <= 1) {
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [countdown != null]);

    const showCountdown = action === "EXIT" && countdown != null && countdown > 0;

    return (
        <div
            className={`flex flex-col w-full mx-auto min-h-0 max-h-full overflow-y-auto overflow-x-visible ${gapClass} ${maxWClass} pl-1 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
            {/* 自动签退倒计时标签 */}
            {showCountdown && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-bold text-amber-400 shrink-0"
                >
                    <span>⏱</span>
                    <span>自动签退 {formatCountdown(countdown!)}</span>
                </motion.div>
            )}

            <AnimatePresence>
                {safeRooms.map((room, idx) => {
                    const roomId = room.officialRoomId || room.id;
                    const isFinished = finishedRooms.includes(roomId);
                    if (action === "ENTER") {
                        return (
                            <motion.div
                                key={roomId}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`relative w-full shrink-0 ${enterRowH} group flex items-center justify-center`}
                            >
                                <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 w-[88px] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                                    <label className="flex items-center gap-1.5 text-[10px] text-slate-400 whitespace-nowrap">
                                        <input type="checkbox" checked={props.getKeepCardState(idx)} onChange={(e) => props.setKeepCardState(idx, e.target.checked)} className="accent-rose-500 w-3.5 h-3.5" />
                                        长期占有
                                    </label>
                                </div>
                                <AnimatedRoomButton
                                    text={props.getButtonText(room, roomId)}
                                    disabled={props.isEnterLocked(room)}
                                    density={density}
                                    onClick={() => onRoomClick(room, idx)}
                                />
                            </motion.div>
                        );
                    }
                    return (
                        <motion.div
                            key={roomId}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`relative w-full shrink-0 ${exitRowMinH} group flex items-center justify-center`}
                        >
                            <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 w-[88px] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                                <label className="flex items-center gap-1.5 text-[10px] text-slate-400 whitespace-nowrap">
                                    <input type="checkbox" checked={props.getKeepCardState(idx)} onChange={(e) => props.setKeepCardState(idx, e.target.checked)} className="accent-rose-500 w-3.5 h-3.5" />
                                    不还卡出
                                </label>
                            </div>
                            <HamsterExitButton
                                roomName={room.displayName || room.name}
                                variantSeed={roomId}
                                isWorking={!isFinished}
                                isSuccess={Boolean(exitCelebrateRoomId && exitCelebrateRoomId === roomId)}
                                isFinished={isFinished}
                                density={density}
                                onClick={() => {
                                    if (props.isExitLocked(room)) return;
                                    onRoomClick(room, idx);
                                }}
                            />
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/scanner/components/ActionButtons.tsx
git commit -m "feat: add auto-signout countdown label to ActionButtons"
```

---

### Task 7: 前端 SwipeExitConfirmDialog — 完整倒计时 + 文案 + 归零回调

**Files:**
- Modify: `frontend/src/components/scanner/SwipeExitConfirmDialog.tsx`

- [ ] **Step 1: 重写组件，新增倒计时功能**

将 `SwipeExitConfirmDialog.tsx` 替换为以下完整内容：

```tsx
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut } from "lucide-react";

function formatCountdown(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface SwipeExitConfirmDialogProps {
    open: boolean;
    userName: string;
    roomName: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** 自动签退剩余秒数（来自 analyze）；null/undefined 则不显示倒计时区块 */
    autoSignoutSeconds?: number | null;
    /** 倒计时归零回调：关闭弹窗 + 刷新状态 */
    onCountdownEnd?: () => void;
}

export function SwipeExitConfirmDialog({
    open,
    userName,
    roomName,
    onConfirm,
    onCancel,
    autoSignoutSeconds,
    onCountdownEnd,
}: SwipeExitConfirmDialogProps) {
    const [countdown, setCountdown] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasEndedRef = useRef(false);

    // 弹窗打开时初始化倒计时
    useEffect(() => {
        if (open && autoSignoutSeconds != null && autoSignoutSeconds > 0) {
            setCountdown(autoSignoutSeconds);
            hasEndedRef.current = false;
        } else {
            setCountdown(null);
        }
    }, [open, autoSignoutSeconds]);

    // 每秒 tick
    useEffect(() => {
        if (countdown == null || countdown <= 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev == null || prev <= 1) {
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [countdown != null]);

    // 归零时触发回调（仅一次）
    useEffect(() => {
        if (countdown === 0 && !hasEndedRef.current) {
            hasEndedRef.current = true;
            // 短暂延迟让用户看到 00:00
            const t = setTimeout(() => {
                onCountdownEnd?.();
            }, 800);
            return () => clearTimeout(t);
        }
    }, [countdown, onCountdownEnd]);

    const showCountdown = countdown != null && countdown > 0;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[100000] flex items-center justify-center bg-[#020617]/90 backdrop-blur-md"
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onCancel();
                    }}
                >
                    {/* Backdrop click to cancel */}
                    <div className="absolute inset-0" onClick={onCancel} />

                    {/* Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="relative z-10 w-full max-w-[400px] mx-4 rounded-2xl border border-white/15 bg-[#0f172a]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
                    >
                        {/* Close button */}
                        <button
                            onClick={onCancel}
                            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="取消 Esc"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-8 pt-10">
                            {/* Icon */}
                            <div className="flex justify-center mb-5">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 border border-red-400/30">
                                    <LogOut className="w-6 h-6 text-red-400" />
                                </div>
                            </div>

                            {/* Title */}
                            <h2 className="text-center text-lg font-bold text-white mb-2">
                                确认离开
                            </h2>

                            {/* Auto-Signout Countdown Section */}
                            {showCountdown && (
                                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <div className="flex items-center justify-center gap-2 mb-1.5">
                                        <span className="text-2xl font-mono font-bold text-amber-400 tracking-wider">
                                            {formatCountdown(countdown!)}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-amber-300/80 text-center leading-snug">
                                        当前已进入自动签退阶段，系统将在倒计时结束后自动为您签退。要现在手动签退吗？
                                    </p>
                                </div>
                            )}

                            {/* User & Room Info */}
                            <div className="text-center mb-5 space-y-1">
                                <p className="text-sm text-white/80">
                                    <span className="font-semibold text-white">{userName || "未知人员"}</span>
                                </p>
                                <p className="text-[13px] text-slate-400">
                                    当前处于<span className="text-amber-400 font-semibold">进入</span>状态，将离开{" "}
                                    <span className="text-white font-semibold">{roomName || "当前房间"}</span>
                                </p>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-white/8 mb-6" />

                            {/* Warning */}
                            <p className="text-[11px] text-slate-500 text-center mb-6 leading-snug">
                                离开后门禁权限将被回收，如需再次进入请重新扫码
                            </p>

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="flex-1 py-2.5 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    onClick={onConfirm}
                                    className="flex-1 py-2.5 rounded-xl border border-red-500/40 bg-red-500/20 text-sm font-bold text-red-300 hover:bg-red-500/30 hover:text-red-200 transition-colors shadow-lg shadow-red-900/20"
                                >
                                    确认离开
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/scanner/SwipeExitConfirmDialog.tsx
git commit -m "feat: add auto-signout countdown display to SwipeExitConfirmDialog"
```

---

### Task 8: 前端 UiverseProfilePopup + DebugNav — 传递新 props 给两处 UI

**Files:**
- Modify: `frontend/src/components/scanner/UiverseProfilePopup.tsx`
- Modify: `frontend/src/features/dev-tools/DebugNav.tsx`

- [ ] **Step 1: UiverseProfilePopup 传递 timer props 给 ActionButtons**

在 `UiverseProfilePopup.tsx` 的 `<ActionButtons` 组件调用处（约第 295 行），追加两个新 props。找到：

```tsx
                                <ActionButtons
                                    action={state.action}
                                    targetRooms={state.targetRooms}
                                    ...
```

在该组件的 props 末尾追加 `setKeepCardState` 之后、`/>` 之前：

```tsx
                                    autoSignoutSecondsRemaining={state.autoSignoutSecondsRemaining}
                                    autoSignoutState={state.autoSignoutState}
```

- [ ] **Step 2: DebugNav 传递 autoSignoutSeconds 给 SwipeExitConfirmDialog**

在 `DebugNav.tsx` 中找到 `<SwipeExitConfirmDialog`（约第 570 行）。需要新增一个 state 来保存 analyze 返回的 timer 信息，并传给 dialog。

在 `DebugNav` 组件中（约第 50 行 `activeResult` state 附近），新增：

```tsx
    const [activeAutoSignoutSeconds, setActiveAutoSignoutSeconds] = useState<number | null>(null);
```

在 analyzeMutation 的 `onSuccess` 回调中（约第 56 行），`setActiveResult(data);` 之后追加：

```tsx
            setActiveAutoSignoutSeconds(data.autoSignoutSecondsRemaining ?? null);
```

修改 `<SwipeExitConfirmDialog` 调用，新增两个 props：

```tsx
            <SwipeExitConfirmDialog
                open={autoExitConfirm !== null}
                userName=""
                roomName=""
                onConfirm={() => {
                    if (autoExitConfirm) {
                        doExecute(autoExitConfirm);
                    }
                    setAutoExitConfirm(null);
                }}
                onCancel={() => setAutoExitConfirm(null)}
                autoSignoutSeconds={activeAutoSignoutSeconds}
                onCountdownEnd={() => {
                    setAutoExitConfirm(null);
                    if (lastScannedId) {
                        analyzeMutation.mutate(lastScannedId);
                    }
                }}
            />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/scanner/UiverseProfilePopup.tsx frontend/src/features/dev-tools/DebugNav.tsx
git commit -m "feat: wire auto-signout timer props to UiverseProfilePopup and DebugNav"
```

---

### Task 9: 编译验证

- [ ] **Step 1: 后端编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```
Expected: BUILD SUCCESS

- [ ] **Step 2: 前端编译**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to modified files

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: verify build passes for auto-signout countdown feature"
```
