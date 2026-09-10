-- 「管家」字段支持多人：顿号分隔存多个课题组管家姓名。
-- 原 VARCHAR(128) 约容纳 32 个中文名，扩到 255 留余量。
-- 表单侧 cage_info_value.value_string 已是 VARCHAR(512)，无需改。
ALTER TABLE cage_cell_detail
    MODIFY COLUMN lab_assistant_name VARCHAR(255) NULL COMMENT '管家（可多人，顿号分隔；由课题组管家的身份标签联动写入）';
