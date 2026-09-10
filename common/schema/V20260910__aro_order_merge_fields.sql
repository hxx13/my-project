-- 把 ARO 原站订单并入本地订单库：补齐 ARO 侧有、本地没有的字段。
--   复用已有列（不重复建字段）：
--     领用人       → ref_order_line.collector_name
--     领用方式/房间 → ref_order_line.pickup_room_name
--     备注         → ref_order_line.line_remark（ARO 的 item memo）
--     ARO 的 collector_tel 全表为空，不迁。
-- 新增列：
--   ref_order.sn             ARO 订单号（本地自建单为空），导入幂等键
--   ref_order.source         LOCAL | ARO，区分来源
--   ref_order.aro_area_name  ARO 原文校区名（本地 campus 是浦东/浦西枚举，原文另存）
--   ref_order_line.supplier_name / strain_name / spec_name  ARO 打平的结构化品名
--   ref_order_line.arrival_date  实际到货日期（本地另存 estimated_delivery_date 为预计）
-- 运行时由 ReferenceDataSchemaMigrator.ensureColumnExists 幂等加列；本文件为 Flyway 归档。

ALTER TABLE ref_order
    ADD COLUMN sn VARCHAR(64) NULL COMMENT 'ARO 订单号；本地自建单为空，导入幂等键' AFTER id,
    ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'LOCAL' COMMENT '来源：LOCAL|ARO' AFTER sn,
    ADD COLUMN aro_area_name VARCHAR(50) NULL COMMENT 'ARO 原文校区名' AFTER campus,
    ADD UNIQUE KEY uk_order_source_sn (source, sn);

ALTER TABLE ref_order_line
    ADD COLUMN supplier_name VARCHAR(100) NULL COMMENT '供应商（ARO 打平结构化）' AFTER ref_data_id,
    ADD COLUMN strain_name VARCHAR(50) NULL COMMENT '品系（ARO 打平结构化）' AFTER supplier_name,
    ADD COLUMN spec_name VARCHAR(50) NULL COMMENT '规格（ARO 打平结构化）' AFTER strain_name,
    ADD COLUMN arrival_date VARCHAR(30) NULL COMMENT '实际到货日期' AFTER unit_price;
