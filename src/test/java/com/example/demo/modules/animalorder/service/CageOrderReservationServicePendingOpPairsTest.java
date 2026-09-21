package com.example.demo.modules.animalorder.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** 分笼/转移在审（中间态）占住的笼位：多源批量单必须把每个 pair 的源与目标都锁住。 */
class CageOrderReservationServicePendingOpPairsTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static Set<Long> idsOf(CageOpRequest req) throws Exception {
        Set<Long> out = new LinkedHashSet<>();
        CageOrderReservationService.addPendingOpCageIds(out, req, OM);
        return out;
    }

    @Test
    void 两源批量单_两个源与目标都锁住() throws Exception {
        CageOpRequest req = new CageOpRequest();
        req.setSourceAnimalCageId(11L);
        req.setTargetAnimalCageIds("[22]");
        req.setPairs("[{\"source\":11,\"target\":22},{\"source\":12,\"target\":23}]");
        assertEquals(Set.of(11L, 22L, 12L, 23L), idsOf(req));
    }

    @Test
    void 单源多目标_源只锁一次() throws Exception {
        CageOpRequest req = new CageOpRequest();
        req.setSourceAnimalCageId(11L);
        req.setTargetAnimalCageIds("[22,33]");
        req.setPairs("[{\"source\":11,\"target\":22},{\"source\":11,\"target\":33}]");
        assertEquals(Set.of(11L, 22L, 33L), idsOf(req));
    }

    @Test
    void 存量单无pairs_退老列行为() throws Exception {
        CageOpRequest req = new CageOpRequest();
        req.setSourceAnimalCageId(11L);
        req.setTargetAnimalCageIds("[22,33]");
        assertEquals(Set.of(11L, 22L, 33L), idsOf(req));
    }
}
