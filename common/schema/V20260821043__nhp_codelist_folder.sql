-- NHP 码表新增「文件夹分类」列（分组/层级索引；NULL=未分类）。
-- 幂等同源：db/bootstrap-nhp-codelist-folder.sql
ALTER TABLE crf_codelist
    ADD COLUMN folder VARCHAR(64) NULL COMMENT '码表文件夹分类（分组用，NULL=未分类）' AFTER name;
