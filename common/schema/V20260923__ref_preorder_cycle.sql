-- 归档迁移：预约下单 + 每周期库存上限（目标到货周期 / 预约单标记）
-- 与 src/main/resources/db/bootstrap-ref-cart-delivery-cycle.sql、
--    src/main/resources/db/bootstrap-ref-order-line-delivery-cycle.sql、
--    src/main/resources/db/bootstrap-ref-order-preorder.sql 同源。
-- 手动执行：三条各自独立，已存在的那条报「重复列」可忽略。
--
-- 为什么需要：
--   1) 周期不是实体表，就是 ETA 策略算出来的一个预计到货日；行上记 target cycle 才能
--      按 (规格, 周期) 统计已用量。占用 = 购物车行 + 已下单行两侧求和，所以「每周期自动重置」
--      不需要任何重置任务 —— 新周期就是新 key。
--   2) 预约单标记要永久保留，不能靠「房间/笼位为空」之类的推断（那是取走的形态）。
ALTER TABLE ref_cart ADD COLUMN delivery_cycle DATE NULL COMMENT '本行目标到货周期（预计到货日）；NULL=未选，按当前周期处理';
ALTER TABLE ref_order_line ADD COLUMN delivery_cycle DATE NULL COMMENT '目标到货周期（预计到货日），下单时自购物车快照';
ALTER TABLE ref_order ADD COLUMN is_preorder TINYINT NOT NULL DEFAULT 0 COMMENT '预约单标记：1=下单时目标周期晚于当时当前周期。永久保留（含已完成）';
