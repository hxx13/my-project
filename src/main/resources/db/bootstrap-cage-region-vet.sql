-- 区域指定兽医：健康异常通知兽医的收件人来源。
--
-- 口径见 docs/02-设计存档/计划文档/2026-09-17-健康异常细分与兽医通知-架构设计.md：
--   兽医是**指定人员**，按区域配置；该区域饲养组长或超管在管理该区域时配置，落这一张表。
--   一个区域一般一位兽医，同一兽医可被指派到多个区域（= 多行）。
--   解析：ROOM > FLOOR > CAMPUS 就近命中，同级取并集（多组长各配各的）；
--   不做互斥拒绝 —— 阈值那边「计时起点分歧」必须拒是因为会折出第三态，这里并集有明确语义。
--
-- 形态照 cage_region_alert_rule：唯一键带 configured_by，否则同区域多组长会互相覆盖；
-- configured_by 不许 NULL（唯一索引里 NULL 互不相等，会破坏「每组长一条」约束）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS cage_region_vet (
    id             BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    region_type    VARCHAR(16) NOT NULL COMMENT 'CAMPUS | FLOOR | ROOM',
    region_id      VARCHAR(64) NOT NULL,
    vet_account_id VARCHAR(64) NOT NULL COMMENT '兽医的 sys_user.id（STAFF_ 或 aro_user_id 形态均可）',
    configured_by  VARCHAR(64) NOT NULL COMMENT '配置人 sys_user.id（该区域的饲养组长或超管）',
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME    NULL,
    UNIQUE KEY uk_cage_region_vet (region_type, region_id, vet_account_id, configured_by),
    KEY idx_crv_region (region_type, region_id),
    KEY idx_crv_vet (vet_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域指定兽医（该区域饲养组长/超管配置）';
