package com.example.demo.modules.ai.mapper;

import com.example.demo.modules.ai.entity.AiAttachment;
import com.example.demo.modules.ai.entity.AiInteraction;
import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.entity.AiSession;
import com.example.demo.modules.ai.entity.AiToolCallLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * AI 对话操作网关的持久化入口。四张表一个 Mapper（照 TeamMapper 的模块内聚合写法）。
 *
 * 消息与工具调用日志都是 append-only：只有 insert + select，**没有 update / delete**。
 */
@Mapper
public interface AiGatewayMapper {

    // ── ai_session ──
    int insertSession(AiSession session);

    AiSession selectSessionById(@Param("id") Long id);

    int updateSessionTitle(@Param("id") Long id, @Param("title") String title);

    int touchSession(@Param("id") Long id);

    /** 软删会话：列表/续聊/归属校验都不再看见它，审计留痕仍能 join 到 */
    int markSessionDeleted(@Param("id") Long id);

    /** 侧栏会话列表：全量分页。 */
    List<AiSession> selectSessionsByUser(@Param("userId") String userId,
                                         @Param("offset") int offset,
                                         @Param("limit") int limit);

    int countSessionsByUser(@Param("userId") String userId);

    /** 载体专用会话（如智能精灵球）：同一用户同一来源复用最近一条。 */
    AiSession selectLatestSessionByUserAndSource(@Param("userId") String userId,
                                                 @Param("source") String source);

    // ── ai_message ──
    int insertMessage(AiMessage message);

    /** 前端展示：全量。 */
    List<AiMessage> selectMessagesBySession(@Param("sessionId") Long sessionId);

    /** 发模型：只取最近 N 条（调用方拿到后自行反转成正序）。 */
    List<AiMessage> selectRecentMessages(@Param("sessionId") Long sessionId,
                                         @Param("limit") int limit);

    Integer selectMaxSeq(@Param("sessionId") Long sessionId);

    AiMessage selectMessageById(@Param("id") Long id);

    /**
     * 本会话里**已经有应答**的那些 tool_call_id。
     *
     * <p>挂起续跑要用它判断「这一轮里哪几次已经办过」。**必须查库，不能扫发给模型的窗口** ——
     * 窗口是最近 20 条，长会话里那轮可能已被截掉，于是已办过的调用会被当成没办过**再执行一次**。
     */
    List<String> selectAnsweredToolCallIds(@Param("sessionId") Long sessionId);

    // ── ai_interaction ──
    int insertInteraction(AiInteraction interaction);

    AiInteraction selectInteractionByToken(@Param("token") String token);

    /** 用户回应后落定；只允许 PENDING → RESOLVED 的单向迁移。 */
    int resolveInteraction(@Param("token") String token,
                           @Param("chosenValue") String chosenValue,
                           @Param("status") String status);

    // ── ai_attachment ──
    int insertAttachment(AiAttachment attachment);

    AiAttachment selectAttachmentById(@Param("id") Long id);

    /** 建 messages 时按 message_id 批量取附件（一次查，不做 N+1）。 */
    List<AiAttachment> selectAttachmentsByMessageIds(@Param("ids") List<Long> ids);

    List<AiAttachment> selectAttachmentsBySession(@Param("sessionId") Long sessionId);

    /** 会话删掉时一起清，避免附件堆积。 */
    int deleteAttachmentsBySession(@Param("sessionId") Long sessionId);

    // ── ai_tool_call_log ──
    int insertToolCallLog(AiToolCallLog log);

    List<AiToolCallLog> selectToolCallsBySession(@Param("sessionId") Long sessionId);

    /** 审计表格页：一次工具调用一行，含会话发起人与该轮用户原话。 */
    List<Map<String, Object>> selectAuditRows(@Param("userId") String userId,
                                              @Param("sessionId") Long sessionId,
                                              @Param("toolName") String toolName,
                                              @Param("executed") Boolean executed,
                                              @Param("deniedOnly") Boolean deniedOnly,
                                              @Param("from") LocalDateTime from,
                                              @Param("to") LocalDateTime to,
                                              @Param("offset") int offset,
                                              @Param("limit") int limit);

    int countAuditRows(@Param("userId") String userId,
                       @Param("sessionId") Long sessionId,
                       @Param("toolName") String toolName,
                       @Param("executed") Boolean executed,
                       @Param("deniedOnly") Boolean deniedOnly,
                       @Param("from") LocalDateTime from,
                       @Param("to") LocalDateTime to);

    /** 审计页筛选下拉：出现过的工具名。 */
    List<String> selectDistinctToolNames();
}
