-- 组员级能力勾选：饲养组长给**本组组员**逐人勾「能用哪些模式」。
-- 语义（设计 6.2 / 8）：有行 = **以组长勾选的为准**（全量覆盖，不是与矩阵求并）；
-- 写入时校验 ⊆ 矩阵里该组员身份的并集（矩阵是上限，组长只能在上限内收窄）。
-- user_id 与 cage_region_grant 同口径 = personnel.id。
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS cage_member_capability (
    id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id         VARCHAR(64) NOT NULL COMMENT '= personnel.id（组员）',
    capability_code VARCHAR(64) NOT NULL COMMENT '引用 cage_permission_capability.code',
    granted_by      VARCHAR(64) NULL COMMENT '操作人 sys_user.id',
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_member_capability (user_id, capability_code),
    KEY idx_cmc_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组员级能力勾选（组长逐人勾，全量覆盖矩阵）';
