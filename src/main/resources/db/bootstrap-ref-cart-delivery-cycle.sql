-- ref_cart.delivery_cycle（本行目标到货周期 = 一个预计到货日）
-- 周期不是实体表，就是 ETA 策略算出来的一个 DATE。NULL = 未选（旧客户端），按当前周期处理。
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
ALTER TABLE ref_cart ADD COLUMN delivery_cycle DATE NULL COMMENT '本行目标到货周期（预计到货日）；NULL=未选，按当前周期处理';
