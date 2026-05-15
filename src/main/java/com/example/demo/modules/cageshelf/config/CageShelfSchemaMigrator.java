package com.example.demo.modules.cageshelf.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(130)
public class CageShelfSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(CageShelfSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public CageShelfSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS cage_shelf_index (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        campus_id INT NOT NULL COMMENT '校区ID: 1浦西,2浦东',
                        campus_name VARCHAR(32) NOT NULL COMMENT '校区名称',
                        area_id BIGINT NOT NULL COMMENT '区域ID',
                        area_name VARCHAR(128) NOT NULL COMMENT '区域名称',
                        floor_id BIGINT NOT NULL COMMENT '楼层ID',
                        floor_name VARCHAR(128) NOT NULL COMMENT '楼层名称',
                        room_id BIGINT NOT NULL COMMENT '房间ID',
                        room_name VARCHAR(128) NOT NULL COMMENT '房间名称',
                        shelve_id BIGINT NOT NULL COMMENT '笼架ID（外部接口索引）',
                        shelve_name VARCHAR(128) NULL COMMENT '笼架名称',
                        orders INT NULL COMMENT '排序值',
                        deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_cage_shelf_shelve_id (shelve_id),
                        KEY idx_cage_shelf_filter_1 (campus_id, area_name, floor_name, room_name),
                        KEY idx_cage_shelf_filter_2 (campus_id, area_id, floor_id, room_id),
                        KEY idx_cage_shelf_room (room_id),
                        KEY idx_cage_shelf_deleted (deleted)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼架层级索引表'
                    """);
            log.info("[cage-shelf-schema] cage_shelf_index 表已就绪");
        } catch (Exception e) {
            log.error("[cage-shelf-schema] 表结构迁移失败: {}", e.getMessage(), e);
        }
    }
}
