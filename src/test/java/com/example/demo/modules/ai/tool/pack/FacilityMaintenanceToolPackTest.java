package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.facilitymaintenance.service.FacilityMaintenanceService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 检查维护包的闸。
 *
 * <p>钉住的是**会写错台账**的那几处：缺机房不许落库、数量不合法不许落库、
 * 时间不传就交给服务端（不是自己算一个）、候选芯片给的是机房 id 而不是名字、
 * 列表截断要如实说、以及删除只能删用户点名的那一条。
 */
class FacilityMaintenanceToolPackTest {

    private FacilityMaintenanceService service;
    private FacilityMaintenanceToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = mock(FacilityMaintenanceService.class);
        pack = new FacilityMaintenanceToolPack(service);
        when(service.listSites(anyBoolean())).thenReturn(List.of(
                site("FM_S_1", "甲机房"), site("FM_S_2", "乙机房"), site("FM_S_3", "丙机房")));
        when(service.listReplacementFilterPresets(anyBoolean())).thenReturn(List.of(
                preset("初效"), preset("中效"), preset("高效")));
        when(service.listConsumableCatalog(anyBoolean())).thenReturn(List.of(catalog("阻垢剂", "桶")));
        when(service.listConsumableLines(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(page(List.of()));
        when(service.listReplacementRecords(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(page(List.of()));
    }

    private static Map<String, Object> site(String id, String name) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("name", name);
        return m;
    }

    private static Map<String, Object> preset(String label) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", "FM_RP_" + label);
        m.put("label", label);
        return m;
    }

    private static Map<String, Object> catalog(String name, String unit) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("unit", unit);
        return m;
    }

