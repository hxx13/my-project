-- 动物订购时间管理：策略 / 窗口规则 / 节假日 + ref_order.estimated_delivery_date
-- 运行时 bootstrap 幂等；本文件为 Flyway 归档。

CREATE TABLE IF NOT EXISTS animal_order_time_policy (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    default_mode         VARCHAR(16)  NOT NULL DEFAULT 'OPEN'
        COMMENT '无规则命中时的默认可购性：OPEN|CLOSED',
    eta_mode             VARCHAR(16)  NOT NULL DEFAULT 'RELATIVE'
        COMMENT 'RELATIVE|FIXED，全局仅一种生效',
    eta_workday_offset   INT          NOT NULL DEFAULT 3
        COMMENT 'RELATIVE：锚点后第 N 个工作日，0=锚点当日或下一工作日',
    eta_fixed_date       DATE         NULL
        COMMENT 'FIXED：固定送达基准日',
    active               TINYINT      NOT NULL DEFAULT 1,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购时间策略（单例）';

INSERT INTO animal_order_time_policy (id, default_mode, eta_mode, eta_workday_offset)
SELECT 1, 'OPEN', 'RELATIVE', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM animal_order_time_policy WHERE id = 1);

CREATE TABLE IF NOT EXISTS animal_order_window_rule (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    scope                VARCHAR(16)  NOT NULL DEFAULT 'GLOBAL'
        COMMENT 'GLOBAL|CATEGORY',
    category_key         VARCHAR(64)  NULL
        COMMENT 'scope=CATEGORY 时必填，如品种 ref_data.id',
    effect               VARCHAR(16)  NOT NULL
        COMMENT 'OPEN|DISABLE',
    shape                VARCHAR(16)  NOT NULL
        COMMENT 'DAILY|RANGE',
    daily_start_time     TIME         NULL,
    daily_end_time       TIME         NULL,
    range_start_at       DATETIME     NULL,
    range_end_at         DATETIME     NULL,
    label                VARCHAR(128) NULL,
    sort_order           INT          NOT NULL DEFAULT 0,
    active               TINYINT      NOT NULL DEFAULT 1,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_window_scope_category (scope, category_key, active),
    KEY idx_window_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购可购窗口规则';

CREATE TABLE IF NOT EXISTS animal_order_holiday (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    holiday_date         DATE         NOT NULL COMMENT '自然日',
    day_type             VARCHAR(16)  NOT NULL COMMENT 'HOLIDAY|WORKDAY_SHIFT',
    name                 VARCHAR(128) NULL,
    source               VARCHAR(16)  NOT NULL DEFAULT 'MANUAL' COMMENT 'IMPORT|CDN|MANUAL',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_holiday_date (holiday_date),
    KEY idx_holiday_year (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购节假日与调休';

ALTER TABLE ref_order
    ADD COLUMN estimated_delivery_date DATE NULL
        COMMENT '下单时计算的预计送达日（工作日）'
        AFTER submitted_at;
