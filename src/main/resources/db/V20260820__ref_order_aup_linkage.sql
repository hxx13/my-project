-- 订购订单挂 AUP + 个人归属（本地串联：个人→课题组→AUP）
-- 运行时实际由 ReferenceDataSchemaMigrator.ensureColumnExists 幂等补齐，本文件为归档迁移。

ALTER TABLE ref_order
    ADD COLUMN IF NOT EXISTS project_group_id BIGINT NULL
    COMMENT '课题组主键外键 → project_group.id' AFTER project_group_name;

ALTER TABLE ref_order
    ADD COLUMN IF NOT EXISTS aup_record_id BIGINT NULL
    COMMENT '下单选定的 AUP → aup_record.id' AFTER project_group_id;

ALTER TABLE ref_order
    ADD COLUMN IF NOT EXISTS register_no VARCHAR(64) NULL
    COMMENT 'AUP 编号冗余快照' AFTER aup_record_id;

ALTER TABLE ref_order_line
    ADD COLUMN IF NOT EXISTS added_by VARCHAR(100) NULL
    COMMENT '加购人（个人归属，从 ref_cart.added_by 复制）' AFTER line_remark;
