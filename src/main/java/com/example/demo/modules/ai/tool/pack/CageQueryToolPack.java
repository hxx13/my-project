package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 笼架查询工具包：只读的房间目录。
 *
 * <p><b>为什么只放这一个工具</b>：笼架域 201 条路由，能查到的东西很多，但**每一件都要先确认它的门开在哪一层**。
 * 这个包的入选标准是「服务层返回的就是设计上不按人过滤的数据」：
 * {@link CageShelfService#roomTree()} 是领用房间目录（注释明写「学生下单也要选房间，不能按管理端口径卡权限」），
 * 权限纯角色判定，服务层没有按人裁剪。换一个接口就不一定 —— 笼架域的可见性策略
 * （全局阈值 SUPER_ADMIN、按课题组脱敏、按区域授权）分散在不同层，**直接调服务可能绕过它**。
 * 加工具前先定位那道门，是这次摸出来的硬要求（见接口摸排文档 §B）。
 */
@Component
public class CageQueryToolPack implements AiToolPack {

    public static final String CAP_ROOM_LIST = "ai.cage.room.list";

    /** 房间目录一次最多回这么多行：全量树在房间多时会很长，超出就截断并注明。 */
    private static final int MAX_ROOMS = 200;

    private final CageShelfService cageShelfService;

    public CageQueryToolPack(CageShelfService cageShelfService) {
        this.cageShelfService = cageShelfService;
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
        return Set.of("笼架", "笼位", "房间", "校区", "饲养架");
    }

    @Override
    public String defaultPrompt() {
        return """
                笼架数据的口径：
                - listRooms 返回的是**领用房间目录**（校区 → 区域 → 楼层 → 房间），只到房间级，
                  不是笼位明细。要问某房间有多少笼位、养了谁，那是另一类查询，本包没有。
                - 房间 id 是内部编号，跟界面上显示的房间名不是一回事；引用房间时用返回的 name，别自己拼 id。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与 /api/v1/cage-shelves/room-tree 同口径：requireMinRole(MEMBER)
                CAP_ROOM_LIST, user -> level(user) >= RoleEnum.MEMBER.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listRooms());
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
