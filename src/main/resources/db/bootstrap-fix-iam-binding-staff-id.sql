-- IAM 绑定落点修正:把指向 aro_user_id 的绑定改指同人的 staff_id(staff_id 优先)。
-- 幂等:改写后 user_id=staff_id(STAFF_ 前缀),不再匹配 aro_user_id,重复执行不产生变更。
UPDATE user_auth_binding uab
JOIN personnel p ON p.aro_user_id = uab.user_id
SET uab.user_id = p.staff_id
WHERE p.staff_id IS NOT NULL AND p.staff_id != ''
  AND uab.unbound_at IS NULL;
