package com.example.demo.modules.identity.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 后备 collation 统一器：把当前库所有含 {@code utf8mb4_0900_ai_ci} 列的表统一为
 * {@code utf8mb4_unicode_ci}，根治「Illegal mix of collations」冲突。
 *
 * <p>bootstrap 链最前（{@code EmbeddedTwinSystemCoreDdlBootstrap}）已统一过一次；本类在
 * {@code @Order(133)} 兜底，处理 bootstrap 之后新建的表。二者均幂等。
 *
 * <p>CONVERT 会改变外键列 collation，单表 CONVERT 时与被引用表 collation 不一致会报
 * 3780，故同一连接内先 {@code SET FOREIGN_KEY_CHECKS = 0}，统一完再恢复。
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
        Set<String> tables = new LinkedHashSet<>();
        // 显式列（防御，确保核心表即使表级 collation 已改、个别列仍残留 0900 时也被统一）
        tables.add("person_identity_tag");
        tables.add("person_identity");
        tables.add("personnel");
        tables.add("aro_personnel");
        tables.add("institution");
        tables.add("department");
        tables.add("project_group");
        // 动态查询所有含 0900 列的表
        try {
            tables.addAll(jdbcTemplate.queryForList(
                    "SELECT DISTINCT TABLE_NAME FROM information_schema.COLUMNS " +
                            "WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME = 'utf8mb4_0900_ai_ci'", String.class));
        } catch (Exception e) {
            log.warn("[person-identity-collation] 动态查询 0900 表跳过: {}", e.getMessage());
        }
        if (tables.isEmpty()) return;
        // 同一连接内禁用外键检查，统一 CONVERT，避免 3780
        try {
            jdbcTemplate.execute((ConnectionCallback<Void>) con -> {
                try (java.sql.Statement st = con.createStatement()) {
                    st.execute("SET FOREIGN_KEY_CHECKS = 0");
                    for (String table : tables) {
                        try {
                            st.execute("ALTER TABLE `" + table + "` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                            log.info("[person-identity-collation] 表 {} 已统一为 utf8mb4_unicode_ci", table);
                        } catch (Exception e) {
                            log.warn("[person-identity-collation] 表 {} 统一跳过: {}", table, e.getMessage());
                        }
                    }
                    st.execute("SET FOREIGN_KEY_CHECKS = 1");
                }
                return null;
            });
        } catch (Exception e) {
            log.warn("[person-identity-collation] 批量统一跳过: {}", e.getMessage());
        }
    }
}
