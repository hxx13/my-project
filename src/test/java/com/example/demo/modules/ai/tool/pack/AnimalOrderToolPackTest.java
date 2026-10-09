package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.referencedata.dto.RefOrderLineView;
import com.example.demo.modules.referencedata.dto.RefOrderQuery;
import com.example.demo.modules.referencedata.dto.RefOrderView;
import com.example.demo.modules.referencedata.service.RefOrderAccessPolicy;
import com.example.demo.modules.referencedata.service.ReferenceDataService;
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
 * 动物订购审核包的闸。
 *
 * <p>钉住的是**权限与"批错单"**这两件最贵的错：
 * ① 审批走的是页面上那一个判据（超管/业务标签），**不是角色等级**；
 * ② 一张提交拆成多张单时，**单号会命中多张** —— 必须交回候选，不能自己挑一张批；
 * ③ 查询对"非业务"的人由服务端收窄到本人课题组，工具不自己判范围、也不绕开。
 */
class AnimalOrderToolPackTest {

    private ReferenceDataService referenceDataService;
    private RefOrderAccessPolicy accessPolicy;
    private AnimalOrderToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        referenceDataService = mock(ReferenceDataService.class);
        accessPolicy = mock(RefOrderAccessPolicy.class);
        pack = new AnimalOrderToolPack(referenceDataService, accessPolicy);
    }

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_u");
        u.setRole(role);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String toolName, String json) throws Exception {
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) tool(toolName).executor()
                .execute(new AiToolContext(user(RoleEnum.STAFF), 1L, 2L, null), args);
    }

    private static RefOrderView order(Long id, String sn, String status) {
        RefOrderView v = new RefOrderView();
        v.setId(id);
        v.setSn(sn);
        v.setStatus(status);
        v.setProjectGroupName("郑俊克的课题组");
        RefOrderLineView l = new RefOrderLineView();
        l.setStrainName("C57BL/6");
        l.setQuantity(50);
        v.setLines(List.of(l));
        return v;
    }

    private void mockOrderList(RefOrderView... rows) {
        Map<String, Object> data = new HashMap<>();
        data.put("list", List.of(rows));
        data.put("total", rows.length);
        when(referenceDataService.listAllOrders(anyInt(), anyInt(), any())).thenReturn(data);
        when(referenceDataService.listMyGroupOrders(anyString(), anyInt(), anyInt(), any())).thenReturn(data);
    }

    @Test
    @DisplayName("视角：只服务教职工；审批能力码就是页面那个判据（超管/业务标签），不是角色等级")
    void reviewCapabilityIsThePolicyNotRole() {
        assertEquals(java.util.Set.of(AiView.STAFF), pack.views());

        // 查询：STAFF 起
        assertTrue(pack.capabilities().get(AnimalOrderToolPack.CAP_ORDER_QUERY).test(user(RoleEnum.STAFF)));
        assertFalse(pack.capabilities().get(AnimalOrderToolPack.CAP_ORDER_QUERY).test(user(RoleEnum.MEMBER)));

        // 审批：交给策略方法判（业务标签/超管），工具不自己看角色
        when(accessPolicy.canReview(any())).thenReturn(false);
        assertFalse(pack.capabilities().get(AnimalOrderToolPack.CAP_ORDER_REVIEW).test(user(RoleEnum.ADMIN)),
                "审批资格由业务标签决定 —— ADMIN 也不一定有（这正是「严格权限」的点）");
        when(accessPolicy.canReview(any())).thenReturn(true);
        assertTrue(pack.capabilities().get(AnimalOrderToolPack.CAP_ORDER_REVIEW).test(user(RoleEnum.STAFF)));
    }

    @Test
    @DisplayName("审批挂着确认；查询不挂")
    void grading() {
        assertTrue(tool("reviewAnimalOrder").requiresConfirm(), "审批会动笼位，必须过确认");
        for (String r : List.of("listAnimalOrders", "listAnimalOrderFilterOptions", "getAnimalOrderDetail")) {
            assertFalse(tool(r).requiresConfirm(), r + " 是只读");
        }
    }

    @Test
    @DisplayName("单号命中多张（一张提交按房间拆单）→ 交回候选，绝不自己挑一张批")
    void snHittingSeveralOrdersAsksInsteadOfPicking() throws Exception {
        mockOrderList(order(1L, "SN1", "PENDING"), order(2L, "SN1", "PENDING"));

        Map<String, Object> out = run("reviewAnimalOrder", "{\"order\":\"SN1\",\"decision\":\"批准\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNotNull(out.get("choices"), "要把这几张单做成可点选项：" + out);
        assertTrue(String.valueOf(out.get("reason")).contains("不要自己挑"), out.get("reason").toString());
        verify(referenceDataService, never()).updateOrderStatus(anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("单号唯一 → 正常改状态，并把「批准」翻成 APPROVED")
    void singleHitApprovesWithStatusMapping() throws Exception {
        mockOrderList(order(7L, "SN7", "PENDING"));
        when(referenceDataService.updateOrderStatus(anyLong(), anyString(), anyString()))
                .thenReturn(Result.success(order(7L, "SN7", "APPROVED")));

        Map<String, Object> out = run("reviewAnimalOrder", "{\"order\":\"SN7\",\"decision\":\"批准\"}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<String> status = ArgumentCaptor.forClass(String.class);
        verify(referenceDataService).updateOrderStatus(eq(7L), status.capture(), anyString());
        assertEquals("APPROVED", status.getValue());
        assertEquals("已批准", out.get("status"), "回报要用中文状态");
    }

    @Test
    @DisplayName("终态改不了：服务端的拒绝要原样转述，不许说成办好了")
    void terminalStatusRejectionIsPassedThrough() throws Exception {
        mockOrderList(order(9L, "SN9", "COMPLETED"));
        when(referenceDataService.updateOrderStatus(anyLong(), anyString(), anyString()))
                .thenReturn(Result.error("无效的状态变更: COMPLETED -> APPROVED"));

        Map<String, Object> out = run("reviewAnimalOrder", "{\"order\":\"SN9\",\"decision\":\"批准\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("无效的状态变更"), out.get("reason").toString());
    }

    @Test
    @DisplayName("查询：非「业务」的人走服务端收窄那条（不是工具自己判范围）")
    void queryUsesServerSideNarrowing() throws Exception {
        when(accessPolicy.canSeeAll(any())).thenReturn(false);
        mockOrderList(order(1L, "SN1", "PENDING"));

        run("listAnimalOrders", "{\"status\":\"PENDING\"}");

        ArgumentCaptor<RefOrderQuery> q = ArgumentCaptor.forClass(RefOrderQuery.class);
        verify(referenceDataService).listMyGroupOrders(anyString(), anyInt(), anyInt(), q.capture());
        assertEquals("PENDING", q.getValue().getStatus());
        verify(referenceDataService, never()).listAllOrders(anyInt(), anyInt(), any());
    }

    @Test
    @DisplayName("筛选候选只认白名单那几列，别的列名一律拒（列名写错会查成空）")
    void filterOptionsWhitelist() throws Exception {
        Map<String, Object> bad = run("listAnimalOrderFilterOptions", "{\"column\":\"随便什么列\"}");
        assertEquals(Boolean.FALSE, bad.get("ok"));

        when(referenceDataService.distinctFilterValues("strain_name")).thenReturn(Result.success(List.of("C57BL/6")));
        when(accessPolicy.canSeeAll(any())).thenReturn(true);
        Map<String, Object> good = run("listAnimalOrderFilterOptions", "{\"column\":\"品系\"}");
        assertEquals(Boolean.TRUE, good.get("ok"));
        assertNotNull(good.get("choices"), "候选少时要做成可点选项：" + good);
    }

    @Test
    @DisplayName("列表命中多于返回条数时，要如实说「共 N 张」")
    @SuppressWarnings("unchecked")
    void listReportsTotalWhenPaged() throws Exception {
        when(accessPolicy.canSeeAll(any())).thenReturn(true);
        Map<String, Object> data = new HashMap<>();
        data.put("list", List.of(order(1L, "SN1", "PENDING")));
        data.put("total", 88);
        when(referenceDataService.listAllOrders(anyInt(), anyInt(), any())).thenReturn(data);

        Map<String, Object> out = run("listAnimalOrders", "{}");

        assertEquals(88L, ((Number) out.get("total")).longValue());
        assertEquals(1, ((List<Object>) out.get("orders")).size());
        assertTrue(String.valueOf(out.get("note")).contains("88"), "要说出共 88 张：" + out.get("note"));
    }

    @Test
    @DisplayName("查空要如实说没有，并提示可能是筛选取值写法不对")
    void emptyResultSaysSoHonestly() throws Exception {
        when(accessPolicy.canSeeAll(any())).thenReturn(true);
        List<RefOrderView> none = new ArrayList<>();
        Map<String, Object> data = new HashMap<>();
        data.put("list", none);
        data.put("total", 0);
        when(referenceDataService.listAllOrders(anyInt(), anyInt(), any())).thenReturn(data);

        Map<String, Object> out = run("listAnimalOrders", "{\"projectGroup\":\"查不到的组\"}");

        assertTrue(String.valueOf(out.get("note")).contains("没有"), out.get("note").toString());
        assertTrue(String.valueOf(out.get("note")).contains("候选"), "要提示先用候选工具核对写法：" + out.get("note"));
    }

    @Test
    @DisplayName("命中多张时**必须在挂起之前**就问：写操作的挂起发生在执行体之前，写在执行体里永远跑不到")
    @SuppressWarnings("unchecked")
    void ambiguityIsAskedBeforeConfirmNotAfter() throws Exception {
        mockOrderList(order(1L, "SN1", "PENDING"), order(2L, "SN1", "PENDING"));

        Object pre = tool("reviewAnimalOrder").resolveBeforeConfirmOrNull(
                new AiToolContext(user(RoleEnum.STAFF), 1L, 2L, null),
                om.readTree("{\"order\":\"SN1\",\"decision\":\"批准\"}"));

        assertNotNull(pre, "命中多张要在挂起前就交回候选 —— 否则用户会先看到一张确认卡，点完才被告知要挑");
        Map<String, Object> out = (Map<String, Object>) pre;
        assertNotNull(out.get("choices"), "候选要做成可点选项：" + out);
        verify(referenceDataService, never()).updateOrderStatus(anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("唯一命中时钩子放行（照常进确认卡）")
    void uniqueHitPassesHookThrough() throws Exception {
        mockOrderList(order(7L, "SN7", "PENDING"));

        assertNull(tool("reviewAnimalOrder").resolveBeforeConfirmOrNull(
                new AiToolContext(user(RoleEnum.STAFF), 1L, 2L, null),
                om.readTree("{\"order\":\"SN7\",\"decision\":\"批准\"}")));
    }
}
