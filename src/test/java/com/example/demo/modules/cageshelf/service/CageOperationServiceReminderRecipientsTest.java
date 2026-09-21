package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 转移待签提醒的收件人判据（{@code CageOperationService.reminderRecipients}）。
 *
 * <p>不构造 {@link CageOperationService}（构造器 28 个依赖，起一套 mock 只为测一个布尔表达式不值当），
 * 直接测抽出来的静态纯函数 —— 提交时的待签提醒只走它一个入口。
 *
 * <p>口径：归属地未签→提醒覆盖源笼位的，目的地未签→提醒覆盖目标笼位的，兽医未签→提醒全局名单；
 * 暂缓（held）不算同意照常提醒；终局（通过/驳回）一律空。
 */
class CageOperationServiceReminderRecipientsTest {

    private static final Set<String> ORIGIN = Set.of("origin-1", "origin-2");
    private static final Set<String> DEST = Set.of("dest-1");
    private static final Set<String> VET = Set.of("vet-1");

    private static CageOpRequest req(List<CageOpSignature> signatures) {
        CageOpRequest r = new CageOpRequest();
        r.setOpType(CageOpRequest.TYPE_TRANSFER);
        r.setSignatures(CageOpSignatures.render(signatures));
        return r;
    }

    private static CageOpSignature sig(String role, String decision) {
        CageOpSignature s = new CageOpSignature();
        s.setRole(role);
        s.setDecision(decision);
        return s;
    }

    /** 三关都没签：归属地、目的地、兽医的审核人全都要提醒。 */
    @Test
    void 三关未签_全部提醒() {
        assertEquals(Set.of("origin-1", "origin-2", "dest-1", "vet-1"),
                CageOperationService.reminderRecipients(ORIGIN, DEST, VET, req(List.of())));
    }

    /** 归属地已同意：归属地那批不再提醒，目的地与兽医仍未签、照提醒。 */
    @Test
    void 归属地已同意_只提醒目的地和兽医() {
        assertEquals(Set.of("dest-1", "vet-1"),
                CageOperationService.reminderRecipients(ORIGIN, DEST, VET, req(List.of(
                        sig(CageOpSignature.ROLE_ORIGIN, CageOpSignature.DECISION_APPROVED)))));
    }

    /** 暂缓不算同意：归属地暂缓了，归属地那批照旧提醒（能回来改判）。 */
    @Test
    void 归属地暂缓_仍提醒() {
        assertEquals(Set.of("origin-1", "origin-2", "dest-1", "vet-1"),
                CageOperationService.reminderRecipients(ORIGIN, DEST, VET, req(List.of(
                        sig(CageOpSignature.ROLE_ORIGIN, CageOpSignature.DECISION_HELD)))));
    }

    /** 任一驳回即终局：单据定了，谁都不再提醒。 */
    @Test
    void 任一驳回终局_没人提醒() {
        assertEquals(Set.of(),
                CageOperationService.reminderRecipients(ORIGIN, DEST, VET, req(List.of(
                        sig(CageOpSignature.ROLE_ORIGIN, CageOpSignature.DECISION_REJECTED)))));
    }

    /** 三关全通过：单据定了，没人提醒。 */
    @Test
    void 三关全通过_没人提醒() {
        assertEquals(Set.of(),
                CageOperationService.reminderRecipients(ORIGIN, DEST, VET, req(List.of(
                        sig(CageOpSignature.ROLE_ORIGIN, CageOpSignature.DECISION_APPROVED),
                        sig(CageOpSignature.ROLE_DEST, CageOpSignature.DECISION_APPROVED),
                        sig(CageOpSignature.ROLE_VET, CageOpSignature.DECISION_APPROVED)))));
    }
}
