ALTER TABLE twin_exp_record
    ADD COLUMN anomaly_flag TINYINT NOT NULL DEFAULT 0 COMMENT '异常标记: 0=正常 1=可疑',
    ADD COLUMN anomaly_types VARCHAR(256) DEFAULT NULL COMMENT '异常类型(逗号分隔): OVER_CAP,CROSS_DAY,NIGHT_HOURS',
    ADD COLUMN review_status TINYINT NOT NULL DEFAULT 0 COMMENT '审核状态: 0=待审核 1=已批准 2=已驳回',
    ADD COLUMN reviewed_by VARCHAR(64) DEFAULT NULL COMMENT '审核人',
    ADD COLUMN reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间',
    ADD COLUMN review_note VARCHAR(512) DEFAULT NULL COMMENT '审核备注',
    ADD COLUMN feed_source VARCHAR(64) DEFAULT NULL COMMENT '来源渠道(WEB_SCAN/TWIN_AUTO_SIGNOUT/…)',
    ADD COLUMN session_duration_minutes INT DEFAULT NULL COMMENT '会话停留时长(分钟)';

ALTER TABLE twin_exp_record
    ADD INDEX idx_er_anomaly (anomaly_flag),
    ADD INDEX idx_er_review (review_status);
