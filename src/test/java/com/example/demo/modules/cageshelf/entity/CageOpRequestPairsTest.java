package com.example.demo.modules.cageshelf.entity;

import com.example.demo.modules.cageshelf.service.CageOpPair;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CageOpRequestPairsTest {

    private static CageOpRequest req(String pairsJson) {
        CageOpRequest r = new CageOpRequest();
        r.setPairs(pairsJson);
        return r;
    }

    @Test
    void 解析多组源目标对() {
        List<CageOpPair> pairs = req("[{\"source\":11,\"target\":22},{\"source\":11,\"target\":33}]").pairs();
        assertEquals(2, pairs.size());
        assertEquals(11L, pairs.get(0).getSource());
        assertEquals(22L, pairs.get(0).getTarget());
        assertEquals(11L, pairs.get(1).getSource());
        assertEquals(33L, pairs.get(1).getTarget());
    }

    @Test
    void 空或坏JSON_退回空集() {
        assertTrue(req(null).pairs().isEmpty());
        assertTrue(req("").pairs().isEmpty());
        assertTrue(req("   ").pairs().isEmpty());
        assertTrue(req("不是JSON").pairs().isEmpty());
    }

    @Test
    void 全部源目标id_保序去重() {
        assertEquals(
                List.of(11L, 22L, 33L),
                req("[{\"source\":11,\"target\":22},{\"source\":11,\"target\":33},{\"source\":22,\"target\":11}]")
                        .pairCageIds());
    }
}
