-- =============================================================
-- AUP 码表外部引用头标记：source=LOCAL/EXTERNAL + source_ref
-- 标记值域不在 AUP 管理、但字段需要引用的外部码表头（课题组 / B5·B6 动物订购规格）。
-- 归档迁移，与 src/main/resources/db/bootstrap-aup-dict-source.sql 同源。
-- =============================================================

ALTER TABLE dict
    ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'LOCAL' COMMENT 'LOCAL/EXTERNAL' AFTER review_comment,
    ADD COLUMN source_ref VARCHAR(64) NULL COMMENT 'projectGroup/ANIMAL_BREED/ANIMAL_STRAIN' AFTER source;
