package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.dto.TransferFormData;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class TransferFormRendererTest {

    @Test
    void 盒数等于转移的笼位数() {
        assertEquals(1, TransferFormRenderer.boxCount(1));
        assertEquals(3, TransferFormRenderer.boxCount(3));
        assertEquals(0, TransferFormRenderer.boxCount(0));
        assertEquals(0, TransferFormRenderer.boxCount(-2));
    }

    @Test
    void 人工改过的值优先于自动值() {
        TransferFormData data = new TransferFormData();
        data.setRows(List.of(new TransferFormData.Row("B6", 3, 5)));
        assertEquals("B6", TransferFormRenderer.strainOf(data, 0, "C57BL/6"));
        assertEquals(3, TransferFormRenderer.femaleOf(data, 0, 9));
        assertEquals(5, TransferFormRenderer.maleOf(data, 0, 9));
    }

    @Test
    void 没有人工值时退回自动值() {
        TransferFormData data = new TransferFormData();
        data.setRows(List.of());
        assertEquals("C57BL/6", TransferFormRenderer.strainOf(data, 0, "C57BL/6"));
        assertEquals(9, TransferFormRenderer.femaleOf(data, 0, 9));
        assertEquals(9, TransferFormRenderer.maleOf(data, 0, 9));
    }

    @Test
    void 行数不足时按自动值补齐_不越界() {
        TransferFormData data = new TransferFormData();
        data.setRows(List.of(new TransferFormData.Row("B6", 1, 1)));
        assertEquals("C57BL/6", TransferFormRenderer.strainOf(data, 1, "C57BL/6"));
        assertEquals(9, TransferFormRenderer.femaleOf(data, 1, 9));
    }

    @Test
    void 空白的品系算没填_退回自动值() {
        TransferFormData data = new TransferFormData();
        data.setRows(List.of(new TransferFormData.Row("   ", null, null)));
        assertEquals("C57BL/6", TransferFormRenderer.strainOf(data, 0, "C57BL/6"));
    }

    @Test
    void data为null不炸() {
        assertNull(TransferFormRenderer.strainOf(null, 0, null));
        assertEquals(9, TransferFormRenderer.femaleOf(null, 0, 9));
    }

    @Test
    void 三态复核意见到模板文案的映射() {
        assertEquals("同意", TransferFormRenderer.outcomeLabel("approved"));
        assertEquals("暂缓", TransferFormRenderer.outcomeLabel("held"));
        assertEquals("不同意", TransferFormRenderer.outcomeLabel("rejected"));
        assertNull(TransferFormRenderer.outcomeLabel(null));
        assertNull(TransferFormRenderer.outcomeLabel(""));
        assertNull(TransferFormRenderer.outcomeLabel("bogus"));
    }
}
