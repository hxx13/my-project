-- ============================================================
-- 清理前序部署遗留的脏通知源（按名称匹配，级联删除）
-- ============================================================

-- 1) 清理子表：渠道配置
DELETE nc FROM notify_source_channel nc
INNER JOIN notify_source s ON nc.source_id = s.id
WHERE s.source_name IN ('设备告警通知', '学生审核通知')
   OR (s.source_name = '人员进入通知' AND s.source_code != 'ACCESS_ENTER')
   OR (s.source_name = '人员离开通知' AND s.source_code != 'ACCESS_EXIT');

-- 2) 清理子表：接收人配置
DELETE nr FROM notify_source_recipient nr
INNER JOIN notify_source s ON nr.source_id = s.id
WHERE s.source_name IN ('设备告警通知', '学生审核通知')
   OR (s.source_name = '人员进入通知' AND s.source_code != 'ACCESS_ENTER')
   OR (s.source_name = '人员离开通知' AND s.source_code != 'ACCESS_EXIT');

-- 3) 清理主表
DELETE FROM notify_source
WHERE source_name IN ('设备告警通知', '学生审核通知')
   OR (source_name = '人员进入通知' AND source_code != 'ACCESS_ENTER')
   OR (source_name = '人员离开通知' AND source_code != 'ACCESS_EXIT');