    private static Map<String, Object> page(List<Map<String, Object>> rows) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", rows.size());
        m.put("rows", rows);
        return m;
    }

    private static Map<String, Object> consumableRow(String id, String name, String qty, String unit) {
        return consumableRow(id, name, qty, unit, "甲机房", "2026-10-09 09:00:00");
    }

    private static Map<String, Object> consumableRow(String id, String name, String qty, String unit, String site) {
        return consumableRow(id, name, qty, unit, site, "2026-10-09 09:00:00");
    }

    private static Map<String, Object> consumableRow(String id, String name, String qty, String unit,
                                                     String site, String at) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("siteName", site);
        m.put("consumableName", name);
        m.put("qty", qty);
        m.put("unit", unit);
        m.put("occurredAt", at);
        m.put("createdByName", "位亚磊");
        return m;
    }

    private User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_x");
        u.setRole(role);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String toolName, String json) throws Exception {
        return run(toolName, json, user(RoleEnum.STAFF));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String toolName, String json, User actor) throws Exception {
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) tool(toolName).executor()
                .execute(new AiToolContext(actor, 1L, 2L, null), args);
    }

    @Test
    @DisplayName("视角闸：本包只服务教职工，学生视角一条工具都拿不到")
    void staffOnlyView() {
        assertEquals(java.util.Set.of(AiView.STAFF), pack.views(),
                "检查维护页是教职工后台页；这里显式声明，别被改宽");
    }

    @Test
    @DisplayName("每个工具的能力码都要在 capabilities() 里声明 —— 漏声明 = 闸门 fail-closed 让它永远调不动")
    void everyToolCapabilityIsDeclared() {
        java.util.Set<String> declared = pack.capabilities().keySet();
        for (AiTool t : pack.tools()) {
            assertTrue(declared.contains(t.capability()),
                    "工具 " + t.name() + " 的能力码 " + t.capability() + " 没声明");
        }
    }

    @Test
    @DisplayName("工具名不重名、不空 —— 重名会让注册表启动直接失败")
    void toolNamesAreUniqueAndNonBlank() {
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (AiTool t : pack.tools()) {
            assertFalse(t.name().isBlank());
            assertTrue(seen.add(t.name()), "工具名重复: " + t.name());
        }
    }

    @Test
    @DisplayName("能力闸：STAFF 起可见，学生档不可见（与页面权限表同口径）")
    void capabilityIsStaff() {
        var cap = pack.capabilities().get(FacilityMaintenanceToolPack.CAP_FACILITY_MAINTENANCE);
        assertNotNull(cap);
        assertTrue(cap.test(user(RoleEnum.STAFF)));
        assertTrue(cap.test(user(RoleEnum.ADMIN)));
        assertFalse(cap.test(user(RoleEnum.MEMBER)), "学生不该拿到检查维护");
        assertFalse(cap.test(new User()), "没有角色的账号也不该放行");
    }

    @Test
    @DisplayName("每一次写都要用户点确认；读不要")
    void writesRequireConfirm() {
        for (AiTool t : pack.tools()) {
            boolean write = t.name().startsWith("create") || t.name().startsWith("update")
                    || t.name().startsWith("delete");
            assertEquals(write, t.requiresConfirm(), t.name() + " 的确认闸不对");
        }
    }

    @Test
    @DisplayName("不可逆的整册操作不在这个包里（只有逐条删）")
    void noBulkWipeTools() {
        for (AiTool t : pack.tools()) {
            String n = t.name().toLowerCase(java.util.Locale.ROOT);
            assertFalse(n.contains("purge") || n.contains("clear") || n.contains("wipe"), t.name());
        }
    }

    @Test
    @DisplayName("机房做成可点选项，且给的是机房 id 不是名字")
    void sitesBecomeChipsWithIdAsValue() throws Exception {
        Map<String, Object> out = run("listFmOptions", "{\"kind\":\"sites\"}");
        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals("是哪个机房（地点）？", out.get("choicesTitle"), "机房是必填单选，要问成一道题");
        List<?> choices = (List<?>) out.get("choices");
        assertEquals(3, choices.size());
        Map<?, ?> first = (Map<?, ?>) choices.get(0);
        assertEquals("甲机房", first.get("label"));
        assertEquals("FM_S_1", first.get("value"), "传回去的必须是机房 id —— 用户点的是名字，模型拿的要是 id");
    }

    @Test
    @DisplayName("更换类型做成多选题（一次可能换好几级）")
    void replacementTypesBecomeMultiSelect() throws Exception {
        Map<String, Object> out = run("listFmOptions", "{\"kind\":\"replacementTypes\"}");
        assertEquals(Boolean.TRUE, out.get("ok"));
        List<?> questions = (List<?>) out.get("questions");
        assertNotNull(questions, "多选走 questions 通道");
        Map<?, ?> q = (Map<?, ?>) questions.get(0);
        assertEquals(Boolean.TRUE, q.get("multiSelect"));
        assertEquals(3, ((List<?>) q.get("options")).size());
    }

    @Test
    @DisplayName("耗材名目只做填空助手，不做成单选题（用户可以说名目里没有的东西）")
    void catalogIsNotAChoiceQuestion() throws Exception {
        Map<String, Object> out = run("listFmOptions", "{\"kind\":\"consumableCatalog\"}");
        assertNull(out.get("choices"), "名目不是必选项，摆成单选题等于逼用户选");
        assertNull(out.get("questions"));
        assertEquals(1, ((List<?>) out.get("catalog")).size());
    }

    @Test
    @DisplayName("缺机房不许落库 —— 这是「记录半桶阻垢剂」时最该问的那一件")
    void createConsumableWithoutSiteDoesNothing() throws Exception {
        Map<String, Object> out = run("createFmConsumableLine",
                "{\"consumableName\":\"阻垢剂\",\"qty\":0.5,\"unit\":\"桶\"}");
        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("机房"), "要指名缺的是机房");
        verify(service, never()).createConsumableLine(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("数量不合法（缺 / 0 / 负）不许落库")
    void createConsumableRejectsBadQty() throws Exception {
        for (String qty : new String[]{"null", "0", "-1"}) {
            Map<String, Object> out = run("createFmConsumableLine",
                    "{\"siteId\":\"FM_S_1\",\"consumableName\":\"阻垢剂\",\"qty\":" + qty + "}");
            assertEquals(Boolean.FALSE, out.get("ok"), "qty=" + qty + " 不该放行");
        }
        verify(service, never()).createConsumableLine(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("记耗材：时间不传就交给服务端（别自己算一个写进去）")
    void createConsumableLeavesTimeToServer() throws Exception {
        when(service.createConsumableLine(anyString(), anyString(), any(), any(), any(), any(), anyString()))
                .thenReturn(Map.of("id", "FM_C_1"));

        Map<String, Object> out = run("createFmConsumableLine",
                "{\"siteId\":\"FM_S_1\",\"consumableName\":\"阻垢剂\",\"qty\":0.5,\"unit\":\"桶\"}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<LocalDateTime> at = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(service).createConsumableLine(eq("FM_S_1"), eq("阻垢剂"),
                eq(new BigDecimal("0.5")), eq("桶"), at.capture(), isNull(), eq("STAFF_x"));
        assertNull(at.getValue(), "「今天」就该留空，让服务端记当下时刻");
        assertEquals("（服务端当下时刻）", out.get("occurredAt"), "回读里不许出现一个自己算的时间");
        assertEquals("甲机房", out.get("siteName"));
    }

    @Test
    @DisplayName("正文不许说「已经记好了」——还要用户点一次确认")
    void createConsumableDoesNotClaimDone() throws Exception {
        when(service.createConsumableLine(any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(Map.of("id", "FM_C_1"));
        Map<String, Object> out = run("createFmConsumableLine",
                "{\"siteId\":\"FM_S_1\",\"consumableName\":\"阻垢剂\",\"qty\":0.5}");
        assertTrue(String.valueOf(out.get("noteToModel")).contains("不要说"),
                "要给模型一句明确的禁令：别说已经记好了");
        // 除了那条禁令本身，别的字段都不许出现「已经记好」
        for (Map.Entry<String, Object> e : out.entrySet()) {
            if ("noteToModel".equals(e.getKey())) continue;
            assertFalse(String.valueOf(e.getValue()).contains("已经记好"), e.getKey() + " 冒充了完成态");
        }
    }

    @Test
    @DisplayName("缺更换类型不许落库，且不许把「过滤网」当级别塞进去")
    void createReplacementNeedsPresetType() throws Exception {
        Map<String, Object> out = run("createFmReplacementRecords",
                "{\"siteId\":\"FM_S_1\",\"filterTypes\":[]}");
        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("类型"));
        verify(service, never()).createReplacementRecord(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("一次换多级 = 逐级各记一条（与页面批量新增同一口径）")
    void createReplacementLoopsPerType() throws Exception {
        when(service.createReplacementRecord(any(), any(), any(), any(), any()))
                .thenReturn(Map.of("id", "FM_R_x"));

        Map<String, Object> out = run("createFmReplacementRecords",
                "{\"siteId\":\"FM_S_1\",\"filterTypes\":[\"初效\",\"中效\"]}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals(2, ((List<?>) out.get("ids")).size());
        verify(service).createReplacementRecord(eq("FM_S_1"), eq("初效"), isNull(), isNull(), eq("STAFF_x"));
        verify(service).createReplacementRecord(eq("FM_S_1"), eq("中效"), isNull(), isNull(), eq("STAFF_x"));
    }

    @Test
    @DisplayName("改：什么都没说要改 → 不许当成「改成功了」")
    void updateWithoutAnyFieldDoesNothing() throws Exception {
        Map<String, Object> out = run("updateFmConsumableLine", "{\"id\":\"FM_C_1\"}");
        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(service, never()).updateConsumableLine(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("改：没传的字段保持原样（传 null，不是传空串）")
    void updateSendsNullForUntouchedFields() throws Exception {
        Map<String, Object> out = run("updateFmConsumableLine", "{\"id\":\"FM_C_1\",\"qty\":3}");
        assertEquals(Boolean.TRUE, out.get("ok"));
        ArgumentCaptor<BigDecimal> qty = ArgumentCaptor.forClass(BigDecimal.class);
        verify(service).updateConsumableLine(eq("FM_C_1"), isNull(), isNull(),
                qty.capture(), isNull(), isNull(), isNull());
        // ArrayList 的 BigDecimal.equals 比 scale，这里比数值
        assertEquals(0, new BigDecimal("3").compareTo(qty.getValue()), "数量要按用户说的数字传下去");
    }

    @Test
    @DisplayName("删：没有 id 不许动手")
    void deleteNeedsAnId() throws Exception {
        Map<String, Object> out = run("deleteFmConsumableLine", "{}");
        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(service, never()).deleteConsumableLine(any());

        run("deleteFmConsumableLine", "{\"id\":\"FM_C_9\"}");
        verify(service).deleteConsumableLine("FM_C_9");
    }

    @Test
    @DisplayName("汇总：排行看**全库**，不是只数第一页 —— 只看一页会得出「其余都零星」的错结论")
    void summarizeSeesEveryPage() throws Exception {
        // 真机形状：全库 222 条，第一页只能拿 200 条；按机房数的话 1F 会被漏掉一半
        List<Map<String, Object>> p1 = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            p1.add(consumableRow("A" + i, "阻垢剂", "1", "桶", "1F机房"));
        }
        List<Map<String, Object>> p2 = new ArrayList<>();
        for (int i = 0; i < 22; i++) {
            p2.add(consumableRow("B" + i, "阻垢剂", "1", "桶", "1F机房"));
        }
        when(service.listConsumableLines(any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(page(p1))     // 第 1 页
                .thenReturn(page(p2))     // 第 2 页
                .thenReturn(page(List.of()));

        Map<String, Object> out = run("summarizeFmConsumableUsage", "{\"groupBy\":\"site\"}");
        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals(222, out.get("matchedRows"), "必须翻页取全 —— 少一页排名就是错的");
        List<?> groups = (List<?>) out.get("groups");
        assertEquals(222L, ((Map<?, ?>) groups.get(0)).get("rows"));
    }

    @Test
    @DisplayName("汇总：按耗材排名 + 「多久用一次」由首末算出（**跨年也要对**）")
    void summarizeRanksAndComputesInterval() throws Exception {
        // 跨年是关键：用 Period.getDays() 会把「2 年 6 天」算成 6 天，均值差两个数量级（真机撞到过）
        when(service.listConsumableLines(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(page(List.of(
                consumableRow("1", "阻垢剂", "1", "桶", "1F机房", "2024-10-03 09:00:00"),
                consumableRow("2", "阻垢剂", "1", "桶", "1F机房", "2025-10-06 09:00:00"),
                consumableRow("3", "阻垢剂", "1", "桶", "1F机房", "2026-10-09 09:00:00"),
                consumableRow("4", "手套", "2", "包", "2F机房", "2026-01-05 09:00:00"))));

        Map<String, Object> out = run("summarizeFmConsumableUsage", "{\"groupBy\":\"consumable\"}");
        List<?> groups = (List<?>) out.get("groups");
        Map<?, ?> top = (Map<?, ?>) groups.get(0);
        assertEquals("阻垢剂", top.get("key"));
        assertEquals(3L, top.get("rows"));
        // 2024-10-03 → 2026-10-09 共 736 天，3 次 = 每 368 天一次
        assertEquals(368.0, top.get("avgIntervalDays"), "跨年的天数不能被 Period.getDays() 截掉");
        assertEquals("2024-10-03", top.get("firstAt"));
    }

    @Test
    @DisplayName("汇总：按月份横着看趋势")
    void summarizeByMonth() throws Exception {
        when(service.listConsumableLines(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(page(List.of(
                consumableRow("1", "阻垢剂", "1", "桶", "1F机房", "2026-01-01 09:00:00"),
                consumableRow("2", "阻垢剂", "1", "桶", "1F机房", "2026-01-20 09:00:00"),
                consumableRow("3", "手套", "1", "包", "1F机房", "2026-02-02 09:00:00"))));

        Map<String, Object> out = run("summarizeFmConsumableUsage", "{\"groupBy\":\"month\"}");
        List<?> groups = (List<?>) out.get("groups");
        assertEquals("2026-01", ((Map<?, ?>) groups.get(0)).get("key"), "条数多的月份排前面");
        assertEquals(2L, ((Map<?, ?>) groups.get(0)).get("rows"));
    }

    @Test
    @DisplayName("汇总：groupBy 写错要明确报错，别静默给个默认")
    void summarizeRejectsUnknownGroupBy() throws Exception {
        Map<String, Object> out = run("summarizeFmConsumableUsage", "{\"groupBy\":\"room\"}");
        assertEquals(Boolean.FALSE, out.get("ok"));
    }

    @Test
    @DisplayName("列表：命中总数由 SQL 数，截断了要如实说（不是「我在一页里没找到」）")
    void listReportsTruncation() throws Exception {
        when(service.listConsumableLines(any(), any(), any(), any(), anyInt(), anyInt()))
                .thenAnswer(inv -> {
                    int size = inv.getArgument(5);
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (int i = 0; i < size; i++) {
                        rows.add(consumableRow("FM_C_" + i, "阻垢剂", "0.5", "桶"));
                    }
                    Map<String, Object> p = page(rows);
                    p.put("total", 50);      // SQL 数出真命中 50，这一页只回了 limit 条
                    return p;
                });

        Map<String, Object> out = run("listFmConsumableLines", "{\"keyword\":\"阻垢剂\",\"limit\":3}");
        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals(3, ((List<?>) out.get("rows")).size());
        assertEquals(50, out.get("matchedTotal"), "命中总数是 SQL 数的，不是回给你的行数");
        assertEquals(Boolean.TRUE, out.get("truncated"), "截断必须报出来，不然模型会断言「一共就这几条」");
        assertNotNull(out.get("note"));
    }

    @Test
    @DisplayName("列表：关键词与时间段**下沉到 SQL**，别拉一页回来自己筛")
    void listPushesFiltersToSql() throws Exception {
        run("listFmConsumableLines",
                "{\"siteId\":\"FM_S_1\",\"keyword\":\"阻垢\",\"from\":\"2026-01-01\",\"to\":\"2026-03-31\"}");

        ArgumentCaptor<String> kw = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<java.time.LocalDate> from = ArgumentCaptor.forClass(java.time.LocalDate.class);
        ArgumentCaptor<java.time.LocalDate> to = ArgumentCaptor.forClass(java.time.LocalDate.class);
        verify(service).listConsumableLines(eq("FM_S_1"), kw.capture(), from.capture(), to.capture(),
                anyInt(), anyInt());
        assertEquals("阻垢", kw.getValue());
        assertEquals(java.time.LocalDate.parse("2026-01-01"), from.getValue(), "时间段要进 SQL");
        assertEquals(java.time.LocalDate.parse("2026-03-31"), to.getValue());
    }

    @Test
    @DisplayName("确认框那行字是人话：带名称，不是原始 JSON")
    void confirmDetailIsHuman() throws Exception {
        String detail = tool("createFmConsumableLine").confirmDetailOf(
                om.readTree("{\"siteId\":\"FM_S_1\",\"consumableName\":\"阻垢剂\",\"qty\":0.5,\"unit\":\"桶\"}"));
        assertTrue(detail.contains("阻垢剂"), detail);
        assertTrue(detail.contains("甲机房"), "要能看出是哪个机房，别只印 id");
        assertTrue(detail.contains("0.5"), detail);
        assertFalse(detail.contains("{"), "别把原始 JSON 丢给用户看");
    }

    @Test
    @DisplayName("确认框那行字不许夹带写给模型的指令（confirmPhrase 取第一句）")
    void confirmPhraseHasNoInstructions() {
        for (AiTool t : pack.tools()) {
            if (!t.requiresConfirm()) continue;
            String phrase = t.confirmPhrase();
            assertFalse(phrase.contains("不要") || phrase.contains("别自己"), t.name() + " 的确认短语夹带了指令");
        }
    }
}
