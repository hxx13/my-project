-- ============================================================
-- 通知渠道模板种子 — 每次部署自动同步
-- 为每个信息源的 EMAIL/SERVER_CHAN/WXPUSHER 三条渠道写入默认模板
-- ============================================================

-- ACTIVATION_SUCCESS
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '激活成功 — {doorLabel}', '<h3>激活成功</h3><p>门禁 <b>{doorLabel}</b> 于 {swingTime} 刷卡激活成功。</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACTIVATION_SUCCESS'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '激活成功 — {doorLabel}', '## 激活成功\n门禁 **{doorLabel}**\n时间：{swingTime}\n\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACTIVATION_SUCCESS'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '激活成功 — {doorLabel}', '## 激活成功\n门禁 **{doorLabel}**\n时间：{swingTime}\n\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACTIVATION_SUCCESS'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- SIGNOUT_COUNTDOWN
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '签退倒计时 — {doorLabel}', '<h3>签退倒计时</h3><p><b>{doorLabel}</b> 已启动 <b>{countdownSeconds} 秒</b> 签退倒计时。</p><p>计划签退时间：{scheduledExitAt}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SIGNOUT_COUNTDOWN'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '签退倒计时 — {doorLabel}', '## 签退倒计时\n**{doorLabel}** 已启动 **{countdownSeconds} 秒** 签退倒计时\n计划签退：{scheduledExitAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SIGNOUT_COUNTDOWN'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '签退倒计时 — {doorLabel}', '## 签退倒计时\n**{doorLabel}** 已启动 **{countdownSeconds} 秒** 签退倒计时\n计划签退：{scheduledExitAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SIGNOUT_COUNTDOWN'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- MATERIAL_REQUESTED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '物资申领 — {applicantName}', '<h3>新物资申领</h3><p><b>{applicantName}</b>（{applicantGroup}）提交了物资申领：</p><p>{summary}</p><p style=''color:#666;font-size:12px''>提交时间：{createdAt}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'MATERIAL_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '物资申领 — {applicantName}', '## 新物资申领\n**{applicantName}**（{applicantGroup}）\n\n{summary}\n\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'MATERIAL_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '物资申领 — {applicantName}', '## 新物资申领\n**{applicantName}**（{applicantGroup}）\n\n{summary}\n\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'MATERIAL_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- MATERIAL_REVIEWED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '物资申领结果 — {auditResult}', '<h3>物资申领{auditResult}</h3><p><b>{applicantName}</b>，你的物资申领已<b>{auditResult}</b>。</p><p>{summary}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'MATERIAL_REVIEWED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '物资申领结果 — {auditResult}', '## 物资申领{auditResult}\n**{applicantName}**，你的物资申领已**{auditResult}**\n{summary}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'MATERIAL_REVIEWED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '物资申领结果 — {auditResult}', '## 物资申领{auditResult}\n**{applicantName}**，你的物资申领已**{auditResult}**\n{summary}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'MATERIAL_REVIEWED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- SCAN_DELAY_REQUESTED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '延迟免冻结申请 — {subjectName}', '<h3>新延迟免冻结申请</h3><p><b>{subjectName}</b>（{subjectGroup}）在 <b>{roomName}</b> 申请 <b>{optionLabel}</b>。</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '延迟免冻结申请 — {subjectName}', '## 新延迟免冻结申请\n**{subjectName}**（{subjectGroup}）\n{roomName} · {optionLabel}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '延迟免冻结申请 — {subjectName}', '## 新延迟免冻结申请\n**{subjectName}**（{subjectGroup}）\n{roomName} · {optionLabel}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- SCAN_DELAY_REVIEWED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '延迟免冻结结果 — {auditResult}', '<h3>延迟免冻结{auditResult}</h3><p><b>{roomName}</b> · {optionLabel}：<b>{auditResult}</b></p>{rejectReason}<hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_REVIEWED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '延迟免冻结结果 — {auditResult}', '## 延迟免冻结{auditResult}\n**{roomName}** · {optionLabel}\n审核结果：**{auditResult}**\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_REVIEWED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '延迟免冻结结果 — {auditResult}', '## 延迟免冻结{auditResult}\n**{roomName}** · {optionLabel}\n审核结果：**{auditResult}**\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_REVIEWED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- VIOLATION_CREATED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '违规提醒 — {title}', '<h3>{title}</h3><p>来源：{source}</p><p>{summary}</p><p>门禁限制：{enterLocked}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'VIOLATION_CREATED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '违规提醒 — {title}', '## {title}\n来源：{source}\n{summary}\n门禁限制：{enterLocked}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'VIOLATION_CREATED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '违规提醒 — {title}', '## {title}\n来源：{source}\n{summary}\n门禁限制：{enterLocked}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'VIOLATION_CREATED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- SCAN_DELAY_MANUAL
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '免冻结授权 — {roomName}', '<h3>免冻结已授权</h3><p>房间：<b>{roomName}</b></p><p>详情：{optionLabel}</p><p>操作人：{operatorName}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_MANUAL'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '免冻结授权 — {roomName}', '## 免冻结已授权\n房间：**{roomName}**\n详情：{optionLabel}\n操作人：{operatorName}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_MANUAL'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '免冻结授权 — {roomName}', '## 免冻结已授权\n房间：**{roomName}**\n详情：{optionLabel}\n操作人：{operatorName}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SCAN_DELAY_MANUAL'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- PURCHASE_REQUESTED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '采购申请 — {applicantName}', '<h3>新采购申请</h3><p><b>{applicantName}</b> 提交了采购申请。</p><p>采购地点：{location}</p><p>采购内容：{content}</p><p style=''color:#666;font-size:12px''>提交时间：{createdAt}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'PURCHASE_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '采购申请 — {applicantName}', '## 新采购申请\n**{applicantName}**\n采购地点：{location}\n采购内容：{content}\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'PURCHASE_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '采购申请 — {applicantName}', '## 新采购申请\n**{applicantName}**\n采购地点：{location}\n采购内容：{content}\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'PURCHASE_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- PURCHASE_COMPLETED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '采购办结 — {location}', '<h3>采购已办结</h3><p><b>{applicantName}</b>，你在 <b>{location}</b> 的采购申请已处理完毕。</p><p>{summary}</p><p>处理人：{processorName}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'PURCHASE_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '采购办结 — {location}', '## 采购已办结\n**{applicantName}**，你在 **{location}** 的采购申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'PURCHASE_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '采购办结 — {location}', '## 采购已办结\n**{applicantName}**，你在 **{location}** 的采购申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'PURCHASE_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- REPAIR_REQUESTED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '报修申请 — {applicantName}', '<h3>新报修申请</h3><p><b>{applicantName}</b> 提交了报修申请。</p><p>报修地点：{location}</p><p>报修内容：{content}</p><p style=''color:#666;font-size:12px''>提交时间：{createdAt}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'REPAIR_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '报修申请 — {applicantName}', '## 新报修申请\n**{applicantName}**\n报修地点：{location}\n报修内容：{content}\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'REPAIR_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '报修申请 — {applicantName}', '## 新报修申请\n**{applicantName}**\n报修地点：{location}\n报修内容：{content}\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'REPAIR_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- REPAIR_COMPLETED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '报修办结 — {location}', '<h3>报修已办结</h3><p><b>{applicantName}</b>，你在 <b>{location}</b> 的报修申请已处理完毕。</p><p>{summary}</p><p>处理人：{processorName}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'REPAIR_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '报修办结 — {location}', '## 报修已办结\n**{applicantName}**，你在 **{location}** 的报修申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'REPAIR_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '报修办结 — {location}', '## 报修已办结\n**{applicantName}**，你在 **{location}** 的报修申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'REPAIR_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- SUPPLIES_REQUESTED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '物资领用 — {applicantName}', '<h3>新物资领用申请</h3><p><b>{applicantName}</b> 提交了物资领用申请：</p><p>{summary}</p><p style=''color:#666;font-size:12px''>提交时间：{createdAt}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SUPPLIES_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '物资领用 — {applicantName}', '## 新物资领用申请\n**{applicantName}**\n\n{summary}\n\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SUPPLIES_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '物资领用 — {applicantName}', '## 新物资领用申请\n**{applicantName}**\n\n{summary}\n\n提交时间：{createdAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SUPPLIES_REQUESTED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- SUPPLIES_COMPLETED
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '物资已出库', '<h3>物资已出库</h3><p><b>{applicantName}</b>，你的领用物资已出库：</p><p>{summary}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SUPPLIES_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '物资已出库', '## 物资已出库\n**{applicantName}**，你的领用物资已出库：\n{summary}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SUPPLIES_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '物资已出库', '## 物资已出库\n**{applicantName}**，你的领用物资已出库：\n{summary}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SUPPLIES_COMPLETED'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- DIGEST_TEST
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '聚合通知测试', '<h3>聚合通知测试</h3><p>{content}</p><hr><p style=''color:#999;font-size:12px''>此邮件由 ARO 系统自动发送（测试）。</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'DIGEST_TEST'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '聚合通知测试', '## {title}\n{content}\n\n> ARO 系统自动推送（测试）', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'DIGEST_TEST'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '聚合通知测试', '## {title}\n{content}\n\n> ARO 系统自动推送（测试）', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'DIGEST_TEST'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- TELEMETRY_ALARM
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '⚠ {floorCode} {roomName} {metricKind}{alarmDirection}', '<div style=''border-left:4px solid #dc2626;padding-left:14px;margin:8px 0''><p style=''font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px''>{floorCode} · {roomName}</p><p style=''font-size:17px;font-weight:700;color:#dc2626;margin:0 0 4px''>{metricKind} {alarmDirection}</p><p style=''font-size:14px;color:#475569;margin:0 0 2px''>当前 <b style=''color:#dc2626''>{currentValue}</b> / 阈值 {limitValue}</p><p style=''font-size:12px;color:#94a3b8;margin:8px 0 0''>{sentAt}</p></div><hr><p style=''color:#cbd5e1;font-size:11px''>ARO 动物房环境监测</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'TELEMETRY_ALARM'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '⚠ {floorCode} {roomName} {metricKind}{alarmDirection}', '## ⚠️ ARO 环境报警\n\n📍 {floorCode} {roomName}\n\n🌡️ {metricKind}{alarmDirection}：**{currentValue}** / 阈值 {limitValue}\n\n🕐 {sentAt}\n\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'TELEMETRY_ALARM'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '⚠ {floorCode} {roomName} {metricKind}{alarmDirection}', '## ⚠️ ARO 环境报警\n📍 {floorCode} {roomName}\n🌡️ {metricKind}{alarmDirection}：**{currentValue}** / 阈值 {limitValue}\n🕐 {sentAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'TELEMETRY_ALARM'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- TELEMETRY_RECOVERY
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '✓ {floorCode} {roomName} {metricKind}已恢复', '<div style=''border-left:4px solid #16a34a;padding-left:14px;margin:8px 0''><p style=''font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px''>{floorCode} · {roomName}</p><p style=''font-size:17px;font-weight:700;color:#16a34a;margin:0 0 4px''>{metricKind} 已恢复正常</p><p style=''font-size:14px;color:#475569;margin:0 0 2px''>当前 {currentValue}</p><p style=''font-size:12px;color:#94a3b8;margin:8px 0 0''>{recoveryAt}</p></div><hr><p style=''color:#cbd5e1;font-size:11px''>ARO 动物房环境监测</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'TELEMETRY_RECOVERY'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '✓ {floorCode} {roomName} {metricKind}已恢复', '## ✅ ARO 环境恢复\n\n📍 **{floorCode} {roomName}**\n\n🌡️ {metricKind}已恢复正常：**{currentValue}**\n\n🕐 {recoveryAt}\n\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'TELEMETRY_RECOVERY'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '✓ {floorCode} {roomName} {metricKind}已恢复', '## ✅ ARO 环境恢复\n📍 **{floorCode} {roomName}**\n🌡️ {metricKind}已恢复正常：**{currentValue}**\n🕐 {recoveryAt}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'TELEMETRY_RECOVERY'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- SWIPE_FAILURE_ALERT (rateLimitSeconds=0, no rate limit for alerts)
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '⚠ 刷卡告警 — {channelName}', '<div style=''border-left:4px solid #f59e0b;padding-left:14px;margin:8px 0''><p style=''font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px''>{channelName} · {personName}</p><p style=''font-size:17px;font-weight:700;color:#d97706;margin:0 0 4px''>{windowMin}分钟内 {count}/{threshold} 次{openTypeLabel} {enterOrExitLabel}</p><p style=''font-size:13px;color:#475569;margin:0 0 2px''>电话：{phone}</p><p style=''font-size:12px;color:#94a3b8;margin:8px 0 0''>{swingTime}</p></div><hr><p style=''color:#cbd5e1;font-size:11px''>ARO 门禁监测</p>', 0, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SWIPE_FAILURE_ALERT'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl), rate_limit_seconds = VALUES(rate_limit_seconds);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '⚠ 刷卡告警 — {channelName}', '⚠️ ARO 刷卡告警\n\n🚪 {channelName}\n\n👤 {personName}\n\n📞 {phone}\n\n📊 {windowMin}分钟内 {count}/{threshold} 次{openTypeLabel} {enterOrExitLabel}\n\n🕐 {swingTime}\n\n> ARO 系统自动推送', 0, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SWIPE_FAILURE_ALERT'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl), rate_limit_seconds = VALUES(rate_limit_seconds);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '⚠ 刷卡告警 — {channelName}', '⚠️ ARO 刷卡告警\n🚪 {channelName}\n👤 {personName}\n📞 {phone}\n📊 {windowMin}分钟内 {count}/{threshold} 次{openTypeLabel} {enterOrExitLabel}\n🕐 {swingTime}\n> ARO 系统自动推送', 0, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'SWIPE_FAILURE_ALERT'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl), rate_limit_seconds = VALUES(rate_limit_seconds);

