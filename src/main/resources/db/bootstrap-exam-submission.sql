-- 答卷（人×卷）：答题结果 + 自动评分。一人对一卷只留一份（重交覆盖）。
CREATE TABLE IF NOT EXISTS exam_submission (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  paper_id BIGINT NOT NULL,
  person_id VARCHAR(64) NOT NULL COMMENT 'aro_user_id',
  answers_json TEXT NULL,
  score_json TEXT NULL COMMENT '每题 {correct, earned}',
  total_score DECIMAL(10,2) NULL COMMENT '得分',
  qualify_score_snapshot INT NULL COMMENT '快照的及格分',
  qualify_yn TINYINT NOT NULL DEFAULT 0 COMMENT '0未合格 1合格',
  files_json TEXT NULL COMMENT '上传文件引用',
  submitted_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uk_submission_paper_person (paper_id, person_id),
  KEY idx_submission_paper (paper_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
