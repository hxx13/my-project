-- NHP 团队角色字典（team_id=0=全局内置；团队自定义按 team_id 隔离）。与 db/bootstrap-nhp-team-role.sql 同源（归档版）。

CREATE TABLE team_role (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    team_id    BIGINT      NOT NULL DEFAULT 0 COMMENT '团队 id（0=全局内置角色）',
    code       VARCHAR(64) NOT NULL COMMENT '角色 code，如 OWNER/RESEARCHER',
    label      VARCHAR(64) NOT NULL COMMENT '中文名',
    sort_order INT         NOT NULL DEFAULT 0,
    active     TINYINT     NOT NULL DEFAULT 1,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_team_role (team_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP团队角色字典（0=全局内置，团队自定义按 team_id 隔离）';

INSERT INTO team_role (team_id, code, label, sort_order) VALUES
(0, 'OWNER', '负责人', 1),
(0, 'MANAGER', '管理员', 2),
(0, 'MEMBER', '成员', 3),
(0, 'RESEARCHER', '研究员', 4),
(0, 'REVIEWER', '审核员', 5),
(0, 'DATA_ENTRY', '录入员', 6);