-- ARO_TRAINING_PENDING
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '培训审批 — {sessionTitle}', '<h3>培训审批待审核</h3><p>培训 <b>{sessionTitle}</b> 有新学员待审批：</p><p><b>{traineeName}</b>（{jobNumber} / {projectGroup}）</p><hr><p style=''color:#999;font-size:12px''>ARO 培训审批系统</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ARO_TRAINING_PENDING'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '培训审批 — {sessionTitle}', '## 培训审批待审核\n培训 **{sessionTitle}** 有新学员待审批\n\n👤 {traineeName}\n🔢 {jobNumber}\n🏫 {projectGroup}\n\n> ARO 培训审批系统', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ARO_TRAINING_PENDING'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '培训审批 — {sessionTitle}', '## 培训审批待审核\n培训 **{sessionTitle}** 有新学员待审批\n\n👤 {traineeName}\n🔢 {jobNumber}\n🏫 {projectGroup}\n\n> ARO 培训审批系统', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ARO_TRAINING_PENDING'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- ACCESS_ENTER
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '人员进入 — {personName}', '<div style=''border-left:4px solid #16a34a;padding-left:14px;margin:8px 0''><p style=''font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px''>{roomName} · {doorLabel}</p><p style=''font-size:17px;font-weight:700;color:#16a34a;margin:0 0 4px''>{personName} 进入</p><p style=''font-size:13px;color:#475569;margin:0 0 2px''>部门：{department}</p><p style=''font-size:12px;color:#94a3b8;margin:8px 0 0''>{enterTime}</p></div><hr><p style=''color:#cbd5e1;font-size:11px''>ARO 门禁监测</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACCESS_ENTER'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '人员进入 — {personName}', '## 🟢 人员进入\n\n📍 **{roomName}** · {doorLabel}\n\n👤 {personName} 进入\n\n🏫 {department}\n\n🕐 {enterTime}\n\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACCESS_ENTER'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '人员进入 — {personName}', '## 🟢 人员进入\n📍 **{roomName}** · {doorLabel}\n👤 {personName} 进入\n🏫 {department}\n🕐 {enterTime}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACCESS_ENTER'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);

