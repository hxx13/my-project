package com.example.demo.modules.portal.service;

import com.example.demo.common.exception.TwinBusinessException;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 回归（2026-09-22 生产报障）：编辑一条**已有发布时间**的门户内容并保存，报
 * {@code DateTimeParseException: Text '2026-09-22 21:17T00:00:00' could not be parsed at index 10}。
 *
 * <p>成因是判据只看有没有 `T`，把「空格形态」（后端自己的出参就是这个形态、前端原样回传）
 * 误当纯日期补了 `T00:00:00`。这里把三种入参形态都钉住。
 */
class PortalContentServiceDateFormatTest {

    @Test
    void 墙上钟形态能解析_编辑页回传的就是这个() {
        assertEquals(LocalDateTime.of(2026, 9, 22, 21, 17),
                PortalContentService.parsePublishedAt("2026-09-22 21:17"));
        assertEquals(LocalDateTime.of(2026, 9, 22, 21, 17, 5),
                PortalContentService.parsePublishedAt("2026-09-22 21:17:05"));
    }

    @Test
    void ISO形态仍然认() {
        assertEquals(LocalDateTime.of(2026, 9, 22, 21, 17),
                PortalContentService.parsePublishedAt("2026-09-22T21:17"));
        assertEquals(LocalDateTime.of(2026, 9, 22, 21, 17, 5),
                PortalContentService.parsePublishedAt("2026-09-22T21:17:05"));
    }

    @Test
    void 纯日期补当天零点() {
        assertEquals(LocalDateTime.of(2026, 9, 22, 0, 0),
                PortalContentService.parsePublishedAt("2026-09-22"));
    }

    @Test
    void 认不出的形态报400_而不是漏出时间解析异常() {
        assertThrows(TwinBusinessException.class, () -> PortalContentService.parsePublishedAt("不是时间"));
        // 报障现场那串（旧写法拼出来的畸形值）现在应该是干净的 400
        assertThrows(TwinBusinessException.class,
                () -> PortalContentService.parsePublishedAt("2026-09-22 21:17T00:00:00"));
    }
}
