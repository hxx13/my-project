-- NHP hub entities (archive; runtime bootstrap-nhp-transplant.sql)
-- V20260821028

CREATE TABLE IF NOT EXISTS crf_crossmatch (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    xm_code VARCHAR(32) NOT NULL COMMENT 'XM-{DONOR}-{RECIP}-{seq:2}',
    donor_subject_id BIGINT NOT NULL,
    recipient_subject_id BIGINT NOT NULL,
    cdc_xm_result VARCHAR(8) NULL,
    flow_xm_result VARCHAR(8) NULL,
    adcc_result VARCHAR(8) NULL,
    pairing_score DECIMAL(6,2) NULL COMMENT 'DERIVED',
    pairing_decision VARCHAR(16) NULL,
    decision_rationale TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_xm_code (xm_code),
    KEY idx_crf_xm_donor (donor_subject_id),
    KEY idx_crf_xm_recip (recipient_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP crossmatch D3.01';

CREATE TABLE IF NOT EXISTS crf_transplant (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tx_code VARCHAR(32) NOT NULL COMMENT 'TX-{center}{year}-{seq:3}',
    donor_subject_id BIGINT NOT NULL,
    recipient_subject_id BIGINT NOT NULL,
    xm_id BIGINT NULL COMMENT 'FK->crf_crossmatch.id',
    tx_organ VARCHAR(8) NULL COMMENT 'codelist ORG',
    procedure_type VARCHAR(16) NULL COMMENT 'codelist PROC',
    tx_date DATE NULL COMMENT 'day0 anchor',
    cold_ischemia_min DECIMAL(10,2) NULL,
    warm_ischemia_min DECIMAL(10,2) NULL,
    reperfusion_time TIME NULL,
    induction_regimen VARCHAR(16) NULL COMMENT 'codelist IMMU',
    maintenance_regimen VARCHAR(16) NULL COMMENT 'codelist IMMU',
    parent_tx_id BIGINT NULL COMMENT 'self-ref retransplant',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_tx_code (tx_code),
    KEY idx_crf_tx_donor (donor_subject_id),
    KEY idx_crf_tx_recip (recipient_subject_id),
    KEY idx_crf_tx_xm (xm_id),
    KEY idx_crf_tx_parent (parent_tx_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP transplant hub D3.02 no intraop_samples';
