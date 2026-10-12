package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 笼架查询工具包：房间目录 + **笼位明细**（都只读）。
 *
 * <p><b>笼架域 201 条路由，每一件都要先确认它的门开在哪一层。</b>这个包的入选标准是
 * 「拿到数据的那条路上**已经有一道自带权限与脱敏的公开入口**」：
 * <ul>
 *   <li>{@link CageShelfService#roomTree()} —— 领用房间目录（注释明写「学生下单也要选房间，
 *       不能按管理端口径卡权限」），权限纯角色判定，服务层没有按人裁剪；</li>
 *   <li>{@link StudentCageShelfService#getShelfDetail} —— 笼位明细。笼架域的可见性策略
 *       （全局阈值 SUPER_ADMIN、按课题组脱敏、按区域授权）**不在服务层统一做**，而是散在控制器里
 *       （{@code CageCellIndexController.applyGroupMask} / {@code markMineForStudent}）；
 *       直接调 {@code CageCellIndexService} 会**绕过那道门**、把非本组的 PI/部门漏出去。
 *       {@code getShelfDetail} 是那条路上唯一公开、且自带权限校验与脱敏的入口（无权限直接抛，
 *       格子里 PI/部门/AUP 被置成 {@code ***}/空）—— 笼位工具只用它，绝不自己拼脱敏。</li>
 * </ul>
 * <p>加工具前先定位那道门，是这次摸出来的硬要求（见接口摸排文档 §B）。
 */
@Component
public class CageQueryToolPack implements AiToolPack {

    public static final String CAP_ROOM_LIST = "ai.cage.room.list";
    /** 笼位明细的能力码：与 /cage-cell-index/local-grid/** 同档（requireMinRole(MEMBER)）。 */
    public static final String CAP_CAGE_CELLS = "ai.cage.cells";

    /** 房间目录一次最多回这么多行：全量树在房间多时会很长，超出就截断并注明。 */
    private static final int MAX_ROOMS = 200;
    /** 一次最多翻几个架子 —— 每个架子都要拉一遍网格，翻几十架又慢又没用。 */
    private static final int MAX_SHELVES = 5;

    private final CageShelfService cageShelfService;
    private final CageShelfMapper cageShelfMapper;
    private final StudentCageShelfService studentCageShelfService;

    public CageQueryToolPack(CageShelfService cageShelfService,
                             CageShelfMapper cageShelfMapper,
                             StudentCageShelfService studentCageShelfService) {
        this.cageShelfService = cageShelfService;
        this.cageShelfMapper = cageShelfMapper;
        this.studentCageShelfService = studentCageShelfService;
    }

    @Override
    public String packKey() {
        return "cage";
    }

    @Override
    public String displayName() {
        return "笼架查询";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        return Set.of("笼架", "笼位", "笼子", "房间", "校区", "饲养架", "空笼位");
    }

    @Override
    public String defaultPrompt() {
        return """
                笼架数据的口径：
                - listRooms 返回的是**领用房间目录**（校区 → 区域 → 楼层 → 房间），只到房间级。
                - **要看笼位明细（哪几个笼子空着 / 在养什么）用 listCageCells**：
                  按房间名片段（如「203」）或笼架编号取该架子的每一格。**只有你有权看的架子会返回**，
                  被挡住的会列在 skipped 里并写明原因 —— 如实转述成「这几个架子你没权限看」，
                  **别当成「没有笼位」**。
                - 空笼位判据是「这一格没有占用笼盒」：返回里 empty=true。用户问「有哪些空笼位」就传
                  onlyEmpty=true；问「在养什么」用默认的 onlyEmpty=false（默认连占用者/课题组一起回）。
                - 房间 id 是内部编号，跟界面上显示的房间名不是一回事；引用房间时用返回的 name，别自己拼 id。
                - **位号有两套口径**：工具返回的 position 是**原始位号**（形如 {@code B-3}，与单据/入库同一套）；
                  而笼架页网格上看到的是前端**翻转行号后**的那一套，同一个笼子两个号看着可能相反。
                  用户拿着屏幕上的格子号来问时，提醒他这一点，别硬对。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与 /api/v1/cage-shelves/room-tree 同口径：requireMinRole(MEMBER)
                CAP_ROOM_LIST, user -> level(user) >= RoleEnum.MEMBER.getLevel(),
                // 笼位明细：与 /cage-cell-index/local-grid/** 同口径；
                // 「能看到哪些架子」由 getShelfDetail 自己按课题组/区域授权再收一次
                CAP_CAGE_CELLS, user -> level(user) >= RoleEnum.MEMBER.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listRooms(), listCageCells());
    }

    private AiTool listRooms() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": {
                      "type": "string",
                      "description": "可选。按校区/区域/楼层/房间名做包含匹配，留空返回全部"
                    }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listRooms",
                "列出笼架的领用房间目录（校区/区域/楼层/房间）。用户问「有哪些房间」「某栋楼哪些房间」时用它。",
                schema,
                CAP_ROOM_LIST,
                SideEffect.READ,
                (ctx, args) -> {
                    String keyword = text(args, "keyword").toLowerCase();
                    List<Map<String, Object>> tree = cageShelfService.roomTree();
                    List<Map<String, Object>> rows = new ArrayList<>();
                    flatten(tree, null, null, null, keyword, rows);

                    boolean truncated = rows.size() > MAX_ROOMS;
                    List<Map<String, Object>> out = truncated ? rows.subList(0, MAX_ROOMS) : rows;

                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("total", rows.size());
                    result.put("rooms", out);
                    if (truncated) {
                        result.put("note", "结果超过 " + MAX_ROOMS + " 条已截断，建议加 keyword 缩小范围");
                    }
                    return result;
                });
    }

    /**
     * 笼位明细：某一架（或某个房间名片段下的前几架）的每一格。
     *
     * <p><b>为什么绕到 {@link StudentCageShelfService#getShelfDetail} 取数</b>见类注释 ——
     * 那是笼架域唯一一条「公开 + 自带权限校验 + 自带脱敏」的读入口。自己拼一份脱敏
     * 就是复制一道安全逻辑，抄错了就是数据泄露。
     */
    private AiTool listCageCells() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "roomKeyword": { "type": "string", "description": "房间名片段（如「203」），按它找出该房间下的笼架" },
                    "shelveId": { "type": "string", "description": "笼架编号（雪花 id，**当字符串传**）。给了它就只看这一架" },
                    "onlyEmpty": { "type": "boolean", "description": "true=只回空笼位（用户问「还有哪些空位」）；默认 false（连占用情况一起回）" },
                    "limit": { "type": "integer", "description": "最多回几格，默认 60，上限 120" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listCageCells",
                "查笼位明细：某个房间（或某一架）里每一格的占用情况 —— 空着 / 谁在养 / 哪个课题组。"
                        + "用户问「有哪些空笼位」「203 房间里养了什么」时用它。",
                schema,
                CAP_CAGE_CELLS,
                SideEffect.READ,
                (ctx, args) -> {
                    User user = ctx.actor();
                    String shelveId = text(args, "shelveId");
                    String keyword = text(args, "roomKeyword");
                    boolean onlyEmpty = args.path("onlyEmpty").asBoolean(false);
                    int limit = Math.min(Math.max(args.path("limit").asInt(60), 1), 120);

                    List<String> shelveIds = new ArrayList<>();
                    if (!shelveId.isEmpty()) {
                        shelveIds.add(shelveId.trim());
                    } else if (!keyword.isEmpty()) {
                        List<String> roomIds = cageShelfMapper.listRoomIdsMatchingName(keyword.trim());
                        if (roomIds == null || roomIds.isEmpty()) {
                            return Map.of("ok", true, "totalCells", 0, "emptyCells", 0, "shelves", List.of(),
                                    "note", "没有名字里带「" + keyword + "」的房间。先用 listRooms 看看"
                                            + "房间到底叫什么，再按那个名字查。");
                        }
                        List<String> ids = cageShelfMapper.listShelveIdsByRoomIds(roomIds);
                        shelveIds.addAll(ids == null ? List.of() : ids);
                    } else {
                        return Map.of("ok", false, "reason", "要么给 roomKeyword（房间名片段），要么给 shelveId");
                    }

                    boolean truncated = shelveIds.size() > MAX_SHELVES;
                    if (truncated) {
                        shelveIds = new ArrayList<>(shelveIds.subList(0, MAX_SHELVES));
                    }

                    List<Map<String, Object>> shelvesOut = new ArrayList<>();
                    List<String> skipped = new ArrayList<>();
                    int emptyCount = 0, filledCount = 0, emitted = 0;
                    outer:
                    for (String id : shelveIds) {
                        Map<String, Object> grid;
                        try {
                            // 权限校验 + 脱敏都在这一个调用里（无权限直接抛）
                            grid = studentCageShelfService.getShelfDetail(user, id);
                        } catch (RuntimeException e) {
                            skipped.add(id + "（" + e.getMessage() + "）");
                            continue;
                        }
                        List<Map<String, Object>> cells = new ArrayList<>();
                        if (grid.get("grid") instanceof List<?> list) {
                            for (Object o : list) {
                                if (!(o instanceof Map<?, ?> raw)) continue;
                                @SuppressWarnings("unchecked")
                                Map<String, Object> cell = (Map<String, Object>) raw;
                                // 空 = 这一格没有占用笼盒；服务层已经给了 empty，取不到就按 animalCageId 判
                                boolean empty = cell.get("empty") != null
                                        ? !Boolean.FALSE.equals(cell.get("empty"))
                                        : isBlank(cell.get("animalCageId"));
                                if (empty) emptyCount++; else filledCount++;
                                if (onlyEmpty && !empty) continue;
                                if (emitted >= limit) break outer;
                                Map<String, Object> row = new LinkedHashMap<>();
                                row.put("position", str(cell.get("position")));
                                row.put("empty", empty);
                                if (!empty) {
                                    row.put("occupant", str(cell.get("occupantName")));
                                    row.put("projectGroup", str(cell.get("projectGroup")));
                                    row.put("pi", str(cell.get("projectPiName")));
                                    row.put("aup", str(cell.get("aupNumber")));
                                    if (cell.get("visible") != null) {
                                        row.put("visible", cell.get("visible"));
                                    }
                                }
                                cells.add(row);
                                emitted++;
                            }
                        }
                        Map<String, Object> sh = new LinkedHashMap<>();
                        if (grid.get("shelfMeta") instanceof Map<?, ?> m) {
                            sh.put("shelveId", str(m.get("shelveId")));
                            sh.put("name", str(m.get("shelveName")));
                        } else {
                            sh.put("shelveId", id);
                        }
                        sh.put("cells", cells);
                        shelvesOut.add(sh);
                    }

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("emptyCells", emptyCount);
                    out.put("filledCells", filledCount);
                    out.put("returnedCells", emitted);
                    out.put("shelves", shelvesOut);
                    if (!skipped.isEmpty()) {
                        // 如实说：这些架子不是「没有笼位」，是**你没权限看**
                        out.put("skipped", skipped);
                    }
                    if (truncated) {
                        out.put("note", "匹配到的架子较多，只翻了前 " + MAX_SHELVES
                                + " 架。要更全就换个更具体的房间名再查一次。");
                    }
                    return out;
                });
    }

    /** 空 / 空串 / 字面「null」都算「没有占用笼盒」。 */
    private static boolean isBlank(Object o) {
        if (o == null) return true;
        String s = String.valueOf(o).trim();
        return s.isEmpty() || "null".equals(s);
    }

    private static String str(Object o) {
        return o == null || "null".equals(String.valueOf(o)) ? "" : String.valueOf(o);
    }

    /**
     * 把 campus/area/floor/room 四层树压成平铺行 —— 模型要的是「哪个房间」，不是嵌套结构。
     * 房间 id 形如 {@code room:<roomId>}，这里只取冒号后的编号。
     */
    @SuppressWarnings("unchecked")
    private static void flatten(List<Map<String, Object>> nodes, String campus, String area, String floor,
                                String keyword, List<Map<String, Object>> out) {
        if (nodes == null) {
            return;
        }
        for (Map<String, Object> n : nodes) {
            if (n == null) {
                continue;
            }
            String level = String.valueOf(n.getOrDefault("level", ""));
            String name = String.valueOf(n.getOrDefault("name", ""));

            String c = campus;
            String a = area;
            String f = floor;
            if ("CAMPUS".equals(level)) {
                c = name;
            } else if ("AREA".equals(level)) {
                a = name;
            } else if ("FLOOR".equals(level)) {
                f = name;
            } else if ("ROOM".equals(level)) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("campus", c == null ? "" : c);
                row.put("area", a == null ? "" : a);
                row.put("floor", f == null ? "" : f);
                row.put("room", name);
                row.put("roomId", roomIdOf(String.valueOf(n.getOrDefault("id", ""))));
                if (keyword.isEmpty() || matches(row, keyword)) {
                    out.add(row);
                }
                continue;
            }
            flatten((List<Map<String, Object>>) n.get("children"), c, a, f, keyword, out);
        }
    }

    private static boolean matches(Map<String, Object> row, String keyword) {
        for (String k : List.of("campus", "area", "floor", "room")) {
            String v = String.valueOf(row.get(k));
            if (v != null && v.toLowerCase().contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private static String roomIdOf(String treeId) {
        int i = treeId.indexOf(':');
        return i >= 0 ? treeId.substring(i + 1) : treeId;
    }

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }

    private static String text(JsonNode args, String field) {
        return args.path(field).asText("").trim();
    }
}
