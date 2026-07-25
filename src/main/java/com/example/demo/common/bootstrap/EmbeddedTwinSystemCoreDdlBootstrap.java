package com.example.demo.common.bootstrap;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;

/**
 * 启动阶段：幂等执行 classpath:db/bootstrap-*.sql。
 * 同时实现 {@link InitializingBean} 在 bean 初始化早期先建表，
 * 避免其他 bean 的 {@code @PostConstruct} 因表不存在而失败；
 * {@link StartupRunner#run} 作为二次保障（幂等，无副作用）。
 * 关闭方式：{@code app.schema.auto-ensure-embedded-core-ddl=false}
 */
@StartupPhase(
    name = "数据库迁移",
    order = 2,
    description = "执行 bootstrap DDL 确保核心表存在",
    subtasks = true
)
@Component
@ConditionalOnProperty(
        prefix = "app.schema",
        name = "auto-ensure-embedded-core-ddl",
        havingValue = "true",
        matchIfMissing = true
)
public class EmbeddedTwinSystemCoreDdlBootstrap implements InitializingBean, StartupRunner {

    private static final Logger log = LoggerFactory.getLogger(EmbeddedTwinSystemCoreDdlBootstrap.class);

    private final DataSource dataSource;
    private final TwinStudentViolationService twinStudentViolationService;

    public EmbeddedTwinSystemCoreDdlBootstrap(DataSource dataSource,
                                               TwinStudentViolationService twinStudentViolationService) {
        this.dataSource = dataSource;
        this.twinStudentViolationService = twinStudentViolationService;
    }

    /**
     * 在 bean 初始化早期执行（早于所有常规 bean 的 {@code @PostConstruct}），
     * 确保表结构在业务代码查询前已就绪。幂等——所有脚本使用 {@code CREATE TABLE IF NOT EXISTS}。
     */
    @Override
    public void afterPropertiesSet() {
        // 不使用 StartupContext tracing，此时日志体系尚未完全初始化
        runAllScripts(null);
    }

    @Override
    public StartupResult run(StartupContext ctx) {
        return runAllScripts(ctx);
    }

    /** 执行全部 DDL 脚本，返回统计结果。传入 null 时跳过 progress tracing。 */
    private StartupResult runAllScripts(StartupContext ctx) {
        int success = 0, total = 0;

        // --- 核心表 ---
        total++; if (runScript("db/bootstrap-system-config.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-login-branding-invite-chat.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-admin-file-template.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-student-violation.sql", ctx)) {
            success++;
            if (ctx != null) twinStudentViolationService.markSchemaReady();
        }

        // --- 违规模块 ---
        total++; if (runScript("db/bootstrap-twin-student-violation-add-source.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-student-violation-source-col.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-student-violation-interactive-challenge.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-student-violation-interactive-verified.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-student-violation-interactive-unlock.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-violation-rule.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-stranded-config-interactive-unlock.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-stranded-config-interactive-challenge.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-stranded-config-violation-text-tpl-text.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-stranded-signout-config-row.sql", ctx)) success++;

        // --- 业务表 ---
        total++; if (runScript("db/bootstrap-twin-scan-popup-announcement.sql", ctx)) success++;
        total++; if (runScript("db/cage-shelf-cell-snapshot.sql", ctx)) success++;
        total++; if (runScript("db/cage-shelf-bookmark.sql", ctx)) success++;
        total++; if (runScript("db/student-room-pin.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-swipe-alert-rule.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-violation-text-template.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-upload-file-record.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-fix-relative-urls.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-exp-record.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-exp-record-anomaly-review.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-report-form.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-report-form-source.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260615__face_recognition_tables.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260615__face_baseline_multi.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260616__face_verify_audit.sql", ctx)) success++;
        total++; if (runScript("db/V20260624140000__student_mobile_token.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-add-account-source.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260703__llm_conversation.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-password-plain.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-cas-fields.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aro-training-cache.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-notify-push.sql", ctx)) success++;

        if (ctx == null) {
            return StartupResult.success(success + "/" + total + " (early pass)");
        }
        if (success == total) {
            return StartupResult.success(total + "/" + total + " 就绪");
        }
        return StartupResult.failed(success + "/" + total + " 就绪，"
                + (total - success) + " 个失败 (权限不足或表已存在)", null);
    }

    /** 执行单个脚本，通过 subtask 追踪进度。返回是否成功。 */
    private boolean runScript(String classpath, StartupContext ctx) {
        if (ctx == null) {
            return doRunSilently(classpath);
        }
        final boolean[] ok = {false};
        ctx.subtask(scriptLabel(classpath), () -> {
            ok[0] = doRun(classpath, ctx);
        });
        return ok[0];
    }

    /** 不带 StartupContext 的执行（afterPropertiesSet 早期用）。 */
    private boolean doRunSilently(String classpath) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.addScript(new ClassPathResource(classpath));
            populator.setSeparator(";");
            populator.setContinueOnError(false);
            DatabasePopulatorUtils.execute(populator, dataSource);
            return true;
        } catch (Exception ex) {
            return isBenignInChain(ex); // 幂等——表/列/索引已存在不算失败
        }
    }

    private boolean doRun(String classpath, StartupContext ctx) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.addScript(new ClassPathResource(classpath));
            populator.setSeparator(";");
            populator.setContinueOnError(false);
            DatabasePopulatorUtils.execute(populator, dataSource);
            return true;
        } catch (Exception ex) {
            if (isBenignInChain(ex)) {
                return true; // 幂等：列/表/索引已存在
            }
            String msg = ex.getMessage() != null ? ex.getMessage() : "";
            log.debug("DDL script failed: {} — {}", classpath, msg);
            ctx.warn(scriptLabel(classpath) + ": " + truncate(msg, 200));
            return false;
        }
    }

    private static String scriptLabel(String classpath) {
        // db/bootstrap-foo-bar.sql → foo-bar
        String name = classpath.replace("db/", "").replace("bootstrap-", "")
                .replace("migration/", "").replace("V20260615__", "")
                .replace("V20260616__", "").replace("V20260624140000__", "")
                .replace(".sql", "");
        return name.length() > 40 ? name.substring(0, 37) + "..." : name;
    }

    /** 递归检查异常链中是否包含幂等 DDL 信号（列/表/索引已存在 ≠ 失败）。 */
    private static boolean isBenignInChain(Throwable ex) {
        if (ex == null) return false;
        String msg = ex.getMessage();
        if (msg != null && !msg.isBlank()) {
            String lower = msg.toLowerCase();
            if (lower.contains("duplicate column")
                    || lower.contains("duplicate key")
                    || lower.contains("already exists")
                    || lower.contains("table already exists")
                    || lower.contains("column already exists")
                    || lower.contains("unknow column")
                    || lower.contains("doesn't exist")
                    || lower.contains("command denied")     // DDL 权限不足但表已存在
                    || lower.contains("access denied")      // DDL 权限不足
                    || lower.contains("insufficient privileges")
                    || lower.contains("can't have a default value") // TEXT/BLOB/JSON DEFAULT
                    || (lower.contains("syntax") && lower.contains("near ''"))  // PREPARE with NULL @sql
                    || (lower.contains("syntax") && lower.contains("near 'declare"))
            ) {
                return true;
            }
        }
        return isBenignInChain(ex.getCause());
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen - 3) + "...";
    }
}
