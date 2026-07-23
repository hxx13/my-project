-- 人脸验证审计表（路线 B 服务端 1:1，含抓拍/底库图 URL）
-- 目标库 twin_system：启动应用前或上线时执行本脚本

CREATE TABLE IF NOT EXISTS face_verify_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL COMMENT '人员ID',
    session_id VARCHAR(128) COMMENT '验证会话ID',
    matched TINYINT NOT NULL COMMENT '是否通过',
    similarity DOUBLE COMMENT '最高相似度',
    match_threshold DOUBLE COMMENT '通过阈值',
    reject_threshold DOUBLE COMMENT '拒绝阈值',
    model_version VARCHAR(64) COMMENT '模型版本',
    challenge_action VARCHAR(32) COMMENT '活体动作',
    source VARCHAR(32) COMMENT '来源 gate/personal/pip',
    baseline_count INT COMMENT '底库张数',
    best_baseline_id BIGINT COMMENT '最佳匹配底库ID',
    probe_face_detected TINYINT COMMENT '抓拍是否检测到人脸',
    probe_image_urls TEXT COMMENT '比对抓拍图 URL 列表 JSON',
    best_baseline_image_url VARCHAR(512) COMMENT '最佳匹配底库图 URL',
    top_sims_json VARCHAR(256) COMMENT 'Top 相似度 JSON 数组',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_user_id (user_id),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人脸验证审计';
