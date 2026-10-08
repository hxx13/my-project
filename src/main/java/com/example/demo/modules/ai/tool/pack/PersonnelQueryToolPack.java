package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 人员档案包 —— 把「人员授权」页（{@code /console/admin/personnel}）那套查询接给模型。
 *
 * <p><b>为什么单开一个包、单开一个能力码，不并进公共查询</b>：这批数据比公共查询敏感一档 ——
 * 手机号/邮箱、账号绑定情况、房间授权、身份标识，都是「管理台账」而不是「找人问路」。
 * 合并进 {@code common}（所有场景恒定下发）等于把台账摊给每一个提问，
 * 门禁也就跟着降到公共查询那一档了。按页面的入口口径收到 **SUPER_ADMIN 起**，与
 * {@code adminNavRegistry} 里「人员授权」的 {@code fallbackMinRole: SUPER_ADMIN} 一致。
 *
 * <p><b>与既有人员类工具的分工</b>（描述里都写着，避免同族互选）：
 * <ul>
 *   <li>{@code searchPerson}（公共包，人人可用）：**只按关键词**找人，返回候选与 id。</li>
 *   <li>{@code searchProjectGroup} / {@code listProjectGroupMembers}（公共包）：只回答「组名是什么」与「组里有谁」。</li>
 *   <li>本包：**按条件筛人 + 计数**（角色/账号有无/课题组/部门/房间/身份标识/校内校外/回收站），
 *       以及**单人的完整档案**。它替代不了前两者，前者也答不了「还有多少人没发教职工账号」这类问题。</li>
 * </ul>
 *
 * <p>两个工具都是 A 级只读，不挂确认。
 */
@Component
public class PersonnelQueryToolPack implements AiToolPack {

    /** 独立能力码。**不要**与 {@code ai.person.search} 等合并 —— 合并就等于把门禁一起放宽。 */
    public static final String CAP_PERSONNEL = "ai.personnel.query";

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 50;
    private static final int DICT_LIMIT = 8;

