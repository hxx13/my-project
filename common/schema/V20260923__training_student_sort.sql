-- 培训系列：学生端手动排序序号（同校区内升序）
ALTER TABLE training ADD COLUMN student_sort INT NOT NULL DEFAULT 0 COMMENT '学生端排序序号';
