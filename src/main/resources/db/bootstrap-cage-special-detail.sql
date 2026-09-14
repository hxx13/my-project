-- 特殊饲养明细子状态（数据层）：码表 + 明细字段 + 明细项默认阈值 + 能力注册。
--
-- 口径见 docs/02-设计存档/计划文档/2026-09-14-特殊饲养明细子状态-架构设计.md：
--   特殊饲养（needs_special_feeding）保持不变，明细作为挂在它下面的**多选**，
--   每个明细项以 `SF_ + item_code` 作为独立的 statusCode，参与既有的折叠 / 阈值 / 超时 / 违规链。
--   statusCode 前缀同时是命名空间，与保留的五个状态码隔开（CageStatusIntervalService.DETAIL_STATUS_PREFIX）。
--
-- 幂等：本文件**不建表、不改表**，只有 INSERT IGNORE，故可一文件多语句
-- （参照 bootstrap-cage-status-alert.sql 的先例；一文件一条 DDL 那条约束针对的是会抛错的 ALTER）。
-- 依赖：必须排在 bootstrap-cage-permission-matrix.sql（建能力注册表）与
--       bootstrap-cage-status-alert.sql（建 cage_alert_default）之后。
-- 三张表的唯一键分别是 cage_info_codelist.code / cage_info_codelist_item(codelist_id,item_code)
-- / cage_info_field.canonical / cage_permission_capability.code / cage_permission_grant(能力,身份)。

-- ① 码表：明细项由维护人随时新增，所以**不冻结**（FROZEN 会挡住 addItem，要求先解冻）
INSERT IGNORE INTO cage_info_codelist (code, name, folder, version, status, created_at, updated_at)
VALUES ('special_feeding_detail', '特殊饲养明细', '状态标记', 1, 'DRAFT', NOW(), NOW());

-- ② 四个明细项（用户口径：需/勿 × 食/水）。码是 item_code，最终 statusCode = SF_ + 它；
--    中文名同时用作**状态标签**，与五个状态（需分笼/需特殊饲养/动物转移/健康异常/合笼）不重名。
INSERT IGNORE INTO cage_info_codelist_item (codelist_id, item_code, item_label, sort_order, created_at, updated_at)
SELECT l.id, t.c, t.l, t.s, NOW(), NOW()
FROM cage_info_codelist l
JOIN (
    SELECT 'NEED_FEED'  AS c, '需加食' AS l, 10 AS s UNION ALL
    SELECT 'NO_FEED',        '勿加食',       20 UNION ALL
    SELECT 'NEED_WATER',     '需加水',       30 UNION ALL
    SELECT 'NO_WATER',       '勿加水',       40
) t
WHERE l.code = 'special_feeding_detail';

-- ②b 清掉最初那两个占位项（FEED/WATER 是先手写的占位，已被上面的口径取代）及其默认阈值行。
--     幂等：删过了就是 0 行。
DELETE FROM cage_info_codelist_item
WHERE codelist_id IN (SELECT id FROM cage_info_codelist WHERE code = 'special_feeding_detail')
  AND item_code IN ('FEED', 'WATER');
DELETE FROM cage_alert_default WHERE status_code IN ('SF_FEED', 'SF_WATER');

-- ③ 明细字段：多选（ENUM_MULTI → field_type=choice；读侧 parseMulti 解成数组，值落 value_json）
INSERT IGNORE INTO cage_info_field
  (canonical, label, data_type, field_type, dict_key, folder, domain_code, role,
   editable, required, sort, published, status, created_at, updated_at)
VALUES
  ('special_feeding_details', '特殊饲养明细', 'ENUM_MULTI', 'choice', 'special_feeding_detail', '状态标记', 'D5', 'VALUE',
   1, 'NO', 16, 1, 'DRAFT', NOW(), NOW());

-- ④ 明细项的全局默认阈值：与五个状态同一张表、同一套口径。
--    缺行 = fail-closed 并 warn（既有语义），所以**新增明细项后要补一行**，否则该项不告警。
--    动作给 BOTH（高亮 + 通知）：明细与父状态共用推送中心那个「笼位状态提醒」源，
--    只写 HIGHLIGHT 的话它们根本不发通知（2026-09-14 实测确认，用户预期是要发的）。
--    注意 INSERT IGNORE 不会改已存在的行 —— 老库里这四行要单独改成 BOTH（走阈值配置页即可）。
INSERT IGNORE INTO cage_alert_default (status_code, threshold_days, action) VALUES
('SF_NEED_FEED',  7, 'BOTH'),
('SF_NO_FEED',    7, 'BOTH'),
('SF_NEED_WATER', 7, 'BOTH'),
('SF_NO_WATER',   7, 'BOTH');

-- ⑤ 权限注册（用户明确要求的一项）：学生侧动作能力码 = cage.student.edit.{动作小写}，
--    与「合笼（学生）」同一套机制 —— 矩阵这层是上限，区域级由饲养组长逐区域关（未配 = 跟随矩阵）。
--    教职工侧不新增能力码：明细标记属于状态编辑，沿用既有的 cage.mode.edit。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.student.edit.special_feeding_detail', '特殊饲养明细（学生）', 'STUDENT', 210);

-- ⑥ 父状态「需特殊饲养」的学生动作能力码 —— **明细挂在它下面**：学生标不了父状态，
--    四个明细项就是凭空出现的孤悬标签（强绑定见 CageInfoValueService#setStatus：父状态一关，明细一并清）。
--    与「合笼（学生）」逐字同款，授权身份也一致；矩阵里可随时收窄。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.student.edit.special_breeding', '特殊饲养（学生）', 'STUDENT', 208);

INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.student.edit.special_breeding', 'LAB_MEMBER'),
('cage.student.edit.special_breeding', 'PI'),
('cage.student.edit.special_breeding', 'GROUP_LEADER'),
('cage.student.edit.special_breeding', 'GROUP_STEWARD');

INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.student.edit.special_feeding_detail', 'LAB_MEMBER'),
('cage.student.edit.special_feeding_detail', 'PI'),
('cage.student.edit.special_feeding_detail', 'GROUP_LEADER'),
('cage.student.edit.special_feeding_detail', 'GROUP_STEWARD');
