-- WinCC 变量清单（多分区 CSV 入库）。在 twin_system 库执行一次即可。
-- 默认也可不手动执行：application.properties 中 app.wincc.ensure-watchlist-schema=true 时，启动会跑本脚本（CREATE IF NOT EXISTS）。
-- 执行后：设置 app.wincc.watchlist-source=database；管理端按文件名分区导入。

CREATE TABLE IF NOT EXISTS telemetry_metric_kind (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL COMMENT '英文码，如 TEMP',
    label_zh    VARCHAR(128) NOT NULL COMMENT '中文名，如 温度',
    sort_order  INT          NOT NULL DEFAULT 0,
    builtin     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=内置种子',
    active      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0=下拉隐藏',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_telemetry_metric_kind_code (code),
    KEY idx_telemetry_metric_kind_sort (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WinCC 变量指标类型';

INSERT IGNORE INTO telemetry_metric_kind (code, label_zh, sort_order, builtin, active) VALUES
    ('TEMP', '温度', 10, 1, 1),
    ('HUM', '湿度', 20, 1, 1),
    ('PRESSURE', '压差', 30, 1, 1);

CREATE TABLE IF NOT EXISTS telemetry_watchlist_bundle (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(64)  NOT NULL COMMENT 'slug，如 wincc-2f-vav',
    display_name    VARCHAR(200) NOT NULL COMMENT '人类可读名称',
    source_filename VARCHAR(255) NULL COMMENT '最近一次导入的原始文件名',
    is_active       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '兼容旧逻辑；WinCC 现合并所有分区已启用变量，可不依赖本字段',
    include_in_wincc_poll TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=本分区变量参与 WinCC 合并拉数；大量点时可关',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_telemetry_watchlist_code (code),
    KEY idx_telemetry_watchlist_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WinCC 变量分区（按文件名）';

CREATE TABLE IF NOT EXISTS telemetry_watchlist_tag (
    id                   BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bundle_id            BIGINT        NOT NULL,
    wincc_variable_name  VARCHAR(512)  NOT NULL COMMENT 'POST WinCC 的 variableName（名称列）',
    structure_type       VARCHAR(128)  NULL COMMENT '结构类型（CSV）',
    data_type            VARCHAR(255)  NULL COMMENT '数据类型（CSV）',
    display_label        VARCHAR(512)  NULL COMMENT '展示映射/备注，用于前端显示',
    floor_code           VARCHAR(32)   NULL COMMENT '楼层，如 2F、B1F',
    room_base            VARCHAR(64)   NULL COMMENT '房间号主体，如 201',
    room_canonical       VARCHAR(128)  NULL COMMENT '归并展示键，如 2F-201',
    suite_suffix         VARCHAR(16)   NULL COMMENT '套间后缀 A/B',
    metric_kind_code     VARCHAR(64)   NULL COMMENT '指标类型，对应 telemetry_metric_kind.code',
    enabled              TINYINT(1)    NOT NULL DEFAULT 1,
    sort_order           INT           NOT NULL DEFAULT 0,
    created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_telemetry_watchlist_tag_bundle
        FOREIGN KEY (bundle_id) REFERENCES telemetry_watchlist_bundle (id) ON DELETE CASCADE,
    KEY idx_telemetry_watchlist_tag_bundle_order (bundle_id, sort_order, id),
    UNIQUE KEY uk_bundle_var (bundle_id, wincc_variable_name(190))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='单套测点下的变量行';
