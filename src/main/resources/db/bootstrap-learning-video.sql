-- 学习视频库：文件本体复用 /api/upload 落盘，这里只登记标题与播放规则。
-- 播放规则均按视频单独配置（管理端「视频学习」页可改）。
CREATE TABLE IF NOT EXISTS learning_video (
    id                  BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(255) NOT NULL,
    file_url            VARCHAR(500) NOT NULL COMMENT '播放地址（/api/upload/files/...）',
    file_record_id      BIGINT       NULL COMMENT 'upload_file_record.id',
    duration_seconds    INT          NOT NULL DEFAULT 0 COMMENT '0=未知，学生首次播放后回填',
    size_bytes          BIGINT       NOT NULL DEFAULT 0,
    allow_seek          TINYINT      NOT NULL DEFAULT 1 COMMENT '1=允许拖动进度条',
    remember_position   TINYINT      NOT NULL DEFAULT 1 COMMENT '1=记住上次播放位置',
    require_full_watch  TINYINT      NOT NULL DEFAULT 0 COMMENT '1=未看完下次必须从头播放',
    complete_threshold  INT          NOT NULL DEFAULT 95 COMMENT '完成判定：累计观看达到时长的百分比',
    active              TINYINT      NOT NULL DEFAULT 1 COMMENT '1=上架（学生可见） 0=下架',
    sort_order          INT          NOT NULL DEFAULT 0,
    created_by          VARCHAR(50)  NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_learning_video_active (active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学习视频库';
