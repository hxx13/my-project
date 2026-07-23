package com.example.demo.modules.telemetry.config;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * 启动阶段：幂等执行 WinCC 遥测相关 DDL 脚本，确保表结构存在。
 * 关闭方式：{@code app.wincc.ensure-watchlist-schema=false}
 */
@StartupPhase(
    name = "WinCC遥测",
    order = 4,
    description = "执行遥测 watchlist/metric/archive DDL 脚本",
    subtasks = true
)
@Component
@ConditionalOnProperty(prefix = "app.wincc", name = "ensure-watchlist-schema", havingValue = "true", matchIfMissing = true)
public class TelemetryWatchlistSchemaInitializer implements StartupRunner {

    private final DataSource dataSource;

    public TelemetryWatchlistSchemaInitializer(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public StartupResult run(StartupContext ctx) {
        int ok = 0;

        ctx.subtask("watchlist-schema", () -> runCore("db/telemetry-watchlist-schema.sql", false)); ok++;
        ctx.subtask("tag-add-columns", () -> runBestEffort("db/telemetry-watchlist-tag-add-columns.sql")); ok++;
        ctx.subtask("bundle-poll", () -> runBestEffort("db/telemetry-watchlist-bundle-add-include-poll.sql")); ok++;
        ctx.subtask("metric-kind", () -> runBestEffort("db/telemetry-metric-kind.sql")); ok++;
        ctx.subtask("kind-role", () -> runBestEffort("db/telemetry-metric-kind-role.sql")); ok++;
        ctx.subtask("builtin-switch", () -> runBestEffort("db/telemetry-metric-kind-builtin-switch-setpoint.sql")); ok++;
        ctx.subtask("builtin-status", () -> runBestEffort("db/telemetry-metric-kind-builtin-status.sql")); ok++;
        ctx.subtask("tag-structure", () -> runBestEffort("db/telemetry-watchlist-tag-structure-columns.sql")); ok++;
        ctx.subtask("cached-limits", () -> runBestEffort("db/telemetry-watchlist-tag-cached-limits.sql")); ok++;
        ctx.subtask("global-alarm", () -> runBestEffort("db/telemetry-global-alarm-limits.sql")); ok++;
        ctx.subtask("alarm-override", () -> runBestEffort("db/telemetry-watchlist-tag-alarm-override.sql")); ok++;
        ctx.subtask("value-archive", () -> runBestEffort("db/telemetry-value-archive.sql")); ok++;
        ctx.subtask("insights-tables", () -> runBestEffort("db/telemetry-insights.sql")); ok++;
        ctx.subtask("chart-group-metadata", () -> runBestEffort("db/telemetry-chart-group-metadata-column.sql")); ok++;

        return StartupResult.success("14 个脚本已同步");
    }

    private void runCore(String path, boolean continueOnError) {
        ResourceDatabasePopulator p = new ResourceDatabasePopulator();
        p.addScript(new ClassPathResource(path));
        p.setSeparator(";");
        p.setContinueOnError(continueOnError);
        DatabasePopulatorUtils.execute(p, dataSource);
    }

    private void runBestEffort(String path) {
        try {
            runCore(path, true);
        } catch (Exception ignored) {
            // 幂等脚本，失败不阻塞
        }
    }
}
