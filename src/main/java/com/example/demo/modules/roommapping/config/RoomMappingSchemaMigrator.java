package com.example.demo.modules.roommapping.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 保证 {@code room_mapping_room} / {@code room_mapping_channel} 表存在（老库升级）。
 */
@Component
@Order(101)
public class RoomMappingSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RoomMappingSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public RoomMappingSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS room_mapping_room (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        rule_no INT NULL COMMENT '业务展示编号（CSV 规则编号）',
                        shelf_id VARCHAR(64) NULL COMMENT '架子id',
                        region_id VARCHAR(64) NULL COMMENT '区域id',
                        region_name VARCHAR(128) NULL COMMENT '区域名称',
                        floor_id VARCHAR(64) NULL COMMENT '楼层id',
                        floor_name VARCHAR(128) NULL COMMENT '楼层名称',
                        room_id VARCHAR(64) NOT NULL COMMENT 'ARO 房间 id',
                        room_name VARCHAR(256) NULL COMMENT '房间名称',
                        rack_name VARCHAR(256) NULL COMMENT '架子名称',
                        tags VARCHAR(512) NULL COMMENT '标签（检索）',
                        source_row_hash CHAR(64) NULL COMMENT '可选：行内容哈希',
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_room_mapping_room_id (room_id),
                        KEY idx_rmr_region (region_name),
                        KEY idx_rmr_floor (floor_name),
                        KEY idx_rmr_rule (rule_no)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间主数据（来自 room_mapping.csv）'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS room_mapping_channel (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        room_id VARCHAR(64) NOT NULL COMMENT '关联 room_mapping_room.room_id',
                        channel_code VARCHAR(128) NOT NULL COMMENT '大华通道 resourceCode',
                        sort_order INT NOT NULL DEFAULT 0,
                        label VARCHAR(128) NULL COMMENT '单条通道备注',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_rmc_room_channel (room_id, channel_code),
                        KEY idx_rmc_room (room_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间与大华通道编码对照'
                    """);
            log.info("[room-mapping-schema] room_mapping_room / room_mapping_channel 已就绪");
            ensureColumn("room_mapping_room", "official_permission_level",
                    "ADD COLUMN official_permission_level INT NULL COMMENT 'ARO官方可进房间接口中的 level，数字越小权限越高'");
            ensureColumn("aro_personnel", "allowed_rooms_display_zh",
                    "ADD COLUMN allowed_rooms_display_zh VARCHAR(4000) NULL COMMENT '官方可进房间映射后的可读列表（含校区）'");
            ensureColumn("aro_personnel", "has_official_room_permission",
                    "ADD COLUMN has_official_room_permission TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=有官方可进房间 0=无，供档案库排序'");
            backfillOfficialRoomPermissionFlag();
        } catch (Exception e) {
            log.error("[room-mapping-schema] 表结构迁移失败: {}", e.getMessage());
        }
    }

    /**
     * 与 {@link com.example.demo.modules.twin.service.ExamRoomPermissionSyncService} 中判定一致：
     * 有非空可读列表 → 有权限；否则若 JSON 明显非空数组/对象 → 仍视为有（避免仅有 JSON、展示尚未刷新的老数据排在无权限之后）。
     */
    private void backfillOfficialRoomPermissionFlag() {
        try {
            jdbcTemplate.update("""
                    UPDATE aro_personnel
                    SET has_official_room_permission = CASE
                        WHEN allowed_rooms_display_zh IS NOT NULL
                             AND CHAR_LENGTH(TRIM(allowed_rooms_display_zh)) > 0 THEN 1
                        WHEN allowed_rooms_json IS NOT NULL
                             AND TRIM(allowed_rooms_json) NOT IN ('', '[]', '{}', 'null') THEN 1
                        ELSE 0
                    END
                    """);
            log.info("[room-mapping-schema] 已回填 aro_personnel.has_official_room_permission");
        } catch (Exception e) {
            log.warn("[room-mapping-schema] 回填 has_official_room_permission 失败: {}", e.getMessage());
        }
    }

    private void ensureColumn(String table, String column, String addClause) {
        try {
            Integer c = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(*) FROM information_schema.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
                            """,
                    Integer.class, table, column);
            if (c != null && c == 0) {
                jdbcTemplate.execute("ALTER TABLE " + table + " " + addClause);
                log.info("[room-mapping-schema] 已补充列 {}.{}", table, column);
            }
        } catch (Exception e) {
            log.warn("[room-mapping-schema] 检查/补充列 {}.{} 失败: {}", table, column, e.getMessage());
        }
    }
}
