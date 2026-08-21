-- 期 2 后续：存量 ACTIVE 违规回填为 twin_obligation（可重复执行）
-- 运行时优先走 AdminObligationController POST /backfill-violations；本文件作归档与手工补跑。

INSERT IGNORE INTO twin_obligation (
    subject_user_id, source_type, source_id, title, content_html,
    disposition_type, disposition_config_json, status, due_at
)
SELECT
    v.target_user_id,
    'STUDENT_VIOLATION',
    CAST(v.id AS CHAR),
    CASE
        WHEN v.interactive_challenge IS NOT NULL AND TRIM(v.interactive_challenge) <> ''
            THEN '违规交互确认'
        ELSE '违规提醒'
    END,
    v.violation_text,
    CASE
        WHEN v.interactive_challenge IS NOT NULL AND TRIM(v.interactive_challenge) <> ''
            THEN 'ACK_PUZZLE'
        ELSE 'SHOW_ONLY'
    END,
    CASE
        WHEN v.interactive_challenge IS NOT NULL AND TRIM(v.interactive_challenge) <> ''
            THEN JSON_OBJECT('phrase', v.interactive_challenge)
        ELSE NULL
    END,
    CASE
        WHEN v.interactive_challenge_verified_at IS NOT NULL THEN 'COMPLETED'
        ELSE 'PENDING_DISPOSITION'
    END,
    v.expire_at
FROM twin_student_violation v
WHERE v.status = 'ACTIVE'
  AND v.target_user_id IS NOT NULL
  AND TRIM(v.target_user_id) <> '';
