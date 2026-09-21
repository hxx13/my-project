-- print_job 增加「队列状态」列。
--
--   QUEUED  = 此刻确实还排在那台打印机队列里
--   CLEARED = 已不在队列（打完了 / 被撤销了 / 队列被清了）
--   NULL    = 未核对过，或不适用（如 KIOSK 工位、老数据）
--
-- NULL 是有意义的第三态：绝不能把「不知道」写成不在队列里。CUPS 队列被停用时
-- lp 仍返回退出码 0，任务其实卡在队列里；若把「没查到队列」当成 CLEARED，
-- 就会把卡住的任务误判成已完成，事故重演。只有真去问过队列、确认不在了才写 CLEARED。
--
-- 刻意不加 NOT NULL / DEFAULT：默认值会强行给旧行和未核对行安一个假状态。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-job-queue-state.sql（先查 information_schema
-- 再 ALTER）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_job
    ADD COLUMN queue_state VARCHAR(16) NULL COMMENT 'QUEUED=还在打印机队列里 / CLEARED=已不在 / NULL=未核对或不适用';
