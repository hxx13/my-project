-- 培训系列：所属人多选（owner_ids_json JSON 数组，如 ["STAFF_1","STAFF_2"]）。
-- 保留 owner_id 列不再使用；存量单所属人回填到 owner_ids_json（幂等：仅 NULL/空串回填）。
ALTER TABLE training ADD COLUMN owner_ids_json TEXT NULL COMMENT '所属人 id JSON 数组';

UPDATE training
SET owner_ids_json = CONCAT('["', owner_id, '"]')
WHERE owner_id IS NOT NULL AND (owner_ids_json IS NULL OR owner_ids_json = '');
