package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.service.TwinPersonnelArchiveQueryService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 公共查询工具包：**人员与课题组的解析**。
 *
 * <p>单独成包是因为它是所有业务域的公共前置 —— 任何「对某人做某事」的第一步都是先找到这个人。
 * 接口摸排显示「查人员」在全平台有 15 个入口、其中 4 个是真重复（文档 §A.2），
 * 这里固定用**最宽松的那一个**（`/api/v1/twin/dashboard/personnel/search`，仅登录即可），
 * 再把结果归一化成一套稳定字段 —— 让模型只看一种形状。
 *
 * <p>权限口径按各工具原本的入口对齐：人员搜索本就仅需登录；课题组搜索与成员列表原本挂在 ADMIN 控制器下，
 * 所以这里至少要求 STAFF / ADMIN，不因为「AI 调用」就放宽。
 */
@Component
public class CommonToolPack implements AiToolPack {

    public static final String CAP_PERSON_SEARCH = "ai.common.person.search";
    public static final String CAP_GROUP_SEARCH = "ai.common.group.search";
    public static final String CAP_GROUP_MEMBERS = "ai.common.group.members";

    /** 人员候选最多渲染几个可点选项（人名标签长，再多就把卡片顶出屏幕） */
    private static final int CHOICE_MAX_PERSON = 6;

    private final TwinDashboardMapper dashboardMapper;
    private final TwinPersonnelArchiveQueryService archiveQueryService;
    private final AroService aroService;

    public CommonToolPack(TwinDashboardMapper dashboardMapper,
                          TwinPersonnelArchiveQueryService archiveQueryService,
                          AroService aroService) {
        this.dashboardMapper = dashboardMapper;
        this.archiveQueryService = archiveQueryService;
        this.aroService = aroService;
    }

    @Override
    public String packKey() {
        return "common";
    }

    @Override
    public String displayName() {
        return "公共查询";
    }

