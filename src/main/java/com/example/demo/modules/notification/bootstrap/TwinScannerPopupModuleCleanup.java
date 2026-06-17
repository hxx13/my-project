package com.example.demo.modules.notification.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 移除已废弃的 twin_scanner_popup 配置模块（进出居中提示已改为 ScanEntryNotice 内置文案，不再读系统配置）。
 * 延迟免冻结开关已迁移至 twin_dahua_issue，见 {@link com.example.demo.modules.twin.scan.delay.config.DahuaIssueScanDelayConfigSeed}。
 */
@Component
@Order(124)
public class TwinScannerPopupModuleCleanup implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(TwinScannerPopupModuleCleanup.class);
    private static final String MODULE = "twin_scanner_popup";

    private final JdbcTemplate jdbcTemplate;

    public TwinScannerPopupModuleCleanup(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int defs = jdbcTemplate.update(
                    "DELETE FROM sys_system_config_def WHERE module = ?",
                    MODULE
            );
            int values = jdbcTemplate.update(
                    "DELETE FROM sys_system_config WHERE module = ?",
                    MODULE
            );
            if (defs + values > 0) {
                log.info("[twin_scanner_popup] removed obsolete config rows: def={}, value={}", defs, values);
            }
        } catch (Exception e) {
            log.warn("[twin_scanner_popup] cleanup skip: {}", e.getMessage());
        }
    }
}
