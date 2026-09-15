-- print_job 增加「临时任务」标记：临时打印产生的任务只有发起人自己看得到。
--
-- 0 = 普通任务，所有人可见；1 = 临时任务，仅 created_by 本人可见。
-- 历史存量任务一律默认 0（可见）—— 加列前建的任务无法回溯判断，宁可多露不误藏。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-job-ephemeral.sql（先查 information_schema
-- 再 ALTER）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_job
    ADD COLUMN ephemeral TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=临时任务，仅发起人可见';
