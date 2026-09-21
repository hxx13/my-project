-- print_job 增加「CUPS 作业号」列。
--
-- 后端直发（print_station.mode=SERVER）时，后端自己跑 lp 把 PDF 交给本机打印
-- 队列（生产上是 CUPS）。lp 成功时会把作业号打到 stdout，形如 172.22.138.6-124，
-- 提交时抓下来存这里。
--
-- 为什么要存它：2026-09 出过一次事故 —— CUPS 队列被停用后 lp 仍然返回退出码 0，
-- 系统把任务标成 PRINTED、界面显示「派发成功」，实际一张纸都没出来，70 条任务
-- 卡在 CUPS 里，而库里只有 PRINTED，前端连「撤销」都无从下手（不知道撤哪一条）。
-- 有了这个作业号才能用 cancel <job-id> 精确撤销某一条。
--
-- 只有直发工位会有值；KIOSK（工位电脑执行）走浏览器打印，拿不到 CUPS 作业号，
-- 保持 NULL。
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_job' AND COLUMN_NAME = 'cups_job_id') = 0,
  'ALTER TABLE print_job ADD COLUMN cups_job_id VARCHAR(64) NULL COMMENT ''CUPS 作业号，形如 172.22.138.6-124；只有直发工位会有''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
