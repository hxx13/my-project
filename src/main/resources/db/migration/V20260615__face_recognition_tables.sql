-- V20260615__face_recognition_tables.sql
-- 人脸识别调试 + 底库管理

CREATE TABLE IF NOT EXISTS face_debug_photo (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(255) COMMENT '标签',
    storage_key VARCHAR(512) NOT NULL COMMENT '存储路径',
    public_url VARCHAR(1024) COMMENT '公开访问URL',
    original_name VARCHAR(512) COMMENT '原始文件名',
    mime_type VARCHAR(128) COMMENT 'MIME类型',
    size_bytes BIGINT COMMENT '文件大小',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人脸调试照片';

CREATE TABLE IF NOT EXISTS face_baseline (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL COMMENT '人员ID',
    face_image_url VARCHAR(1024) NOT NULL COMMENT '底库照片URL',
    storage_key VARCHAR(512) NOT NULL COMMENT '存储路径',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人脸底库照片（一人多张）';
