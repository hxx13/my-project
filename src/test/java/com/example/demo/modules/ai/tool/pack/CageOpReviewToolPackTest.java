package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageClaimService;
import com.example.demo.modules.cageshelf.service.CageOperationService;
import com.example.demo.modules.cageshelf.service.TransferFormService;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 笼位操作审核包（认领 / 分笼）钉住四件事：
 * <ol>
 *   <li><b>认领的能力码必须委派给 {@code CageClaimService#canApprove}</b> —— 不在这里重写一遍。
 *       重写就是「同一动作两种权限口径」，抄错一次即漏洞（设计文档 §7.1）。</li>
 *   <li>分笼入口只要登录，所以它的能力码对谁都不设卡（对象级判定在服务里）。</li>
 *   <li>认领审批的结果**不能一律说「已通过」**：需要学生再确认时单子停在 locked。</li>
 *   <li>驳回缺原因时**在工具里就挡住**，别把服务端的 400 原样丢给用户。</li>
 * </ol>
 */
class CageOpReviewToolPackTest {

    private final ObjectMapper om = new ObjectMapper();
    private CageClaimService claimService;
    private CageOperationService opService;
    private TransferFormService transferFormService;
    private CageOpReviewToolPack pack;

    @BeforeEach
    void setUp() {
        claimService = mock(CageClaimService.class);
        opService = mock(CageOperationService.class);
        transferFormService = mock(TransferFormService.class);
        pack = new CageOpReviewToolPack(claimService, opService, transferFormService);
    }

    private static User userOf(RoleEnum role) {
        User u = new User();
        u.setId("u-1");
        u.setRole(role);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> name.equals(t.name())).findFirst().orElseThrow();
    }

    private Map<String, Object> claimRow(String id, String name, String status) {
        return new java.util.LinkedHashMap<>(Map.of(
                "id", id,
                "claimStatus", status,
                "claimantName", name,
                "roomName", "202A",
                "cageCount", 1));
    }

    @Test
    @DisplayName("认领的两项能力码委派给 CageClaimService#canApprove —— 不在工具里重写判定")
    void claimCapabilitiesDelegate() {
        User staff = userOf(RoleEnum.STAFF);
        // 替身的返回值原样透出，说明判定确实是从 canApprove 来的，而不是工具里另写的一套
        when(claimService.canApprove(staff)).thenReturn(true);
        when(claimService.canApprove(null)).thenReturn(false);

        Map<String, java.util.function.Predicate<User>> caps = pack.capabilities();
        assertTrue(caps.get(CageOpReviewToolPack.CAP_CLAIM_LIST).test(staff));
        assertTrue(caps.get(CageOpReviewToolPack.CAP_CLAIM_DECIDE).test(staff));
        assertFalse(caps.get(CageOpReviewToolPack.CAP_CLAIM_DECIDE).test(null),
                "canApprove 说不行就得不行 —— 不能被工具自己改成放行");

        verify(claimService, org.mockito.Mockito.times(3)).canApprove(any());
    }

    @Test
    @DisplayName("分笼的两项能力码不设卡（入口只要求登录，能审哪一张由服务按负责区域判）")
    void divideCapabilitiesAreOpen() {
        Map<String, java.util.function.Predicate<User>> caps = pack.capabilities();
        assertTrue(caps.get(CageOpReviewToolPack.CAP_OP_LIST).test(userOf(RoleEnum.MEMBER)));
        assertTrue(caps.get(CageOpReviewToolPack.CAP_OP_DECIDE).test(userOf(RoleEnum.MEMBER)));
    }

    @Test
    @DisplayName("四个审批工具都是写操作、都要过确认")
    void writesRequireConfirm() {
        for (String name : List.of("approveCageClaim", "rejectCageClaim", "approveCageDivide", "rejectCageDivide")) {
            assertTrue(tool(name).requiresConfirm(), name + " 是写操作，必须过确认");
        }
        assertFalse(tool("listPendingCageClaims").requiresConfirm());
        assertFalse(tool("listPendingCageOps").requiresConfirm());
    }

    @Test
    @DisplayName("驳回不给原因：工具自己先挡住，不把服务端的 400 丢给用户")
    void rejectWithoutReasonIsRefusedBeforeService() throws Exception {
        JsonNode args = om.readTree("{\"requestId\":\"77\"}");
        Object out = tool("rejectCageClaim").executor()
                .execute(new AiToolContext(userOf(RoleEnum.ADMIN), 1L, 2L), args);

        Map<?, ?> m = (Map<?, ?>) out;
        assertEquals(Boolean.FALSE, m.get("ok"));
        assertTrue(String.valueOf(m.get("reason")).contains("原因"), "要明确告诉模型缺原因");
        verify(claimService, never()).approve(any(), anyLong(), any(), any());
    }

    @Test
    @DisplayName("按人找单：他名下没有待审单时如实说找不到，且把待审条数带出来")
    void personResolutionReportsNotFound() throws Exception {
        when(claimService.getPendingList(any(), any(), any(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(Map.of("list", List.of(claimRow("1", "张三", "pending_approval")), "total", 1));

        JsonNode args = om.readTree("{\"person\":\"李四\"}");
        Map<?, ?> m = (Map<?, ?>) tool("approveCageClaim").executor()
                .execute(new AiToolContext(userOf(RoleEnum.ADMIN), 1L, 2L), args);

        assertEquals(Boolean.FALSE, m.get("ok"));
        assertTrue(String.valueOf(m.get("reason")).contains("李四"));
        verify(claimService, never()).approve(any(), anyLong(), eq("approved"), any());
    }

    @Test
    @DisplayName("同名多张时交回候选（让用户点选），不自己挑")
    void personResolutionReturnsChoices() throws Exception {
        when(claimService.getPendingList(any(), any(), any(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(Map.of("list", List.of(
                        claimRow("1", "李四", "pending_approval"),
                        claimRow("2", "李四", "pending_release_approval")), "total", 2));

        JsonNode args = om.readTree("{\"person\":\"李四\"}");
        Map<?, ?> m = (Map<?, ?>) tool("approveCageClaim").executor()
                .execute(new AiToolContext(userOf(RoleEnum.ADMIN), 1L, 2L), args);

        assertEquals(Boolean.FALSE, m.get("ok"));
        assertEquals(2, ((List<?>) m.get("choices")).size());
        verify(claimService, never()).approve(any(), anyLong(), any(), any());
    }

    // ── 转移三签 ──

    /** 一条待签转移单：身份由服务端下发的 `myRoles` 决定（工具不自己算）。 */
    private Map<String, Object> transferRow(List<String> myRoles, List<String> missingRoles) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", "42");
        row.put("opType", "transfer");
        row.put("applicantName", "位亚磊");
        row.put("threeSign", true);
        row.put("myRoles", myRoles);
        row.put("missingRoles", missingRoles);
        row.put("createdAt", "2026-09-20 10:00:00");
        row.put("candidates", List.of());
        return row;
    }

    private void stubTransferRow(List<String> myRoles, List<String> missingRoles) {
        when(opService.pending(any(), eq("transfer")))
                .thenReturn(List.of(transferRow(myRoles, missingRoles)));
    }

    private AiToolContext ctx() {
        return new AiToolContext(userOf(RoleEnum.ADMIN), 1L, 2L);
    }

    @Test
    @DisplayName("转移：身份不明确时**不挂起**，先把身份做成可点选选项 —— 绝不替用户挑身份")
    void transferWithoutRoleAsksIdentity() throws Exception {
        stubTransferRow(List.of("ORIGIN", "DEST", "VET"), List.of("ORIGIN", "DEST", "VET"));
        AiTool tool = tool("signCageTransfer");
        assertTrue(tool.hasPreConfirmResolve(), "转移是那个必须靠预解析问清身份的工具");

        Map<?, ?> m = (Map<?, ?>) tool.resolveBeforeConfirmOrNull(ctx(),
                om.readTree("{\"requestId\":\"42\",\"decision\":\"approved\"}"));

        assertNotNull(m, "有多个可签身份时必须先问，不能直接挂起");
        assertEquals(Boolean.FALSE, m.get("ok"));
        assertEquals(3, ((List<?>) m.get("choices")).size());
        assertTrue(String.valueOf(m.get("reason")).contains("让用户挑"));
        verify(opService, never()).review(any(), anyLong(), any(), any(), any());
    }

    @Test
    @DisplayName("转移：只有一个可签身份就不必问，直接进确认")
    void transferWithSingleRoleGoesToConfirm() throws Exception {
        stubTransferRow(List.of("VET"), List.of("VET"));
        Object pre = tool("signCageTransfer").resolveBeforeConfirmOrNull(ctx(),
                om.readTree("{\"requestId\":\"42\",\"decision\":\"approved\"}"));
        assertNull(pre, "只有一个身份时返回 null = 照常挂起等确认");
    }

    @Test
    @DisplayName("转移：暂缓/不同意必须带原因 —— 工具自己先挡住")
    void transferHeldWithoutReasonIsRefused() throws Exception {
        stubTransferRow(List.of("VET"), List.of("VET"));
        Map<?, ?> m = (Map<?, ?>) tool("signCageTransfer").executor().execute(ctx(),
                om.readTree("{\"requestId\":\"42\",\"decision\":\"held\"}"));

        assertEquals(Boolean.FALSE, m.get("ok"));
        assertTrue(String.valueOf(m.get("reason")).contains("原因"));
        verify(opService, never()).review(any(), anyLong(), any(), any(), any());
    }

    @Test
    @DisplayName("转移：不在本人可签身份里的 role 被挡（服务端还会再挡一次，这里先给好懂的话）")
    void transferWrongRoleIsRefused() throws Exception {
        stubTransferRow(List.of("VET"), List.of("VET"));
        Map<?, ?> m = (Map<?, ?>) tool("signCageTransfer").executor().execute(ctx(),
                om.readTree("{\"requestId\":\"42\",\"decision\":\"approved\",\"role\":\"ORIGIN\"}"));

        assertEquals(Boolean.FALSE, m.get("ok"));
        assertTrue(String.valueOf(m.get("reason")).contains("归属地"));
        verify(opService, never()).review(any(), anyLong(), any(), any(), any());
    }

    @Test
    @DisplayName("转移：签完一关**仍待签**时，文案必须说「还差谁」，绝不能写成「已通过」")
    void transferSignatureKeepsPendingWording() throws Exception {
        // 两次调用读的是同一张单的不同时刻：解析阶段（签之前）三个身份都能签，
        // 回读阶段（签之后）只剩目的地 —— 所以必须**连续返回**，不能重设 stub（后者会覆盖前者）。
        when(opService.pending(any(), eq("transfer")))
                .thenReturn(List.of(transferRow(List.of("ORIGIN", "DEST", "VET"), List.of("ORIGIN", "DEST", "VET"))))
                .thenReturn(List.of(transferRow(List.of("DEST"), List.of("DEST"))));
        when(opService.review(any(), anyLong(), any(), any(), any()))
                .thenReturn(Map.of("requestId", "42", "status", "pending"));

        Map<?, ?> m = (Map<?, ?>) tool("signCageTransfer").executor().execute(ctx(),
                om.readTree("{\"requestId\":\"42\",\"decision\":\"approved\",\"role\":\"VET\"}"));

        String note = String.valueOf(m.get("note"));
        assertEquals(Boolean.TRUE, m.get("ok"));
        assertTrue(note.contains("本单仍在待签"), "签一关不等于整单通过，文案必须点明还没完");
        assertTrue(note.contains("还差") && note.contains("目的地"), "要说清还差谁");
        assertFalse(note.contains("已通过"), "「已通过」在三签里是错的说法（旧单签链里它才是终局）");
        verify(opService).review(any(), anyLong(), eq("approved"), any(), eq("VET"));
    }

    @Test
    @DisplayName("转移：三关签齐那一签会真执行 —— 文案要说「已执行」")
    void transferLastSignatureReportsExecution() throws Exception {
        stubTransferRow(List.of("VET"), List.of("VET"));
        when(opService.review(any(), anyLong(), any(), any(), any()))
                .thenReturn(Map.of("requestId", "42", "status", "approved"));

        Map<?, ?> m = (Map<?, ?>) tool("signCageTransfer").executor().execute(ctx(),
                om.readTree("{\"requestId\":\"42\",\"decision\":\"approved\",\"role\":\"VET\"}"));

        String note = String.valueOf(m.get("note"));
        assertTrue(note.contains("转移已执行"), "最后一签要明确说已经执行");
        assertFalse(note.contains("仍在待签"));
    }

    @Test
    @DisplayName("转移：确认弹窗给人看的是「兽医」而不是内部码 VET")
    void transferConfirmDetailIsHumanReadable() throws Exception {
        String detail = tool("signCageTransfer")
                .confirmDetailOf(om.readTree("{\"role\":\"VET\",\"decision\":\"approved\"}"));
        assertTrue(detail.contains("兽医"));
        assertTrue(detail.contains("同意"));
        assertFalse(detail.contains("VET"), "内部码不该出现在给用户看的确认行里");
    }
}
