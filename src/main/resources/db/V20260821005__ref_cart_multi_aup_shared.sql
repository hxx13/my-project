-- 动物订购：多 AUP + 课题组共享购物车（归档；运行时由 ReferenceDataSchemaMigrator 幂等补齐）
-- 同 common/schema/V20260821005__ref_cart_multi_aup_shared.sql

ALTER TABLE ref_cart
    ADD COLUMN IF NOT EXISTS aup_record_id BIGINT NULL
    COMMENT '加购锁定的 AUP → aup_record.id' AFTER ref_data_id;

ALTER TABLE ref_cart
    ADD COLUMN IF NOT EXISTS package_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    COMMENT 'DRAFT|READY 实验员订单包状态（非正式单）' AFTER remark;

ALTER TABLE ref_cart
    ADD COLUMN IF NOT EXISTS package_remark VARCHAR(500) NULL
    COMMENT '实验员提交订单包时的统一备注' AFTER package_status;

CREATE INDEX IF NOT EXISTS idx_cart_aup ON ref_cart (aup_record_id);
CREATE INDEX IF NOT EXISTS idx_cart_package ON ref_cart (group_id, package_status);

ALTER TABLE ref_order_line
    ADD COLUMN IF NOT EXISTS aup_record_id BIGINT NULL
    COMMENT '行级 AUP 合规归因 → aup_record.id' AFTER added_by;

CREATE INDEX IF NOT EXISTS idx_line_aup ON ref_order_line (aup_record_id);

UPDATE ref_order_line l
INNER JOIN ref_order o ON o.id = l.order_id
SET l.aup_record_id = o.aup_record_id
WHERE l.aup_record_id IS NULL
  AND o.aup_record_id IS NOT NULL;

DELETE FROM ref_cart WHERE aup_record_id IS NULL;
