-- 大华门禁刷卡记录：落库时写入人员所属部门（非 ARO 流水/课题组）
-- 目标库 twin_system

ALTER TABLE twin_dahua_swing_record
    ADD COLUMN department_id VARCHAR(50) NULL COMMENT '大华部门ID，26=学生' AFTER person_name;

ALTER TABLE twin_dahua_swing_record
    ADD COLUMN department_name VARCHAR(128) NULL COMMENT '大华部门名称' AFTER department_id;

-- audience_type 列若已添加可保留为空；清洗包 item 按部门 26/27/28/29 标 STUDENT，其余 STAFF

CREATE INDEX idx_dahua_swing_dept_time ON twin_dahua_swing_record (department_id, swing_time);
