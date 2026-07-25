package com.example.demo.modules.notification.push.source;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class NotifySourceService {

    private final NotifySourceMapper sourceMapper;

    public NotifySourceService(NotifySourceMapper sourceMapper) {
        this.sourceMapper = sourceMapper;
    }

    public NotifySource getByCode(String code) {
        NotifySource s = sourceMapper.findByCode(code);
        if (s == null) {
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_SOURCE_NOT_FOUND, "通知源不存在: " + code);
        }
        return s;
    }

    public NotifySource getById(Long id) {
        NotifySource s = sourceMapper.findById(id);
        if (s == null) {
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_SOURCE_NOT_FOUND, "通知源不存在: id=" + id);
        }
        return s;
    }

    public List<NotifySource> listAll() {
        return sourceMapper.findAll();
    }

    public void setEnabled(Long id, boolean enabled) {
        sourceMapper.updateEnabled(id, enabled ? 1 : 0);
    }
}
