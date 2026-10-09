package com.example.demo.modules.ai.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.capability.AiCapabilityGate;
import com.example.demo.modules.ai.core.AiEventSink;
import com.example.demo.modules.ai.core.AiTurnStats;
import com.example.demo.modules.ai.entity.AiAttachment;
import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.excel.SpreadsheetTextExtractor;
import com.example.demo.modules.ai.mapper.AiGatewayMapper;
import com.example.demo.modules.ai.tool.AiPackRouter;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 附件通道：**表格进请求 → 解析入库 → 预览注入模型消息**。
 *
 * <p>钉的是这条设计里最容易被做错的一环：全量进库、预览进消息。
 * 若把整张表拼进消息，会撑爆窗口且每轮重复付费；若不注入预览，模型根本不知道有这张表。
 * 另一个必须钉的是**解析失败不能把整轮弄挂** —— 传错文件要能说清，而不是变成「助手坏了」。
 */
class AiAttachmentChannelTest {

    private DashScopeChatClient chatClient;
    private AiSessionService sessionService;
    private AiGatewayMapper mapper;
    private AiAttachmentService attachmentService;
    private final ObjectMapper om = new ObjectMapper();
    private CapturingSink sink;
    private AiOrchestrator orchestrator;

    private static final class CapturingSink implements AiEventSink {
        final List<String> deltas = new ArrayList<>();
        String error;

        @Override public void delta(String text) { deltas.add(text); }
        @Override public void tool(String name, String status) { }
        @Override public void interaction(String t, String k, String q, List<Option> o, boolean m) { }
        @Override public void usage(AiTurnStats stats) { }
        @Override public void done(AiTurnStats stats) { }
        @Override public void error(String code, String message) { this.error = code + ":" + message; }
    }

    private static User staff() {
        User u = new User();
        u.setId("STAFF_u1");
        u.setRole(RoleEnum.STAFF);
        u.setUsername("tester");
        return u;
    }

