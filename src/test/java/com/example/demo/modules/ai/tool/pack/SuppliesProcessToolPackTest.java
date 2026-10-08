package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.supplies.dto.FulfillSupplyClaimRequest;
import com.example.demo.modules.supplies.dto.SupplyClaimLineView;
import com.example.demo.modules.supplies.dto.SupplyClaimOrderView;
import com.example.demo.modules.supplies.service.SuppliesService;
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
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 物资处理包的闸。
 *
 * <p>钉住三件会**真的动库存**的行为：
 * ① 出库是 C 级（挂起确认）；
 * ② 单号必须**先在待处理里查到** —— 编出来的单号不许走到出库；
 * ③ 不指定明细时按"待出数量"全额出库，不是按申请数量（少发过一部分的单子不能重复出）。
 */
class SuppliesProcessToolPackTest {

    private SuppliesService suppliesService;
    private SuppliesProcessToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        suppliesService = mock(SuppliesService.class);
        pack = new SuppliesProcessToolPack(suppliesService, null);
    }

    private static SupplyClaimOrderView order(String id) {
        SupplyClaimOrderView o = new SupplyClaimOrderView();
        o.setId(id);
        o.setApplicantName("位亚磊");
        o.setStatus("PENDING");
        SupplyClaimLineView l1 = new SupplyClaimLineView();
        l1.setId(11L);
        l1.setSnapshotName("小水桶");
        l1.setQty(3);
        l1.setFulfilledQty(1); // 已经出过 1，待出 2
        o.setLines(List.of(l1));
        return o;
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

    @Test
    @DisplayName("出库是 C 级（挂起确认）；两个查询是纯读")
    void grading() {
        assertTrue(tool("fulfillSupplyClaim").requiresConfirm(), "出库动库存必须确认");
        assertFalse(tool("listPendingSupplyClaims").requiresConfirm());
        assertFalse(tool("listRecentSupplyClaims").requiresConfirm());
    }

    @Test
    @DisplayName("待处理里没有的单号 → 拒办、不出库（编的单号走不到下游）")
    void unknownOrderNeverFulfils() throws Exception {
        when(suppliesService.listPendingTasks(any())).thenReturn(List.of(order("SC_A")));

        Map<String, Object> out = run("fulfillSupplyClaim", "{\"claimId\":\"SC_NOT_EXIST\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNotNull(out.get("reason"));
        verify(suppliesService, never()).fulfill(any(), anyString(), any());
    }

    @Test
    @DisplayName("不指定明细 → 按待出数量出库（申请 3 已出 1 → 这次出 2）")
    void defaultFulfilsRemainingQty() throws Exception {
        when(suppliesService.listPendingTasks(any())).thenReturn(List.of(order("SC_A")));
        when(suppliesService.fulfill(any(), anyString(), any())).thenReturn(Result.success(order("SC_A")));

        Map<String, Object> out = run("fulfillSupplyClaim", "{\"claimId\":\"SC_A\"}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<FulfillSupplyClaimRequest> req = ArgumentCaptor.forClass(FulfillSupplyClaimRequest.class);
        verify(suppliesService).fulfill(any(), eq("SC_A"), req.capture());
        assertEquals(11L, req.getValue().getLines().get(0).getLineId());
        assertEquals(2, req.getValue().getLines().get(0).getFulfillQty(), "出的是待出数量，不是申请数量");
        assertTrue(req.getValue().getLines().get(0).getGrant());
    }

    @Test
    @DisplayName("候选芯片列物品、不摆单号（单号又长又没用，回传走 value）")
    void chipLabelShowsItemsNotOrderNo() throws Exception {
        when(suppliesService.listPendingTasks(any())).thenReturn(List.of(order("SC_A")));

        Map<String, Object> out = run("listPendingSupplyClaims", "{}");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) out.get("choices");
        String label = String.valueOf(choices.get(0).get("label"));
        assertTrue(label.contains("小水桶×3"), "芯片上要一眼看出这单里有什么：" + label);
        assertFalse(label.contains("SC_A"), "单号不该占芯片的位置：" + label);
        assertEquals("SC_A", choices.get(0).get("value"), "回传给机器的仍是单号");
    }

    @Test
    @DisplayName("「已处理」列表也带明细 —— 否则那行摘要只剩一个人名")
    void recentAlsoCarriesLines() throws Exception {
        when(suppliesService.listRecentClosedClaims(any(), org.mockito.ArgumentMatchers.anyInt(), any()))
                .thenReturn(List.of(order("SC_B")));

        Map<String, Object> out = run("listRecentSupplyClaims", "{}");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> claims = (List<Map<String, Object>>) out.get("claims");
        assertEquals("位亚磊 · 小水桶×3", claims.get(0).get("summary"));
    }
}
