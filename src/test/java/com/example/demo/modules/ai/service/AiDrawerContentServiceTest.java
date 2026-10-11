package com.example.demo.modules.ai.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.bootstrap.AiCopyConfigStore;
import com.example.demo.modules.ai.bootstrap.AiDrawerCopySeed;
import com.example.demo.modules.ai.mapper.AiCapabilityPromptMapper;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link AiDrawerContentService} 的五条契约，用记账假口子验证（不连库）：
 * 键集合固定、库值优先、越界键不外泄、停用行不出、乱序输入按 sort_order 输出且分组就近。
 */
class AiDrawerContentServiceTest {

    /** 假值仓储：只回一份预先摆好的「键 → 值」。 */
    private static final class FakeCopyStore implements AiCopyConfigStore {
        private final Map<String, String> values;

        FakeCopyStore(Map<String, String> values) {
            this.values = values;
        }

        @Override
        public boolean upsertDef(String module, String key, String label, String desc, String val) {
            throw new UnsupportedOperationException("只读用例不写");
        }

        @Override
        public boolean upsertValue(String module, String key, String val) {
            throw new UnsupportedOperationException("只读用例不写");
        }

        @Override
        public Map<String, String> readValues(String module) {
            return values;
        }
    }

    /** 假清单读取口：回预先摆好的原始行（含 enabled 列，故意不过滤不乱排）。 */
    private static final class FakeCapabilityReader implements AiCapabilityPromptMapper {
        private final List<Map<String, Object>> rows;
        private final List<Map<String, Object>> userHits;
        private final List<Map<String, Object>> globalHits;

        FakeCapabilityReader(List<Map<String, Object>> rows) {
            this(rows, List.of(), List.of());
        }

        FakeCapabilityReader(List<Map<String, Object>> rows,
                             List<Map<String, Object>> userHits,
                             List<Map<String, Object>> globalHits) {
            this.rows = rows;
            this.userHits = userHits;
            this.globalHits = globalHits;
        }

        @Override
        public List<Map<String, Object>> selectEnabledOrdered() {
            return rows;
        }

        @Override
        public List<Map<String, Object>> selectAllOrdered() {
            return rows;
        }

        @Override
        public List<Map<String, Object>> countHitsByUser(String userId) {
            return userHits;
        }

        @Override
        public List<Map<String, Object>> countHitsGlobal() {
            return globalHits;
        }
    }

    /** 假计数行，形状与 mapper 返回的 {@code [{cardId, hits}]} 一致。 */
    private static Map<String, Object> hits(long cardId, long n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("cardId", cardId);
        m.put("hits", n);
        return m;
    }

    private static Map<String, Object> row(long id, String group, String title, String text, int sort, int enabled) {
        return row(id, group, title, text, sort, enabled, "");
    }

