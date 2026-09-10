-- 「管家」字段支持多人（顿号分隔）。VARCHAR(128) 约 32 个中文名 → 扩到 255 留余量。
-- 幂等：MODIFY COLUMN 重复执行结果一致。
ALTER TABLE cage_cell_detail
    MODIFY COLUMN lab_assistant_name VARCHAR(255) NULL COMMENT '管家（可多人，顿号分隔；由课题组管家的身份标签联动写入）';
