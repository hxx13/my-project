package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.analytics.service.StudentActivitySnapshotService;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 学生活跃度统计包的闸。
 *
 * <p>钉住的是**报错数字 / 报错人**的那几处：时间口径（结束日期要到当天末，不含今天）、
 * 按人查要扫全组（绝不截断后再筛）、找不到人时不许拿别人顶、缺参数先问而不是默默默认。
 */
class StudentActivityToolPackTest {

    private StudentActivityService activityService;
    private StudentActivitySnapshotService snapshotService;
    private StudentActivityToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        activityService = mock(StudentActivityService.class);
        snapshotService = mock(StudentActivitySnapshotService.class);
        pack = new StudentActivityToolPack(activityService, snapshotService);
    }

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_u");
        u.setRole(role);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String toolName, String json) throws Exception {
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) tool(toolName).executor()
                .execute(new AiToolContext(user(RoleEnum.STAFF), 1L, 2L, null), args);
    }

    private static Map<String, Object> member(String name, int entries) {
        Map<String, Object> m = new HashMap<>();
        m.put("userName", name);
        m.put("entryCount", entries);
        return m;
    }

    private void mockMembers(Map<String, Object>... members) {
        Map<String, Object> data = new HashMap<>();
        data.put("members", List.of(members));
        data.put("total", members.length);
        data.put("summary", Map.of("memberCount", members.length));
        when(activityService.queryMemberActivity(anyString(), anyString(), anyString(),
                anyString(), anyString(), anyInt(), anyInt())).thenReturn(data);
    }

    @Test
    @DisplayName("视角与能力：本包只服务教职工，且门槛是 STAFF（页面就是 STAFF）")
    void viewAndCapability() {
        assertEquals(java.util.Set.of(AiView.STAFF), pack.views());
        var cap = pack.capabilities().get(StudentActivityToolPack.CAP_STUDENT_ACTIVITY);
        assertTrue(cap.test(user(RoleEnum.STAFF)));
        assertFalse(cap.test(user(RoleEnum.MEMBER)), "MEMBER 不该拿到这个统计包");
    }

    @Test
    @DisplayName("三个查询只读、重算要确认")
    void grading() {
        for (String r : List.of("listStudentActivityGroups", "queryStudentActivity",
                "queryStudentActivityHabits", "listStudentActivityRoomUsage")) {
            assertFalse(tool(r).requiresConfirm(), r + " 是只读");
        }
        assertTrue(tool("recalculateStudentActivity").requiresConfirm(), "重算全站快照必须过确认");
    }

    @Test
    @DisplayName("时间口径照页面：结束日期补到当天 23:59:59，起始补 00:00:00")
    void dateRangeFollowsPageConvention() throws Exception {
        mockMembers(member("张三", 5));

        run("queryStudentActivity", "{\"group\":\"卢今的课题组\",\"from\":\"2026-09-29\",\"to\":\"2026-10-05\"}");

        ArgumentCaptor<String> start = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> end = ArgumentCaptor.forClass(String.class);
        verify(activityService).queryMemberActivity(anyString(), start.capture(), end.capture(),
                anyString(), anyString(), anyInt(), anyInt());
        assertEquals("2026-09-29 00:00:00", start.getValue());
        assertEquals("2026-10-05 23:59:59", end.getValue(), "结束要到当天末，否则比页面的数少一天");
    }

    @Test
    @DisplayName("按人查要**扫全组**再筛 —— 排在后面的那个人不能被截断掉")
    void personQueryScansWholeGroup() throws Exception {
        mockMembers(member("张三", 5));

        run("queryStudentActivity",
                "{\"group\":\"卢今的课题组\",\"from\":\"2026-09-29\",\"to\":\"2026-10-05\",\"personName\":\"张三\",\"limit\":3}");

        ArgumentCaptor<Integer> size = ArgumentCaptor.forClass(Integer.class);
        verify(activityService).queryMemberActivity(anyString(), anyString(), anyString(),
                anyString(), anyString(), anyInt(), size.capture());
        assertTrue(size.getValue() >= 1000, "按人查必须扫全组，不能只取前几条：" + size.getValue());
    }

    @Test
    @DisplayName("按人查：找到就给本人那一行 + 组内名次")
    @SuppressWarnings("unchecked")
    void personQueryReportsRank() throws Exception {
        mockMembers(member("李四", 9), member("张三", 5), member("王五", 1));

        Map<String, Object> out = run("queryStudentActivity",
                "{\"group\":\"卢今的课题组\",\"from\":\"2026-09-29\",\"to\":\"2026-10-05\",\"personName\":\"张三\"}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals(2, out.get("rankInGroup"), "张三排第二");
        assertEquals("张三", ((Map<String, Object>) out.get("person")).get("userName"));
        assertNotNull(out.get("rankBasis"));
    }

    @Test
    @DisplayName("按人查找不到 → 如实说没找到，绝不拿组里别人顶上")
    void personNotFoundIsHonest() throws Exception {
        mockMembers(member("李四", 9));

        Map<String, Object> out = run("queryStudentActivity",
                "{\"group\":\"卢今的课题组\",\"from\":\"2026-09-29\",\"to\":\"2026-10-05\",\"personName\":\"张三\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(String.valueOf(out.get("reason")).contains("没有叫"), out.get("reason").toString());
        assertFalse(out.containsKey("person"), "不许把别人当成他要找的人");
    }

    @Test
    @DisplayName("没说时间段 / 没说课题组 → 先问，不默认一个区间")
    void missingParamsAreAskedNotDefaulted() throws Exception {
        Map<String, Object> noRange = run("queryStudentActivity", "{\"group\":\"卢今的课题组\"}");
        assertEquals(Boolean.FALSE, noRange.get("ok"));
        assertTrue(String.valueOf(noRange.get("reason")).contains("时间段"), noRange.get("reason").toString());

        Map<String, Object> noGroup = run("queryStudentActivity", "{\"from\":\"2026-09-29\",\"to\":\"2026-10-05\"}");
        assertEquals(Boolean.FALSE, noGroup.get("ok"));
        assertTrue(String.valueOf(noGroup.get("reason")).contains("课题组"), noGroup.get("reason").toString());
    }

    @Test
    @DisplayName("空数据 → 如实说没有记录（别用「都不太活跃」糊过去）")
    void emptyDataIsStatedAsNoRecords() throws Exception {
        mockMembers();

        Map<String, Object> out = run("queryStudentActivity",
                "{\"group\":\"卢今的课题组\",\"from\":\"2026-09-29\",\"to\":\"2026-10-05\"}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertTrue(String.valueOf(out.get("note")).contains("没有"), out.get("note").toString());
    }

    @Test
    @DisplayName("重算：写操作、天数上限压到 30、文案要说清是**同步**跑完的（不许说「后台跑、过会儿再查」）")
    void recalculateIsCappedAndHonest() throws Exception {
        Map<String, Object> out = run("recalculateStudentActivity", "{\"daysBack\":9999}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        String note = String.valueOf(out.get("note"));
        assertTrue(note.contains("重算完"), "同步跑完就要说已经算完：" + note);
        assertFalse(note.contains("后台"), "它是同步执行的，说成后台任务会让用户白等：" + note);
        ArgumentCaptor<java.time.LocalDate> from = ArgumentCaptor.forClass(java.time.LocalDate.class);
        ArgumentCaptor<java.time.LocalDate> to = ArgumentCaptor.forClass(java.time.LocalDate.class);
        verify(snapshotService).recomputeRange(from.capture(), to.capture());
        long days = java.time.temporal.ChronoUnit.DAYS.between(from.getValue(), to.getValue()) + 1;
        assertTrue(days <= 30, "重算天数上限 30（同步执行，天数越多这一轮越慢）：" + days);
    }

    @Test
    @DisplayName("校区只认 全部/浦东/浦西，非法值回落全部")
    void campusFallsBackToAll() throws Exception {
        Map<String, Object> groups = new HashMap<>();
        groups.put("groups", List.of());
        groups.put("total", 0);
        when(activityService.listGroupsPaged(any(), anyString(), anyString(), anyInt(), anyInt(), anyString()))
                .thenReturn(groups);

        Map<String, Object> out = run("listStudentActivityGroups",
                "{\"from\":\"2026-09-29\",\"to\":\"2026-10-05\",\"campus\":\"浦西校区\"}");

        assertEquals("all", out.get("campus"), "非法校区值该回落成全部，而不是当成一个不存在的校区去查");
    }
}
