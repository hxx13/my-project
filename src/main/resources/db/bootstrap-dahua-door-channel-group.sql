-- ============================================================
-- 门禁通道编组：把常用的一组门禁存下来做批量操作
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 自动幂等执行
-- ============================================================
CREATE TABLE IF NOT EXISTS dahua_door_channel_group (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(64)  NOT NULL COMMENT '编组名称',
    channel_codes TEXT         NOT NULL COMMENT '通道编码，逗号分隔',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_door_channel_group_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '门禁通道编组';
