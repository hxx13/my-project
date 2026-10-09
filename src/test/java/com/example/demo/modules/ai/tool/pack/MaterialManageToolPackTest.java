package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.MaterialCategoryView;
import com.example.demo.modules.material.dto.MaterialItemUpsertReq;
import com.example.demo.modules.material.dto.MaterialItemView;
import com.example.demo.modules.material.dto.InboundMaterialReq;
import com.example.demo.modules.material.service.MaterialService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 物品管理包的闸。
 *
 * <p>钉住的是**会写坏数据 / 会越权**的那几处：视角与能力判据、写操作必确认、
 * 审核人流程联动（问不齐不许提交）、FLAG 模式的数量折算、入库与纠偏不能互相冒充、
 * 以及「不可逆的删除根本不在这包里」。
 */
class MaterialManageToolPackTest {

    private MaterialService materialService;
    private MaterialManageToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        materialService = mock(MaterialService.class);
        pack = new MaterialManageToolPack(materialService, om);
        when(materialService.listCategoriesForAdmin(any())).thenReturn(List.of(category(2L, "清洁用品")));
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of(item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED")));
        when(materialService.listEligibleReviewers()).thenReturn(Result.success(List.of(
                teammate("STAFF_a", "张三"), teammate("STAFF_b", "李四"))));
    }

    private static MaterialCategoryView category(Long id, String name) {
        MaterialCategoryView c = new MaterialCategoryView();
        c.setId(id);
        c.setName(name);
        c.setStatus(1);
        return c;
    }

    private static MaterialItemView item(Long id, Long catId, String name, String shelf, String mode) {
        MaterialItemView v = new MaterialItemView();
        v.setId(id);
        v.setCategoryId(catId);
        v.setCategoryName("清洁用品");
        v.setName(name);
        v.setShelfStatus(shelf);
        v.setStockMode(mode);
        v.setStockQty(10);
        v.setLockedQty(2);
        v.setWorkflowType("SIMPLE");
        return v;
    }

