CREATE TABLE IF NOT EXISTS exam_paper (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED',
  created_by VARCHAR(64) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uk_exam_paper_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exam_paper_section (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  paper_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NULL,
  KEY idx_exam_section_paper (paper_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exam_paper_question (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  paper_id BIGINT NOT NULL,
  section_id BIGINT NOT NULL,
  question_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL,
  required TINYINT NOT NULL DEFAULT 0,
  options_json TEXT NULL,
  show_when_json TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  config_json TEXT NULL,
  created_at DATETIME NULL,
  KEY idx_exam_question_paper (paper_id),
  KEY idx_exam_question_section (section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
