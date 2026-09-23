-- ref_order_line.delivery_cycle（下单时自购物车快照的目标到货周期）
-- 占用统计按它求和：某规格在某周期的已用量 = 购物车行 + 已下单行里 delivery_cycle 等于该周期的。
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
ALTER TABLE ref_order_line ADD COLUMN delivery_cycle DATE NULL COMMENT '目标到货周期（预计到货日），下单时自购物车快照';