    private static Map<String, Object> teammate(String id, String name) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", id);
        m.put("displayName", name);
        m.put("username", id);
        return m;
    }

    private User admin() {
        User u = new User();
        u.setId("STAFF_admin");
        u.setRole(RoleEnum.ADMIN);
        return u;
    }

    private User staff() {
        User u = new User();
        u.setId("STAFF_x");
        u.setRole(RoleEnum.STAFF);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String toolName, String json) throws Exception {
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) tool(toolName).executor()
                .execute(new AiToolContext(admin(), 1L, 2L, null), args);
    }

    @Test
    @DisplayName("视角闸：本包只服务教职工 —— 学生视角一条工具都不该拿到")
    void staffOnlyView() {
        assertEquals(java.util.Set.of(AiView.STAFF), pack.views(),
                "物品管理是教职工后台页；默认值虽也是 STAFF，但这里显式声明，别被改宽");
    }

    @Test
    @DisplayName("能力闸：ADMIN 起可见，STAFF 不可见（与页面权限表同口径）")
    void capabilityIsAdmin() {
        var cap = pack.capabilities().get(MaterialManageToolPack.CAP_MATERIAL_MANAGE);
        assertNotNull(cap);
        assertTrue(cap.test(admin()));
        assertFalse(cap.test(staff()), "STAFF 不该拿到物品管理");
    }

    @Test
    @DisplayName("写操作一律挂着确认；读操作不挂")
    void writesRequireConfirm() {
        for (String w : List.of("createMaterialCategory", "updateMaterialCategory", "deleteMaterialCategory",
                "createMaterialItem", "updateMaterialItem", "deleteMaterialItem",
                "inboundMaterialItem", "adjustMaterialStock", "restoreMaterialItem")) {
            assertTrue(tool(w).requiresConfirm(), w + " 是写操作，必须过确认");
        }
        for (String r : List.of("listMaterialCategories", "listMaterialItems",
                "listMaterialItemRecycle", "listMaterialReviewerCandidates")) {
            assertFalse(tool(r).requiresConfirm(), r + " 是只读，不必确认");
        }
    }

    @Test
    @DisplayName("不可逆的删除**根本不存在**：没有彻底删除 / 清空回收站这类工具")
    void noIrreversibleDeletes() {
        for (AiTool t : pack.tools()) {
            String n = t.name().toLowerCase();
            assertFalse(n.contains("purge") || n.contains("clear") || n.contains("wipe"),
                    "不可逆的批量删除不接进对话（purgeItem 还会级联删流水和申领单行）：" + t.name());
        }
    }

    @Test
    @DisplayName("非免审流程缺审核人 → 不提交，先把缺的这件事问回来")
    void missingReviewerIsAskedNotSubmitted() throws Exception {
        Map<String, Object> out = run("createMaterialItem",
                "{\"category\":\"清洁用品\",\"name\":\"新拖把\",\"workflow\":\"SIMPLE\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("审核人"), out.toString());
        verify(materialService, never()).createItem(any());
    }

    @Test
    @DisplayName("复核流程缺复审人 → 同样不提交")
    void missingSecondReviewerIsAsked() throws Exception {
        Map<String, Object> out = run("createMaterialItem",
                "{\"category\":\"清洁用品\",\"name\":\"新拖把\",\"workflow\":\"DUAL_REVIEW\",\"reviewers\":[\"张三\"]}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("复审"), out.toString());
        verify(materialService, never()).createItem(any());
    }

    @Test
    @DisplayName("审核人落库是 **JSON 数组字符串**（与页面同格式），且由姓名翻成 id")
    void reviewersSerializedAsJsonArrayString() throws Exception {
        when(materialService.createItem(any())).thenReturn(Result.success(item(9L, 2L, "新拖把", "DRAFT", "QUANTIFIED")));

        Map<String, Object> out = run("createMaterialItem",
                "{\"category\":\"清洁用品\",\"name\":\"新拖把\",\"workflow\":\"SIMPLE\",\"reviewers\":[\"张三\",\"李四\"]}");

        assertEquals(Boolean.TRUE, out.get("ok"), out.toString());
        ArgumentCaptor<MaterialItemUpsertReq> req = ArgumentCaptor.forClass(MaterialItemUpsertReq.class);
        verify(materialService).createItem(req.capture());
        assertEquals("[\"STAFF_a\",\"STAFF_b\"]", req.getValue().getReviewerIds(),
                "reviewerIds 必须是 JSON 数组字符串（页面就是这么存的）");
    }

    @Test
    @DisplayName("FLAG 模式只管有/无：初始数量 5 要折成 1")
    void flagModeClampsQtyToOne() throws Exception {
        when(materialService.createItem(any())).thenReturn(Result.success(item(9L, 2L, "纱布", "DRAFT", "FLAG")));

        run("createMaterialItem",
                "{\"category\":\"清洁用品\",\"name\":\"纱布\",\"stockMode\":\"FLAG\",\"initialQty\":5,\"workflow\":\"SKIP_REVIEW\"}");

        ArgumentCaptor<MaterialItemUpsertReq> req = ArgumentCaptor.forClass(MaterialItemUpsertReq.class);
        verify(materialService).createItem(req.capture());
        assertEquals(1, req.getValue().getStockQty(), "FLAG 模式数量只能是 0/1");
    }

    @Test
    @DisplayName("入库走的是**增量**接口，且回读后如实说「已顺带变成已上架」")
    void inboundIsDeltaAndReportsAutoPublish() throws Exception {
        // 入库前是草稿 → 入库后变已上架（服务端行为），回报要照实说
        when(materialService.listItemsForAdmin(any(), any()))
                .thenReturn(List.of(item(1L, 2L, "胶棉拖把", "DRAFT", "QUANTIFIED")));
        when(materialService.inbound(any(), any())).thenReturn(Result.success(null));
        MaterialItemView after = item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED");
        after.setStockQty(15);
        when(materialService.getItem(1L)).thenReturn(Result.success(after));

        Map<String, Object> out = run("inboundMaterialItem", "{\"items\":[{\"item\":\"胶棉拖把\",\"qty\":5}]}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<InboundMaterialReq> req = ArgumentCaptor.forClass(InboundMaterialReq.class);
        verify(materialService).inbound(any(), req.capture());
        assertEquals(5, req.getValue().getQty(), "入库传的是增量");
        assertTrue(String.valueOf(out.get("note")).contains("15"), "回读后的库存要在回报里：" + out.get("note"));
        assertTrue(String.valueOf(out.get("note")).contains("已上架"), "入库会把草稿转上架，要照实说：" + out.get("note"));
        verify(materialService, never()).adjustStock(any(), any(), anyInt());
    }

    @Test
    @DisplayName("入库支持**一次多件**：几件一次调用、一道确认，不是一件一次")
    void inboundAcceptsBatchInOneCall() throws Exception {
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of(
                item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED"),
                item(3L, 2L, "平板拖把", "PUBLISHED", "QUANTIFIED")));
        when(materialService.inbound(any(), any())).thenReturn(Result.success(null));
        when(materialService.getItem(any())).thenAnswer(inv -> {
            MaterialItemView v = item((Long) inv.getArgument(0), 2L, "x", "PUBLISHED", "QUANTIFIED");
            v.setStockQty(99);
            return Result.success(v);
        });

        Map<String, Object> out = run("inboundMaterialItem",
                "{\"items\":[{\"item\":\"胶棉拖把\",\"qty\":5},{\"item\":\"平板拖把\",\"qty\":10}]}");

        assertEquals(Boolean.TRUE, out.get("ok"), out.toString());
        // 两次入库都在同一次调用里完成（用户只点一次确认）
        verify(materialService, org.mockito.Mockito.times(2)).inbound(any(), any());
        String detail = tool("inboundMaterialItem").confirmDetailOf(
                om.readTree("{\"items\":[{\"item\":\"1\",\"qty\":5},{\"item\":\"3\",\"qty\":10}]}"));
        assertTrue(detail.contains("2 件"), "确认要说明这一批几件：" + detail);
        assertTrue(detail.contains("+5") && detail.contains("+10"), "要把每件进多少列出来：" + detail);
    }

    @Test
    @DisplayName("一次报超过 10 件 → 不办，请用户分批（防一次确认写太多行）")
    void inboundRejectsTooManyItems() throws Exception {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < 11; i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"item\":\"").append(i).append("\",\"qty\":1}");
        }
        sb.append("]}");

        Map<String, Object> out = run("inboundMaterialItem", sb.toString());

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("10"), out.toString());
        verify(materialService, never()).inbound(any(), any());
    }

    @Test
    @DisplayName("同一件在一批里报了两次 → 不办（最后进了多少谁也说不清）")
    void inboundRejectsDuplicateItem() throws Exception {
        Map<String, Object> out = run("inboundMaterialItem",
                "{\"items\":[{\"item\":\"胶棉拖把\",\"qty\":5},{\"item\":\"胶棉拖把\",\"qty\":3}]}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(materialService, never()).inbound(any(), any());
    }

    @Test
    @DisplayName("批量中途某件失败 → 把**已经进成的**如实报出来，不假装一件都没办")
    void inboundReportsPartialSuccess() throws Exception {
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of(
                item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED"),
                item(3L, 2L, "平板拖把", "PUBLISHED", "QUANTIFIED")));
        when(materialService.inbound(any(), any()))
                .thenReturn(Result.success(null))
                .thenReturn(Result.error("物品不存在"));
        when(materialService.getItem(1L)).thenReturn(Result.success(item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED")));

        Map<String, Object> out = run("inboundMaterialItem",
                "{\"items\":[{\"item\":\"胶棉拖把\",\"qty\":5},{\"item\":\"平板拖把\",\"qty\":10}]}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        String reason = String.valueOf(out.get("reason"));
        assertTrue(reason.contains("胶棉拖把"), "已经进成的那件要说出来：" + reason);
    }

    @Test
    @DisplayName("库存纠偏走的是**绝对值**接口，不和入库混")
    void adjustStockIsAbsolute() throws Exception {
        when(materialService.adjustStock(any(), any(), anyInt())).thenReturn(Result.success(null));
        MaterialItemView after = item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED");
        after.setStockQty(20);
        when(materialService.getItem(1L)).thenReturn(Result.success(after));

        Map<String, Object> out = run("adjustMaterialStock", "{\"item\":\"胶棉拖把\",\"newQty\":20}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        verify(materialService).adjustStock(any(), eq(1L), eq(20));
        verify(materialService, never()).inbound(any(), any());
        assertEquals(20, out.get("stockQty"));
    }

    @Test
    @DisplayName("名字命中多件 → 交回候选让用户挑，且一件也不动")
    void ambiguousNameReturnsCandidates() throws Exception {
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of(
                item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED"),
                item(3L, 2L, "平板拖把", "PUBLISHED", "QUANTIFIED")));

        Map<String, Object> out = run("deleteMaterialItem", "{\"item\":\"拖把\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNotNull(out.get("candidates"), "命中多件要交回候选：" + out);
        assertNotNull(out.get("choices"), "候选≤5 个要做成可点芯片");
        verify(materialService, never()).softDeleteItem(any(), any());
    }

    @Test
    @DisplayName("删分类要把「分类下有几件物品」如实说出来（服务端不拦，得靠这句话提醒人）")
    void deleteCategoryReportsItemCount() throws Exception {
        when(materialService.deleteCategory(2L)).thenReturn(Result.success(null));
        when(materialService.listItemsForAdmin(eq(2L), any())).thenReturn(List.of(
                item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED"),
                item(3L, 2L, "平板拖把", "PUBLISHED", "QUANTIFIED")));

        Map<String, Object> out = run("deleteMaterialCategory", "{\"category\":\"清洁用品\"}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        String note = String.valueOf(out.get("note"));
        assertTrue(note.contains("2 件"), "要提醒这个分类下有 2 件物品还指着它：" + note);
    }

    @Test
    @DisplayName("确认弹窗给人看的是**人话**，不是原始 JSON —— 尤其别把内部 id 甩给用户")
    void confirmDetailIsHumanReadable() throws Exception {
        when(materialService.getItem(1L)).thenReturn(Result.success(item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED")));

        String detail = tool("inboundMaterialItem").confirmDetailOf(
                om.readTree("{\"items\":[{\"item\":\"1\",\"qty\":5}]}"));

        assertTrue(detail.contains("胶棉拖把"), "id 要翻成物品名：" + detail);
        assertFalse(detail.contains("\"item\""), "不该是原始 JSON：" + detail);
    }

    @Test
    @DisplayName("「低于 N 件」由**服务端**筛（清单是截断返回的，模型自己比会漏）")
    void listFiltersByThresholdServerside() throws Exception {
        MaterialItemView low = item(1L, 2L, "快没了的", "PUBLISHED", "QUANTIFIED");
        low.setStockQty(10);
        low.setLockedQty(2);          // 可用 8
        MaterialItemView plenty = item(3L, 2L, "很充裕的", "PUBLISHED", "QUANTIFIED");
        plenty.setStockQty(500);
        plenty.setLockedQty(0);       // 可用 500
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of(low, plenty));

        Map<String, Object> out = run("listMaterialItems", "{\"availableBelow\":20}");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(1, items.size(), "只该回可用低于 20 的那件：" + items);
        assertEquals("快没了的", items.get(0).get("name"));
        assertEquals(1, out.get("matchedTotal"));
    }

    @Test
    @DisplayName("命中超过返回上限时，要如实报「共 N 件」而不是让模型以为就这些")
    void listReportsTotalWhenTruncated() throws Exception {
        List<MaterialItemView> many = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            many.add(item((long) i, 2L, "物品" + i, "PUBLISHED", "QUANTIFIED"));
        }
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(many);

        Map<String, Object> out = run("listMaterialItems", "{\"limit\":20}");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(20, items.size());
        assertEquals(30, out.get("matchedTotal"), "总数要说出来");
        assertTrue(String.valueOf(out.get("note")).contains("30"), "要提示共 30 件、只回了 20：" + out.get("note"));
    }

    @Test
    @DisplayName("物品列表要报「可用 = 现有 − 锁定」，不能只报现有")
    void listReportsAvailableQty() throws Exception {
        Map<String, Object> out = run("listMaterialItems", "{}");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(10, items.get(0).get("stockQty"));
        assertEquals(2, items.get(0).get("lockedQty"));
        assertEquals(8, items.get(0).get("availableQty"), "只报现有会让用户以为还能领");
    }

    @Test
    @DisplayName("锁定量是负数（脏数据）时，可用量按现有封顶并标出来 —— 绝不报「可用 > 现有」")
    void negativeLockedQtyIsFlaggedNotAmplified() throws Exception {
        MaterialItemView bad = item(1L, 2L, "胶棉拖把", "PUBLISHED", "QUANTIFIED");
        bad.setStockQty(52);
        bad.setLockedQty(-24);   // 真机在 material_item 上撞到过（4 件都是负锁定量）
        when(materialService.listItemsForAdmin(any(), any())).thenReturn(List.of(bad));

        Map<String, Object> out = run("listMaterialItems", "{}");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(52, items.get(0).get("availableQty"), "可用不该超过现有");
        assertEquals(-24, items.get(0).get("lockedQty"), "原始锁定量照报（存原始，不藏异常）");
        assertNotNull(items.get(0).get("dataWarning"), "要显式标出来，别让它看着像我们算错了：" + items.get(0));
    }

    @Test
    @DisplayName("可选参数不许变成必填：不带分类地查物品列表要能过")
    void listItemsWithoutCategoryWorks() throws Exception {
        Map<String, Object> out = run("listMaterialItems", "{\"keyword\":\"拖把\"}");

        assertEquals(Boolean.TRUE, out.get("ok"), "分类是可选筛选项，没传不该被当成错误：" + out);
    }
}
