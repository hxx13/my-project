-- 滞留配置表新增交互式确认字段（幂等）
SET @stmt1 = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stranded_violation_config' AND COLUMN_NAME = 'interactive_challenge_enabled') = 0,
  'ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_enabled TINYINT NOT NULL DEFAULT 0 COMMENT ''是否启用交互式违规确认''',
  'SELECT 1'
));
PREPARE st1 FROM @stmt1; EXECUTE st1; DEALLOCATE PREPARE st1;

SET @stmt2 = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stranded_violation_config' AND COLUMN_NAME = 'interactive_challenge_phrase') = 0,
  'ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_phrase VARCHAR(128) NOT NULL DEFAULT ''一人一卡,严禁尾随'' COMMENT ''交互拼图目标短语''',
  'SELECT 1'
));
PREPARE st2 FROM @stmt2; EXECUTE st2; DEALLOCATE PREPARE st2;
