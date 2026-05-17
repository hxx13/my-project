package com.example.demo.modules.twin.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 学生违规模块下的「未绑卡扫码提示」全局配置（module student_violation）。
 */
@Component
@Order(122)
public class StudentViolationNoticeConfigSeed implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(StudentViolationNoticeConfigSeed.class);
    private static final String MODULE = "student_violation";

    private final JdbcTemplate jdbcTemplate;

    public StudentViolationNoticeConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureDef(
                    "student.violation.unbound.notice.enabled",
                    "启用未绑卡扫码提示",
                    "关闭后，扫描未绑定校园卡的人员不再弹出警示框。",
                    "BOOLEAN",
                    null,
                    "true",
                    0
            );
            ensureDef(
                    "student.violation.unbound.notice.show_every_scan",
                    "未绑卡提示·每次扫码展示",
                    "开启后每次扫描未绑卡人员都会自动展开居中提示；关闭则本次会话可点「已知悉」后仅保留灵动岛。",
                    "BOOLEAN",
                    null,
                    "true",
                    0
            );
            ensureDef(
                    "student.violation.unbound.notice.forbid_enter",
                    "未绑卡禁止扫码进入",
                    "开启后，未在 twin_card_mapping 绑定物理卡的人员无法通过扫码执行「进入」；「离开」不受影响。",
                    "BOOLEAN",
                    null,
                    "false",
                    0
            );
            ensureDef(
                    "student.violation.unbound.notice.apply_role_codes",
                    "未绑卡提示生效角色",
                    "JSON 数组，如 [\"STUDENT\"]；仅当当前网页登录扫码操作员的 sys_user 角色在列表内时生效未绑卡提示与禁入。",
                    "STRING",
                    null,
                    "[\"STUDENT\"]",
                    0
            );
            ensureDef(
                    "student.violation.unbound.notice.text",
                    "未绑卡提示文案",
                    "扫描到未在 twin_card_mapping 绑定物理卡的人员时，居中警示框显示的文字，支持多行。",
                    "STRING",
                    null,
                    "您尚未绑定校园卡，请先完成绑卡后再使用扫码进出功能。",
                    0
            );
            ensureDef(
                    "student.violation.unbound.notice.image_urls",
                    "未绑卡提示附图",
                    "JSON 数组字符串，如 [\"https://...\"]，可为空。",
                    "STRING",
                    null,
                    "[]",
                    0
            );
            ensureDef(
                    "student.scan.announcement.enabled",
                    "启用扫码弹窗公告",
                    "关闭后扫码不再展示公告翻页层（公告数据仍可在管理端维护）。",
                    "BOOLEAN",
                    null,
                    "true",
                    0
            );
            ensureDef(
                    "student.scan.announcement.show_every_scan",
                    "扫码公告·每次扫码展示",
                    "开启后每次扫码自动展开公告；关闭则可「已知悉」后本会话仅保留灵动岛。",
                    "BOOLEAN",
                    null,
                    "true",
                    0
            );
            ensureDef(
                    "student.scan.announcement.apply_role_codes",
                    "扫码公告生效角色",
                    "JSON 数组，如 [\"STUDENT\"]；仅当当前网页登录扫码操作员的 sys_user 角色在列表内时展示公告。",
                    "STRING",
                    null,
                    "[\"STUDENT\"]",
                    0
            );
        } catch (Exception e) {
            log.warn("[student_violation] 未绑卡提示配置定义初始化跳过: {}", e.getMessage());
        }
    }

    private void ensureDef(
            String configKey,
            String labelZh,
            String description,
            String valueType,
            String optionsJson,
            String defaultValue,
            int isPublic
    ) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class,
                MODULE,
                configKey
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NOW())
                        """,
                MODULE,
                configKey,
                labelZh,
                description,
                valueType,
                optionsJson,
                defaultValue,
                isPublic
        );
        log.info("[student_violation] 已插入配置定义: {}.{}", MODULE, configKey);
    }
}
