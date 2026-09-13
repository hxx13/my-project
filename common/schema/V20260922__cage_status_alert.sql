-- 笼位特殊状态持续超时告警（数据层）：三张表 + 全局默认阈值种子 + 能力码种子。
--
-- 与老的快照告警链路（CageAlertService / cage_special_status_snapshot / cage_event_log /
-- CageStatusViolationCheckService / cage_alert_config 等，服务 ARO 数据源）**零耦合**：
-- 那是另一套，后续整体删除，本模块不改不碰不复用。
-- 本模块的真相源是本地审计表 cage_form_audit_log（逐字段记 before/after + created_at）。
--
-- 状态码 ↔ 表单 canonical 字段码（核实自 CageCellIndexService.getLocalShelfGrid 的 specialStatuses 构建，
-- 与 CageInfoSchemaMigrator 播种的 canonical 字段名一致）：
--   NEED_DIVIDE      ↔ needs_division          （detail.needsDivision）
--   SPECIAL_FEEDING  ↔ needs_special_feeding   （detail.needsSpecialFeeding）
--   ANIMAL_TRANSFER  ↔ needs_transfer          （detail.needsTransfer）
--   HEALTH_ABNORMAL  ↔ has_health_abnormality  （detail.hasHealthAbnormality）
--   COHABITATION     ↔ needs_cohabitation      （detail.needsCohabitation）
--
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE（本文件无会抛错的 ALTER，可一文件多 DDL，
-- 参照 V20260915__cage_permission_matrix.sql 的多表 + 种子先例）。

-- 表 1：全局默认阈值（超管配，5 行）。
CREATE TABLE IF NOT EXISTS cage_alert_default (
    status_code    VARCHAR(32) NOT NULL COMMENT '状态码（NEED_DIVIDE/SPECIAL_FEEDING/ANIMAL_TRANSFER/HEALTH_ABNORMAL/COHABITATION），对应 cage_form_audit_log.field_code 的五类特殊状态',
    threshold_days INT         NOT NULL COMMENT '持续多少天触发；0=状态一出现即触发',
    action         VARCHAR(16) NOT NULL COMMENT 'HIGHLIGHT | VIOLATION | BOTH',
    enabled        TINYINT     NOT NULL DEFAULT 1,
    updated_at     DATETIME    NULL,
    PRIMARY KEY (status_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位特殊状态告警全局默认阈值（超管配置）';

INSERT IGNORE INTO cage_alert_default (status_code, threshold_days, action) VALUES
('NEED_DIVIDE',     7, 'HIGHLIGHT'),
('SPECIAL_FEEDING', 7, 'HIGHLIGHT'),
('ANIMAL_TRANSFER', 7, 'HIGHLIGHT'),
('HEALTH_ABNORMAL', 7, 'HIGHLIGHT'),
('COHABITATION',    7, 'HIGHLIGHT');

-- 表 2：区域阈值（饲养组长配自己负责的区域）。
-- 形态照抄 cage_region_capability；唯一键带 configured_by 的原因同 V20260920：
--   同一区域可以有多个饲养组长，各家各配各的，键里不带 configured_by 会互相覆盖。
-- configured_by 不许 NULL（唯一索引里 NULL 互不相等，会破坏「每组长一条」约束）。
CREATE TABLE IF NOT EXISTS cage_region_alert_rule (
    id             BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    region_type    VARCHAR(16) NOT NULL COMMENT 'CAMPUS | FLOOR | ROOM',
    region_id      VARCHAR(64) NOT NULL,
    status_code    VARCHAR(32) NOT NULL COMMENT '状态码，同 cage_alert_default.status_code',
    threshold_days INT         NOT NULL COMMENT '持续多少天触发；0=状态一出现即触发',
    action         VARCHAR(16) NOT NULL COMMENT 'HIGHLIGHT | VIOLATION | BOTH',
    enabled        TINYINT     NOT NULL DEFAULT 1 COMMENT '1=启用；0=关闭',
    configured_by  VARCHAR(64) NOT NULL COMMENT '配置人 sys_user.id（该区域的饲养组长或超管）',
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME    NULL,
    UNIQUE KEY uk_cage_region_alert_rule (region_type, region_id, status_code, configured_by),
    KEY idx_cra_region (region_type, region_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域级特殊状态告警阈值（该区域饲养组长配置）';

-- 表 3：告警实例。
-- active_key 用普通可空列 + UNIQUE KEY（不用 MySQL 生成列）：state 非 CLEARED（PENDING/ACTIVE）时写
-- CONCAT(animal_cage_id, ':', status_code)，置 CLEARED 时写 NULL。NULL 在唯一索引里可重复，
-- 于是「同一笼位同一状态只能有一条活跃告警」由数据库保证，历史告警互不撞。
CREATE TABLE IF NOT EXISTS cage_status_alert (
    id             BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animal_cage_id BIGINT      NOT NULL,
    status_code    VARCHAR(32) NOT NULL,
    started_at     DATETIME    NOT NULL COMMENT '状态出现时刻（来自审计 cage_form_audit_log）',
    fired_at       DATETIME    NOT NULL COMMENT '触发时刻',
    threshold_days INT         NOT NULL COMMENT '触发时的阈值天数（快照，防阈值后改影响历史）',
    action         VARCHAR(16) NOT NULL COMMENT 'HIGHLIGHT | VIOLATION | BOTH',
    state          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT 'PENDING | ACTIVE | CLEARED',
    cleared_at     DATETIME    NULL,
    violation_id   BIGINT      NULL,
    estimated      TINYINT     NOT NULL DEFAULT 0 COMMENT '1=起算点估算：上线时已处该状态、无审计起点，起算点取引擎首次见到它的时刻，避免上线即按历史时长误报一波',
    active_key     VARCHAR(96) NULL COMMENT 'state 非 CLEARED 时非空=CONCAT(animal_cage_id,":",status_code)，CLEARED 时=NULL；配合唯一索引保证同笼同状态只一条活跃',
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME    NULL,
    UNIQUE KEY uk_cage_status_alert_active (active_key),
    KEY idx_csa_cage_status (animal_cage_id, status_code),
    KEY idx_csa_state_fired (state, fired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位特殊状态持续超时告警实例';

-- 能力码种子：告警阈值配置 / 告警自动发违规，注册进 STAFF 组，默认勾给饲养组长。
-- 依赖 cage_permission_capability / cage_permission_grant（V20260915 建），本脚本须排在其后执行。
-- sort_order 取现有最大值 230 之后（240 / 250）。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.alert.config',    '告警阈值配置', 'STAFF', 240),
('cage.alert.violation', '告警自动发违规', 'STAFF', 250);

INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.alert.config',    'BREEDING_GROUP_LEADER'),
('cage.alert.violation', 'BREEDING_GROUP_LEADER');
