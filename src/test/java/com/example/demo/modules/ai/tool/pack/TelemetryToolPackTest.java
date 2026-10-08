package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchivePointDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryArchiveSeriesDto;
import com.example.demo.modules.telemetry.service.TelemetryArchiveService;
import com.example.demo.modules.telemetry.service.TelemetrySnapshotService;
import com.example.demo.modules.telemetry.service.TelemetryWinCcWriteService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 环境监测包的闸。
 *
 * <p>四件会**答错或动到设备**的事：
 * ① 关键词过滤认房间/指标（不然「201A 多少度」会答成别的房间）；
 * ② 曲线取的是**摘要**（min/max/avg/last），不是把几百个点全灌给模型；
 * ③ 下发是 C 级（碰硬件 → 挂起确认），能力与页面接口同档（SUPER_ADMIN）；
 * ④ 开关点位不许用 true/false —— 猜错就是把设备按反。
 */
class TelemetryToolPackTest {

    private TelemetrySnapshotService snapshotService;
    private TelemetryArchiveService archiveService;
    private TelemetryWinCcWriteService writeService;
    private TelemetryToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        snapshotService = mock(TelemetrySnapshotService.class);
        archiveService = mock(TelemetryArchiveService.class);
        writeService = mock(TelemetryWinCcWriteService.class);
        pack = new TelemetryToolPack(snapshotService, archiveService, writeService);
    }

    private static TelemetryTagItemDto item(String variable, String room, String metric, String value) {
        TelemetryTagItemDto it = new TelemetryTagItemDto();
        it.setVariableName(variable);
        it.setRoomCanonical(room);
        it.setMetricKindLabel(metric);
        it.setValue(value);
        return it;
    }

    private static TelemetryTagItemDto itemOnFloor(String variable, String floor, String room, String metric, String value) {
        TelemetryTagItemDto it = item(variable, room, metric, value);
        it.setFloorCode(floor);
        return it;
    }

    private static TelemetryTagItemDto itemWithRole(String variable, String role, String room, String metric, String value) {
        TelemetryTagItemDto it = item(variable, room, metric, value);
        it.setKindRole(role);
        return it;
    }

    private void snapshot(TelemetryTagItemDto... items) {
        TelemetrySnapshotDto dto = new TelemetrySnapshotDto();
        dto.setWinccReachable(true);
        dto.setItems(List.of(items));
        when(snapshotService.getSnapshot()).thenReturn(dto);
    }

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_u");
        u.setRole(role);
        return u;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String tool, String json) throws Exception {
        AiTool t = pack.tools().stream().filter(x -> x.name().equals(tool)).findFirst().orElseThrow();
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) t.executor()
                .execute(new AiToolContext(user(RoleEnum.SUPER_ADMIN), 1L, 2L, null), args);
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(x -> x.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("按房间/指标过滤点位；≤6 个时给可点候选（值是变量名）")
    void filtersByKeywordAndOffersChoices() throws Exception {
        snapshot(item("V1", "201A", "温度", "22.5"),
                item("V2", "201A", "湿度", "55"),
                item("V3", "202A", "温度", "21.8"));

        Map<String, Object> out = run("listTelemetryPoints", "{\"keyword\":\"201a\"}");

        assertEquals(2, out.get("total"), "只应命中 201A 的两条");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) out.get("choices");
        assertEquals("V1", choices.get(0).get("value"), "候选送出去的是变量名，后续查曲线/下发都用它");
        assertTrue(String.valueOf(choices.get(0).get("label")).contains("201A"));
    }

    @Test
    @DisplayName("查不出匹配点位时说清「换个词」，别编一个点位出来")
    void noMatchSaysSo() throws Exception {
        snapshot(item("V1", "201A", "温度", "22.5"));

        Map<String, Object> out = run("listTelemetryPoints", "{\"keyword\":\"999Z\"}");

        assertEquals(0, out.get("total"));
        assertNotNull(out.get("note"));
    }

    @Test
    @DisplayName("历史曲线回的是摘要（min/max/avg/last），不把原始点全灌给模型")
    void historyReturnsSummary() throws Exception {
        TelemetryArchiveSeriesDto series = new TelemetryArchiveSeriesDto();
        series.setPoints(List.of(point("10:00", 20.0), point("11:00", 24.0), point("12:00", 22.0)));
        when(archiveService.querySeries(anyString(), any(), any(), anyInt(), anyString(), any(), anyString(), any()))
                .thenReturn(series);

        Map<String, Object> out = run("queryTelemetryHistory", "{\"variableName\":\"V1\",\"windowHours\":12}");

        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals(20.0, out.get("min"));
        assertEquals(24.0, out.get("max"));
        assertEquals(22.0, out.get("avg"));
        assertEquals(22.0, out.get("last"));
        assertEquals(3, out.get("samples"));
    }

    @Test
    @DisplayName("归档里没有这个点位 → 明说没有，不瞎报数字")
    void emptyArchiveIsReported() throws Exception {
        TelemetryArchiveSeriesDto series = new TelemetryArchiveSeriesDto();
        series.setPoints(List.of());
        when(archiveService.querySeries(anyString(), any(), any(), anyInt(), anyString(), any(), anyString(), any()))
                .thenReturn(series);

        Map<String, Object> out = run("queryTelemetryHistory", "{\"variableName\":\"NOPE\"}");

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertNotNull(out.get("reason"));
    }

    @Test
    @DisplayName("没给范围而点位跨楼层 → 先回楼层候选让用户挑，不把整栋楼列出来")
    void unscopedAcrossFloorsAsksForFloor() throws Exception {
        snapshot(itemOnFloor("V1", "3F", "301", "温度", "22.5"),
                itemOnFloor("V2", "3F", "302", "湿度", "55"),
                itemOnFloor("V3", "2F", "201", "温度", "21.8"));

        Map<String, Object> out = run("listTelemetryPoints", "{}");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) out.get("choices");
        assertEquals(2, choices.size(), "两个楼层 → 两个候选");
        assertEquals("3F", choices.get(0).get("value"), "候选送出去的是楼层（人话），用户点一下就是下一条消息");
        assertNotNull(out.get("note"));
        assertEquals(null, out.get("points"), "问楼层那一轮不该同时铺一屏点位");
    }

    @Test
    @DisplayName("给了楼层就列该层的点位；给了房间号/指标也不必再问楼层")
    void scopedReturnsRows() throws Exception {
        snapshot(itemOnFloor("V1", "3F", "301", "温度", "22.5"),
                itemOnFloor("V2", "2F", "201", "温度", "21.8"));

        Map<String, Object> byFloor = run("listTelemetryPoints", "{\"floor\":\"3F\"}");
        assertEquals(1, byFloor.get("total"));
        assertNotNull(byFloor.get("points"), "给了楼层就该直接列点位，而不是再问一遍楼层");

        Map<String, Object> byRoom = run("listTelemetryPoints", "{\"keyword\":\"201\"}");
        assertEquals(1, byRoom.get("total"), "房间号已经限定了范围，不该再弹楼层候选");
        assertNotNull(byRoom.get("points"));
    }

    @Test
    @DisplayName("下发前能只列可下发的点位（role 只有 SWITCH/SETPOINT 允许写）")
    void writableOnlyFilters() throws Exception {
        snapshot(itemWithRole("V1", "METRIC", "301", "温度", "22.5"),
                itemWithRole("V2", "SWITCH", "301", "送风开关", "true"));

        Map<String, Object> out = run("listTelemetryPoints", "{\"writableOnly\":true}");

        assertEquals(1, out.get("total"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> points = (List<Map<String, Object>>) out.get("points");
        assertEquals("V2", points.get(0).get("variable"));
        assertEquals("SWITCH", points.get(0).get("role"));
    }

    @Test
    @DisplayName("下发是 C 级（碰硬件必须确认）；布尔按原样交给上游（快照里开关本就是 true/false）；上游拒绝的话要原样带出来")
    void writeGuards() throws Exception {
        assertTrue(tool("writeTelemetryTag").requiresConfirm(), "写 WinCC 必须挂起确认");

        when(writeService.writeTagAndRefreshSnapshotRow(eq("V1"), eq(Boolean.TRUE)))
                .thenReturn(item("V1", "301", "送风开关", "true"));
        Map<String, Object> bool = run("writeTelemetryTag", "{\"variableName\":\"V1\",\"value\":true}");
        assertEquals(Boolean.TRUE, bool.get("ok"));
        verify(writeService).writeTagAndRefreshSnapshotRow("V1", Boolean.TRUE);

        when(writeService.writeTagAndRefreshSnapshotRow(eq("V1"), eq(1)))
                .thenThrow(new IllegalArgumentException("仅 kind_role 为 SWITCH 或 SETPOINT 的变量允许远程写入"));
        Map<String, Object> denied = run("writeTelemetryTag", "{\"variableName\":\"V1\",\"value\":1}");
        assertEquals(Boolean.FALSE, denied.get("ok"));
        assertTrue(String.valueOf(denied.get("reason")).contains("SWITCH"), "上游的拒绝理由要带给用户");
    }

    @Test
    @DisplayName("能力与页面接口同档：读=登录即可，下发=SUPER_ADMIN")
    void capabilityMatchesHttpEntry() {
        Map<String, java.util.function.Predicate<User>> caps = pack.capabilities();
        assertTrue(caps.get(TelemetryToolPack.CAP_TELEMETRY_READ).test(user(RoleEnum.STAFF)));
        assertTrue(caps.get(TelemetryToolPack.CAP_TELEMETRY_WRITE).test(user(RoleEnum.SUPER_ADMIN)));
        assertTrue(!caps.get(TelemetryToolPack.CAP_TELEMETRY_WRITE).test(user(RoleEnum.ADMIN)),
                "页面的 write-tag 要求 SUPER_ADMIN，AI 这边不能更松");
        for (AiTool t : pack.tools()) {
            assertNotNull(caps.get(t.capability()), "工具 " + t.name() + " 的能力码没有判定");
        }
    }

    private static TelemetryArchivePointDto point(String t, Double v) {
        TelemetryArchivePointDto p = new TelemetryArchivePointDto();
        p.setT(t);
        p.setValue(v);
        return p;
    }
}
