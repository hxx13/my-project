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

    /**
     * 向导式提问里某一道题的可点选项。
     *
     * <p>工具自 2026-10-10 起把缺的参数改成 {@code questions:[{title,options}]} 一次问齐
     * （见 {@code UnfreezeToolPack#askForInput} 的注释：一问一条消息会让「房间」和「时长」永远凑不齐），
     * 早先那些读 {@code choices} 的断言从此恒为 null。这里按题干关键字取那一问的选项。
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> questionOptions(Map<String, Object> out, String titleContains) {
        if (!(out.get("questions") instanceof List<?> qs)) {
            return List.of();
        }
        for (Object q : qs) {
            Map<String, Object> m = (Map<String, Object>) q;
            if (String.valueOf(m.get("title")).contains(titleContains)
                    && m.get("options") instanceof List<?> opts) {
                return (List<Map<String, Object>>) opts;
            }
        }
        return List.of();
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

        List<Map<String, Object>> rooms = questionOptions(out, "房间");
        assertEquals("202A · 浦东 2F", rooms.get(0).get("label"));
        assertEquals("202A", rooms.get(0).get("value"), "值必须还是房间名，模型按名字匹配");
    }

    /**
     * 「允许猜，但最像的排第一」——**地域说明也要算进去**。
     *
     * <p>真机（2026-10-13）：用户说「为学C区」，那对得上的是**区域**名（浦东行为学C区），
     * 而房间自己叫「地下E11C」。只比房号的话它和「210A」同分，最像的那个反而排在后面，
     * 用户还得自己在候选里翻。
     */
    @Test
    @DisplayName("房间候选排序要认地域说明：说「为学C区」时，区域名叫「浦东行为学C区」的那间排第一")
    void rankRoomsByClosenessConsidersRegion() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "刘格菲", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("刘格菲"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "刘格菲", "523")));
        roomPrefill("210A", "地下E11C");
        RoomMappingRoom r0 = new RoomMappingRoom();
        r0.setRoomId("9000");
        r0.setRegionName("浦东");
        r0.setFloorName("浦东 2F");
        when(roomMappingRoomMapper.selectByRoomId("9000")).thenReturn(r0);
        RoomMappingRoom r1 = new RoomMappingRoom();
        r1.setRoomId("9001");
        r1.setRegionName("浦东");
        r1.setFloorName("浦东行为学C区");
        when(roomMappingRoomMapper.selectByRoomId("9001")).thenReturn(r1);

        Map<String, Object> out = run("grantFreezeExemption",
                "{\"person\":\"刘格菲\",\"untilTime\":\"22:00\",\"rooms\":[\"为学C区\"]}",
                "刘格菲 为学C区 到22:00");

        List<Map<String, Object>> rooms = questionOptions(out, "这间");
        assertEquals("地下E11C", rooms.get(0).get("value"), "最像的必须在第一个：" + rooms);
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
        assertEquals(2, questionOptions(out, "房间").size(), "应当改问房间");
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
        assertEquals(6, questionOptions(out, "时长").size(), "应当改问时长");
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
        List<Map<String, Object>> times = questionOptions(out, "时长");
        assertEquals(6, times.size());
        assertEquals("延迟到 22:00", times.get(2).get("value"), "第 3 档是时间节点，不是「延迟几小时」");
        assertEquals("今天都有效", times.get(4).get("label"));
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
    }

    /**
     * 时长候选必须是**时间节点**。
     *
     * <p>现场说法以「延迟到 22:00」为主，不是「延迟几小时」。原先只有 30 分钟 / 1 / 2 / 4 小时，
     * 用户要「到 22:00」时候选里根本没有那一项，模型只能说「系统只给了预设档」——
     * 把一个时点需求硬塞进时长维度（2026-10-12 用户反馈）。
     */
    @Test
    @DisplayName("时长候选给时间节点，并保留「今天都有效」")
    void timeChoicesAreClockPoints() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "张皓瀚", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("张皓瀚"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "张皓瀚", "523")));
        roomPrefill("202A");

        Map<String, Object> out = run("grantFreezeExemption", "{\"person\":\"张皓瀚\",\"rooms\":[\"202A\"]}",
                "给张皓瀚授予免冻豁免，房间 202A");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> questions = (List<Map<String, Object>>) out.get("questions");
        assertNotNull(questions, "缺时长时应当向导式提问");
        Map<String, Object> timeQ = questions.stream()
                .filter(q -> String.valueOf(q.get("title")).contains("时长"))
                .findFirst().orElseThrow(() -> new AssertionError("没问时长：" + questions));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> opts = (List<Map<String, Object>>) timeQ.get("options");
        List<String> labels = opts.stream().map(o -> String.valueOf(o.get("label"))).toList();
        assertTrue(labels.contains("到 22:00"), "候选里必须有时间节点：" + labels);
        assertTrue(labels.contains("到 18:00"), "候选里必须有时间节点：" + labels);
        assertTrue(labels.contains("今天都有效"), "今天都有效这一档要留着：" + labels);
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

    /**
     * 跨轮兜圈（2026-10-13 真机，用户王毓菲 / 刘格菲那一单）。
     *
     * <p>房间与时长是两问，点一个芯片 = 一条用户消息。旧逻辑两道闸都只认「**本轮原话里**提到」：
     * 答了房间那条里没有时间 → 时间被当成模型编的丢掉 → 反过来问时长；答了时长那条里又没房间
     * → 房间被丢掉 → 再问房间。两道闸**永远凑不齐**，用户被反复要求「把房间和时间一起重说一遍」。
     *
     * <p>这里钉住修法：本轮没提的那一维，回落到**这个人在本会话里点过**的值。
     */
    @Test
    @DisplayName("跨轮兜圈：先答房间、后补另一维时，已答过的那一维从会话记忆里取回，不再来回问")
    void answeredSlotSurvivesToNextTurn() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "王毓菲", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("王毓菲"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "王毓菲", "523")));
        roomPrefill("E11B-行为学C区");

        // 第一轮：用户把房间和时点都说了，但房间名对不上候选 → 交回候选；时点是他说过的，得记住
        Map<String, Object> first = run("grantFreezeExemption",
                "{\"person\":\"王毓菲\",\"untilTime\":\"22:00\",\"rooms\":[\"行为学C区\"]}",
                "王毓菲 行为学C区 到22:00");
        assertEquals(Boolean.FALSE, first.get("ok"), "房间名对不上，应当交回候选");
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());

        // 第二轮：用户点候选里那间 —— 这句里**没有时间**。旧逻辑会在这里反过来问时长，开始兜圈
        Map<String, Object> second = run("grantFreezeExemption",
                "{\"person\":\"王毓菲\",\"rooms\":[\"E11B-行为学C区\"]}",
                "E11B-行为学C区");

        assertEquals(Boolean.TRUE, second.get("ok"), "应当直接办成，不该再问时长：" + second);
        verify(exemptAdminService).apply(eq("STAFF_admin"), eq("CARD7"), eq(1), isNull(), eq("TIME"),
                isNull(), eq("[{\"roomId\":\"9000\",\"roomName\":\"E11B-行为学C区\"}]"),
                eq("22:00"), eq("ai-assistant"));
    }

    /**
     * 记忆**按人分槽**。
     *
     * <p>不按人分的话，「给王毓菲办完」紧接着一句「李四也开一下」会把王毓菲的房间悄悄授给李四 ——
     * 那正是这两道闸当初要防的事（替用户拍板授了哪间房）。
     */
    @Test
    @DisplayName("记忆按人分槽：给王毓菲定下的房间不会顺手套给下一个问的人")
    void rememberedSlotIsScopedToThePerson() throws Exception {
        when(mappingService.getByAroUserId("7")).thenReturn(card("CARD7", "7", "王毓菲", "523"));
        when(dashboardMapper.searchPersonnelPaged(eq("王毓菲"), anyInt(), anyInt()))
                .thenReturn(List.of(person("7", "王毓菲", "523")));
        when(mappingService.getByAroUserId("8")).thenReturn(card("CARD8", "8", "李四", "524"));
        when(dashboardMapper.searchPersonnelPaged(eq("李四"), anyInt(), anyInt()))
                .thenReturn(List.of(person("8", "李四", "524")));
        roomPrefill("202A");

        run("grantFreezeExemption",
                "{\"person\":\"王毓菲\",\"untilTime\":\"22:00\",\"rooms\":[\"202A\"]}",
                "王毓菲 房间202A 到22:00");
        verify(exemptAdminService).apply(anyString(), eq("CARD7"), anyInt(), any(), anyString(), any(), any(), any(), any());

        // 李四这一轮什么都没说：房间、时长都得重新问，绝不能把王毓菲那间顶上去
        Map<String, Object> out = run("grantFreezeExemption", "{\"person\":\"李四\"}", "李四也开一下");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertEquals(1, questionOptions(out, "房间").size(), "应当问房间");
        verify(exemptAdminService, never()).apply(anyString(), eq("CARD8"), anyInt(), any(), anyString(), any(), any(), any(), any());
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

    /**
     * 报**组长**的名字时，绝不能把组员认成他（2026-10-13 真机事故）。
     *
     * <p>人员检索把「姓名 / 工号 / 课题组 / 部门」四个字段一起模糊匹配：用户说「李劲松」，
     * 命中的是他课题组里的张文静（她的课题组字段里就带着「李劲松」三个字）。组里又恰好只有她一个人
     * 绑了卡，候选因此只剩一条 —— 工具**默默把豁免授给了她**。用户点名要开的人一个没动，
     * 另一个人拿到了门禁权限。这不是「多一个候选」，是给错了人。
     */
    @Test
    @DisplayName("报组长的名字不能认成组员：靠课题组字段命中的那一行要落到「没找到」，绝不自动执行")
    void groupFieldHitIsNotTreatedAsThePerson() throws Exception {
        when(mappingService.getByAroUserId("9")).thenReturn(card("CARD9", "9", "张文静", "YF0460"));
        when(dashboardMapper.searchPersonnelPaged(anyString(), anyInt(), anyInt())).thenAnswer(inv -> {
            Object kw = inv.getArgument(0);
            if (!"李劲松".equals(String.valueOf(kw))) {
                return List.of();
            }
            Map<String, Object> r = person("9", "张文静", "YF0460");
            r.put("project_group_name", "李劲松的课题组");
            return List.of(r);
        });
        roomPrefill("201B");

        Map<String, Object> out = run("grantFreezeExemption",
                "{\"person\":\"李劲松\",\"untilTime\":\"20:00\",\"rooms\":[\"201B\"]}",
                "李劲松 行为学那边 晚上八点前");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertFalse(String.valueOf(out).contains("张文静"), "绝不能把她当成李劲松：" + out);
        verify(exemptAdminService, never()).apply(anyString(), anyString(), anyInt(), any(), anyString(), any(), any(), any(), any());
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
