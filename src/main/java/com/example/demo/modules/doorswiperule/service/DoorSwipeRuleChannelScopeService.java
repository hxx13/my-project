package com.example.demo.modules.doorswiperule.service;

import com.example.demo.modules.doorswiperule.engine.DoorSwipeRuleEngine;
import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleChannelScope;
import com.example.demo.modules.doorswiperule.mapper.DoorSwipeRuleChannelScopeMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class DoorSwipeRuleChannelScopeService {

    private final DoorSwipeRuleChannelScopeMapper mapper;
    private final DoorSwipeRuleEngine engine;

    public DoorSwipeRuleChannelScopeService(DoorSwipeRuleChannelScopeMapper mapper, DoorSwipeRuleEngine engine) {
        this.mapper = mapper;
        this.engine = engine;
    }

    public List<DoorSwipeRuleChannelScope> list() {
        return mapper.selectAll();
    }

    public Set<String> enabledChannelCodes() {
        return new LinkedHashSet<>(mapper.enabledChannelCodes());
    }

    @Transactional(rollbackFor = Exception.class)
    public List<DoorSwipeRuleChannelScope> replaceScope(List<Map<String, String>> channels, String operator) {
        mapper.deleteAll();
        if (channels == null || channels.isEmpty()) {
            engine.reloadChannels();
            return List.of();
        }
        List<DoorSwipeRuleChannelScope> items = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, String> ch : channels) {
            if (ch == null) continue;
            String code = ch.get("channelCode");
            if (!StringUtils.hasText(code)) continue;
            code = code.trim();
            if (!seen.add(code)) continue;
            DoorSwipeRuleChannelScope row = new DoorSwipeRuleChannelScope();
            row.setChannelCode(code);
            row.setChannelName(ch.get("channelName"));
            row.setEnabled(1);
            row.setUpdatedBy(operator);
            items.add(row);
        }
        if (!items.isEmpty()) {
            mapper.insertBatch(items);
        }
        engine.reloadChannels();
        return mapper.selectAll();
    }

    public DoorSwipeRuleChannelScope toggle(String channelCode, String operator) {
        if (!StringUtils.hasText(channelCode)) return null;
        DoorSwipeRuleChannelScope existing = mapper.findByCode(channelCode.trim());
        if (existing == null) return null;
        int next = (existing.getEnabled() != null && existing.getEnabled() == 1) ? 0 : 1;
        mapper.updateEnabled(channelCode.trim(), next, operator);
        engine.reloadChannels();
        return mapper.findByCode(channelCode.trim());
    }
}