    /** 带 audience 的行。audience = "" 即全员。 */
    private static Map<String, Object> row(long id, String group, String title, String text, int sort, int enabled,
                                           String audience) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("groupName", group);
        m.put("title", title);
        m.put("promptText", text);
        m.put("sortOrder", sort);
        m.put("enabled", enabled);
        m.put("audience", audience);
        return m;
    }

    private static AiDrawerContentService svc(Map<String, String> copyValues, List<Map<String, Object>> capRows) {
        return new AiDrawerContentService(new FakeCopyStore(copyValues), new FakeCapabilityReader(capRows));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> copyOf(Map<String, Object> content) {
        return (Map<String, String>) content.get("copy");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> groupsOf(Map<String, Object> content) {
        return (List<Map<String, Object>>) content.get("capabilities");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> itemsOf(Map<String, Object> group) {
        return (List<Map<String, Object>>) group.get("items");
    }

    private static List<String> titles(List<Map<String, Object>> groups) {
        List<String> t = new ArrayList<>();
        for (Map<String, Object> g : groups) {
            for (Map<String, Object> it : itemsOf(g)) {
                t.add(String.valueOf(it.get("title")));
            }
        }
        return t;
    }

    private static List<String> groupNames(List<Map<String, Object>> groups) {
        List<String> g = new ArrayList<>();
        for (Map<String, Object> grp : groups) {
            g.add(String.valueOf(grp.get("groupName")));
        }
        return g;
    }

    // ① 库全空 → 每个键都拿到默认值（不是空、不缺键）
    @Test
    void 库全空_每键拿到默认值() {
        Map<String, String> copy = copyOf(svc(Map.of(), List.of()).content(AiView.STAFF));
        Map<String, String> defaults = AiDrawerCopySeed.defaultCopies();
        assertEquals(defaults.keySet(), copy.keySet(), "键集合必须等于代码清单");
        for (Map.Entry<String, String> e : defaults.entrySet()) {
            assertEquals(e.getValue(), copy.get(e.getKey()), "缺省应回落原文: " + e.getKey());
            assertFalse(copy.get(e.getKey()).isBlank(), "任何键都不能为空: " + e.getKey());
        }
    }

    // ② 库给了某键的值 → 用库里的（其它键仍回落默认）
    @Test
    void 库有值_用库里的() {
        String key = AiDrawerCopySeed.defaultCopies().keySet().iterator().next();
        Map<String, String> copy = copyOf(svc(Map.of(key, "管理员改过的"), List.of()).content(AiView.STAFF));
        assertEquals("管理员改过的", copy.get(key));
        for (Map.Entry<String, String> e : AiDrawerCopySeed.defaultCopies().entrySet()) {
            if (!e.getKey().equals(key)) {
                assertEquals(e.getValue(), copy.get(e.getKey()), "其它键仍回落默认");
            }
        }
    }

    // ③ 库里多出 ai.copy. 之外的键（如 ai.prompt.global）→ 不出现在载荷里
    @Test
    void 越界键不外泄() {
        Map<String, String> copy = copyOf(svc(
                Map.of("ai.prompt.global", "平台级约束正文", "ai.copy.card.timer.stop", "停"),
                List.of()).content(AiView.STAFF));
        assertEquals(AiDrawerCopySeed.defaultCopies().keySet(), copy.keySet());
        assertFalse(copy.containsKey("ai.prompt.global"), "非 ai.copy. 的键不许外泄");
        assertEquals("停", copy.get("ai.copy.card.timer.stop"), "同批里合法的键照常生效");
    }

    // ④ 清单里 enabled=0 的行不出现
    @Test
    void 停用行不出现() {
        List<Map<String, Object>> rows = List.of(
                row(1, "甲组", "启用条", "文本1", 10, 1),
                row(2, "甲组", "停用条", "文本2", 20, 0));
        List<Map<String, Object>> groups = groupsOf(svc(Map.of(), rows).content(AiView.STAFF));
        assertEquals(List.of("甲组"), groupNames(groups));
        assertEquals(List.of("启用条"), titles(groups), "enabled=0 的行必须被过滤");
    }

    // ⑤ 乱序输入 → 输出按 sort_order，并保持分组就近
    @Test
    void 乱序输入_按sortOrder输出且分组就近() {
        // 乱序给入；同组不相邻（甲10 乙20 甲30 乙40）→ 就近语义下应拆成 4 组，不合并
        List<Map<String, Object>> shuffled = List.of(
                row(4, "乙组", "乙-40", "t", 40, 1),
                row(1, "甲组", "甲-10", "t", 10, 1),
                row(3, "甲组", "甲-30", "t", 30, 1),
                row(2, "乙组", "乙-20", "t", 20, 1));
        List<Map<String, Object>> groups = groupsOf(svc(Map.of(), shuffled).content(AiView.STAFF));
        assertEquals(List.of("甲组", "乙组", "甲组", "乙组"), groupNames(groups), "整体按 sort_order，同组相邻才归并");
        assertEquals(List.of("甲-10", "乙-20", "甲-30", "乙-40"), titles(groups), "条目按 sort_order 升序");

        // 同组相邻 → 归并成两组，组内仍按 sort_order
        List<Map<String, Object>> adjacent = List.of(
                row(4, "乙组", "乙-40", "t", 40, 1),
                row(3, "乙组", "乙-30", "t", 30, 1),
                row(2, "甲组", "甲-20", "t", 20, 1),
                row(1, "甲组", "甲-10", "t", 10, 1));
        List<Map<String, Object>> merged = groupsOf(svc(Map.of(), adjacent).content(AiView.STAFF));
        assertEquals(List.of("甲组", "乙组"), groupNames(merged), "相邻同组归并，组序看首条 sort_order");
        assertEquals(List.of("甲-10", "甲-20", "乙-30", "乙-40"), titles(merged));
        assertEquals(2, itemsOf(merged.get(0)).size());
    }

    // 载荷两份都在
    @Test
    void 载荷含copy与capabilities两份() {
        Map<String, Object> content = svc(Map.of(), List.of()).content(AiView.STAFF);
        assertTrue(content.containsKey("copy"));
        assertTrue(content.containsKey("capabilities"));
        assertEquals(0, groupsOf(content).size(), "空清单给空数组，不给 null");
    }

    // ── 视角过滤（Task 3C）──────────────────────────────────────────────

    /** 四种 audience：全员（空）、教职工专属、学生专属、未知取值。 */
    private static List<Map<String, Object>> audienceRows() {
        return List.of(
                row(1, "甲组", "全员条", "t", 10, 1, ""),
                row(2, "甲组", "教职工条", "t", 20, 1, "STAFF"),
                row(3, "甲组", "学生条", "t", 30, 1, "STUDENT"),
                row(4, "甲组", "未知条", "t", 40, 1, "TEACHER"));
    }

    // ① 教职工视角拿到该看的全量（全员 + 教职工专属）
    @Test
    void 教职工视角看到全员与教职工专属() {
        List<String> staff = titles(groupsOf(svc(Map.of(), audienceRows()).content(AiView.STAFF)));
        assertTrue(staff.contains("全员条"), "全员条应在教职工视角: " + staff);
        assertTrue(staff.contains("教职工条"), "教职工条应在教职工视角: " + staff);
        assertFalse(staff.contains("学生条"), "学生专属不该进教职工视角: " + staff);
    }

    // ② 学生视角看不到教职工专属项
    @Test
    void 学生视角看不到教职工专属项() {
        List<String> student = titles(groupsOf(svc(Map.of(), audienceRows()).content(AiView.STUDENT)));
        assertTrue(student.contains("学生条"), "学生条应在学生视角: " + student);
        assertFalse(student.contains("教职工条"), "教职工专属必须对学生不可见: " + student);
    }

    // ③「全员」项两种视角都在
    @Test
    void 全员项两种视角都在() {
        List<String> staff = titles(groupsOf(svc(Map.of(), audienceRows()).content(AiView.STAFF)));
        List<String> student = titles(groupsOf(svc(Map.of(), audienceRows()).content(AiView.STUDENT)));
        assertTrue(staff.contains("全员条"), "教职工视角缺全员条: " + staff);
        assertTrue(student.contains("全员条"), "学生视角缺全员条: " + student);
    }

    // ④ 未知取值不静默丢弃：按「全员」放行（并在服务里 WARN）
    @Test
    void 未知取值不静默丢弃_按全员放行() {
        List<String> student = titles(groupsOf(svc(Map.of(), audienceRows()).content(AiView.STUDENT)));
        assertTrue(student.contains("未知条"), "未知取值按全员放行，不能静默丢弃: " + student);
    }

    // ⑤ 过滤后仍遵守原有契约：按 sort_order 就近分组，不因过滤而错位
    @Test
    void 过滤后仍按sortOrder就近分组() {
        List<Map<String, Object>> rows = List.of(
                row(9, "乙组", "乙-全员", "t", 40, 1, ""),
                row(1, "甲组", "甲-教职工", "t", 10, 1, "STAFF"),
                row(2, "乙组", "乙-学生", "t", 20, 1, "STUDENT"));
        List<Map<String, Object>> staff = groupsOf(svc(Map.of(), rows).content(AiView.STAFF));
        assertEquals(List.of("甲组", "乙组"), groupNames(staff), "过滤后仍按 sort_order 就近分组");
        assertEquals(List.of("甲-教职工", "乙-全员"), titles(staff));
    }

    @Test
    void visibleTo口径_大小写不敏感_未知放行() {
        int staff = RoleEnum.STAFF.getLevel();
        assertTrue(AiDrawerContentService.visibleTo(null, AiView.STUDENT, staff), "null = 全员");
        assertTrue(AiDrawerContentService.visibleTo("", AiView.STUDENT, staff), "空串 = 全员");
        assertTrue(AiDrawerContentService.visibleTo("  ", AiView.STAFF, staff), "空白 = 全员");
        assertTrue(AiDrawerContentService.visibleTo("staff", AiView.STAFF, staff), "大小写不敏感");
        assertFalse(AiDrawerContentService.visibleTo("staff", AiView.STUDENT, staff));
        assertTrue(AiDrawerContentService.visibleTo("STUDENT", AiView.STUDENT, staff));
        assertFalse(AiDrawerContentService.visibleTo("STUDENT", AiView.STAFF, staff));
        assertTrue(AiDrawerContentService.visibleTo("garbage", AiView.STUDENT, staff), "未知值按全员放行");
    }

    // ── 角色档：ADMIN / SUPER_ADMIN 条目只发给够级别的人（否则列了却办不到）──────

    /** 三种档位各一条：管理员档、超管档、外加一条普通教职工条做对照。 */
    private static List<Map<String, Object>> tierRows() {
        return List.of(
                row(1, "甲组", "教职工条", "t", 10, 1, "STAFF"),
                row(2, "甲组", "管理员条", "t", 20, 1, "ADMIN"),
                row(3, "甲组", "超管条", "t", 30, 1, "SUPER_ADMIN"));
    }

    @Test
    void 管理员档条目不发给普通教职工() {
        List<String> staff = titles(groupsOf(
                svc(Map.of(), tierRows()).content(AiView.STAFF, RoleEnum.STAFF.getLevel())));
        assertTrue(staff.contains("教职工条"), staff.toString());
        assertFalse(staff.contains("管理员条"), "普通教职工不该看见管理员档: " + staff);
        assertFalse(staff.contains("超管条"), "普通教职工不该看见超管档: " + staff);
    }

    @Test
    void 管理员档发给管理员_超管档不发给管理员() {
        List<String> admin = titles(groupsOf(
                svc(Map.of(), tierRows()).content(AiView.STAFF, RoleEnum.ADMIN.getLevel())));
        assertTrue(admin.contains("教职工条"), admin.toString());
        assertTrue(admin.contains("管理员条"), "管理员应看见管理员档: " + admin);
        assertFalse(admin.contains("超管条"), "管理员不该看见超管档: " + admin);
    }

    @Test
    void 超管档发给超管() {
        List<String> sup = titles(groupsOf(
                svc(Map.of(), tierRows()).content(AiView.STAFF, RoleEnum.SUPER_ADMIN.getLevel())));
        assertTrue(sup.contains("超管条"), "超管应看见超管档: " + sup);
    }

    // ── 管理端只读面（编辑态整份读）────────────────────────────────────

    private static User user(String id, RoleEnum role) {
        User u = new User();
        u.setId(id);
        u.setRole(role);
        return u;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> capsOf(Map<String, Object> content) {
        return (List<Map<String, Object>>) content.get("capabilities");
    }

    private static List<String> flatTitles(List<Map<String, Object>> caps) {
        List<String> t = new ArrayList<>();
        for (Map<String, Object> c : caps) {
            t.add(String.valueOf(c.get("title")));
        }
        return t;
    }

    // ① 非超管调管理端只读口 → 明确拒（抛异常，不静默）
    @Test
    void 管理端只读_非超管被拒() {
        AiDrawerContentService s = svc(Map.of(), List.of());
        assertThrows(IllegalStateException.class,
                () -> s.adminContent(user("u1", RoleEnum.STAFF)));
        assertThrows(IllegalStateException.class,
                () -> s.adminContent(user("u2", RoleEnum.ADMIN)));
        assertThrows(IllegalStateException.class,
                () -> s.adminContent(null), "未识别到操作人也拒");
    }

    // ② 管理端只读：未按视角过滤（另一视角的行也在）、含停用行、每条带全列
    @Test
    void 管理端只读_未过滤且带全列() {
        List<Map<String, Object>> rows = List.of(
                row(1, "甲组", "全员条", "t1", 10, 1, ""),
                row(2, "甲组", "学生专属", "t2", 20, 1, "STUDENT"),
                row(3, "甲组", "教职工专属", "t3", 30, 1, "STAFF"),
                row(4, "甲组", "停用条", "t4", 40, 0, ""));
        AiDrawerContentService s = svc(Map.of(), rows);

        List<Map<String, Object>> caps = capsOf(s.adminContent(user("super-1", RoleEnum.SUPER_ADMIN)));
        List<String> titles = flatTitles(caps);
        assertTrue(titles.contains("学生专属"), "管理端必须含另一视角（学生专属）的行: " + titles);
        assertTrue(titles.contains("教职工专属"), "管理端必须含教职工专属行: " + titles);
        assertTrue(titles.contains("停用条"), "管理端必须含停用行: " + titles);

        Map<String, Object> studentRow = caps.stream()
                .filter(c -> "学生专属".equals(c.get("title"))).findFirst().orElseThrow();
        assertEquals(Boolean.TRUE, studentRow.get("enabled"), "每条带 enabled");
        assertEquals("STUDENT", studentRow.get("audience"), "每条带 audience");
        assertTrue(studentRow.containsKey("id") && studentRow.containsKey("groupName")
                        && studentRow.containsKey("promptText") && studentRow.containsKey("sortOrder"),
                "每条带 id/groupName/title/promptText/sortOrder");

        Map<String, Object> disabledRow = caps.stream()
                .filter(c -> "停用条".equals(c.get("title"))).findFirst().orElseThrow();
        assertEquals(Boolean.FALSE, disabledRow.get("enabled"), "停用行的 enabled 必须是 false");

        // 对照：**只读口契约不变** —— 教职工视角仍看不到学生专属
        List<String> staffTitles = titles(groupsOf(s.content(AiView.STAFF)));
        assertFalse(staffTitles.contains("学生专属"), "只读口仍须按视角过滤: " + staffTitles);
        assertFalse(staffTitles.contains("停用条"), "只读口仍须滤掉停用行: " + staffTitles);
    }

    // ③ 管理端只读：copy 每条带中文名（非空、与清单一致），值缺省回落原文
    @Test
    void 管理端只读_copy每条带中文名() {
        AiDrawerContentService s = svc(Map.of(), List.of());
        Map<String, String> labels = AiDrawerCopySeed.defaultLabels();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> copy = (List<Map<String, Object>>) s.adminContent(
                user("super-1", RoleEnum.SUPER_ADMIN)).get("copy");

        assertEquals(AiDrawerCopySeed.defaultCopies().size(), copy.size(), "文案条数等于清单键数");
        for (Map<String, Object> c : copy) {
            String key = String.valueOf(c.get("key"));
            assertTrue(labels.containsKey(key), "中文名清单缺键: " + key);
            assertEquals(labels.get(key), c.get("label"), "每条必须带中文名: " + key);
            assertFalse(String.valueOf(c.get("label")).isBlank(), "中文名不能为空: " + key);
            assertFalse(String.valueOf(c.get("value")).isBlank(), "值缺省应回落原文，不为空: " + key);
        }
    }

    // ── 推荐指令条（输入框上方那条） ──

    private static AiDrawerContentService svcWithHits(List<Map<String, Object>> caps,
                                                       List<Map<String, Object>> userHits,
                                                       List<Map<String, Object>> globalHits) {
        return new AiDrawerContentService(new FakeCopyStore(Map.of()),
                new FakeCapabilityReader(caps, userHits, globalHits));
    }

    private static List<String> titlesOf(List<Map<String, Object>> rows) {
        List<String> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            out.add(String.valueOf(r.get("title")));
        }
        return out;
    }

    private static List<Map<String, Object>> threeCards() {
        return List.of(
                row(1L, "g", "A", "查A", 100, 1),
                row(2L, "g", "B", "查B", 200, 1),
                row(3L, "g", "C", "查C", 300, 1));
    }

    @Test
    @DisplayName("推荐指令条：个人命中为主 → 全站热度为辅 → 原排序兜底")
    void recommendedOrderingByUserThenGlobalThenSort() {
        // A 个人 2 次；B 个人 0 次但全站 9 次；C 两处都没有
        AiDrawerContentService s = svcWithHits(threeCards(),
                List.of(hits(1, 2)), List.of(hits(2, 9)));

        assertEquals(List.of("A", "B", "C"),
                titlesOf(s.recommended(AiView.STAFF, RoleEnum.STAFF.getLevel(), "u1", 10)));
    }

    @Test
    @DisplayName("推荐指令条：个人一条都没有 → 整条按全站热度排（新人不该进来就是空的）")
    void recommendedFallsBackToGlobalHeat() {
        AiDrawerContentService s = svcWithHits(threeCards(),
                List.of(), List.of(hits(2, 5), hits(1, 1)));

        assertEquals(List.of("B", "A", "C"),
                titlesOf(s.recommended(AiView.STAFF, RoleEnum.STAFF.getLevel(), "newbie", 10)));
    }

    @Test
    @DisplayName("推荐指令条：两处都没数据 → 回落卡片原排序号，且结果稳定")
    void recommendedFallsBackToSortOrder() {
        AiDrawerContentService s = svcWithHits(threeCards(), List.of(), List.of());

        assertEquals(List.of("A", "B", "C"),
                titlesOf(s.recommended(AiView.STAFF, RoleEnum.STAFF.getLevel(), "u1", 10)));
    }

    @Test
    @DisplayName("推荐指令条：看不见的条目一条都不返回（哪怕它个人命中最高），且受 limit 截断")
    void recommendedRespectsAudienceAndLimit() {
        List<Map<String, Object>> caps = List.of(
                row(1L, "g", "管理员专享", "只有管理员能点", 100, 1, "ADMIN"),
                row(2L, "g", "人人可用", "大家都能点", 200, 1));
        // 管理员那条个人命中 99 次 —— 普通教职工仍然一条都拿不到
        AiDrawerContentService s = svcWithHits(caps, List.of(hits(1, 99)), List.of());

        assertEquals(List.of("人人可用"),
                titlesOf(s.recommended(AiView.STAFF, RoleEnum.STAFF.getLevel(), "u1", 10)));
        assertEquals(1, s.recommended(AiView.STAFF, RoleEnum.STAFF.getLevel(), "u1", 1).size(), "limit 截断");
    }
}
