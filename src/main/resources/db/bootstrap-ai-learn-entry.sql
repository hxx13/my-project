-- ============================================================
-- ai_learn_entry —— AI **学习池**：把「用户口语说法 → 对上哪条工具/哪个取值」沉淀成可回溯的条目。
--
-- 与 ai_capability_prompt（推荐词卡片，给人点的）**不是一回事**：那个是界面清单，这个是喂给模型的
-- 附加层；前者超管手工维护，后者由分析器自动学出来、再经影子期跑数据决定去留。
--
-- 为什么要有 status 而不是一删了之：新学的条目**默认 WATCHING（观察中）**——
-- 挂进提示词但不改变线上行为，只记「本该命中哪条 vs 实际命中哪条」；攒够样本按胜率转 ACTIVE。
-- 这样「大模型自主判定学习」才有一个**说得出理由**的判据（设计文档 §4）。
--
-- 唯一键 (layer, phrase, target)：同一条说法对同一个目标只留一行，重复学只累计 hits，不堆行。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_learn_entry (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_no    VARCHAR(32)  NOT NULL COMMENT '哪一批学出来的（回滚按批撤）',
    layer       VARCHAR(32)  NOT NULL COMMENT '写进哪一层：pack_phrase / tool_phrase / arg_value',
    phrase      VARCHAR(255) NOT NULL COMMENT '用户的说法（从原话里截的片段）',
    target      VARCHAR(128) NOT NULL COMMENT '对上什么：工具名 / 参数取值',
    status      VARCHAR(16)  NOT NULL DEFAULT 'WATCHING' COMMENT 'WATCHING 观察中 / ACTIVE 生效 / DISABLED 停用 / DROPPED 淘汰',
    source      VARCHAR(16)  NOT NULL DEFAULT 'STATS' COMMENT 'STATS 统计捞的 / VOTE 赞踩推的 / MANUAL 人工',
    hits        INT          NOT NULL DEFAULT 0 COMMENT '统计到的出现次数',
    trust       INT          NOT NULL DEFAULT 0 COMMENT '0-100，影子期跑出来的胜率分',
    note        VARCHAR(255) NOT NULL DEFAULT '' COMMENT '给人看的说明：这条是怎么来的',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_layer_phrase_target (layer, phrase, target),
    KEY idx_status (status),
    KEY idx_batch (batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 学习池（说法 → 工具/取值）';
