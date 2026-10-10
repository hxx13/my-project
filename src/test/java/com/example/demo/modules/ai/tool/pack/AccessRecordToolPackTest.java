package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.accessfusion.model.AccessAuditFilterParams;
import com.example.demo.modules.accessfusion.service.AccessAuditSourceService;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 门禁记录查询包的闸。
 *
 * <p>钉住的是**答错数**的那几处：① 「刷卡失败」必须走开门类型「非法刷卡」而不是那个不可靠的刷卡结果字段；
 * ② 明细是截断的，不许拿它前几条当全部；③ 认不出的筛选值不许悄悄丢掉（丢了就是拿更宽的条件答）；
 * ④ 时间只给日期要按当天首/末补齐，否则少算一整天；⑤ 权限与页面同档（ADMIN）。
 */
class AccessRecordToolPackTest {

    private AccessAuditSourceService service;
    private AccessRecordToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = mock(AccessAuditSourceService.class);
        pack = new AccessRecordToolPack(service);
        when(service.previewSwing(any(), anyInt(), anyInt())).thenReturn(page(0, List.of()));
        when(service.summarizeSwing(any(), anyString(), anyInt())).thenReturn(List.of());
    }

    private static Map<String, Object> page(int total, List<Map<String, Object>> rows) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", rows);
        out.put("total", total);
        return out;
    }

    private static Map<String, Object> record(String time, String person, String channel) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("swingTime", time);
        it.put("personName", person);
        it.put("personCode", "STAFF_1");
        it.put("departmentName", "工作人员");
        it.put("channelName", channel);
        it.put("openTypeLabel", "非法刷卡开门");
        it.put("openResultLabel", "失败");
        it.put("enterOrExitLabel", "进入");
        it.put("audienceLabel", "工作人员");
        return it;
    }

    private static Map<String, Object> group(String label, int swings, int illegal) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("groupKey", "K-" + label);
        it.put("groupLabel", label);
        it.put("departmentName", "学生卡");
        it.put("swingCount", swings);
        it.put("illegalCount", illegal);
        it.put("failedCount", illegal);
        it.put("firstAt", "2026-10-08 09:00:00");
        it.put("lastAt", "2026-10-09 18:00:00");
        return it;
    }

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_x");
        u.setRole(role);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String toolName, String json, RoleEnum role) throws Exception {
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) tool(toolName).executor()
                .execute(new AiToolContext(user(role), 1L, 2L, null), args);
    }

    private Map<String, Object> run(String toolName, String json) throws Exception {
        return run(toolName, json, RoleEnum.ADMIN);
    }

    /** 抓最近一次送给查询服务的筛选条件。 */
    private AccessAuditFilterParams capturedFilter() {
        ArgumentCaptor<AccessAuditFilterParams> captor = ArgumentCaptor.forClass(AccessAuditFilterParams.class);
        verify(service).previewSwing(captor.capture(), anyInt(), anyInt());
        return captor.getValue();
    }

    @Test
    @DisplayName("视角与能力：只服务教职工，且门槛是 ADMIN（与页面/接口同档）")
    void viewAndCapability() {
        assertEquals(java.util.Set.of(AiView.STAFF), pack.views());
        var cap = pack.capabilities().get(AccessRecordToolPack.CAP_ACCESS_RECORD);
        assertNotNull(cap);
        assertTrue(cap.test(user(RoleEnum.ADMIN)));
        assertFalse(cap.test(user(RoleEnum.STAFF)), "门禁记录库的页面与接口都是 ADMIN 起，STAFF 不该拿到");
    }

    @Test
    @DisplayName("查询类工具一律不挂确认（只读），别把只查记录也弹成写操作")
    void readsDoNotAskForConfirm() {
        for (String name : List.of("queryAccessRecords", "summarizeAccessRecords")) {
            assertFalse(tool(name).requiresConfirm(), name + " 是只读");
        }
    }

    @Test
    @DisplayName("「刷卡失败」走开门类型「非法刷卡」，**不许**翻译成刷卡结果=失败")
    void swipeFailureMeansIllegalSwipe() throws Exception {
        run("queryAccessRecords", "{\"openType\":\"非法刷卡\"}");

        AccessAuditFilterParams f = capturedFilter();
        assertEquals(52, f.openType(), "非法刷卡是 52");
        assertNull(f.openResult(), "刷卡结果那个字段不可靠，不该被它带着走");
    }

    @Test
    @DisplayName("八个筛选各自落到对的字段上（通道/姓名/工号/部门/类型/结果/进出/时间）")
    void filtersLandOnTheRightFields() throws Exception {
        run("queryAccessRecords", """
                {"channel":"大厅","personName":"林","jobNumber":"STAFF_777",
                 "department":"学生卡","openType":"非法刷卡","swipeResult":"成功","direction":"离开",
                 "from":"2026-10-01","to":"2026-10-09"}""");

        AccessAuditFilterParams f = capturedFilter();
        assertEquals("大厅", f.channelName());
        assertEquals("林", f.personName());
        assertEquals("STAFF_777", f.personCode());
        assertEquals("学生卡", f.departmentName(), "部门走的是门禁侧那一栏，不是人员档案");
        assertEquals(52, f.openType());
        assertEquals(1, f.openResult());
        assertEquals(2, f.enterOrExit());
        assertEquals("2026-10-01 00:00:00", f.startTime(), "只给日期要按当天起点补");
        assertEquals("2026-10-09 23:59:59", f.endTime(), "只给日期要按当天末尾补，否则少算一整天");
    }

    @Test
    @DisplayName("认不出的筛选值 → 一条也不查，并把有效值回给模型")
    void unknownEnumIsRejectedNotDropped() throws Exception {
        Map<String, Object> out = run("queryAccessRecords", "{\"openType\":\"刷脸\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("刷脸"), out.toString());
        assertNotNull(out.get("allowed"));
        verify(service, never()).previewSwing(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("时间给反了 → 不查，先问回来")
    void reversedTimeRangeIsRejected() throws Exception {
        Map<String, Object> out = run("queryAccessRecords", "{\"from\":\"2026-10-09\",\"to\":\"2026-10-01\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(service, never()).previewSwing(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("明细被截断时如实报总数，并指路汇总工具（别拿前几条自己数）")
    void truncatedListReportsTotal() throws Exception {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            rows.add(record("2026-10-09 10:00:00", "人" + i, "大厅-137-MK02-MJ02"));
        }
        when(service.previewSwing(any(), anyInt(), anyInt())).thenReturn(page(856, rows));

        Map<String, Object> out = run("queryAccessRecords", "{\"channel\":\"大厅\",\"from\":\"2026-10-03\"}");

        assertEquals(856, out.get("total"));
        assertEquals(50, ((List<?>) out.get("records")).size());
        assertTrue(String.valueOf(out.get("note")).contains("856"), out.get("note").toString());
        assertTrue(String.valueOf(out.get("note")).contains("summarizeAccessRecords"),
                "要数人数/次数必须指路汇总，不能让模型拿前 50 条去数：" + out.get("note"));
    }

    @Test
    @DisplayName("没有记录 → 如实说没有（并提示别猜有人违规）")
    void emptyListIsHonest() throws Exception {
        Map<String, Object> out = run("queryAccessRecords", "{\"openType\":\"非法刷卡\"}");

        assertEquals(0, out.get("total"));
        assertEquals(0, ((List<?>) out.get("records")).size());
        assertTrue(String.valueOf(out.get("note")).contains("没有"), out.get("note").toString());
    }

    @Test
    @DisplayName("明细只回给人看的那几列，不把内部 id / 原始码值甩给模型")
    void recordsAreHumanReadable() throws Exception {
        when(service.previewSwing(any(), anyInt(), anyInt()))
                .thenReturn(page(1, List.of(record("2026-10-09 10:00:00", "林安顺", "大厅-137-MK02-MJ02"))));

        Map<String, Object> out = run("queryAccessRecords", "{}");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> records = (List<Map<String, Object>>) out.get("records");
        Map<String, Object> row = records.get(0);

        assertEquals("林安顺", row.get("person"));
        assertEquals("大厅-137-MK02-MJ02", row.get("channel"));
        assertEquals("非法刷卡开门", row.get("openType"));
        assertEquals("进入", row.get("direction"));
        for (String leaked : List.of("id", "taskId", "recordId", "mappingUserId", "rawJson")) {
            assertFalse(row.containsKey(leaked), "不该把这些甩给模型：" + leaked);
        }
    }

    @Test
    @DisplayName("汇总：分组方式透传、带上总次数与每组异常数，组数顶到上限时提示可能还有更多")
    void summarizeReportsGroupsAndTruncation() throws Exception {
        List<Map<String, Object>> groups = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            groups.add(group("学生" + i, 10 - (i % 3), 2));
        }
        when(service.summarizeSwing(any(), anyString(), anyInt())).thenReturn(groups);
        when(service.countSwing(any())).thenReturn(856);

        Map<String, Object> out = run("summarizeAccessRecords",
                "{\"channel\":\"大厅\",\"from\":\"2026-10-03\",\"to\":\"2026-10-09\"}");

        assertEquals("person", out.get("groupBy"));
        assertEquals(856, out.get("matchedSwings"), "总次数来自同一个 WHERE 的计数，不是把分组自己加起来");
        assertEquals(30, ((List<?>) out.get("groups")).size());
        assertTrue(String.valueOf(out.get("note")).contains("更多"), out.get("note").toString());

        // 按通道汇总也要能透传
        Map<String, Object> byChannel = run("summarizeAccessRecords", "{\"groupBy\":\"channel\"}");
        assertEquals("channel", byChannel.get("groupBy"));

        ArgumentCaptor<String> groupBy = ArgumentCaptor.forClass(String.class);
        verify(service, org.mockito.Mockito.times(2)).summarizeSwing(any(), groupBy.capture(), anyInt());
        assertEquals(List.of("person", "channel"), groupBy.getAllValues(),
                "分组方式要原样透传（第二次是按通道）");
    }

    @Test
    @DisplayName("汇总里每组要能分辨是谁：姓名 + 工号 + 部门")
    void summarizeGroupsAreIdentifiable() throws Exception {
        when(service.summarizeSwing(any(), anyString(), anyInt()))
                .thenReturn(List.of(group("林安顺", 7, 3)));
        when(service.countSwing(any())).thenReturn(7);

        Map<String, Object> out = run("summarizeAccessRecords", "{}");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> groups = (List<Map<String, Object>>) out.get("groups");
        Map<String, Object> g = groups.get(0);

        assertEquals("林安顺", g.get("label"));
        assertEquals(7, g.get("swings"));
        assertEquals(3, g.get("illegal"), "违规次数要单列，否则「谁刷卡失败」答不出来");
        assertEquals("学生卡", g.get("department"));
        assertEquals("K-林安顺", g.get("jobNumber"));
    }

    @Test
    @DisplayName("同名多行（一个人挂多张卡）→ 提示模型把同名相加再报，别把他当成好几个人")
    void repeatedNameGetsMergeHint() throws Exception {
        when(service.summarizeSwing(any(), anyString(), anyInt())).thenReturn(List.of(
                group("林安顺", 22, 19), group("林安顺", 13, 2), group("高雪丽", 7, 0)));
        when(service.countSwing(any())).thenReturn(42);

        Map<String, Object> out = run("summarizeAccessRecords", "{}");

        assertTrue(String.valueOf(out.get("note")).contains("合计"), out.get("note").toString());
    }

    @Test
    @DisplayName("汇总没有数据 → 如实说没有，不许编名字")
    void summarizeEmptyIsHonest() throws Exception {
        Map<String, Object> out = run("summarizeAccessRecords", "{\"openType\":\"非法刷卡\"}");

        assertEquals(0, ((List<?>) out.get("groups")).size());
        assertTrue(String.valueOf(out.get("note")).contains("没有"), out.get("note").toString());
    }

    @Test
    @DisplayName("没给时间就不加时间条件（查的是全部历史，工具照实说）")
    void noTimeRangeStillQueries() throws Exception {
        Map<String, Object> out = run("queryAccessRecords", "{}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertNull(capturedFilter().startTime());
        assertNull(capturedFilter().endTime());
    }
}
