-- 新增交互式违规确认字段：非空时扫码弹窗显示拼图交互
ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge VARCHAR(128) NULL COMMENT '交互确认短语；null=普通公告';
