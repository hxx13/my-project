-- 打印工位：一工位 = 一台电脑 + 一台打印机 + 一个专用账号。
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 在启动时执行，幂等。
CREATE TABLE IF NOT EXISTS print_station (
    id         VARCHAR(36)  NOT NULL,
    name       VARCHAR(128) NOT NULL COMMENT '工位名，如「斑马卡牌机」',
    user_id    VARCHAR(50)  NOT NULL COMMENT '工位专用账号的 user.id',
    page_size  VARCHAR(64)  NULL COMMENT '打印页 @page size，如 85.6mm 54mm；NULL=用驱动默认',
    enabled    TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '停用后不派任务、不进下拉',
    created_by VARCHAR(50)  NULL COMMENT '建单人的 user.id',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_print_station_user (user_id),
    KEY idx_print_station_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='打印工位'
