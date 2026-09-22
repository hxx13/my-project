package com.example.demo.modules.supplies.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 领用单单号与日期口径（纯静态助手，不起 Spring 上下文 —— 与转移单的
 * {@code TransferFormFileNameTest} 同一套写法）。
 */
class SupplyClaimFormServiceTest {

    /** 单号 = 出库日期 + 申请人 + 第几单。 */
    @Test
    void 单号_日期加姓名加序号() {
        assertEquals("20260923-位亚磊-1", SupplyClaimFormService.composeDocNo("20260923", "位亚磊", 1));
        assertEquals("20260923-位亚磊-3", SupplyClaimFormService.composeDocNo("20260923", "位亚磊", 3));
        // 序号小于 1 一律夹到 1：单号里出现 -0 会让人以为漏了号
        assertEquals("20260923-位亚磊-1", SupplyClaimFormService.composeDocNo("20260923", "位亚磊", 0));
    }

    @Test
    void 单号剔掉路径分隔符与控制字符() {
        String no = SupplyClaimFormService.composeDocNo("20260923", "a/b\\c:d*e?f\"g<h>i|j", 1);
        assertEquals("20260923-abcdefghij-1", no);
    }

    @Test
    void 申请人缺失_只留日期与序号() {
        assertEquals("20260923-1", SupplyClaimFormService.composeDocNo("20260923", null, 1));
    }

    /** 印在单子上的日期是 ISO（{@code 2026-09-23}）；取不到返回 null，那一栏留空。 */
    @Test
    void 日期_印ISO_取不到留空() {
        assertEquals("2026-09-23", SupplyClaimFormService.date(LocalDateTime.of(2026, 9, 23, 15, 18, 27)));
        assertNull(SupplyClaimFormService.date(null), "没出库就没有实际领用日期，留空而不是编一个");
    }

    /** 单号里的日期键是无分隔的 {@code 20260923}（同一天的单子排一起）。 */
    @Test
    void 日期键_无分隔() {
        assertEquals("20260923", SupplyClaimFormService.dayKey(LocalDateTime.of(2026, 9, 23, 0, 5, 0)));
        assertNull(SupplyClaimFormService.dayKey(null));
    }
}
