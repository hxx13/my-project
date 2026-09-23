package com.example.demo.modules.referencedata.service;

import com.example.demo.modules.referencedata.dto.RefOrderQuery;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 「只导本周期」导出筛选的折算契约。
 *
 * <p>只测纯函数 {@link ReferenceDataService#applyCurrentCycleOnly}：它的核心不变式是
 * 强制排除预约单（is_preorder 是永久标记，不能靠日期推断），并把本周期日期写进 cycles。
 * SQL 侧（EXISTS ... delivery_cycle IN / IS NULL）交给集成环境。
 */
class AnimalOrderExportCycleFilterTest {

    @Test
    void 本周期强制排除预约单_即便用户之前筛了仅预约() {
        RefOrderQuery q = new RefOrderQuery();
        q.setIsPreorder(1);
        ReferenceDataService.applyCurrentCycleOnly(q, List.of(LocalDate.of(2026, 9, 25)));
        assertEquals(Integer.valueOf(0), q.getIsPreorder());
    }

    @Test
    void 本周期写入各校区日期() {
        RefOrderQuery q = new RefOrderQuery();
        List<LocalDate> dates = List.of(LocalDate.of(2026, 9, 25), LocalDate.of(2026, 9, 26));
        ReferenceDataService.applyCurrentCycleOnly(q, dates);
        assertEquals(dates, q.getCycles());
    }
}
