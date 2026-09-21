-- 课题组加入申请（子系统4：课题组归属与 PI 管理）。
-- 抄 team_join_request 的状态机，但独立成表、与 NHP 的 team 无关。
-- 幂等：CREATE TABLE IF NOT EXISTS，重跑不重建。末行分号必留（否则 Spring 切 0 条语句静默跳过）。
CREATE TABLE IF NOT EXISTS project_group_join_request (
    id                    BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_group_id      BIGINT       NOT NULL COMMENT '申请加入的课题组 project_group.id',
    personnel_id          BIGINT       NOT NULL COMMENT '申请人 personnel.id',
    status                VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED/CANCELLED',
    message               VARCHAR(255) NULL COMMENT '申请留言',
    reviewer_personnel_id BIGINT       NULL COMMENT '审批人 personnel.id',
    reviewed_at           DATETIME     NULL,
    reject_reason         VARCHAR(255) NULL,
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pgjreq_group (project_group_id),
    KEY idx_pgjreq_person (personnel_id),
    KEY idx_pgjreq_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课题组加入申请';
