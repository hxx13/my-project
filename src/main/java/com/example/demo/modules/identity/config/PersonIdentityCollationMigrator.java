package com.example.demo.modules.identity.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 统一项目库所有表的 collation 为 {@code utf8mb4_unicode_ci}（与 schema.sql 老表一致），根治
 * 「Illegal mix of collations (utf8mb4_0900_ai_ci) and (utf8mb4_unicode_ci)」冲突。
 *
 * <p>外部建表（aro_personnel / twin_card_mapping / aro_access_log / llm_conversation_session 等）
 * 默认 utf8mb4_0900_ai_ci，与项目内 unicode_ci 的表 join 时冲突。本迁移器启动时从
 * {@code information_schema.COLUMNS} 找出当前库所有含 0900 列的表并统一为 unicode_ci，一次性
 * 根治，无需逐表枚举。
 *
 * <p>幂等：{@code CONVERT TO CHARACTER SET ... COLLATE ...} 重复执行无副作用；表不存在或
 * 表已被引用时 {@code ALTER TABLE} 抛异常，逐条 try-catch 捕获后 log.warn 跳过，不阻塞启动。
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
        // 显式列（防御，确保核心表即使表级 collation 已改、个别列仍残留 0900 时也被统一）
        convert("person_identity_tag");
        convert("person_identity");
        convert("personnel");
        convert("aro_personnel");
        convert("institution");
        convert("department");
        convert("project_group");
        // 动态统一当前库所有含 0900 列的表（外部建表默认 0900，如 twin_card_mapping / aro_access_log 等）
        convertAllUtf8mb40900();
    }

    /** 从 information_schema.COLUMNS 找出当前库所有含 utf8mb4_0900_ai_ci 列的表，统一为 unicode_ci。 */
    private void convertAllUtf8mb40900() {
        try {
            List<String> tables = jdbcTemplate.queryForList(
                    "SELECT DISTINCT TABLE_NAME FROM information_schema.COLUMNS " +
                            "WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME = 'utf8mb4_0900_ai_ci'", String.class);
            for (String table : tables) {
                convert(table);
            }
            log.info("[person-identity-collation] 动态统一 0900 表 {} 张", tables.size());
        } catch (Exception e) {
            log.warn("[person-identity-collation] 批量统一 0900 表跳过: {}", e.getMessage());
        }
    }

    private void convert(String table) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE `" + table + "` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            log.info("[person-identity-collation] 表 {} 已统一为 utf8mb4_unicode_ci", table);
        } catch (Exception e) {
            log.warn("[person-identity-collation] 表 {} 统一 collation 跳过: {}", table, e.getMessage());
        }
    }
}
