package com.example.demo.modules.admin.pagehelp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(35)
public class AdminPageHelpSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminPageHelpSchemaMigrator.class);
    private final JdbcTemplate jdbc;

    public AdminPageHelpSchemaMigrator(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS admin_page_help (
                        page_path VARCHAR(512) NOT NULL PRIMARY KEY COMMENT 'Web 路由，如 /admin/supplies',
                        body_html MEDIUMTEXT NULL COMMENT '富文本 HTML',
                        updated_by VARCHAR(64) NULL,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台页面帮助正文'
                    """);
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS admin_page_help_message (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        page_path VARCHAR(512) NOT NULL,
                        user_id VARCHAR(64) NOT NULL,
                        body VARCHAR(2000) NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        KEY idx_admin_page_help_message_path (page_path)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台页面帮助留言'
                    """);
        } catch (Exception e) {
            log.warn("admin_page_help 表结构初始化失败（若未建库可忽略）: {}", e.getMessage());
        }
    }
}
