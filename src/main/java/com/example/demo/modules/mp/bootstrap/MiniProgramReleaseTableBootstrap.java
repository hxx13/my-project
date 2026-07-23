package com.example.demo.modules.mp.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 启动时确保 mini_program_release 存在（与 schema.sql / scripts/mini_program_release.ddl.sql 一致），
 * 避免缺表导致首屏/版本接口降级或反复告警。
 */
@Component
@Order(5)
public class MiniProgramReleaseTableBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(MiniProgramReleaseTableBootstrap.class);

    private static final String DDL = """
            CREATE TABLE IF NOT EXISTS mini_program_release (
                id VARCHAR(40) PRIMARY KEY,
                version_code VARCHAR(64) NOT NULL COMMENT '版本号展示',
                title VARCHAR(200) NOT NULL,
                summary VARCHAR(600) NULL COMMENT '列表摘要',
                body_html MEDIUMTEXT NULL COMMENT '富文本 HTML，小程序 rich-text',
                published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                show_on_launch TINYINT NOT NULL DEFAULT 0 COMMENT '首屏公告（全局至多一条为1）',
                created_by VARCHAR(64) NULL,
                updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_mp_release_published (published_at DESC),
                KEY idx_mp_release_splash (show_on_launch)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小程序版本更新与首屏公告'
            """;

    private static final String DDL_ANNOUNCEMENT = """
            CREATE TABLE IF NOT EXISTS mini_program_announcement (
                id VARCHAR(40) PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                summary VARCHAR(600) NULL COMMENT '列表摘要',
                body_html MEDIUMTEXT NULL COMMENT '富文本 HTML',
                published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                enabled TINYINT NOT NULL DEFAULT 1 COMMENT '1展示0下线',
                sort_order INT NOT NULL DEFAULT 0,
                created_by VARCHAR(64) NULL,
                updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_mp_ann_published (published_at DESC),
                KEY idx_mp_ann_enabled (enabled, published_at DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小程序/Web 首页公告栏'
            """;

    private final JdbcTemplate jdbcTemplate;

    public MiniProgramReleaseTableBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute(DDL);
            log.info("[mp-release] ensured table mini_program_release");
        } catch (Exception ex) {
            log.warn("[mp-release] auto DDL failed; run scripts/mini_program_release.ddl.sql on twin_system: {}", ex.getMessage());
        }
        try {
            jdbcTemplate.execute(DDL_ANNOUNCEMENT);
            log.info("[mp-announcement] ensured table mini_program_announcement");
        } catch (Exception ex) {
            log.warn("[mp-announcement] auto DDL failed; run scripts/mp_announcement_and_auth_profile.ddl.sql: {}", ex.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE sys_user ADD COLUMN auth_profile VARCHAR(32) NULL COMMENT '认证来源:WECHAT_ARO|WEB_PASSWORD'");
            log.info("[mp-auth-profile] added column sys_user.auth_profile");
        } catch (Exception ex) {
            // 列已存在等：忽略
            log.debug("[mp-auth-profile] skip alter sys_user.auth_profile: {}", ex.getMessage());
        }
    }
}
