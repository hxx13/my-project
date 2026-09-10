package com.example.demo.modules.referencedata.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** ARO → 本地的状态与校区映射（导入的核心口径，改动即影响上万条历史单）。 */
class AroOrderImportMappingTest {

    @Test
    void mapStatus_knownStates() {
        assertEquals("PENDING", AroOrderImportService.mapStatus("待动科部审批下单"));
        assertEquals("APPROVED", AroOrderImportService.mapStatus("审批通过"));
        assertEquals("REJECTED", AroOrderImportService.mapStatus("审批不通过"));
        assertEquals("CANCELLED", AroOrderImportService.mapStatus("已取消"));
        assertEquals("COMPLETED", AroOrderImportService.mapStatus("已到货"));
    }

    @Test
    void mapStatus_blankAndUnknownGoCompleted() {
        // 空状态是 2024 及更早的历史单（占比约六成，绝大多数已有到货日期），
        // 归到「已完成」；若归 PENDING 会把早已交付的单灌进待审列表。
        assertEquals("COMPLETED", AroOrderImportService.mapStatus(""));
        assertEquals("COMPLETED", AroOrderImportService.mapStatus("   "));
        assertEquals("COMPLETED", AroOrderImportService.mapStatus(null));
        assertEquals("COMPLETED", AroOrderImportService.mapStatus("某个未来新增的状态"));
    }

    @Test
    void mapStatus_trimsWhitespace() {
        assertEquals("APPROVED", AroOrderImportService.mapStatus("  审批通过  "));
    }

    @Test
    void normalizeCampus_mapsAroAreaNames() {
        assertEquals("浦西", AroOrderImportService.normalizeCampus("浦西"));
        assertEquals("浦西", AroOrderImportService.normalizeCampus("6号楼"));
        assertEquals("浦东", AroOrderImportService.normalizeCampus("浦东"));
    }

    @Test
    void normalizeCampus_defaultsToPudong() {
        assertEquals("浦东", AroOrderImportService.normalizeCampus(""));
        assertEquals("浦东", AroOrderImportService.normalizeCampus(null));
        assertEquals("浦东", AroOrderImportService.normalizeCampus("未知校区"));
    }
}
