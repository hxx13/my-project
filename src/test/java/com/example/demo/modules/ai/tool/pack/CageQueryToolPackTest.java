package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 笼架查询包的闸。
 *
 * <p>钉住的是**树 → 平铺行**这一步：层级字段要串对（错一级名字就挂到别的楼层上），
 * 房间 id 要从 {@code room:<id>} 里取出来，keyword 要能过滤。
 * 这几件都不会抛异常，只会安静地给出错的行。
 */
class CageQueryToolPackTest {

    private CageShelfService cageShelfService;
    private CageQueryToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        cageShelfService = mock(CageShelfService.class);
        // 后两个依赖只有 listCageCells 用得到；本测试只打 listRooms，传 null 即可
        pack = new CageQueryToolPack(cageShelfService, null, null);
    }

    private static Map<String, Object> node(String id, String name, String level) {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("id", id);
        n.put("name", name);
        n.put("level", level);
        n.put("children", new ArrayList<Map<String, Object>>());
        return n;
    }

    @SuppressWarnings("unchecked")
    private static void add(Map<String, Object> parent, Map<String, Object> child) {
        ((List<Map<String, Object>>) parent.get("children")).add(child);
    }

    /** 浦东 → 1号楼 → 3F → A301 / A302，外加浦西的一个房间 */
    private static List<Map<String, Object>> sampleTree() {
        Map<String, Object> pd = node("campus:1", "浦东校区", "CAMPUS");
        Map<String, Object> b1 = node("area:11", "1号楼", "AREA");
        Map<String, Object> f3 = node("floor:111", "3F", "FLOOR");
        add(f3, node("room:9001", "A301", "ROOM"));
        add(f3, node("room:9002", "A302", "ROOM"));
        add(b1, f3);
        add(pd, b1);

        Map<String, Object> px = node("campus:2", "浦西校区", "CAMPUS");
        Map<String, Object> b2 = node("area:21", "6号楼", "AREA");
        Map<String, Object> f1 = node("floor:211", "1F", "FLOOR");
        add(f1, node("room:9101", "B101", "ROOM"));
        add(b2, f1);
        add(px, b2);

        return List.of(pd, px);
    }

    private User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_probe");
        u.setRole(role);
        return u;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String json) throws Exception {
        AiTool tool = pack.tools().get(0);
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) tool.executor()
                .execute(new AiToolContext(user(RoleEnum.STAFF), 1L, 2L), args);
    }

    @Test
    @DisplayName("树压平：层级名串对、房间 id 取出、总数正确")
    void flattensTreeWithCorrectAncestry() throws Exception {
        when(cageShelfService.roomTree()).thenReturn(sampleTree());

        Map<String, Object> out = run("{}");
        assertEquals(3, out.get("total"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rooms = (List<Map<String, Object>>) out.get("rooms");
        Map<String, Object> a301 = rooms.stream()
                .filter(r -> "A301".equals(r.get("room"))).findFirst().orElseThrow();

        assertEquals("浦东校区", a301.get("campus"));
        assertEquals("1号楼", a301.get("area"));
        assertEquals("3F", a301.get("floor"));
        assertEquals("9001", a301.get("roomId"), "room:<id> 里的编号没取出来");
        assertEquals(5, a301.size());
    }

    @Test
    @DisplayName("keyword 按任意层级包含匹配")
    void filtersByKeywordAcrossLevels() throws Exception {
        when(cageShelfService.roomTree()).thenReturn(sampleTree());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> byCampus =
                (List<Map<String, Object>>) run("{\"keyword\":\"浦西\"}").get("rooms");
        assertEquals(1, byCampus.size());
        assertEquals("B101", byCampus.get(0).get("room"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> byRoom =
                (List<Map<String, Object>>) run("{\"keyword\":\"a30\"}").get("rooms");
        assertEquals(2, byRoom.size(), "关键字匹配应忽略大小写");
    }

    @Test
    @DisplayName("能力口径：MEMBER+ 可用（与领用房间树端点一致）")
    void capabilityMatchesRoomTreeEndpoint() {
        Map<String, java.util.function.Predicate<User>> caps = pack.capabilities();
        assertTrue(caps.get(CageQueryToolPack.CAP_ROOM_LIST).test(user(RoleEnum.MEMBER)));
        assertTrue(caps.get(CageQueryToolPack.CAP_ROOM_LIST).test(user(RoleEnum.ADMIN)));
    }

    @Test
    @DisplayName("包自描述完整：能力码有对应判定")
    void packMetaIsComplete() {
        assertEquals("cage", pack.packKey());
        assertNotNull(pack.defaultPrompt());
        for (AiTool t : pack.tools()) {
            assertNotNull(pack.capabilities().get(t.capability()),
                    "工具 " + t.name() + " 声明的能力码没有对应判定");
        }
    }

    /**
     * **合计要覆盖整间，明细才截**（2026-10-13 真机）。
     *
     * <p>原先在计数之前就把架子截成 5 架，于是「这间房还剩多少空位」永远答不全 ——
     * 用户拿到的是「已翻到的那几架里 0 个」，模型只能解释这是部分结果。
     * 会撑爆上下文的是每一格的明细，不是合计。
     */
    @Test
    @DisplayName("合计覆盖整间、明细才截：7 架房里数要算 7 架的，明细只列前 5 架")
    void countsCoverWholeRoomWhileDetailIsCapped() throws Exception {
        var studentSvc = mock(com.example.demo.modules.student.service.StudentCageShelfService.class);
        var shelfMapper = mock(com.example.demo.modules.cageshelf.mapper.CageShelfMapper.class);
        CageQueryToolPack cellPack = new CageQueryToolPack(cageShelfService, shelfMapper, studentSvc);
        when(shelfMapper.listRoomIdsMatchingName("X")).thenReturn(List.of("room:1"));
        List<String> shelfIds = new java.util.ArrayList<>();
        for (int i = 1; i <= 7; i++) {
            shelfIds.add("shelf:" + i);
        }
        when(shelfMapper.listShelveIdsByRoomIds(anyList())).thenReturn(shelfIds);
        // 每架一格：第 1 架空着、其余占着 —— 合计应当是 1 空 6 占
        when(studentSvc.getShelfDetail(any(), anyString())).thenAnswer(inv -> {
            boolean empty = "shelf:1".equals(inv.getArgument(1));
            Map<String, Object> cell = new LinkedHashMap<>();
            cell.put("empty", empty);
            cell.put("position", "A-1");
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("shelveId", inv.getArgument(1));
            meta.put("shelveName", "架子" + inv.getArgument(1));
            Map<String, Object> grid = new LinkedHashMap<>();
            grid.put("grid", List.of(cell));
            grid.put("shelfMeta", meta);
            return grid;
        });

        AiTool tool = cellPack.tools().stream()
                .filter(t -> t.name().equals("listCageCells")).findFirst().orElseThrow();
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) tool.executor()
                .execute(new AiToolContext(user(RoleEnum.STAFF), 1L, 2L),
                        om.readTree("{\"roomKeyword\":\"X\"}"));

        assertEquals(1, out.get("emptyCells"), "7 架里 1 架空着：" + out);
        assertEquals(6, out.get("filledCells"), "合计必须是整间的：" + out);
        assertEquals(7, out.get("countsCoverShelves"), "合计覆盖的架数：" + out);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> shelves = (List<Map<String, Object>>) out.get("shelves");
        assertEquals(5, shelves.size(), "明细只列前 5 架：" + out);
    }
}
