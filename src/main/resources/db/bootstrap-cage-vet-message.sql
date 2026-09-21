-- 兽医收件箱 + 兽医指导意见（数据层）：一条消息表 + 两个只读表单字段 + 入口能力码。
--
-- 口径见 docs/02-设计存档/计划文档/2026-09-17-健康异常细分与兽医通知-架构设计.md 与后续补充：
--   ① 每次「通知兽医」触发 **形成一条消息**（收件箱形态，不合并）；
--   ② 兽医点「已查看」才把该条的未读标记清掉 —— 未读在网格上表现为**紫色描边悬浮层**
--      （不占笼位状态底色，纯「这条看过没」的标记）；
--   ③ 兽医的**指导意见**落到 cage_info_value 的表单字段里（文字 + 图片），
--      因此**归档时与表单内容同时归档**，且在详情表单里看得到、**不可编辑**
--      （editable=0 是服务端强制的：通用表单写口会拒改，只有兽医那条专用接口能写）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE；本文件无会抛错的 ALTER，可一文件多语句。
-- 依赖：需排在 bootstrap-cage-permission-matrix.sql（能力注册表）之后。

CREATE TABLE IF NOT EXISTS cage_vet_message (
    id             BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    alert_id       BIGINT      NULL COMMENT '来源告警行 id（cage_status_alert.id）；同一条告警只出一条消息，见唯一键',
    animal_cage_id BIGINT      NOT NULL COMMENT '笼位 id',
    status_code    VARCHAR(32) NOT NULL DEFAULT 'HEALTH_ABNORMAL' COMMENT '触发时的状态码（目前只有健康异常）',
    fired_at       DATETIME    NOT NULL COMMENT '消息时刻（= 告警触发时刻）',
    read_at        DATETIME    NULL COMMENT '兽医点「已查看」的时刻；NULL = 未读（网格紫色描边）',
    read_by        VARCHAR(64) NULL COMMENT '点「已查看」的兽医账号 id',
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME    NULL,
    UNIQUE KEY uk_cage_vet_message_alert (alert_id),
    KEY idx_cvm_cage (animal_cage_id),
    KEY idx_cvm_unread (read_at, animal_cage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兽医收件箱：每条「通知兽医」一条消息，缺 read_at 即未读';

-- 指导意见的两个表单字段（**只读**）：通用表单写口一律拒改，只有兽医专用接口能写。
-- sort 排在健康异常那几个后面；domain 同属 D5（状态标记）。
INSERT IGNORE INTO cage_info_field
  (canonical, label, data_type, field_type, dict_key, folder, domain_code, role,
   editable, required, sort, published, status, created_at, updated_at)
VALUES
  ('vet_advice', '兽医指导意见', 'TEXT', 'textarea', NULL,
   '状态标记', 'D5', 'VALUE', 0, 'NO', 30, 1, 'DRAFT', NOW(), NOW()),
  ('vet_advice_images', '兽医指导意见图片', 'FILE', 'image', NULL,
   '状态标记', 'D5', 'VALUE', 0, 'NO', 31, 1, 'DRAFT', NOW(), NOW());

-- 入口能力码：谁能在笼架页看到「兽医」入口（默认勾给兽医身份；以后要靠矩阵放宽就在矩阵里加）。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.vet.inbox', '兽医收件箱', 'STAFF', 260);

INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.vet.inbox', 'VETERINARIAN');
