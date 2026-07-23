package com.example.demo.common.component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(6)
public class SpecialChannelTableBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SpecialChannelTableBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public SpecialChannelTableBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        addColumnIfNotExists(
                "aro_personnel",
                "personal_pin",
                "VARCHAR(255) NULL COMMENT 'bcrypt哈希，NULL=未设置'"
        );
        addColumnIfNotExists(
                "aro_personnel",
                "pin_updated_at",
                "DATETIME NULL COMMENT 'PIN最后修改时间'"
        );
    }

    private void addColumnIfNotExists(String table, String column, String definition) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition
            );
            log.info("[special-channel] ensured column {}.{}", table, column);
        } catch (Exception ex) {
            // Column already exists or other DDL error — log and continue
            log.debug("[special-channel] skip alter {}.{}: {}", table, column, ex.getMessage());
        }
    }
}
