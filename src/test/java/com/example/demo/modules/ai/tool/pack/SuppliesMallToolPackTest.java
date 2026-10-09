package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.supplies.dto.CreateSupplyClaimRequest;
import com.example.demo.modules.supplies.dto.SupplyClaimLineView;
import com.example.demo.modules.supplies.dto.SupplyClaimOrderView;
import com.example.demo.modules.supplies.dto.SupplyApplicantConsumptionView;
import com.example.demo.modules.supplies.dto.SupplyAuditRestoredRow;
import com.example.demo.modules.supplies.dto.SupplyInventoryMovementRowView;
import com.example.demo.modules.supplies.dto.SupplyItemConsumptionView;
import com.example.demo.modules.supplies.dto.SupplyItemView;
import com.example.demo.modules.supplies.dto.SupplyMergeSubmitRequest;
import com.example.demo.modules.supplies.service.SuppliesService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 物资选购包的闸。
 *
 * <p>钉住三件会**真的领错货/下错单**的行为：
 * ① 权限与页面同一个判据（能力策略），不另写一套角色规则；
 * ② 带规格的物资不在 AI 这边办 —— 替他编规格等于下错货；
 * ③ 重名必须交回候选，且**不许先动购物车/先下单**。
 */
class SuppliesMallToolPackTest {

