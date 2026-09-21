package com.example.demo.modules.cageshelf.entity;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CageOpRequestTest {

    private static CageOpRequest req(String targetsJson) {
        CageOpRequest r = new CageOpRequest();
        r.setOpType(CageOpRequest.TYPE_TRANSFER);
        r.setSourceAnimalCageId(11L);
        r.setTargetAnimalCageIds(targetsJson);
        return r;
    }

    @Test
    void 解析目标笼位数组() {
        assertEquals(List.of(22L, 33L), req("[22,33]").targetIds());
    }

    @Test
    void 空或坏JSON_退回空集() {
        assertTrue(req(null).targetIds().isEmpty());
        assertTrue(req("").targetIds().isEmpty());
        assertTrue(req("不是JSON").targetIds().isEmpty());
    }

    @Test
    void 涉及的位置集合_源加全部目标_去重() {
        CageOpRequest r = req("[22,22,33]");
        assertEquals(List.of(11L, 22L, 33L), r.involvedCageIds());
    }

    @Test
    void 三签解析走实体入口() {
        CageOpRequest r = req("[22]");
        r.setSignatures(null);
        assertTrue(r.signatures().isEmpty());
    }
}
