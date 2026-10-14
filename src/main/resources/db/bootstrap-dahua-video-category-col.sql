-- 通道缓存表增加「监控分类节点」列：只对视频大类（device_category=1）有意义，
-- 与门禁用的 remark_category_id 互不干扰。
-- 不写 AFTER：那一列由另一条启动链（DahuaChannelRemarkSchemaMigrator）建，先后顺序不保证。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dahua_device_channel_cache'
     AND COLUMN_NAME = 'video_category_id') = 0,
  'ALTER TABLE dahua_device_channel_cache ADD COLUMN video_category_id BIGINT NULL COMMENT ''监控分类树节点（仅视频通道）''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dahua_device_channel_cache'
     AND INDEX_NAME = 'idx_dcc_video_cat') = 0,
  'CREATE INDEX idx_dcc_video_cat ON dahua_device_channel_cache (video_category_id)',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
