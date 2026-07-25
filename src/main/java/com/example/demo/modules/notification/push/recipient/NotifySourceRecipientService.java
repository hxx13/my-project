package com.example.demo.modules.notification.push.recipient;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class NotifySourceRecipientService {

    private final NotifySourceRecipientMapper recipientMapper;

    public NotifySourceRecipientService(NotifySourceRecipientMapper recipientMapper) {
        this.recipientMapper = recipientMapper;
    }

    public List<NotifySourceRecipient> listBySourceId(Long sourceId) {
        return recipientMapper.findBySourceId(sourceId);
    }

    @Transactional
    public void replaceBySourceId(Long sourceId, List<NotifySourceRecipient> recipients) {
        recipientMapper.deleteBySourceId(sourceId);
        for (NotifySourceRecipient r : recipients) {
            r.setSourceId(sourceId);
            recipientMapper.insert(r);
        }
    }

    public void add(Long sourceId, NotifySourceRecipient recipient) {
        recipient.setSourceId(sourceId);
        recipientMapper.insert(recipient);
    }

    public void remove(Long id) {
        recipientMapper.deleteById(id);
    }
}
