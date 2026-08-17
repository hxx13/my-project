package com.example.demo.modules.identity.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 统一 {@code person_identity} / {@code person_identity_tag} / {@code personnel} 三张表的
 * collation 为 {@code utf8mb4_unicode_ci}（与 schema.sql 老表一致），根治
 * 「Illegal mix of collations (utf8mb4_0900_ai_ci) and (utf8mb4_unicode_ci)」冲突。
 *
 * <p>幂等：{@code CONVERT TO CHARACTER SET ... COLLATE ...} 重复执行无副作用；表不存在时
 * {@code ALTER TABLE} 抛异常，逐条 try-catch 捕获后 log.warn 跳过，不阻塞启动。
 */
@Component
@Order(133)
public class PersonIdentityCollationMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PersonIdentityCollationMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public PersonIdentityCollationMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        convert("person_identity_tag");
        convert("person_identity");
        convert("personnel");
        // personnel join aro_personnel（aro_user_id = user_id）需要两侧 collation 一致，
        // 否则报 Illegal mix of collations；字典表一并统一，防止后续 join/比较再冲突。
        convert("aro_personnel");
        convert("institution");
        convert("department");
        convert("project_group");
    }

    private void convert(String table) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE " + table + " CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            log.info("[person-identity-collation] 表 {} 已统一为 utf8mb4_unicode_ci", table);
        } catch (Exception e) {
            log.warn("[person-identity-collation] 表 {} 统一 collation 跳过: {}", table, e.getMessage());
        }
    }
}
