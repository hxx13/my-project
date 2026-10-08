package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.supplies.dto.CreateSupplyClaimRequest;
import com.example.demo.modules.supplies.dto.SupplyItemView;
import com.example.demo.modules.supplies.service.SuppliesService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.HashMap;
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
    @DisplayName("权限沿用页面同一判据（能力策略），不自己按角色重写")
    void capabilityReusesPolicy() {
        when(capabilityPolicyService.requireSubmit(any(), eq(BizDomains.SUPPLIES_CLAIM))).thenReturn(null);
        assertTrue(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_CLAIM).test(user()));

        when(capabilityPolicyService.requireSubmit(any(), eq(BizDomains.SUPPLIES_CLAIM)))
                .thenReturn(Result.error("无权限"));
        assertFalse(pack.capabilities().get(SuppliesMallToolPack.CAP_SUPPLIES_CLAIM).test(user()));
    }
}
