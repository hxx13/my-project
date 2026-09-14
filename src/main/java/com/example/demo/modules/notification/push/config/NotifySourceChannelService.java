package com.example.demo.modules.notification.push.config;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class NotifySourceChannelService {

    private final NotifySourceChannelMapper channelMapper;

    public NotifySourceChannelService(NotifySourceChannelMapper channelMapper) {
        this.channelMapper = channelMapper;
    }

    public List<NotifySourceChannel> listBySourceId(Long sourceId) {
        return channelMapper.findBySourceId(sourceId);
    }

    public NotifySourceChannel getBySourceAndChannel(Long sourceId, String channelCode) {
        NotifySourceChannel c = channelMapper.findBySourceAndChannel(sourceId, channelCode);
        if (c == null) {
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_CHANNEL_DISABLED, "通知渠道未配置: sourceId=" + sourceId + ", channel=" + channelCode);
        }
        return c;
    }

    /**
     * 新增或覆盖一条渠道配置。
     *
     * <p><b>缺项（null）沿用库里现有的值，只有显式传空串才算清空</b>。调用方经常只带一部分字段：
     * 页面各区块分开发，或者干脆把 {@code GET /api/admin/notify-source/{id}} 读回来的对象原样 PUT 回来 ——
     * 而那个响应里**没有** {@code digestMode}（实体有、DTO 没带）。digest_mode 是 NOT NULL 列，
     * 更新语句又显式写它，于是「读回来原样保存」必报 500（2026-09-14 实测复现）。
     * 新增行时才兜默认值 —— 新建本来就没东西可沿用。
     */
    public void createOrUpdate(NotifySourceChannel config) {
        NotifySourceChannel existing = channelMapper.findBySourceAndChannel(config.getSourceId(), config.getChannelCode());
        if (existing != null) {
            config.setId(existing.getId());
            if (config.getEnabled() == null) config.setEnabled(existing.getEnabled());
            if (config.getTitleTpl() == null) config.setTitleTpl(existing.getTitleTpl());
            if (config.getContentTpl() == null) config.setContentTpl(existing.getContentTpl());
            if (config.getRateLimitSeconds() == null) config.setRateLimitSeconds(existing.getRateLimitSeconds());
            if (config.getDigestMode() == null) config.setDigestMode(existing.getDigestMode());
            channelMapper.update(config);
            return;
        }
        if (config.getEnabled() == null) config.setEnabled(Boolean.TRUE);
        if (config.getTitleTpl() == null) config.setTitleTpl("");
        if (config.getContentTpl() == null) config.setContentTpl("");
        if (config.getRateLimitSeconds() == null) config.setRateLimitSeconds(300);
        if (config.getDigestMode() == null) config.setDigestMode("INSTANT");
        channelMapper.insert(config);
    }

    public void setEnabled(Long id, boolean enabled) {
        channelMapper.updateEnabled(id, enabled ? 1 : 0);
    }
}
