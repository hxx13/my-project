-- =============================================================
-- AUP 配置面变更记录（码表/字段/文件夹/模板的增删改与状态机流转留痕）
-- 归档迁移，与 src/main/resources/db/bootstrap-aup-config-change-log.sql 同源。
-- 只追加，不更新不删除。
-- =============================================================

CREATE TABLE IF NOT EXISTS aup_config_change_log (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity      VARCHAR(20)  NOT NULL COMMENT 'codelist/codelist_item/field/folder/template',
    entity_id   BIGINT       NULL COMMENT '实体主键',
    entity_code VARCHAR(64)  NULL COMMENT '冗余编码，便于按编码检索',
    entity_name VARCHAR(255) NULL COMMENT '冗余名称，列表直接展示',
    change_type VARCHAR(24)  NOT NULL COMMENT 'CREATE/UPDATE/DELETE/MOVE/SUBMIT_REVIEW/APPROVE/REJECT/UNFREEZE/NEW_VERSION/ARCHIVE',
    before_json MEDIUMTEXT   NULL COMMENT '变更前 JSON',
    after_json  MEDIUMTEXT   NULL COMMENT '变更后 JSON',
    operator_id BIGINT       NULL COMMENT '操作人 id',
    operator    VARCHAR(64)  NULL COMMENT '操作人姓名/账号',
    comment     VARCHAR(512) NULL COMMENT '审核意见',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_aup_cfglog_entity (entity, entity_id, created_at),
    KEY idx_aup_cfglog_created (created_at),
    KEY idx_aup_cfglog_operator (operator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP配置面变更记录（只追加）';
