-- 归档迁移：笼位划分表（与 src/main/resources/db/bootstrap-cage-division.sql 同源）。
CREATE TABLE IF NOT EXISTS cage_division (
    id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animal_cage_id BIGINT       NOT NULL COMMENT '笼位ID',
    assignee_id    VARCHAR(64)  NOT NULL COMMENT '被划分人（统一人员口径 accountId）',
    assignee_name  VARCHAR(128) NULL COMMENT '被划分人姓名快照',
    group_name     VARCHAR(128) NULL COMMENT '划分时课题组快照',
    created_by     VARCHAR(64)  NULL COMMENT '操作管家 accountId',
    created_by_name VARCHAR(128) NULL COMMENT '操作管家姓名快照',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_division (animal_cage_id, assignee_id),
    KEY idx_cage_division_cage (animal_cage_id),
    KEY idx_cage_division_assignee (assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位划分（预分给本课题组某人）';
