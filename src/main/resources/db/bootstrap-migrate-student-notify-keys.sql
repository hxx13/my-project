-- 学生通知 key 从 aro_personnel 迁到 sys_user（与 common/schema/V20260817 同源，幂等）。
UPDATE sys_user su
INNER JOIN aro_personnel ap ON su.id = ap.user_id
SET su.contact_email  = IF(su.contact_email  IS NULL OR su.contact_email  = '', ap.contact_email,  su.contact_email),
    su.send_key      = IF(su.send_key      IS NULL OR su.send_key      = '', ap.send_key,      su.send_key),
    su.wx_pusher_uid = IF(su.wx_pusher_uid IS NULL OR su.wx_pusher_uid = '', ap.wx_pusher_uid, su.wx_pusher_uid)
WHERE (ap.contact_email IS NOT NULL AND ap.contact_email != '')
   OR (ap.send_key IS NOT NULL AND ap.send_key != '')
   OR (ap.wx_pusher_uid IS NOT NULL AND ap.wx_pusher_uid != '');
