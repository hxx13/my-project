-- 动物订购价格：价格配置存 ref_data.field_data（priceEnabled / price / specPrices），不动表结构。
--   priceEnabled : 该物品是否开启价格（每个物品单独开关）
--   price        : 无规格物品的单价（元）
--   specPrices   : 有规格物品按规格选项定价 {"性别: 雌性": 80, "性别: 雄性": 75}
--                  key 与 ref_cart.spec_selections.option / ref_order_line.spec_selections.option 同串。
-- ref_order_line.unit_price 存下单时的单价快照，物品后续改价不影响历史订单。
-- 运行时由 ReferenceDataSchemaMigrator.ensureColumnExists 幂等加列；本文件为 Flyway 归档。

ALTER TABLE ref_order_line
    ADD COLUMN unit_price DECIMAL(10,2) NULL COMMENT '下单时单价快照（元）' AFTER quantity;
