-- 为 cage_special_status_snapshot 表新增校区别名列
ALTER TABLE cage_special_status_snapshot
    ADD COLUMN campus_name VARCHAR(64) COMMENT '校区名称（浦东/浦西）'
    AFTER shelve_id;
