package com.example.demo.modules.cageshelf.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CageOpSignaturesTest {

    private static CageOpSignature sig(String role, String decision) {
        CageOpSignature s = new CageOpSignature();
        s.setRole(role);
        s.setDecision(decision);
        s.setReviewerId("U_" + role);
        s.setReviewerName("张三");
        s.setAt("2026-09-18 10:00:00");
        return s;
    }

    @Test
    void 空签名_待签且三个角色都缺() {
        assertTrue(CageOpSignatures.parse(null).isEmpty());
        assertEquals(CageOpSignature.STATUS_PENDING, CageOpSignatures.statusOf(List.of()));
        assertEquals(List.of("ORIGIN", "DEST", "VET"), CageOpSignatures.missingRoles(List.of()));
    }

    @Test
    void 三关签齐_通过() {
        List<CageOpSignature> all = List.of(
                sig("ORIGIN", "approved"), sig("DEST", "approved"), sig("VET", "approved"));
        assertEquals(CageOpSignature.STATUS_APPROVED, CageOpSignatures.statusOf(all));
        assertTrue(CageOpSignatures.missingRoles(all).isEmpty());
    }

    @Test
    void 只差一关_仍是待签() {
        List<CageOpSignature> partial = List.of(sig("ORIGIN", "approved"), sig("DEST", "approved"));
        assertEquals(CageOpSignature.STATUS_PENDING, CageOpSignatures.statusOf(partial));
        assertEquals(List.of("VET"), CageOpSignatures.missingRoles(partial));
    }

    @Test
    void 任一关驳回_立即终局驳回_兽医的一票否决() {
        List<CageOpSignature> rejected = List.of(
                sig("ORIGIN", "approved"), sig("DEST", "approved"), sig("VET", "rejected"));
        assertEquals(CageOpSignature.STATUS_REJECTED, CageOpSignatures.statusOf(rejected));
    }

    @Test
    void 同角色重复签_后一条覆盖前一条而不是追加() {
        List<CageOpSignature> one = CageOpSignatures.withSignature(
                List.of(sig("ORIGIN", "approved")), sig("ORIGIN", "rejected"));
        assertEquals(1, one.size());
        assertEquals("rejected", one.get(0).getDecision());
    }

    @Test
    void JSON_往返不丢字段() {
        List<CageOpSignature> in = List.of(sig("VET", "approved"));
        List<CageOpSignature> out = CageOpSignatures.parse(CageOpSignatures.render(in));
        assertEquals(1, out.size());
        assertEquals("VET", out.get(0).getRole());
        assertEquals("approved", out.get(0).getDecision());
        assertEquals("张三", out.get(0).getReviewerName());
    }

    @Test
    void 坏JSON_退回空集而不是抛异常() {
        assertTrue(CageOpSignatures.parse("这不是JSON").isEmpty());
    }

    @Test
    void 渲染出的JSON保留reviewerId字段_供SQL按签名人判定() {
        // reviewed() 的 SQL 用 JSON_SEARCH(signatures,'one',reviewerId) 判定签名人；
        // 锁住 render 输出的 JSON 数组里每条签名的 reviewerId 原样可解析。
        CageOpSignature s = sig("ORIGIN", "approved");
        List<CageOpSignature> out = CageOpSignatures.parse(CageOpSignatures.render(List.of(s)));
        assertEquals("U_ORIGIN", out.get(0).getReviewerId());
    }

    @Test
    void 已签过的角色_hasRole为真() {
        List<CageOpSignature> one = List.of(sig("DEST", "approved"));
        assertTrue(CageOpSignatures.hasRole(one, "DEST"));
        assertFalse(CageOpSignatures.hasRole(one, "VET"));
    }

    @Test
    void 缺归属地_不算通过() {
        List<CageOpSignature> noOrigin = List.of(sig("DEST", "approved"), sig("VET", "approved"));
        assertEquals(CageOpSignature.STATUS_PENDING, CageOpSignatures.statusOf(noOrigin));
        assertEquals(List.of("ORIGIN"), CageOpSignatures.missingRoles(noOrigin));
    }

    @Test
    void 缺目的地_不算通过() {
        List<CageOpSignature> noDest = List.of(sig("ORIGIN", "approved"), sig("VET", "approved"));
        assertEquals(CageOpSignature.STATUS_PENDING, CageOpSignatures.statusOf(noDest));
        assertEquals(List.of("DEST"), CageOpSignatures.missingRoles(noDest));
    }

    @Test
    void 已驳回_没有还缺的角色() {
        List<CageOpSignature> rejected = List.of(sig("ORIGIN", "approved"), sig("VET", "rejected"));
        assertEquals(CageOpSignature.STATUS_REJECTED, CageOpSignatures.statusOf(rejected));
        assertTrue(CageOpSignatures.missingRoles(rejected).isEmpty());
    }

    @Test
    void render空_往返得到空集() {
        assertTrue(CageOpSignatures.parse(CageOpSignatures.render(null)).isEmpty());
    }

    @Test
    void 追加空签名_抛异常而不是静默忽略() {
        List<CageOpSignature> existing = List.of(sig("ORIGIN", "approved"));
        assertThrows(IllegalArgumentException.class,
                () -> CageOpSignatures.withSignature(existing, null));
    }

    @Test
    void 兽医暂缓_单据仍待审且兽医仍算未决() {
        List<CageOpSignature> held = List.of(
                sig("ORIGIN", "approved"), sig("DEST", "approved"), sig("VET", "held"));
        assertEquals(CageOpSignature.STATUS_PENDING, CageOpSignatures.statusOf(held));
        assertEquals(List.of("VET"), CageOpSignatures.missingRoles(held));
    }

    @Test
    void 暂缓后改判同意_三签齐全才通过() {
        List<CageOpSignature> held = List.of(
                sig("ORIGIN", "approved"), sig("DEST", "approved"), sig("VET", "held"));
        List<CageOpSignature> reSigned = CageOpSignatures.withSignature(held, sig("VET", "approved"));
        assertEquals(CageOpSignature.STATUS_APPROVED, CageOpSignatures.statusOf(reSigned));
        assertTrue(CageOpSignatures.missingRoles(reSigned).isEmpty());
    }

    @Test
    void 不同意仍是终局() {
        List<CageOpSignature> rejected = List.of(sig("ORIGIN", "approved"), sig("VET", "rejected"));
        assertEquals(CageOpSignature.STATUS_REJECTED, CageOpSignatures.statusOf(rejected));
        assertTrue(CageOpSignatures.missingRoles(rejected).isEmpty());
    }

    @Test
    void 三态取值_兽医未签返回null() {
        assertNull(CageOpSignatures.vetOutcomeOf(List.of()));
        assertNull(CageOpSignatures.vetOutcomeOf(List.of(sig("ORIGIN", "approved"))));
    }

    @Test
    void 三态取值_按签署返回三态() {
        assertEquals("approved", CageOpSignatures.vetOutcomeOf(List.of(sig("VET", "approved"))));
        assertEquals("held", CageOpSignatures.vetOutcomeOf(List.of(sig("VET", "held"))));
        assertEquals("rejected", CageOpSignatures.vetOutcomeOf(List.of(sig("VET", "rejected"))));
    }
}
