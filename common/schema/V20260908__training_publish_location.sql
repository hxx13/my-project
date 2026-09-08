-- 培训定时发布（publish_at）+ 地点预设库（training_location_preset）
ALTER TABLE training ADD COLUMN publish_at DATETIME NULL COMMENT '定时发布时间（到点自动 PUBLISHED）';

CREATE TABLE IF NOT EXISTS training_location_preset (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL COMMENT '地点名称',
  address VARCHAR(255) NOT NULL COMMENT '地点地址',
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训地点预设库';