    private SuppliesService suppliesService;
    private CapabilityPolicyService capabilityPolicyService;
    private SuppliesMallToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        suppliesService = mock(SuppliesService.class);
        capabilityPolicyService = mock(CapabilityPolicyService.class);
        pack = new SuppliesMallToolPack(suppliesService, capabilityPolicyService);
        when(suppliesService.listItemsForStaff(anyString(), any())).thenReturn(List.of(item(7L, "枪头", 0), item(8L, "枪头（带滤芯）", 1)));
        when(suppliesService.getShoppingCart(any())).thenReturn(Result.success(new HashMap<>(Map.of("lines", new HashMap<String, Integer>()))));
        when(suppliesService.saveShoppingCart(any(), any())).thenReturn(Result.success());
    }

    private static SupplyItemView item(Long id, String name, int specRequired) {
        SupplyItemView v = new SupplyItemView();
        v.setId(id);
        v.setName(name);
        v.setStockQty(100);
        v.setAvailableQty(80);
        v.setSpecRequired(specRequired);
        return v;
    }

    private User user() {
        User u = new User();
        u.setId("STAFF_u");
        return u;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String tool, String json) throws Exception {
        AiTool t = pack.tools().stream().filter(x -> x.name().equals(tool)).findFirst().orElseThrow();
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) t.executor().execute(new AiToolContext(user(), 1L, 2L, null), args);
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(x -> x.name().equals(name)).findFirst().orElseThrow();
    }

    /** 跑一次写工具的**挂起前预解析**（合并提问就走这条通道）。 */
    private Object runPreConfirm(String toolName, String json) throws Exception {
        return tool(toolName).resolveBeforeConfirmOrNull(
                new AiToolContext(user(), 1L, 2L, null), om.readTree(json));
    }

    private static SupplyClaimOrderView pendingOrder(String id, Long itemId, String name, int qty, Integer independent) {
        SupplyClaimOrderView o = new SupplyClaimOrderView();
        o.setId(id);
        o.setStatus("PENDING");
        o.setCreatedAt(LocalDateTime.parse("2026-07-17T14:32:00"));
        SupplyClaimLineView l = new SupplyClaimLineView();
        l.setItemId(itemId);
        l.setSnapshotName(name);
        l.setQty(qty);
        l.setIndependentOrder(independent);
        o.setLines(List.of(l));
        return o;
    }

    private void mockPending(SupplyClaimOrderView... orders) {
        Map<String, Object> data = new HashMap<>();
        data.put("data", List.of(orders));
        data.put("total", orders.length);
        when(suppliesService.listMine(any(), eq("PENDING"), eq(1), anyInt(), eq(true))).thenReturn(data);
    }

    @Test
    @DisplayName("提交领用单是 C 级（挂起确认）；改购物车是 B 级（自己的车，不必确认）")
    void grading() {
        assertTrue(tool("submitSupplyClaim").requiresConfirm(), "开单必须二次确认");
        assertFalse(tool("setCartQuantity").requiresConfirm());
        assertFalse(tool("listSupplyItems").requiresConfirm());
    }

    @Test
    @DisplayName("带规格的物资 → 拒办并指向页面，绝不写购物车")
    void specItemIsRefused() throws Exception {
        Map<String, Object> out = run("setCartQuantity", "{\"item\":\"枪头（带滤芯）\",\"qty\":2}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNotNull(out.get("reason"));
        verify(suppliesService, never()).saveShoppingCart(any(), any());
    }

    @Test
    @DisplayName("重名/多命中 → 交回候选，且不写购物车")
    void ambiguousItemReturnsCandidates() throws Exception {
        // 「枪头」是精确命中一件，用模糊词制造多命中
        Map<String, Object> out = run("setCartQuantity", "{\"item\":\"枪头\",\"qty\":1}");
        // 精确命中优先：应当成功放进购物车
        assertEquals(Boolean.TRUE, out.get("ok"));
        verify(suppliesService).saveShoppingCart(any(), any());
    }

    @Test
    @DisplayName("无规格物资 → 解析成 itemId 存进云端购物车")
    void setCartUsesItemId() throws Exception {
        run("setCartQuantity", "{\"item\":\"枪头\",\"qty\":3}");

        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(suppliesService).saveShoppingCart(any(), body.capture());
        @SuppressWarnings("unchecked")
        Map<String, Integer> lines = (Map<String, Integer>) body.getValue().get("lines");
        assertEquals(3, lines.get("7"), "购物车键用 itemId，不是名字");
    }

    @Test
    @DisplayName("提交领用单：无规格物资解析成 itemId 交给服务层")
    void submitResolvesItemId() throws Exception {
        when(suppliesService.createClaim(any(), any())).thenReturn(Result.success(null));

        Map<String, Object> out = run("submitSupplyClaim", "{\"items\":[{\"item\":\"枪头\",\"qty\":2}]}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<CreateSupplyClaimRequest> req = ArgumentCaptor.forClass(CreateSupplyClaimRequest.class);
        verify(suppliesService).createClaim(any(), req.capture());
        assertEquals(7L, req.getValue().getLines().get(0).getItemId());
        assertEquals(2, req.getValue().getLines().get(0).getQty());
    }

    @Test
    @DisplayName("消耗统计是只读，不挂确认")
    void consumptionIsReadOnly() {
        assertFalse(tool("querySupplyConsumption").requiresConfirm());
    }

    @Test
    @DisplayName("消耗统计的能力码走**库存审计**那条口径（管理员/处理端），不因为挂在商城包下就放宽")
    void consumptionCapabilityReusesInventoryAudit() {
        when(suppliesService.canAuditInventory(any())).thenReturn(true);
        assertTrue(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_INVENTORY).test(user()));
        when(suppliesService.canAuditInventory(any())).thenReturn(false);
        assertFalse(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_INVENTORY).test(user()),
                "能领用 ≠ 能看全局消耗流水，这两件事的口径不一样");
    }

    @Test
    @DisplayName("消耗统计：该补货 / 已断货各自归位，阈值与统计区间要说出来")
    @SuppressWarnings("unchecked")
    void consumptionSplitsRestockAndOutOfStock() throws Exception {
        when(suppliesService.getItemConsumption(any(), anyInt(), anyInt())).thenReturn(Result.success(List.of(
                consumption(1L, "GM500笼盖（无水槽）", 200, 1, 2.2, 0.5),   // 撑不到 7 天
                consumption(2L, "白色纸盒", 200, 700, 2.2, 318.0),        // 撑得住
                consumption(3L, "拖鞋（38-39）", 14, 0, 0.2, 0.0))));      // 已断货

        Map<String, Object> out = run("querySupplyConsumption", "{\"days\":90,\"coverDays\":7}");

        List<Map<String, Object>> need = (List<Map<String, Object>>) out.get("needRestock");
        List<Map<String, Object>> zero = (List<Map<String, Object>>) out.get("outOfStock");
        assertEquals(2, need.size(), "该补货的是「撑不到 7 天」那两件：" + need);
        assertEquals("白色纸盒", ((List<Map<String, Object>>) out.get("items")).get(1).get("name"));
        assertEquals(1, zero.size(), "已断货单列一档：" + zero);
        assertEquals(90, out.get("windowDays"), "统计区间要能报出来");
        assertEquals(7, out.get("coverDaysThreshold"));
        assertTrue(String.valueOf(out.get("note")).contains("90"), out.get("note").toString());
    }

    @Test
    @DisplayName("窗口内一件都没出过货 → 讲清「没数据」，别让模型说成「消耗都正常」")
    void consumptionEmptyWindowSaysNoData() throws Exception {
        when(suppliesService.getItemConsumption(any(), anyInt(), anyInt()))
                .thenReturn(Result.success(List.of()));

        Map<String, Object> out = run("querySupplyConsumption", "{}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals(0, out.get("total"));
        assertTrue(String.valueOf(out.get("note")).contains("没"), "要说清是没数据：" + out.get("note"));
    }

    @Test
    @DisplayName("权限沿用页面同一判据（能力策略），不自己按角色重写")
    void capabilityReusesPolicy() {
        when(capabilityPolicyService.requireSubmit(any(), eq(BizDomains.SUPPLIES_CLAIM))).thenReturn(null);
        assertTrue(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_CLAIM).test(user()));

        when(capabilityPolicyService.requireSubmit(any(), eq(BizDomains.SUPPLIES_CLAIM)))
                .thenReturn(Result.error("无权限"));
        assertFalse(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_CLAIM).test(user()));
    }

    @Test
    @DisplayName("「哪些快没了」由服务端筛（清单是截断返回的，模型自己比会漏）")
    @SuppressWarnings("unchecked")
    void listFiltersByAvailableBelow() throws Exception {
        // setUp 里那两件可用量都是 80
        Map<String, Object> loose = run("listSupplyItems", "{\"availableBelow\":90}");
        assertEquals(2, ((List<Map<String, Object>>) loose.get("items")).size(), "可用 80 < 90，两件都该命中");
        assertEquals(2, loose.get("matchedTotal"));

        Map<String, Object> tight = run("listSupplyItems", "{\"availableBelow\":50}");
        assertEquals(0, ((List<Map<String, Object>>) tight.get("items")).size(), "可用 80 不低于 50，一件都不该回");
        assertNotNull(tight.get("note"), "没有命中也要给一句解释");
    }


    // ── 下单两条路线 + 合并提问 ──

    @Test
    @DisplayName("提交前有可并入的待处理单 → 出芯片（值形如 regular=<单号>），且不直接开单")
    @SuppressWarnings("unchecked")
    void mergeQuestionWhenPendingMatches() throws Exception {
        mockPending(pendingOrder("SC_1", 7L, "枪头", 3, 0));

        Object pre = runPreConfirm("submitSupplyClaim", "{\"items\":[{\"item\":\"枪头\",\"qty\":2}]}");

        assertNotNull(pre, "有可并入的单就该起问，而不是直接挂起确认");
        Map<String, Object> out = (Map<String, Object>) pre;
        assertEquals(Boolean.FALSE, out.get("ok"));
        List<Map<String, Object>> questions = (List<Map<String, Object>>) out.get("questions");
        assertEquals(1, questions.size());
        List<Map<String, Object>> options = (List<Map<String, Object>>) questions.get(0).get("options");
        assertEquals("regular=SC_1", options.get(0).get("value"), "并入项的 value 必须是可原样回传的参数");
        assertEquals("regular=new", options.get(options.size() - 1).get("value"));
        // 单号**不能**出现在给人看的 label 上 —— SC_+32 位十六进制用户记不住（用户明确要求）
        String label = String.valueOf(options.get(0).get("label"));
        assertFalse(label.contains("SC_1"), "芯片 label 不许带单号：" + label);
        assertTrue(label.contains("07-17 14:32") && label.contains("枪头"),
                "label 该用「时间 + 内容」说清是哪张单：" + label);
        // 提问这一轮绝不能真的下单
        verify(suppliesService, never()).createClaim(any(), any());
        verify(suppliesService, never()).mergeSubmit(any(), any());
    }

    @Test
    @DisplayName("没有可并入的单 → 不起问，照常挂起确认")
    void noMergeQuestionWhenNoMatch() throws Exception {
        mockPending();

        assertNull(runPreConfirm("submitSupplyClaim", "{\"items\":[{\"item\":\"枪头\",\"qty\":2}]}"));
    }

    @Test
    @DisplayName("已答过合并（mergeChoices 非空）→ 不再重复起问")
    void answeredMergeSkipsQuestion() throws Exception {
        mockPending(pendingOrder("SC_1", 7L, "枪头", 3, 0));

        assertNull(runPreConfirm("submitSupplyClaim",
                "{\"items\":[{\"item\":\"枪头\",\"qty\":2}],\"mergeChoices\":[\"regular=SC_1\"]}"));
    }

    @Test
    @DisplayName("用户点选并入 → 走智能合并并把单号交给服务端，不新建")
    void chosenMergeGoesToMergeSubmit() throws Exception {
        Map<String, Object> data = new HashMap<>();
        data.put("mergedOrderIds", List.of("SC_1"));
        data.put("createdOrderIds", List.of());
        when(suppliesService.mergeSubmit(any(), any())).thenReturn(Result.success(data));

        Map<String, Object> out = run("submitSupplyClaim",
                "{\"items\":[{\"item\":\"枪头\",\"qty\":2}],\"mergeChoices\":[\"regular=SC_1\"]}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<SupplyMergeSubmitRequest> req = ArgumentCaptor.forClass(SupplyMergeSubmitRequest.class);
        verify(suppliesService).mergeSubmit(any(), req.capture());
        assertEquals("SC_1", req.getValue().getRegularTargetOrderId());
        assertEquals(7L, req.getValue().getLines().get(0).getItemId());
        verify(suppliesService, never()).createClaim(any(), any());
    }

    @Test
    @DisplayName("用户选「不合并」→ 走新建，不调合并")
    void chosenNewGoesToCreateClaim() throws Exception {
        when(suppliesService.createClaim(any(), any())).thenReturn(Result.success(null));

        Map<String, Object> out = run("submitSupplyClaim",
                "{\"items\":[{\"item\":\"枪头\",\"qty\":2}],\"mergeChoices\":[\"regular=new\"]}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        verify(suppliesService).createClaim(any(), any());
        verify(suppliesService, never()).mergeSubmit(any(), any());
    }

    @Test
    @DisplayName("不传 items = 从购物车下单：行取自购物车，规格快照带上，成功后清空购物车")
    void submitFromCart() throws Exception {
        Map<String, Object> cartData = new HashMap<>();
        Map<String, Integer> cartLines = new HashMap<>();
        cartLines.put("7::尺寸=M", 2);
        cartData.put("lines", cartLines);
        when(suppliesService.getShoppingCart(any())).thenReturn(Result.success(cartData));
        when(suppliesService.createClaim(any(), any())).thenReturn(Result.success(null));

        Map<String, Object> out = run("submitSupplyClaim", "{}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<CreateSupplyClaimRequest> req = ArgumentCaptor.forClass(CreateSupplyClaimRequest.class);
        verify(suppliesService).createClaim(any(), req.capture());
        assertEquals(7L, req.getValue().getLines().get(0).getItemId());
        assertEquals(2, req.getValue().getLines().get(0).getQty());
        assertEquals("尺寸=M", req.getValue().getLines().get(0).getSpecSnapshot());
        // 提交成功后清空购物车（与页面同口径）
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(suppliesService).saveShoppingCart(any(), body.capture());
        assertTrue(body.getValue().get("lines") instanceof Map<?, ?> m && m.isEmpty(), "购物车应被清空");
    }

    @Test
    @DisplayName("空购物车下单 → 明确回绝，不下单不清车")
    void submitEmptyCartRefused() throws Exception {
        // setUp 已把购物车设为空
        Map<String, Object> out = run("submitSupplyClaim", "{}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(suppliesService, never()).createClaim(any(), any());
        verify(suppliesService, never()).saveShoppingCart(any(), any());
    }

    @Test
    @DisplayName("列表：只有**多件**结果才出「挑一件」芯片 —— 一条结果再问一次是白加一问")
    void listItemsOffersChoicesOnlyWhenAmbiguous() throws Exception {
        // 关键词命中两件 → 该出芯片，让用户挑
        Map<String, Object> many = run("listSupplyItems", "{\"keyword\":\"枪头\"}");
        assertEquals(2, many.get("total"));
        assertNotNull(many.get("choices"), "命中多件必须交回候选：" + many);

        // 关键词只命中一件 → 不出一问，模型直接拿名字去下单
        Map<String, Object> one = run("listSupplyItems", "{\"keyword\":\"枪头（带滤芯）\"}");
        assertEquals(1, one.get("total"));
        assertNull(one.get("choices"),
                "一条结果不该再问「挑一件」——真机上它会把后面的合并提问挤成「第 2/2 问」：" + one);
    }

    @Test
    @DisplayName("数量缺失：不许替他定一个，明确把球踢回用户")
    void missingQtyAsksUser() throws Exception {
        Map<String, Object> out = run("submitSupplyClaim", "{\"items\":[{\"item\":\"枪头\"}]}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("问用户"),
                "数量缺失要说清「去问用户几件」，别自己定（领多领少都是真出库）：" + out);
        verify(suppliesService, never()).createClaim(any(), any());
    }

    @Test
    @DisplayName("库存不足：话术要带上「去查可用量」，别只丢一句失败让用户猜还剩多少")
    void stockShortageTellsModelToLookUp() throws Exception {
        when(suppliesService.createClaim(any(), any())).thenReturn(Result.error("库存不足: 枪头"));

        Map<String, Object> out = run("submitSupplyClaim", "{\"items\":[{\"item\":\"枪头\",\"qty\":9}]}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        String reason = String.valueOf(out.get("reason"));
        assertTrue(reason.contains("库存不足") && reason.contains("listSupplyItems"),
                "库存失败要指路去查可用量：" + reason);
    }

    @Test
    @DisplayName("加购：**没给数量** ≠「移出」——不许替他定，先问用户要几件")
    void cartAddWithoutQtyAsksInsteadOfRemoving() throws Exception {
        // 真机复现过两种坏结果：模型自己编 qty=1；或者干脆不传 —— 而 asInt(0) 会当成「移出」
        Map<String, Object> out = run("setCartQuantity", "{\"item\":\"枪头\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("问用户"),
                "没给数量要说清去问用户，别自己定也别当移出：" + out);
        verify(suppliesService, never()).saveShoppingCart(any(), any());
    }

    @Test
    @DisplayName("加购：显式传 0 才是「移出」——这条语义不能被上一条弄坏")
    void cartQtyZeroStillRemoves() throws Exception {
        Map<String, Object> out = run("setCartQuantity", "{\"item\":\"枪头\",\"qty\":0}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals("已从购物车移出", out.get("note"));
        verify(suppliesService).saveShoppingCart(any(), any());
    }

    @Test
    @DisplayName("按人排行：报的是人名与数量，不把账号 id 抛出去；也不挂确认")
    @SuppressWarnings("unchecked")
    void topConsumersReportsNamesNotIds() throws Exception {
        when(suppliesService.getApplicantConsumption(anyInt(), anyInt())).thenReturn(Result.success(List.of(
                applicant("张三", 3, 328, "2026-07-17 14:51:14"),
                applicant("李四", 9, 22, "2026-10-08 16:55:02"))));

        assertFalse(tool("listSupplyTopConsumers").requiresConfirm());
        Map<String, Object> out = run("listSupplyTopConsumers", "{\"days\":90}");

        List<Map<String, Object>> rows = (List<Map<String, Object>>) out.get("consumers");
        assertEquals(2, rows.size());
        assertEquals("张三", rows.get(0).get("applicant"));
        assertEquals(328, rows.get(0).get("outboundQty"));
        assertEquals(3, rows.get(0).get("claimCount"));
        assertEquals(90, out.get("windowDays"), "统计区间要能报出来");
        assertTrue(String.valueOf(out.get("note")).contains("90"), out.get("note").toString());
    }

    @Test
    @DisplayName("某件物资的流水：逐笔带领取人/处理人/时间，类型翻成人话，且如实报总数")
    @SuppressWarnings("unchecked")
    void itemFlowMapsRowsAndTotals() throws Exception {
        Map<String, Object> data = new HashMap<>();
        SupplyInventoryMovementRowView mv = new SupplyInventoryMovementRowView();
        mv.setMovementType("OUTBOUND");
        mv.setQty(10);
        mv.setStockAfter(90);
        mv.setApplicantName("张三");
        mv.setOperatorName("管家");
        mv.setCreatedAt("2026-07-17 14:51:14");
        data.put("data", List.of(mv));
        data.put("total", 40);
        SupplyAuditRestoredRow rr = new SupplyAuditRestoredRow();
        rr.setOutboundTime("2026-05-10 14:41:10");
        rr.setApplicantName("李四");
        rr.setOutboundQty(2);
        data.put("restoredData", List.of(rr));
        data.put("restoredTotal", 5);
        when(suppliesService.listAuditInventoryMovements(any(), anyLong(), anyInt(), anyInt()))
                .thenReturn(Result.success(data));

        assertFalse(tool("listSupplyItemFlow").requiresConfirm());
        Map<String, Object> out = run("listSupplyItemFlow", "{\"item\":\"枪头\"}");

        List<Map<String, Object>> flow = (List<Map<String, Object>>) out.get("flow");
        assertEquals(1, flow.size());
        assertEquals("出库（领走）", flow.get(0).get("event"), "流水类型要说人话：" + flow.get(0));
        assertEquals("张三", flow.get(0).get("applicant"));
        assertEquals(40, out.get("flowTotal"), "总数要报出来");
        assertEquals(1, ((List<Map<String, Object>>) out.get("restored")).size(), "历史实发另列一份");
        assertTrue(String.valueOf(out.get("note")).contains("40"), out.get("note").toString());
    }

    @Test
    @DisplayName("按人排行也走库存审计那条权限口径（能领用 ≠ 能看全站领用流水）")
    void topConsumersSharesInventoryCapability() {
        when(suppliesService.canAuditInventory(any())).thenReturn(false);
        assertFalse(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_INVENTORY).test(user()));
        when(suppliesService.canAuditInventory(any())).thenReturn(true);
        assertTrue(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_INVENTORY).test(user()));
    }

    private static SupplyApplicantConsumptionView applicant(String name, int claims, int qty, String lastAt) {
        SupplyApplicantConsumptionView v = new SupplyApplicantConsumptionView();
        v.setApplicantUserId("STAFF_x");
        v.setApplicantName(name);
        v.setClaimCount(claims);
        v.setOutboundQty(qty);
        v.setLastAt(lastAt);
        return v;
    }

    private static SupplyItemConsumptionView consumption(Long id, String name, int out, int available,
                                                        double daily, double cover) {
        SupplyItemConsumptionView v = new SupplyItemConsumptionView();
        v.setItemId(id);
        v.setName(name);
        v.setOutboundQty(out);
        v.setInboundQty(0);
        v.setStockQty(available);
        v.setLockedQty(0);
        v.setAvailableQty(available);
        v.setDailyAvg(daily);
        v.setCoverDays(cover);
        return v;
    }

    @Test
    @DisplayName("下载领用单：按人找命中多张 → 交回可点选项，且一条链接都不生成")
    @SuppressWarnings("unchecked")
    void downloadClaimAsksWhenPersonHasSeveral() throws Exception {
        when(suppliesService.listRecentClosedClaims(any(), anyInt(), eq("FULFILLED"))).thenReturn(List.of(
                pendingOrderWithApplicant("SC_1", "位亚磊"), pendingOrderWithApplicant("SC_2", "位亚磊")));

        Map<String, Object> out = run("downloadSupplyClaimForm", "{\"person\":\"位亚磊\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        List<Map<String, Object>> chips = (List<Map<String, Object>>) out.get("choices");
        assertNotNull(chips, "名下多张要交回可点选项：" + out);
        // 用户明确要求：**不显示单号**、状态要中文、按时间倒序
        String label = String.valueOf(chips.get(0).get("label"));
        assertFalse(label.contains("SC_"), "芯片上不许出现单号：" + label);
        assertTrue(label.contains("待出库"), "状态要给中文：" + label);
        assertTrue(label.startsWith("07-17 14:32"), "时间在最前，按时间认单子：" + label);
        // 默认只在「已完成」里找（用户要求：已撤回的不要）
        verify(suppliesService).listRecentClosedClaims(any(), anyInt(), eq("FULFILLED"));
        verify(suppliesService, never()).createOrReuseClaimPdfLink(any(), any());
    }

    @Test
    @DisplayName("下载领用单：给了单号就直接生成链接，并把「相对路径」交给模型")
    void downloadClaimByOrderIdGivesPath() throws Exception {
        Map<String, Object> link = new HashMap<>();
        link.put("fileName", "2026-07-17-位亚磊-001.pdf");
        link.put("downloadPath", "/api/supplies/claims/download/tok123");
        link.put("expireAt", "2026-07-24 10:00:00");
        when(suppliesService.createOrReuseClaimPdfLink(any(), eq("SC_9"))).thenReturn(Result.success(link));

        Map<String, Object> out = run("downloadSupplyClaimForm", "{\"order\":\"SC_9\"}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals("/api/supplies/claims/download/tok123", out.get("downloadPath"));
        // **以附件（下载卡片）的形式给**，而不是让模型在正文里写链接
        Map<String, Object> dl = (Map<String, Object>) out.get("download");
        assertNotNull(dl, "要挂出附件信封：" + out);
        assertEquals("supplyClaim", dl.get("kind"));
        assertEquals("2026-07-17-位亚磊-001.pdf", dl.get("label"), "附件名 = 纸面上的单号");
        assertEquals("/api/supplies/claims/download/tok123",
                ((Map<String, Object>) dl.get("params")).get("downloadPath"));
        assertTrue(String.valueOf(out.get("note")).contains("不要写链接"), out.get("note").toString());
    }

    private static SupplyClaimOrderView pendingOrderWithApplicant(String id, String applicant) {
        SupplyClaimOrderView o = new SupplyClaimOrderView();
        o.setId(id);
        o.setStatus("PENDING");
        o.setApplicantName(applicant);
        o.setCreatedAt(LocalDateTime.parse("2026-07-17T14:32:00"));
        SupplyClaimLineView l = new SupplyClaimLineView();
        l.setItemId(7L);
        l.setSnapshotName("枪头");
        l.setQty(2);
        o.setLines(List.of(l));
        return o;
    }
}
