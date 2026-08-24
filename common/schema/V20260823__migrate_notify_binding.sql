-- ① 回填 personnel_notify_binding:每人的三个渠道各一行,值按 su_staff → ap_student → su_student 优先级取第一个非空。
--    id 由 personnel.id(主键)锚定;UNIQUE 冲突用 INSERT IGNORE 保证幂等、不覆盖已迁移值。
INSERT IGNORE INTO personnel_notify_binding (personnel_id, channel_code, target_value)
SELECT p.id, ch.code, ch.target
FROM personnel p
JOIN (
  SELECT 'EMAIL' AS code, p2.id AS pid,
         COALESCE(NULLIF(su_s.contact_email,''), NULLIF(ap.contact_email,''), NULLIF(su_a.contact_email,'')) AS target
  FROM personnel p2
  LEFT JOIN sys_user su_s ON su_s.id = p2.staff_id
  LEFT JOIN aro_personnel ap ON ap.user_id = p2.aro_user_id
  LEFT JOIN sys_user su_a ON su_a.id = p2.aro_user_id
  UNION ALL
  SELECT 'SERVER_CHAN', p3.id,
         COALESCE(NULLIF(su_s.send_key,''), NULLIF(ap.send_key,''), NULLIF(su_a.send_key,''))
  FROM personnel p3
  LEFT JOIN sys_user su_s ON su_s.id = p3.staff_id
  LEFT JOIN aro_personnel ap ON ap.user_id = p3.aro_user_id
  LEFT JOIN sys_user su_a ON su_a.id = p3.aro_user_id
  UNION ALL
  SELECT 'WXPUSHER', p4.id,
         COALESCE(NULLIF(su_s.wx_pusher_uid,''), NULLIF(ap.wx_pusher_uid,''), NULLIF(su_a.wx_pusher_uid,''))
  FROM personnel p4
  LEFT JOIN sys_user su_s ON su_s.id = p4.staff_id
  LEFT JOIN aro_personnel ap ON ap.user_id = p4.aro_user_id
  LEFT JOIN sys_user su_a ON su_a.id = p4.aro_user_id
) ch ON ch.pid = p.id
WHERE ch.target IS NOT NULL AND ch.target != '';

-- ② user_notify_mute 迁 personnel.id:先按 (personnel.id, source_code) 合并去重,再改 key。
--    合并契约:结果不得比任何一行更宽松(任一渠道静默则静默、源级任一关闭则关闭)。
CREATE TEMPORARY TABLE tmp_mute_merge AS
SELECT
  CAST(p.id AS CHAR) AS new_user_id,
  m.source_code,
  MIN(m.enabled)          AS enabled,
  MAX(m.mute_email)       AS mute_email,
  MAX(m.mute_server_chan) AS mute_server_chan,
  MAX(m.mute_wxpusher)    AS mute_wxpusher
FROM user_notify_mute m
JOIN personnel p ON (p.staff_id = m.user_id OR p.aro_user_id = m.user_id)
GROUP BY p.id, m.source_code;

DELETE m FROM user_notify_mute m
JOIN personnel p ON (p.staff_id = m.user_id OR p.aro_user_id = m.user_id);

INSERT INTO user_notify_mute (user_id, source_code, enabled, mute_email, mute_server_chan, mute_wxpusher)
SELECT new_user_id, source_code, enabled, mute_email, mute_server_chan, mute_wxpusher
FROM tmp_mute_merge;

DROP TEMPORARY TABLE tmp_mute_merge;
