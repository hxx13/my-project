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

            // ── 笼位 ID 索引表（每个笼架的 80 个笼格 → ARO animalCageId）──
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS cage_cell_index (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        shelf_index_id BIGINT NOT NULL COMMENT 'FK→cage_shelf_index.id',
                        shelve_id BIGINT NOT NULL COMMENT 'ARO 笼架ID（冗余，方便查询）',
                        position_x INT NOT NULL COMMENT 'X坐标 1-8',
                        position_y INT NOT NULL COMMENT 'Y坐标 1-10',
                        animal_cage_id BIGINT NULL COMMENT 'ARO 笼位ID（核心索引键）',
                        has_cage_box TINYINT(1) DEFAULT 0 COMMENT '是否有笼盒绑定',
                        cage_box_code VARCHAR(100) NULL COMMENT '笼盒编号',
                        last_sync_status VARCHAR(20) DEFAULT 'PENDING' COMMENT 'OK/EMPTY/ERROR',
                        last_sync_error VARCHAR(500) NULL COMMENT '同步失败原因',
                        synced_at DATETIME NULL COMMENT '最后同步时间',
                        UNIQUE KEY uk_cell_position (shelf_index_id, position_x, position_y),
                        KEY idx_cell_shelve (shelve_id),
                        KEY idx_cell_animal_cage (animal_cage_id),
                        CONSTRAINT fk_cell_shelf FOREIGN KEY (shelf_index_id)
                            REFERENCES cage_shelf_index(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位ID索引表（ARO animalCageId映射）'
                    """);
            log.info("[cage-shelf-schema] cage_cell_index 表已就绪");

            // ── 笼位详情表（animalCageId → 业务数据内容）──
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS cage_cell_detail (
                        animal_cage_id BIGINT NOT NULL PRIMARY KEY COMMENT '笼位ID（ARO全局唯一）',

                        cage_type_code INT NULL COMMENT '笼位状态:1等待分配 2已预约无笼盒 3已预约有笼盒 4异常',
                        state INT NULL COMMENT '状态码',
                        state_label VARCHAR(64) NULL COMMENT '状态显示名',
                        rent_type INT NULL COMMENT '租用:1空闲 2正常租用 3接近到期 4很快到期',
                        cage_name VARCHAR(128) NULL COMMENT '笼位名称',

                        has_cage_box TINYINT(1) DEFAULT 0 COMMENT '是否有笼盒',
                        cage_box_code VARCHAR(100) NULL COMMENT '笼盒卡号',
                        cage_box_name VARCHAR(128) NULL COMMENT '笼盒名称',
                        cage_box_qr_code VARCHAR(100) NULL COMMENT '笼盒二维码',

                        pi_name VARCHAR(128) NULL COMMENT '课题组长（cage顶层）',
                        project_pi_name VARCHAR(128) NULL COMMENT '项目组长',
                        project_name VARCHAR(256) NULL COMMENT '项目名称',
                        department_name VARCHAR(256) NULL COMMENT '部门',
                        aup_number VARCHAR(128) NULL COMMENT 'AUP注册号',
                        experimenter_name VARCHAR(128) NULL COMMENT '实验员',
                        lab_assistant_name VARCHAR(128) NULL COMMENT '实验人员',

                        animal_strain_name VARCHAR(128) NULL COMMENT '动物品系',
                        animal_sex VARCHAR(16) NULL COMMENT '性别',
                        animal_week_age VARCHAR(32) NULL COMMENT '周龄',
                        animal_male_number INT NULL COMMENT '雄性数量',
                        animal_female_number INT NULL COMMENT '雌性数量',
                        animal_come_from VARCHAR(256) NULL COMMENT '动物来源',

                        needs_division TINYINT(1) DEFAULT 0 COMMENT '需分笼',
                        needs_special_feeding TINYINT(1) DEFAULT 0 COMMENT '需特殊饲养',
                        needs_transfer TINYINT(1) DEFAULT 0 COMMENT '动物转移',
                        has_health_abnormality TINYINT(1) DEFAULT 0 COMMENT '健康异常',
                        needs_cohabitation TINYINT(1) DEFAULT 0 COMMENT '需合笼（本地，无ARO源）',
                        cohabitation_date VARCHAR(50) NULL COMMENT '合笼日期',
                        special_breeding_name VARCHAR(256) NULL COMMENT '特殊饲养名称',
                        special_breeding_desc TEXT NULL COMMENT '特殊饲养描述',

                        experiment_desc TEXT NULL COMMENT '实验描述（富文本）',
                        images_json JSON NULL COMMENT '图片列表',

                        aro_raw_data JSON NULL COMMENT 'ARO /back + /detail 完整原始响应',
                        extra_data JSON NULL COMMENT '本地业务:认领人/审批/笔记/转移快照',

                        mapping_version VARCHAR(20) NULL COMMENT '映射表版本号',
                        synced_at DATETIME NULL COMMENT '最后同步时间',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                        KEY idx_cage_type (cage_type_code),
                        KEY idx_needs_division (needs_division),
                        KEY idx_project_pi (project_pi_name),
                        KEY idx_aup (aup_number)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位详情表'
                    """);
            log.info("[cage-shelf-schema] cage_cell_detail 表已就绪");

            // ── 补齐 cage_cell_detail 新字段（兼容旧表）──
            try { jdbcTemplate.execute("ALTER TABLE cage_cell_detail ADD COLUMN cage_box_id BIGINT NULL COMMENT 'ARO笼盒ID' AFTER cage_box_code"); }
            catch (Exception ignored) { /* 列已存在 */ }
            try { jdbcTemplate.execute("ALTER TABLE cage_cell_detail ADD COLUMN needs_cohabitation TINYINT(1) DEFAULT 0 COMMENT '需合笼（本地，无ARO源）' AFTER has_health_abnormality"); }
            catch (Exception ignored) { /* 列已存在 */ }
            try { jdbcTemplate.execute("ALTER TABLE cage_cell_detail DROP COLUMN cage_box_qr_code"); }
            catch (Exception ignored) { /* 列已删除或不存在 */ }
            log.info("[cage-shelf-schema] cage_cell_detail 字段清理完成");

            // ── 笼位占用事件日志表（占用周期 + 转移/复制/退出 审计回溯）──
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS cage_transfer_log (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        event_type VARCHAR(20) NOT NULL DEFAULT 'transfer' COMMENT 'start/transfer/copy/exit',
                        occupant_id BIGINT NULL COMMENT '占用者 统一人员 personnel.id',
                        occupant_name VARCHAR(128) NULL COMMENT '占用者姓名快照',
                        from_animal_cage_id BIGINT NULL COMMENT '源笼位ID（start为空）',
                        to_animal_cage_id BIGINT NULL COMMENT '目标笼位ID（exit为空）',
                        data_snapshot JSON NULL COMMENT '覆盖前/退出前的占用字段快照',
                        operator_id BIGINT NULL COMMENT '操作人 统一人员 personnel.id',
                        operator_name VARCHAR(128) NULL,
                        reason VARCHAR(256) NULL COMMENT '原因',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        KEY idx_from (from_animal_cage_id),
                        KEY idx_to (to_animal_cage_id),
                        KEY idx_occupant (occupant_id),
                        KEY idx_created (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位占用事件日志'
                    """);
            // ── 兼容旧表：补齐占用维度列、放宽 from/to 为可空 ──
            try { jdbcTemplate.execute("ALTER TABLE cage_transfer_log ADD COLUMN event_type VARCHAR(20) NOT NULL DEFAULT 'transfer' COMMENT 'start/transfer/copy/exit' AFTER id"); }
            catch (Exception ignored) { /* 列已存在 */ }
            try { jdbcTemplate.execute("ALTER TABLE cage_transfer_log ADD COLUMN occupant_id BIGINT NULL COMMENT '占用者 统一人员 personnel.id' AFTER event_type"); }
            catch (Exception ignored) { /* 列已存在 */ }
            try { jdbcTemplate.execute("ALTER TABLE cage_transfer_log ADD COLUMN occupant_name VARCHAR(128) NULL COMMENT '占用者姓名快照' AFTER occupant_id"); }
            catch (Exception ignored) { /* 列已存在 */ }
            try { jdbcTemplate.execute("ALTER TABLE cage_transfer_log MODIFY COLUMN from_animal_cage_id BIGINT NULL COMMENT '源笼位ID（start为空）'"); }
            catch (Exception ignored) { /* 已可空 */ }
            try { jdbcTemplate.execute("ALTER TABLE cage_transfer_log MODIFY COLUMN to_animal_cage_id BIGINT NULL COMMENT '目标笼位ID（exit为空）'"); }
            catch (Exception ignored) { /* 已可空 */ }
            try { jdbcTemplate.execute("ALTER TABLE cage_transfer_log MODIFY COLUMN operator_id BIGINT NULL COMMENT '操作人 统一人员 personnel.id'"); }
            catch (Exception ignored) { /* 已改类型 */ }
            try { jdbcTemplate.execute("CREATE INDEX idx_occupant ON cage_transfer_log (occupant_id)"); }
            catch (Exception ignored) { /* 索引已存在 */ }
            log.info("[cage-shelf-schema] cage_transfer_log 表已就绪");

            // ── 投递箱表（Outbox Pattern：本地变更→异步可靠投递ARO）──
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS outbox_record (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        aggregate_type VARCHAR(50) NOT NULL COMMENT '聚合类型: cage_cell/cage_claim',
                        aggregate_id VARCHAR(100) NOT NULL COMMENT '业务主键',
                        event_type VARCHAR(50) NOT NULL COMMENT '事件: cell_updated/claim_created',
                        payload JSON NOT NULL COMMENT '变更快照(本地字段名)',
                        aro_endpoint VARCHAR(100) NOT NULL COMMENT '目标ARO端点',
                        status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/processing/delivered/failed/dead',
                        retry_count INT DEFAULT 0,
                        next_retry_at DATETIME NULL,
                        last_error TEXT NULL,
                        aro_response JSON NULL COMMENT 'ARO返回值(成功时记录)',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        delivered_at DATETIME NULL,
                        KEY idx_pending (status, next_retry_at),
                        KEY idx_aggregate (aggregate_type, aggregate_id),
                        KEY idx_created (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Outbox投递箱（可靠推送ARO）'
                    """);
            log.info("[cage-shelf-schema] outbox_record 表已就绪");

            // ── 补齐 outbox_record 新字段（兼容旧表）──
            try { jdbcTemplate.execute("ALTER TABLE outbox_record ADD COLUMN summary VARCHAR(500) NULL COMMENT '操作摘要' AFTER aro_endpoint"); }
            catch (Exception ignored) { /* 列已存在 */ }
            try { jdbcTemplate.execute("ALTER TABLE outbox_record ADD COLUMN aro_url VARCHAR(300) NULL COMMENT '实际调用的ARO接口URL' AFTER summary"); }
            catch (Exception ignored) { /* 列已存在 */ }
            log.info("[cage-shelf-schema] outbox_record 新字段补齐完成");

            // ── 图片/笔记历史归档表 ──
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS cage_cell_history (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        animal_cage_id BIGINT NOT NULL COMMENT '笼位ID',
                        status_field VARCHAR(64) NOT NULL COMMENT '状态字段名: needs_division/needs_special_feeding/has_health_abnormality',
                        images_json JSON NULL COMMENT '归档时的照片列表',
                        experiment_desc TEXT NULL COMMENT '归档时的实验记录',
                        toggled_by VARCHAR(128) NULL COMMENT '操作人',
                        action VARCHAR(16) NOT NULL COMMENT 'marked/unmarked',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        KEY idx_animal_cage (animal_cage_id),
                        KEY idx_created (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位图片笔记历史归档'
                    """);
            log.info("[cage-shelf-schema] cage_cell_history 表已就绪");

            // ── 笼位认领表 ──
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS cage_claims (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        animal_cage_id BIGINT NOT NULL COMMENT '笼位ID',
                        claim_status VARCHAR(20) NOT NULL DEFAULT 'pending_approval'
                            COMMENT 'pool/pending_approval/locked/confirmed/pending_release_approval/rejected/cancelled/released',
                        claimant_id VARCHAR(64) NOT NULL COMMENT '认领人 sys_user.id',
                        claimant_name VARCHAR(128) NULL COMMENT '认领人姓名快照',
                        claimant_dept VARCHAR(256) NULL COMMENT '认领人部门快照',
                        aup_id BIGINT NULL COMMENT '关联AUP',
                        assigner_id VARCHAR(64) NULL COMMENT '手动分配者 sys_user.id',
                        assigner_name VARCHAR(128) NULL COMMENT '分配者姓名快照',
                        confirm_required TINYINT(1) DEFAULT 1 COMMENT '是否需要到场确认',
                        retry_count INT DEFAULT 0 COMMENT '驳回次数',
                        rejected_at DATETIME NULL COMMENT '最近驳回时间',
                        confirmed_at DATETIME NULL,
                        released_at DATETIME NULL,
                        note VARCHAR(500) NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_claimant (claimant_id),
                        INDEX idx_status (claim_status),
                        INDEX idx_cell_active_claim (animal_cage_id, claim_status),
                        INDEX idx_created (created_at),
                        CONSTRAINT fk_claim_cell FOREIGN KEY (animal_cage_id)
                            REFERENCES cage_cell_detail(animal_cage_id) ON DELETE RESTRICT
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位申请记录'
                    """);
            log.info("[cage-shelf-schema] cage_claims 表已就绪");

            // ── 审批记录表 ──
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS approval_records (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        target_type VARCHAR(30) NOT NULL COMMENT 'cage_claim/cage_release/cage_transfer',
                        target_id BIGINT NOT NULL COMMENT 'cage_claims.id',
                        approver_id VARCHAR(64) NOT NULL COMMENT '审批人 sys_user.id（0=SYSTEM）',
                        approver_name VARCHAR(128) NULL,
                        approver_role VARCHAR(20) NULL COMMENT '审批时角色快照',
                        decision VARCHAR(20) NOT NULL COMMENT 'approved/rejected',
                        reject_reason VARCHAR(500) NULL COMMENT '驳回时必填',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_target (target_type, target_id),
                        INDEX idx_approver (approver_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批记录'
                    """);
            log.info("[cage-shelf-schema] approval_records 表已就绪");
        } catch (Exception e) {
            log.error("[cage-shelf-schema] 表结构迁移失败: {}", e.getMessage(), e);
        }
    }
}
