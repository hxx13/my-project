-- 订购行挂笼位：加购时把订单行指向被预定的笼位。
-- 真相源是 cage_order_reservation（含竞态闸门），这列只便于展示与快照。
--
-- ⚠️ 本文件**只放一条 DDL**：启动链是 continueOnError(false) + 「已存在算 benign」，
-- 一条 ALTER 撞「列已存在」会让整个脚本中止，后面的语句永远不执行（2026-09-11 踩过：
-- 三条 ALTER 挤一个文件，第一条重跑撞已存在 → 第三条 target_cage_location 从没建上，
-- 查订单行报 Unknown column）。新增列请另开文件。
ALTER TABLE ref_cart ADD COLUMN target_animal_cage_id BIGINT NULL COMMENT '本行锁定的笼位ID → cage_order_reservation.animal_cage_id';
