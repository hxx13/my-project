package com.example.demo.modules.ai.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.capability.AiCapabilityGate;
import com.example.demo.modules.ai.core.AiEventSink;
import com.example.demo.modules.ai.core.AiTurnStats;
import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.tool.AiPackRouter;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 编排层的**工具循环**：一条「写工具在挂起前先问一次」的调用，必须把它的候选
 * 接到载体上变成可点选芯片。
 *
 * <p>钉这条是因为真机漏过：预解析分支提前 return 时忘了做 {@code collectChoices}，
 * 结果模型只在正文里把候选念了一遍（「点一下即可」），而**一条 interaction 事件都没发** ——
 * 用户根本点不到。同一类漏法（新加一条返回路径、忘了接 sink）在挂起/澄清/执行三处都可能复发，
 * 所以这里直接驱动整条 {@code run()}，不测单个私有方法。
 */
class AiOrchestratorToolLoopTest {

    private DashScopeChatClient chatClient;
    private AiSessionService sessionService;
    private AiInteractionService interactionService;
    private CapturingSink sink;
    private java.util.concurrent.atomic.AtomicBoolean executed;

    /** 捕获载体收到的事件。 */
    private static final class CapturingSink implements AiEventSink {
        final List<String> interactions = new ArrayList<>();
        final List<String> deltas = new ArrayList<>();
        String error;

        @Override public void delta(String text) { deltas.add(text); }
        @Override public void tool(String name, String status) { }
        @Override public void interaction(String token, String kind, String question, List<Option> options, boolean multiSelect) {
            StringBuilder sb = new StringBuilder(kind).append('|').append(question).append('|');
            for (Option o : options) {
                sb.append(o.label()).append('=').append(o.value()).append(',');
            }
            interactions.add(sb.toString());
        }
        @Override public void usage(AiTurnStats stats) { }
        @Override public void done(AiTurnStats stats) { }
        @Override public void error(String code, String message) { this.error = code + ":" + message; }
    }

