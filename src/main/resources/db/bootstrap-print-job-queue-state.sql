-- print_job 增加「队列状态」列。
--
-- 三态，NULL 是有意义的第三态，绝不能把「不知道」写成「不在队列里」：
--   QUEUED  = 此刻确实还排在那台打印机队列里
--   CLEARED = 已不在队列（打完了 / 被撤销了 / 队列被清了）
--   NULL    = 未核对过，或不适用（如 KIOSK 工位、老数据）
--
-- 为什么要区分 NULL 和 CLEARED：CUPS 队列被停用时 lp 仍返回退出码 0，
-- 任务其实卡在队列里没打。此时若把「没查到队列」当成 CLEARED，就会把
-- 卡住的任务误判成已完成，事故重演。只有真去问过队列、确认不在了，才写 CLEARED。
--
-- 刻意不加 NOT NULL / DEFAULT：默认值会强行给旧行和未核对行安一个假状态。
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_job' AND COLUMN_NAME = 'queue_state') = 0,
  'ALTER TABLE print_job ADD COLUMN queue_state VARCHAR(16) NULL COMMENT ''QUEUED=还在打印机队列里 / CLEARED=已不在 / NULL=未核对或不适用''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
