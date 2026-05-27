package com.example.demo.modules.analytics.service;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/** 隔离服主口径：清洗总库 {@code access_clean_package_item}，仅通道 + 时间（不按进出筛门禁记录）。 */
public record IsolationPackageFilter(List<String> channelCodes, boolean allEnabledChannels) {

    public IsolationPackageFilter(List<String> channelCodes) {
        this(channelCodes, channelCodes == null || channelCodes.isEmpty());
    }

    public static IsolationPackageFilter fromAnalytics(AnalyticsFilterParams params) {
        if (params == null) {
            return new IsolationPackageFilter(List.of(), true);
        }
        List<String> codes =
                params.channelCodes() != null
                        ? params.channelCodes().stream()
                                .filter(StringUtils::hasText)
                                .map(String::trim)
                                .distinct()
                                .toList()
                        : List.of();
        boolean allEnabled = codes.isEmpty() && params.allEnabledChannels();
        return new IsolationPackageFilter(new ArrayList<>(codes), allEnabled);
    }

    /** 空列表或显式 allEnabledChannels 表示「全部已启用通道」。 */
    public boolean isAllEnabledChannels() {
        return allEnabledChannels;
    }
}
