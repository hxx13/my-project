-- 试卷文件夹：独立实体表 + exam_paper 归属外键列（NULL=未分类）。
-- 用 folder_id 而非 folder 字符串：重命名文件夹不破坏归属，删除文件夹时先置空其下试卷。

CREATE TABLE IF NOT EXISTS exam_paper_folder (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE exam_paper
    ADD COLUMN IF NOT EXISTS folder_id BIGINT NULL
    COMMENT '归属文件夹 FK→exam_paper_folder.id；NULL=未分类';
