-- NHP 项目计划书字段：项目名称、描述备注、创建者所属团队（FK→team.id）。
-- 团队仅存储引用，不参与权限判定；负责人/成员语义见 team / team_member 表。

ALTER TABLE crf_transplant
    ADD COLUMN IF NOT EXISTS project_name VARCHAR(128) NULL
    COMMENT '项目名称' AFTER tx_code;

ALTER TABLE crf_transplant
    ADD COLUMN IF NOT EXISTS remark VARCHAR(512) NULL
    COMMENT '描述备注' AFTER project_name;

ALTER TABLE crf_transplant
    ADD COLUMN IF NOT EXISTS team_id BIGINT NULL
    COMMENT '创建者所属团队 FK→team.id（预留，不参与权限判定）' AFTER remark;

ALTER TABLE crf_transplant
    ADD COLUMN IF NOT EXISTS current_tp VARCHAR(16) NULL
    COMMENT '手动选定的 TP 码（NULL=沿用后端自动推算）' AFTER team_id;

ALTER TABLE crf_transplant
    ADD COLUMN IF NOT EXISTS stage_lock TINYINT NOT NULL DEFAULT 0
    COMMENT '阶段锁定：1=非当前 TP 表单只读（仅作查看）' AFTER current_tp;
