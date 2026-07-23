package com.example.demo.modules.accessfusion.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.accessfusion.entity.AccessCleanChannelScope;
import com.example.demo.modules.accessfusion.mapper.AccessCleanChannelScopeMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AccessCleanChannelScopeService {

    private final AccessCleanChannelScopeMapper scopeMapper;

    public AccessCleanChannelScopeService(AccessCleanChannelScopeMapper scopeMapper) {
        this.scopeMapper = scopeMapper;
    }

    public List<AccessCleanChannelScope> list(long statsTaskId) {
        if (statsTaskId <= 0) {
            return List.of();
        }
        return scopeMapper.selectByTask(statsTaskId);
    }

    public Set<String> enabledChannelCodes(long statsTaskId) {
        if (statsTaskId <= 0) {
            return Set.of();
        }
        return new LinkedHashSet<>(scopeMapper.selectEnabledChannelCodes(statsTaskId));
    }

    public List<Map<String, Object>> listGlobalEnabledChannels() {
        return scopeMapper.selectDistinctEnabledChannels();
    }

    public List<Long> enabledTaskIdsForChannel(String channelCode) {
        if (!StringUtils.hasText(channelCode)) {
            return List.of();
        }
        return scopeMapper.selectEnabledTaskIdsForChannel(channelCode.trim());
    }

    public boolean isChannelGloballyEnabled(String channelCode) {
        if (!StringUtils.hasText(channelCode)) {
            return false;
        }
        return !enabledTaskIdsForChannel(channelCode).isEmpty();
    }

    public boolean isChannelInTaskScope(long statsTaskId, String channelCode) {
        if (statsTaskId <= 0 || !StringUtils.hasText(channelCode)) {
            return false;
        }
        return enabledChannelCodes(statsTaskId).contains(channelCode.trim());
    }

    public List<Map<String, Object>> suggestFromTaskRecords(long statsTaskId, int limit) {
        if (statsTaskId <= 0) {
            return List.of();
        }
        return scopeMapper.suggestChannelsFromSwings(statsTaskId, Math.min(Math.max(limit, 1), 200));
    }

    /**
     * 拉取后自动清洗 / 手动入库：优先任务通道漏斗表；否则用 queryJson.channelCodes；再否则从已拉取记录推断并写回漏斗。
     */
    @Transactional(rollbackFor = Exception.class)
    public List<String> resolveEnabledChannelsForClean(long statsTaskId, String queryJson) {
        if (statsTaskId <= 0) {
            return List.of();
        }
        List<String> fromScope = new ArrayList<>(scopeMapper.selectEnabledChannelCodes(statsTaskId));
        if (!fromScope.isEmpty()) {
            return fromScope;
        }
        List<String> fromQuery = parseChannelCodesFromQueryJson(queryJson);
        if (!fromQuery.isEmpty()) {
            persistEnabledChannelCodes(statsTaskId, fromQuery);
            return fromQuery;
        }
        List<String> fromRecords = new ArrayList<>();
        for (Map<String, Object> row : suggestFromTaskRecords(statsTaskId, 80)) {
            String code = str(row.get("channelCode"));
            if (StringUtils.hasText(code)) {
                fromRecords.add(code.trim());
            }
        }
        if (!fromRecords.isEmpty()) {
            persistEnabledChannelCodes(statsTaskId, fromRecords);
        }
        return fromRecords;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<AccessCleanChannelScope> replaceScope(long statsTaskId, List<Map<String, String>> channels) {
        if (statsTaskId <= 0) {
            throw new IllegalArgumentException("请选择统计任务");
        }
        scopeMapper.deleteByTask(statsTaskId);
        if (channels == null || channels.isEmpty()) {
            return List.of();
        }
        List<AccessCleanChannelScope> items = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, String> ch : channels) {
            if (ch == null) continue;
            String code = ch.get("channelCode");
            if (!StringUtils.hasText(code)) continue;
            code = code.trim();
            if (!seen.add(code)) continue;
            AccessCleanChannelScope row = new AccessCleanChannelScope();
            row.setStatsTaskId(statsTaskId);
            row.setChannelCode(code);
            row.setChannelName(ch.get("channelName"));
            row.setEnabled(1);
            items.add(row);
        }
        if (!items.isEmpty()) {
            scopeMapper.insertBatch(items);
        }
        return scopeMapper.selectByTask(statsTaskId);
    }

    /** 任务保存时：将大华筛选中的 channelCodes 同步为清洗通道漏斗（与拉取范围一致）。 */
    @Transactional(rollbackFor = Exception.class)
    public void syncScopeFromTaskQuery(long statsTaskId, String queryJson) {
        if (statsTaskId <= 0) {
            return;
        }
        List<String> codes = parseChannelCodesFromQueryJson(queryJson);
        if (codes.isEmpty()) {
            return;
        }
        persistEnabledChannelCodes(statsTaskId, codes);
    }

    private void persistEnabledChannelCodes(long statsTaskId, List<String> channelCodes) {
        List<Map<String, String>> rows = new ArrayList<>();
        for (String code : channelCodes) {
            if (!StringUtils.hasText(code)) {
                continue;
            }
            Map<String, String> row = new HashMap<>();
            row.put("channelCode", code.trim());
            rows.add(row);
        }
        if (!rows.isEmpty()) {
            replaceScope(statsTaskId, rows);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> parseChannelCodesFromQueryJson(String queryJson) {
        if (!StringUtils.hasText(queryJson)) {
            return List.of();
        }
        try {
            Map<String, Object> query = JSON.parseObject(queryJson, Map.class);
            if (query == null) {
                return List.of();
            }
            Object raw = query.get("channelCodes");
            if (!(raw instanceof List<?> list)) {
                return List.of();
            }
            LinkedHashSet<String> codes = new LinkedHashSet<>();
            for (Object item : list) {
                String c = str(item);
                if (StringUtils.hasText(c)) {
                    codes.add(c.trim());
                }
            }
            return new ArrayList<>(codes);
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