    private static byte[] simpleXlsx() throws Exception {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet("名单");
            // 注意：POI 的 createRow(n) 会**替换**已存在的行 —— 一行要先把 Row 拿住再加单元格，
            // 否则第二次 createRow 会把前一列悄悄抹掉（本测试第一版就踩了，看起来像解析器丢了列）。
            org.apache.poi.ss.usermodel.Row h = s.createRow(0);
            h.createCell(0).setCellValue("姓名");
            h.createCell(1).setCellValue("日期");
            org.apache.poi.ss.usermodel.Row r1 = s.createRow(1);
            r1.createCell(0).setCellValue("张三");
            r1.createCell(1).setCellValue("2026/8/1");
            org.apache.poi.ss.usermodel.Row r2 = s.createRow(2);
            r2.createCell(0).setCellValue("李四");
            r2.createCell(1).setCellValue("2026/8/2");
            wb.write(out);
            return out.toByteArray();
        }
    }

    @BeforeEach
    void setUp() {
        chatClient = mock(DashScopeChatClient.class);
        sessionService = mock(AiSessionService.class);
        mapper = mock(AiGatewayMapper.class);
        sink = new CapturingSink();

        // 真实解析器 + 真实附件服务，只把 mapper 换成替身（模拟"库里存着这份附件"）
        attachmentService = new AiAttachmentService(mapper, new SpreadsheetTextExtractor(), om);
        when(mapper.insertAttachment(any())).thenReturn(1);
        when(mapper.selectAttachmentsBySession(any())).thenReturn(List.of());

        AiToolPack pack = new AiToolPack() {
            @Override public String packKey() { return "t"; }
            @Override public String displayName() { return "测试包"; }
            @Override public String defaultPrompt() { return ""; }
            @Override public List<AiTool> tools() {
                return List.of(new AiTool("noop", "啥也不做。", "{}", "cap", SideEffect.READ, (c, a) -> Map.of("ok", true)));
            }
        };
        AiCapabilityGate gate = mock(AiCapabilityGate.class);
        when(gate.check(any(), anyString())).thenReturn(null);
        AiPromptService promptService = mock(AiPromptService.class);
        when(promptService.assemble(any(), anyString())).thenReturn("");

        when(sessionService.answeredToolCallIds(any())).thenReturn(java.util.Set.of());
        when(sessionService.append(any(), anyString(), any(), any())).thenAnswer(inv -> {
            AiMessage m = new AiMessage();
            m.setId(100L);
            m.setRole(inv.getArgument(1));
            m.setContent(inv.getArgument(2));
            return m;
        });

        CageModeVisibilityService visibility = mock(CageModeVisibilityService.class);
        when(visibility.isStudent(any())).thenReturn(false);

        orchestrator = new AiOrchestrator(chatClient, new ToolRegistry(List.of(pack)), promptService,
                sessionService, mock(AiAuditService.class), gate, mock(AiInteractionService.class),
                om, visibility, new AiPackRouter(), attachmentService,
                mock(com.example.demo.modules.ai.export.service.AiExportArtifactService.class));
    }

    /** 让 window 里那条用户消息（id=100）与刚存进去的附件对得上。 */
    private void stubWindowAndAttachments(AiAttachment captured) {
        AiMessage user = new AiMessage();
        user.setId(100L);
        user.setRole("user");
        user.setContent("把这些日期统一成 YYYY-MM-DD");
        when(sessionService.window(any())).thenReturn(List.of(user));
        when(mapper.selectAttachmentsByMessageIds(any()))
                .thenReturn(captured == null ? List.of() : List.of(captured));
    }

    private List<Map<String, Object>> runAndCaptureMessages(List<AiOrchestrator.SpreadsheetPart> sheets,
                                                            AiAttachment captured) {
        stubWindowAndAttachments(captured);
        when(chatClient.chatWithTools(any(), any()))
                .thenReturn(new DashScopeChatClient.ToolChatResult("好的", List.of(), 10, 5, "m"));
        orchestrator.run(staff(), 1L, "把这些日期统一成 YYYY-MM-DD", null, sink, null, sheets);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> captor = ArgumentCaptor.forClass(List.class);
        // 本 helper 会被调多次（先跑一次拿到解析结果、再跑一次验注入），所以是 atLeastOnce，
        // getValue() 拿最后一次 —— 按「恰好一次」验会自己把自己绊倒。
        verify(chatClient, org.mockito.Mockito.atLeastOnce()).chatWithTools(captor.capture(), any());
        return captor.getValue();
    }

    @Test
    @DisplayName("传了 xlsx：解析入库，并把**预览**拼进那条用户消息（全量不进消息）")
    void spreadsheetIsParsedAndPreviewInjected() throws Exception {
        String b64 = Base64.getEncoder().encodeToString(simpleXlsx());
        AtomicReference<AiAttachment> stored = new AtomicReference<>();
        when(mapper.insertAttachment(any())).thenAnswer(inv -> {
            AiAttachment a = inv.getArgument(0);
            a.setId(7L);
            stored.set(a);
            return 1;
        });

        // 第一次跑：只为了让 insertAttachment 捕获到解析结果
        runAndCaptureMessages(List.of(new AiOrchestrator.SpreadsheetPart("名单.xlsx", b64)), null);
        AiAttachment a = stored.get();
        assertEquals("名单.xlsx", a.getFilename());
        assertEquals(1, a.getSheetCount());
        assertEquals(3, a.getRowCount());
        assertEquals(2, a.getColCount());

        // 第二次跑：把「库里已有这份附件」喂回去，验预览真的进了发给模型的消息
        List<Map<String, Object>> messages =
                runAndCaptureMessages(List.of(new AiOrchestrator.SpreadsheetPart("名单.xlsx", b64)), a);

        String userContent = String.valueOf(messages.stream()
                .filter(m -> "user".equals(m.get("role")))
                .map(m -> m.get("content"))
                .filter(c -> c instanceof String s && s.contains("日期"))
                .findFirst().orElse(""));
        assertTrue(userContent.contains("【附件】名单.xlsx"), "预览必须带上文件名与附件 id：" + userContent);
        assertTrue(userContent.contains("附件 id=7"), "要给出附件 id，后续分段读靠它：" + userContent);
        assertTrue(userContent.contains("张三"), "预览里要有数据行，模型才认得出表头与列语义");
        assertTrue(userContent.contains("2026/8/1"), "原始值照原样给出，清洗由模型判断");
    }

    @Test
    @DisplayName("传的不是表格：**只提示、不整轮失败**（传错文件不该表现成「助手坏了」）")
    void badFileDoesNotKillTheTurn() {
        String notXlsx = Base64.getEncoder().encodeToString("这不是表格".getBytes());
        when(sessionService.window(any())).thenReturn(List.of());
        when(mapper.selectAttachmentsByMessageIds(any())).thenReturn(List.of());
        when(chatClient.chatWithTools(any(), any()))
                .thenReturn(new DashScopeChatClient.ToolChatResult("我看看", List.of(), 10, 5, "m"));

        orchestrator.run(staff(), 1L, "看看这份", null, sink, null,
                List.of(new AiOrchestrator.SpreadsheetPart("坏文件.xlsx", notXlsx)));

        assertEquals(null, sink.error, "解析失败不能报成整轮错误");
        assertTrue(sink.deltas.stream().anyMatch(d -> d.contains("坏文件.xlsx") && d.contains("没能读取")),
                "要说清是哪份文件没读成：" + sink.deltas);
        verify(mapper, org.mockito.Mockito.never()).insertAttachment(any());
    }
}
