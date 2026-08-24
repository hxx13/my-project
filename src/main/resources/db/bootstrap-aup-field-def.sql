-- =============================================================
-- AUP 字段字典层字段定义——启动自动执行
-- 同源：common/schema/V20260824012__aup_field_def.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS aup_field_def (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    field_code  VARCHAR(64)  NOT NULL COMMENT '稳定编码，全局唯一',
    label       VARCHAR(128) NOT NULL COMMENT '题面',
    type        VARCHAR(32)  NOT NULL COMMENT '复用 typeRegistry 22 种题型',
    dict_key    VARCHAR(64)  NULL COMMENT '码表引用（与 options 二选一）',
    options     TEXT         NULL COMMENT '内联选项 JSON',
    required    TINYINT      NOT NULL DEFAULT 0 COMMENT '必填 0/1',
    description VARCHAR(512) NULL COMMENT '字段说明',
    config      TEXT         NULL COMMENT '与 form_field.config 同构',
    show_when   TEXT         NULL COMMENT '条件显示 JSON',
    folder_id   BIGINT       NULL COMMENT 'FK→aup_folder(owner_type=FIELD)；NULL=未分类',
    status      VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PENDING_REVIEW/PUBLISHED/RETIRED',
    frozen_at   DATETIME     NULL COMMENT '冻结时间',
    frozen_by   VARCHAR(64)  NULL COMMENT '冻结人',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '文件夹内排序',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_aup_field_code (field_code),
    KEY idx_aup_field_folder (folder_id, sort_order),
    KEY idx_aup_field_status (status),
    KEY idx_aup_field_dict (dict_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP字段字典层字段定义（原子域引用的最小单元）';
