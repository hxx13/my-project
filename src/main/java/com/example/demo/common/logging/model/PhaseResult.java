package com.example.demo.common.logging.model;

/**
 * 单个启动阶段或子步骤的执行结果。
 */
public record PhaseResult(boolean ok, String message, Throwable error) {

    public static PhaseResult ok(String message) {
        return new PhaseResult(true, message, null);
    }

    public static PhaseResult fail(String message) {
        return new PhaseResult(false, message, null);
    }

    public static PhaseResult fail(String message, Throwable error) {
        return new PhaseResult(false, message, error);
    }
}
