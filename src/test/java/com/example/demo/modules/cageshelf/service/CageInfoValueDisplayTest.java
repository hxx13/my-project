package com.example.demo.modules.cageshelf.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 读表单时的显示加工（{@code CageInfoValueService.getInfo}）。
 *
 * <p>目前只有「使用时间」一项：值来自 ARO 笼盒的 {@code createTime}，是完整时间戳，
 * 笼位详情表单上只要日期。用户 2026-09-22 要求「舍弃掉当日的具体时间，只保留日期」。
 */
class CageInfoValueDisplayTest {

    @Test
    void 使用时间只留日期() {
        assertEquals("2026-09-18", CageInfoValueService.dateOnly("2026-09-18 15:18:27"));
        assertEquals("2026-07-29", CageInfoValueService.dateOnly("2026-07-29 09:45:20"));
    }

    /** 本来就只有日期、或是别的什么写法，一律原样返回 —— 别把认不出的值裁坏。 */
    @Test
    void 认不出的值原样返回() {
        assertEquals("2026-09-18", CageInfoValueService.dateOnly("2026-09-18"));
        assertEquals("2026/09/18", CageInfoValueService.dateOnly("2026/09/18"));
        assertEquals("待补", CageInfoValueService.dateOnly("待补"));
        assertEquals("2026-9", CageInfoValueService.dateOnly("2026-9"));
        assertEquals("", CageInfoValueService.dateOnly(""));
    }

    @Test
    void 空值仍是空值() {
        assertNull(CageInfoValueService.dateOnly(null));
    }
}
