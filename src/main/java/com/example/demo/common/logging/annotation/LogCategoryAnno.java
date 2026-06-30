package com.example.demo.common.logging.annotation;

import java.lang.annotation.*;

/**
 * 标注一个模块配置类，自动注册为日志分类。
 * 替代 {@code DebugToggleService.LOG_CATEGORIES} 硬编码。
 *
 * <pre>{@code
 * @LogCategoryAnno(key = "face", loggerName = "com.example.demo.modules.face",
 *     description = "人脸识别模块", defaultLevel = "WARN")
 * @Configuration
 * public class FaceModuleConfig { }
 * }</pre>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface LogCategoryAnno {

    /** 分类标识（管理端用） */
    String key();

    /** Logback logger 名称前缀 */
    String loggerName();

    /** 中文描述 */
    String description();

    /** 默认最低级别（OFF / ERROR / WARN / INFO / DEBUG） */
    String defaultLevel() default "INFO";
}
