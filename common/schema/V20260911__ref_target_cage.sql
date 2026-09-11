-- 归档迁移：订购行挂笼位（与 src/main/resources/db/bootstrap-ref-*.sql 同源）。
-- 手动执行：三条各自独立，已存在的那条报「重复列」可忽略。
ALTER TABLE ref_cart ADD COLUMN target_animal_cage_id BIGINT NULL COMMENT '本行锁定的笼位ID → cage_order_reservation.animal_cage_id';
ALTER TABLE ref_order_line ADD COLUMN target_animal_cage_id BIGINT NULL COMMENT '本行锁定的笼位ID（下单时自购物车快照）';
ALTER TABLE ref_order_line ADD COLUMN target_cage_location JSON NULL COMMENT '笼位坐标快照 {animalCageId,campusName,areaName,floorName,roomName,shelveId,shelveName,shelfIndexId,positionX,positionY}';
