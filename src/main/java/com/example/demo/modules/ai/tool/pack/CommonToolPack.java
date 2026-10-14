package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiChoices;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.service.TwinPersonnelArchiveQueryService;
import com.example.demo.modules.twin.common.util.ChineseNameSimilarity;
import com.example.demo.modules.twin.scan.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.scan.dto.scan.ScanUserInfoDTO;
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
    private final com.example.demo.modules.twin.scan.service.TwinScanAppService scanAppService;

    public CommonToolPack(TwinDashboardMapper dashboardMapper,
                          TwinPersonnelArchiveQueryService archiveQueryService,
                          AroService aroService,
                          com.example.demo.modules.twin.scan.service.TwinScanAppService scanAppService) {
        this.dashboardMapper = dashboardMapper;
        this.archiveQueryService = archiveQueryService;
        this.aroService = aroService;
        this.scanAppService = scanAppService;
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
                - **用户只丢一串 8 位编号、或问「这卡是谁的」→ 用 lookupCardHolder**（它跟首页程序坞那个
                  输入框是同一个识别服务）；**别拿 searchPerson 去查卡号**，它的关键词只认姓名/工号/
                  课题组/部门，卡号一个字都匹配不上。
                  认出来之后**先把这个人报给用户**（姓名、部门、课题组、有没有绑卡），
                  **再问要不要打开他的档案**；他点头了才带 open=true 再调一次去开弹窗 —— 别自己替他打开。
                  （小屏那端没有档案页，带了 open 也不会跳，只会把结果留在对话里，不用你另行处理。）
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
        return List.of(searchPerson(), searchProjectGroup(), listProjectGroupMembers(), lookupCardHolder());
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
                        + "就直说办不了，或只说「这几个跟你搜的词沾边」并讲清这不是完整名单。"
                        + "**名字写成同音字照样查得到**（「王玉菲」能找到「王毓菲」）：精确查不到时工具会按"
                        + "**姓名相似度**给出最像的几位，把它们交给用户点一个确认即可，"
                        + "**别直接回「查无此人」** —— 生活里写错名字最常见的形态就是谐音。",
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
                    /*
                     * 一个字都没命中 → 多半是**打了同音字**（「王玉菲」vs「王毓菲」）。
                     * 生活里写错名字最常见的形态就是谐音，而关键词搜索对这类一点用都没有：
                     * 它只会说「查不到」，用户再报一遍同样的音、再查不到。按姓名相似度捞一批顶上。
                     * 判据见 ChineseNameSimilarity：长度要差不多、至少对上两个字（音或字都算）。
                     */
                    boolean fuzzy = false;
                    if (candidates.isEmpty()) {
                        candidates.addAll(fuzzyPersonnel(keyword, limit));
                        fuzzy = !candidates.isEmpty();
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", candidates.size());
                    out.put("candidates", candidates);
                    if (fuzzy) {
                        out.put("matchedBy", "姓名相似度（关键词一个字都没精确命中，下面是名字最像的几位）");
                        out.put("note", "让用户点一个确认是哪一位，不要在正文里复述候选、也不要替他认定");
                    }
                    if (fromRemote) {
                        out.put("source", "ARO 官方（本地档案未命中）");
                    }
                    if (candidates.size() > 1) {
                        out.put("note", "命中多条，请让用户确认是哪一位，不要自己选");
                    }
                    /*
                     * 让用户**点选**而不是照正文手打。扩词搜索（「王毓」→ 王毓斐）、重名、多命中，
                     * 模型都会在正文里问「是哪一位」，但选项不给出来，用户就只能自己敲名字（真机反馈）。
                     * 上限定 6：人名标签比房间长，再多会把卡片顶出屏幕；超过 6 条仍由模型在正文里问。
                     *
                     * <p><b>只有 2 位以上才当「一道题」摆出来</b>（2026-10-13）：命中唯一时没什么可挑的，
                     * 再摆一张「挑一位」就是用户点名过的那种「只有一个可选的还非要我选」。
                     * 而且必须打「必须问」的标记 —— 不打的话编排层默认丢掉，正文里写着「请点一下」
                     * 而界面上一个选项都没有（真机 2026-10-13：重名的 4 位就是这么消失的）。
                     */
                    if (candidates.size() > 1 && candidates.size() <= CHOICE_MAX_PERSON) {
                        out.putAll(AiChoices.requiredSingle(keyword + " · 挑一位",
                                PersonChoices.of(candidates)));
                    }
                    return out;
                });
    }

    /**
     * 按**卡号**认人 —— 与首页程序坞那个输入框（{@code scan/analyze}）**同一个服务**。
     *
     * <p><b>为什么要它</b>（2026-10-13 用户反馈）：现场常见的是「刷了卡，把卡面那串 8 位编号敲进对话」。
     * 在这条工具之前，模型只能看出「这像卡号」，却没有任何一条能把它落成人 ——
     * {@code searchPerson} 的关键词只匹配姓名/工号/课题组/部门，**不认卡号**，模型只能建议去翻刷卡记录。
     *
     * <p>口径刻意与程序坞输入框保持一致（同一个 {@code analyzeScan}）：那边认得出的人这边也认得出，
     * 那边认不出的这边同样如实说认不出，**绝不猜一个相近的人顶上**。
     *
     * <p><b>两步走</b>（用户定的口径）：默认只把这个人报出来；用户点头要看档案了，
     * 才带 {@code open=true} 再调一次，由载体打开档案弹窗。
     */
    private AiTool lookupCardHolder() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "cardNo": { "type": "string", "description": "卡片上那串 8 位字母数字编号" },
                    "open": { "type": "boolean", "description": "用户**已经点头**要看这个人的档案时才传 true（会在他那边打开档案弹窗）；默认 false，只做识别" }
                  },
                  "required": ["cardNo"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "lookupCardHolder",
                "**按卡号认人**：给一串卡号，返回这张卡对应的持卡人（姓名/工号/部门/课题组/身份，以及有没有绑卡）。"
                        + "用户只丢一串 8 位编号、或问「这卡是谁的」时用它；**别拿 searchPerson 查卡号**（它不认卡号）。"
                        + "认出来之后**先把人报给用户**，再问他要不要打开这人的档案；他点头了才带 open=true 再调一次。",
                schema,
                CAP_PERSON_SEARCH,
                SideEffect.READ,
                (ctx, args) -> {
                    String cardNo = text(args, "cardNo");
                    if (cardNo.isBlank()) {
                        return Map.of("ok", false, "reason", "没给卡号");
                    }
                    ScanAnalyzeResponseDTO dto;
                    try {
                        dto = scanAppService.analyzeScan(cardNo, ctx.actor(), null);
                    } catch (Exception e) {
                        return Map.of("ok", false, "cardNo", cardNo,
                                "reason", "按卡号识别失败：" + (e.getMessage() == null ? "未知错误" : e.getMessage()),
                                "note", "如实说这回认不出来，**别猜一个相近的人顶上**");
                    }
                    if (dto == null || dto.getUserInfo() == null) {
                        return Map.of("ok", false, "cardNo", cardNo,
                                "reason", "这串号认不出人（可能不是卡号，或者这张卡没绑到人）",
                                "note", "如实说认不出，别编一个人；也可以问用户是不是想按姓名/工号找");
                    }
                    ScanUserInfoDTO u = dto.getUserInfo();
                    Map<String, Object> person = new LinkedHashMap<>();
                    person.put("name", str(u.getName()));
                    person.put("userId", str(u.getUserId()));
                    person.put("department", str(u.getDepartmentName()));
                    person.put("projectGroup", str(u.getProjectGroupName()));
                    person.put("identity", str(u.getUserTypeNames()));
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("cardNo", cardNo);
                    out.put("person", person);
                    out.put("cardBound", dto.getHasPhysicalCardMapping());
                    if (str(dto.getCurrentState()).length() > 0) {
                        out.put("state", str(dto.getCurrentState()));
                    }
                    if (Boolean.FALSE.equals(dto.getHasPhysicalCardMapping())) {
                        out.put("note", "这个人**还没绑卡**。绑卡走卡片上那个「去绑卡」入口；"
                                + "**不要**拿卡号去调免冻那类工具（那些只认姓名或工号）");
                    }
                    if (args.path("open").asBoolean(false)) {
                        if (ctx.miniProgram()) {
                            // 小程序那端没有首页程序坞这个页面，跳过去只会落到一个不存在的地方 ——
                            // 那边就只把结果留在对话里（人已经报出来了，用户想干嘛接着说）
                            out.put("note", "这人已经报出来了；小屏那端没有程序坞那个档案页，"
                                    + "就不再跳转了 —— 需要办什么直接跟用户说");
                        } else {
                            Map<String, Object> nav = new LinkedHashMap<>();
                            nav.put("path", "/console/dashboard?scan="
                                    + java.net.URLEncoder.encode(cardNo, java.nio.charset.StandardCharsets.UTF_8));
                            nav.put("label", person.get("name") + " 的档案");
                            out.put("navigate", nav);
                            out.put("note", "已让载体在他那边打开这人的档案弹窗（这一步只能发生在用户点头之后）");
                        }
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
                        + "库里课题组名是逗号分隔的多值字段，这里返回的是拆好的单个组名。"
                        + "**关键词要按用户原话整段传**（「郑均克」就传「郑均克」，别只传「郑」）："
                        + "查不到时本工具自己会按**姓名相似度**给出最像的几个（同音字打错也能捞到），"
                        + "你再把这些列给用户点一个确认即可。你自己把关键词缩成一两个字再搜是错的 ——"
                        + "那样回来的全是只跟用户共一个姓、与要找的人无关的组，只会拿一堆不相干的人烦用户。",
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
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", groups.size());
                    out.put("groups", groups);
                    // 命中里没有一个是含着关键词的 → 走的**相似度兜底**（精确一个字都没对上）。
                    // 得说清楚：这些是「像的」不是「就是」，交给用户点头，别自己认定。
                    // 判据能这么写，是因为精确那条路上返回的每个组名必然含关键词（见 distinctGroupsMatchingKeyword）。
                    if (!groups.isEmpty() && groups.stream().noneMatch(g -> g.contains(keyword))) {
                        out.put("matchedBy", "姓名相似度（关键词一个字都没精确命中，下面是名字最像的组名）");
                        out.put("note", "让用户点一个确认是不是它，不要在正文里复述候选、也不要替他认定");
                    }
                    return out;
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

    /**
     * 关键词一个字都没命中时的兜底：**逐字去捞一批**，再按「有多像」排序取前几位。
     *
     * <p>逐字而不是只看姓氏：打错的那个字可能在任何一位（包括姓）。每位捞一批再合并，
     * 覆盖面比只按姓捞大得多；捞完在内存里比字、比音，不必让数据库做相似度。
     *
     * <p>只取前 {@code CHOICE_MAX_PERSON} 位：人名标签长，再多就把卡片顶出屏幕，
     * 而且候选一多「最像的那个」反而不显眼。
     */
    private List<Map<String, Object>> fuzzyPersonnel(String keyword, int limit) {
        String q = keyword == null ? "" : keyword.trim();
        if (q.length() < 2) {
            return List.of();
        }
        Map<Object, Map<String, Object>> rows = new LinkedHashMap<>();
        int tried = 0;
        for (char c : q.toCharArray()) {
            if (tried >= 3) {
                break;
            }
            tried++;
            List<Map<String, Object>> hits = dashboardMapper.searchPersonnelPaged(String.valueOf(c), 60, 0);
            if (hits == null) {
                continue;
            }
            for (Map<String, Object> row : hits) {
                if (row != null && row.get("user_id") != null) {
                    rows.putIfAbsent(row.get("user_id"), row);
                }
            }
        }
        List<Map.Entry<Integer, Map<String, Object>>> scored = new ArrayList<>();
        for (Map<String, Object> row : rows.values()) {
            int score = ChineseNameSimilarity.score(str(row.get("name")), q);
            if (score > 0) {
                scored.add(new java.util.AbstractMap.SimpleEntry<>(score, row));
            }
        }
        scored.sort((x, y) -> Integer.compare(y.getKey(), x.getKey()));
        return scored.stream()
                .limit(Math.min(Math.max(limit, 1), CHOICE_MAX_PERSON))
                .map(e -> projectPerson(e.getValue()))
                .toList();
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
