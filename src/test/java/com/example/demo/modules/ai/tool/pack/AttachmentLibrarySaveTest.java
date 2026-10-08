package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.adminfile.AdminFileTemplateService;
import com.example.demo.modules.ai.excel.SpreadsheetTextExtractor;
import com.example.demo.modules.ai.excel.SpreadsheetWriter;
import com.example.demo.modules.ai.service.AiAttachmentService;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「清洗结果落进文件模板库」这条链。
 *
 * <p>钉三件事：① 写出来的 xlsx **能被自己的解析器读回来且逐格一致**（写/读是一对，错一边就白干）；
 * ② 落库调的是**既有**的 `saveUpload`，purpose=TEMPLATE、非临时、未归类；
 * ③ 缺扩展名要补、超行数要拒 —— 否则要么被库里拒（错误信息难懂），要么一次塞进五千行。
 */
class AttachmentLibrarySaveTest {

    private final ObjectMapper om = new ObjectMapper();
    private AdminFileTemplateService templateService;
    private AttachmentToolPack pack;

    @BeforeEach
    void setUp() {
        templateService = mock(AdminFileTemplateService.class);
        pack = new AttachmentToolPack(mock(AiAttachmentService.class), templateService);
    }

    private static AiToolContext ctx() {
        User u = new User();
        u.setId("STAFF_u1");
        u.setRole(RoleEnum.STAFF);
        return new AiToolContext(u, 1L, 2L);
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> name.equals(t.name())).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("写出去的 xlsx 必须能被自己的解析器读回来、逐格一致")
    void writerRoundTripsThroughExtractor() {
        byte[] xlsx = SpreadsheetWriter.toXlsx("名单",
                List.of("姓名", "工号", "日期"),
                List.of(List.of("张三", "S001", "2026-08-01"), List.of("李四", "S002", "2026-08-02")));

        SpreadsheetTextExtractor.Grid grid = new SpreadsheetTextExtractor().parse(xlsx);

        assertEquals(1, grid.sheetCount());
        assertEquals(3, grid.rowCount(0));
        assertEquals(List.of("姓名", "工号", "日期"), grid.sheets().get(0).rows().get(0));
        assertEquals(List.of("李四", "S002", "2026-08-02"), grid.sheets().get(0).rows().get(2));
    }

    @Test
    @DisplayName("落库调既有的 saveUpload：purpose=TEMPLATE、非临时、未归类；返回可下载路径")
    void savesThroughExistingUploadService() throws Exception {
        when(templateService.saveUpload(any(), anyString(), anyString(), anyBoolean(), isNull()))
                .thenReturn(Map.of("id", "AFT_TEST123", "originalName", "清洗结果.xlsx"));

        Map<?, ?> out = (Map<?, ?>) tool("saveSpreadsheetToLibrary").executor().execute(ctx(),
                om.readTree("""
                        {"filename":"清洗结果","headers":["姓名","工号"],
                         "rows":[["张三","S001"],["李四","S002"]]}"""));

        assertEquals(Boolean.TRUE, out.get("ok"), String.valueOf(out));
        assertEquals("清洗结果.xlsx", out.get("filename"), "缺 .xlsx 要自动补 —— 库按扩展名判类型");
        assertEquals("AFT_TEST123", out.get("templateId"));
        assertEquals("/api/admin/file-templates/AFT_TEST123/download", out.get("downloadPath"));
        assertEquals(2, out.get("rows"));

        ArgumentCaptor<MultipartFile> file = ArgumentCaptor.forClass(MultipartFile.class);
        verify(templateService).saveUpload(file.capture(), eq("STAFF_u1"), eq("TEMPLATE"), eq(false), isNull());
        assertEquals("清洗结果.xlsx", file.getValue().getOriginalFilename());
        // 落下去的必须是真的 xlsx（能被解析器读回），不是一段 JSON 或空白
        SpreadsheetTextExtractor.Grid written = new SpreadsheetTextExtractor().parse(file.getValue().getBytes());
        assertEquals(List.of("李四", "S002"), written.sheets().get(0).rows().get(2));
    }

    @Test
    @DisplayName("空内容不落库；超行数拒掉（AI 落库不是批量导入通道）")
    void refusesEmptyAndOversized() throws Exception {
        Map<?, ?> empty = (Map<?, ?>) tool("saveSpreadsheetToLibrary").executor().execute(ctx(),
                om.readTree("{\"filename\":\"空\",\"rows\":[]}"));
        assertEquals(Boolean.FALSE, empty.get("ok"));

        StringBuilder rows = new StringBuilder("[");
        for (int i = 0; i <= 5000; i++) {
            rows.append(i == 0 ? "" : ",").append("[\"r").append(i).append("\"]");
        }
        rows.append("]");
        Map<?, ?> tooMany = (Map<?, ?>) tool("saveSpreadsheetToLibrary").executor().execute(ctx(),
                om.readTree("{\"filename\":\"太多\",\"rows\":" + rows + "}"));
        assertEquals(Boolean.FALSE, tooMany.get("ok"));

        verify(templateService, never()).saveUpload(any(), anyString(), anyString(), anyBoolean(), any());
    }

    @Test
    @DisplayName("落库是写操作：必须过确认，且确认文案写清存哪个文件、多少行多少列")
    void requiresConfirmWithHumanDetail() throws Exception {
        assertTrue(tool("saveSpreadsheetToLibrary").requiresConfirm());
        assertFalse(tool("listAttachments").requiresConfirm());
        assertFalse(tool("readSpreadsheetAttachment").requiresConfirm());

        String detail = tool("saveSpreadsheetToLibrary").confirmDetailOf(om.readTree(
                "{\"filename\":\"清洗结果.xlsx\",\"headers\":[\"a\",\"b\"],\"rows\":[[\"1\",\"2\"],[\"3\",\"4\"]]}"));
        assertTrue(detail.contains("清洗结果.xlsx"), detail);
        assertTrue(detail.contains("2 行"), detail);
        assertTrue(detail.contains("2 列"), detail);
    }
}
