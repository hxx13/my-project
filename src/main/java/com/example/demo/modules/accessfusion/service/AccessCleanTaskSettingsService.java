package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanTaskSettings;
import com.example.demo.modules.accessfusion.mapper.AccessCleanTaskSettingsMapper;
import com.example.demo.modules.accessfusion.support.SwingDirectionFilterSupport;
import com.example.demo.modules.twin.entity.DahuaSwingStatsPullTask;
import com.example.demo.modules.twin.mapper.DahuaSwingStatsPullMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class AccessCleanTaskSettingsService {

    public static final int DEFAULT_DEBOUNCE_SECONDS = 45;
    public static final int MIN_DEBOUNCE_SECONDS = 5;
    public static final int MAX_DEBOUNCE_SECONDS = 3600;

    private final AccessCleanTaskSettingsMapper mapper;
    private final DahuaSwingStatsPullMapper statsPullMapper;

    public AccessCleanTaskSettingsService(
            AccessCleanTaskSettingsMapper mapper, DahuaSwingStatsPullMapper statsPullMapper) {
        this.mapper = mapper;
        this.statsPullMapper = statsPullMapper;
    }

    public AccessCleanTaskSettings getOrDefault(long statsTaskId) {
        AccessCleanTaskSettings row = statsTaskId > 0 ? mapper.selectByTask(statsTaskId) : null;
        if (row == null) {
            row = new AccessCleanTaskSettings();
            row.setStatsTaskId(statsTaskId);
            row.setDebounceSeconds(DEFAULT_DEBOUNCE_SECONDS);
            row.setAutoCleanPackage(defaultAutoCleanPackage(statsTaskId) ? 1 : 0);
            row.setSwingDirectionFilter(SwingDirectionFilterSupport.ALL);
        } else {
            if (row.getDebounceSeconds() == null) {
                row.setDebounceSeconds(DEFAULT_DEBOUNCE_SECONDS);
            }
            if (row.getAutoCleanPackage() == null) {
                row.setAutoCleanPackage(defaultAutoCleanPackage(statsTaskId) ? 1 : 0);
            }
            if (!StringUtils.hasText(row.getSwingDirectionFilter())) {
                row.setSwingDirectionFilter(SwingDirectionFilterSupport.ALL);
            }
        }
        return row;
    }

    /** 单任务清洗：界面覆盖优先，否则取该任务清洗设置 */
    public String resolveDirectionFilterForTask(long statsTaskId, String requestOverride) {
        if (StringUtils.hasText(requestOverride)
                && !SwingDirectionFilterSupport.ALL.equals(SwingDirectionFilterSupport.normalize(requestOverride))) {
            return SwingDirectionFilterSupport.normalize(requestOverride);
        }
        if (statsTaskId > 0) {
            return SwingDirectionFilterSupport.normalize(getOrDefault(statsTaskId).getSwingDirectionFilter());
        }
        return SwingDirectionFilterSupport.ALL;
    }

    /** 界面未指定时：多任务通道若各任务筛选一致则采用，否则 ALL（定时多任务合并用） */
    public String resolveDirectionFilter(List<Long> statsTaskIds, String requestOverride) {
        if (StringUtils.hasText(requestOverride)
                && !SwingDirectionFilterSupport.ALL.equals(SwingDirectionFilterSupport.normalize(requestOverride))) {
            return SwingDirectionFilterSupport.normalize(requestOverride);
        }
        if (statsTaskIds == null || statsTaskIds.isEmpty()) {
            return SwingDirectionFilterSupport.ALL;
        }
        Set<String> distinct = new LinkedHashSet<>();
        for (Long tid : statsTaskIds) {
            if (tid != null && tid > 0) {
                distinct.add(
                        SwingDirectionFilterSupport.normalize(getOrDefault(tid).getSwingDirectionFilter()));
            }
        }
        distinct.remove(SwingDirectionFilterSupport.ALL);
        if (distinct.size() == 1) {
            return distinct.iterator().next();
        }
        return SwingDirectionFilterSupport.ALL;
    }

    public int debounceSecondsForTask(long statsTaskId) {
        return getOrDefault(statsTaskId).getDebounceSeconds();
    }

    public boolean isAutoCleanPackageEnabled(long statsTaskId) {
        if (statsTaskId <= 0) {
            return false;
        }
        AccessCleanTaskSettings row = mapper.selectByTask(statsTaskId);
        if (row != null && row.getAutoCleanPackage() != null) {
            return row.getAutoCleanPackage() == 1;
        }
        return defaultAutoCleanPackage(statsTaskId);
    }

    /** 历史回溯任务默认不自动重算打包，日常/昨日等默认开启 */
    private boolean defaultAutoCleanPackage(long statsTaskId) {
        DahuaSwingStatsPullTask task = statsPullMapper.findById(statsTaskId);
        if (task == null || task.getPeriodMode() == null) {
            return true;
        }
        return !"HISTORICAL_RANGE".equalsIgnoreCase(task.getPeriodMode().trim());
    }

    @Transactional(rollbackFor = Exception.class)
    public AccessCleanTaskSettings save(
            long statsTaskId, int debounceSeconds, Integer autoCleanPackage, String swingDirectionFilter) {
        if (statsTaskId <= 0) {
            throw new IllegalArgumentException("请选择统计任务");
        }
        int sec = Math.max(MIN_DEBOUNCE_SECONDS, Math.min(MAX_DEBOUNCE_SECONDS, debounceSeconds));
        int auto =
                autoCleanPackage != null
                        ? (autoCleanPackage == 1 ? 1 : 0)
                        : (defaultAutoCleanPackage(statsTaskId) ? 1 : 0);
        AccessCleanTaskSettings row = new AccessCleanTaskSettings();
        row.setStatsTaskId(statsTaskId);
        row.setDebounceSeconds(sec);
        row.setAutoCleanPackage(auto);
        row.setSwingDirectionFilter(SwingDirectionFilterSupport.normalize(swingDirectionFilter));
        mapper.upsert(row);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public AccessCleanTaskSettings save(long statsTaskId, int debounceSeconds) {
        AccessCleanTaskSettings existing = getOrDefault(statsTaskId);
        return save(
                statsTaskId,
                debounceSeconds,
                existing.getAutoCleanPackage(),
                existing.getSwingDirectionFilter());
    }

    @Transactional(rollbackFor = Exception.class)
    public AccessCleanTaskSettings save(long statsTaskId, int debounceSeconds, Integer autoCleanPackage) {
        AccessCleanTaskSettings existing = getOrDefault(statsTaskId);
        return save(
                statsTaskId,
                debounceSeconds,
                autoCleanPackage,
                existing.getSwingDirectionFilter());
    }
}
