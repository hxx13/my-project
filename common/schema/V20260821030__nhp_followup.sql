-- NHP followup entities (archive; runtime bootstrap-nhp-followup.sql)
-- V20260821030

CREATE TABLE IF NOT EXISTS crf_followup (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fu_code VARCHAR(48) NOT NULL,
    tx_id BIGINT NOT NULL,
    timepoint_code VARCHAR(16) NULL,
    visit_instance_id BIGINT NULL,
    clinical_score DECIMAL(4,1) NULL,
    regimen_change TEXT NULL COMMENT 'ref D6',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_fu_code (fu_code),
    KEY idx_crf_fu_tx (tx_id),
    KEY idx_crf_fu_vi (visit_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP followup D5.01';

CREATE TABLE IF NOT EXISTS crf_adverse_event (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ae_code VARCHAR(48) NOT NULL,
    tx_id BIGINT NOT NULL,
    ae_type VARCHAR(16) NULL COMMENT 'codelist AE',
    ae_grade VARCHAR(8) NULL COMMENT 'codelist GRADE_AE',
    rejection_ref BIGINT NULL COMMENT 'FK->crf_pathology.id',
    biopsy_sample_id BIGINT NULL COMMENT 'FK->crf_sample',
    intervention TEXT NULL,
    ae_outcome VARCHAR(16) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_ae_code (ae_code),
    KEY idx_crf_ae_tx (tx_id),
    KEY idx_crf_ae_path (rejection_ref),
    KEY idx_crf_ae_sample (biopsy_sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP adverse event D5.02';

CREATE TABLE IF NOT EXISTS crf_outcome (
    tx_id BIGINT NOT NULL PRIMARY KEY COMMENT 'PK=FK->crf_transplant 1:1',
    survival_days INT NULL,
    endpoint_type VARCHAR(16) NULL COMMENT 'codelist ENDPOINT',
    endpoint_cause VARCHAR(16) NULL COMMENT 'codelist CAUSE',
    necropsy_status VARCHAR(16) NULL,
    tissue_archive TEXT NULL,
    lock_date DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP outcome D5.03 PK=tx_id';
