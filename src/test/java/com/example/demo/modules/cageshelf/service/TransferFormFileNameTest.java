package com.example.demo.modules.cageshelf.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 转移单「单号」的回归测试。
 *
 * <p>2026-09-18 用户口径：单号 = **表中拟定的转移日期** + 转移单的实验员姓名 + 编号，
 * 编号用来区分同一天同一个人的多单。它只是给人看的名字，主键仍是 {@code cage_op_request.id}。
 *
 * <p>编号**恒带**（第一单也是 -1）：只在多单时才编号的话，第一单的号会随第二单出现而变，
 * 已经打印出去的单号就对不上了。
 */
class TransferFormFileNameTest {

    @Test
    void 单号_拟转移日期加实验员加编号() {
        assertEquals("20260920-位亚磊-1", TransferFormService.composeDocNo("20260920", "位亚磊", 1));
        assertEquals("20260920-位亚磊-3", TransferFormService.composeDocNo("20260920", "位亚磊", 3));
        assertEquals("20260921-林安顺-1", TransferFormService.composeDocNo("20260921", "林安顺", 1));
    }

    @Test
    void 日期写法归一_横杠斜杠点都能认() {
        assertEquals("20260920", TransferFormService.normalizeDate("2026-09-20"));
        assertEquals("20260920", TransferFormService.normalizeDate("2026/09/20"));
        assertEquals("20260920", TransferFormService.normalizeDate("2026.09.20"));
        assertEquals("20260920", TransferFormService.normalizeDate("20260920"));
        // 提交时间是 yyyy-MM-dd HH:mm:ss，取前 8 位数字就是自然日
        assertEquals("20260918", TransferFormService.normalizeDate("2026-09-18 19:41:38"));
    }

    @Test
    void 日期认不出_返回null让调用方退回提交日() {
        assertNull(TransferFormService.normalizeDate(null));
        assertNull(TransferFormService.normalizeDate(""));
        assertNull(TransferFormService.normalizeDate("  "));
        // 数字不足 8 位（学生手打成 2026-9-2）认不出，宁可退回提交日也不要错号
        assertNull(TransferFormService.normalizeDate("2026-9-2"));
    }

    @Test
    void dayOf_取不到提交时间就退回今天() {
        assertEquals("20260918", TransferFormService.dayOf("2026-09-18 19:41:38"));
        String today = java.time.LocalDate.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"));
        assertEquals(today, TransferFormService.dayOf(null));
        assertEquals(today, TransferFormService.dayOf("不是日期"));
    }

    @Test
    void 单号剔掉路径分隔符与控制字符() {
        String n = TransferFormService.composeDocNo("20260920", "a/b\\c:d*e?f\"g<h>i|j", 1);
        assertEquals("20260920-abcdefghij-1", n);
        assertFalse(n.contains("/"), "不能带路径分隔符");
        assertFalse(n.contains("\\"), "不能带路径分隔符");
    }

    @Test
    void 实验员缺失_只留日期与编号() {
        String n = TransferFormService.composeDocNo("20260920", null, 2);
        assertEquals("20260920-2", n);
        assertFalse(n.endsWith(".pdf"), "单号本身不带扩展名，加扩展名是 displayFileName 的事");
    }

    @Test
    void 日期缺失_退回今天而不是拼出一个半截号() {
        String today = java.time.LocalDate.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"));
        assertEquals(today + "-位亚磊-1", TransferFormService.composeDocNo(null, "位亚磊", 1));
        assertEquals(today + "-位亚磊-1", TransferFormService.composeDocNo("  ", "位亚磊", 1));
    }

    @Test
    void 编号小于1_夹到1() {
        assertEquals("20260920-位亚磊-1", TransferFormService.composeDocNo("20260920", "位亚磊", 0));
        assertTrue(TransferFormService.composeDocNo("20260920", "位亚磊", -5).endsWith("-1"));
    }
}
