-- 归档迁移（子系统4：课题组归属与 PI 管理）。
-- 运行时由 EmbeddedTwinSystemCoreDdlBootstrap 生效（见 bootstrap-project-group-join-request.sql / bootstrap-project-group-member-log.sql）。
-- 两表与运行时 bootstrap 同源；显式写 utf8mb4_unicode_ci，避免新表 general_ci 与老表 unicode_ci 跨拨列比较抛 1267。

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
