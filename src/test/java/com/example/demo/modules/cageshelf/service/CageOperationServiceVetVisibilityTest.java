package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 待审可见性的「兽医」那条腿（{@code CageOperationService.vetCanSeePending}）。
 *
 * <p>这是当初让整个三签功能变成死关的那个 bug 的回归测试：兽医名单是全局的，可见性却只按区域收口，
 * 区域外的兽医永远看不到待签的转移单，「兽医」那一关没人能签，三签塌成两签。
 *
 * <p>不构造 {@link CageOperationService}（构造器 27 个依赖，起一套 mock 只为测一个布尔表达式不值当），
 * 直接测抽出来的静态纯函数 —— 它是 {@code pending()} 与 {@code TransferFormService.canView} 共用的唯一判据。
 */
class CageOperationServiceVetVisibilityTest {

    private static CageOpRequest req(String opType, List<CageOpSignature> signatures) {
        CageOpRequest r = new CageOpRequest();
        r.setOpType(opType);
        r.setSignatures(CageOpSignatures.render(signatures));
        return r;
    }

    private static CageOpSignature sig(String role, String decision) {
        CageOpSignature s = new CageOpSignature();
        s.setRole(role);
        s.setDecision(decision);
        return s;
    }

    @Test
    void 名单兽医_没签过兽医关的转移单_可见() {
        assertTrue(CageOperationService.vetCanSeePending(
                true, req(CageOpRequest.TYPE_TRANSFER, List.of())));
    }

    @Test
    void 名单兽医_其他关签了但兽医关未签_仍可见() {
        assertTrue(CageOperationService.vetCanSeePending(
                true, req(CageOpRequest.TYPE_TRANSFER, List.of(
                        sig(CageOpSignature.ROLE_ORIGIN, CageOpSignature.DECISION_APPROVED),
                        sig(CageOpSignature.ROLE_DEST, CageOpSignature.DECISION_APPROVED)))));
    }

    @Test
    void 名单兽医_兽医关已同意_不再出现() {
        assertFalse(CageOperationService.vetCanSeePending(
                true, req(CageOpRequest.TYPE_TRANSFER, List.of(
                        sig(CageOpSignature.ROLE_VET, CageOpSignature.DECISION_APPROVED)))));
    }

    /** 暂缓不算同意：单据还在待签，兽医要能回来改判。 */
    @Test
    void 名单兽医_兽医关暂缓_仍可见() {
        assertTrue(CageOperationService.vetCanSeePending(
                true, req(CageOpRequest.TYPE_TRANSFER, List.of(
                        sig(CageOpSignature.ROLE_VET, CageOpSignature.DECISION_HELD)))));
    }

    /** 分笼不放开：兽医只参与转移审批，别顺手把分笼也漏给他。 */
    @Test
    void 名单兽医_分笼单_不可见() {
        assertFalse(CageOperationService.vetCanSeePending(
                true, req(CageOpRequest.TYPE_DIVIDE, List.of())));
    }

    @Test
    void 非名单兽医_转移单_不可见() {
        assertFalse(CageOperationService.vetCanSeePending(
                false, req(CageOpRequest.TYPE_TRANSFER, List.of())));
    }

    @Test
    void 请求为空_不可见() {
        assertFalse(CageOperationService.vetCanSeePending(true, null));
    }

    /**
     * 存量转移单（`signatures` 列为 NULL）走旧单签链，兽医没有那一关。
     *
     * <p>判据若只看 opType，全局兽医会被拉进这类单的可见范围、能下载 PDF（含课题组/AUP/动物数据），
     * 而他在单上一个角色都没有 —— 看得见、动不了、还多暴露一份数据。判据与三签同源才对。
     */
    @Test
    void 名单兽医_存量转移单_不可见() {
        CageOpRequest legacy = new CageOpRequest();
        legacy.setOpType(CageOpRequest.TYPE_TRANSFER);
        legacy.setSignatures(null);
        assertFalse(CageOperationService.vetCanSeePending(true, legacy));
    }

    // ── roleOfReviewer：三关可以同一个人签完 ──────────────────────────────

    private static List<CageOpSignature> approved(String... roles) {
        return java.util.Arrays.stream(roles)
                .map(r -> sig(r, CageOpSignature.DECISION_APPROVED))
                .toList();
    }

    /** 覆盖位置但不在兽医名单：签完归属地、目的地就没人可签了。 */
    @Test
    void 非兽医_覆盖位置_先归属地再目的地再完() {
        assertEquals(CageOpSignature.ROLE_ORIGIN,
                CageOperationService.roleOfReviewer(false, true, false,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(CageOpSignature.ROLE_DEST,
                CageOperationService.roleOfReviewer(false, true, false,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_ORIGIN))));
        assertEquals(null,
                CageOperationService.roleOfReviewer(false, true, false,
                        req(CageOpRequest.TYPE_TRANSFER,
                                approved(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST))));
    }

    /** 回归：覆盖位置的名单兽医，两关签完后必须还能签兽医关（早先这里 return null 把单子卡死）。 */
    @Test
    void 名单兽医_覆盖位置_三关都能签() {
        assertEquals(CageOpSignature.ROLE_ORIGIN,
                CageOperationService.roleOfReviewer(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(CageOpSignature.ROLE_DEST,
                CageOperationService.roleOfReviewer(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_ORIGIN))));
        assertEquals(CageOpSignature.ROLE_VET,
                CageOperationService.roleOfReviewer(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER,
                                approved(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST))));
        assertEquals(null,
                CageOperationService.roleOfReviewer(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_ORIGIN,
                                CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET))));
    }

    /** 名单兽医但不覆盖位置：只剩兽医关可签。 */
    @Test
    void 名单兽医_不覆盖位置_只签兽医() {
        assertEquals(CageOpSignature.ROLE_VET,
                CageOperationService.roleOfReviewer(false, false, true,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(null,
                CageOperationService.roleOfReviewer(false, false, true,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_VET))));
    }

    /** 全局可见者：按展示顺序补第一个还没同意的角色，签齐返回 null。 */
    @Test
    void 全局可见者_按序补缺_签齐为null() {
        assertEquals(CageOpSignature.ROLE_ORIGIN,
                CageOperationService.roleOfReviewer(true, false, false,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(CageOpSignature.ROLE_DEST,
                CageOperationService.roleOfReviewer(true, false, false,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_ORIGIN))));
        assertEquals(CageOpSignature.ROLE_VET,
                CageOperationService.roleOfReviewer(true, false, false,
                        req(CageOpRequest.TYPE_TRANSFER,
                                approved(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST))));
        assertEquals(null,
                CageOperationService.roleOfReviewer(true, false, false,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_ORIGIN,
                                CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET))));
    }
}