    @Override
    public String defaultPrompt() {
        return """
                人员与课题组的解析口径：
                - 用户说的姓名、工号/学号、课题组名、部门名，都先查一遍再说话，不要凭印象。
                - 一个人可能对应多条记录（重名、多处任职）。候选多于一条时**不要自己挑**，
                  把候选交回给用户确认。
                - 一个都查不到就如实说查不到，不要拿名字相近的人顶替。
                - 课题组名在库里是逗号分隔的多值字段，本包返回的已经是拆好的单个组名。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与该 HTTP 端点同口径：/api/v1/twin/dashboard/personnel/search 只要求登录
                CAP_PERSON_SEARCH, user -> true,
                CAP_GROUP_SEARCH, user -> level(user) >= RoleEnum.STAFF.getLevel(),
                // 组员列表与上面两个同口径，都是 STAFF —— **不是疏忽，是刻意的**。
                //
                // 这里一度要求 ADMIN，但实测被绕过：`searchPerson` 的 SQL 里
                // `project_group_name LIKE '%kw%'`，用组名一搜就把整组成员带出来了，
                // 而那个接口在产品里本来只要求登录。同一份数据有两条到达路径时，
                // 严的那条只是摆设 —— 权限要按**数据可达性**定，不能按「工具」定。
                // 真要收紧，该改的是底层搜索接口的匹配字段（影响面比 AI 大，需单独评估），
                // 只绑 AI 这条腿只是让人回去手工搜索，安全性一点没变。
                CAP_GROUP_MEMBERS, user -> level(user) >= RoleEnum.STAFF.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(searchPerson(), searchProjectGroup(), listProjectGroupMembers());
    }

    // ── 工具 ──

    private AiTool searchPerson() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": {
                      "type": "string",
                      "description": "姓名、工号/学号、课题组名或部门名的任意片段"
                    },
                    "limit": {
                      "type": "integer",
                      "description": "最多返回几条候选，默认 20，上限 50"
                    }
                  },
                  "required": ["keyword"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "searchPerson",
                "**人员速查**：按关键词找人，返回候选（姓名、工号、部门、课题组四个字段）。"
                        + "**要找人、要核对某人是谁（含工号）时用它**；查不到人先用它，不要凭印象回答。"
                        + "**它只有这四个字段，不是完整档案** —— 没有账号状态、身份标识、房间授权、联系方式；"
                        + "别把它叫成「人员档案」，也别拿它的结果去回答这类问题（用户会以为你看过档案）。"
                        + "要完整档案得用 getPersonnelDetail；你的工具里没有它，就是你没这个权限，直说办不了。"
                        + "**也别拿它当课题组名单用** —— 它是关键词匹配，用组名搜只会命中名字里带那几个字的人，"
                        + "不全也不准，把这种结果说成「全部成员」就是编答案。"
                        + "要完整名单用 listProjectGroupMembers；若你的可用工具里没有它，说明你没这个权限，"
                        + "就直说办不了，或只说「这几个跟你搜的词沾边」并讲清这不是完整名单。",
                schema,
                CAP_PERSON_SEARCH,
                SideEffect.READ,
                (ctx, args) -> {
                    String keyword = text(args, "keyword");
                    if (keyword.isBlank()) {
                        return Map.of("total", 0, "candidates", List.of(), "note", "关键词为空");
                    }
                    int limit = clamp(args.path("limit").asInt(20), 1, 50);
                    List<Map<String, Object>> rows = dashboardMapper.searchPersonnelPaged(keyword, limit, 0);
                    boolean fromRemote = false;
                    if (rows == null || rows.isEmpty()) {
                        // 本地档案没有就回源 ARO 官方 —— 与页面上那条搜索接口的行为一致
                        List<Map<String, Object>> remote = aroService.searchPersonnelLite(keyword, limit);
                        if (remote != null && !remote.isEmpty()) {
                            rows = remote;
                            fromRemote = true;
                        }
                    }
                    List<Map<String, Object>> candidates = new ArrayList<>();
                    if (rows != null) {
                        for (Map<String, Object> row : rows) {
                            if (row == null) continue;
                            Map<String, Object> c = projectPerson(row);
                            if (!String.valueOf(c.get("name")).isBlank()
                                    || !String.valueOf(c.get("userId")).isBlank()) {
                                candidates.add(c);
                            }
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", candidates.size());
                    out.put("candidates", candidates);
                    if (fromRemote) {
                        out.put("source", "ARO 官方（本地档案未命中）");
                    }
                    if (candidates.size() > 1) {
                        out.put("note", "命中多条，请让用户确认是哪一位，不要自己选");
                    }
                    // 让用户**点选**而不是照正文手打。扩词搜索（「王毓」→ 王毓斐）、重名、多命中，
                    // 模型都会在正文里问「是哪一位」，但选项不给出来，用户就只能自己敲名字（真机反馈）。
                    // 上限定 6：人名标签比房间长，再多会把卡片顶出屏幕；超过 6 条仍由模型在正文里问。
                    if (!candidates.isEmpty() && candidates.size() <= CHOICE_MAX_PERSON) {
                        out.put("choices", PersonChoices.of(candidates));
                        // 标题带上关键词：面板里显示成「第 1/2 问 · 郑本风 挑一位」，
                        // 只写「挑一位」的话，多问时用户看不出这一问在问谁
                        out.put("choicesTitle", keyword + " · 挑一位");
                    }
                    return out;
                });
    }

    private AiTool searchProjectGroup() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "课题组名的任意片段" },
                    "limit": { "type": "integer", "description": "最多返回几个，默认 20，上限 50" }
                  },
                  "required": ["keyword"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "searchProjectGroup",
                "按关键词查课题组名，用来把用户口中的组名对准库里的完整组名。"
                        + "**它只回答「组名是什么」**，不回答「组里有谁」—— 要成员名单接下来调 listProjectGroupMembers。"
                        + "库里课题组名是逗号分隔的多值字段，这里返回的是拆好的单个组名。",
                schema,
                CAP_GROUP_SEARCH,
                SideEffect.READ,
                (ctx, args) -> {
                    String keyword = text(args, "keyword");
                    if (keyword.isBlank()) {
                        return Map.of("total", 0, "groups", List.of(), "note", "关键词为空");
                    }
                    int limit = clamp(args.path("limit").asInt(20), 1, 50);
                    List<String> groups = archiveQueryService.searchProjectGroupNames(keyword, limit);
                    return Map.of("total", groups.size(), "groups", groups);
                });
    }

    private AiTool listProjectGroupMembers() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "groupName": { "type": "string", "description": "完整的课题组名，先用 searchProjectGroup 拿到" },
                    "limit": { "type": "integer", "description": "最多返回几人，默认 50，上限 200" }
                  },
                  "required": ["groupName"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listProjectGroupMembers",
                "列出某个课题组的成员。**要「某课题组有哪些人」时用它**，别拿 searchPerson 凑。"
                        + "组名必须是完整准确的组名，先用 searchProjectGroup 确认。",
                schema,
                CAP_GROUP_MEMBERS,
                SideEffect.READ,
                (ctx, args) -> {
                    String group = text(args, "groupName");
                    if (group.isBlank()) {
                        return Map.of("total", 0, "members", List.of(), "note", "课题组名为空");
                    }
                    int limit = clamp(args.path("limit").asInt(50), 1, 200);
                    List<Map<String, Object>> rows = archiveQueryService.listMembersByProjectGroup(group, limit);
                    List<Map<String, Object>> members = new ArrayList<>();
                    for (Map<String, Object> row : rows) {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("userId", str(row.get("user_id")));
                        m.put("name", str(row.get("name")));
                        m.put("head", str(row.get("head")));
                        members.add(m);
                    }
                    return Map.of("groupName", group, "total", members.size(), "members", members);
                });
    }

    // ── 归一化 ──

    /**
     * 把 {@code SELECT *} 的宽行收敛成稳定的小字段集。
     *
     * <p>不这么做的话：aro_personnel 有 27 列会整包塞给模型，既费 token 又可能带出不该给的字段；
     * 而且字段命名在不同接口间并不统一（接口摸排文档 §A.3），模型会看到一堆形状。
     */
    private static Map<String, Object> projectPerson(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", str(row.get("user_id")));
        m.put("name", str(row.get("name")));
        m.put("jobNumber", str(row.get("job_number")));
        m.put("department", str(row.get("department_name")));
        m.put("projectGroup", str(row.get("project_group_name")));
        return m;
    }

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }

    private static String text(JsonNode args, String field) {
        return args.path(field).asText("").trim();
    }

    private static String str(Object o) {
        if (o == null) return "";
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }

    private static int clamp(int v, int min, int max) {
        return Math.min(Math.max(v, min), max);
    }
}
