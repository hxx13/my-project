package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 显式 pair 列表提交：组装成一笔请求 + 未决占用覆盖 pairs 里的全部源/目标。
 *
 * <p>不构造 {@link CageOperationService}（构造器 27 个依赖），直接测抽出来的
 * {@code buildTransferRequest} 静态纯函数与 {@code pendingOccupiedCages} 静态判定。
 */
class CageOperationServiceBuildTransferRequestTest {

    private static CageOpPair pair(long s, long t) {
        CageOpPair p = new CageOpPair();
        p.setSource(s);
        p.setTarget(t);
        return p;
    }

    @Test
    void 显式pairs_组装成一笔请求_老列从首对源与全部目标回填() {
        CageOpRequest r = CageOperationService.buildTransferRequest(
                List.of(pair(11, 22), pair(12, 23)), "合并", null);

        assertEquals(CageOpRequest.TYPE_TRANSFER, r.getOpType());
        assertEquals(11L, r.getSourceAnimalCageId());
        assertEquals(List.of(22L, 23L), r.targetIds());
        assertEquals(2, r.pairs().size());
        assertEquals(11L, r.pairs().get(0).getSource());
        assertEquals(22L, r.pairs().get(0).getTarget());
        assertEquals(12L, r.pairs().get(1).getSource());
        assertEquals(23L, r.pairs().get(1).getTarget());
        assertEquals(Boolean.FALSE, r.getKeepSource());
        assertEquals("合并", r.getReason());
    }

    @Test
    void 未决占用_覆盖pairs里的全部源与目标() {
        CageOpRequest r = CageOperationService.buildTransferRequest(
                List.of(pair(11, 22), pair(12, 23)), null, null);
        assertEquals(Set.of(11L, 22L, 12L, 23L),
                CageOperationService.pendingOccupiedCages(List.of(r), null));
    }

    @Test
    void 未决占用_排除自身请求() {
        CageOpRequest r = CageOperationService.buildTransferRequest(
                List.of(pair(11, 22), pair(12, 23)), null, null);
        r.setId(7L);
        assertTrue(CageOperationService.pendingOccupiedCages(List.of(r), 7L).isEmpty());
    }
}
