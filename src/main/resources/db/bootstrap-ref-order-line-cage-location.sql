-- ref_order_line.target_cage_location（下单那一刻的笼位坐标快照）
-- 订单要能回答「这单下到哪个校区/房间/笼架的哪个位置」；笼位后续被搬动不该改历史单，所以是快照。
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
ALTER TABLE ref_order_line ADD COLUMN target_cage_location JSON NULL COMMENT '笼位坐标快照 {animalCageId,campusName,areaName,floorName,roomName,shelveId,shelveName,shelfIndexId,positionX,positionY}';
