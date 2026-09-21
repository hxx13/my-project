-- 转移三签：归属地 / 目的地 / 兽医 各签一条。
-- 仅归档记录，实际执行在 CageShelfSchemaMigrator（加列非幂等，靠吞重复列错误保证可重跑）。
ALTER TABLE cage_op_request
    ADD COLUMN signatures JSON NULL COMMENT '转移三签记录（ORIGIN/DEST/VET 各一条）' AFTER status;
