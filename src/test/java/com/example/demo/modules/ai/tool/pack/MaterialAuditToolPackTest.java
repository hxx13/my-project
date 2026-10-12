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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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

    // ── 「筛选条件别丢」：真机现场是课题组整个没了，导出变成全量（用户 2026-10-12 报） ──

    @Test
    @DisplayName("带维度的选项值按维度归位 —— 页签是「按物品」也拦不住课题组的归位")
    void taggedValueGoesToItsOwnDimension() {
        MaterialAuditToolPack.Filters f = MaterialAuditToolPack.mergeFilters(
                "item", null, null, null, null, null, "group:郑俊克的课题组", null);

        assertEquals("郑俊克的课题组", f.group, "课题组要落进 group");
        assertNull(f.itemKeyword, "**绝不能**顺手写进物品里 —— 那正是串槽");
        assertTrue(f.answered);
    }

    @Test
    @DisplayName("模型漏带已定的条件时，用会话记忆补上 —— 这就是「课题组丢了」那一处")
    void memoFillsWhatTheModelDropped() {
        Map<String, String> memo = Map.of("group", "郑俊克的课题组");

        // 模型这次只传了物品，课题组一个字没提
        MaterialAuditToolPack.Filters f = MaterialAuditToolPack.mergeFilters(
                "item", null, null, "白色运输盒", null, null, null, memo);

        assertEquals("郑俊克的课题组", f.group, "漏带的课题组要能从记忆里补回来");
        assertEquals("白色运输盒", f.itemKeyword);
    }

    @Test
    @DisplayName("显式参数优先于记忆 —— 换了个组就得听新的")
    void explicitBeatsMemo() {
        Map<String, String> memo = Map.of("group", "郑俊克的课题组");
        MaterialAuditToolPack.Filters f = MaterialAuditToolPack.mergeFilters(
                "group", "卢今的课题组", null, null, null, null, null, memo);

        assertEquals("卢今的课题组", f.group);
    }

    @Test
    @DisplayName("老写法（值不带维度）按页签推断，与既有行为一致")
    void untaggedStillWorks() {
        assertEquals("郑俊克的课题组", MaterialAuditToolPack.mergeFilters(
                "group", null, null, null, null, null, "郑俊克的课题组", null).group);
        assertEquals("1837104181878464513", MaterialAuditToolPack.mergeFilters(
                "personal", null, null, null, null, null, "1837104181878464513", null).applicant);
    }

    @Test
    @DisplayName("点了「全部」= 这一维不筛，但记下「已经答过了」，别再问一遍")
    void allMeansAnsweredWithoutFilter() {
        MaterialAuditToolPack.Filters f = MaterialAuditToolPack.mergeFilters(
                "group", null, null, null, null, null, "all", Map.of("group", "郑俊克的课题组"));

        assertTrue(f.answered, "明确说了全部，就不该再弹一次「导哪个课题组」");
        assertNull(f.group, "「全部」不该把记忆里的组又筛回来");
    }

    @Test
    @DisplayName("id 类选项同理归位：分类 / 物品 id 各回各家")
    void idDimensions() {
        assertEquals(3L, MaterialAuditToolPack.mergeFilters(
                "group", null, null, null, null, null, "category:3", null).categoryId);

        MaterialAuditToolPack.Filters f = MaterialAuditToolPack.mergeFilters(
                "group", null, null, null, null, null, "itemId:900001", null);
        assertEquals(900001L, f.itemId);
        assertNull(f.itemKeyword, "物品 id 不该顺手变成物品名过滤");
    }

    @Test
    @DisplayName("抽不出候选时**不许静默导全量** —— 宁可退回让用户放宽条件")
    void noCandidatesRefusesInsteadOfExportingEverything() throws Exception {
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of());

        Map<String, Object> out = run("{\"tab\":\"item\",\"from\":\"2026-10-01\",\"to\":\"2026-10-09\"}");

        assertEquals(Boolean.FALSE, out.get("ok"), "不能默默按全量往下走：" + out);
        verify(excelExportService, never()).summarizeItemFlow(any());
    }
}
