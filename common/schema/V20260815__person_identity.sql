-- 归档迁移，与 db/bootstrap-person-identity.sql 同源。
-- 人员身份标识：身份标签字典（内置组长/秘书/专家三个默认标签种子（code 稳定，环境变量可配），其余管理员配置）+ 人员身份映射（多选，学生/员工双视角独立）。
-- 幂等：CREATE TABLE IF NOT EXISTS，重复执行无副作用。
CREATE TABLE IF NOT EXISTS person_identity_tag (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(64)  NOT NULL UNIQUE,
    label      VARCHAR(128) NOT NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    active     TINYINT      NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员身份标识字典（内置组长/秘书/专家三个默认标签种子（code 稳定，环境变量可配），其余管理员配置）';

CREATE TABLE IF NOT EXISTS person_identity (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    VARCHAR(64) NOT NULL COMMENT 'STUDENT=学号(aro_personnel.user_id)，STAFF=sys_user.id',
    tag_id     BIGINT      NOT NULL COMMENT '引用 person_identity_tag.id',
    scope      VARCHAR(16) NOT NULL COMMENT 'STUDENT/STAFF',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_person_identity (user_id, tag_id, scope),
    KEY idx_person_identity_scope_tag (scope, tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员身份映射（多选+双视角独立）';
