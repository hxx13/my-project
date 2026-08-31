-- NHP 表单级访问设置（按 项目×事件×表单 一组开关；project_id=0/event_id=0 表示全局默认）。与 db/bootstrap-nhp-form-access.sql 同源（归档版）。

CREATE TABLE crf_form_access (
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
