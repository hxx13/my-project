-- 健康异常细分（严重程度）+ 双通道通知（兽医 / 笼位所有者）的数据层种子。
--
-- 口径见 docs/02-设计存档/计划文档/2026-09-17-健康异常细分与兽医通知-架构设计.md：
--   严重程度是挂在 has_health_abnormality 下的**互斥单选**字段 —— 它**不产生状态码、不进折叠、
--   没有阈值行**，只影响展示与通知文案（CageStatusIntervalService.statusCodeOf 对它返回 null）。
--   通知规则按 (status_code, notify_target) 两行：VET（起点 1）+ OCCUPANT（起点 0）。
--
-- 幂等：本文件只有 INSERT IGNORE 与两条 DELETE（删退役行），无会抛错的 DDL，故可一文件多语句。
-- 依赖：必须排在
--   ① bootstrap-cage-alert-default-notify-target.sql / …-region-alert-rule-notify-target.sql
--      （DELETE 要引用 notify_target 列）
--   ② bootstrap-cage-status-alert.sql（建 cage_alert_default）
--   ③ bootstrap-cage-permission-matrix.sql（建能力注册表/授权表）
--   之后。

-- ① 码表：严重程度项由维护人随时新增，所以**不冻结**（FROZEN 会挡住 addItem，要求先解冻）
INSERT IGNORE INTO cage_info_codelist (code, name, folder, version, status, created_at, updated_at)
VALUES ('health_abnormality_severity', '健康异常严重程度', '状态标记', 1, 'DRAFT', NOW(), NOW());

-- ② 三个严重程度项（互斥）。码是 item_code，中文名同时用作展示标签与通知文案。
--    注意与五个状态（需分笼/需特殊饲养/动物转移/健康异常/合笼）不重名。
INSERT IGNORE INTO cage_info_codelist_item (codelist_id, item_code, item_label, sort_order, created_at, updated_at)
SELECT l.id, t.c, t.l, t.s, NOW(), NOW()
FROM cage_info_codelist l
JOIN (
    SELECT 'MILD'     AS c, '轻微' AS l, 10 AS s UNION ALL
    SELECT 'MODERATE',      '中度',       20 UNION ALL
    SELECT 'SEVERE',        '严重',       30
) t
WHERE l.code = 'health_abnormality_severity';

-- ③ 严重程度字段：单选（data_type=ENUM → 落 value_text；ENUM_MULTI 会落 value_json，那是多选）
INSERT IGNORE INTO cage_info_field
  (canonical, label, data_type, field_type, dict_key, folder, domain_code, role,
   editable, required, sort, published, status, created_at, updated_at)
VALUES
  ('health_abnormality_severity', '健康异常严重程度', 'ENUM', 'choice', 'health_abnormality_severity',
   '状态标记', 'D5', 'VALUE', 1, 'NO', 17, 1, 'DRAFT', NOW(), NOW());

-- ③b 瘙痒：布尔（data_type=BOOLEAN → 落 value_bool）。
--     它跟严重程度一样**不是状态码**（不进折叠、没有阈值行），只影响展示与通知文案；
--     但与严重程度不同的两点：
--       ① 它跟严重程度**不是二选一**，而是「每一档旁的一个勾选框」—— 数据上仍是一个布尔，
--          UI 上把勾选框画在每个档位旁边（严重程度互斥，所以实际最多一个「档位+瘙痒」组合）；
--       ② 它挂在 has_health_abnormality 下，由 CageInfoValueService.DETAIL_PARENT 管父子强绑定。
INSERT IGNORE INTO cage_info_field
  (canonical, label, data_type, field_type, dict_key, folder, domain_code, role,
   editable, required, sort, published, status, created_at, updated_at)
VALUES
  ('health_abnormality_itch', '瘙痒', 'BOOLEAN', 'switch', NULL,
   '状态标记', 'D5', 'VALUE', 1, 'NO', 18, 1, 'DRAFT', NOW(), NOW());

