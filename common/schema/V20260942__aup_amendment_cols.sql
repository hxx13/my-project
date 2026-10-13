-- 归档：aup_record 修订轨道三列（实际执行脚本 src/main/resources/db/bootstrap-aup-amendment-cols.sql）
ALTER TABLE aup_record ADD COLUMN amendment_stage VARCHAR(32) NULL COMMENT '修订轨道阶段（NULL=无修订）：draft/piReview/formatReview/expertReview';
ALTER TABLE aup_record ADD COLUMN amendment_data MEDIUMTEXT NULL COMMENT '修订中的计划书内容（通过后写入 aup_data.data）';
ALTER TABLE aup_record ADD COLUMN plan_version INT NOT NULL DEFAULT 1 COMMENT '计划书版本号，大修通过后递增';
