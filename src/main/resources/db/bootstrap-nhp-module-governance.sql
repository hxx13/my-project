-- ============================================================
-- NHP module+governance DRAFT (22 / V20260821033)
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821033__nhp_module_governance.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crf_heart_module (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    heart_code VARCHAR(32) NOT NULL COMMENT 'HX-{TX}',
    tx_id BIGINT NOT NULL,
    graft_type VARCHAR(16) NULL COMMENT 'codelist GRAFT_H',
    graft_func_score DECIMAL(6,2) NULL COMMENT 'DRAFT key',
    echo_ef DECIMAL(6,2) NULL COMMENT 'DRAFT key',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'D9 DRAFT not FROZEN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_heart_code (heart_code),
    UNIQUE KEY uk_crf_heart_tx (tx_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP heart module D9 DRAFT';

CREATE TABLE IF NOT EXISTS crf_perfusion (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    perf_code VARCHAR(48) NOT NULL COMMENT 'PERF-{DON}-{date}',
    donor_subject_id BIGINT NOT NULL,
    recipient_subject_id BIGINT NULL,
    perf_mode VARCHAR(16) NULL COMMENT 'codelist PERF',
    perfusate TEXT NULL,
    perf_start DATETIME NULL,
    perf_duration DECIMAL(8,2) NULL,
    liver_cold_ischemia DECIMAL(8,2) NULL,
    vasc_resistance DECIMAL(12,4) NULL COMMENT 'DRAFT key',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'D10 DRAFT not FROZEN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_perf_code (perf_code),
    KEY idx_crf_perf_donor (donor_subject_id),
    KEY idx_crf_perf_recip (recipient_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP perfusion D10 DRAFT independent of TX';

CREATE TABLE IF NOT EXISTS crf_donor_genedit (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    donor_subject_id BIGINT NOT NULL,
    edit_combo_code VARCHAR(32) NULL COMMENT 'codelist EDIT',
    ko_loci TEXT NULL,
    ki_loci TEXT NULL,
    edit_verify_status VARCHAR(16) NULL,
    offtarget_result VARCHAR(64) NULL,
    transgene_copy_num INT NULL,
    generation INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_genedit_donor (donor_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP donor genedit D1.02';

CREATE TABLE IF NOT EXISTS crf_donor_organ (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    donor_subject_id BIGINT NOT NULL,
    organ_code VARCHAR(8) NULL COMMENT 'codelist ORG',
    donor_weight DECIMAL(10,3) NULL,
    organ_histology_baseline VARCHAR(64) NULL,
    organ_function_grade VARCHAR(8) NULL COMMENT 'codelist GRADE',
    release_decision VARCHAR(16) NULL,
    release_criteria_ver VARCHAR(16) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_crf_donor_organ_subj (donor_subject_id),
    KEY idx_crf_donor_organ_code (organ_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP donor organ D1.04';

CREATE TABLE IF NOT EXISTS crf_protocol (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    protocol_code VARCHAR(32) NOT NULL,
    version INT NOT NULL,
    title VARCHAR(128) NULL,
    source_doc VARCHAR(128) NULL,
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_protocol_ver (protocol_code, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP protocol version';

CREATE TABLE IF NOT EXISTS crf_public_case (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    pubcase_code VARCHAR(32) NOT NULL,
    source_ref VARCHAR(128) NULL COMMENT 'DOI/PMID',
    species VARCHAR(64) NULL,
    organ VARCHAR(8) NULL,
    summary TEXT NULL,
    import_batch_id BIGINT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_pubcase_code (pubcase_code),
    KEY idx_crf_pubcase_batch (import_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP public case D11';

CREATE TABLE IF NOT EXISTS crf_standard_version (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    standard_code VARCHAR(32) NOT NULL COMMENT 'PANEL/CRITERIA/PROTOCOL/DICT',
    object_ref VARCHAR(64) NOT NULL,
    version INT NOT NULL,
    version_note TEXT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_std_ver (standard_code, object_ref, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP standard version D12';
