-- 学生端通知表：添加 content 列存储完整 HTML 正文（含图片）
-- summary 保留为短摘要，content 存完整富文本内容
ALTER TABLE sys_student_notification
    ADD COLUMN content MEDIUMTEXT COMMENT '完整通知内容（HTML，含图片）' AFTER summary;
