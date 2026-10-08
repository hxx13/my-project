package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelCacheService;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 门禁控制包的闸。
 *
 * <p>钉住三件**会真的动到门**的行为：
 * ① 控制类工具必须声明 C 级（触发二次确认）—— 模型说「已经开了」不算数；
 * ② 认不出的门一律交回候选，**绝不拿相近的名字顶上**（猜错的代价是动错一扇门）；
 * ③ 认不出/参数非法时**不许调上游** —— 一次误调就是一扇真的门被打开。
 */
class DoorControlToolPackTest {

    private DahuaDeviceChannelCacheService channelCacheService;
    private DahuaOpenApiService openApiService;
    private DoorControlToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        channelCacheService = mock(DahuaDeviceChannelCacheService.class);
        openApiService = mock(DahuaOpenApiService.class);
        pack = new DoorControlToolPack(channelCacheService, openApiService);
        when(openApiService.controlDoor(anyString(), any())).thenReturn(new HashMap<>(Map.of("code", 1000)));
        when(openApiService.isSuccess(any())).thenReturn(true);
    }

    private static DahuaDeviceChannelCache channel(String code, String name) {
        DahuaDeviceChannelCache c = new DahuaDeviceChannelCache();
        c.setChannelCode(code);
        c.setChannelName(name);
        c.setChannelType("door");
        c.setIsOnline(1);
        return c;
    }

    private void cacheReturns(DahuaDeviceChannelCache... rows) {
        Map<String, Object> data = new HashMap<>();
        data.put("list", new ArrayList<>(List.of(rows)));
        data.put("total", rows.length);
        when(channelCacheService.list(nullable(String.class), nullable(String.class), nullable(String.class),
                anyInt(), nullable(Long.class), org.mockito.ArgumentMatchers.anyBoolean(), anyInt(), anyInt()))
                .thenReturn(data);
    }

    private User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_u");
        u.setRole(role);
        return u;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String tool, String json) throws Exception {
        AiTool t = pack.tools().stream().filter(x -> x.name().equals(tool)).findFirst().orElseThrow();
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) t.executor()
                .execute(new AiToolContext(user(RoleEnum.SUPER_ADMIN), 1L, 2L, null), args);
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(x -> x.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("控制门禁是 C 级（必须二次确认）；两个查询是纯读")
    void controlRequiresConfirmation() {
        assertTrue(tool("controlDoor").requiresConfirm(), "碰硬件必须挂起确认");
        assertFalse(tool("listDoorChannels").requiresConfirm());
        assertFalse(tool("queryDoorStatus").requiresConfirm());
    }

    @Test
    @DisplayName("给名字能解析成通道码，并带上动作调上游")
    void resolvesNameToCodeAndCallsUpstream() throws Exception {
        cacheReturns(channel("CH-1", "一楼大门"));

        Map<String, Object> out = run("controlDoor", "{\"mode\":\"STAY_OPEN\",\"channels\":[\"一楼大门\"]}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<List<String>> codes = ArgumentCaptor.forClass(List.class);
        verify(openApiService).controlDoor(eq("STAY_OPEN"), codes.capture());
        assertEquals(List.of("CH-1"), codes.getValue(), "打上游必须用通道码，不是名字");
    }

    @Test
    @DisplayName("认不出的门 → 交回候选、不调上游（猜错就是动错门）")
    void unknownChannelNeverReachesUpstream() throws Exception {
        cacheReturns(channel("CH-1", "一楼大门"), channel("CH-2", "一楼侧门"));

        Map<String, Object> out = run("controlDoor", "{\"mode\":\"OPEN\",\"channels\":[\"二楼那个门\"]}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNotNull(out.get("reason"));
        verify(openApiService, never()).controlDoor(anyString(), any());
    }

    @Test
    @DisplayName("动作名非法 → 直接拒，不调上游")
    void invalidModeIsRejected() throws Exception {
        cacheReturns(channel("CH-1", "一楼大门"));

        Map<String, Object> out = run("controlDoor", "{\"mode\":\"UNLOCK_ALL\",\"channels\":[\"一楼大门\"]}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(openApiService, never()).controlDoor(anyString(), any());
    }

    @Test
    @DisplayName("查状态：名字对不上就不调上游；通道表里最多给 6 个可点候选")
    void statusAndChoices() throws Exception {
        cacheReturns(channel("CH-1", "一楼大门"), channel("CH-2", "一楼侧门"));

        Map<String, Object> bad = run("queryDoorStatus", "{\"channels\":[\"不存在的门\"]}");
        assertEquals(Boolean.FALSE, bad.get("ok"));
        verify(openApiService, never()).queryDoorStatus(any(), any(), any());

        Map<String, Object> listed = run("listDoorChannels", "{}");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) listed.get("choices");
        assertEquals(2, choices.size());
        assertEquals("一楼大门", choices.get(0).get("value"), "点选项送出去的是名字（人话），通道码由工具核对");
    }

    @Test
    @DisplayName("能力与 requireSuperAdmin 同档：SUPER_ADMIN 放行，STAFF/ADMIN 不放行")
    void capabilityMatchesSuperAdmin() {
        Map<String, java.util.function.Predicate<User>> caps = pack.capabilities();
        assertTrue(caps.get(DoorControlToolPack.CAP_DOOR_CONTROL).test(user(RoleEnum.SUPER_ADMIN)));
        assertFalse(caps.get(DoorControlToolPack.CAP_DOOR_CONTROL).test(user(RoleEnum.ADMIN)),
                "页面接口要求 SUPER_ADMIN，AI 这边不能更松");
        assertFalse(caps.get(DoorControlToolPack.CAP_DOOR_CONTROL).test(user(RoleEnum.STAFF)));
        for (AiTool t : pack.tools()) {
            assertNotNull(caps.get(t.capability()), "工具 " + t.name() + " 的能力码没有判定");
        }
    }
}
