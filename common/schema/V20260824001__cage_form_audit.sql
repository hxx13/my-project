-- 笼位表单审计日志（与 NHP crf_*_audit_log 隔离）
CREATE TABLE IF NOT EXISTS cage_form_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(20) NOT NULL COMMENT 'data|dict',
    change_type VARCHAR(32) NOT NULL COMMENT 'BIND/UNBIND/TRANSFER/UPDATE/CREATE/DELETE/PUBLISH',
    entity VARCHAR(32) NULL COMMENT 'field/codelist/claim/cage_box/form',
    entity_id BIGINT NULL,
    entity_code VARCHAR(128) NULL,
    entity_name VARCHAR(256) NULL,
    target_type VARCHAR(32) NULL COMMENT 'animal_cage/claim',
    target_id BIGINT NULL,
    target_label VARCHAR(256) NULL,
    field_code VARCHAR(128) NULL,
    field_name VARCHAR(256) NULL,
    before_value TEXT NULL,
    after_value TEXT NULL,
    before_json TEXT NULL,
    after_json TEXT NULL,
    operator_id VARCHAR(64) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cage_form_audit_category (category, created_at),
    KEY idx_cage_form_audit_entity (entity, entity_id),
    KEY idx_cage_form_audit_target (target_type, target_id),
    KEY idx_cage_form_audit_operator (operator_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位表单审计日志';

-- 笼位表单发布版本（每次 publish 递增）
CREATE TABLE IF NOT EXISTS cage_form_template_version (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    form_key VARCHAR(64) NOT NULL COMMENT '表单键，如 cage_detail',
    version_no INT NOT NULL COMMENT '递增版本号',
    field_count INT NOT NULL DEFAULT 0 COMMENT '已发布字段数',
    published_by VARCHAR(64) NULL,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_form_version (form_key, version_no),
    KEY idx_cage_form_version_latest (form_key, version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位表单发布版本';
