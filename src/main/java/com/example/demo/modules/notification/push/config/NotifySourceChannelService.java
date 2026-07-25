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

    public void createOrUpdate(NotifySourceChannel config) {
        NotifySourceChannel existing = channelMapper.findBySourceAndChannel(config.getSourceId(), config.getChannelCode());
        if (existing != null) {
            config.setId(existing.getId());
            channelMapper.update(config);
        } else {
            channelMapper.insert(config);
        }
    }

    public void setEnabled(Long id, boolean enabled) {
        channelMapper.updateEnabled(id, enabled ? 1 : 0);
    }
}
