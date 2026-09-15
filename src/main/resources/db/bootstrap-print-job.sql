-- 打印任务：一条 = 一次打印请求。
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 在启动时执行，幂等。
CREATE TABLE IF NOT EXISTS print_job (
    id          VARCHAR(36)  NOT NULL,
    station_id  VARCHAR(36)  NOT NULL COMMENT 'print_station.id',
    source_type VARCHAR(32)  NOT NULL COMMENT 'CARD_ARCHIVE / ADMIN_FILE',
    source_id   VARCHAR(64)  NOT NULL COMMENT '归档 id 或文件 id',
    file_name   VARCHAR(512) NOT NULL DEFAULT '' COMMENT '展示与回执用的文件名快照',
    copies      INT          NOT NULL DEFAULT 1,
    status      VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/SENT/PRINTED/FAILED',
    attempts    INT          NOT NULL DEFAULT 0,
    last_error  VARCHAR(512) NULL,
    created_by  VARCHAR(50)  NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at     DATETIME     NULL,
    printed_at  DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_print_job_station_status (station_id, status),
    KEY idx_print_job_status_sent (status, sent_at),
    KEY idx_print_job_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='打印任务';
