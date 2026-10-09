package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.excel.SubtotalSummary;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.MaterialItemView;
import com.example.demo.modules.material.service.MaterialExcelExportService;
import com.example.demo.modules.material.service.MaterialService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 申领审计导出包的闸。
 *
 * <p>钉住的是**每个页签的「对象」没定就先问**（真机反馈：选了「按物品」页签，工具直接跳到
 * 「小计怎么配」，一句都没问用户要筛哪件物品），以及问过之后按 filterChoice 落到对应参数上。
 */
class MaterialAuditToolPackTest {

    private MaterialService materialService;
    private MaterialExcelExportService excelExportService;
    private MaterialAuditToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        materialService = mock(MaterialService.class);
        excelExportService = mock(MaterialExcelExportService.class);
        pack = new MaterialAuditToolPack(materialService, excelExportService, null);
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of(
                item(10L, "2F-卡其色运输盒"), item(13L, "B1F-卡其色运输盒")));
        // 摘要器给个非空壳：不问对象的用例会一路走到「小计怎么配」那一步
        SubtotalSummary shell = new SubtotalSummary(List.of("total"), Map.of(), List.of(),
                new SubtotalSummary.Totals(3, 1, Map.of()));
        when(excelExportService.summarizeItemFlow(any())).thenReturn(shell);
        when(excelExportService.summarizeAuditGrid(any())).thenReturn(shell);
    }

    private static MaterialItemView item(Long id, String name) {
        MaterialItemView v = new MaterialItemView();
        v.setId(id);
        v.setName(name);
        return v;
    }

    private User user() {
        User u = new User();
        u.setId("STAFF_u");
        return u;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String json) throws Exception {
        AiTool t = pack.tools().stream().filter(x -> x.name().equals("prepareMaterialAuditExport"))
                .findFirst().orElseThrow();
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) t.executor().execute(new AiToolContext(user(), 1L, 2L, null), args);
    }

    @Test
    @DisplayName("「按物品」页签没指定物品 → 先问（可点选项 + 全部），且**不算摘要**")
    @SuppressWarnings("unchecked")
    void itemTabAsksBeforeSummary() throws Exception {
        Map<String, Object> out = run("{\"tab\":\"item\",\"from\":\"2026-10-01\",\"to\":\"2026-10-09\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        List<Map<String, Object>> chips = (List<Map<String, Object>>) out.get("choices");
        assertNotNull(chips, "该把物品做成可点选项：" + out);
        assertEquals("2F-卡其色运输盒", chips.get(0).get("label"));
        assertEquals("all", chips.get(chips.size() - 1).get("value"), "要给一个「全部」兜底：" + chips);
        // 先问再算：全量摘要又慢又没意义
        verify(excelExportService, never()).summarizeItemFlow(any());
    }

    @Test
    @DisplayName("点了具体物品 → 落成 itemKeyword 继续（不再问）")
    void filterChoiceBecomesItemKeyword() throws Exception {
        run("{\"tab\":\"item\",\"from\":\"2026-10-01\",\"to\":\"2026-10-09\",\"filterChoice\":\"2F-卡其色运输盒\"}");

        ArgumentCaptor<String> kw = ArgumentCaptor.forClass(String.class);
        verify(materialService).collectItemFlowExportRows(any(), anyString(), anyString(), any(), any(), kw.capture());
        assertEquals("2F-卡其色运输盒", kw.getValue(), "选中的物品要落到 itemKeyword 上");
    }

    @Test
    @DisplayName("点「全部」→ 不再追问，照常往下走")
    void allChoiceSkipsAsking() throws Exception {
        run("{\"tab\":\"item\",\"from\":\"2026-10-01\",\"to\":\"2026-10-09\",\"filterChoice\":\"all\"}");

        ArgumentCaptor<String> kw = ArgumentCaptor.forClass(String.class);
        verify(materialService).collectItemFlowExportRows(any(), anyString(), anyString(), isNull(), isNull(), kw.capture());
        assertTrue(kw.getValue() == null || kw.getValue().isBlank(), "「全部」= 不带物品过滤：" + kw.getValue());
    }
}
