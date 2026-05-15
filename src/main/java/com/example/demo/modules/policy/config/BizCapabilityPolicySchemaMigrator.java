package com.example.demo.modules.policy.config;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.policy.BizDomains;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 业务能力策略表与审计表；种子数据与切换配置表前线上行为一致。
 */
@Component
@Order(127)
public class BizCapabilityPolicySchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(BizCapabilityPolicySchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public BizCapabilityPolicySchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS biz_capability_policy (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        biz_domain VARCHAR(64) NOT NULL COMMENT '业务域',
                        min_role_submit INT NOT NULL DEFAULT 2 COMMENT 'RoleEnum.level 最低可提交',
                        min_role_process INT NOT NULL DEFAULT 3 COMMENT '最低可处理/看别人非公开单',
                        min_role_view_all_pending INT NOT NULL DEFAULT 4 COMMENT '处理侧全库待办阈值',
                        applicant_list_mode VARCHAR(32) NOT NULL DEFAULT 'VISIBLE_POOL' COMMENT '申请人角标/列表对齐',
                        visibility_public_allowed TINYINT NOT NULL DEFAULT 1 COMMENT '是否允许公开单',
                        extension_json TEXT NULL COMMENT '扩展 JSON',
                        enabled TINYINT NOT NULL DEFAULT 1,
                        sort_order INT NOT NULL DEFAULT 0,
                        policy_version BIGINT NOT NULL DEFAULT 1 COMMENT '变更递增，用于缓存失效',
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_biz_capability_domain (biz_domain)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务能力策略'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS biz_capability_policy_audit (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        biz_domain VARCHAR(64) NOT NULL,
                        operator_id VARCHAR(64) NULL,
                        action VARCHAR(32) NOT NULL,
                        detail_json TEXT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_cap_policy_audit_domain (biz_domain),
                        INDEX idx_cap_policy_audit_time (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务能力策略变更审计'
                    """);
            seedRow(BizDomains.REPAIR, 2, 5, 5, "VISIBLE_POOL", 1, 10);
            seedRow(BizDomains.PURCHASE, 2, 5, 5, "VISIBLE_POOL", 1, 20);
            seedRow(BizDomains.SUPPLIES_CLAIM, 2, 5, 5, "VISIBLE_POOL", 1, 30);
            seedRow(BizDomains.SUPPLIES_ADMIN, 5, 5, 5, "VISIBLE_POOL", 1, 40);
            // 已有库 INSERT IGNORE 不会覆盖旧阈值：按需抬升到 SUPER_ADMIN(5)；仅在确有变更时递增 policy_version。
            jdbcTemplate.update("""
                    UPDATE biz_capability_policy
                    SET min_role_process = 5,
                        min_role_view_all_pending = 5,
                        policy_version = IFNULL(policy_version, 0) + 1
                    WHERE biz_domain IN (?, ?)
                      AND (min_role_process < 5 OR min_role_view_all_pending < 5)
                    """, BizDomains.REPAIR, BizDomains.PURCHASE);
            jdbcTemplate.update("""
                    UPDATE biz_capability_policy
                    SET min_role_process = 5,
                        min_role_view_all_pending = 5,
                        policy_version = IFNULL(policy_version, 0) + 1
                    WHERE biz_domain = ?
                      AND (min_role_process < 5 OR min_role_view_all_pending < 5)
                    """, BizDomains.SUPPLIES_CLAIM);
            jdbcTemplate.update("""
                    UPDATE biz_capability_policy
                    SET min_role_submit = 5,
                        min_role_process = 5,
                        min_role_view_all_pending = 5,
                        policy_version = IFNULL(policy_version, 0) + 1
                    WHERE biz_domain = ?
                      AND (min_role_submit < 5 OR min_role_process < 5 OR min_role_view_all_pending < 5)
                    """, BizDomains.SUPPLIES_ADMIN);
            jdbcTemplate.update("""
                    UPDATE sys_user SET role = ?, update_time = NOW()
                    WHERE id = 'SYS_SUPER_ROOT' AND UPPER(TRIM(role)) <> ?
                    """, RoleEnum.PLATFORM_OWNER.getCode(), RoleEnum.PLATFORM_OWNER.getCode());
            log.info("[biz-capability-policy] 表结构已就绪");
        } catch (Exception e) {
            log.error("[biz-capability-policy] 迁移失败: {}", e.getMessage());
        }
    }

    private void seedRow(String domain, int submit, int process, int viewAll, String listMode, int pub, int sort) {
        jdbcTemplate.update("""
                        INSERT IGNORE INTO biz_capability_policy(
                            biz_domain, min_role_submit, min_role_process, min_role_view_all_pending,
                            applicant_list_mode, visibility_public_allowed, enabled, sort_order, policy_version
                        ) VALUES (?,?,?,?,?,?,1,?,1)
                        """,
                domain, submit, process, viewAll, listMode, pub, sort);
    }
}
