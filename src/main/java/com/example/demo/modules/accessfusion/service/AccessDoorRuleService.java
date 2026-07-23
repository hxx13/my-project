package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessDoorRule;
import com.example.demo.modules.accessfusion.mapper.AccessDoorRuleMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccessDoorRuleService {

    private final AccessDoorRuleMapper mapper;

    public AccessDoorRuleService(AccessDoorRuleMapper mapper) {
        this.mapper = mapper;
    }

    public Map<String, Object> list(String keyword, Long statsTaskId, int page, int pageSize) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(pageSize, 1), 200);
        int offset = (safePage - 1) * safeSize;
        List<AccessDoorRule> data = mapper.selectPage(trim(keyword), statsTaskId, offset, safeSize);
        int total = mapper.countPage(trim(keyword), statsTaskId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", data);
        out.put("total", total);
        out.put("page", safePage);
        out.put("pageSize", safeSize);
        return out;
    }

    public AccessDoorRule get(long id) {
        return mapper.selectById(id);
    }

    public AccessDoorRule resolveForChannel(String channelCode, List<Long> statsTaskIds) {
        if (!StringUtils.hasText(channelCode)) {
            return null;
        }
        List<Long> ids = new java.util.ArrayList<>();
        ids.add(0L);
        if (statsTaskIds != null) {
            for (Long tid : statsTaskIds) {
                if (tid != null && tid > 0) {
                    ids.add(tid);
                }
            }
        }
        return mapper.selectBestForChannel(channelCode.trim(), ids);
    }

    public java.util.Map<String, AccessDoorRule> rulesByChannelForTasks(String channelCode, List<Long> statsTaskIds) {
        AccessDoorRule rule = resolveForChannel(channelCode, statsTaskIds);
        if (rule == null) {
            return java.util.Map.of();
        }
        return java.util.Map.of(rule.getChannelCode(), rule);
    }

    /** 清洗通道无门规则时自动补一条「大华进出」，避免落回正反切换推断 */
    @Transactional(rollbackFor = Exception.class)
    public AccessDoorRule ensureDahuaRuleForChannel(String channelCode, String channelName, List<Long> statsTaskIds) {
        if (!StringUtils.hasText(channelCode)) {
            return null;
        }
        AccessDoorRule existing = resolveForChannel(channelCode, statsTaskIds);
        if (existing != null) {
            if ("BIDIRECTIONAL_TOGGLE".equals(existing.getDoorMode())) {
                existing.setDoorMode("DAHUA_ENTER_EXIT");
                mapper.update(existing);
            }
            return existing;
        }
        long taskId = 0L;
        if (statsTaskIds != null) {
            for (Long tid : statsTaskIds) {
                if (tid != null && tid > 0) {
                    taskId = tid;
                    break;
                }
            }
        }
        AccessDoorRule row = new AccessDoorRule();
        row.setRuleSetId(1L);
        row.setStatsTaskId(taskId);
        row.setChannelCode(channelCode.trim());
        row.setChannelName(channelName);
        row.setDoorMode("DAHUA_ENTER_EXIT");
        row.setDebounceSeconds(45);
        row.setMaxSwipesPerMinute(8);
        row.setEnabled(1);
        mapper.insert(row);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public long create(AccessDoorRule row) {
        validate(row);
        if (row.getRuleSetId() == null) {
            row.setRuleSetId(1L);
        }
        if (row.getStatsTaskId() == null) {
            row.setStatsTaskId(0L);
        }
        if (row.getDebounceSeconds() == null) {
            row.setDebounceSeconds(45);
        }
        if (row.getMaxSwipesPerMinute() == null) {
            row.setMaxSwipesPerMinute(8);
        }
        if (row.getEnabled() == null) {
            row.setEnabled(1);
        }
        mapper.insert(row);
        return row.getId();
    }

    @Transactional(rollbackFor = Exception.class)
    public void update(long id, AccessDoorRule row) {
        row.setId(id);
        validate(row);
        mapper.update(row);
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        mapper.deleteById(id);
    }

    private void validate(AccessDoorRule row) {
        if (!StringUtils.hasText(row.getChannelCode())) {
            throw new IllegalArgumentException("channelCode 不能为空");
        }
        if (!StringUtils.hasText(row.getDoorMode())) {
            throw new IllegalArgumentException("doorMode 不能为空");
        }
    }

    private static String trim(String s) {
        return s != null ? s.trim() : null;
    }
}
