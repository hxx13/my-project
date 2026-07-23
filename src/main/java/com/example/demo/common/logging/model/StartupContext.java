package com.example.demo.common.logging.model;

/**
 * 启动阶段运行时上下文，提供子步骤追踪和进度报告。
 * 由 {@link com.example.demo.common.logging.banner.StartupBanner} 在阶段执行前创建并注入。
 */
public interface StartupContext {

    /**
     * 注册并执行一个子步骤。若提供 label，则进度条前进并显示标签；
     * 若 label 为 null，沉默执行（仅失败时报告）。
     */
    void subtask(String label, Runnable task);

    /**
     * 手动更新进度信息（用于无法拆分子步骤的场景）。
     */
    void progress(int current, int total, String detail);

    /**
     * 在阶段内输出一条警告（不中断执行）。
     */
    void warn(String message);
}