-- ④ 退役「健康异常」原有的单目标 (DEFAULT) 规则行。
--    新语义下健康异常只有 VET / OCCUPANT 两个目标，引擎的折叠目标集由**配置里出现过的 target** 决定；
--    留着 DEFAULT 行会让它多折出一份第三态区间（一条本不该存在的告警）。
--    幂等：删过了就是 0 行。
DELETE FROM cage_alert_default     WHERE status_code = 'HEALTH_ABNORMAL' AND notify_target = 'DEFAULT';
DELETE FROM cage_region_alert_rule WHERE status_code = 'HEALTH_ABNORMAL' AND notify_target = 'DEFAULT';

-- ⑤ 两行规则种子。
--    动作给 BOTH（高亮 + 通知）：引擎只在动作含违规/通知时才动手发通知，
--    而健康异常在 isNonViolationStatus 里 → 只发通知、不建违规。
--
--    ⚠ 两行的**计时起点都必须给 1**（出现 1 开始 = 值变 true 才开区间）。
--    这里踩过一个真坑：给 OCCUPANT 配 0（出现 0 开始）会把**全场每一个「没标健康异常」的笼位**
--    都开一条区间 —— 因为「值 = 0」正是绝大多数笼位的常态，而 `fold(null)` 折的是全部历史、
--    没有「观测起点」这个概念，于是区间从无穷远处就开着。实测重启后两轮就建了 4324 条 PENDING
--    基线（该字段有 25931 个笼位写过 false），7 天后会全部升级成约 2.6 万条推送给笼位所有者。
--    起点 0 适合「缺席本身就是异常」的字段（如某状态该开却没开），不适合「没标记 = 正常」。
--
--    VET：阈值 0 = 标上即通知兽医；OCCUPANT：阈值 7 = 标了 7 天还没处理才提醒所有者。
--    两个对象仍然可以各自配方向与阈值（区域级也能覆盖），只是**默认值不能是 0**。
--    ⚠ INSERT IGNORE 不改已存在的行；老库若已有这两行会被保留（管理员可自行调阈值）。
INSERT IGNORE INTO cage_alert_default (status_code, threshold_days, action, notify_target, start_value) VALUES
('HEALTH_ABNORMAL', 0, 'HIGHLIGHT', 'VET',      1),
('HEALTH_ABNORMAL', 7, 'HIGHLIGHT', 'OCCUPANT', 1);

-- ⑥ 学生侧能力注册：健康异常（父状态）+ 严重程度，各一个动作码。
--    能力码 = cage.student.edit.{动作码小写}（见 CageModeVisibilityService.studentEditCapability），
--    动作码是 CAGE_BOX_ACTIONS 里的 HEALTH_CHECK / 新增的 HEALTH_SEVERITY。
--    矩阵这层是上限，区域级由饲养组长逐区域关（未配 = 跟随矩阵）。
--    教职工侧不新增能力码：健康异常标记属于状态编辑，沿用既有的 cage.mode.edit。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.student.edit.health_check',    '健康异常（学生）',       'STUDENT', 220),
('cage.student.edit.health_severity', '健康异常严重程度（学生）', 'STUDENT', 225),
('cage.student.edit.health_itch',     '健康异常瘙痒（学生）',     'STUDENT', 227);

-- 默认授权给全部学生视角身份，与「合笼（学生）」「特殊饲养（学生）」逐字同款。
INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.student.edit.health_check',    'LAB_MEMBER'),
('cage.student.edit.health_check',    'PI'),
('cage.student.edit.health_check',    'GROUP_LEADER'),
('cage.student.edit.health_check',    'GROUP_STEWARD'),
('cage.student.edit.health_severity', 'LAB_MEMBER'),
('cage.student.edit.health_severity', 'PI'),
('cage.student.edit.health_severity', 'GROUP_LEADER'),
('cage.student.edit.health_severity', 'GROUP_STEWARD'),
('cage.student.edit.health_itch',     'LAB_MEMBER'),
('cage.student.edit.health_itch',     'PI'),
('cage.student.edit.health_itch',     'GROUP_LEADER'),
('cage.student.edit.health_itch',     'GROUP_STEWARD');
