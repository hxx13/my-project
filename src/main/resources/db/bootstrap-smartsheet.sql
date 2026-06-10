-- V__smartsheet.sql — SmartSheet 智能表格模块 DDL
-- 三表设计：定义表 + 数据行表 + 变更日志表
-- JSON 驱动列定义，加列不改表结构

CREATE TABLE IF NOT EXISTS smartsheet_definition (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(200)  NOT NULL COMMENT '表格名称',
    description     VARCHAR(500)  DEFAULT '' COMMENT '描述',
    layout_mode     VARCHAR(20)   NOT NULL DEFAULT 'table' COMMENT '布局模式: matrix/table/checklist/calendar',
    columns_config  JSON          NOT NULL COMMENT '列定义',
    row_entity_source JSON        DEFAULT NULL COMMENT '行实体来源配置',
    template_id     BIGINT        DEFAULT NULL COMMENT '模板来源',
    created_by      BIGINT        COMMENT '创建人',
    updated_by      BIGINT        COMMENT '更新人',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_template (template_id),
    INDEX idx_created_by (created_by)
) COMMENT '智能表格定义';

CREATE TABLE IF NOT EXISTS smartsheet_row (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    sheet_id        BIGINT        NOT NULL COMMENT 'FK -> smartsheet_definition.id',
    row_index       INT           NOT NULL DEFAULT 0 COMMENT '行序号',
    row_entity_id   VARCHAR(100)  DEFAULT NULL COMMENT '行实体引用ID',
    row_label       VARCHAR(200)  DEFAULT '' COMMENT '行头显示名称',
    cell_data       JSON          NOT NULL COMMENT '单元格数据',
    version         INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sheet (sheet_id),
    UNIQUE KEY uk_sheet_entity (sheet_id, row_entity_id)
) COMMENT '智能表格数据行';

CREATE TABLE IF NOT EXISTS smartsheet_change_log (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    sheet_id        BIGINT        NOT NULL,
    row_id          BIGINT        NOT NULL,
    column_key      VARCHAR(100)  NOT NULL COMMENT '列 key',
    old_value       TEXT          COMMENT '旧值',
    new_value       TEXT          COMMENT '新值',
    changed_by      BIGINT        COMMENT '修改人',
    changed_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_row (row_id),
    INDEX idx_sheet_time (sheet_id, changed_at)
) COMMENT '智能表格变更日志';
