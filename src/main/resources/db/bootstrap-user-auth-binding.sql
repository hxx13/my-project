-- 与 common/schema/V20260821009__user_auth_binding.sql 内容一致（幂等 CREATE IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS user_auth_binding (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         VARCHAR(64)  NOT NULL COMMENT '本地账号主键（sys_user.id / aro_personnel.user_id）',
    idp_uid         VARCHAR(128) NOT NULL COMMENT 'IAM 稳定唯一标识（OIDC uid / sub）',
    idp_user_name   VARCHAR(128) NULL COMMENT 'IAM 登录账号（工号/学号，冗余便于排查）',
    bound_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次绑定时间',
    unbound_at      DATETIME     NULL COMMENT '解绑时间（软删除，保留历史）',
    UNIQUE KEY uk_user_auth_binding_idp_uid (idp_uid),
    KEY idx_user_auth_binding_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IAM 统一认证身份绑定';
