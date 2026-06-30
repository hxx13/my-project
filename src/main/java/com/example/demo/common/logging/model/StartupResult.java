package com.example.demo.common.logging.model;

/**
 * {@link StartupRunner#run(StartupContext)} 的返回类型。
 */
public record StartupResult(boolean success, String summary, Throwable error) {

    public static StartupResult success(String summary) {
        return new StartupResult(true, summary, null);
    }

    public static StartupResult failed(String summary, Throwable error) {
        return new StartupResult(false, summary, error);
    }
}
