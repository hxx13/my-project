package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanedEvent;
import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.accessfusion.mapper.AccessCleanedEventMapper;
import com.example.demo.modules.accessfusion.mapper.AccessRawEventMapper;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.example.demo.modules.llm.service.LlmConfigService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccessFusionReviewService {

    private final AccessCleanedEventMapper cleanedEventMapper;
    private final AccessRawEventMapper rawEventMapper;
    private final DashScopeChatClient chatClient;
    private final LlmConfigService llmConfigService;

    public AccessFusionReviewService(
            AccessCleanedEventMapper cleanedEventMapper,
            AccessRawEventMapper rawEventMapper,
            DashScopeChatClient chatClient,
            LlmConfigService llmConfigService) {
        this.cleanedEventMapper = cleanedEventMapper;
        this.rawEventMapper = rawEventMapper;
        this.chatClient = chatClient;
        this.llmConfigService = llmConfigService;
    }

    public Map<String, Object> listReview(int page, int pageSize) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(pageSize, 1), 200);
        int offset = (safePage - 1) * safeSize;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", cleanedEventMapper.selectReviewQueue(offset, safeSize));
        out.put("total", cleanedEventMapper.countReviewQueue());
        out.put("page", safePage);
        out.put("pageSize", safeSize);
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public void confirmManual(long cleanedEventId, String direction) {
        String dir = direction != null ? direction.trim().toUpperCase() : "";
        if (!"ENTER".equals(dir) && !"EXIT".equals(dir)) {
            throw new IllegalArgumentException("direction 须为 ENTER 或 EXIT");
        }
        int accessType = "ENTER".equals(dir) ? 1 : 2;
        cleanedEventMapper.updateReview(cleanedEventId, dir, accessType, "MANUAL", 100, 0);
    }

    public Map<String, Object> suggestWithAi(long cleanedEventId) {
        llmConfigService.assertReady();
        AccessCleanedEvent row = cleanedEventMapper.selectById(cleanedEventId);
        if (row == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        AccessRawEvent raw = rawEventMapper.selectById(row.getRawEventId());
        String prompt =
                "你是门禁方向复核助手。根据以下单条刷卡上下文，仅回答 ENTER 或 EXIT 一个词。\n"
                        + "当前算法判断: "
                        + row.getDirection()
                        + "，置信度: "
                        + row.getConfidence()
                        + "，标记: "
                        + row.getFlagsJson()
                        + "\n通道: "
                        + row.getChannelCode()
                        + "，房间: "
                        + row.getRoomName()
                        + "，人员: "
                        + row.getPersonName()
                        + "，大华原值 enterOrExit: "
                        + (raw != null ? raw.getDahuaEnterOrExit() : null);
        var chat = chatClient.chatWithFallback(
                List.of(
                        Map.of("role", "system", "content", "只输出 ENTER 或 EXIT，不要解释。"),
                        Map.of("role", "user", "content", prompt)));
        String suggestion = chat.content() != null ? chat.content().trim().toUpperCase() : "";
        if (suggestion.contains("EXIT")) {
            suggestion = "EXIT";
        } else if (suggestion.contains("ENTER")) {
            suggestion = "ENTER";
        } else {
            suggestion = row.getDirection();
        }
        cleanedEventMapper.updateAiSuggestion(cleanedEventId, suggestion);
        return Map.of("cleanedEventId", cleanedEventId, "suggestedDirection", suggestion, "model", chat.model());
    }
}
