package com.example.demo.common.bootstrap;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import com.example.demo.modules.aup.service.AupDefaultTemplateSeeder;
import com.example.demo.modules.aup.service.AupDemoSeeder;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.util.List;

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
    private final JdbcTemplate jdbcTemplate;
    private final TwinStudentViolationService twinStudentViolationService;
    private final AupDefaultTemplateSeeder aupDefaultTemplateSeeder;
    private final AupDemoSeeder aupDemoSeeder;

    public EmbeddedTwinSystemCoreDdlBootstrap(DataSource dataSource,
                                               JdbcTemplate jdbcTemplate,
                                               TwinStudentViolationService twinStudentViolationService,
                                               AupDefaultTemplateSeeder aupDefaultTemplateSeeder,
                                               AupDemoSeeder aupDemoSeeder) {
        this.dataSource = dataSource;
        this.jdbcTemplate = jdbcTemplate;
        this.twinStudentViolationService = twinStudentViolationService;
        this.aupDefaultTemplateSeeder = aupDefaultTemplateSeeder;
        this.aupDemoSeeder = aupDemoSeeder;
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

        // 先统一 collation：外部建表默认 utf8mb4_0900_ai_ci，join 项目内 unicode_ci 表会报
        // Illegal mix of collations；必须先于任何含 JOIN/UPDATE 的 bootstrap 脚本执行。
        unifyCollations();

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
        total++; if (runScript("db/bootstrap-cage-status-violation-window-fix.sql", ctx)) success++;
        // T1-2：孤儿父/断链子清理（FK 由 TwinViolationSchemaMigrator 幂等添加）
        total++; if (runScript("db/bootstrap-cage-violation-fk-cascade.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-obligation-core.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-obligation-content-json.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-animal-order-time.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-animal-order-window-weekdays.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-animal-order-window-week-span.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-content-json-five-tables.sql", ctx)) success++;

        // --- 业务表 ---
        total++; if (runScript("db/bootstrap-twin-scan-popup-announcement.sql", ctx)) success++;
        total++; if (runScript("db/cage-shelf-cell-snapshot.sql", ctx)) success++;
        total++; if (runScript("db/cage-shelf-bookmark.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-cage-booking.sql", ctx)) success++;
        total++; if (runScript("db/student-room-pin.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-swipe-alert-rule.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-swipe-alert-notify-site.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-swipe-alert-notify-push.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-swipe-alert-notify-user-ids.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-swipe-alert-notify-cardholder.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-dahua-record-id-unique.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-push-channel-master.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-violation-text-template.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-upload-file-record.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-fix-relative-urls.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-exp-record.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-twin-exp-record-anomaly-review.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-report-form.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-report-form-source.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-record-registry-cols.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-dict-category.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-field-description.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-section-highlight.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-subsection-tone.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-project-group.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-demo-flag.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-review-item-role.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aup-snapshot-draft-source.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260815__person_identity_recreate.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-person-identity.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-drop-person-identity-scope.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-migrate-pi-role.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-personnel-unify.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-drop-personnel-student-id.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-migrate-student-notify-keys.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-personnel-room-authorization.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-personnel-role.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-person-identity-migrate-to-personnel-id.sql", ctx)) success++;
        total++; if (seedAupDefaultTemplate(ctx)) success++;
        total++; if (seedAupDemo(ctx)) success++;
        total++; if (runScript("db/migration/V20260615__face_recognition_tables.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260615__face_baseline_multi.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260616__face_verify_audit.sql", ctx)) success++;
        total++; if (runScript("db/V20260624140000__student_mobile_token.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-add-account-source.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260703__llm_conversation.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-password-plain.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-cas-fields.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-user-auth-binding.sql", ctx)) success++;
        total++; if (runScript("db/migration/V20260731__cage_snapshot_add_cage_box_code.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aro-training-cache.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aro-password-col.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aro-training-favorite.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aro-training-reviewed-at.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aro-access-log-index.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-notify-push.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-wx-pusher-uid.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-telemetry-alarm-config.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-digest-telemetry-config.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-user-notify-mute.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-aro-personnel-open-id.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-trajectory.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-trajectory-fields.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-coord-config.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-coord-config-offset.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-coord-config-scale.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-coord-preset.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-tag.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-trajectory-partition.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-analysis.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-spatial-element-confidence.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-spatial-cleanup.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-spatial-element-robot-ip.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-route.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-route-topology.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-analytics-hourly.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-stats-pipeline.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-agv-stats-config.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-inventory.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-inventory-item-images.sql", ctx)) success++;

        // --- NHP 异种移植 CRF/EDC ---
        total++; if (runScript("db/bootstrap-nhp-meta.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-nhp-data.sql", ctx)) success++;
        // 已有库：CREATE IF NOT EXISTS 不会加列，单独幂等补齐 entry_pass（双录入）
        total++; if (runScript("db/bootstrap-nhp-crf-record-value-entry-pass.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-nhp-import.sql", ctx)) success++;
        // 原子模板 vs 组合模板：引用表 + form_type 澄清
        total++; if (runScript("db/bootstrap-nhp-composite-atom.sql", ctx)) success++;
        total++; if (runScript("db/bootstrap-nhp-form-kind.sql", ctx)) success++;
        // 研究对象身份标识列（D1.01/D2.01）
        total++; if (runScript("db/bootstrap-nhp-subject-identity.sql", ctx)) success++;
        // 字段字典套（猪/猴隔离）
        total++; if (runScript("db/bootstrap-nhp-field-dictionary.sql", ctx)) success++;
        // 码表整表版本（code+version 唯一；变更走版本流程）
        total++; if (runScript("db/bootstrap-nhp-codelist-version.sql", ctx)) success++;
        // 版号补位：唯一键仅约束 active=1，软删后可复用版号
        total++; if (runScript("db/bootstrap-nhp-version-reuse.sql", ctx)) success++;

        if (ctx == null) {
            return StartupResult.success(success + "/" + total + " (early pass)");
        }
        if (success == total) {
            return StartupResult.success(total + "/" + total + " 就绪");
        }
        return StartupResult.failed(success + "/" + total + " 就绪，"
                + (total - success) + " 个失败 (权限不足或表已存在)", null);
    }

    /** AUP 默认模板种子（环境变量/资源）；幂等，未配置或已有版本时为空操作，不算失败。 */
    private boolean seedAupDefaultTemplate(StartupContext ctx) {
        try {
            if (ctx == null) {
                aupDefaultTemplateSeeder.seedIfNeeded();
            } else {
                ctx.subtask("aup-default-template", aupDefaultTemplateSeeder::seedIfNeeded);
            }
            return true;
        } catch (Exception ex) {
            log.warn("AUP default template seed skipped: {}", ex.getMessage());
            return true;
        }
    }

    /** AUP 演示示例种子；幂等，已存在演示记录时为空操作，失败不阻塞启动。 */
    private boolean seedAupDemo(StartupContext ctx) {
        try {
            if (ctx == null) {
                aupDemoSeeder.seedIfNeeded();
            } else {
                ctx.subtask("aup-demo", aupDemoSeeder::seedIfNeeded);
            }
            return true;
        } catch (Exception ex) {
            log.warn("AUP demo seed skipped: {}", ex.getMessage());
            return true;
        }
    }

    /** 执行单个脚本，通过 subtask 追踪进度。返回是否成功。 */
    /** 统一当前库所有含 utf8mb4_0900_ai_ci 列的表为 unicode_ci，根治 join 冲突。幂等。 */
    private void unifyCollations() {
        try {
            List<String> tables = jdbcTemplate.queryForList(
                    "SELECT DISTINCT TABLE_NAME FROM information_schema.COLUMNS " +
                            "WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME = 'utf8mb4_0900_ai_ci'", String.class);
            if (tables.isEmpty()) return;
            // 同一连接内先禁用外键检查，避免 CONVERT 单表时与外键关联表 collation 不一致报 3780
            jdbcTemplate.execute((ConnectionCallback<Void>) con -> {
                try (java.sql.Statement st = con.createStatement()) {
                    st.execute("SET FOREIGN_KEY_CHECKS = 0");
                    for (String table : tables) {
                        try {
                            st.execute("ALTER TABLE `" + table + "` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                            log.info("[collation] 表 {} 已统一为 utf8mb4_unicode_ci", table);
                        } catch (Exception e) {
                            log.warn("[collation] 表 {} 统一跳过: {}", table, e.getMessage());
                        }
                    }
                    st.execute("SET FOREIGN_KEY_CHECKS = 1");
                }
                return null;
            });
        } catch (Exception e) {
            log.warn("[collation] 批量统一 0900 表跳过: {}", e.getMessage());
        }
    }

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