-- ACCESS_EXIT
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'EMAIL', 1, '人员离开 — {personName}', '<div style=''border-left:4px solid #f59e0b;padding-left:14px;margin:8px 0''><p style=''font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px''>{roomName} · {doorLabel}</p><p style=''font-size:17px;font-weight:700;color:#d97706;margin:0 0 4px''>{personName} 离开</p><p style=''font-size:13px;color:#475569;margin:0 0 2px''>部门：{department}</p><p style=''font-size:12px;color:#94a3b8;margin:8px 0 0''>{exitTime}</p></div><hr><p style=''color:#cbd5e1;font-size:11px''>ARO 门禁监测</p>', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACCESS_EXIT'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'SERVER_CHAN', 1, '人员离开 — {personName}', '## 🟡 人员离开\n\n📍 **{roomName}** · {doorLabel}\n\n👤 {personName} 离开\n\n🏫 {department}\n\n🕐 {exitTime}\n\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACCESS_EXIT'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
INSERT INTO notify_source_channel (source_id, channel_code, enabled, title_tpl, content_tpl, rate_limit_seconds, digest_mode)
SELECT s.id, 'WXPUSHER', 1, '人员离开 — {personName}', '## 🟡 人员离开\n📍 **{roomName}** · {doorLabel}\n👤 {personName} 离开\n🏫 {department}\n🕐 {exitTime}\n> ARO 系统自动推送', 300, 'INSTANT'
FROM notify_source s WHERE s.source_code = 'ACCESS_EXIT'
ON DUPLICATE KEY UPDATE title_tpl = VALUES(title_tpl), content_tpl = VALUES(content_tpl);
