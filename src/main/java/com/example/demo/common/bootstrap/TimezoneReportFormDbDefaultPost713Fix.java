package com.example.demo.common.bootstrap;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;

/**
 * @deprecated 误对 Java 墙钟写入的 report_form_definition 再次 +8h；
 * 已由 {@link TimezoneReportFormDefinitionPost713Revert} 回滚。不再注册为 Bean。
 */
@Deprecated
public class TimezoneReportFormDbDefaultPost713Fix implements ApplicationRunner {

    @Override
    public void run(ApplicationArguments args) {
        // 已禁用
    }
}
