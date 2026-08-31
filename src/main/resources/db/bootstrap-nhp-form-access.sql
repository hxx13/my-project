-- NHP 表单级访问设置（按 项目×事件×表单 一组开关；project_id=0/event_id=0 表示全局默认）。与 common/schema/V20260831__nhp_form_access.sql 同源。
-- 3D 权限：同一表单在不同事件/阶段可不同配置；判定回退 项目×事件×表单 → 项目×0×表单 → 0×0×表单。

-- 自愈：历史迭代导致表结构不一致（缺 project_id/event_id）时直接重建（该表为新增表，无历史数据）
SET @db = DATABASE();
SET @has_pid = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crf_form_access' AND COLUMN_NAME='project_id');
SET @has_eid = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crf_form_access' AND COLUMN_NAME='event_id');
SET @sql = IF(@has_pid = 0 OR @has_eid = 0, 'DROP TABLE IF EXISTS crf_form_access', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS crf_form_access (
    project_id  BIGINT      NOT NULL DEFAULT 0 COMMENT '项目 id（0=全局默认）',
    event_id    BIGINT      NOT NULL DEFAULT 0 COMMENT '事件/访视时点 id（0=表单全局默认）',
    form_key    VARCHAR(64) NOT NULL COMMENT '表单 code（逻辑表单，跨版本）',
    locked      TINYINT     NOT NULL DEFAULT 0 COMMENT '是否锁定（锁定后填写实例只读）',
    self_view   TINYINT     NOT NULL DEFAULT 1 COMMENT '本人可查看',
    others_view TINYINT     NOT NULL DEFAULT 1 COMMENT '他人可查看',
    self_edit   TINYINT     NOT NULL DEFAULT 1 COMMENT '本人可编辑',
    others_edit TINYINT     NOT NULL DEFAULT 0 COMMENT '他人可编辑',
    updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, event_id, form_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP表单级访问设置（项目×事件×表单，锁定/查看/编辑组合）';
