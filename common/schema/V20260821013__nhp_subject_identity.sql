-- NHP 研究对象身份标识字段（归档；运行时由 bootstrap-nhp-subject-identity.sql 幂等执行）
-- 对齐 数据库字段档案 D1.01 / D2.01 个体档案常用标识。

ALTER TABLE crf_subject
    ADD COLUMN IF NOT EXISTS sex VARCHAR(8) NULL COMMENT '性别 M/F' AFTER basic_json,
    ADD COLUMN IF NOT EXISTS birth_date DATE NULL COMMENT '出生日期' AFTER sex,
    ADD COLUMN IF NOT EXISTS species VARCHAR(64) NULL COMMENT '物种（受体：食蟹猴/恒河猴等）' AFTER birth_date,
    ADD COLUMN IF NOT EXISTS breed VARCHAR(64) NULL COMMENT '品种/品系（供体）' AFTER species,
    ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(10,3) NULL COMMENT '体重 kg' AFTER breed,
    ADD COLUMN IF NOT EXISTS age_years DECIMAL(6,2) NULL COMMENT '年龄（岁）' AFTER weight_kg,
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(64) NULL COMMENT '院内/基地原编号' AFTER age_years,
    ADD COLUMN IF NOT EXISTS microchip_id VARCHAR(64) NULL COMMENT '芯片号' AFTER external_id,
    ADD COLUMN IF NOT EXISTS farm_code VARCHAR(64) NULL COMMENT '基地编码（供体 farm_id）' AFTER microchip_id,
    ADD COLUMN IF NOT EXISTS origin_note VARCHAR(256) NULL COMMENT '来源与检疫摘要' AFTER farm_code,
    ADD COLUMN IF NOT EXISTS biocontainment_level VARCHAR(16) NULL COMMENT 'SPF/DPF 等生物安全等级' AFTER origin_note,
    ADD COLUMN IF NOT EXISTS pedigree VARCHAR(256) NULL COMMENT '谱系（父/母 ID）' AFTER biocontainment_level;

-- 索引由 bootstrap 脚本幂等补齐（部分 MySQL 版本不支持 ADD INDEX IF NOT EXISTS）
