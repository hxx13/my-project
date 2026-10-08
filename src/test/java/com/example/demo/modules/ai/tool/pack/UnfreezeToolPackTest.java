package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.card.service.TwinExemptAdminService;
import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.scan.dto.DahuaIssueAccessPrefillVO;
import com.example.demo.modules.twin.scan.service.DahuaIssueAccessRulePrefillService;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 免冻包的闸。
 *
 * <p>钉住三件**不会抛异常、只会安静做错事**的行为：
 * ① 重名/多卡必须交回候选，不能替用户挑一个；
 * ② 房间必须落在该人的授权范围里，越界的要丢弃而不是硬塞（硬塞等于把权限授给了不该给的房间）；
 * ③ 执行体必须调 {@code TwinExemptAdminService}（含推送），而不是绕过它直接改库。
 */
class UnfreezeToolPackTest {

    private TwinCardMappingService mappingService;
    private TwinExemptAdminService exemptAdminService;
    private DahuaIssueAccessRulePrefillService prefillService;
    private TwinDashboardMapper dashboardMapper;
    private RoomMappingRoomMapper roomMappingRoomMapper;
    private UnfreezeToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mappingService = mock(TwinCardMappingService.class);
        exemptAdminService = mock(TwinExemptAdminService.class);
        prefillService = mock(DahuaIssueAccessRulePrefillService.class);
        dashboardMapper = mock(TwinDashboardMapper.class);
        roomMappingRoomMapper = mock(RoomMappingRoomMapper.class);
        pack = new UnfreezeToolPack(mappingService, exemptAdminService, prefillService, dashboardMapper,
                roomMappingRoomMapper);
        when(mappingService.getByCardNo(anyString())).thenReturn(null);
        when(exemptAdminService.apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any()))
                .thenReturn(new HashMap<>(Map.of("freezeExemptExpireAt", "2026-10-08 18:00:00")));
    }

    private static TwinCardMapping card(String cardNo, String aroId, String name, String job) {
        TwinCardMapping m = new TwinCardMapping();
        m.setCardNo(cardNo);
        m.setAroUserId(aroId);
        m.setUserName(name);
        m.setJobNumber(job);
        m.setFreezeExemptFlag(0);
        return m;
    }

    private static Map<String, Object> person(String uid, String name, String job) {
        Map<String, Object> r = new HashMap<>();
        r.put("user_id", uid);
        r.put("name", name);
        r.put("job_number", job);
        return r;
    }

    private void roomPrefill(String... names) {
        DahuaIssueAccessPrefillVO vo = new DahuaIssueAccessPrefillVO();
        List<Map<String, Object>> rooms = new ArrayList<>();
        for (int i = 0; i < names.length; i++) {
            Map<String, Object> m = new HashMap<>();
            m.put("id", String.valueOf(9000 + i));
            m.put("name", names[i]);
            rooms.add(m);
        }
        vo.setOfficialRooms(rooms);
        when(prefillService.build(anyString())).thenReturn(vo);
    }

    private User admin() {
        User u = new User();
        u.setId("STAFF_admin");
        u.setRole(RoleEnum.ADMIN);
        return u;
    }

    /** 模拟一次工具调用；userText 传用户这一轮的原话（时间闸要看它） */
    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String tool, String json, String userText) throws Exception {
        AiTool t = pack.tools().stream().filter(x -> x.name().equals(tool)).findFirst().orElseThrow();
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) t.executor().execute(new AiToolContext(admin(), 1L, 2L, userText), args);
    }


    @Test
    @DisplayName("重名/多卡 → 交回候选，绝不执行")
    void multipleCandidatesAreReturnedNotPicked() throws Exception {
        when(dashboardMapper.searchPersonnelPaged(eq("张"), anyInt(), anyInt()))
                .thenReturn(List.of(person("1", "张三", "A1"), person("2", "张三", "A2")));
        when(mappingService.getByAroUserId("1")).thenReturn(card("CARD1", "1", "张三", "A1"));
        when(mappingService.getByAroUserId("2")).thenReturn(card("CARD2", "2", "张三", "A2"));

        Map<String, Object> out = run("grantFreezeExemption", "{\"person\":\"张\",\"untilTime\":\"18:00\",\"rooms\":[\"202A\"]}", null);

        assertEquals(Boolean.FALSE, out.get("ok"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cands = (List<Map<String, Object>>) out.get("candidates");
        assertEquals(2, cands.size());
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("没给房间 → 返回该人可选房间，不执行")
    void missingRoomsReturnsCandidatesInsteadOfActing() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A", "E11A-B110");

        Map<String, Object> out = run("grantFreezeExemption", "{\"person\":\"张皓瀚\",\"durationMinutes\":120}", null);

        assertEquals(Boolean.FALSE, out.get("ok"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rooms = (List<Map<String, Object>>) out.get("rooms");
        assertEquals(2, rooms.size());
        assertEquals("202A", rooms.get(0).get("room"));
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("房间选项的标签带地域说明，值仍是房间名（值要能唯一定位，标签要看得懂）")
    void roomChoiceLabelCarriesLocation() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A");
        RoomMappingRoom loc = new RoomMappingRoom();
        loc.setRoomId("9000");
        loc.setRegionName("浦东");
        loc.setFloorName("浦东 2F"); // 楼层名自带区域：别拼成「浦东 浦东 2F」
        when(roomMappingRoomMapper.selectByRoomId("9000")).thenReturn(loc);

        Map<String, Object> out = run("grantFreezeExemption", "{\"person\":\"张皓瀚\",\"durationMinutes\":120,\"rooms\":[]}", null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) out.get("choices");
        assertEquals("202A · 浦东 2F", choices.get(0).get("label"));
        assertEquals("202A", choices.get(0).get("value"), "值必须还是房间名，模型按名字匹配");
    }

    @Test
    @DisplayName("本轮没提房间 → 模型传来的房间一律不采信，改问房间（房间就是这次要授的权限本身，更不能猜）")
    void inventedRoomIsDropped() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A", "E11A-B110");

        // 用户这句只说「都到 21:00」，没提房间；模型把上文出现过的 202A 搬了过来
        Map<String, Object> out = run("grantFreezeExemption",
                "{\"person\":\"张皓瀚\",\"untilTime\":\"21:00\",\"rooms\":[\"202A\"]}",
                "给张皓瀚授予免冻豁免，到 21:00");

        assertEquals(Boolean.FALSE, out.get("ok"), "编出来的房间不该被采纳");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) out.get("choices");
        assertEquals(2, choices.size(), "应当改问房间");
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("房间判定：名字或 id 命中即可（模型把 202A 归一成 id 也不该冤枉它）")
    void mentionsAnyRoomMatchesNameOrId() {
        List<Map<String, Object>> rooms = List.of(Map.of("room", "202A", "roomId", "1951194778016182274"));
        assertTrue(UnfreezeToolPack.mentionsAnyRoom("给张皓瀚授免冻豁免，房间 202A", rooms));
        assertTrue(UnfreezeToolPack.mentionsAnyRoom("就 1951194778016182274 这间", rooms));
        assertFalse(UnfreezeToolPack.mentionsAnyRoom("给张皓瀚授免冻豁免，到 21:00", rooms));
        assertFalse(UnfreezeToolPack.mentionsAnyRoom(null, rooms));
    }

    @Test
    @DisplayName("本轮没提时间 → 模型传来的时长一律不采信，改问时长（真机两次照搬上一轮，第二次真落库）")
    void inventedTimeIsDropped() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A");

        // 用户这句话里只有房间，没有任何时间；模型却把上一轮的 120 分钟搬了过来
        Map<String, Object> out = run("grantFreezeExemption",
                "{\"person\":\"张皓瀚\",\"durationMinutes\":120,\"rooms\":[\"202A\"]}",
                "给张皓瀚授予免冻豁免，房间 202A");

        assertEquals(Boolean.FALSE, out.get("ok"), "编出来的时长不该被采纳");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) out.get("choices");
        assertEquals(5, choices.size(), "应当改问时长");
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("时间判定：只认时间形态的词，房间号里的数字不算")
    void mentionsTimeOnlyCountsTimeShapes() {
        assertTrue(UnfreezeToolPack.mentionsTime("延迟 2 小时"));
        assertTrue(UnfreezeToolPack.mentionsTime("今天都有效"));
        assertTrue(UnfreezeToolPack.mentionsTime("到 18:00"));
        assertTrue(UnfreezeToolPack.mentionsTime("18点之前"));
        assertFalse(UnfreezeToolPack.mentionsTime("给张皓瀚授予免冻豁免，房间 202A"));
        assertFalse(UnfreezeToolPack.mentionsTime(null));
    }

    @Test
    @DisplayName("没给时长 → 返回时长候选，不执行（不能靠 apply 抛异常兜）")
    void missingTimeReturnsTimeChoices() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A");

        Map<String, Object> out = run("grantFreezeExemption", "{\"person\":\"张皓瀚\",\"rooms\":[\"202A\"]}",
                "给张皓瀚授予免冻豁免，房间 202A");

        assertEquals(Boolean.FALSE, out.get("ok"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) out.get("choices");
        assertEquals(5, choices.size());
        assertEquals("延迟 2 小时", choices.get(2).get("value"));
        assertEquals("今天都有效", choices.get(4).get("label"));
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("越界房间被丢弃；全部越界则不执行并把可选房间交回")
    void outOfScopeRoomsAreDroppedNotForced() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A");

        Map<String, Object> out = run("grantFreezeExemption",
                "{\"person\":\"张皓瀚\",\"untilTime\":\"18:00\",\"rooms\":[\"别的房间\"]}", null);

        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("相对时长走 durationMinutes；房间 JSON 用带名字的新格式")
    void durationModePassesThroughAndRoomJsonCarriesName() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A", "E11A-B110");

        Map<String, Object> out = run("grantFreezeExemption",
                "{\"person\":\"张皓瀚\",\"durationMinutes\":120,\"rooms\":[\"202A\"]}",
                "给张皓瀚授予免冻豁免，延迟两小时，房间 202A");
        assertEquals(Boolean.TRUE, out.get("ok"));
        // 映射表里没有姓名，person 块必须由人员检索那一步带出来 —— 否则审计台账看不出改的是谁
        @SuppressWarnings("unchecked")
        Map<String, Object> who = (Map<String, Object>) out.get("person");
        assertEquals("张皓瀚", who.get("name"));
        assertEquals("523", who.get("jobNumber"));

        ArgumentCaptor<String> roomJson = ArgumentCaptor.forClass(String.class);
        verify(exemptAdminService).apply(eq("STAFF_admin"), eq("CARD7"), eq(1), eq(120), eq("TIME"),
                isNull(), roomJson.capture(), isNull(), eq("ai-assistant"));
        assertEquals("[{\"roomId\":\"9000\",\"roomName\":\"202A\"}]", roomJson.getValue());
    }

    @Test
    @DisplayName("模式推断：只有次数→COUNT，时长+次数→BOTH，绝对时点优先于相对时长")
    void modeInference() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A");

        run("grantFreezeExemption", "{\"person\":\"张皓瀚\",\"maxCount\":3,\"rooms\":[\"202A\"]}",
                "给张皓瀚授予免冻豁免，3 次，房间 202A");
        verify(exemptAdminService).apply(anyString(), eq("CARD7"), eq(1), isNull(), eq("COUNT"),
                eq(3), anyString(), isNull(), anyString());

        run("grantFreezeExemption",
                "{\"person\":\"张皓瀚\",\"untilTime\":\"18:00\",\"durationMinutes\":120,\"maxCount\":3,\"rooms\":[\"202A\"]}",
                "给张皓瀚授予免冻豁免，到 18:00，3 次，房间 202A");
        verify(exemptAdminService).apply(anyString(), eq("CARD7"), eq(1), eq(120), eq("BOTH"),
                eq(3), anyString(), eq("18:00"), anyString());
    }

    @Test
    @DisplayName("收回豁免只传人名，不带房间与时长")
    void revokeNeedsOnlyPerson() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));

        Map<String, Object> out = run("revokeFreezeExemption", "{\"person\":\"张皓瀚\"}", null);
        assertEquals(Boolean.TRUE, out.get("ok"));
        verify(exemptAdminService).apply(eq("STAFF_admin"), eq("CARD7"), eq(0), isNull(), eq("TIME"),
                isNull(), isNull(), isNull(), eq("ai-assistant"));
        verify(prefillService, never()).build(anyString());
    }

    @Test
    @DisplayName("查不到卡 → 说明原因，不执行")
    void unknownPersonExplains() throws Exception {
        when(dashboardMapper.searchPersonnelPaged(anyString(), anyInt(), anyInt())).thenReturn(List.of());
        Map<String, Object> out = run("revokeFreezeExemption", "{\"person\":\"查无此人\"}", null);
        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNotNull(out.get("reason"));
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("能力口径：ADMIN+（与 requireAdmin 同），且两个工具都有判定")
    void capabilityIsAdminAndComplete() {
        Map<String, java.util.function.Predicate<User>> caps = pack.capabilities();
        assertTrue(caps.get(UnfreezeToolPack.CAP_EXEMPT_SET).test(admin()));
        User staff = admin();
        staff.setRole(RoleEnum.STAFF);
        assertFalse(caps.get(UnfreezeToolPack.CAP_EXEMPT_SET).test(staff), "STAFF 不该拿到豁免权");
        for (AiTool t : pack.tools()) {
            assertNotNull(caps.get(t.capability()), "工具 " + t.name() + " 的能力码没有判定");
        }
    }
}
