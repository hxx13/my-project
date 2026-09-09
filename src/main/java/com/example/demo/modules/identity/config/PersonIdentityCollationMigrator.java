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

    /** 需兜底的核心表：动态扫描只命中「有 0900 列」的表；若某表所有列均已显式 unicode_ci 而表默认仍 0900，新列会继承 0900，须在此修表默认。 */
    private static final String[] CORE_TABLES = {
            "person_identity_tag", "person_identity", "personnel", "aro_personnel",
            "institution", "department", "project_group"};

    @Override
    public void run(ApplicationArguments args) {
        Set<String> tables = new LinkedHashSet<>();
        // 含 0900 列的表（覆盖任意列级残留；CONVERT 后消除，稳态为空集 → 静默）
        try {
            tables.addAll(jdbcTemplate.queryForList(
                    "SELECT DISTINCT TABLE_NAME FROM information_schema.COLUMNS " +
                            "WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME = 'utf8mb4_0900_ai_ci'", String.class));
        } catch (Exception e) {
            log.warn("[person-identity-collation] 动态查询 0900 表跳过: {}", e.getMessage());
        }
        // 表默认仍非 unicode_ci 的核心表
        try {
            tables.addAll(jdbcTemplate.queryForList(
                    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() " +
                            "AND TABLE_COLLATION <> 'utf8mb4_unicode_ci' AND TABLE_NAME IN ('person_identity_tag','person_identity','personnel','aro_personnel','institution','department','project_group')",
                    String.class));
        } catch (Exception e) {
            log.warn("[person-identity-collation] 核心表 collation 查询跳过: {}", e.getMessage());
        }
        if (tables.isEmpty()) return; // 已全部统一，无需处理
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
