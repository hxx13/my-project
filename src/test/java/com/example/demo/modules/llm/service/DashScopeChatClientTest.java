package com.example.demo.modules.llm.service;

import com.example.demo.modules.llm.service.DashScopeChatClient.ToolChatResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 解析层的单测。重点是**思考正文与思考 token** —— 这两项上游一直在返回，
 * 本仓库此前一个字段都没读（2026-10-11 实测确认），等于用户在干等时看不到模型「说了什么」。
 */
class DashScopeChatClientTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 带工具响应_思考正文与思考token都读回来() {
        String raw = """
                {"choices":[{"message":{"role":"assistant","content":"",
                  "reasoning_content":"先看看有没有这个人",
                  "tool_calls":[{"id":"c1","function":{"name":"searchPerson",
                    "arguments":"{\\"keyword\\":\\"张鹏\\"}"}}]}}],
                 "usage":{"prompt_tokens":100,"completion_tokens":50,
                   "completion_tokens_details":{"reasoning_tokens":30}}}
                """;

        ToolChatResult r = DashScopeChatClient.parseToolResponse(raw, "deepseek-flash", MAPPER);

        assertEquals("先看看有没有这个人", r.reasoningContent());
        assertEquals(30, r.reasoningTokens());
        // 带工具那轮正文常为空 —— 正是「用户看不到任何反馈」的由来
        assertEquals("", r.content());
        assertEquals(1, r.toolCalls().size());
        assertEquals("searchPerson", r.toolCalls().get(0).name());
        assertEquals(100, r.promptTokens());
        assertEquals(50, r.completionTokens());
    }

    @Test
    void 不带思考字段时_回落空串与0_不报错() {
        String raw = """
                {"choices":[{"message":{"role":"assistant","content":"好的"}}],
                 "usage":{"prompt_tokens":10,"completion_tokens":2}}
                """;

        ToolChatResult r = DashScopeChatClient.parseToolResponse(raw, "deepseek-flash", MAPPER);

        assertEquals("好的", r.content());
        assertEquals("", r.reasoningContent());
        assertEquals(0, r.reasoningTokens());
        assertTrue(r.toolCalls().isEmpty());
    }

    @Test
    void 上游返回错误体时_抛出带原因的异常() {
        String raw = "{\"error\":{\"message\":\"invalid model\"}}";

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> DashScopeChatClient.parseToolResponse(raw, "deepseek-flash", MAPPER));
        assertEquals("invalid model", e.getMessage());
    }
}
