-- 课题组成员留痕（子系统4：加入 + 移出都要留痕）。
-- 幂等：CREATE TABLE IF NOT EXISTS，重跑不重建。末行分号必留（否则 Spring 切 0 条语句静默跳过）。
CREATE TABLE IF NOT EXISTS project_group_member_log (
    id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_group_id   BIGINT       NOT NULL,
    personnel_id       BIGINT       NOT NULL COMMENT '被操作的人 personnel.id',
    action             VARCHAR(16)  NOT NULL COMMENT 'JOIN/REMOVE',
    actor_personnel_id BIGINT       NULL COMMENT '操作人：JOIN=审批 PI，REMOVE=踢人 PI',
    reason             VARCHAR(255) NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pgmlog_group (project_group_id),
    KEY idx_pgmlog_person (personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课题组成员留痕';
