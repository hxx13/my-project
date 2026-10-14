-- 视频通道增加「跳转地址」列：填监控设备自己的管理页面地址（一般是 http://<摄像机IP>/），
-- 在通道列表/大屏窗口上点一下就能直接打开该设备。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dahua_device_channel_cache'
     AND COLUMN_NAME = 'link_url') = 0,
  'ALTER TABLE dahua_device_channel_cache ADD COLUMN link_url VARCHAR(255) NULL COMMENT ''设备跳转地址（摄像机管理页）''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
