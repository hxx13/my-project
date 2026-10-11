-- AI 抽屉「能力提示词清单」：一张可被超管增删改排序的提示词卡片表。
-- 分组名只做展示归类（不单独排序），全局排序统一按 sort_order。
-- audience（看得见的人）：取值照 AI 网关的视角枚举 AiView 的常量（STAFF / STUDENT），
--   空串 = 全员（老数据与不标注的都是全员，也是本列默认值）。
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS ai_capability_prompt (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    group_name  VARCHAR(64)  NOT NULL COMMENT '分组名（给用户看的中文分组，如「物资申领」）',
    title       VARCHAR(256) NOT NULL COMMENT '短标题（一行）',
    prompt_text VARCHAR(512) NOT NULL COMMENT '提示词正文（用户口吻的一句话，点一下填进输入框）',
    note        VARCHAR(255) NOT NULL DEFAULT '' COMMENT '操作备注：这条提示词点了会做什么（给用户看的说明）',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '全局排序号',
    enabled     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用',
    audience    VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '看得见的人：STAFF/STUDENT（AiView 取值）；空=全员',
    update_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_enabled_sort (enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 抽屉能力提示词清单（超管可维护）';
