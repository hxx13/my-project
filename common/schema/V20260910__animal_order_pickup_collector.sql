-- 动物订购：选购时新增「领用方式/房间」与「领用人」两个字段。
--   领用方式恒为「房间」，取值到房间级（如 202A），不具体到笼架；房间树来自 cage_shelf_index 四级
--   （campus → area → floor → room），前端树状选择、必选。
--   领用人默认下单人本人；由下单人在选购时从【本课题组】人员中选，可留空表示本人。
-- 两字段在加购时写 ref_cart，正式提交时快照到 ref_order_line（购物车清空不影响历史单）。
-- 运行时由 ReferenceDataSchemaMigrator.ensureColumnExists 幂等加列；本文件为 Flyway 归档。

ALTER TABLE ref_cart
    ADD COLUMN pickup_room_id VARCHAR(64) NULL COMMENT '领用方式/房间：房间节点 id' AFTER quantity,
    ADD COLUMN pickup_room_name VARCHAR(255) NULL COMMENT '领用方式/房间：房间全路径名快照' AFTER pickup_room_id,
    ADD COLUMN collector_id VARCHAR(100) NULL COMMENT '领用人账号 id；空=下单人本人' AFTER pickup_room_name,
    ADD COLUMN collector_name VARCHAR(100) NULL COMMENT '领用人显示名快照' AFTER collector_id;

ALTER TABLE ref_order_line
    ADD COLUMN pickup_room_id VARCHAR(64) NULL COMMENT '领用方式/房间：房间节点 id' AFTER unit_price,
    ADD COLUMN pickup_room_name VARCHAR(255) NULL COMMENT '领用方式/房间：房间全路径名快照' AFTER pickup_room_id,
    ADD COLUMN collector_id VARCHAR(100) NULL COMMENT '领用人账号 id；空=下单人本人' AFTER pickup_room_name,
    ADD COLUMN collector_name VARCHAR(100) NULL COMMENT '领用人显示名快照' AFTER collector_id;