    /** 一个「写操作 + 挂起前要先问一次」的工具：没给 choice 就先回候选，给了就执行。 */
    private static AiTool writeToolWithPreConfirm(java.util.concurrent.atomic.AtomicBoolean executed) {
        String schema = """
                { "type": "object", "properties": { "pick": { "type": "string" } }, "additionalProperties": false }""";
        return new AiTool(
                "signSomething",
                "签一签某样东西。调用它会先挂起等你点确认。",
                schema, "cap.write", SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    executed.set(true);
                    return Map.of("ok", true, "note", "已执行");
                },
                (ctx, args) -> {
                    if (!args.path("pick").asText("").isBlank()) {
                        return null;
                    }
                    return Map.of("ok", false,
                            "reason", "有多个身份，让用户挑一个",
                            "choices", List.of(
                                    Map.of("label", "以「归属地」身份签署", "value", "ORIGIN"),
                                    Map.of("label", "以「兽医」身份签署", "value", "VET")),
                            "choicesTitle", "以哪个身份签署");
                },
                null);
    }

    private static User staff() {
        User u = new User();
        u.setId("u-1");
        u.setRole(RoleEnum.ADMIN);
        u.setUsername("tester");
        return u;
    }

    @BeforeEach
    void setUp() {
        chatClient = mock(DashScopeChatClient.class);
        sessionService = mock(AiSessionService.class);
        interactionService = mock(AiInteractionService.class);
        executed = new java.util.concurrent.atomic.AtomicBoolean(false);
        sink = new CapturingSink();

        AiToolPack pack = new AiToolPack() {
            @Override public String packKey() { return "test"; }
            @Override public String displayName() { return "测试包"; }
            @Override public String defaultPrompt() { return "测试用口径"; }
            @Override public List<AiTool> tools() { return List.of(writeToolWithPreConfirm(executed)); }
        };

        AiCapabilityGate gate = mock(AiCapabilityGate.class);
        when(gate.check(any(), anyString())).thenReturn(null);

        AiPromptService promptService = mock(AiPromptService.class);
        when(promptService.assemble(any(), anyString())).thenReturn("");
        this.promptService = promptService;

        when(sessionService.answeredToolCallIds(any())).thenReturn(java.util.Set.of());
        when(sessionService.window(any())).thenReturn(List.of());
        java.util.concurrent.atomic.AtomicLong seq = new java.util.concurrent.atomic.AtomicLong(1);
        when(sessionService.append(any(), anyString(), any(), any())).thenAnswer(inv -> {
            AiMessage m = new AiMessage();
            m.setId(seq.getAndIncrement());
            m.setRole(inv.getArgument(1));
            m.setContent(inv.getArgument(2));
            m.setRawToolCalls(inv.getArgument(3) instanceof AiMessage extra ? extra.getRawToolCalls() : null);
            m.setToolCallId(inv.getArgument(3) instanceof AiMessage extra ? extra.getToolCallId() : null);
            return m;
        });

        CageModeVisibilityService visibility = mock(CageModeVisibilityService.class);
        when(visibility.isStudent(any())).thenReturn(false);

        orchestrator = new AiOrchestrator(chatClient, new ToolRegistry(List.of(pack)), promptService,
                sessionService, mock(AiAuditService.class), gate, interactionService,
                new ObjectMapper(), visibility, new AiPackRouter(), attachmentService());
    }

    private AiOrchestrator orchestrator;
    private AiPromptService promptService;

    /** 附件服务替身：默认「这个会话没有任何附件」，于是预览注入路径是空跑。 */
    private static AiAttachmentService attachmentService() {
        AiAttachmentService s = mock(AiAttachmentService.class);
        when(s.listSession(any())).thenReturn(List.of());
        when(s.byMessageIds(any())).thenReturn(List.of());
        return s;
    }

    private DashScopeChatClient.ToolChatResult toolCall(String id, String name, String argsJson) {
        return new DashScopeChatClient.ToolChatResult("", List.of(new DashScopeChatClient.ToolCall(id, name, argsJson)),
                10, 5, "test-model");
    }

    private DashScopeChatClient.ToolChatResult textOnly(String text) {
        return new DashScopeChatClient.ToolChatResult(text, List.of(), 10, 5, "test-model");
    }

    @Test
    @DisplayName("挂起前预解析返回的候选，必须变成载体的可点选事件（漏接这个就是真机那次「点一下即可」却没有芯片）")
    void preConfirmChoicesReachTheCarrier() {
        when(chatClient.chatWithTools(any(), any()))
                .thenReturn(toolCall("call_1", "signSomething", "{}"))
                .thenReturn(textOnly("你要以哪个身份签？"));

        orchestrator.run(staff(), 1L, "签一下", null, sink);

        assertEquals(1, sink.interactions.size(), "候选必须变成 interaction 事件，不能在正文里念一遍就算");
        String ev = sink.interactions.get(0);
        assertTrue(ev.startsWith("clarify|"), "这是澄清类，不是确认类：" + ev);
        assertTrue(ev.contains("以「归属地」身份签署=ORIGIN"));
        assertTrue(ev.contains("以「兽医」身份签署=VET"));
        assertTrue(executed.get() == false, "身份还没定，写操作绝不能执行");
        assertEquals(null, sink.error);
    }

    @Test
    @DisplayName("身份已给时不走预解析，照常挂起等确认（挂起事件带 token）")
    void givenChoiceGoesStraightToConfirm() {
        when(interactionService.suspendConfirm(any(), any(), any(), anyString(), any()))
                .thenAnswer(inv -> {
                    com.example.demo.modules.ai.entity.AiInteraction it =
                            new com.example.demo.modules.ai.entity.AiInteraction();
                    it.setToken("tok-1");
                    it.setQuestion(inv.getArgument(3));
                    return it;
                });
        when(chatClient.chatWithTools(any(), any()))
                .thenReturn(toolCall("call_1", "signSomething", "{\"pick\":\"VET\"}"))
                .thenReturn(textOnly("好，等我确认"));

        orchestrator.run(staff(), 1L, "以兽医身份签", null, sink);

        verify(interactionService).suspendConfirm(any(), any(), any(), anyString(), any());
        assertTrue(executed.get() == false, "挂起阶段绝不能执行");
        assertEquals(1, sink.interactions.size());
        assertTrue(sink.interactions.get(0).startsWith("confirm|"), "这一步是确认类：" + sink.interactions.get(0));
    }

    @Test
    @DisplayName("只读工具不挂起也不走预解析 —— 别把确认流程套到查询上")
    void readToolIsNotAffected() {
        AiToolPack readPack = new AiToolPack() {
            @Override public String packKey() { return "r"; }
            @Override public String displayName() { return "只读包"; }
            @Override public String defaultPrompt() { return ""; }
            @Override public List<AiTool> tools() {
                return List.of(new AiTool("listThings", "列出东西。", "{}", "cap.read", SideEffect.READ,
                        (ctx, args) -> Map.of("ok", true, "total", 0)));
            }
        };
        AiCapabilityGate gate = mock(AiCapabilityGate.class);
        when(gate.check(any(), anyString())).thenReturn(null);
        AiOrchestrator orch = new AiOrchestrator(chatClient, new ToolRegistry(List.of(readPack)),
                promptService, sessionService, mock(AiAuditService.class), gate,
                interactionService, new ObjectMapper(), studentFalseVisibility(), new AiPackRouter(),
                attachmentService());

        when(chatClient.chatWithTools(any(), any()))
                .thenReturn(toolCall("call_1", "listThings", "{}"))
                .thenReturn(textOnly("没有待审的"));

        orch.run(staff(), 1L, "有什么要审的", null, sink);

        verify(interactionService, never()).suspendConfirm(any(), any(), any(), anyString(), any());
        assertEquals(0, sink.interactions.size());
    }

    @Test
    @DisplayName("一个工具一次问多件事：questions 数组要变成多条可点选事件，载体按顺序问")
    void multiQuestionToolEmitsOneEventPerQuestion() {
        AiToolPack multiPack = new AiToolPack() {
            @Override public String packKey() { return "multi"; }
            @Override public String displayName() { return "多问包"; }
            @Override public String defaultPrompt() { return ""; }
            @Override public List<AiTool> tools() {
                return List.of(new AiTool("publishThing", "发布东西。", "{}", "cap.write",
                        SideEffect.EXTERNAL_WRITE,
                        (ctx, args) -> Map.of("ok", true),
                        (ctx, args) -> Map.of("ok", false, "needUserChoice", true, "questions", List.of(
                                Map.of("title", "发到哪个栏目？", "options", List.of(
                                        Map.of("label", "公告", "value", "NOTICE"))),
                                Map.of("title", "优先级？", "options", List.of(
                                        Map.of("label", "重要", "value", "important"))),
                                Map.of("title", "现在就发？", "options", List.of(
                                        Map.of("label", "直接发布", "value", "PUBLISHED"),
                                        Map.of("label", "存草稿", "value", "DRAFT"))))),
                        null));
            }
        };
        AiCapabilityGate gate = mock(AiCapabilityGate.class);
        when(gate.check(any(), anyString())).thenReturn(null);
        AiOrchestrator orch = new AiOrchestrator(chatClient, new ToolRegistry(List.of(multiPack)),
                promptService, sessionService, mock(AiAuditService.class), gate,
                interactionService, new ObjectMapper(), studentFalseVisibility(), new AiPackRouter(),
                attachmentService());

        when(chatClient.chatWithTools(any(), any()))
                .thenReturn(toolCall("call_1", "publishThing", "{}"))
                .thenReturn(textOnly("先选一下发布配置"));

        orch.run(staff(), 1L, "发个公告", null, sink);

        assertEquals(3, sink.interactions.size(), "三问就该有三条事件，合成一条用户点了不知在答哪题：" + sink.interactions);
        assertTrue(sink.interactions.get(0).contains("发到哪个栏目？"), sink.interactions.get(0));
        assertTrue(sink.interactions.get(1).contains("优先级？"), sink.interactions.get(1));
        assertTrue(sink.interactions.get(2).contains("直接发布=PUBLISHED") && sink.interactions.get(2).contains("存草稿=DRAFT"),
                sink.interactions.get(2));
        assertEquals(null, sink.error);
    }

    private CageModeVisibilityService studentFalseVisibility() {
        CageModeVisibilityService v = mock(CageModeVisibilityService.class);
        when(v.isStudent(any())).thenReturn(false);
        return v;
    }
}
