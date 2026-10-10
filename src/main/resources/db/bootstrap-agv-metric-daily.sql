-- AGV 每日指标封存：一天一行 × 指标键。写定不动，供跨天累计与曲线用。
CREATE TABLE IF NOT EXISTS `agv_metric_daily` (
    `id`           BIGINT AUTO_INCREMENT PRIMARY KEY,
    `stat_date`    DATE         NOT NULL COMMENT '北京日',
    `metric_key`   VARCHAR(64)  NOT NULL COMMENT 'CAGE_WASH_TOTAL | ODO_TOTAL | ODO_BY_ROBOT:<ip>',
    `metric_value` DOUBLE       NOT NULL DEFAULT 0 COMMENT '当日值',
    `source`       VARCHAR(16)  NOT NULL DEFAULT 'LIVE' COMMENT 'LIVE 定时封存 | BACKFILL 历史回填',
    `frozen_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '封存时刻',
    UNIQUE KEY `uk_date_metric` (`stat_date`, `metric_key`),
    INDEX `idx_date` (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV每日指标封存';
