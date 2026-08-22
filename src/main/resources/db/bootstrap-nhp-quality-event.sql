-- ============================================================
-- NHP data quality center（22 §6.5② / V20260821037）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821037__nhp_quality_event.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crf_quality_event (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_type   VARCHAR(20)  NOT NULL COMMENT 'OUTLIER/DEVIATION/TAT_OVERDUE/COC_BROKEN',
    subject_id   BIGINT       NULL COMMENT 'FK→crf_subject',
    ref_type     VARCHAR(20)  NULL COMMENT 'record/sample/test_order/coc',
    ref_id       BIGINT       NULL,
    trigger_rule VARCHAR(128) NULL COMMENT '触发规则描述',
    status       VARCHAR(20)  NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN/REVIEWED/CLOSED',
    reviewer     VARCHAR(64)  NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_qe_type (event_type),
    KEY idx_crf_qe_subject (subject_id),
    KEY idx_crf_qe_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP 数据质量事件队列';