    private final PersonnelService personnelService;
    private final PersonIdentityService personIdentityService;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelQueryToolPack(PersonnelService personnelService,
                                  PersonIdentityService personIdentityService,
                                  JdbcTemplate jdbcTemplate) {
        this.personnelService = personnelService;
        this.personIdentityService = personIdentityService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public String packKey() {
        return "personnel";
    }

    @Override
    public String displayName() {
        return "人员档案";
    }

    /**
     * 路由词只挑**人员域独有**的说法。
     *
     * <p>刻意不写「部门」「课题组」这类别的域也天天说的词：路由是抢 4 个包位的加权排序，
     * 写宽了会在笼架、订购那些话题里把本包顶进候选，挤掉真正该带上的包。
     * {@code packKey} / {@code displayName} 本身就是路由词，页面路径 {@code /console/admin/personnel}
     * 已经能直接命中，所以这里只补口语。
     */
    @Override
    public Set<String> routeHints() {
        return Set.of("人员授权", "人员档案", "工号", "教职工账号", "身份标识", "回收站", "校内", "校外", "超级管理员");
    }

    @Override
    public String defaultPrompt() {
        return """
                人员档案的口径：
                - 「系统账号」「教职工账号」是**同一件事**：人员表 staff_id 非空。学生账号（aro_user_id 那条）
                  不算 —— 问「谁还没有系统账号」要的是**还没发教职工账号**的那批人（accountType=nosys），
                  别把纯学生也算成"有账号"。
                - 角色是**人级唯一权威**（personnel.role），一个自然人只有一档；部门 ≠ 课题组，是两个独立归属。
                - **total 才是命中总数**，personnel 数组只是当前这一页。total 大于返回条数时必须说清
                  「共 N 人，这里列了前 M 人」，必要时用 offset 翻页；把一页说成全部就是编答案。
                - 列表里查不到就直说没查到。要一个人只给了名字/工号时，先 searchPerson 拿到 id，
                  再 getPersonnelDetail —— 不要把列表里的模糊匹配结果当成「就是这个人」。
                - 联系方式、账号绑定属于**管理台账**，只在用户问到时回答，不要主动罗列手机号/邮箱。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        // 与页面入口同口径：SUPER_ADMIN 起（含平台所有者）。比 HTTP 接口的 ADMIN 更严是故意的 ——
        // 接口是「管理端页面」的入口，这里还要过一道「AI 该不该替他去翻台账」。
        return Map.of(CAP_PERSONNEL, user -> level(user) >= RoleEnum.SUPER_ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(queryPersonnel(), getPersonnelDetail());
    }

    // ── 读：按条件筛人 + 计数 ──

    private AiTool queryPersonnel() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "姓名/工号/账号/手机号/邮箱/部门名/课题组名的片段" },
                    "role": { "type": "string", "description": "角色：MEMBER 学生 / STAFF 普通员工 / SENIOR 高级员工 / ADMIN 管理员 / SUPER_ADMIN 超级管理员 / PLATFORM_OWNER 平台所有者；也收中文写法" },
                    "status": { "type": "integer", "description": "教职工账号状态：1 启用 / 0 禁用；省略=不限" },
                    "accountType": { "type": "string", "description": "sys 只看有教职工账号的；nosys 只看**还没有**教职工账号的；省略=不限" },
                    "projectGroup": { "type": "string", "description": "课题组名（库里是逗号分隔的多值字段，按单个组名筛）" },
                    "department": { "type": "string", "description": "部门名" },
                    "roomName": { "type": "string", "description": "房间授权（按房间名/编号的片段匹配）" },
                    "identityTag": { "type": "string", "description": "身份标识：标签名或 code，如「课题组组长」「LAB_MEMBER」" },
                    "isSchool": { "type": "integer", "description": "1 校内 / 0 校外；省略=不限" },
                    "trashOnly": { "type": "boolean", "description": "true=只看**回收站**里已删除的人；省略/false=只看正常的（默认）" },
                    "limit": { "type": "integer", "description": "每页返回几条，默认 20，上限 50" },
                    "page": { "type": "integer", "description": "第几页，从 1 起；默认 1" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryPersonnel",
                "按条件筛选人员档案并返回命中总数 —— 「有多少人/都有谁」这类问题用它："
                        + "按角色、有没有教职工账号、课题组、部门、房间授权、身份标识、校内校外、回收站。"
                        + "**只知道一个名字或工号、要找到那个人**时别用它（那是 searchPerson 的活，它还能让用户点选）；"
                        + "**要看某一个人的完整档案**用 getPersonnelDetail。"
                        + "返回的 total 是命中总数、personnel 只有当页，说结论时别说成一整份名单。",
                schema,
                CAP_PERSONNEL,
                SideEffect.READ,
                (ctx, args) -> doQuery(args));
    }

    private Object doQuery(JsonNode args) {
        PersonnelFilter f = new PersonnelFilter();

        String role = normalizeRole(text(args, "role"));
        if (!text(args, "role").isEmpty() && role == null) {
            return Map.of("ok", false,
                    "reason", "角色只认这几档，请让用户挑一个。",
                    "candidates", roleCandidates());
        }
        f.setRole(role);

        f.setKeyword(orNull(text(args, "keyword")));
        f.setRoomName(orNull(text(args, "roomName")));
        f.setAccountType(normalizeAccountType(text(args, "accountType")));
        f.setStatus(intOrNull(args, "status"));
        f.setIsSchool(intOrNull(args, "isSchool"));
        f.setTrashOnly(args.path("trashOnly").asBoolean(false) ? Boolean.TRUE : null);

        Object bad = fillGroup(f, text(args, "projectGroup"));
        if (bad != null) return bad;
        bad = fillDepartment(f, text(args, "department"));
        if (bad != null) return bad;
        bad = fillIdentityTag(f, text(args, "identityTag"));
        if (bad != null) return bad;

        int limit = clamp(args.path("limit").asInt(DEFAULT_LIMIT), 1, MAX_LIMIT);
        int page = Math.max(1, args.path("page").asInt(1));
        // 只给 page/pageSize：listUnified 会拿这两个反推 limit/offset，直接塞 offset 会被它覆盖掉
        f.setPage(page);
        f.setPageSize(limit);
        int offset = (page - 1) * limit;

        Map<String, Object> res = personnelService.listUnified(f);
        List<Personnel> rows = rowsOf(res);
        long total = longOf(res.get("total"));
        List<String> ids = new ArrayList<>();
        for (Personnel p : rows) {
            if (p.getId() != null) {
                ids.add(String.valueOf(p.getId()));
            }
        }
        Map<String, List<IdentityTagVO>> tags = ids.isEmpty()
                ? Map.of()
                : personIdentityService.listByUserIds(ids);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Personnel p : rows) {
            out.add(project(p, tags.get(String.valueOf(p.getId()))));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("returned", out.size());
        result.put("offset", offset);
        result.put("personnel", out);
        if (out.isEmpty()) {
            result.put("note", f.getTrashOnly() != null
                    ? "回收站里没有符合条件的记录。"
                    : "没有符合条件的记录。回收站里可能有 —— 需要的话把 trashOnly 设成 true 再看一次。");
        } else if (total > offset + out.size()) {
            result.put("note", "共 " + total + " 人，这里是第 " + (offset + 1) + "~" + (offset + out.size())
                    + " 个；用户要继续看就说清还剩 " + (total - offset - out.size())
                    + " 个，再问就用 page=" + (page + 1) + " 接着查。");
        }
        return result;
    }

    // ── 读：单人完整档案 ──

    private AiTool getPersonnelDetail() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string", "description": "人员 id（queryPersonnel 里那个 id），或账号 id（searchPerson 返回的 userId、STAFF_ 开头的账号 id）—— 两种都认" }
                  },
                  "required": ["id"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "getPersonnelDetail",
                "看**某一个人**的完整档案：双 id、工号、部门与课题组、角色、账号绑定情况、联系方式、"
                        + "房间授权、身份标识、是否在回收站。**「完整档案」指的就是它**（速查 searchPerson "
                        + "只有姓名/工号/部门/课题组四个字段，别拿它顶替），"
                        + "也别拿列表里那一行凑 —— 列表只有概览，且看不到房间授权明细与通知绑定。"
                        + "id 给人员 id 或账号 id（searchPerson 的 userId）都行，服务端会自己认。",
                schema,
                CAP_PERSONNEL,
                SideEffect.READ,
                (ctx, args) -> doDetail(args));
    }

    private Object doDetail(JsonNode args) {
        String raw = text(args, "id");
        if (raw.isEmpty()) {
            return Map.of("ok", false, "reason", "要给 id。用 queryPersonnel 拿人员 id，或 searchPerson 拿账号 id。");
        }
        Long pid = longOrNull(raw);
        Personnel p = pid == null ? null : findByIdEitherWay(pid);
        if (p == null) {
            // 不是人员 id（或数字但对不上）：searchPerson 给的是**账号 id**（19 位雪花 / STAFF_xxx），
            // 换成人员 id 再查 —— 模型手里拿到的多半就是这一种，不该让它为此多烧一轮。
            Long resolved = longOrNull(personIdentityService.resolveIdByAccount(raw));
            if (resolved != null) {
                pid = resolved;
                p = findByIdEitherWay(pid);
            }
        }
        if (p == null) {
            return Map.of("ok", false, "reason",
                    "没有 id=" + raw + " 对应的人员档案（人员 id 和账号 id 都试过了）。"
                            + "id 可能过期了，重新查一次；要按姓名/工号找就先 searchPerson。");
        }
        boolean inTrash = p.getDeletedAt() != null;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("profile", project(p, null));
        out.put("aroUserId", str(p.getAroUserId()));
        out.put("staffId", str(p.getStaffId()));
        out.put("staffUsername", str(p.getStaffUsername()));
        out.put("studentUsername", str(p.getStudentUsername()));
        out.put("staffAccountSource", str(p.getStaffAccountSource()));
        out.put("staffCreateTime", str(p.getStaffCreateTime()));
        out.put("email", str(p.getEmail()));
        out.put("notifyEmail", str(p.getContactEmail()));
        // 通知绑定只说**通没通**，不回值 —— target_value 是推送凭据，答业务问题用不上
        Map<String, Object> bindings = new LinkedHashMap<>();
        bindings.put("email", !str(p.getContactEmail()).isEmpty());
        bindings.put("serverChan", !str(p.getSendKey()).isEmpty());
        bindings.put("wxPusher", !str(p.getWxPusherUid()).isEmpty());
        out.put("notifyBindings", bindings);
        if (inTrash) {
            out.put("inTrash", true);
        }

        Map<String, Object> roomAuth;
        try {
            roomAuth = personnelService.getRoomAuthorization(String.valueOf(pid));
        } catch (Exception e) {
            roomAuth = Map.of("error", "读房间授权失败：" + e.getMessage());
        }
        out.put("roomAuthorization", roomAuth);

        List<IdentityTagVO> tags = personIdentityService.getByUser(String.valueOf(pid));
        out.put("identityTags", tagLabels(tags));
        return out;
    }

    /** 先按未删除查，查不到再连回收站一起查（是否在回收站由返回行的 deleted_at 判）。 */
    private Personnel findByIdEitherWay(Long id) {
        Personnel p = findById(id, false);
        return p != null ? p : findById(id, true);
    }

    /** 按 id 取一行统一视图；trashOnly=true 时连回收站里的一起找。 */
    private Personnel findById(Long id, boolean includeTrash) {
        PersonnelFilter f = new PersonnelFilter();
        f.setId(id);
        f.setPage(1);
        f.setPageSize(1);
        f.setTrashOnly(includeTrash ? Boolean.TRUE : null);
        List<Personnel> rows = rowsOf(personnelService.listUnified(f));
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ── 条件归一（名称 → 字典 id）──

    /**
     * 课题组名 → 字典 id（名字与 id 都写进 filter）。
     *
     * <p>两个都写不是冗余：名字分支覆盖「多组人员」（project_group_name 是逗号串、id 为空），
     * id 分支覆盖「字典已改名、人员身上还是旧名」。缺任一个都会静默筛丢人。
     *
     * @return 非 null = 该条件无法确定，直接把这段当作工具结果返回（让模型去问用户，别猜）
     */
    private Object fillGroup(PersonnelFilter f, String name) {
        if (name.isEmpty()) return null;
        Map<String, Object> exact = exactDict("project_group", name);
        if (exact != null) {
            f.setProjectGroupName(str(exact.get("name")));
            f.setProjectGroupId(longOrNull(exact.get("id")));
            return null;
        }
        List<Map<String, Object>> cands = fuzzyDict("project_group", name);
        if (cands.size() == 1) {
            f.setProjectGroupName(str(cands.get(0).get("name")));
            f.setProjectGroupId(longOrNull(cands.get(0).get("id")));
            return null;
        }
        return unresolved("课题组", name, cands);
    }

    private Object fillDepartment(PersonnelFilter f, String name) {
        if (name.isEmpty()) return null;
        Map<String, Object> exact = exactDict("department", name);
        if (exact != null) {
            f.setDepartmentName(str(exact.get("name")));
            f.setDepartmentId(longOrNull(exact.get("id")));
            return null;
        }
        List<Map<String, Object>> cands = fuzzyDict("department", name);
        if (cands.size() == 1) {
            f.setDepartmentName(str(cands.get(0).get("name")));
            f.setDepartmentId(longOrNull(cands.get(0).get("id")));
            return null;
        }
        return unresolved("部门", name, cands);
    }

    private Object fillIdentityTag(PersonnelFilter f, String raw) {
        if (raw.isEmpty()) return null;
        List<Map<String, Object>> exact = jdbcTemplate.queryForList(
                "SELECT id, label FROM person_identity_tag WHERE active = 1 AND (label = ? OR code = ?) LIMIT 1",
                raw, raw);
        if (!exact.isEmpty()) {
            f.setIdentityTagId(longOrNull(exact.get(0).get("id")));
            return null;
        }
        List<Map<String, Object>> cands = jdbcTemplate.queryForList(
                "SELECT id, label FROM person_identity_tag WHERE active = 1 AND label LIKE CONCAT('%', ?, '%') ORDER BY id LIMIT "
                        + DICT_LIMIT, raw);
        if (cands.size() == 1) {
            f.setIdentityTagId(longOrNull(cands.get(0).get("id")));
            return null;
        }
        if (cands.isEmpty()) {
            // 一个都没沾边：把**全部**在用的标识给出来，让模型知道这门词汇表长什么样
            cands = jdbcTemplate.queryForList(
                    "SELECT id, label FROM person_identity_tag WHERE active = 1 ORDER BY id LIMIT 20");
        }
        return unresolved("身份标识", raw, cands);
    }

    private Map<String, Object> unresolved(String what, String raw, List<Map<String, Object>> candidates) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "库里没有叫「" + raw + "」的" + what + "。请让用户从候选里挑一个，别自己猜或改成别的条件重查。");
        out.put("candidates", candidates);
        return out;
    }

    private Map<String, Object> exactDict(String table, String name) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, name FROM " + table + " WHERE name = ? LIMIT 1", name);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private List<Map<String, Object>> fuzzyDict(String table, String name) {
        return jdbcTemplate.queryForList(
                "SELECT id, name FROM " + table + " WHERE name LIKE CONCAT('%', ?, '%') ORDER BY name LIMIT " + DICT_LIMIT,
                name);
    }

    // ── 投影：只给答业务问题用得上的字段 ──

    /**
     * 单行 → 模型看的字段。
     *
     * <p>刻意**不投影** {@code staffOpenId / sendKey / wxPusherUid / staffAccountSource}：
     * 那是推送凭据与内部链路字段，答「这个人是哪个组的」用不上，传出去只是徒增扩散面
     * （页面里能看到它们，是给人做绑定管理用的，不是给模型转述的）。
     */
    private static Map<String, Object> project(Personnel p, List<IdentityTagVO> tags) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getId());
        m.put("name", str(p.getName()));
        m.put("jobNumber", str(p.getJobNumber()));
        m.put("department", str(p.getDepartmentName()));
        m.put("projectGroup", str(p.getProjectGroupName()));
        m.put("role", roleLabel(p.getRole()));
        m.put("account", accountLabel(p));
        m.put("accountStatus", statusLabel(p.getStatus()));
        m.put("campus", isSchoolLabel(p.getIsSchool()));
        m.put("mobile", str(p.getMobilePhone()));
        // 档案邮箱与**通知绑定**邮箱是两回事（真机上就混过一次：把绑定邮箱当成了档案邮箱）。
        // 分开给，别用 firstNonBlank 合成一个字段。
        m.put("email", str(p.getEmail()));
        m.put("notifyEmail", str(p.getContactEmail()));
        m.put("rooms", str(p.getAllowedRoomsDisplayZh()));
        if (tags != null && !tags.isEmpty()) {
            m.put("identityTags", tagLabels(tags));
        }
        if (p.getDeletedAt() != null) {
            m.put("inTrash", true);
        }
        return m;
    }

    private static List<String> tagLabels(List<IdentityTagVO> tags) {
        List<String> out = new ArrayList<>();
        if (tags == null) return out;
        for (IdentityTagVO t : tags) {
            if (t != null && t.getLabel() != null && !t.getLabel().isBlank()) {
                out.add(t.getLabel());
            }
        }
        return out;
    }

    /** 「有没有账号」说人话：学生账号不算系统账号，两者都有就说两个都有。 */
    private static String accountLabel(Personnel p) {
        boolean staff = !str(p.getStaffUsername()).isEmpty();
        boolean student = !str(p.getStudentUsername()).isEmpty();
        if (staff && student) return "教职工账号+学生账号";
        if (staff) return "教职工账号";
        if (student) return "只有学生账号";
        return "无账号";
    }

    private static String statusLabel(Integer status) {
        if (status == null) return "无教职工账号";
        return status == 1 ? "启用" : "禁用";
    }

    private static String isSchoolLabel(Integer v) {
        if (v == null) return "";
        return v == 1 ? "校内" : "校外";
    }

    private static String roleLabel(String code) {
        if (code == null || code.isBlank()) return "";
        for (RoleEnum r : RoleEnum.values()) {
            if (r.getCode().equalsIgnoreCase(code)) return r.getDescZh();
        }
        return code;
    }

    private static String normalizeRole(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String t = raw.trim();
        for (RoleEnum r : RoleEnum.values()) {
            if (r.getCode().equalsIgnoreCase(t) || r.getDescZh().equals(t)) return r.getCode();
        }
        return null;
    }

    private static List<Map<String, Object>> roleCandidates() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (RoleEnum r : RoleEnum.values()) {
            out.add(Map.of("role", r.getCode(), "label", r.getDescZh()));
        }
        return out;
    }

    private static String normalizeAccountType(String raw) {
        if (raw == null) return null;
        String t = raw.trim().toLowerCase();
        return ("sys".equals(t) || "nosys".equals(t)) ? t : null;
    }

    @SuppressWarnings("unchecked")
    private static List<Personnel> rowsOf(Map<String, Object> res) {
        if (res == null) return List.of();
        Object list = res.get("list");
        return list instanceof List<?> l ? (List<Personnel>) l : List.of();
    }

    private static long longOf(Object v) {
        Long n = longOrNull(v);
        return n == null ? 0L : n;
    }

    private static Long longOrNull(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer intOrNull(JsonNode args, String field) {
        JsonNode n = args.path(field);
        if (n.isMissingNode() || n.isNull()) return null;
        if (n.canConvertToInt()) return n.asInt();
        String t = n.asText("").trim();
        if (t.isEmpty()) return null;
        try {
            return Integer.parseInt(t);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String orNull(String s) {
        return s == null || s.isBlank() ? null : s;
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

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }
}
