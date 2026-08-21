-- =============================================================
-- NHP 字段字典「套」/版本壳：猪 / 猴等可并存，互不覆盖
-- 与 db/bootstrap-nhp-field-dictionary.sql 同源
-- =============================================================

CREATE TABLE IF NOT EXISTS crf_field_dictionary (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dict_key    VARCHAR(64)  NOT NULL COMMENT '稳定键 pig / monkey / custom-xxx',
    name        VARCHAR(128) NOT NULL COMMENT '显示名，如 猪异种移植字段字典',
    species     VARCHAR(64)  NULL COMMENT '种属标签：猪 / 猴 / 其它',
    description VARCHAR(512) NULL COMMENT '说明',
    version     INT          NOT NULL DEFAULT 1 COMMENT '字典套版本号',
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/ARCHIVED',
    active      TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_field_dict_key (dict_key),
    KEY idx_crf_field_dict_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='NHP字段字典套（种属/方案级目录；字段归属 dictionary_id）';

-- 默认猪字典（幂等）
INSERT INTO crf_field_dictionary (dict_key, name, species, description, version, status, active)
SELECT 'pig', '猪异种移植字段字典', '猪', '默认字典：供体猪/受体 NHP 异种移植 CRF 字段（D1–D13）', 1, 'ACTIVE', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM crf_field_dictionary WHERE dict_key = 'pig');

INSERT INTO crf_field_dictionary (dict_key, name, species, description, version, status, active)
SELECT 'monkey', '猴字段字典', '猴', '空数据域套壳；与猪套并排独立，不继承猪 D1–D10，请自建套内域', 1, 'ACTIVE', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM crf_field_dictionary WHERE dict_key = 'monkey');

-- 存量库补列（Flyway/手工执行时；启动 bootstrap 另有幂等脚本）
-- ALTER TABLE crf_field ADD COLUMN dictionary_id BIGINT NULL COMMENT 'FK→crf_field_dictionary.id' AFTER id;
-- UPDATE crf_field f INNER JOIN crf_field_dictionary d ON d.dict_key='pig' SET f.dictionary_id=d.id WHERE f.dictionary_id IS NULL;
-- ALTER TABLE crf_field DROP INDEX uk_crf_field_code;
-- ALTER TABLE crf_field ADD UNIQUE KEY uk_crf_field_dict_code (dictionary_id, field_code);
