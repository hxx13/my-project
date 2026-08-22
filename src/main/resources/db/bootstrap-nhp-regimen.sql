-- ============================================================
-- NHP regimen DRAFT (22 / V20260821031)
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821031__nhp_regimen.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crf_regimen_library (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    immu_code VARCHAR(16) NOT NULL COMMENT 'codelist IMMU',
    version INT NOT NULL,
    dose_rule TEXT NULL,
    target_range TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'D6 DRAFT not FROZEN',
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_immu_ver (immu_code, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP regimen library D6.01 DRAFT';

CREATE TABLE IF NOT EXISTS crf_regimen (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    regimen_code VARCHAR(48) NOT NULL,
    tx_id BIGINT NOT NULL,
    immu_code VARCHAR(16) NULL,
    immu_version INT NULL,
    regimen_phase VARCHAR(16) NULL,
    regimen_start DATE NULL,
    change_reason VARCHAR(16) NULL COMMENT 'codelist DOSE_ADJ',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'D6 DRAFT not FROZEN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_regimen_code (regimen_code),
    KEY idx_crf_regimen_tx (tx_id),
    KEY idx_crf_regimen_immu (immu_code, immu_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP regimen instance D6.01 DRAFT';

CREATE TABLE IF NOT EXISTS crf_medication (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    med_code VARCHAR(48) NOT NULL,
    regimen_id BIGINT NULL COMMENT 'XOR anesthesia_id',
    anesthesia_id BIGINT NULL COMMENT 'forward-ref no hard FK',
    drug_code VARCHAR(16) NULL,
    dose_value DECIMAL(12,3) NULL,
    dose_unit VARCHAR(8) NULL,
    route VARCHAR(8) NULL COMMENT 'codelist ROUTE',
    dose_time DATETIME NULL,
    missed_flag VARCHAR(8) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'D6 DRAFT not FROZEN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_med_code (med_code),
    KEY idx_crf_med_regimen (regimen_id),
    KEY idx_crf_med_anes (anesthesia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP medication D6.02/D7 shared DRAFT';

CREATE TABLE IF NOT EXISTS crf_drug_level (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    level_code VARCHAR(48) NOT NULL,
    regimen_id BIGINT NOT NULL COMMENT 'required owner',
    tx_id BIGINT NULL COMMENT 'nullable redundant',
    drug_code VARCHAR(16) NULL,
    trough_level DECIMAL(12,3) NULL,
    target_range VARCHAR(32) NULL,
    adj_event TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'D6 DRAFT not FROZEN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_lvl_code (level_code),
    KEY idx_crf_lvl_regimen (regimen_id),
    KEY idx_crf_lvl_tx (tx_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP drug level D6.03 DRAFT';
