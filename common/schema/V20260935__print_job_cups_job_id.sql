-- print_job 增加「CUPS 作业号」列。
--
-- 后端直发（print_station.mode=SERVER）时后端自己跑 lp 把 PDF 交给本机打印队列
-- （生产上是 CUPS），lp 成功时会把作业号打到 stdout（形如 172.22.138.6-124），
-- 提交时抓下来存这里，用于事后精确撤销某一条（cancel <job-id>）。
--
-- 背景：2026-09 CUPS 队列被停用后 lp 仍返回退出码 0，系统把任务标成 PRINTED、
-- 界面显示派发成功，实际一张纸没出来，70 条卡在队列里的任务前端无从撤销。
--
-- 只有直发工位（SERVER）会有值；KIOSK 走浏览器打印，拿不到作业号，保持 NULL。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-job-cups-job-id.sql（先查 information_schema
-- 再 ALTER）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_job
    ADD COLUMN cups_job_id VARCHAR(64) NULL COMMENT 'CUPS 作业号，形如 172.22.138.6-124；只有直发工位会有';
