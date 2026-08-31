-- NHP 团队归属补列 + 码表种子标记。与 db/bootstrap-nhp-team-id.sql 同源（归档版，非幂等）。

ALTER TABLE crf_form ADD COLUMN team_id BIGINT NULL COMMENT '归属团队 FK→team.id（NULL=平台默认模板）';
ALTER TABLE crf_visit_scheme ADD COLUMN team_id BIGINT NULL COMMENT '归属团队（NULL=平台默认方案）';
ALTER TABLE crf_field ADD COLUMN team_id BIGINT NULL COMMENT '归属团队（NULL=系统种子字段）';
ALTER TABLE crf_codelist ADD COLUMN team_id BIGINT NULL COMMENT '归属团队（NULL=系统种子码表）';
ALTER TABLE crf_codelist ADD COLUMN frozen_by VARCHAR(64) NULL COMMENT '冻结人（seed=系统种子）';
