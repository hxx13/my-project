-- 归档：AUP 计划书删除留痕表（实际执行脚本 src/main/resources/db/bootstrap-aup-delete-log.sql）
CREATE TABLE IF NOT EXISTS aup_delete_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    aup_id BIGINT NOT NULL COMMENT '被删计划书 id',
    register_no VARCHAR(64) NULL COMMENT '注册号',
    project_name VARCHAR(256) NULL COMMENT '项目名称',
    current_stage VARCHAR(32) NULL COMMENT '删除时的状态',
    plan_version INT NULL COMMENT '删除时的计划书版本号',
    operator VARCHAR(64) NULL COMMENT '操作人账号',
    operator_name VARCHAR(128) NULL COMMENT '操作人姓名',
    reason VARCHAR(512) NULL COMMENT '删除原因',
    deleted_at DATETIME NULL,
    KEY idx_del_aup (aup_id),
    KEY idx_del_time (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP 计划书删除留痕';
