-- NHP 概念/指标库（归档；运行时由 bootstrap-nhp-concept.sql 幂等执行）
-- V20260821026：建 crf_concept；crf_field 加 concept_code

CREATE TABLE IF NOT EXISTS crf_concept (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    concept_code VARCHAR(64)  NOT NULL COMMENT '概念码 LOINC 风格 CREAT/PLT/ALT',
    name_cn      VARCHAR(128) NOT NULL COMMENT '中文名',
    name_en      VARCHAR(64)  NULL COMMENT '英文名',
    data_type    VARCHAR(32)  NOT NULL COMMENT '默认数据类型',
    unit         VARCHAR(32)  NULL COMMENT '默认单位',
    codelist_id  BIGINT       NULL COMMENT 'FK→crf_codelist.id',
    active       TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_concept_code (concept_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP概念/指标库（多 field 复用同一 concept）';

ALTER TABLE crf_field
    ADD COLUMN IF NOT EXISTS concept_code VARCHAR(64) NULL COMMENT 'FK逻辑→crf_concept.concept_code（N:1 复用）' AFTER cdisc_test_code;
