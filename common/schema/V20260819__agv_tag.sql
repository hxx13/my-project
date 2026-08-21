-- ============================================================
-- AGV 语义标签字典 + 标签显隐状态
--
-- 背景：标签此前不是实体，而是散落三处的字符串——
--   ① 内置标签硬编码在前端 tagConfig.ts 的数组/颜色 map 里；
--   ② 自定义标签只存浏览器 localStorage["agvCustomTags"]；
--   ③ 区域通过 agv_spatial_element.semantic_tags 按「名字」引用标签。
-- 后果：换机器看不到别人的标签定义（区域颜色掉成默认灰）；
--       没有编辑入口，想改名只能删了重建，导致所有区域引用失联；
--       同名标签无约束，'["充电"]' 到底指哪个标签是歧义的。
--
-- 本表把标签收敛为一等实体：
--   · name 全局唯一 —— 消灭同名歧义，使「名字」成为可靠的自然键，
--     区域端 semantic_tags 得以继续按名引用而不必改造 20 余处读写点；
--   · 改名/删除由服务端在同一事务内级联更新 agv_spatial_element
--     与 agv_tag_hidden，封死引用失联的路径；
--   · 内置标签以种子数据进表（builtin=1），与自定义标签同构，
--     前端不再需要「内置 + 自定义」两套体系的拼接函数。
--
-- builtin 语义：可改色、不可改名、不可删除。
-- 因为 AgvSpatialService.inferTags() 自动生成区域时按名字硬编码打标签，
-- 内置标签的名字属于系统语义而非用户数据。
--
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE。
-- 同源：src/main/resources/db/bootstrap-agv-tag.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS agv_tag (
    id          BIGINT       AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(32)  NOT NULL COMMENT '标签名（全局唯一，区域按名引用）',
    color       VARCHAR(8)   NOT NULL DEFAULT '#6b7280' COMMENT '颜色 hex',
    scope       VARCHAR(8)   NOT NULL DEFAULT 'world' COMMENT 'world=全局跨车 / agv=绑定某台车',
    robot_ip    VARCHAR(20)  NULL COMMENT 'scope=agv 时的归属车 IP',
    builtin     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '内置标签：可改色，不可改名/删除',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '展示顺序',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_agv_tag_name (name),
    KEY idx_agv_tag_robot (robot_ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV 语义标签字典';

-- 内置标签种子：与原前端 BUILTIN_TAG_OPTIONS / BUILTIN_TAG_COLORS 一致，
-- 名字必须与 AgvSpatialService.inferTags() 生成的标签名保持一致。
INSERT IGNORE INTO agv_tag (name, color, scope, robot_ip, builtin, sort_order) VALUES
    ('充电', '#22c55e', 'world', NULL, 1, 10),
    ('作业', '#f59e0b', 'world', NULL, 1, 20),
    ('路径', '#6b7280', 'world', NULL, 1, 30),
    ('运输', '#3b82f6', 'world', NULL, 1, 40),
    ('载货', '#f97316', 'world', NULL, 1, 50),
    ('休息', '#14b8a6', 'world', NULL, 1, 60);

-- 标签显隐（全局共享）：每台车各自隐藏了哪些标签。
-- 按名引用，与 semantic_tags 一并参与改名/删除的级联更新。
CREATE TABLE IF NOT EXISTS agv_tag_hidden (
    robot_ip  VARCHAR(20) NOT NULL COMMENT '机器人IP',
    tag_name  VARCHAR(32) NOT NULL COMMENT '被隐藏的标签名',
    PRIMARY KEY (robot_ip, tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV 标签显隐状态（全局共享）';
