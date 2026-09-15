-- admin_file_template 增加「用途」列，隔离共享 blob 表的三类消费者。
-- 幂等：先查列是否存在再 ALTER。
-- 背景见 docs/02-设计存档/计划文档/2026-09-14-SOP操作文档-架构设计.md 第九章：
-- 这张表是全站共用的 blob 表，SOP 操作文档与学习资料都往它里面塞文件，
-- 而文件模板库列表不过滤来源，于是别处上传的 PDF 全聚集到了模板库页。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_file_template' AND COLUMN_NAME = 'purpose') = 0,
  'ALTER TABLE admin_file_template ADD COLUMN purpose VARCHAR(16) NOT NULL DEFAULT ''TEMPLATE'' COMMENT ''用途：TEMPLATE=文件模板库, SOP=SOP操作文档''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
