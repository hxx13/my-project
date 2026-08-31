-- NHP 通用授权矩阵（主体×资源×能力），泛化 crf_form_role。与 common/schema/V20260831__nhp_permission.sql 同源。
-- 幂等：CREATE IF NOT EXISTS；迁移用 INSERT IGNORE（去重靠唯一键）。

CREATE TABLE IF NOT EXISTS crf_permission (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_type    VARCHAR(16)  NOT NULL COMMENT 'identity/team_role/self',
    subject_code    VARCHAR(64)  NOT NULL COMMENT '身份code/OWNER·MANAGER·MEMBER/SELF',
    resource_type   VARCHAR(32)  NOT NULL COMMENT 'form/project/team/global/dict/codelist/visit_scheme/event_assignment/id_rule/event_rule/standard/folder',
    resource_id     BIGINT       NULL COMMENT '资源id（NULL=该类型全部）',
    resource_key    BIGINT       GENERATED ALWAYS AS (IFNULL(resource_id, 0)) STORED,
    capability_code VARCHAR(64)  NOT NULL COMMENT 'FK→crf_capability.code',
    team_id         BIGINT       NULL COMMENT '团队归属（NULL=全局/默认）',
    team_key        BIGINT       GENERATED ALWAYS AS (IFNULL(team_id, 0)) STORED,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_permission (subject_type, subject_code, resource_type, resource_key, capability_code, team_key),
    KEY idx_crf_permission_res (resource_type, resource_id),
    KEY idx_crf_permission_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP通用授权矩阵（主体×资源×能力）';

-- 迁移 crf_form_role → crf_permission。旧 capability crf:query 改名 crf:view；role_key 视为身份码。
-- RoleEnum 码（ADMIN/PLATFORM_OWNER 等）历史未写入此表；若有，由 isPlatformOwner 隐式判定兜底，不落矩阵。
INSERT IGNORE INTO crf_permission (subject_type, subject_code, resource_type, resource_id, capability_code)
SELECT 'identity', role_key, 'form', form_id,
       CASE WHEN capability = 'crf:query' THEN 'crf:view' ELSE capability END
FROM crf_form_role;
