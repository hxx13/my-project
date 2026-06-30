package com.example.demo.common.bootstrap;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * 启动阶段：幂等执行 classpath:db/bootstrap-*.sql。
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
public class EmbeddedTwinSystemCoreDdlBootstrap implements StartupRunner {

    private final DataSource dataSource;
    private final TwinStudentViolationService twinStudentViolationService;

    public EmbeddedTwinSystemCoreDdlBootstrap(DataSource dataSource,
                                               TwinStudentViolationService twinStudentViolationService) {
        this.dataSource = dataSource;
        this.twinStudentViolationService = twinStudentViolationService;
    }

    @Override
    public StartupResult run(StartupContext ctx) {
        int success = 0, total = 0;

        // --- 核心表 ---
        total++; if (runScript("db/bootstrap-login-branding-invite-chat.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-admin-file-template.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-student-violation.sql", ctx)) {
            success++;
            twinStudentViolationService.markSchemaReady();
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

        if (success == total) {
            return StartupResult.success(total + "/" + total + " 就绪");
        }
        return StartupResult.failed(success + "/" + total + " 就绪，"
                + (total - success) + " 个失败 (权限不足或表已存在)", null);
    }

    /** 执行单个脚本，通过 subtask 追踪进度。返回是否成功。 */
    private boolean runScript(String classpath, StartupContext ctx) {
        final boolean[] ok = {false};
        ctx.subtask(scriptLabel(classpath), () -> {
            ok[0] = doRun(classpath, ctx);
        });
        return ok[0];
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
            ctx.warn(scriptLabel(classpath) + ": " + truncate(msg, 120));
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
                    || (lower.contains("syntax") && lower.contains("near ''"))  // PREPARE with NULL @sql
                    || (lower.contains("syntax") && lower.contains("near 'declare"))  // DECLARE 重复
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
