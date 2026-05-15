package com.example.demo.modules.telemetry.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * 在 {@code spring.sql.init.mode=never} 的前提下，按需执行 WinCC 变量清单建表脚本，避免未手动跑 SQL 时出现表不存在。
 * 生产环境可在配置中关闭：{@code app.wincc.ensure-watchlist-schema=false}，改由 DBA 管控 DDL。
 */
@Component
@ConditionalOnProperty(prefix = "app.wincc", name = "ensure-watchlist-schema", havingValue = "true", matchIfMissing = true)
public class TelemetryWatchlistSchemaInitializer implements InitializingBean {

    private static final Logger log = LoggerFactory.getLogger(TelemetryWatchlistSchemaInitializer.class);

    private final DataSource dataSource;

    public TelemetryWatchlistSchemaInitializer(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void afterPropertiesSet() {
        try {
            ResourceDatabasePopulator core = new ResourceDatabasePopulator();
            core.addScript(new ClassPathResource("db/telemetry-watchlist-schema.sql"));
            core.setSeparator(";");
            core.setContinueOnError(false);
            DatabasePopulatorUtils.execute(core, dataSource);
            log.info("[WinCC遥测] 已执行 db/telemetry-watchlist-schema.sql（表已存在时 CREATE IF NOT EXISTS 不报错）");
        } catch (Exception e) {
            log.error("[WinCC遥测] 执行 telemetry-watchlist-schema.sql 失败，请检查 twin_system 连接与账号 DDL 权限，或手动执行该文件: {}",
                    e.getMessage());
            throw new IllegalStateException("WinCC 变量清单表初始化失败，请执行 src/main/resources/db/telemetry-watchlist-schema.sql 或查看日志", e);
        }
        try {
            ResourceDatabasePopulator patch = new ResourceDatabasePopulator();
            patch.addScript(new ClassPathResource("db/telemetry-watchlist-tag-add-columns.sql"));
            patch.setSeparator(";");
            patch.setContinueOnError(true);
            DatabasePopulatorUtils.execute(patch, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-watchlist-tag-add-columns.sql（旧表缺列时补齐；已存在列则忽略）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] tag-add-columns 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator poll = new ResourceDatabasePopulator();
            poll.addScript(new ClassPathResource("db/telemetry-watchlist-bundle-add-include-poll.sql"));
            poll.setSeparator(";");
            poll.setContinueOnError(true);
            DatabasePopulatorUtils.execute(poll, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-watchlist-bundle-add-include-poll.sql（旧库缺列时补齐）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] bundle-add-include-poll 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator mk = new ResourceDatabasePopulator();
            mk.addScript(new ClassPathResource("db/telemetry-metric-kind.sql"));
            mk.setSeparator(";");
            mk.setContinueOnError(true);
            DatabasePopulatorUtils.execute(mk, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-metric-kind.sql（指标字典表与种子）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] metric-kind 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator mkRole = new ResourceDatabasePopulator();
            mkRole.addScript(new ClassPathResource("db/telemetry-metric-kind-role.sql"));
            mkRole.setSeparator(";");
            mkRole.setContinueOnError(true);
            DatabasePopulatorUtils.execute(mkRole, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-metric-kind-role.sql（kind_role 列）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] metric-kind-role 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator mkBuiltin = new ResourceDatabasePopulator();
            mkBuiltin.addScript(new ClassPathResource("db/telemetry-metric-kind-builtin-switch-setpoint.sql"));
            mkBuiltin.setSeparator(";");
            mkBuiltin.setContinueOnError(true);
            DatabasePopulatorUtils.execute(mkBuiltin, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-metric-kind-builtin-switch-setpoint.sql（内置 SWITCH/SETPOINT）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] metric-kind-builtin-switch-setpoint 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator mkStatus = new ResourceDatabasePopulator();
            mkStatus.addScript(new ClassPathResource("db/telemetry-metric-kind-builtin-status.sql"));
            mkStatus.setSeparator(";");
            mkStatus.setContinueOnError(true);
            DatabasePopulatorUtils.execute(mkStatus, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-metric-kind-builtin-status.sql（内置 STATUS 状态）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] metric-kind-builtin-status 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator struct = new ResourceDatabasePopulator();
            struct.addScript(new ClassPathResource("db/telemetry-watchlist-tag-structure-columns.sql"));
            struct.setSeparator(";");
            struct.setContinueOnError(true);
            DatabasePopulatorUtils.execute(struct, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-watchlist-tag-structure-columns.sql（结构化映射列）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] tag-structure-columns 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator lim = new ResourceDatabasePopulator();
            lim.addScript(new ClassPathResource("db/telemetry-watchlist-tag-cached-limits.sql"));
            lim.setSeparator(";");
            lim.setContinueOnError(true);
            DatabasePopulatorUtils.execute(lim, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-watchlist-tag-cached-limits.sql（限值缓存列）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] tag-cached-limits 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator glob = new ResourceDatabasePopulator();
            glob.addScript(new ClassPathResource("db/telemetry-global-alarm-limits.sql"));
            glob.setSeparator(";");
            glob.setContinueOnError(true);
            DatabasePopulatorUtils.execute(glob, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-global-alarm-limits.sql（全局报警限）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] global-alarm-limits 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator ov = new ResourceDatabasePopulator();
            ov.addScript(new ClassPathResource("db/telemetry-watchlist-tag-alarm-override.sql"));
            ov.setSeparator(";");
            ov.setContinueOnError(true);
            DatabasePopulatorUtils.execute(ov, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-watchlist-tag-alarm-override.sql（每点报警限覆盖列）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] alarm-override 脚本跳过: {}", e.getMessage());
        }
        try {
            ResourceDatabasePopulator arc = new ResourceDatabasePopulator();
            arc.addScript(new ClassPathResource("db/telemetry-value-archive.sql"));
            arc.setSeparator(";");
            arc.setContinueOnError(true);
            DatabasePopulatorUtils.execute(arc, dataSource);
            log.info("[WinCC遥测] 已尝试执行 db/telemetry-value-archive.sql（遥测归档表）");
        } catch (Exception e) {
            log.debug("[WinCC遥测] value-archive 脚本跳过: {}", e.getMessage());
        }
    }
}
