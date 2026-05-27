package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanPackageItem;
import com.example.demo.modules.accessfusion.mapper.AccessCleanPackageItemMapper;
import com.example.demo.modules.analytics.service.AnalyticsFilterParams;
import com.example.demo.modules.analytics.service.IsolationPackageFilter;
import com.example.demo.modules.analytics.service.IsolationQueryProvenanceBuilder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 清洗总库唯一读库门面：管理端列表/纠错与隔离服统计共用同一筛选口径。
 */
@Service
public class AccessCleanLibraryQueryFacade {

    private final AccessCleanPackageItemMapper packageItemMapper;
    private final AccessCleanPackageAnalyticsService packageAnalyticsService;
    private final AccessCleanChannelScopeService channelScopeService;

    public AccessCleanLibraryQueryFacade(
            AccessCleanPackageItemMapper packageItemMapper,
            AccessCleanPackageAnalyticsService packageAnalyticsService,
            AccessCleanChannelScopeService channelScopeService) {
        this.packageItemMapper = packageItemMapper;
        this.packageAnalyticsService = packageAnalyticsService;
        this.channelScopeService = channelScopeService;
    }

    public Map<String, Object> aggregateForIsolation(
            AnalyticsFilterParams params, String startTime, String endTime) {
        IsolationPackageFilter pkg = IsolationPackageFilter.fromAnalytics(params);
        Map<String, Object> report = packageAnalyticsService.buildReport(pkg, startTime, endTime);
        @SuppressWarnings("unchecked")
        Map<String, Object> summary =
                report.get("summary") instanceof Map<?, ?> m
                        ? (Map<String, Object>) m
                        : new LinkedHashMap<>();
        Map<String, Object> filterSnapshot = IsolationQueryProvenanceBuilder.buildFilterSnapshots(params);
        IsolationQueryProvenanceBuilder.enrichPackageFilterSnapshot(filterSnapshot, summary);
        summary.put("filterSnapshot", filterSnapshot);
        report.put("summary", summary);
        return report;
    }

    public Map<String, Object> queryLibraryPage(LibraryQuery query) {
        ResolvedLibraryFilter resolved = resolveLibraryFilter(query);
        int total =
                packageItemMapper.countLibraryItems(
                        resolved.channelCodes(),
                        query.startTime(),
                        query.endTime(),
                        blankToNull(query.disposition()),
                        blankToNull(query.audienceType()),
                        query.actionType(),
                        blankToNull(query.personName()),
                        query.lastRunId(),
                        resolved.statsPullTaskId());
        int offset = Math.max(0, query.offset());
        int limit = Math.min(Math.max(query.limit(), 1), 500);
        List<AccessCleanPackageItem> items =
                packageItemMapper.listLibraryItems(
                        resolved.channelCodes(),
                        query.startTime(),
                        query.endTime(),
                        blankToNull(query.disposition()),
                        blankToNull(query.audienceType()),
                        query.actionType(),
                        blankToNull(query.personName()),
                        query.lastRunId(),
                        resolved.statsPullTaskId(),
                        offset,
                        limit);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("items", items);
        out.put("offset", offset);
        out.put("limit", limit);
        if (resolved.statsPullTaskId() != null && resolved.statsPullTaskId() > 0) {
            out.put("statsPullTaskId", resolved.statsPullTaskId());
            out.put("resolvedChannelCodes", resolved.channelCodes());
        }
        return out;
    }

    private ResolvedLibraryFilter resolveLibraryFilter(LibraryQuery query) {
        Long taskId = query.statsPullTaskId();
        if (taskId == null || taskId <= 0) {
            List<String> channels =
                    query.channelCodes() != null && !query.channelCodes().isEmpty()
                            ? query.channelCodes()
                            : null;
            return new ResolvedLibraryFilter(null, channels);
        }
        Set<String> scope = channelScopeService.enabledChannelCodes(taskId);
        if (scope.isEmpty()) {
            throw new IllegalArgumentException(
                    "该统计任务未配置已启用的通道漏斗，请先在「通道漏斗」中启用通道后再查询");
        }
        List<String> channels = new ArrayList<>();
        if (query.channelCodes() != null && !query.channelCodes().isEmpty()) {
            for (String code : query.channelCodes()) {
                if (!StringUtils.hasText(code)) {
                    continue;
                }
                String ch = code.trim();
                if (!scope.contains(ch)) {
                    throw new IllegalArgumentException("通道 " + ch + " 不在当前统计任务的通道漏斗中");
                }
                channels.add(ch);
            }
            if (channels.isEmpty()) {
                throw new IllegalArgumentException("请至少选择一个属于当前任务的通道");
            }
        } else {
            channels.addAll(scope);
        }
        return new ResolvedLibraryFilter(taskId, channels);
    }

    private record ResolvedLibraryFilter(Long statsPullTaskId, List<String> channelCodes) {}

    public AccessCleanPackageItem patchItem(
            long id, String disposition, String directionOverride, String manualVerdict, String audienceType) {
        if (id <= 0) {
            throw new IllegalArgumentException("id 无效");
        }
        int n =
                packageItemMapper.updateItemFields(
                        id, blankToNull(disposition), blankToNull(directionOverride),
                        blankToNull(manualVerdict), blankToNull(audienceType));
        if (n == 0) {
            throw new IllegalArgumentException("记录不存在");
        }
        AccessCleanPackageItem row = packageItemMapper.selectById(id);
        if (row == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        return row;
    }

    public Map<String, Object> globalSummary() {
        return packageItemMapper.summarizeGlobalLibrary();
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    public record LibraryQuery(
            List<String> channelCodes,
            String startTime,
            String endTime,
            String disposition,
            String audienceType,
            Integer actionType,
            String personName,
            Long lastRunId,
            Long statsPullTaskId,
            int offset,
            int limit) {}
}
