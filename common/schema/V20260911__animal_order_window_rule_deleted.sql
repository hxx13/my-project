-- 动物订购：可购时段（animal_order_window_rule）新增软删除标志 deleted。
--   「删除」＝软删除后从管理端列表消失且不参与可购判定，但行保留（可恢复）；
--   与「停用」（active=0，列表里置灰显示、可重新开启）语义不同，故必须独立成列。
-- 运行时由 db/bootstrap-animal-order-time.sql 中 information_schema 守卫的幂等 ALTER 自愈；
-- 本文件为迁移归档，供全新库与审计对照。

ALTER TABLE animal_order_window_rule
    ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删除：1=已删除（管理端列表不可见，行保留）' AFTER active;
