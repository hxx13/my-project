-- ============================================================
-- 计划书删除留痕表。
-- 原 delete 是级联硬删（含 aup_audit_log 一起清掉），删完无据可查；
-- 本表不参与级联，删除前先落一条摘要，事后可追溯「谁在何时删了哪份计划书」。
-- 建表幂等（CREATE TABLE IF NOT EXISTS）。
-- 同源：common/schema/V20260944__aup_delete_log.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS aup_delete_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    aup_id BIGINT NOT NULL COMMENT '被删计划书 id',
    register_no VARCHAR(64) NULL COMMENT '注册号',
    project_name VARCHAR(256) NULL COMMENT '项目名称',
    current_stage VARCHAR(32) NULL COMMENT '删除时的状态',
    plan_version INT NULL COMMENT '删除时的计划书版本号',
    operator VARCHAR(64) NULL COMMENT '操作人账号',
    operator_name VARCHAR(128) NULL COMMENT '操作人姓名',
    reason VARCHAR(512) NULL COMMENT '删除原因（管理员删非草稿/申请人删草稿）',
    deleted_at DATETIME NULL,
    KEY idx_del_aup (aup_id),
    KEY idx_del_time (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP 计划书删除留痕';
