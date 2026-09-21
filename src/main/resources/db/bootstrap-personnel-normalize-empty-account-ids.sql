-- 加唯一索引前先把空字符串账号 id 规范成 NULL（唯一索引允许多个 NULL，但不允许多个 ''）
UPDATE personnel SET aro_user_id = NULLIF(aro_user_id, ''), staff_id = NULLIF(staff_id, '') WHERE aro_user_id = '' OR staff_id = '';
