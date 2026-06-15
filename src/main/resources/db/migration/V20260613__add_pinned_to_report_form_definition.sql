-- V20260613: 添加 pinned 列以支持置顶功能
ALTER TABLE report_form_definition ADD COLUMN IF NOT EXISTS `pinned` TINYINT NOT NULL DEFAULT 0 COMMENT '是否置顶 0/1' AFTER `status`;
