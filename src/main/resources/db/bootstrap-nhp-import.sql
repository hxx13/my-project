-- =============================================================
-- NHP 异种移植 CRF/EDC 数据导入层建表（与 common/schema/V20260820003__nhp_import_table.sql 同源）
-- 共 1 张表：导入批次。幂等：CREATE TABLE IF NOT EXISTS。
-- 说明：双轨采集（纸版/Excel 回溯录入）+ 仪器 CSV 批量导入，采集时间≠录入时间（见 16）。
-- =============================================================

CREATE TABLE IF NOT EXISTS crf_import_batch (
    id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    form_id      BIGINT      NOT NULL COMMENT 'FK→crf_form.id（导入到哪个表单/数据域）',
    file_format  VARCHAR(20) NOT NULL COMMENT 'CSV/EXCEL/PAPER（batch 层用 file_format，避免与 value 层 entry_mode 同名异义）',
    file_id      BIGINT      NULL COMMENT 'FK→upload_file_record.id（导入源文件）',
    operator_id  VARCHAR(64) NULL COMMENT '操作人 personnel.id',
    mapping_json JSON        NULL COMMENT '分层字段映射：sheet→form、列组→字段/重复组、键列定位',
    status       VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/VALIDATED/IMPORTED/FAILED',
    total_rows   INT         NOT NULL DEFAULT 0 COMMENT '总行数',
    success_rows INT         NOT NULL DEFAULT 0 COMMENT '成功行数',
    failed_rows  INT         NOT NULL DEFAULT 0 COMMENT '失败行数',
    error_json   JSON        NULL COMMENT '失败行 + 原因',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_import_form (form_id), KEY idx_crf_import_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP数据导入批次（双轨采集+仪器CSV）';
