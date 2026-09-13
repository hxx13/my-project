-- 区域审核：把「谁能审核」收进矩阵（架构设计 §8 的第二层，此前一直缺这一列）。
--
-- 语义（2026-09-13 定）：**分了区域就自带审核权**。
--   ① 矩阵把本能力默认勾给饲养组长 → 这类身份有资格审；
--   ② 作用域由 cage_region_grant 的 LEADER 行推导（CageRegionGrantService.canReview）；
--   ③ 饲养组长还能在「我的区域 → 组员 → 模式权限」里把本能力**逐人下放**给组员
--      （走 CagePermissionService.LEADER_GRANTABLE，与「代认领」同一机制，不受身份上限约束）。
-- 所以「审核人归属」不再需要单独按人配区域——它从区域分配推导出来。
--
-- 幂等：INSERT IGNORE（能力注册表只靠种子 SQL 维护，页面不做增删改）。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.review.region', '区域审核', 'STAFF', 100);

-- 默认自带：勾给饲养组长。其余身份要审，只能由组长下放或超管在矩阵里另勾。
INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.review.region', 'BREEDING_GROUP_LEADER');
