package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiToolCallLog;
import com.example.demo.modules.ai.mapper.AiGatewayMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Map;

/**
 * AI 操作审计的写入与查询。append-only，没有更新与删除。
 *
 * {@link #record} 会被**每一条**工具调用路径调用，包括被拒绝的 —— 被拒记录不是噪音，
 * 「同一用户连续被拒」是有人试探的信号。
 */
@Service
public class AiAuditService {

    private final AiGatewayMapper mapper;
    private final UserDisplayNameService userDisplayNameService;

    public AiAuditService(AiGatewayMapper mapper, UserDisplayNameService userDisplayNameService) {
        this.mapper = mapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public void record(AiToolCallLog entry) {
        if (entry.getExecuted() == null) {
            entry.setExecuted(Boolean.FALSE);
        }
        mapper.insertToolCallLog(entry);
    }

    /** 一次「未执行」的调用：白名单未命中、权限不足、被用户取消等。 */
    public void recordNotExecuted(Long sessionId, Long messageId, String toolName, String rawArguments,
                                  String capability, boolean granted, String denialReason) {
        AiToolCallLog e = new AiToolCallLog();
        e.setSessionId(sessionId);
        e.setMessageId(messageId);
        e.setToolName(toolName);
        e.setRawArguments(rawArguments);
        e.setRequiredCapability(capability);
        e.setCapabilityGranted(granted);
        e.setDenialReason(denialReason);
        e.setExecuted(Boolean.FALSE);
        e.setOk(Boolean.FALSE);
        record(e);
    }

    public List<Map<String, Object>> auditRows(String userId, Long sessionId, String toolName,
                                               Boolean executed, Boolean deniedOnly,
                                               LocalDateTime from, LocalDateTime to,
                                               int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 200);
        int offset = Math.max(page, 0) * safeSize;
        List<Map<String, Object>> rows =
                mapper.selectAuditRows(userId, sessionId, toolName, executed, deniedOnly, from, to, offset, safeSize);

        // 操作人姓名走通用的人员显示名解析（统一人员 → aro_personnel → sys_user 三级回退），
        // 不在这里自己拼 SQL —— 那套回退规则只应有一份实现。
        List<String> ids = rows.stream()
                .map(r -> r.get("userId"))
                .filter(Objects::nonNull)
                .map(String::valueOf)
                .distinct()
                .toList();
        if (!ids.isEmpty()) {
            Map<String, String> names = userDisplayNameService.resolveDisplayNames(ids);
            for (Map<String, Object> row : rows) {
                Object uid = row.get("userId");
                if (uid != null) {
                    row.put("actorName", names.getOrDefault(String.valueOf(uid), ""));
                }
            }
        }
        return rows;
    }

    public int countAuditRows(String userId, Long sessionId, String toolName,
                              Boolean executed, Boolean deniedOnly,
                              LocalDateTime from, LocalDateTime to) {
        return mapper.countAuditRows(userId, sessionId, toolName, executed, deniedOnly, from, to);
    }

    public List<String> toolNames() {
        return mapper.selectDistinctToolNames();
    }
}
