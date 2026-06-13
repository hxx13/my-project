package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;

import javax.sql.DataSource;

/**
 * 在 {@code spring.sql.init.mode=never} 时，于应用启动阶段在库内执行与 {@code scripts/*.ddl.sql} 同源的 classpath SQL，
 * 避免无法在库外手工跑脚本时出现缺表（含 {@code twin_student_violation}）。需数据源账号具备 CREATE TABLE 等权限。
 * <p>
 * 关闭方式：{@code app.schema.auto-ensure-embedded-core-ddl=false}（生产由 DBA 独占 DDL 时可关）。
 */
@Component
@Order(2)
@ConditionalOnProperty(
        prefix = "app.schema",
        name = "auto-ensure-embedded-core-ddl",
        havingValue = "true",
        matchIfMissing = true
)
public class EmbeddedTwinSystemCoreDdlBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(EmbeddedTwinSystemCoreDdlBootstrap.class);

    private final DataSource dataSource;
    private final TwinStudentViolationService twinStudentViolationService;

    public EmbeddedTwinSystemCoreDdlBootstrap(DataSource dataSource, TwinStudentViolationService twinStudentViolationService) {
        this.dataSource = dataSource;
        this.twinStudentViolationService = twinStudentViolationService;
    }

    @Override
    public void run(ApplicationArguments args) {
        runScript("db/bootstrap-login-branding-invite-chat.sql", "登录轮播/推荐码/站内信等核心表");
        runScript("db/bootstrap-admin-file-template.sql", "admin_file_template（文件模板下载）");
        if (runScript("db/bootstrap-twin-student-violation.sql", "twin_student_violation（学生违规管理）")) {
            twinStudentViolationService.markSchemaReady();
        }
        runScript("db/bootstrap-twin-student-violation-add-source.sql", "stranded_violation_config（滞留违规配置表）");
        runScript("db/bootstrap-twin-student-violation-source-col.sql", "twin_student_violation source列（如已存在则跳过）");
        runScript("db/bootstrap-twin-student-violation-interactive-challenge.sql", "twin_student_violation interactive_challenge列");
        runScript("db/bootstrap-twin-student-violation-interactive-verified.sql", "twin_student_violation interactive_challenge_verified_at列");
        runScript("db/bootstrap-twin-student-violation-interactive-unlock.sql", "twin_student_violation interactive_unlock_on_verify列");
        runScript("db/bootstrap-stranded-config-interactive-unlock.sql", "stranded_violation_config interactive_unlock_on_verify列");
        runScript("db/bootstrap-stranded-config-interactive-challenge.sql", "stranded_violation_config 交互式确认字段");
        runScript("db/bootstrap-stranded-config-violation-text-tpl-text.sql", "stranded_violation_config violation_text_tpl TEXT");
        runScript("db/bootstrap-twin-scan-popup-announcement.sql", "twin_scan_popup_announcement（扫码弹窗公告）");
        runScript("db/cage-shelf-cell-snapshot.sql", "cage_shelf_cell_snapshot（笼位快照）");
        runScript("db/cage-shelf-bookmark.sql", "cage_shelf_bookmark（笼架收藏）");
        runScript("db/student-room-pin.sql", "student_room_pin（房间置顶）");
        runScript("db/bootstrap-twin-swipe-alert-rule.sql", "swipe_alert_rule（刷卡失败灵动岛告警规则）");
        runScript("db/bootstrap-twin-violation-text-template.sql", "twin_violation_text_template（违规文案模板预设）");
        runScript("db/bootstrap-smartsheet.sql", "smartsheet_definition/row/change_log（智能表格三表）");
        runScript("db/bootstrap-smartsheet-pin.sql", "smartsheet_definition is_pinned 列");
        runScript("db/bootstrap-smartsheet-v2-enhance.sql", "smartsheet v2: row_limit/theme_config/is_template/row_index");
        runScript("db/bootstrap-smartsheet-publish.sql", "smartsheet status 列（draft/published）");
        runScript("db/bootstrap-upload-file-record.sql", "upload_file_record（双端图片互通记录表）");
        runScript("db/bootstrap-fix-relative-urls.sql", "修复历史相对路径为完整公网URL（幂等）");
        runScript("db/bootstrap-twin-exp-record.sql", "twin_exp_record（经验值流水记录）");
        runScript("db/bootstrap-report-form.sql", "report_form_definition/submission/submission_log/option_set（填报报表4表）");
    }

    /** @return 是否执行成功 */
    private boolean runScript(String classpath, String label) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.addScript(new ClassPathResource(classpath));
            populator.setSeparator(";");
            populator.setContinueOnError(false);
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("[embedded-ddl] 已执行 classpath:{}（{}）", classpath, label);
            return true;
        } catch (Exception ex) {
            log.warn(
                    "[embedded-ddl] 执行 {} 失败（{}）。请确认 spring.datasource 用户具备 DDL 权限，或改由 DBA 执行 scripts 下等价脚本：{}",
                    classpath,
                    label,
                    ex.getMessage()
            );
            return false;
        }
    }
}
