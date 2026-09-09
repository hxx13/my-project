package com.example.demo.modules.doorswiperule.service;

import com.example.demo.modules.doorswiperule.engine.DoorSwipeRuleEngine;
import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleConfig;
import com.example.demo.modules.doorswiperule.mapper.DoorSwipeRuleConfigMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class DoorSwipeRuleService {

    private final DoorSwipeRuleConfigMapper mapper;
    private final DoorSwipeRuleEngine engine;

    public DoorSwipeRuleService(DoorSwipeRuleConfigMapper mapper, DoorSwipeRuleEngine engine) {
        this.mapper = mapper;
        this.engine = engine;
    }

    public List<DoorSwipeRuleConfig> listAll() {
        return mapper.findAll();
    }

    public List<DoorSwipeRuleConfig> listEnabled() {
        return mapper.findByEnabledTrue();
    }

    public DoorSwipeRuleConfig getById(Long id) {
        return mapper.findById(id);
    }

    public DoorSwipeRuleConfig create(DoorSwipeRuleConfig rule) {
        rule.setEnabled(rule.getEnabled() != null ? rule.getEnabled() : true);
        if (rule.getScopeType() == null || rule.getScopeType().isBlank()) rule.setScopeType("ALL");
        if (rule.getThresholdCount() == null || rule.getThresholdCount() <= 0) rule.setThresholdCount(3);
        if (rule.getThresholdWindowSec() == null || rule.getThresholdWindowSec() <= 0) rule.setThresholdWindowSec(60);
        if (rule.getStayOpenDurationSec() == null || rule.getStayOpenDurationSec() <= 0) rule.setStayOpenDurationSec(120);
        if (rule.getCooldownSec() == null || rule.getCooldownSec() < 0) rule.setCooldownSec(300);
        mapper.insert(rule);
        engine.reloadRules();
        return mapper.findById(rule.getId());
    }

    /** 选择性合并：只覆盖非空字段，未提供的字段保留原值 */
    public DoorSwipeRuleConfig update(Long id, DoorSwipeRuleConfig input) {
        DoorSwipeRuleConfig existing = mapper.findById(id);
        if (existing == null) return null;

        if (input.getName() != null && !input.getName().isBlank()) existing.setName(input.getName());
        if (input.getEnabled() != null) existing.setEnabled(input.getEnabled());
        if (input.getChannelCodes() != null) existing.setChannelCodes(input.getChannelCodes());
        if (input.getScopeType() != null && !input.getScopeType().isBlank()) existing.setScopeType(input.getScopeType());
        if (input.getScopeValues() != null) existing.setScopeValues(input.getScopeValues());
        if (input.getThresholdCount() != null && input.getThresholdCount() > 0) existing.setThresholdCount(input.getThresholdCount());
        if (input.getThresholdWindowSec() != null && input.getThresholdWindowSec() > 0) existing.setThresholdWindowSec(input.getThresholdWindowSec());
        if (input.getStayOpenDurationSec() != null && input.getStayOpenDurationSec() > 0) existing.setStayOpenDurationSec(input.getStayOpenDurationSec());
        if (input.getCooldownSec() != null && input.getCooldownSec() >= 0) existing.setCooldownSec(input.getCooldownSec());

        mapper.update(existing);
        engine.reloadRules();
        return mapper.findById(id);
    }

    public boolean delete(Long id) {
        DoorSwipeRuleConfig existing = mapper.findById(id);
        if (existing == null) return false;
        mapper.deleteById(id);
        engine.reloadRules();
        return true;
    }

    public DoorSwipeRuleConfig toggle(Long id) {
        DoorSwipeRuleConfig existing = mapper.findById(id);
        if (existing == null) return null;
        existing.setEnabled(!Boolean.TRUE.equals(existing.getEnabled()));
        mapper.update(existing);
        engine.reloadRules();
        return mapper.findById(id);
    }
}
