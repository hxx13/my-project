-- AGV Stats Pipeline: 统计管道配置 + 实时快照 + 事件日志

CREATE TABLE IF NOT EXISTS `agv_stats_config` (
    `id`              BIGINT AUTO_INCREMENT PRIMARY KEY,
    `name`            VARCHAR(64)  NOT NULL COMMENT '配置名称',
    `config_type`     VARCHAR(20)  NOT NULL COMMENT 'STATION_GROUP|METRIC_PIPE|BUNDLE',
    `definition_json` JSON         NOT NULL COMMENT '核心配置体',
    `pipeline_slug`   VARCHAR(32)  NULL COMMENT 'SSE管道标识',
    `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY `uk_slug` (`pipeline_slug`),
    INDEX `idx_type_active` (`config_type`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV统计管道配置';

CREATE TABLE IF NOT EXISTS `agv_stats_snapshot` (
    `id`              BIGINT AUTO_INCREMENT PRIMARY KEY,
    `config_id`       BIGINT       NOT NULL COMMENT '关联 agv_stats_config.id',
    `metric_key`      VARCHAR(128) NOT NULL COMMENT '指标键，如 STATION_VISIT_COUNT:CP1201',
    `current_value`   DOUBLE       NOT NULL DEFAULT 0 COMMENT '当前累计值',
    `trend`           VARCHAR(10)  NULL COMMENT 'up|down|flat',
    `last_value`      DOUBLE       NULL COMMENT '上次推送值，用于计算trend',
    `is_running`      TINYINT(1)   NULL COMMENT '仅计时类，是否进行中',
    `started_at`      DATETIME(3)  NULL COMMENT '计时开始时间',
    `last_updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY `uk_config_metric` (`config_id`, `metric_key`),
    INDEX `idx_updated` (`last_updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV统计快照(持久化)';

CREATE TABLE IF NOT EXISTS `agv_stats_event_log` (
    `id`              BIGINT AUTO_INCREMENT PRIMARY KEY,
    `robot_ip`        VARCHAR(20)  NOT NULL,
    `event_type`      VARCHAR(20)  NOT NULL COMMENT 'TASK_START|TASK_END|STATION_ENTER|STATION_EXIT|STATUS_CHANGE',
    `event_target`    VARCHAR(64)  NOT NULL COMMENT '目标标识(站点编号/任务类型/状态码)',
    `event_at`        DATETIME(3)  NOT NULL COMMENT '事件发生时间',
    `metadata_json`   JSON         NULL COMMENT '附加数据',
    `consumed`        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已被计算引擎消费',
    `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `idx_consumed` (`consumed`, `event_at`),
    INDEX `idx_robot_time` (`robot_ip`, `event_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV统计事件日志';
