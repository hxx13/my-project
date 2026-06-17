/** 通行动效：中心停留 → 贝塞尔飞入/飞出 → 手绘文案 */

/** 仓鼠跑轮完整循环参考时长（秒） */
export const ACCESS_MOTION_HAMSTER_REF_LOOP_SEC = 5;
/** 三种动效统一循环：比仓鼠参考短 2 秒 */
export const ACCESS_MOTION_LOOP_SEC = ACCESS_MOTION_HAMSTER_REF_LOOP_SEC - 2;

/** 中心停留时长（进入 / 离开减速段） */
export const ACCESS_MOTION_CENTER_HOLD_MS = 2800;
/** 中心 ↔ 锚点 飞行动画时长（进入）；略慢以便与同时弹出的进入确认胶囊协调 */
export const ACCESS_MOTION_FLY_MS = 3600;
/** 离开：飞回中心（略短） */
export const ACCESS_MOTION_EXIT_FLY_MS = 1800;
/** 离开：中心展示「已离开」 */
export const ACCESS_MOTION_EXIT_SLOW_MS = 1000;
/** 离开：淡出消失 */
export const ACCESS_MOTION_FADE_MS = 450;

export const ACCESS_MOTION_FLY_EASE = [0.22, 0.61, 0.36, 1] as const;

/** 进入：中心停留结束后刷新 analyze（飞向右下角开始时，不等待落点动画跑满） */
export const ENTER_REFRESH_MS = ACCESS_MOTION_CENTER_HOLD_MS;

export const ACCESS_MOTION_ENTER_FLY_MS = ACCESS_MOTION_CENTER_HOLD_MS + ACCESS_MOTION_FLY_MS;

export const ACCESS_MOTION_EXIT_TOTAL_MS =
    ACCESS_MOTION_EXIT_FLY_MS + ACCESS_MOTION_EXIT_SLOW_MS + ACCESS_MOTION_FADE_MS + 80;

/** @deprecated 使用 ACCESS_MOTION_FLY_MS */
export const ACCESS_MOTION_ENTER_TOTAL_MS = ACCESS_MOTION_ENTER_FLY_MS;

/** @deprecated 使用 ACCESS_MOTION_FLY_MS */
export const ENTER_FLY_MOTION_MS = ACCESS_MOTION_FLY_MS;

export const ENTER_FLY_TRANSITION = {
    duration: ACCESS_MOTION_FLY_MS / 1000,
    ease: ACCESS_MOTION_FLY_EASE,
};

export const ACCESS_MOTION_TEXT = {
    enterLoading: "正在进入中......",
    enterDone: "您已进入!",
    exitLoading: "正在离开.......",
    exitDone: "已离开",
} as const;
