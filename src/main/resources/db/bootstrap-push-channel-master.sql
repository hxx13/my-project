CREATE TABLE IF NOT EXISTS push_channel_master (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    channel_code VARCHAR(32) NOT NULL UNIQUE,
    enabled TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO push_channel_master (channel_code, enabled) VALUES ('EMAIL', 1), ('SERVER_CHAN', 1), ('WXPUSHER', 1);
