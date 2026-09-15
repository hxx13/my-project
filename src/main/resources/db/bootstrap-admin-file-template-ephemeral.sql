-- admin_file_template 增加「一次性文件」标记。
-- 用于「临时打印」：上传即打，打完就把文件删掉，不在文件模板库里留记录。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_file_template' AND COLUMN_NAME = 'ephemeral') = 0,
  'ALTER TABLE admin_file_template ADD COLUMN ephemeral TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1=一次性文件，打完即删，且不在文件模板库列表里显示''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
