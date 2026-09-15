-- admin_file_template 增加「转换后 PDF」的存储路径。
--
-- 用途：上传 Word / Excel 时，服务端用 LibreOffice 转出一份 PDF 存起来，
-- 这里记它的 storage_key。原文件照旧保留在 storage_key 指向的位置。
--
-- 为什么单独存一份而不是替换原文件：
--   1. 下载/预览时应该给人原文件（他要的是 .docx，不是转出来的 .pdf）
--   2. 打印链路只吃 PDF，让它读 pdf_storage_key，转换失败不影响原文件
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_file_template' AND COLUMN_NAME = 'pdf_storage_key') = 0,
  'ALTER TABLE admin_file_template ADD COLUMN pdf_storage_key VARCHAR(512) NULL COMMENT ''Word/Excel 转换出来的 PDF 的存储路径；PDF/图片为 NULL''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
