package com.example.demo.modules.cardprint.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cardprint.entity.CardPrintTemplate;
import com.example.demo.modules.cardprint.mapper.CardPrintArchiveMapper;
import com.example.demo.modules.cardprint.mapper.CardPrintTemplateMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 编排服务纯函数契约：笼位 ID 解析与模板规格边界校验。 */
class CardPrintServiceTest {

    private CardPrintService service() {
        return new CardPrintService(
                mock(CardPrintTemplateMapper.class),
                mock(CardPrintArchiveMapper.class),
                mock(CardFieldDictionaryService.class),
                mock(CardDataAssembler.class),
                mock(CardRenderEngine.class),
                mock(CardPdfStorage.class),
                new ObjectMapper());
    }

    @Test
    void parseCageIdsAcceptsStringsAndSkipsNulls() {
        var ids = service().parseCageIds(Arrays.asList("1234567890123456789", " 42 ", null));
        assertEquals(List.of(1234567890123456789L, 42L), ids);
    }

    @Test
    void parseCageIdsRejectsGarbage() {
        assertThrows(TwinBusinessException.class, () -> service().parseCageIds(List.of("abc")));
        assertThrows(TwinBusinessException.class, () -> service().parseCageIds(List.of(1.5)));
    }

    @Test
    void parseCageIdsHandlesNullAndEmpty() {
        assertEquals(0, service().parseCageIds(null).size());
        assertEquals(0, service().parseCageIds(List.of()).size());
    }

    @Test
    void parseSpecRejectsInvalidJson() {
        assertThrows(TwinBusinessException.class, () -> service().parseSpec("{not json"));
    }

    @Test
    void parseSpecRejectsOutOfRangeNumbers() {
        assertThrows(TwinBusinessException.class, () -> service().parseSpec(specJson(0, 105, 2, 9, 33)));
        assertThrows(TwinBusinessException.class, () -> service().parseSpec(specJson(70, 105, 2, -1, 33)));
        assertThrows(TwinBusinessException.class, () -> service().parseSpec(specJson(70, 105, 2, 9, 999)));
    }

    @Test
    void parseSpecAcceptsDefaults() {
        var spec = service().parseSpec(specJson(70, 105, 2, 9, 33));
        assertEquals(70f, spec.pageWidthMm());
    }

    private static String specJson(float w, float h, float margin, float fontSize, float qrSize) {
        return "{\"pageWidthMm\":" + w + ",\"pageHeightMm\":" + h + ",\"marginMm\":" + margin
                + ",\"defaultFontSizePt\":" + fontSize + ",\"lineHeightMm\":null,\"offsetXMm\":0,"
                + "\"offsetYMm\":0,\"borderWidthMm\":0.2,\"borderColor\":\"#000000\","
                + "\"qr\":{\"enabled\":true,\"fieldKey\":\"__qr__\",\"sizeMm\":" + qrSize
                + ",\"marginMm\":1,\"anchor\":\"top-right\"}}";
    }

    /** 试打不传笼位 ID：用示例数据渲染，不查库（dataAssembler 不被调用）。 */
    @Test
    @SuppressWarnings("unchecked")
    void previewWithoutCageIdUsesSampleData() throws Exception {
        CardPrintTemplateMapper templateMapper = mock(CardPrintTemplateMapper.class);
        CardDataAssembler dataAssembler = mock(CardDataAssembler.class);
        CardRenderEngine renderEngine = mock(CardRenderEngine.class);
        CardPrintService svc = new CardPrintService(
                templateMapper,
                mock(CardPrintArchiveMapper.class),
                mock(CardFieldDictionaryService.class),
                dataAssembler,
                renderEngine,
                mock(CardPdfStorage.class),
                new ObjectMapper());

        CardPrintTemplate t = new CardPrintTemplate();
        t.setId(1L);
        t.setSpecJson(specJson(70, 105, 2, 9, 33));
        t.setSlotsJson("[{\"cells\":["
                + "{\"label\":\"位置: \",\"fieldKey\":\"__position__\"},"
                + "{\"label\":\"房间: \",\"fieldKey\":\"roomName\"},"
                + "{\"label\":\"码: \",\"fieldKey\":\"__qr__\"}]}]");
        when(templateMapper.selectById(1L)).thenReturn(t);
        when(renderEngine.render(any(), any(), any())).thenReturn(new byte[]{1, 2, 3});

        svc.preview(1L, null);

        ArgumentCaptor<List<Map<String, Object>>> captor = ArgumentCaptor.forClass(List.class);
        verify(renderEngine).render(any(), any(), captor.capture());
        List<Map<String, Object>> rows = captor.getValue();
        assertFalse(rows.isEmpty());
        Map<String, Object> row = rows.get(0);
        assertEquals("示例笼架#A-10", row.get("__position__"));
        assertEquals("示例内容", row.get("roomName"));
        assertEquals("1234567890123456789", row.get("__qr__"));
        verify(dataAssembler, never()).assemble(any());
    }
}
