package com.example.demo.common.logging.annotation;

import java.lang.annotation.*;

/**
 * 标注一个 {@link com.example.demo.common.logging.model.StartupRunner} Bean 为启动阶段。
 * 框架自动按 {@link #order()} 排序执行，并生成赛博朋克动画。
 *
 * <pre>{@code
 * @StartupPhase(name = "数据库迁移", order = 2, subtasks = true)
 * @Component
 * public class MyPhase implements StartupRunner {
 *     public StartupResult run(StartupContext ctx) { ... }
 * }
 * }</pre>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface StartupPhase {

    /** 阶段名称（显示在控制台） */
    String name();

    /** 执行顺序（越小越先执行） */
    int order() default 100;

    /** 阶段描述（hover 提示） */
    String description() default "";

    /** 是否开启子步骤进度条 */
    boolean subtasks() default false;
}
