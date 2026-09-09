-- 培训收藏订阅（幂等）
CREATE TABLE IF NOT EXISTS training_favorite (
  user_id VARCHAR(64) NOT NULL COMMENT 'sys_user.id（订阅人）',
  training_id BIGINT NOT NULL COMMENT '培训系列 id（training.id）',
  created_at DATETIME NULL,
  PRIMARY KEY (user_id, training_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训收藏订阅';
