package com.example.demo.common.logging.banner;

/**
 * 阶段状态枚举。
 */
public enum PhaseState {
    /** 执行中 — 显示旋转指示器 */
    RUNNING,
    /** 成功 — 绿色 ✓ */
    SUCCESS,
    /** 失败 — 红色 ✗ */
    FAILED,
    /** 跳过 — 灰色 ○ */
    SKIPPED,
}
