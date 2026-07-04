package com.example.demo.modules.llm.mapper;

import com.example.demo.modules.llm.entity.LlmConversationMessage;
import com.example.demo.modules.llm.entity.LlmConversationSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface LlmConversationMapper {

    int insertSession(LlmConversationSession session);

    int insertMessage(LlmConversationMessage message);

    LlmConversationSession findSessionById(@Param("id") Long id);

    List<LlmConversationSession> findActiveSessionByType(@Param("sessionType") String sessionType);

    List<LlmConversationMessage> findMessagesBySessionId(@Param("sessionId") Long sessionId);

    List<LlmConversationMessage> findNonCompressedMessagesBySessionId(
            @Param("sessionId") Long sessionId,
            @Param("limit") int limit);

    int updateSessionSummary(@Param("id") Long id,
                             @Param("contextSummary") String contextSummary,
                             @Param("tokenCountTotal") int tokenCountTotal);

    int markMessagesCompressed(@Param("sessionId") Long sessionId,
                               @Param("beforeMessageId") Long beforeMessageId);

    int updateSessionStatus(@Param("id") Long id,
                            @Param("status") String status);

    int updateSessionTokenCount(@Param("id") Long id,
                                @Param("tokenCountTotal") int tokenCountTotal);
}
