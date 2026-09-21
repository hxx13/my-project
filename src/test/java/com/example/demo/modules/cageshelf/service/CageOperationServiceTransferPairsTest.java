package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 转移「源→目标」对的反推与去重源集合（{@code CageOperationService.transferPairs / transferSourceIds}）。
 *
 * <p>不构造 {@link CageOperationService}（构造器 27 个依赖），直接测抽出来的静态纯函数 ——
 * 它们是 {@code executeTransfer()} 唯一的数据来源：新单直接用 pairs，存量单按老列反推。
 */
class CageOperationServiceTransferPairsTest {

    private static CageOpRequest legacy(String targetsJson) {
        CageOpRequest r = new CageOpRequest();
        r.setOpType(CageOpRequest.TYPE_TRANSFER);
        r.setSourceAnimalCageId(11L);
        r.setTargetAnimalCageIds(targetsJson);
        return r;
    }

    @Test
    void 存量单无pairs_按老列反推_去重排序成对() {
        List<CageOpPair> pairs = CageOperationService.transferPairs(legacy("[33,22,22]"));
        assertEquals(2, pairs.size());
        assertEquals(11L, pairs.get(0).getSource());
        assertEquals(22L, pairs.get(0).getTarget());
        assertEquals(11L, pairs.get(1).getSource());
        assertEquals(33L, pairs.get(1).getTarget());
    }

    @Test
    void 存量单目标损坏_抛400() {
        assertThrows(TwinBusinessException.class,
                () -> CageOperationService.transferPairs(legacy("不是JSON")));
    }

    @Test
    void 存量单无目标_返回空() {
        assertTrue(CageOperationService.transferPairs(legacy(null)).isEmpty());
        assertTrue(CageOperationService.transferPairs(legacy("")).isEmpty());
    }

    @Test
    void 新单有pairs_直接用pairs() {
        CageOpRequest r = new CageOpRequest();
        r.setPairs("[{\"source\":11,\"target\":22},{\"source\":12,\"target\":23}]");
        List<CageOpPair> pairs = CageOperationService.transferPairs(r);
        assertEquals(2, pairs.size());
        assertEquals(11L, pairs.get(0).getSource());
        assertEquals(12L, pairs.get(1).getSource());
        assertEquals(23L, pairs.get(1).getTarget());
    }

    @Test
    void 源集合_多源去重保序() {
        CageOpRequest r = new CageOpRequest();
        r.setPairs("[{\"source\":11,\"target\":22},{\"source\":12,\"target\":23},{\"source\":11,\"target\":24}]");
        assertEquals(List.of(11L, 12L), CageOperationService.transferSourceIds(r));
    }

    @Test
    void 源集合_单源重复_只一个源() {
        CageOpRequest r = new CageOpRequest();
        r.setPairs("[{\"source\":11,\"target\":22},{\"source\":11,\"target\":23},{\"source\":11,\"target\":24}]");
        assertEquals(List.of(11L), CageOperationService.transferSourceIds(r));
    }

    @Test
    void 源集合_存量单_只有老列的源() {
        assertEquals(List.of(11L), CageOperationService.transferSourceIds(legacy("[22,33]")));
    }
}
