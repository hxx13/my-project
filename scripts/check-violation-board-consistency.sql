-- 大屏「提醒公示」残留自检（只读，可安全在生产库执行）
--
-- 背景：主页大屏「提醒公示」实时查 twin_student_violation，
--       条件 status='ACTIVE' AND (expire_at IS NULL OR expire_at > NOW())，
--       且按 target_user_id 分组只取 MAX(id) —— 每人只显示最新一条。
--       而删除是逐条物理删除，所以「删掉最新一条 → 旧的顶上」看起来就像没删掉。

-- ① 同一人多条 ACTIVE：大屏只显示 id 最大的那条，删掉它之后旧记录会顶上来
SELECT target_user_id,
       COUNT(*)                       AS active_rows,
       GROUP_CONCAT(id ORDER BY id)   AS ids
FROM twin_student_violation
WHERE status = 'ACTIVE'
GROUP BY target_user_id
HAVING COUNT(*) > 1;

-- ② 永久公示：expire_at IS NULL 的记录永远不会下榜
SELECT id, target_user_id, cage_violation_id, created_at, source
FROM twin_student_violation
WHERE status = 'ACTIVE' AND expire_at IS NULL
ORDER BY id DESC;

-- ③ 卡死：已是 ACTIVE 但到期时间早已过去（大屏已过滤，管理端列表仍显示 ACTIVE）
SELECT id, target_user_id, expire_at, TIMESTAMPDIFF(DAY, expire_at, NOW()) AS overdue_days
FROM twin_student_violation
WHERE status = 'ACTIVE' AND expire_at IS NOT NULL AND expire_at <= NOW()
ORDER BY expire_at;

-- ④ 孤儿子记录：父记录已不存在，大屏会把它们聚成「未命名课题组」
SELECT c.id, c.target_user_id, c.cage_violation_id, c.status, c.created_at
FROM twin_student_violation c
LEFT JOIN twin_cage_status_violation p ON p.id = c.cage_violation_id
WHERE c.cage_violation_id IS NOT NULL AND p.id IS NULL;

-- ⑤ 大屏此刻实际会渲染的内容（与 selectActiveForDashboardBoard 同口径）
SELECT v.id, v.target_user_id, v.cage_violation_id, v.created_at, v.expire_at
FROM twin_student_violation v
WHERE v.status = 'ACTIVE'
  AND (v.expire_at IS NULL OR v.expire_at > NOW())
  AND v.id IN (
      SELECT MAX(id) FROM twin_student_violation
      WHERE status = 'ACTIVE' AND (expire_at IS NULL OR expire_at > NOW())
      GROUP BY target_user_id
  )
ORDER BY v.created_at DESC, v.id DESC LIMIT 100;

-- ⑥ 镜像通知是否随违规一起清干净（biz_type=STUDENT_VIOLATION 指向已删违规 = 残留）
SELECT n.id, n.biz_id, n.created_at
FROM sys_student_notification n
LEFT JOIN twin_student_violation v ON v.id = n.biz_id
WHERE n.biz_type = 'STUDENT_VIOLATION' AND v.id IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- 以下为清理段：不可逆（CLEARED / EXPIRED 都是软状态，记录仍在，可回溯）。
-- 请先跑上面 ②③ 看清清单，确认后再逐段执行，不要整文件一次跑。
-- ════════════════════════════════════════════════════════════════════

-- ⑦【预览】卡死的 ACTIVE（到期已过），将被置为 EXPIRED
-- SELECT id, target_user_id, expire_at FROM twin_student_violation
-- WHERE status='ACTIVE' AND expire_at IS NOT NULL AND expire_at <= NOW() AND id IN ( <上面③的id> );

-- ⑧ 执行：把卡死的 ACTIVE 置为 EXPIRED（大屏本来就已过滤它们，此举只为让管理端列表不再显示 ACTIVE）
-- UPDATE twin_student_violation
-- SET status='EXPIRED', updated_at=NOW()
-- WHERE status='ACTIVE' AND expire_at IS NOT NULL AND expire_at <= NOW();

-- ⑨【预览】永久公示（expire_at IS NULL）——这批只能靠人工判断该不该下榜
-- SELECT id, target_user_id, cage_violation_id, created_at FROM twin_student_violation
-- WHERE status='ACTIVE' AND expire_at IS NULL;

-- ⑩ 执行：把指定的永久公示下榜（把 <ids> 换成确认要清的 id，例如笼架批次 40 的整组）
-- UPDATE twin_student_violation
-- SET status='CLEARED', cleared_at=NOW(), cleared_by_user_id='ADMIN_BATCH_CLEANUP', updated_at=NOW()
-- WHERE status='ACTIVE' AND id IN ( <ids> );

-- ⑪ 清理由此残留的镜像通知（可选，手机端消息中心）
-- DELETE n FROM sys_student_notification n
-- LEFT JOIN twin_student_violation v ON v.id = n.biz_id
-- WHERE n.biz_type='STUDENT_VIOLATION' AND v.id IS NULL;
