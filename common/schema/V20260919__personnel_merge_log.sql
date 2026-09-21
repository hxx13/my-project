-- 人工合并留痕：谁把哪两行并成了一行（与 common/schema/V20260919__personnel_merge_log.sql 同源）
CREATE TABLE IF NOT EXISTS personnel_merge_log (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    survivor_id          BIGINT       NOT NULL COMMENT '合并后存活的人员主键',
    merged_id            BIGINT       NOT NULL COMMENT '被合并掉的人员主键',
    survivor_name        VARCHAR(128) NULL,
    merged_name          VARCHAR(128) NULL,
    survivor_staff_id    VARCHAR(64)  NULL,
    merged_staff_id      VARCHAR(64)  NULL,
    survivor_aro_user_id VARCHAR(64)  NULL,
    merged_aro_user_id   VARCHAR(64)  NULL,
    operator_id          VARCHAR(64)  NULL COMMENT '操作人账号 id',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_merge_survivor (survivor_id),
    KEY idx_merge_merged (merged_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='人员人工合并日志';
