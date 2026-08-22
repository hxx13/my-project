-- ============================================================
-- NHP sample entities (22 / V20260821029)
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821029__nhp_sample.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crf_sample (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sample_code VARCHAR(64) NOT NULL,
    tx_id BIGINT NULL COMMENT 'FK->crf_transplant post-tx',
    donor_subject_id BIGINT NULL,
    recipient_subject_id BIGINT NULL,
    sample_type VARCHAR(16) NULL COMMENT 'codelist SAMPLE',
    timepoint_code VARCHAR(16) NULL,
    collect_datetime DATETIME NULL,
    storage_condition VARCHAR(8) NULL,
    storage_location VARCHAR(64) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_sample_code (sample_code),
    KEY idx_crf_sample_tx (tx_id),
    KEY idx_crf_sample_donor (donor_subject_id),
    KEY idx_crf_sample_recip (recipient_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP sample D4.01';

CREATE TABLE IF NOT EXISTS crf_sample_coc_event (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sample_id BIGINT NOT NULL,
    handler VARCHAR(64) NULL,
    event_time DATETIME NULL,
    temperature DECIMAL(6,2) NULL,
    note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_coc_sample (sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP sample CoC event D4.01.008';

CREATE TABLE IF NOT EXISTS crf_test_order (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    test_code VARCHAR(32) NOT NULL,
    lab_id VARCHAR(16) NULL COMMENT 'codelist LAB',
    panel_version VARCHAR(16) NULL,
    test_items TEXT NULL,
    tat_hours DECIMAL(6,1) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    sample_id BIGINT NOT NULL COMMENT 'FK->crf_sample required',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_test_code (test_code),
    KEY idx_crf_test_sample (sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP test order D4.02 sample_id required';

CREATE TABLE IF NOT EXISTS crf_test_result (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    result_code VARCHAR(64) NOT NULL,
    test_order_id BIGINT NOT NULL,
    assay_code VARCHAR(16) NULL,
    concept_code VARCHAR(64) NULL,
    value_string VARCHAR(512) NULL,
    value_decimal DECIMAL(18,4) NULL,
    value_text TEXT NULL,
    qc_status VARCHAR(16) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_result_code (result_code),
    KEY idx_crf_result_order (test_order_id),
    KEY idx_crf_result_concept (concept_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP test result RS D4.03';
