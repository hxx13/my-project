-- ref_order_line.pickup_mode（领用方式，下单时自购物车快照）
-- 审核页与 Excel 导出要能分辨「取走」与「饲养」；只看房间/笼位是否为空区分不了，
-- 因为历史单也可能丢快照。默认 FARM 让存量订单行沿用老语义。
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
ALTER TABLE ref_order_line ADD COLUMN pickup_mode VARCHAR(16) NOT NULL DEFAULT 'FARM' COMMENT '领用方式：FARM 饲养 / TAKE 取走（下单时自购物车快照）';
