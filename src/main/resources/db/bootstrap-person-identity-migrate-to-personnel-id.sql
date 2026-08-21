-- ============================================================
-- person_identity.user_id 语义迁移：staff_id → personnel.id
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 自动幂等执行
-- 迁移标记：迁移后 user_id 为纯数字（personnel.id）；未迁移的旧值为 STAFF_ 前缀。
-- ============================================================

-- ① 去重（幂等）：同一 (personnel.id, tag_id) 保留最早一条，防同名合并后同人同标签撞唯一键 uk_person_identity(user_id, tag_id)
DELETE pi FROM person_identity pi
JOIN person_identity pi2
  ON pi2.user_id = pi.user_id AND pi2.tag_id = pi.tag_id AND pi2.id < pi.id;

-- ② 改写 key：staff_id → personnel.id（LIKE 'STAFF\_%' 作未迁移标记，保证幂等，重复执行只处理残留旧值）
UPDATE person_identity pi
JOIN personnel p ON p.staff_id = pi.user_id
SET pi.user_id = CAST(p.id AS CHAR)
WHERE pi.user_id LIKE 'STAFF\_%';
