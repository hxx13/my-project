package com.example.demo.modules.notification.push.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 渠道配置写入的「缺项沿用」回归。
 *
 * <p>背景：`GET /api/admin/notify-source/{id}` 的响应里**没有** digestMode，而 digest_mode 是 NOT NULL 列、
 * 更新语句又显式写它。此前「读回来原样 PUT 回去」必 500（实测复现）。规则定成：
 * **null = 没传 = 沿用库里的值；空串 = 显式清空**。
 */
@ExtendWith(MockitoExtension.class)
class NotifySourceChannelServiceTest {

    @Mock private NotifySourceChannelMapper mapper;

    private NotifySourceChannelService service;

    @BeforeEach
    void setUp() {
        service = new NotifySourceChannelService(mapper);
    }

    private static NotifySourceChannel existing() {
        NotifySourceChannel c = new NotifySourceChannel();
        c.setId(105L);
        c.setSourceId(20923L);
        c.setChannelCode("WXPUSHER");
        c.setEnabled(true);
        c.setTitleTpl("笼位提醒 — {statusLabel}");
        c.setContentTpl("## 正文");
        c.setRateLimitSeconds(300);
        c.setDigestMode("INSTANT");
        return c;
    }

    /** 核心回归：只改限流的「部分字段」更新，不能把没带的列（尤其 digest_mode）写成 NULL。 */
    @Test
    void partialUpdateKeepsExistingValues() {
        when(mapper.findBySourceAndChannel(20923L, "WXPUSHER")).thenReturn(existing());
        NotifySourceChannel incoming = new NotifySourceChannel();
        incoming.setSourceId(20923L);
        incoming.setChannelCode("WXPUSHER");
        incoming.setRateLimitSeconds(0);

        service.createOrUpdate(incoming);

        assertEquals("INSTANT", incoming.getDigestMode(), "没带的 digestMode 必须沿用库里的值（NOT NULL 列）");
        assertEquals("笼位提醒 — {statusLabel}", incoming.getTitleTpl());
        assertEquals("## 正文", incoming.getContentTpl());
        assertEquals(true, incoming.getEnabled());
        assertEquals(105L, incoming.getId());
        assertEquals(0, incoming.getRateLimitSeconds(), "本次显式带的字段按传的走");
        verify(mapper).update(incoming);
        verify(mapper, never()).insert(any());
    }

    /** 显式空串 = 清空模板（与「没传」区分开，清空是正当需求）。 */
    @Test
    void explicitEmptyStringClearsTemplate() {
        when(mapper.findBySourceAndChannel(20923L, "WXPUSHER")).thenReturn(existing());
        NotifySourceChannel incoming = new NotifySourceChannel();
        incoming.setSourceId(20923L);
        incoming.setChannelCode("WXPUSHER");
        incoming.setTitleTpl("");

        service.createOrUpdate(incoming);

        assertEquals("", incoming.getTitleTpl(), "空串是显式清空，不该被沿用覆盖回去");
    }

    /** 新增行没有可沿用的，兜默认值（同样是 NOT NULL 列，不能留 null）。 */
    @Test
    void insertFillsDefaults() {
        when(mapper.findBySourceAndChannel(1L, "EMAIL")).thenReturn(null);
        NotifySourceChannel incoming = new NotifySourceChannel();
        incoming.setSourceId(1L);
        incoming.setChannelCode("EMAIL");

        service.createOrUpdate(incoming);

        assertEquals("INSTANT", incoming.getDigestMode());
        assertEquals(300, incoming.getRateLimitSeconds());
        assertEquals(true, incoming.getEnabled());
        assertEquals("", incoming.getTitleTpl());
        verify(mapper).insert(incoming);
        verify(mapper, never()).update(any());
    }
}
