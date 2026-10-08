package com.example.demo.modules.ai.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * AI 对话操作网关建表迁移器。
 *
 * 四张表：会话 / 消息 / 挂起 / 工具调用审计。
 * 全部幂等（CREATE TABLE IF NOT EXISTS），建表走代码路径，不直连数据库手工执行。
 *
 * 审计字段（{@code ai_message} 与 {@code ai_tool_call_log}）必须一次定全 —— 后补等于历史缺口。
 * 详见 docs/02-设计存档/计划文档/2026-10-08-AI对话操作网关-架构设计.md §12。
 */
@Component
@Order(150)
public class AiGatewaySchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AiGatewaySchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public AiGatewaySchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 幂等 DDL：失败（列已存在 / 已是目标类型）不报错。 */
    private void execIgnore(String ddl) {
        try {
            jdbcTemplate.execute(ddl);
        } catch (Exception ignore) {
            // 目标状态已达成
        }
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS ai_session (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        user_id VARCHAR(50) NOT NULL COMMENT '发起人 user.id（JWT 解析所得，字符串型雪花 id）',
                        title VARCHAR(255) NULL COMMENT '会话标题，取首条用户消息摘要',
                        source VARCHAR(16) NULL COMMENT '载体: web/mp',
                        context_page VARCHAR(255) NULL COMMENT '载体上报的入口页面，仅用于路由',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_user_updated (user_id, updated_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 对话会话'
                    """);
            log.info("[ai-gateway-schema] ai_session 表已就绪");

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS ai_message (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        session_id BIGINT NOT NULL,
                        seq INT NOT NULL COMMENT '会话内序号',
                        role VARCHAR(16) NOT NULL COMMENT 'user/assistant/tool',
                        content MEDIUMTEXT NULL COMMENT '原文，不归一化、不改写',
                        raw_tool_calls MEDIUMTEXT NULL COMMENT '模型原始输出的 tool_calls JSON',
                        tool_call_id VARCHAR(64) NULL COMMENT 'role=tool 时对应哪次调用（OpenAI 协议要求，重放历史必需）',
                        actor_user_id VARCHAR(50) NULL COMMENT '发起人；user 轮才有',
                        actor_role_snapshot VARCHAR(32) NULL COMMENT '发起人当时的角色快照，角色会变故必须存',
                        source VARCHAR(16) NULL,
                        context_json VARCHAR(512) NULL COMMENT '载体上报的页面/实体',
                        model VARCHAR(64) NULL,
                        latency_ms INT NULL,
                        prompt_tokens INT NULL,
                        completion_tokens INT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_session_seq (session_id, seq)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 对话消息（append-only）'
                    """);
            log.info("[ai-gateway-schema] ai_message 表已就绪");

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS ai_interaction (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        session_id BIGINT NOT NULL,
                        message_id BIGINT NULL COMMENT '发起挂起的那条 assistant 消息',
                        token VARCHAR(64) NOT NULL COMMENT '挂起凭证，前端凭此续跑',
                        tool_call_id VARCHAR(64) NULL COMMENT '被挂起的那次调用（续跑时据此定位同轮里哪一条）',
                        kind VARCHAR(16) NOT NULL COMMENT 'confirm/clarify',
                        question TEXT NULL,
                        options_json MEDIUMTEXT NULL COMMENT '结构化选项，前端渲染为可点选控件',
                        chosen_value TEXT NULL COMMENT '用户实际点了什么（可信输入，非模型生成）',
                        status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/RESOLVED/EXPIRED',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        resolved_at DATETIME NULL,
                        UNIQUE KEY uk_token (token),
                        INDEX idx_session_status (session_id, status)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 对话挂起（澄清/确认）'
                    """);
            log.info("[ai-gateway-schema] ai_interaction 表已就绪");

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS ai_tool_call_log (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        session_id BIGINT NOT NULL,
                        message_id BIGINT NULL,
                        tool_name VARCHAR(64) NOT NULL,
                        raw_arguments MEDIUMTEXT NULL COMMENT '模型原样传的参数 JSON',
                        required_capability VARCHAR(64) NULL COMMENT '该工具声明的能力码',
                        capability_granted TINYINT(1) NULL COMMENT '权限判定是否通过',
                        denial_reason VARCHAR(255) NULL,
                        executed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否真的执行了（被拒/被确认拦下为 0）',
                        raw_result MEDIUMTEXT NULL COMMENT '执行返回的原始响应',
                        ok TINYINT(1) NULL,
                        error_message VARCHAR(512) NULL,
                        confirmed_by VARCHAR(50) NULL COMMENT '写操作由谁点的确认',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_session (session_id),
                        INDEX idx_tool_created (tool_name, created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 工具调用审计（append-only，被拒绝的也记）'
                    """);
            log.info("[ai-gateway-schema] ai_tool_call_log 表已就绪");

            // 会话级附件：解析后的表格**全量**网格留在这里，消息里只放预览。
            // 表名不叫 ai_file 是因为它存的是「解析结果」而非原文件本身（原文件不需要留：清洗完就落模板库了）。
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS ai_attachment (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        session_id BIGINT NOT NULL,
                        user_id VARCHAR(50) NOT NULL COMMENT '上传人（JWT 解析所得，字符串型雪花 id）',
                        message_id BIGINT NULL COMMENT '落在哪一轮用户消息上；注入预览与重放历史靠它',
                        kind VARCHAR(24) NOT NULL DEFAULT 'spreadsheet',
                        filename VARCHAR(255) NULL,
                        sheet_count INT NOT NULL DEFAULT 0,
                        row_count INT NOT NULL DEFAULT 0,
                        col_count INT NOT NULL DEFAULT 0,
                        truncated TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否因限额被截断（截了必须显式告知）',
                        note VARCHAR(500) NULL COMMENT '截断原因',
                        grid_json MEDIUMTEXT NULL COMMENT '解析后的网格 JSON（含工作表名与逐行单元格）',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_session (session_id),
                        INDEX idx_message (message_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 会话附件（解析后的表格网格）'
                    """);
            log.info("[ai-gateway-schema] ai_attachment 表已就绪");

            // 增量列：建表语句加了列，但对「已按旧版建过表」的库不生效 —— 补吞异常的 ALTER。
            execIgnore("ALTER TABLE ai_message ADD COLUMN tool_call_id VARCHAR(64) NULL "
                    + "COMMENT 'role=tool 时对应哪次调用'");

            // 挂起记录要能指回「同一条 assistant 轮里的哪一次调用」—— 一轮可能有多次调用，
            // 只说 message_id 定位不到是哪一条，续跑时就得靠猜（猜错就是执行了另一次调用）。
            execIgnore("ALTER TABLE ai_interaction ADD COLUMN tool_call_id VARCHAR(64) NULL "
                    + "COMMENT '被挂起的那次调用（续跑时据此定位同轮里哪一条）'");

            // 用户 id 是字符串型雪花 id（sys_user.id 为 varchar(50)），早期版本误建为 BIGINT，纠正之。
            execIgnore("ALTER TABLE ai_session MODIFY COLUMN user_id VARCHAR(50) NOT NULL COMMENT '发起人 user.id'");
            execIgnore("ALTER TABLE ai_message MODIFY COLUMN actor_user_id VARCHAR(50) NULL COMMENT '发起人'");
            execIgnore("ALTER TABLE ai_tool_call_log MODIFY COLUMN confirmed_by VARCHAR(50) NULL COMMENT '写操作由谁点的确认'");
            // 软删：用户删掉的对话不再出现在列表/续聊里，但**行还在** —— 审计页是
            // `JOIN ai_session`，硬删会把那条对话上的工具调用留痕一起抹掉
            execIgnore("ALTER TABLE ai_session ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删标记：1=用户已删除'");
        } catch (Exception e) {
            log.error("[ai-gateway-schema] 表结构迁移失败: {}", e.getMessage(), e);
        }
    }
}
