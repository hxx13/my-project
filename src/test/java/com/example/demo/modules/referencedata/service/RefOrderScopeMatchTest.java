package com.example.demo.modules.referencedata.service;

import com.example.demo.modules.referencedata.entity.RefOrder;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 订单归属判定（「本人课题组 ∪ 本人提交」）——详情/日志/按 groupId 列表三个端点的越权闸门。
 */
class RefOrderScopeMatchTest {

    private static RefOrder order(String submitterId, String projectGroupName) {
        RefOrder o = new RefOrder();
        o.setSubmitterId(submitterId);
        o.setProjectGroupName(projectGroupName);
        return o;
    }

    @Test
    void passesWhenSubmitterIsOneOfMyAccounts() {
        // submitter_id 记的是下单那一刻的账号，对偶账号集合里命中即可
        assertTrue(ReferenceDataService.matchesScope(
                order("STAFF_1", "别组"), List.of("本组"), List.of("STAFF_1", "ARO_1")));
    }

    @Test
    void passesWhenProjectGroupMatchesExactly() {
        assertTrue(ReferenceDataService.matchesScope(
                order("ARO_9", "实验一组"), List.of("实验一组"), List.of("STAFF_1")));
    }

    @Test
    void rejectsSubstringGroupNames() {
        // 精确匹配而非 LIKE：组名互为子串时不得跨组放行
        assertFalse(ReferenceDataService.matchesScope(
                order("ARO_9", "实验一组二区"), List.of("实验一组"), List.of("STAFF_1")));
    }

    @Test
    void rejectsWhenOutOfScopeOrMissing() {
        assertFalse(ReferenceDataService.matchesScope(
                order("ARO_9", "别组"), List.of("本组"), List.of("STAFF_1")));
        assertFalse(ReferenceDataService.matchesScope(null, List.of("本组"), List.of("STAFF_1")));
        assertFalse(ReferenceDataService.matchesScope(
                order(null, null), List.of("本组"), List.of("STAFF_1")));
    }
}
