package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 三签「还能签哪些角色」的回归测试（{@code CageOperationService.signableRoles}）。
 *
 * <p>这是把审核按钮按角色拆开的那次改动的判据核心：同一个操作人可能同时是归属地审核人、目的地审核人
 * 和名单兽医，三关都要他签。老逻辑只挑第一个（{@code roleOfReviewer}），UI 又不告诉用户「这次签的哪一关」，
 * 一次 通过 连按三次会静默签出三个不同角色。现在把整份列表下发，前端按角色分组出按钮。
 *
 * <p>不构造 {@link CageOperationService}（构造器 27 个依赖），直接测抽出来的静态纯函数。
 */
class CageOperationServiceSignableRolesTest {

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

    private static List<CageOpSignature> approved(String... roles) {
        return java.util.Arrays.stream(roles)
                .map(r -> sig(r, CageOpSignature.DECISION_APPROVED))
                .toList();
    }

    // ── 边界：非转移单 / 空请求恒空 ──────────────────────────────

    @Test
    void 请求为空_空列表() {
        assertEquals(List.of(), CageOperationService.signableRoles(false, true, true, null));
    }

    @Test
    void 分笼单_即使覆盖位置又是兽医_也空列表() {
        assertEquals(List.of(), CageOperationService.signableRoles(
                false, true, true, req(CageOpRequest.TYPE_DIVIDE, List.of())));
    }

    /**
     * 存量转移单（{@code signatures} 列为 NULL）走的是旧的单签链，一次通过就执行整笔。
     *
     * <p>2026-09-18 实测踩到：这类单也被下发了三个角色，界面画出「归属地/目的地/兽医」三个按钮，
     * 点其中任意一个（点的是归属地）都走旧链把整笔转移直接执行掉 —— 三签变一签，且没有任何提示。
     * 所以判据必须是 {@code usesThreeSignatures}，不能只看 opType。
     */
    @Test
    void 存量转移单_签名为NULL_不给任何角色() {
        CageOpRequest legacy = new CageOpRequest();
        legacy.setOpType(CageOpRequest.TYPE_TRANSFER);
        legacy.setSignatures(null);
        assertEquals(List.of(), CageOperationService.signableRoles(false, true, true, legacy));
        assertEquals(List.of(), CageOperationService.signableRoles(true, false, false, legacy));
    }

    // ── 覆盖位置的普通审核人：归属地→目的地，签完即空 ─────────────

    @Test
    void 覆盖位置_非兽医_先归属地后目的地() {
        assertEquals(List.of(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST),
                CageOperationService.signableRoles(false, true, false,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(List.of(CageOpSignature.ROLE_DEST),
                CageOperationService.signableRoles(false, true, false,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_ORIGIN))));
        assertEquals(List.of(),
                CageOperationService.signableRoles(false, true, false,
                        req(CageOpRequest.TYPE_TRANSFER,
                                approved(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST))));
    }

    // ── 覆盖位置 + 名单兽医：三关同列，一人签完 ─────────────────

    @Test
    void 覆盖位置_名单兽医_三关同时在列_签完为空() {
        assertEquals(List.of(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET),
                CageOperationService.signableRoles(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(List.of(CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET),
                CageOperationService.signableRoles(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_ORIGIN))));
        assertEquals(List.of(CageOpSignature.ROLE_VET),
                CageOperationService.signableRoles(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER,
                                approved(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST))));
        assertEquals(List.of(),
                CageOperationService.signableRoles(false, true, true,
                        req(CageOpRequest.TYPE_TRANSFER, approved(
                                CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET))));
    }

    // ── 名单兽医但不覆盖位置：只剩兽医 ─────────────────────────

    @Test
    void 名单兽医_不覆盖位置_只签兽医() {
        assertEquals(List.of(CageOpSignature.ROLE_VET),
                CageOperationService.signableRoles(false, false, true,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(List.of(),
                CageOperationService.signableRoles(false, false, true,
                        req(CageOpRequest.TYPE_TRANSFER, approved(CageOpSignature.ROLE_VET))));
    }

    // ── 暂缓不算同意：签了暂缓的角色仍可改判 ────────────────────

    @Test
    void 兽医关暂缓_仍在可签列表() {
        assertEquals(List.of(CageOpSignature.ROLE_VET),
                CageOperationService.signableRoles(false, false, true,
                        req(CageOpRequest.TYPE_TRANSFER, List.of(
                                sig(CageOpSignature.ROLE_VET, CageOpSignature.DECISION_HELD)))));
    }

    // ── 全局可见者：按展示顺序补缺，不受位置/兽医判据约束 ───────

    @Test
    void 全局可见者_按序补缺() {
        assertEquals(List.of(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET),
                CageOperationService.signableRoles(true, false, false,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
        assertEquals(List.of(CageOpSignature.ROLE_VET),
                CageOperationService.signableRoles(true, false, false,
                        req(CageOpRequest.TYPE_TRANSFER,
                                approved(CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST))));
        assertEquals(List.of(),
                CageOperationService.signableRoles(true, false, false,
                        req(CageOpRequest.TYPE_TRANSFER, approved(
                                CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET))));
    }

    // ── 无任何身份：空列表 ─────────────────────────────────────

    @Test
    void 既无位置也无兽医_空列表() {
        assertEquals(List.of(),
                CageOperationService.signableRoles(false, false, false,
                        req(CageOpRequest.TYPE_TRANSFER, List.of())));
    }
}
