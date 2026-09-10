-- 与 common/schema/V20260821019__animal_order_time_management.sql 建表段一致（幂等 CREATE IF NOT EXISTS）
-- ref_order.estimated_delivery_date 由 ReferenceDataSchemaMigrator 幂等加列

CREATE TABLE IF NOT EXISTS animal_order_time_policy (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    default_mode         VARCHAR(16)  NOT NULL DEFAULT 'OPEN'
        COMMENT '无规则命中时的默认可购性：OPEN|CLOSED',
    eta_mode             VARCHAR(16)  NOT NULL DEFAULT 'RELATIVE'
        COMMENT 'RELATIVE|FIXED，全局仅一种生效',
    eta_workday_offset   INT          NOT NULL DEFAULT 3
        COMMENT 'RELATIVE：锚点后第 N 个工作日，0=锚点当日或下一工作日',
    eta_weekday          TINYINT      NULL
        COMMENT 'FIXED：ISO weekday 1=Mon…7=Sun',
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
        COMMENT 'WEEKLY|WEEKLY_SPAN|DAILY|RANGE（新建用 WEEKLY/WEEKLY_SPAN；DAILY/RANGE 仅兼容旧数据）',
    weekdays             VARCHAR(32)  NULL
        COMMENT 'ISO星期逗号分隔 1=周一…7=周日；WEEKLY（每日固定时段）必填',
    start_weekday        TINYINT      NULL
        COMMENT 'WEEKLY_SPAN：起始ISO星期 1=周一…7=周日',
    end_weekday          TINYINT      NULL
        COMMENT 'WEEKLY_SPAN：结束ISO星期 1=周一…7=周日',
    daily_start_time     TIME         NULL
        COMMENT 'WEEKLY=每日开始；WEEKLY_SPAN=起点时刻',
    daily_end_time       TIME         NULL
        COMMENT 'WEEKLY=每日结束；WEEKLY_SPAN=终点时刻',
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

-- ── 补齐 eta_weekday（2026-09-09）────────────────────────────────────
-- 建表用的是 CREATE IF NOT EXISTS，老库早于该列时不会被补；此处幂等 ALTER 自愈。
-- 注意：本脚本 continueOnError=false，任何一句报错都会中断后续所有语句，因此这里
-- 不再做 eta_fixed_date 回填（该列已被 V20260821021 删除）。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animal_order_time_policy' AND COLUMN_NAME = 'eta_weekday');
SET @sql = IF(@col = 0, 'ALTER TABLE animal_order_time_policy ADD COLUMN eta_weekday TINYINT NULL COMMENT ''FIXED：ISO weekday 1=Mon…7=Sun'' AFTER eta_workday_offset', 'SELECT ''eta_weekday exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 校区维度（2026-09-09）────────────────────────────────────────────
-- 策略与可购窗口分浦东/浦西两套；节假日为全国口径，不分校区。
-- 幂等：按 information_schema 判存在后再加列/加索引/播种子。

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animal_order_time_policy' AND COLUMN_NAME = 'campus');
SET @sql = IF(@col = 0, 'ALTER TABLE animal_order_time_policy ADD COLUMN campus VARCHAR(16) NOT NULL DEFAULT ''浦东'' COMMENT ''校区：浦东|浦西''', 'SELECT ''policy.campus exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animal_order_time_policy' AND INDEX_NAME = 'idx_policy_campus');
SET @sql = IF(@idx = 0, 'ALTER TABLE animal_order_time_policy ADD KEY idx_policy_campus (campus)', 'SELECT ''idx_policy_campus exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @cnt = (SELECT COUNT(*) FROM animal_order_time_policy WHERE campus = '浦西');
SET @sql = IF(@cnt = 0, 'INSERT INTO animal_order_time_policy (campus, default_mode, eta_mode, eta_workday_offset, eta_weekday, active) SELECT ''浦西'', default_mode, eta_mode, eta_workday_offset, eta_weekday, active FROM animal_order_time_policy WHERE campus = ''浦东''', 'SELECT ''xipu policy exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animal_order_window_rule' AND COLUMN_NAME = 'campus');
SET @sql = IF(@col = 0, 'ALTER TABLE animal_order_window_rule ADD COLUMN campus VARCHAR(16) NOT NULL DEFAULT ''浦东'' COMMENT ''校区：浦东|浦西''', 'SELECT ''rule.campus exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'animal_order_window_rule' AND INDEX_NAME = 'idx_window_campus');
SET @sql = IF(@idx = 0, 'ALTER TABLE animal_order_window_rule ADD KEY idx_window_campus (campus, active)', 'SELECT ''idx_window_campus exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @cnt = (SELECT COUNT(*) FROM animal_order_window_rule WHERE campus = '浦西');
SET @sql = IF(@cnt = 0, 'INSERT INTO animal_order_window_rule (campus, scope, category_key, effect, shape, weekdays, start_weekday, end_weekday, daily_start_time, daily_end_time, range_start_at, range_end_at, label, sort_order, active) SELECT ''浦西'', scope, category_key, effect, shape, weekdays, start_weekday, end_weekday, daily_start_time, daily_end_time, range_start_at, range_end_at, label, sort_order, active FROM animal_order_window_rule WHERE campus = ''浦东''', 'SELECT ''xipu rules exist''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
