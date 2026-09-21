package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 转移审核通知里「源/目标笼位」id 的 pair 感知提取（{@code CageOperationService.notificationSourceIds / notificationTargetIds}）。
 *
 * <p>bug 根因：pairs 一张单可带多个源，但通知渲染只读老列单源 {@code source_animal_cage_id}（= pairs[0].source），
 * 源行只列出一个笼位。这里验证源按 pair 去重保序、目标按 pair 顺序、无 pairs 的存量单退回老列。
 */
class CageOperationServiceNotificationLocationIdsTest {

    private static CageOpRequest withPairs(String pairsJson) {
        CageOpRequest r = new CageOpRequest();
        r.setOpType(CageOpRequest.TYPE_TRANSFER);
        r.setPairs(pairsJson);
        return r;
    }

    private static CageOpRequest legacy(Long source, String targetsJson) {
        CageOpRequest r = new CageOpRequest();
        r.setOpType(CageOpRequest.TYPE_TRANSFER);
        r.setSourceAnimalCageId(source);
        r.setTargetAnimalCageIds(targetsJson);
        return r;
    }

    @Test
    void 两对两源_按pair顺序列出两个源() {
        CageOpRequest r = withPairs("[{\"source\":11,\"target\":21},{\"source\":12,\"target\":22}]");
        assertEquals(List.of(11L, 12L), CageOperationService.notificationSourceIds(r));
    }

    @Test
    void 两对同源_源只出现一次() {
        CageOpRequest r = withPairs("[{\"source\":11,\"target\":21},{\"source\":11,\"target\":22}]");
        assertEquals(List.of(11L), CageOperationService.notificationSourceIds(r));
    }

    @Test
    void 无pairs存量单_退回老列单源() {
        assertEquals(List.of(11L), CageOperationService.notificationSourceIds(legacy(11L, "[21,22]")));
    }

    @Test
    void 目标_两对_按顺序列出两个目标() {
        CageOpRequest r = withPairs("[{\"source\":11,\"target\":21},{\"source\":12,\"target\":22}]");
        assertEquals(List.of(21L, 22L), CageOperationService.notificationTargetIds(r));
    }

    @Test
    void 目标_无pairs存量单_退回老列数组() {
        assertEquals(List.of(21L, 22L), CageOperationService.notificationTargetIds(legacy(11L, "[21,22]")));
    }
}
