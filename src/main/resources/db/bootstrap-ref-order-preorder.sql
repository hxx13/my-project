-- ref_order.is_preorder（预约单标记）
-- 预约单 = 目标到货周期晚于「下单那一刻的当前周期」的单。
-- 标记**永久保留**（含已完成）：审核页要能一直显示「这单当初是预约单」。
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
ALTER TABLE ref_order ADD COLUMN is_preorder TINYINT NOT NULL DEFAULT 0 COMMENT '预约单标记：1=下单时目标周期晚于当时当前周期。永久保留（含已完成）';
