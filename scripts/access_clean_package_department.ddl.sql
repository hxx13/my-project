-- 清洗包明细：人员所属部门（学生部门 ID=26）
-- 目标库 twin_system；启动前或与应用 migrator 二选一执行。

ALTER TABLE access_clean_package_item
    ADD COLUMN department_id VARCHAR(50) NULL COMMENT 'ARO 部门 ID，26=学生' AFTER mapping_user_id;

ALTER TABLE access_clean_package_item
    ADD COLUMN department_name VARCHAR(128) NULL COMMENT '部门名称' AFTER department_id;

ALTER TABLE access_clean_package_item
    ADD COLUMN audience_type VARCHAR(16) NULL COMMENT 'STUDENT|STAFF' AFTER department_name;

CREATE INDEX idx_pkg_item_swing_audience ON access_clean_package_item (swing_time, audience_type, disposition);
