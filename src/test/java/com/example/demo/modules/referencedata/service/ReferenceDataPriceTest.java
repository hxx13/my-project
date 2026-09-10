package com.example.demo.modules.referencedata.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ReferenceDataPriceTest {

    private static Map<String, Object> fd(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }

    @Test
    void resolveUnitPrice_disabled_returnsNull() {
        // 未开启价格：即便配了价也不返回
        assertNull(ReferenceDataService.resolveUnitPrice(fd("priceEnabled", false, "price", 85), null));
        assertNull(ReferenceDataService.resolveUnitPrice(fd("price", 85), null));
        assertNull(ReferenceDataService.resolveUnitPrice(null, null));
    }

    @Test
    void resolveUnitPrice_noSpec_usesFlatPrice() {
        assertEquals(new BigDecimal("85.00"),
                ReferenceDataService.resolveUnitPrice(fd("priceEnabled", true, "price", 85), null));
        assertEquals(new BigDecimal("12.50"),
                ReferenceDataService.resolveUnitPrice(fd("priceEnabled", true, "price", "12.5"), null));
        // 配价为 0 是合法值，不能被当成缺失
        assertEquals(new BigDecimal("0.00"),
                ReferenceDataService.resolveUnitPrice(fd("priceEnabled", true, "price", 0), null));
    }

    @Test
    void resolveUnitPrice_withSpec_matchesOptionKey() {
        Map<String, Object> f = fd("priceEnabled", true,
                "specPrices", fd("性别: 雌性", 80, "性别: 雄性", 75));
        assertEquals(new BigDecimal("80.00"), ReferenceDataService.resolveUnitPrice(f, "性别: 雌性"));
        assertEquals(new BigDecimal("75.00"), ReferenceDataService.resolveUnitPrice(f, "性别: 雄性"));
    }

    @Test
    void resolveUnitPrice_specConfiguredButOptionMissing_returnsNull() {
        Map<String, Object> f = fd("priceEnabled", true, "specPrices", fd("性别: 雌性", 80));
        // 有规格价但该规格未定价 → null（前端显示「待定」，不按 0 处理）
        assertNull(ReferenceDataService.resolveUnitPrice(f, "性别: 雄性"));
        assertNull(ReferenceDataService.resolveUnitPrice(f, null));
    }

    @Test
    void resolveUnitPrice_specPricesEmpty_fallsBackToFlatPrice() {
        assertEquals(new BigDecimal("30.00"),
                ReferenceDataService.resolveUnitPrice(
                        fd("priceEnabled", true, "specPrices", new HashMap<>(), "price", 30), null));
    }

    @Test
    void lineAmount_multipliesAndRounds() {
        assertEquals(new BigDecimal("240.00"),
                ReferenceDataService.lineAmount(new BigDecimal("80"), 3));
        assertEquals(new BigDecimal("0.00"),
                ReferenceDataService.lineAmount(new BigDecimal("80"), 0));
        // 单价缺失 → null，不返回 0
        assertNull(ReferenceDataService.lineAmount(null, 5));
        // 两位小数四舍五入
        assertEquals(new BigDecimal("37.50"),
                ReferenceDataService.lineAmount(new BigDecimal("12.5"), 3));
    }
}
