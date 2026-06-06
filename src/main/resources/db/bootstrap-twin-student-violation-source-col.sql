-- 学生违规表：新增来源字段
-- 此脚本可能因列已存在而失败（setContinueOnError=false），不影响其他 bootstrap 脚本
ALTER TABLE twin_student_violation
  ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'MANUAL'
  COMMENT '来源：MANUAL=手动新建, AUTO_STRANDED=自动滞留检测';
