-- 学习视频观看进度：每人每视频一行。
-- watched_seconds 由学生端心跳累加（禁止快进的视频会丢弃大跨度上报），完成判定按视频配置的阈值算。
CREATE TABLE IF NOT EXISTS learning_video_progress (
    id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    person_id         VARCHAR(50) NOT NULL,
    video_id          BIGINT      NOT NULL,
    position_seconds  INT         NOT NULL DEFAULT 0 COMMENT '上次播放位置，用于续播',
    watched_seconds   INT         NOT NULL DEFAULT 0 COMMENT '累计有效观看秒数',
    duration_seconds  INT         NOT NULL DEFAULT 0,
    completed         TINYINT     NOT NULL DEFAULT 0,
    last_watched_at   DATETIME    NULL,
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_learning_video_progress (person_id, video_id),
    KEY idx_learning_video_progress_video (video_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学习视频观看进度';
