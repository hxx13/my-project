-- 门禁一级库：同步大华刷卡落库时的部门（非学生/工作人员分类）
-- 目标库 twin_system

ALTER TABLE access_raw_event
    ADD COLUMN department_id VARCHAR(50) NULL COMMENT '大华部门ID' AFTER person_name;

ALTER TABLE access_raw_event
    ADD COLUMN department_name VARCHAR(128) NULL COMMENT '大华部门名称' AFTER department_id;
