-- NHP anesthesia+pathology (archive; runtime bootstrap-nhp-anesthesia-pathology.sql)
-- V20260821032

CREATE TABLE IF NOT EXISTS crf_anesthesia (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    anes_code VARCHAR(32) NOT NULL,
    tx_id BIGINT NOT NULL,
    anes_method VARCHAR(32) NULL,
    depth_monitor VARCHAR(16) NULL,
    ebl DECIMAL(10,2) NULL,
    fluid_total DECIMAL(10,2) NULL,
    urine_output DECIMAL(10,2) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_anes_code (anes_code),
    KEY idx_crf_anes_tx (tx_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP anesthesia D7';

CREATE TABLE IF NOT EXISTS crf_transfusion (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    anesthesia_id BIGINT NOT NULL,
    component VARCHAR(16) NULL,
    volume_ml DECIMAL(10,2) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_transf_anes (anesthesia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP transfusion component D7.03';

CREATE TABLE IF NOT EXISTS crf_pathology (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    path_code VARCHAR(48) NOT NULL,
    tx_id BIGINT NOT NULL,
    sample_id BIGINT NOT NULL COMMENT 'FK->crf_sample CoC',
    sampling_type VARCHAR(16) NULL,
    organ_code VARCHAR(8) NULL COMMENT 'codelist ORG',
    timepoint_code VARCHAR(16) NULL,
    he_findings TEXT NULL,
    rej_grade VARCHAR(8) NULL COMMENT 'codelist REJ_GRADE',
    micro_thrombosis VARCHAR(8) NULL,
    em_result TEXT NULL,
    path_dx TEXT NULL,
    report_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_path_code (path_code),
    KEY idx_crf_path_tx (tx_id),
    KEY idx_crf_path_sample (sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP pathology D8.01';

CREATE TABLE IF NOT EXISTS crf_pathology_ihc (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    pathology_id BIGINT NOT NULL,
    marker_code VARCHAR(16) NULL,
    panel_version VARCHAR(16) NULL,
    result VARCHAR(16) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_ihc_path (pathology_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP pathology IHC child D8.03.001';

CREATE TABLE IF NOT EXISTS crf_pathology_if (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    pathology_id BIGINT NOT NULL,
    marker_code VARCHAR(16) NULL,
    deposit VARCHAR(32) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_if_path (pathology_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP pathology IF child D8.03.002';
