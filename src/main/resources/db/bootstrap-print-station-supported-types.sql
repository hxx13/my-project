-- print_station 增加「支持的文件类型」配置。
--
-- 用途：有些打印机吃不了某些文档（比如斑马卡牌机只吃卡牌尺寸的 PDF），
-- 派发时不提示的话，用户要等打到一半才发现卡住。这里按工位记一份白名单，
-- 派发弹窗上给红绿灯提示。
--
-- 存的是**类型分组**，逗号分隔：pdf / image / word / excel / ppt。
-- **留空 = 全支持** —— 存量工位不写这一列为 NULL，行为与改动前完全一致。
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_station' AND COLUMN_NAME = 'supported_types') = 0,
  'ALTER TABLE print_station ADD COLUMN supported_types VARCHAR(120) NULL COMMENT ''支持的文件类型分组，逗号分隔：pdf/image/word/excel/ppt；NULL=全支持''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
