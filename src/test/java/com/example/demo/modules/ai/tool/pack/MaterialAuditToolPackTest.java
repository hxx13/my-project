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

import java.time.LocalDate;
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

    /**
     * 向导里第 n 道题的可点选项。
     *
     * <p>工具自 2026-10-13 起把「筛什么」与「哪段时间」合成 {@code questions:[{title,options}]} 一次问齐
     * （见 {@code askObject} 的注释：拆成两轮问，用户答了组才发现还差时间，而界面上又没得点）。
     * 早先读 {@code choices} 的断言从此恒为 null。
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> questionAt(Map<String, Object> out, int index) {
        if (!(out.get("questions") instanceof List<?> qs) || qs.size() <= index) {
            return List.of();
        }
        Map<String, Object> q = (Map<String, Object>) qs.get(index);
        return q.get("options") instanceof List<?> opts ? (List<Map<String, Object>>) opts : List.of();
    }

    /**
     * 候选要**拿用户嘴里那个名字筛**（2026-10-13 真机）。
     *
     * <p>用户说「郑均克那个组」，工具却摆了跟他毫无关系的前几个组，等于逼他从一份无关列表里认人。
     * 而名字写错一个字是最常见的写法，所以字面包含筛不出来时还要按**姓名相似度**再筛一遍；
     * 筛完只剩一个就**直接采用、不再问**（只有一个候选不成其为「选」）。
     */
    @Test
    @DisplayName("导出的对象候选按用户原话筛：说「郑均克」就认下「郑俊克的课题组」，不拿无关的那几个来问")
    void objectCandidatesAreNarrowedByUserWording() throws Exception {
        when(materialService.listGroupsWithRecords(any(), any(), any())).thenReturn(Result.success(List.of(
                "DLAS-实验动物管理", "TEST-A组", "郑俊克的课题组", "丁之德的课题组")));

        run("{\"tab\":\"group\",\"from\":\"2026-10-01\",\"to\":\"2026-10-13\",\"objectHint\":\"郑均克\"}");

        ArgumentCaptor<String> group = ArgumentCaptor.forClass(String.class);
        verify(materialService).collectAuditGridRows(any(), anyString(), anyString(), any(), group.capture(), any(), any());
        assertEquals("郑俊克的课题组", group.getValue(), "应当认下跟他说的有关的那个");
    }

    @Test
    @DisplayName("对象候选的筛法：字面一个都不中时，退回全量（宁可给宽的，不能给空的）")
    void objectCandidatesFallBackToFullList() throws Exception {
        when(materialService.listGroupsWithRecords(any(), any(), any())).thenReturn(Result.success(List.of(
                "DLAS-实验动物管理", "TEST-A组")));

        Map<String, Object> out = run("{\"tab\":\"group\",\"objectHint\":\"完全不相干\"}");

        assertEquals(3, questionAt(out, 0).size(), "两个组 + 全部：" + out.get("questions"));
    }

    @Test
    @DisplayName("「按物品」页签没指定物品 → 先问（可点选项 + 全部），且**不算摘要**")
    void itemTabAsksBeforeSummary() throws Exception {
        Map<String, Object> out = run("{\"tab\":\"item\",\"from\":\"2026-10-01\",\"to\":\"2026-10-09\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        List<Map<String, Object>> chips = questionAt(out, 0);
        assertFalse(chips.isEmpty(), "该把物品做成可点选项：" + out);
        assertEquals("2F-卡其色运输盒", chips.get(0).get("label"));
        assertEquals("all", chips.get(chips.size() - 1).get("value"), "要给一个「全部」兜底：" + chips);
        // 先问再算：全量摘要又慢又没意义
        verify(excelExportService, never()).summarizeItemFlow(any());
    }

    /**
     * 时间段也要给可点选项（2026-10-13 用户反馈）。
     *
     * <p>原先 L1 写的是「日期做不了芯片，用一句话问清」—— 后果是模型在正文里问「还差一个时间段」，
     * 界面上却没有可点项：用户只能自己敲日期，而敲出去那句里往往又把刚定的课题组丢了 → 必然再兜一轮。
     */
    @Test
    @DisplayName("没说时间段 → 预设档做成芯片，且与「筛什么」一次问齐（不拆成两轮）")
    void missingRangeIsOfferedAsChips() throws Exception {
        Map<String, Object> out = run("{\"tab\":\"item\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> questions = (List<Map<String, Object>>) out.get("questions");
        assertNotNull(questions, "该问：" + out);
        assertEquals(2, questions.size(), "「筛什么」和「哪段时间」要点一次问齐：" + questions);
        List<Map<String, Object>> ranges = questionAt(out, 1);
        assertEquals(5, ranges.size(), "预设档：" + ranges);
        assertEquals("今天（" + LocalDate.now().toString().substring(5) + " ~ "
                + LocalDate.now().toString().substring(5) + "）", ranges.get(0).get("label"));
    }

    @Test
    @DisplayName("范围芯片的值 → from/to；写反了也认，别拿反的区间去查")
    void rangeValueParsesToDatePair() {
        String[] ok = MaterialAuditToolPack.rangeOf("2026-10-07 ~ 2026-10-13");
        assertNotNull(ok);
        assertEquals("2026-10-07", ok[0]);
        assertEquals("2026-10-13", ok[1]);
        String[] flipped = MaterialAuditToolPack.rangeOf("2026-10-13 ~ 2026-10-07");
        assertEquals("2026-10-07", flipped[0], "先后写反了要掰正");
        assertNull(MaterialAuditToolPack.rangeOf("202A"), "普通候选值不能被当成时间范围");
        assertNull(MaterialAuditToolPack.rangeOf("group:郑俊克的课题组"));
        assertNull(MaterialAuditToolPack.rangeOf(null));
    }

    @Test
    @DisplayName("点了范围芯片 → 起止日期定下来，且**不会**被当成课题组名去筛")
    void rangeChoiceSetsFromToAndDoesNotLeakIntoFilters() throws Exception {
        run("{\"tab\":\"group\",\"filterChoice\":\"2026-10-07 ~ 2026-10-13\"}");

        ArgumentCaptor<String> from = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> to = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> group = ArgumentCaptor.forClass(String.class);
        verify(materialService).collectAuditGridRows(any(), from.capture(), to.capture(), any(), group.capture(), any(), any());
        assertEquals("2026-10-07", from.getValue());
        assertEquals("2026-10-13", to.getValue());
        assertNull(group.getValue(), "范围串不是课题组名：" + group.getValue());
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
