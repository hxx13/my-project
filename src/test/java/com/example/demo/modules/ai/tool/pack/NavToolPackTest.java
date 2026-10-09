package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.pagepermission.entity.PagePermissionItem;
import com.example.demo.modules.pagepermission.service.PagePermissionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 页面导航的闸。钉住四件事，都是「跳错页面 / 跳到没权限的页面」这类真机才会暴露的错：
 *
 * <ol>
 *   <li>唯一命中才直接跳；同名多个必须走候选芯片（否则用户被送到错的那一个）；</li>
 *   <li><b>老式裸路径不能跳</b>（/debug 要跳 /console/debug）—— 走裸路径会命中顶层 legacy
 *       重定向，整个后台壳层卸载重建、页面闪一下；</li>
 *   <li>低于自己角色的页面不给（不能把用户送到一个他打不开的地方）；</li>
 *   <li>芯片回传的路径（value）再查一次要能直接命中 —— 芯片这条路必须闭环。</li>
 * </ol>
 */
class NavToolPackTest {

    private static final ObjectMapper OM = new ObjectMapper();

    @Test
    @DisplayName("名字唯一命中 → 直接给 navigate 指令")
    void uniqueNameNavigates() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF), entry("/admin/cage-shelves", "笼架信息", "STAFF"), "笼架信息");
        assertEquals(Boolean.TRUE, out.get("ok"));
        assertNotNull(out.get("navigate"), "应当返回跳转指令");
        assertEquals("/admin/cage-shelves", navPath(out));
    }

    @Test
    @DisplayName("同名两个页面 → 出候选芯片（value 是路径、label 给人看），不自己挑一个")
    void ambiguousNameAsksWithChoices() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF),
                entry("/admin/portal/content", "内容管理", "STAFF"),
                entry("/content-manager/content", "内容管理", "STAFF"),
                "内容管理");
        assertNull(out.get("navigate"), "有歧义时不许直接跳");
        List<?> choices = (List<?>) out.get("choices");
        assertNotNull(choices);
        assertEquals(2, choices.size());
        Map<?, ?> first = (Map<?, ?>) choices.get(0);
        assertTrue(String.valueOf(first.get("value")).startsWith("/"), "候选的 value 应当是路径（唯一）");

        // 两个芯片必须能分辨：真机上「内容管理」有两个页面，同文案时人根本不知道点哪个
        String l0 = String.valueOf(((Map<?, ?>) choices.get(0)).get("label"));
        String l1 = String.valueOf(((Map<?, ?>) choices.get(1)).get("label"));
        assertNotEquals(l0, l1, "同名候选的文案必须能区分（撞名时补路径）");
        assertTrue(l0.contains("/admin/portal/content") && l1.contains("/content-manager/content"),
                "撞名时补的应当是各自的路径：" + l0 + " | " + l1);
    }

    @Test
    @DisplayName("老式裸路径不跳：有 /console 版本时只认 /console 那一个")
    void legacyBarePathIsNeverTargeted() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF),
                entry("/debug", "/debug", "STAFF"),
                entry("/console/debug", "/console/debug", "STAFF"),
                "debug");
        assertEquals("/console/debug", navPath(out), "跳裸 /debug 会命中 legacy 重定向、闪整页");
    }

    @Test
    @DisplayName("Twin 控制台页补名：说「流水线日志」也能找到 /console/debug")
    void twinPagesGetHumanLabels() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF), entry("/console/debug", "/console/debug", "STAFF"), "流水线日志");
        assertEquals("/console/debug", navPath(out));
    }

    @Test
    @DisplayName("比角色高的页面不出现，并且如实说「权限不够」而不是「没这个页面」")
    void pageAboveRoleIsNotOffered() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF), entry("/admin/api-docs", "接口中心", "SUPER_ADMIN"), "接口中心");
        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNull(out.get("navigate"));
        assertTrue(String.valueOf(out.get("reason")).contains("权限"),
                "页面存在只是打不开时，说成「没找到」会让用户一直换说法重试：" + out.get("reason"));
    }

    @Test
    @DisplayName("打不开的页面**不许**被模糊匹配吞到名字相近的另一个页面上（真机：问「物资领用审计」被送到了「领用审计」）")
    void deniedExactNameIsNotStolenByFuzzyMatch() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF),
                entry("/admin/supplies/audit-export", "领用审计", "STAFF"),
                entry("/admin/material/audit-export", "物资领用审计", "ADMIN"),
                "物资领用审计");
        assertNull(out.get("navigate"), "名字对得上打不开的那个，就不许跳别的页：" + out);
        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("权限"), out.get("reason").toString());

        // 反过来：能打开的那个照旧要跳得动（别为了拦它把模糊匹配一起废了）
        Map<?, ?> ok = run(user(RoleEnum.STAFF),
                entry("/admin/supplies/audit-export", "领用审计", "STAFF"),
                entry("/admin/material/audit-export", "物资领用审计", "ADMIN"),
                "领用审计");
        assertEquals("/admin/supplies/audit-export", navPath(ok));
    }

    @Test
    @DisplayName("芯片回传的是路径 —— 拿路径再查一次要能直接命中（芯片这条路闭环）")
    void pathRoundTripResolves() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF), entry("/admin/cage-shelves", "笼架信息", "STAFF"), "/admin/cage-shelves");
        assertEquals("/admin/cage-shelves", navPath(out));
    }

    @Test
    @DisplayName("一个都不匹配 → 不跳，并给名字最接近的当建议")
    void noMatchGivesSuggestionsInsteadOfGuessing() throws Exception {
        Map<?, ?> out = run(user(RoleEnum.STAFF), entry("/admin/cage-shelves", "笼架信息", "STAFF"), "门禁规则");
        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNull(out.get("navigate"), "找不到就不许猜一个页面跳过去");
        assertFalse(out.containsKey("choices"), "没有一点字面重合时不必硬凑建议");
    }

    @Test
    @DisplayName("同一格被登记了两遍（扫描一份 + 手工一份）→ 名字路径都一样，直接跳，不该反问「去哪一个」")
    void duplicatedRowsForSameDestinationDoNotAsk() throws Exception {
        // 真实数据里 文件模板库 / 检查维护 / 领用审计 / 物资领用审计 / 笼架 都是两份：
        // 权限表按**路径**收敛（同路径只留一条），两条不会变成「两个候选」反过来问用户。
        Map<?, ?> out = run(user(RoleEnum.STAFF),
                entry("/admin/cage-shelves", "笼架信息", "STAFF"),
                entry("/admin/cage-shelves", "笼架信息", "STAFF"),
                "笼架信息");
        assertEquals("/admin/cage-shelves", navPath(out), "同一目的地的两份不是歧义：" + out);
    }

    // ── 小程序载体 ──

    @Test
    @DisplayName("小程序载体：只在小程序页面里找，返回 /pages/... 而不是 web 的 /admin/...")
    void miniProgramGetsMiniPathOnly() throws Exception {
        // 两端都有「领用物资」，但只有小程序那条路是那边能跳的
        Map<?, ?> out = runMini(user(RoleEnum.STAFF),
                entryMini("/pages/supplies/index", "领用物资", "STAFF"), "领用物资");
        assertEquals("/pages/supplies/index", navPath(out),
                "web 的 /admin/supplies/manage 在小程序里根本不存在，拿它去跳必失败");
    }

    @Test
    @DisplayName("小程序载体：合成名入口（Tab:/pages/…）不摆给用户挑")
    void miniProgramSkipsSyntheticNames() throws Exception {
        Map<?, ?> out = runMini(user(RoleEnum.STAFF),
                entryMini("/pages/index/index", "Tab:/pages/index/index", "STAFF"), "Tab:/pages/index/index");
        assertEquals(Boolean.FALSE, out.get("ok"), "合成名不是人话，用户说不出这个入口名：" + out);
        assertNull(out.get("navigate"));
    }

    @Test
    @DisplayName("学生视角（web）：只给 /student/* 页面，教职工页面一个都不给")
    void studentViewGetsStudentPagesOnly() throws Exception {
        // 同一份权限表里两半都有，靠视角分流（不靠 minRole —— 学生账号的角色档可能就是 STAFF 级）
        Map<?, ?> out = executeWithView(user(RoleEnum.MEMBER), "web", AiView.STUDENT,
                List.of(entry("/student/rooms", "我的房间", "STUDENT"),
                        entry("/admin/cage-shelves", "笼架信息", "STAFF")),
                List.of(), "我的房间");
        assertEquals("/student/rooms", navPath(out));

        // 第二半：教职工页面在学生视角下压根不在清单里（若按角色判就会漏过来 —— MEMBER 也够 STAFF 的下限）
        Map<?, ?> miss = executeWithView(user(RoleEnum.MEMBER), "web", AiView.STUDENT,
                List.of(entry("/admin/cage-shelves", "笼架信息", "MEMBER")), List.of(), "笼架信息");
        assertEquals(Boolean.FALSE, miss.get("ok"), "学生视角不该拿到教职工页面：" + miss);
        assertNull(miss.get("navigate"));
    }

    // ── 脚手架 ──

    private static String navPath(Map<?, ?> out) {
        Object nav = out.get("navigate");
        assertNotNull(nav, "期望有 navigate：" + out);
        return String.valueOf(((Map<?, ?>) nav).get("path"));
    }

    private static Map<?, ?> run(User actor, PagePermissionItem a, String query) throws Exception {
        return run(actor, a, null, query);
    }

    /** 调一次 openPage 执行体（web 载体），返回工具结果的 map。 */
    private static Map<?, ?> run(User actor, PagePermissionItem a, PagePermissionItem b, String query) throws Exception {
        List<PagePermissionItem> rows = new ArrayList<>();
        rows.add(a);
        if (b != null) {
            rows.add(b);
        }
        return executeWithView(actor, "web", AiView.STAFF, rows, List.of(), query);
    }

    /** 调一次 openPage 执行体（小程序载体）：应当只在小程序那套页面里找。 */
    private static Map<?, ?> runMini(User actor, PagePermissionItem mini, String query) throws Exception {
        // 刻意在 web 表里也放一个同名页面：小程序上必须**只**给小程序路径
        return executeWithView(actor, "mp", AiView.STAFF,
                List.of(entry("/admin/supplies/manage", "领用物资", "STAFF")), List.of(mini), query);
    }

    private static Map<?, ?> executeWithView(User actor, String platform, AiView view,
                                            List<PagePermissionItem> webRows,
                                            List<PagePermissionItem> miniRows, String query) throws Exception {
        AiTool tool = new NavToolPack(stubService(webRows, miniRows)).tools().get(0);
        Object out = tool.executor().execute(
                new AiToolContext(actor, null, null, query, platform, view),
                OM.readTree("{\"query\":\"" + query + "\"}"));
        return (Map<?, ?>) out;
    }

    /** 只覆写读页面的那一个方法：本类要测的是匹配规则 + 平台分流，不是权限表的读取。 */
    private static PagePermissionService stubService(List<PagePermissionItem> webRows,
                                                     List<PagePermissionItem> miniRows) {
        return new PagePermissionService(null, null, null, null) {
            @Override
            public List<PagePermissionItem> listByPlatform(String platform) {
                return "MINI".equalsIgnoreCase(platform) ? miniRows : webRows;
            }
        };
    }

    private static PagePermissionItem entry(String path, String label, String minRole) {
        return row("WEB", path, label, minRole);
    }

    /** 小程序的一行：名字是**人话**（合成名形如 `Tab:...` 的那种不该给用户挑）。 */
    private static PagePermissionItem entryMini(String path, String label, String minRole) {
        return row("MINI", path, label, minRole);
    }

    private static PagePermissionItem row(String platform, String path, String label, String minRole) {
        PagePermissionItem item = new PagePermissionItem();
        item.setPlatform(platform);
        item.setNodeType("ENTRY");
        item.setEntrySource("sidebar");
        item.setPathOrRoute(path);
        item.setDisplayName(label);
        item.setMinRole(minRole);
        item.setEnabled(1);
        return item;
    }

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("1");
        u.setRole(role);
        return u;
    }
}
