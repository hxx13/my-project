package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.TrainingAdminGate;
import com.example.demo.modules.training.service.TrainingService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 培训审批包：这个域最容易说错的地方是**「通过」= 审批 + 评分两道，各要一次**。
 * 只过了审批就报「已通过」，是用户明确纠正过的老错 —— 所以这里把三道文案（双通过 / 还差另一道 / 不通过）
 * 逐条钉住，另外钉住能力码委派和「一条一条办」。
 */
class TrainingReviewToolPackTest {

    private final ObjectMapper om = new ObjectMapper();
    private TrainingService trainingService;
    private TrainingAdminGate gate;
    private TrainingReviewToolPack pack;

    @BeforeEach
    void setUp() {
        trainingService = mock(TrainingService.class);
        gate = mock(TrainingAdminGate.class);
        pack = new TrainingReviewToolPack(trainingService, gate);
    }

    private static User userOf(RoleEnum role) {
        User u = new User();
        u.setId("u-1");
        u.setRole(role);
        return u;
    }

    private AiToolContext ctx() {
        return new AiToolContext(userOf(RoleEnum.SUPER_ADMIN), 1L, 2L);
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> name.equals(t.name())).findFirst().orElseThrow();
    }

    /** 待处理报名行（`testYn`=审批，`testFraction`=评分）。 */
    private Map<String, Object> pendingRow(String id, String name, int testYn, int testFraction) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("enrollmentId", id);
        r.put("name", name);
        r.put("jobNumber", "S001");
        r.put("trainingName", "2026秋季动物实验培训");
        r.put("occurrenceId", 7L);
        r.put("testYn", testYn);
        r.put("testFraction", testFraction);
        r.put("startTime", "2026-09-01 09:00");
        r.put("address", "浦东 201A");
        return r;
    }

    /** 回读行：`listEnrollments` 的 key 是 `id`（不是 enrollmentId）。 */
    private Map<String, Object> enrollRow(String id, int testYn, int testFraction) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id);
        r.put("testYn", testYn);
        r.put("testFraction", testFraction);
        return r;
    }

    @Test
    @DisplayName("能力码委派给 TrainingAdminGate#canManage —— 不在工具里重写「谁能进培训管理」")
    void capabilitiesDelegateToGate() {
        User superAdmin = userOf(RoleEnum.SUPER_ADMIN);
        when(gate.canManage(superAdmin)).thenReturn(true);

        assertTrue(pack.capabilities().get(TrainingReviewToolPack.CAP_PENDING).test(superAdmin));
        assertTrue(pack.capabilities().get(TrainingReviewToolPack.CAP_DECIDE).test(superAdmin));
        verify(gate, times(2)).canManage(superAdmin);
    }

    @Test
    @DisplayName("审批 / 评分都是写操作、都要过确认；清单是纯读")
    void writesRequireConfirm() {
        assertTrue(tool("auditTrainingEnrollment").requiresConfirm());
        assertTrue(tool("scoreTrainingEnrollment").requiresConfirm());
        assertFalse(tool("listPendingTrainingEnrollments").requiresConfirm());
    }

    @Test
    @DisplayName("审批通过 + 评分已通过 → 才能说「已通过」")
    void auditPassWithScorePassedReportsPassed() throws Exception {
        when(trainingService.listPending(anyString())).thenReturn(List.of(pendingRow("11", "张三", 0, 1)));
        when(trainingService.audit(anyLong(), anyInt(), any())).thenReturn(1);
        when(trainingService.listEnrollments(anyLong())).thenReturn(List.of(enrollRow("11", 1, 1)));

        Map<?, ?> m = (Map<?, ?>) tool("auditTrainingEnrollment").executor()
                .execute(ctx(), om.readTree("{\"enrollmentId\":\"11\",\"decision\":\"approved\"}"));

        String note = String.valueOf(m.get("note"));
        assertEquals(Boolean.TRUE, m.get("ok"));
        assertTrue(note.contains("已通过"), "两道门都过了才叫通过：" + note);
        assertFalse(note.contains("还差"));
        verify(trainingService).audit(eq(11L), eq(1), any());
    }

    @Test
    @DisplayName("审批通过但评分还是 0 → **绝不能说「已通过」**，必须点明还差评分")
    void auditPassWithScorePendingKeepsWording() throws Exception {
        when(trainingService.listPending(anyString())).thenReturn(List.of(pendingRow("11", "张三", 0, 0)));
        when(trainingService.audit(anyLong(), anyInt(), any())).thenReturn(1);
        when(trainingService.listEnrollments(anyLong())).thenReturn(List.of(enrollRow("11", 1, 0)));

        Map<?, ?> m = (Map<?, ?>) tool("auditTrainingEnrollment").executor()
                .execute(ctx(), om.readTree("{\"enrollmentId\":\"11\",\"decision\":\"approved\"}"));

        String note = String.valueOf(m.get("note"));
        assertTrue(note.contains("还差") && note.contains("评分"), "要说清还差哪一道：" + note);
        assertFalse(note.contains("已通过"), "只过一道门就说「已通过」是用户纠正过的错");
    }

    @Test
    @DisplayName("任一道判不通过 → 整条未通过（学生可重新报名）")
    void rejectMeansNotPassed() throws Exception {
        when(trainingService.listPending(anyString())).thenReturn(List.of(pendingRow("11", "张三", 0, 1)));
        when(trainingService.audit(anyLong(), anyInt(), any())).thenReturn(1);
        when(trainingService.listEnrollments(anyLong())).thenReturn(List.of(enrollRow("11", 2, 1)));

        Map<?, ?> m = (Map<?, ?>) tool("auditTrainingEnrollment").executor()
                .execute(ctx(), om.readTree("{\"enrollmentId\":\"11\",\"decision\":\"rejected\"}"));

        String note = String.valueOf(m.get("note"));
        assertTrue(note.contains("不通过"), note);
        assertFalse(note.contains("已通过"));
        verify(trainingService).audit(eq(11L), eq(2), any());
    }

    @Test
    @DisplayName("同一人报了多个培训 → 交回候选让用户挑，不自己选")
    void ambiguousPersonReturnsChoices() throws Exception {
        when(trainingService.listPending(anyString())).thenReturn(List.of(
                pendingRow("11", "张三", 0, 1),
                pendingRow("12", "张三", 0, 0)));

        Map<?, ?> m = (Map<?, ?>) tool("scoreTrainingEnrollment").executor()
                .execute(ctx(), om.readTree("{\"person\":\"张三\",\"decision\":\"approved\"}"));

        assertEquals(Boolean.FALSE, m.get("ok"));
        assertEquals(2, ((List<?>) m.get("choices")).size());
        verify(trainingService, never()).score(anyLong(), anyInt(), any());
    }

    @Test
    @DisplayName("清单必须把两道门的状态都给出来（模型据此才说得对）")
    void listShowsBothGates() throws Exception {
        when(trainingService.listPending(anyString())).thenReturn(List.of(pendingRow("11", "张三", 1, 0)));

        Map<?, ?> res = (Map<?, ?>) tool("listPendingTrainingEnrollments").executor()
                .execute(ctx(), om.readTree("{}"));
        Map<?, ?> row = (Map<?, ?>) ((List<?>) res.get("enrollments")).get(0);

        assertEquals("通过", row.get("auditState"));
        assertEquals("待处理", row.get("scoreState"));
        assertEquals("还差评分", row.get("missingGate"));
    }

    @Test
    @DisplayName("确认弹窗要说清这是哪一道门 + 判什么，不能只给个内部态")
    void confirmDetailNamesGate() throws Exception {
        String detail = tool("auditTrainingEnrollment")
                .confirmDetailOf(om.readTree("{\"enrollmentId\":\"11\",\"decision\":\"approved\"}"));
        assertTrue(detail.contains("审批"), detail);
        assertTrue(detail.contains("通过"), detail);

        String scoreDetail = tool("scoreTrainingEnrollment").confirmDetailOf(om.readTree("{\"decision\":\"rejected\"}"));
        assertTrue(scoreDetail.contains("评分"), scoreDetail);
        assertTrue(scoreDetail.contains("不通过"), scoreDetail);
    }
}
