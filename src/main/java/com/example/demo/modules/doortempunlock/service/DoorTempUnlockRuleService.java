package com.example.demo.modules.doortempunlock.service;

import com.example.demo.modules.doortempunlock.entity.DoorTempUnlockRule;
import com.example.demo.modules.doortempunlock.mapper.DoorTempUnlockRuleMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class DoorTempUnlockRuleService {

    private final DoorTempUnlockRuleMapper mapper;

    public DoorTempUnlockRuleService(DoorTempUnlockRuleMapper mapper) {
        this.mapper = mapper;
    }

    public List<DoorTempUnlockRule> listAll() {
        return mapper.findAll();
    }

    public List<DoorTempUnlockRule> listEnabled() {
        return mapper.findByEnabledTrue();
    }

    public DoorTempUnlockRule getById(Long id) {
        return mapper.findById(id);
    }

    public DoorTempUnlockRule create(DoorTempUnlockRule rule) {
        // Defaults to prevent NULL overriding DB schema defaults
        rule.setEnabled(rule.getEnabled() != null ? rule.getEnabled() : true);
        if (rule.getThresholdCount() == null || rule.getThresholdCount() <= 0) rule.setThresholdCount(5);
        if (rule.getThresholdWindowSec() == null || rule.getThresholdWindowSec() <= 0) rule.setThresholdWindowSec(60);
        if (rule.getUnlockDurationSec() == null || rule.getUnlockDurationSec() <= 0) rule.setUnlockDurationSec(120);
        if (rule.getCooldownSec() == null || rule.getCooldownSec() < 0) rule.setCooldownSec(300);
        mapper.insert(rule);
        return mapper.findById(rule.getId());
    }

    /**
     * Selective merge: only overwrites non-null fields from input onto existing,
     * preserving existing values for fields not provided in the request.
     */
    public DoorTempUnlockRule update(Long id, DoorTempUnlockRule input) {
        DoorTempUnlockRule existing = mapper.findById(id);
        if (existing == null) return null;

        if (input.getName() != null && !input.getName().isBlank()) existing.setName(input.getName());
        if (input.getEnabled() != null) existing.setEnabled(input.getEnabled());
        if (input.getChannelCodes() != null) existing.setChannelCodes(input.getChannelCodes());
        if (input.getThresholdCount() != null && input.getThresholdCount() > 0) existing.setThresholdCount(input.getThresholdCount());
        if (input.getThresholdWindowSec() != null && input.getThresholdWindowSec() > 0) existing.setThresholdWindowSec(input.getThresholdWindowSec());
        if (input.getUnlockDurationSec() != null && input.getUnlockDurationSec() > 0) existing.setUnlockDurationSec(input.getUnlockDurationSec());
        if (input.getCooldownSec() != null && input.getCooldownSec() >= 0) existing.setCooldownSec(input.getCooldownSec());

        mapper.update(existing);
        return mapper.findById(id);
    }

    public boolean delete(Long id) {
        DoorTempUnlockRule existing = mapper.findById(id);
        if (existing == null) return false;
        mapper.deleteById(id);
        return true;
    }

    public DoorTempUnlockRule toggle(Long id) {
        DoorTempUnlockRule existing = mapper.findById(id);
        if (existing == null) return null;
        existing.setEnabled(!Boolean.TRUE.equals(existing.getEnabled()));
        mapper.update(existing);
        return mapper.findById(id);
    }
}
