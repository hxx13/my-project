package com.example.demo.modules.team.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(140)
public class TeamSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(TeamSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public TeamSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS team (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(128) NOT NULL COMMENT '团队名称',
                        description VARCHAR(512) NULL COMMENT '团队简介',
                        avatar VARCHAR(512) NULL COMMENT '头像',
                        visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' COMMENT '可见性: PUBLIC/PRIVATE',
                        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态: ACTIVE/DISSOLVED',
                        owner_personnel_id BIGINT NOT NULL COMMENT '负责人 personnel.id',
                        max_members INT NULL COMMENT '人数上限',
                        created_by VARCHAR(64) NULL COMMENT '创建人账号id',
                        deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='团队表'
                    """);
            log.info("[team-schema] team 表已就绪");

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS team_member (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        team_id BIGINT NOT NULL,
                        personnel_id BIGINT NOT NULL,
                        role_code VARCHAR(20) NOT NULL COMMENT 'OWNER/MANAGER/MEMBER',
                        joined_at DATETIME NULL,
                        deleted TINYINT NOT NULL DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_team_person (team_id, personnel_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='团队成员表'
                    """);
            log.info("[team-schema] team_member 表已就绪");

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS team_join_request (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        team_id BIGINT NOT NULL,
                        personnel_id BIGINT NOT NULL,
                        type VARCHAR(20) NOT NULL COMMENT 'INVITE/APPLY',
                        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED/CANCELLED',
                        message VARCHAR(512) NULL,
                        reviewer_personnel_id BIGINT NULL,
                        reviewed_at DATETIME NULL,
                        deleted TINYINT NOT NULL DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_team_status (team_id, status)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='团队加入申请表'
                    """);
            log.info("[team-schema] team_join_request 表已就绪");

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS team_audit_log (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        team_id BIGINT NULL,
                        actor_personnel_id BIGINT NULL,
                        action VARCHAR(32) NULL,
                        target_type VARCHAR(32) NULL,
                        target_id BIGINT NULL,
                        detail VARCHAR(512) NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='团队审计日志'
                    """);
            log.info("[team-schema] team_audit_log 表已就绪");
        } catch (Exception e) {
            log.error("[team-schema] 表结构迁移失败: {}", e.getMessage(), e);
        }
    }
}
