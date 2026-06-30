package com.example.demo.common.logging.model;

/**
 * 替代 Spring {@link org.springframework.boot.ApplicationRunner} 的启动阶段执行器。
 * 与 {@link com.example.demo.common.logging.annotation.StartupPhase @StartupPhase} 注解配合使用，
 * 框架自动扫描、排序、动画化执行。
 */
@FunctionalInterface
public interface StartupRunner {

    /**
     * 执行该启动阶段。
     *
     * @param ctx 启动上下文，提供子步骤追踪和进度报告
     * @return 执行结果
     */
    StartupResult run(StartupContext ctx);
}
